"""Shared FastAPI dependencies: real client IP resolution, LAN-only guard,
and cookie-session authentication.
"""
import ipaddress
from typing import Optional

from fastapi import Cookie, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.security import decode_token

settings = get_settings()

_PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]


def get_client_ip(request: Request) -> str:
    """Resolve the real client IP through the trusted reverse-proxy chain.

    X-Forwarded-For is appended to by every hop: "client, proxy1, proxy2, ...".
    We trust exactly `settings.trusted_proxy_hops` hops closest to us (the
    frontend's internal Nginx + the external TLS-terminating Nginx) and take
    the IP immediately preceding them as the real client.
    """
    xff = request.headers.get("x-forwarded-for")
    if not xff:
        return request.client.host if request.client else "0.0.0.0"

    chain = [p.strip() for p in xff.split(",") if p.strip()]
    hops = max(settings.trusted_proxy_hops, 0)
    idx = len(chain) - hops - 1
    if idx < 0:
        idx = 0
    return chain[idx]


def _is_whitelisted(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False

    if any(addr in net for net in _PRIVATE_NETWORKS):
        return True

    for cidr in settings.admin_whitelist_list:
        try:
            if addr in ipaddress.ip_network(cidr, strict=False):
                return True
        except ValueError:
            continue
    return False


def require_lan_or_whitelisted(request: Request) -> str:
    ip = get_client_ip(request)
    if not _is_whitelisted(ip):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is only reachable from the local network / VPN.",
        )
    return ip


def get_current_user(
    session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_token(session)
    if not payload or payload.get("type") != "session":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")
    user = db.query(User).filter(User.username == payload["sub"]).first()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session")
    return user


def get_current_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return user
