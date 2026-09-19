import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Integer, String
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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


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
