"""Per-user cookie jar for the text-mode browser proxy and full-browser
mode, persisted in Postgres so a logged-in session (Google, Instagram, the
webmail...) survives page navigation, closing/reopening a tab, and backend
restarts - instead of the site treating every single request as a brand
new anonymous visitor.
"""
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.models import BrowserCookie


def load_jar(db: Session, user_id: str) -> httpx.Cookies:
    jar = httpx.Cookies()
    now = datetime.utcnow()
    rows = db.query(BrowserCookie).filter(BrowserCookie.user_id == user_id).all()
    for row in rows:
        if row.expires_at and row.expires_at < now:
            continue
        jar.set(row.name, row.value, domain=row.domain, path=row.path or "/")
    return jar


def save_jar(db: Session, user_id: str, jar: httpx.Cookies) -> None:
    """Upsert every cookie currently in `jar` into the DB. Cookies the
    upstream site expired/cleared during this request are simply left as
    stale rows until they next expire on their own - harmless for a
    personal/family LAN deployment and far simpler than tracking deletions
    through http.cookiejar's internals.
    """
    seen = set()
    for cookie in jar.jar:
        if not cookie.value:
            continue
        domain = (cookie.domain or "").lstrip(".")
        path = cookie.path or "/"
        seen.add((domain, path, cookie.name))
        expires_at = (
            datetime.fromtimestamp(cookie.expires, tz=timezone.utc).replace(tzinfo=None) if cookie.expires else None
        )

        existing = (
            db.query(BrowserCookie)
            .filter(
                BrowserCookie.user_id == user_id,
                BrowserCookie.domain == domain,
                BrowserCookie.path == path,
                BrowserCookie.name == cookie.name,
            )
            .first()
        )
        if existing:
            existing.value = cookie.value
            existing.secure = bool(cookie.secure)
            existing.expires_at = expires_at
        else:
            db.add(
                BrowserCookie(
                    user_id=user_id,
                    domain=domain,
                    path=path,
                    name=cookie.name,
                    value=cookie.value,
                    secure=bool(cookie.secure),
                    expires_at=expires_at,
                )
            )
    if seen:
        db.commit()


def clear_jar(db: Session, user_id: str) -> None:
    db.query(BrowserCookie).filter(BrowserCookie.user_id == user_id).delete()
    db.commit()
