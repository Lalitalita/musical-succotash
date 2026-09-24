"""Terminal mode: a real interactive shell in the browser, via a `ttyd`
container (see docker-compose.yml's `terminal` service, built from
terminal/Dockerfile).

Everything under /api/terminal/ - ttyd's own HTML/JS/CSS assets, its
/token endpoint, and its WebSocket - is reverse-proxied here in Python,
through the exact same admin+LAN dependency chain every other sensitive
endpoint in this app already uses (app/deps.py), reached over the
frontend's ordinary /api/ Nginx location (no special Nginx-level auth
mechanism to get right independently). The `terminal` container itself is
never reachable except from this backend, over the internal Docker
network.

ttyd is launched with --base-path /api/terminal (see terminal/Dockerfile)
so the HTML/JS/WebSocket URLs it emits already match this prefix - the
paths below are forwarded to it unchanged, not rewritten.
"""
import asyncio
import contextlib
import logging

import httpx
import websockets
from fastapi import APIRouter, Depends, Request, Response, WebSocket, status
from websockets.exceptions import ConnectionClosed

from app.config import get_settings
from app.deps import get_client_ip, get_current_admin, is_lan_or_whitelisted
from app.models import User
from app.security import decode_token

router = APIRouter(prefix="/api/terminal", tags=["terminal"])
logger = logging.getLogger("webdesktop.terminal")
settings = get_settings()

_TTYD_HTTP = f"http://{settings.terminal_host}:{settings.terminal_port}"
_TTYD_WS = f"ws://{settings.terminal_host}:{settings.terminal_port}"

_http_client = httpx.AsyncClient(timeout=15)

# Headers that must never be forwarded verbatim between hops (hop-by-hop /
# would otherwise duplicate or desync framing).
_DROP_REQUEST_HEADERS = {"host", "connection", "content-length"}
_DROP_RESPONSE_HEADERS = {"content-encoding", "transfer-encoding", "connection", "content-length"}


@router.api_route("/{path:path}", methods=["GET", "POST", "HEAD"])
async def proxy_http(
    path: str,
    request: Request,
    user: User = Depends(get_current_admin),
) -> Response:
    ip = get_client_ip(request)
    if not is_lan_or_whitelisted(ip):
        # Naming the detected IP turns a bare "Forbidden" into something
        # self-service-fixable from ADMIN_IP_WHITELIST alone - see
        # app/deps.py's require_lan_or_whitelisted for the same message on
        # every other admin+LAN-gated endpoint (this one can't use that
        # dependency directly since get_current_admin must run first).
        return Response(
            status_code=status.HTTP_403_FORBIDDEN,
            content=(
                f"This endpoint is only reachable from the local network / VPN. "
                f"Detected client IP: {ip}. If this is actually a trusted LAN/VPN "
                f"address, add it (or its CIDR) to ADMIN_IP_WHITELIST."
            ),
        )

    upstream_url = f"{_TTYD_HTTP}{request.url.path}"
    if request.url.query:
        upstream_url += f"?{request.url.query}"

    body = await request.body()
    headers = {k: v for k, v in request.headers.items() if k.lower() not in _DROP_REQUEST_HEADERS}

    try:
        upstream_resp = await _http_client.request(
            request.method, upstream_url, content=body or None, headers=headers
        )
    except httpx.HTTPError as exc:
        logger.warning("Terminal upstream unreachable: %s", exc)
        return Response(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content="Terminal indisponible (le conteneur `terminal` ne répond pas).",
        )

    resp_headers = {k: v for k, v in upstream_resp.headers.items() if k.lower() not in _DROP_RESPONSE_HEADERS}
    return Response(content=upstream_resp.content, status_code=upstream_resp.status_code, headers=resp_headers)


def _admin_from_ws_cookies(websocket: WebSocket) -> User | None:
    """Mirrors app/routers/full_browser.py's _user_from_ws_cookies - a
    WebSocket route can't use `Depends(get_current_admin)` (it's typed for
    Request), so auth is checked manually here before ever accepting the
    connection, same session-revocation check included."""
    token = websocket.cookies.get("session")
    if not token:
        return None
    payload = decode_token(token)
    if not payload or payload.get("type") != "session":
        return None
    sid = payload.get("sid")
    if not sid:
        return None

    from app.database import SessionLocal
    from app.models import UserSession

    db = SessionLocal()
    try:
        user_session = db.query(UserSession).filter(UserSession.id == sid).first()
        if not user_session or user_session.revoked:
            return None
        user = db.query(User).filter(User.username == payload["sub"]).first()
        if not user or not user.is_admin:
            return None
        return user
    finally:
        db.close()


@router.websocket("/ws")
async def terminal_ws(websocket: WebSocket):
    user = _admin_from_ws_cookies(websocket)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    ip = get_client_ip(websocket)
    if not is_lan_or_whitelisted(ip):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason=f"LAN/VPN only (detected IP: {ip})")
        return

    # ttyd's JS client requests the "tty" subprotocol - echo whatever the
    # browser actually asked for back, falling back to "tty" if it asked
    # for nothing (still lets the handshake complete).
    requested = websocket.scope.get("subprotocols") or []
    subprotocol = "tty" if "tty" in requested else (requested[0] if requested else "tty")
    await websocket.accept(subprotocol=subprotocol)

    try:
        upstream = await websockets.connect(f"{_TTYD_WS}/api/terminal/ws", subprotocols=["tty"])
    except Exception as exc:  # noqa: BLE001 - ttyd unreachable, tell the client and stop
        logger.warning("Terminal WS upstream unreachable: %s", exc)
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        return

    async def client_to_upstream() -> None:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            data = message.get("bytes")
            if data is not None:
                await upstream.send(data)
                continue
            text = message.get("text")
            if text is not None:
                await upstream.send(text)

    async def upstream_to_client() -> None:
        async for message in upstream:
            if isinstance(message, bytes):
                await websocket.send_bytes(message)
            else:
                await websocket.send_text(message)

    tasks = [asyncio.create_task(client_to_upstream()), asyncio.create_task(upstream_to_client())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    except (ConnectionClosed, RuntimeError):
        pass
    finally:
        for t in tasks:
            t.cancel()
        for t in tasks:
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await t
        with contextlib.suppress(Exception):
            await upstream.close()
