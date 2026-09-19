from collections import Counter
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import rate_limit
from app.database import get_db
from app.deps import get_current_admin, require_lan_or_whitelisted
from app.models import LoginAttempt, SecurityAlert
from app.schemas import ActiveLockOut, LoginAttemptOut, SecurityAlertOut, SecurityStats

router = APIRouter(
    prefix="/api/admin/security",
    tags=["admin"],
    dependencies=[Depends(require_lan_or_whitelisted), Depends(get_current_admin)],
)

_FAILURE_STATUSES = {"password_fail", "mfa_fail", "mfa_abandoned", "unknown_user"}
_LOCKED_STATUSES = {"locked", "rate_limited"}


@router.get("/attempts", response_model=list[LoginAttemptOut])
def list_attempts(
    db: Session = Depends(get_db),
    limit: int = Query(default=100, le=1000),
    offset: int = 0,
):
    rows = (
        db.query(LoginAttempt)
        .order_by(LoginAttempt.timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return rows


@router.get("/stats", response_model=SecurityStats)
def stats(db: Session = Depends(get_db), days: int = Query(default=14, le=90)):
    since = datetime.utcnow() - timedelta(days=days)
    rows = db.query(LoginAttempt).filter(LoginAttempt.timestamp >= since).all()

    total = len(rows)
    success = sum(1 for r in rows if r.status.value == "mfa_success")
    locked = sum(1 for r in rows if r.status.value in _LOCKED_STATUSES)
    failure = total - success - locked

    country_counts = Counter(r.country for r in rows if r.country)
    top_countries = [{"country": c, "count": n} for c, n in country_counts.most_common(8)]

    per_day = Counter(r.timestamp.date().isoformat() for r in rows)
    attempts_per_day = [{"date": d, "count": n} for d, n in sorted(per_day.items())]

    failing_rows = [r for r in rows if r.status.value in _FAILURE_STATUSES]
    username_counts = Counter(r.username for r in failing_rows if r.username)
    top_usernames = [{"username": u, "count": n} for u, n in username_counts.most_common(8)]

    ip_counts = Counter(r.ip_address for r in failing_rows)
    top_ips = [{"ip": ip, "count": n} for ip, n in ip_counts.most_common(8)]

    hour_counts = Counter(r.timestamp.hour for r in rows)
    hourly_distribution = [{"hour": h, "count": hour_counts.get(h, 0)} for h in range(24)]

    return SecurityStats(
        total_attempts=total,
        success_count=success,
        failure_count=failure,
        locked_count=locked,
        top_countries=top_countries,
        attempts_per_day=attempts_per_day,
        top_usernames=top_usernames,
        top_ips=top_ips,
        hourly_distribution=hourly_distribution,
    )


@router.get("/locks", response_model=list[ActiveLockOut])
def active_locks():
    return rate_limit.list_active_locks()


@router.get("/alerts", response_model=list[SecurityAlertOut])
def recent_alerts(db: Session = Depends(get_db), limit: int = Query(default=50, le=500)):
    return (
        db.query(SecurityAlert)
        .order_by(SecurityAlert.timestamp.desc())
        .limit(limit)
        .all()
    )
