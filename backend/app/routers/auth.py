import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app import rate_limit, security
from app.config import get_settings
from app.database import get_db
from app.deps import get_client_ip, get_current_user
from app.geoip import lookup as geoip_lookup
from app.mailer import send_alert
from app.models import AttemptStatus, LoginAttempt, User
from app.schemas import LoginRequest, LoginResponse, MeResponse, MfaVerifyRequest, MfaVerifyResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()
logger = logging.getLogger("webdesktop.auth")


def _log_attempt(db: Session, *, username, status_: AttemptStatus, ip: str, user_agent: str):
    country, city = geoip_lookup(ip)
    db.add(
        LoginAttempt(
            username=username,
            status=status_,
            ip_address=ip,
            user_agent=user_agent[:512] if user_agent else None,
            country=country,
            city=city,
        )
    )
    db.commit()


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent", "")

    ip_lock = rate_limit.check_locked("ip", ip)
    if not ip_lock.allowed:
        _log_attempt(db, username=payload.username, status_=AttemptStatus.LOCKED, ip=ip, user_agent=ua)
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Try again later.")

    user_lock = rate_limit.check_locked("user", payload.username)
    if not user_lock.allowed:
        _log_attempt(db, username=payload.username, status_=AttemptStatus.LOCKED, ip=ip, user_agent=ua)
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Try again later.")

    window = rate_limit.register_window_hit("ip", ip)
    if not window.allowed:
        _log_attempt(db, username=payload.username, status_=AttemptStatus.RATE_LIMITED, ip=ip, user_agent=ua)
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Try again later.")

    user = db.query(User).filter(User.username == payload.username).first()
    if not user:
        rate_limit.register_failure_and_maybe_lock("ip", ip)
        _log_attempt(db, username=payload.username, status_=AttemptStatus.UNKNOWN_USER, ip=ip, user_agent=ua)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    if not security.verify_password(payload.password, user.password_hash):
        ip_result = rate_limit.register_failure_and_maybe_lock("ip", ip)
        user_result = rate_limit.register_failure_and_maybe_lock("user", user.username)
        _log_attempt(db, username=user.username, status_=AttemptStatus.PASSWORD_FAIL, ip=ip, user_agent=ua)

        if not ip_result.allowed or not user_result.allowed:
            send_alert(
                "Compte verrouillé après échecs répétés",
                f"Le compte '{user.username}' (ou l'IP {ip}) a été verrouillé "
                f"après plusieurs échecs de mot de passe.",
            )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    rate_limit.reset_failures("ip", ip)
    _log_attempt(db, username=user.username, status_=AttemptStatus.PASSWORD_OK, ip=ip, user_agent=ua)

    mfa_token = security.create_mfa_pending_token(user.username)
    return LoginResponse(mfa_required=True, mfa_token=mfa_token)


@router.post("/mfa", response_model=MfaVerifyResponse)
def verify_mfa(payload: MfaVerifyRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent", "")

    token_payload = security.decode_token(payload.mfa_token)
    if not token_payload or token_payload.get("type") != "mfa_pending":
        _log_attempt(db, username=None, status_=AttemptStatus.MFA_ABANDONED, ip=ip, user_agent=ua)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "MFA session expired, please log in again.")

    username = token_payload["sub"]

    lock = rate_limit.check_locked("mfa", username)
    if not lock.allowed:
        _log_attempt(db, username=username, status_=AttemptStatus.LOCKED, ip=ip, user_agent=ua)
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Try again later.")

    user = db.query(User).filter(User.username == username).first()
    if not user or not security.verify_totp(user.totp_secret, payload.code):
        result = rate_limit.register_failure_and_maybe_lock("mfa", username)
        _log_attempt(db, username=username, status_=AttemptStatus.MFA_FAIL, ip=ip, user_agent=ua)

        fails = rate_limit.consecutive_failures("mfa", username)
        if fails >= settings.mfa_alert_failure_threshold:
            send_alert(
                "Echecs de code de confirmation répétés",
                f"Le compte '{username}' a échoué la vérification en 2 étapes "
                f"{fails} fois de suite depuis l'IP {ip} ({ua}).",
            )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid code")

    rate_limit.reset_failures("mfa", username)
    rate_limit.reset_failures("user", username)
    _log_attempt(db, username=username, status_=AttemptStatus.MFA_SUCCESS, ip=ip, user_agent=ua)

    session_token = security.create_session_token(user.username, user.is_admin)
    response.set_cookie(
        "session",
        session_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.access_token_ttl_minutes * 60,
        path="/",
    )
    return MfaVerifyResponse(ok=True)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("session", path="/")
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user)):
    return MeResponse(username=user.username, email=user.email, is_admin=user.is_admin)
