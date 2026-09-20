import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    totp_secret: Mapped[str] = mapped_column(String(64), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    display_name: Mapped[str] = mapped_column(String(64), nullable=True)
    avatar_url: Mapped[str] = mapped_column(String(512), nullable=True)
    # Auto-generated password for this user's own account on the bundled
    # Dovecot server (unified webmail inbox) - never chosen by the user,
    # only ever shown back to them decrypted so they can paste it into
    # Roundcube's login screen once.
    mail_password_encrypted: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class BrowserCookie(Base):
    """One upstream cookie the text-proxy or full-browser mode received on a
    user's behalf, so logins (Google, Instagram...) survive across page
    navigations, tab reopens and backend restarts instead of asking the
    user to sign in again every time."""

    __tablename__ = "browser_cookies"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), primary_key=True)
    domain: Mapped[str] = mapped_column(String(255), primary_key=True)
    path: Mapped[str] = mapped_column(String(512), primary_key=True, default="/")
    name: Mapped[str] = mapped_column(String(255), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    secure: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class MailAccount(Base):
    """An external IMAP mailbox the user wants pulled into their unified
    webmail inbox (see app/mail_config.py: fetchmail polls these into the
    bundled Dovecot server, which the bundled Roundcube reads as one login,
    each account landing in its own folder)."""

    __tablename__ = "mail_accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(64), nullable=False)
    imap_host: Mapped[str] = mapped_column(String(255), nullable=False)
    imap_port: Mapped[int] = mapped_column(Integer, default=993)
    imap_username: Mapped[str] = mapped_column(String(255), nullable=False)
    imap_password_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Bookmark(Base):
    __tablename__ = "bookmarks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    icon_url: Mapped[str] = mapped_column(String(512), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DesktopState(Base):
    """A single opaque JSON blob per user: open windows, browser tabs,
    wallpaper/accent, pinned app URLs. Saved on logout, restored on login."""

    __tablename__ = "desktop_states"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), primary_key=True)
    state_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Event(Base):
    """A lightweight personal agenda entry, previewed in the clock flyout."""

    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SecurityAlert(Base):
    """Log of every security email alert actually sent, for the dashboard."""

    __tablename__ = "security_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)
    username: Mapped[str] = mapped_column(String(64), nullable=True)
    ip_address: Mapped[str] = mapped_column(String(64), nullable=True)


class AttemptStatus(str, enum.Enum):
    PASSWORD_FAIL = "password_fail"
    PASSWORD_OK = "password_ok"
    MFA_FAIL = "mfa_fail"
    MFA_SUCCESS = "mfa_success"
    MFA_ABANDONED = "mfa_abandoned"
    RATE_LIMITED = "rate_limited"
    LOCKED = "locked"
    UNKNOWN_USER = "unknown_user"


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    username: Mapped[str] = mapped_column(String(64), nullable=True, index=True)
    status: Mapped[AttemptStatus] = mapped_column(Enum(AttemptStatus), nullable=False)
    ip_address: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_agent: Mapped[str] = mapped_column(String(512), nullable=True)
    country: Mapped[str] = mapped_column(String(128), nullable=True)
    city: Mapped[str] = mapped_column(String(128), nullable=True)
