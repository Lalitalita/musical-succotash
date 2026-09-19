"""Password hashing, JWT session tokens, and the decoy-MFA/TOTP logic.

UX deception: the second factor is presented to the user as a harmless
"confirm this date" field (placeholder JJ/MM/AAAA) that auto-formats as
XX/XX/XX while typing. Under the hood the six digits are a perfectly
standard TOTP code compatible with Aegis / Google Authenticator; we simply
strip the cosmetic separators before validating it against pyotp.
"""
import re
import time
from datetime import datetime, timedelta
from typing import Optional

import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHash
from jose import JWTError, jwt

from app.config import get_settings

settings = get_settings()
_hasher = PasswordHasher()

_DIGITS_ONLY = re.compile(r"\D+")


# ---------------------------------------------------------------------------
# Passwords (Argon2id)
# ---------------------------------------------------------------------------

def hash_password(plain: str) -> str:
    return _hasher.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _hasher.verify(hashed, plain)
    except (VerifyMismatchError, InvalidHash):
        return False


# ---------------------------------------------------------------------------
# Decoy MFA -> TOTP
# ---------------------------------------------------------------------------

def normalize_decoy_code(raw: str) -> Optional[str]:
    """Strip the decoy date separators and return a 6-digit code, or None.

    Accepts "12/34/56", "123456", "12 34 56", etc. Anything that does not
    reduce to exactly 6 digits is rejected outright.
    """
    digits = _DIGITS_ONLY.sub("", raw)
    if len(digits) != 6 or not digits.isdigit():
        return None
    return digits


def verify_totp(secret: str, raw_code: str) -> bool:
    code = normalize_decoy_code(raw_code)
    if code is None:
        return False
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, username: str, issuer: str = "WebDesktop") -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=issuer)


# ---------------------------------------------------------------------------
# JWT session / MFA-pending tokens
# ---------------------------------------------------------------------------

def create_token(subject: str, token_type: str, ttl_minutes: int, extra: Optional[dict] = None) -> str:
    now = datetime.utcnow()
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": int(time.time()),
        "exp": now + timedelta(minutes=ttl_minutes),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


def create_mfa_pending_token(username: str) -> str:
    return create_token(username, "mfa_pending", settings.mfa_pending_ttl_minutes)


def create_session_token(username: str, is_admin: bool) -> str:
    return create_token(username, "session", settings.access_token_ttl_minutes, {"is_admin": is_admin})
