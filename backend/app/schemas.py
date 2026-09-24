from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class LoginResponse(BaseModel):
    mfa_required: bool
    mfa_token: Optional[str] = None


class MfaVerifyRequest(BaseModel):
    mfa_token: str
    # Raw value typed by the user in the decoy "date" field, e.g. "12/34/56".
    code: str = Field(min_length=1, max_length=16)


class MfaVerifyResponse(BaseModel):
    ok: bool


class MeResponse(BaseModel):
    username: str
    email: str
    is_admin: bool
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None


class UpdateProfileRequest(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=64)
    avatar_url: Optional[str] = Field(default=None, max_length=512)


class LoginAttemptOut(BaseModel):
    id: int
    timestamp: datetime
    username: Optional[str]
    status: str
    ip_address: str
    user_agent: Optional[str]
    country: Optional[str]
    city: Optional[str]

    class Config:
        from_attributes = True


class MySecurityOut(BaseModel):
    """Scoped-down security info any user can see about their own account -
    unlike the admin dashboard (SecurityStats etc.), never includes other
    users' attempts, IPs or usernames."""

    mfa_enabled: bool
    account_created_at: datetime
    recent_attempts: list[LoginAttemptOut]


class SecurityStats(BaseModel):
    total_attempts: int
    success_count: int
    failure_count: int
    locked_count: int
    top_countries: list[dict]
    attempts_per_day: list[dict]
    top_usernames: list[dict]
    top_ips: list[dict]
    hourly_distribution: list[dict]


class ActiveLockOut(BaseModel):
    scope: str
    key: str
    retry_after_seconds: int


class SecurityAlertOut(BaseModel):
    id: int
    timestamp: datetime
    subject: str
    detail: str
    username: Optional[str]
    ip_address: Optional[str]

    class Config:
        from_attributes = True


class BrowserFetchRequest(BaseModel):
    url: str


class BookmarkCreate(BaseModel):
    title: str = Field(min_length=1, max_length=128)
    url: str = Field(min_length=1, max_length=2048)
    icon_url: Optional[str] = Field(default=None, max_length=512)


class BookmarkOut(BaseModel):
    id: str
    title: str
    url: str
    icon_url: Optional[str]
    position: int

    class Config:
        from_attributes = True


class DesktopStateOut(BaseModel):
    state: dict


class DesktopStateIn(BaseModel):
    state: dict


class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    start_at: datetime
    end_at: Optional[datetime] = None


class EventUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None


class EventOut(BaseModel):
    id: str
    title: str
    start_at: datetime
    end_at: Optional[datetime]

    class Config:
        from_attributes = True


class AdminUserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    email: str = Field(min_length=1, max_length=255)
    password: Optional[str] = Field(default=None, min_length=8, max_length=256)
    is_admin: bool = False


class AdminUserUpdate(BaseModel):
    email: Optional[str] = Field(default=None, max_length=255)
    is_admin: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=256)
    reset_totp: bool = False


class AdminUserOut(BaseModel):
    id: str
    username: str
    email: str
    is_admin: bool
    display_name: Optional[str]
    avatar_url: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class AdminUserCreatedOut(BaseModel):
    user: AdminUserOut
    generated_password: Optional[str] = None
    # Only populated right after creation, or after an explicit TOTP reset -
    # never re-shown to the admin on a routine edit.
    totp_secret: Optional[str] = None
    totp_uri: Optional[str] = None


class DiagnosticReportRequest(BaseModel):
    description: str = Field(default="", max_length=5000)
    client_info: dict = Field(default_factory=dict)
    desktop_state: dict = Field(default_factory=dict)


class DiagnosticReportResponse(BaseModel):
    sent: bool
    report_text: str
