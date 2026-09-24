"""Full-browser mode transport: bridges the client's WebSocket straight
through to the x11vnc server backing this tab's private Chromium session
(see app/full_browser.py), and exposes small REST endpoints for the
controls (address bar, back/forward/reload) that a raw VNC feed has no room
for.

The WebSocket carries nothing but the RFB protocol's own bytes verbatim in
both directions - no custom framing, no JSON envelope. The browser's own
noVNC client (frontend/src/components/Apps/BrowserApp/RemoteFrame.tsx)
speaks RFB directly to it, which is what gives this approach mouse/
keyboard/clipboard handling, damage-aware updates and reconnection for free
instead of hand-rolling all of that on top of screenshot polling.
"""
import asyncio
import contextlib
import logging

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel

from app.database import SessionLocal
from app.deps import get_current_user
from app.full_browser import NotOwnerError, SessionLimitError, manager
from app.models import User
from app.security import decode_token

router = APIRouter(prefix="/api/browser/full", tags=["browser-full"])
logger = logging.getLogger("webdesktop.full_browser.ws")


class NavigatePayload(BaseModel):
    url: str


def _user_from_ws_cookies(websocket: WebSocket) -> User | None:
    token = websocket.cookies.get("session")
    if not token:
        return None
    payload = decode_token(token)
    if not payload or payload.get("type") != "session":
        return None
    db = SessionLocal()
    try:
        return db.query(User).filter(User.username == payload["sub"]).first()
    finally:
        db.close()


@router.websocket("/ws")
async def full_browser_ws(
    websocket: WebSocket,
    tab_id: str,
    url: str | None = None,
    width: int | None = None,
    height: int | None = None,
):
    user = _user_from_ws_cookies(websocket)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()

    try:
        session = await manager.get_or_create(tab_id, user.id, width, height)
    except SessionLimitError:
        await websocket.close(code=status.WS_1013_TRY_AGAIN_LATER)
        return
    except NotOwnerError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    except RuntimeError:
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        return

    if url and session.page.url in ("about:blank", ""):
        with contextlib.suppress(Exception):
            await session.page.goto(url, wait_until="domcontentloaded", timeout=15000)

    try:
        reader, writer = await asyncio.open_connection("127.0.0.1", session.vnc_port)
    except OSError:
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        return

    async def ws_to_vnc():
        while True:
            data = await websocket.receive_bytes()
            writer.write(data)
            await writer.drain()

    async def vnc_to_ws():
        while True:
            data = await reader.read(65536)
            if not data:
                break
            await websocket.send_bytes(data)

    session.touch()
    tasks = [asyncio.create_task(ws_to_vnc()), asyncio.create_task(vnc_to_ws())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.debug("Full-browser ws relay ended: %s", exc)
    finally:
        for t in tasks:
            t.cancel()
        for t in tasks:
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await t
        writer.close()
        with contextlib.suppress(Exception):
            await writer.wait_closed()


def _get_owned_session(tab_id: str, user: User):
    session = manager.get(tab_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session de mode complet introuvable.")
    session.touch()
    return session


@router.get("/{tab_id}/meta")
async def get_meta(tab_id: str, user: User = Depends(get_current_user)):
    session = _get_owned_session(tab_id, user)
    try:
        title = await session.page.title()
    except Exception:  # noqa: BLE001
        title = ""
    return {"url": session.page.url, "title": title}


@router.post("/{tab_id}/navigate")
async def navigate(tab_id: str, payload: NavigatePayload, user: User = Depends(get_current_user)):
    session = _get_owned_session(tab_id, user)
    try:
        await session.page.goto(payload.url, wait_until="domcontentloaded", timeout=15000)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Navigation impossible: {exc}") from exc
    return {"ok": True}


@router.post("/{tab_id}/back")
async def go_back(tab_id: str, user: User = Depends(get_current_user)):
    session = _get_owned_session(tab_id, user)
    with contextlib.suppress(Exception):
        await session.page.go_back()
    return {"ok": True}


@router.post("/{tab_id}/forward")
async def go_forward(tab_id: str, user: User = Depends(get_current_user)):
    session = _get_owned_session(tab_id, user)
    with contextlib.suppress(Exception):
        await session.page.go_forward()
    return {"ok": True}


@router.post("/{tab_id}/reload")
async def reload_page(tab_id: str, user: User = Depends(get_current_user)):
    session = _get_owned_session(tab_id, user)
    with contextlib.suppress(Exception):
        await session.page.reload()
    return {"ok": True}


@router.delete("/{tab_id}")
async def close_tab(tab_id: str, user: User = Depends(get_current_user)):
    session = manager.get(tab_id, user.id)
    if session:
        await manager.close_tab(tab_id)
    return {"ok": True}
