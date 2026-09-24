"""Shared FastAPI dependencies: real client IP resolution, LAN-only guard,
and cookie-session authentication.
"""
import ipaddress
from datetime import datetime
from typing import Optional

from fastapi import Cookie, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from starlette.requests import HTTPConnection

from app.config import get_settings
from app.database import get_db
from app.models import User, UserSession
from app.security import decode_token

settings = get_settings()

_PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    # RFC 6598 "shared address space" (CGNAT) - not in any of the RFC1918
    # ranges above, but this is exactly the range Tailscale (and some ISPs'
    # carrier-grade NAT) hands out by default, so a client connecting over a
    # Tailscale VPN - the whole point of the "LAN/VPN" gate on Terminal/
    # Docker - would otherwise be wrongly treated as a public IP and 403'd.
    ipaddress.ip_network("100.64.0.0/10"),
]


def get_client_ip(conn: HTTPConnection) -> str:
    """Resolve the real client IP through the trusted reverse-proxy chain.

    X-Forwarded-For is appended to by every hop: "client, proxy1, proxy2, ...".
    We trust exactly `settings.trusted_proxy_hops` hops closest to us (the
    frontend's internal Nginx + the external TLS-terminating Nginx) and take
    the IP immediately preceding them as the real client.

    Takes an `HTTPConnection` (the common base of both `Request` and
    `WebSocket`) so the exact same logic applies to WebSocket endpoints,
    which can't use `Request`-typed FastAPI dependencies - see
    app/routers/terminal.py.
    """
    xff = conn.headers.get("x-forwarded-for")
    if not xff:
        return conn.client.host if conn.client else "0.0.0.0"

    chain = [p.strip() for p in xff.split(",") if p.strip()]
    hops = max(settings.trusted_proxy_hops, 0)
    idx = len(chain) - hops - 1
    if idx < 0:
        idx = 0
    return chain[idx]


def is_lan_or_whitelisted(ip: str) -> bool:
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
    if not is_lan_or_whitelisted(ip):
        # Naming the IP that got rejected turns "it just says Forbidden" into
        # something self-service-fixable: if this really is a LAN/VPN client
        # sitting behind a proxy chain or VPN range we don't already trust,
        # adding this exact IP (or its CIDR) to ADMIN_IP_WHITELIST in the
        # deployment's .env and restarting the backend is enough - no code
        # change needed.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"This endpoint is only reachable from the local network / VPN. "
                f"Detected client IP: {ip}. If this is actually a trusted LAN/VPN "
                f"address, add it (or its CIDR) to ADMIN_IP_WHITELIST."
            ),
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

    # "sid" ties this JWT to a UserSession row (app/models.py) - checked on
    # every request so a session can actually be terminated remotely
    # (Paramètres > Sessions) instead of just deleting a cookie the token
    # itself would otherwise remain valid without, until it naturally
    # expires.
    sid = payload.get("sid")
    if not sid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session")
    user_session = db.query(UserSession).filter(UserSession.id == sid).first()
    if not user_session or user_session.revoked:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session terminée")

    user = db.query(User).filter(User.username == payload["sub"]).first()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session")

    # Throttled: this runs on every authenticated request (including
    # frequent polling), so writing on every single one would be a lot of
    # otherwise-pointless UPDATEs for a value only ever shown rounded to
    # "a moment ago" in the sessions list.
    now = datetime.utcnow()
    if (now - user_session.last_seen_at).total_seconds() > 60:
        user_session.last_seen_at = now
        db.add(user_session)
        db.commit()

    return user


def get_current_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return user
