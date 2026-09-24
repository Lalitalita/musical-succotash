"""A user's own security info - login history, MFA status - available to
every account, unlike /api/admin/security (admin-only: it shows every
user's attempts, IPs and targeted usernames, which is not something to
hand out broadly). Nothing here ever reaches past the current user's own
rows.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import LoginAttempt, User
from app.schemas import MySecurityOut

router = APIRouter(prefix="/api/security", tags=["security"])


@router.get("/me", response_model=MySecurityOut)
def my_security(
    limit: int = Query(default=20, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(LoginAttempt)
        .filter(LoginAttempt.username == user.username)
        .order_by(LoginAttempt.timestamp.desc())
        .limit(limit)
        .all()
    )
    return MySecurityOut(
        mfa_enabled=bool(user.totp_secret),
        account_created_at=user.created_at,
        recent_attempts=rows,
    )
