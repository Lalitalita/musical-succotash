from datetime import datetime, timedelta

from fastapi import APIRouter, Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User, UserSession
from app.schemas import SessionOut
from app.security import decode_token

router = APIRouter(prefix="/api/sessions", tags=["sessions"])
settings = get_settings()


@router.get("", response_model=list[SessionOut])
def list_sessions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    session: str | None = Cookie(default=None),
):
    current_sid = None
    if session:
        payload = decode_token(session)
        if payload:
            current_sid = payload.get("sid")

    # A UserSession row has no expiry of its own (only the JWT does) - an
    # old, never-revoked row from a session that simply expired naturally
    # would otherwise sit in this list forever looking "active".
    cutoff = datetime.utcnow() - timedelta(minutes=settings.access_token_ttl_minutes)
    rows = (
        db.query(UserSession)
        .filter(UserSession.user_id == user.id, UserSession.revoked.is_(False), UserSession.created_at >= cutoff)
        .order_by(UserSession.last_seen_at.desc())
        .all()
    )
    return [
        SessionOut(
            id=r.id,
            ip_address=r.ip_address,
            user_agent=r.user_agent,
            created_at=r.created_at,
            last_seen_at=r.last_seen_at,
            is_current=(r.id == current_sid),
        )
        for r in rows
    ]


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_session(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.query(UserSession).filter(UserSession.id == session_id, UserSession.user_id == user.id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session introuvable")
    row.revoked = True
    db.add(row)
    db.commit()
    return None
