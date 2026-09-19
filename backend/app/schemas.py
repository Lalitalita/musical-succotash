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


class SecurityStats(BaseModel):
    total_attempts: int
    success_count: int
    failure_count: int
    locked_count: int
    top_countries: list[dict]
    attempts_per_day: list[dict]


class BrowserFetchRequest(BaseModel):
    url: str
