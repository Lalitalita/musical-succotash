"""WebSocket endpoint for full-browser mode: streams JPEG screenshots of a
server-side headless Chromium tab and applies input events sent back by the
client. See app/full_browser.py for the session manager and SSRF guard.
"""
import asyncio
import contextlib
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.config import get_settings
from app.database import SessionLocal
from app.full_browser import NotOwnerError, SessionLimitError, manager
from app.models import User
from app.security import decode_token

router = APIRouter(prefix="/api/browser/full", tags=["browser-full"])
logger = logging.getLogger("webdesktop.full_browser.ws")
settings = get_settings()


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


async def _apply_input(page, msg: dict) -> None:
    kind = msg.get("type")
    try:
        if kind == "navigate" and msg.get("url"):
            await page.goto(msg["url"], wait_until="domcontentloaded", timeout=15000)
        elif kind == "mousemove":
            await page.mouse.move(msg["x"], msg["y"])
        elif kind == "mousedown":
            await page.mouse.move(msg["x"], msg["y"])
            await page.mouse.down(button=msg.get("button", "left"))
        elif kind == "mouseup":
            await page.mouse.up(button=msg.get("button", "left"))
        elif kind == "wheel":
            await page.mouse.wheel(msg.get("dx", 0), msg.get("dy", 0))
        elif kind == "keydown":
            await page.keyboard.down(msg["key"])
        elif kind == "keyup":
            await page.keyboard.up(msg["key"])
        elif kind == "text":
            await page.keyboard.insert_text(msg["text"])
        elif kind == "paste":
            await page.keyboard.insert_text(msg.get("text", ""))
        elif kind == "resize":
            await page.set_viewport_size({"width": int(msg["width"]), "height": int(msg["height"])})
        elif kind == "back":
            await page.go_back()
        elif kind == "forward":
            await page.go_forward()
        elif kind == "reload":
            await page.reload()
    except Exception as exc:  # noqa: BLE001 - never let one bad input event kill the session
        logger.debug("Full-browser input %r failed: %s", kind, exc)


@router.websocket("/ws")
async def full_browser_ws(websocket: WebSocket, tab_id: str, url: str | None = None):
    user = _user_from_ws_cookies(websocket)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()

    try:
        session = await manager.get_or_create(tab_id, user.id)
    except SessionLimitError:
        await websocket.send_json(
            {"type": "error", "message": "Trop de sessions en mode complet actives. Fermez-en une autre d'abord."}
        )
        await websocket.close()
        return
    except NotOwnerError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    except RuntimeError as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close()
        return

    page = session.page
    # Tracks the last time the user actually did something (input or
    # navigation) so the frame loop can poll fast right after an
    # interaction and drop back to a slow idle rate otherwise - streaming a
    # full screenshot every 350ms for a tab nobody is looking at is exactly
    # the kind of background CPU/bandwidth drain that made things feel slow.
    last_interaction = time.monotonic()

    if url and page.url in ("about:blank", ""):
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
        except Exception as exc:  # noqa: BLE001
            await websocket.send_json({"type": "error", "message": f"Navigation impossible: {exc}"})

    stop_event = asyncio.Event()

    async def frame_loop():
        while not stop_event.is_set():
            try:
                data = await page.screenshot(type="jpeg", quality=60)
                await websocket.send_bytes(data)
                await websocket.send_json({"type": "url", "url": page.url, "title": await page.title()})
            except Exception:  # noqa: BLE001
                break

            active = (time.monotonic() - last_interaction) < settings.full_browser_active_window_seconds
            interval_ms = settings.full_browser_frame_interval_ms if active else settings.full_browser_idle_frame_interval_ms
            await asyncio.sleep(interval_ms / 1000)

    async def receive_loop():
        nonlocal last_interaction
        while True:
            msg = await websocket.receive_json()
            session.touch()
            last_interaction = time.monotonic()
            if msg.get("type") == "copy":
                # The remote page's own selected text has to be read back
                # over the wire and written into the LOCAL clipboard - the
                # site's JS/DOM selection never reaches this machine
                # otherwise, only screenshots do.
                try:
                    text = await page.evaluate("() => window.getSelection().toString()")
                except Exception:  # noqa: BLE001
                    text = ""
                if text:
                    await websocket.send_json({"type": "clipboard", "text": text})
                continue
            await _apply_input(page, msg)

    frame_task = asyncio.create_task(frame_loop())
    try:
        await receive_loop()
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.debug("Full-browser ws receive loop ended: %s", exc)
    finally:
        stop_event.set()
        frame_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await frame_task
