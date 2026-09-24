"""Full-browser mode: a real headed Chromium instance per tab, opted into
from the desktop when the ultra-light text-mode proxy isn't enough (JS-heavy
sites) - and the one mode that works with zero configuration on the client
device (no proxy setting, no extra software): the client's own ordinary
browser just opens this app and watches a VNC stream of a real browser
running on the server, same as any other page in the app.

Every open full-mode tab gets its own private virtual display (Xvfb), its
own Chromium process attached to it, and its own x11vnc server exposing that
display over VNC - see routers/full_browser.py for how the client's
WebSocket is bridged straight through to that VNC port. This is the only
way to keep tabs visually isolated from each other: a single shared display
(what this module used to do, streaming individual pages via the Chrome
DevTools Protocol's screencast instead) would mean one VNC client could see
*everyone's* browser windows layered on top of each other on that screen -
acceptable for a per-page screenshot API, not for a whole-screen VNC feed.

The trade-off for that isolation is cost: a Chromium + Xvfb + x11vnc trio
per tab is heavier than the previous "share one browser process across all
of a user's tabs" design, which is exactly why this stays opt-in and
resource-capped (FULL_BROWSER_MAX_SESSIONS) - see the README for the
bandwidth/CPU trade-off this implies.

Every network request a full-mode page makes is still funnelled through
Playwright's own request interception and re-validated against the same
SSRF guard as text mode, regardless of how the video is delivered.
"""
import asyncio
import contextlib
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Optional

from playwright.async_api import Browser, BrowserContext, Page, Playwright, async_playwright

from app.browser_ssrf import UnsafeUrlError, validate_url
from app.config import get_settings

logger = logging.getLogger("webdesktop.full_browser")
settings = get_settings()

# Internal-only Xvfb display numbers / VNC ports for full-browser sessions.
# Neither is ever exposed outside the container: x11vnc binds "-localhost"
# and the only thing that ever connects to it is this same backend process,
# bridging it to the client's authenticated WebSocket (see
# routers/full_browser.py). Starting well above 99 avoids clashing with any
# display a future unrelated feature might use.
_DISPLAY_BASE = 100
_VNC_PORT_BASE = 15900


class SessionLimitError(Exception):
    pass


class NotOwnerError(Exception):
    pass


@dataclass
class FullBrowserSession:
    tab_id: str
    user_id: str
    display_num: int
    vnc_port: int
    xvfb_proc: asyncio.subprocess.Process
    x11vnc_proc: asyncio.subprocess.Process
    browser: Browser
    context: BrowserContext
    page: Page
    created_at: float = field(default_factory=time.monotonic)
    last_active: float = field(default_factory=time.monotonic)

    def touch(self) -> None:
        self.last_active = time.monotonic()


class FullBrowserManager:
    def __init__(self) -> None:
        self._playwright: Optional[Playwright] = None
        self._sessions: dict[str, FullBrowserSession] = {}
        self._tab_owner: dict[str, str] = {}
        self._used_displays: set[int] = set()
        self._lock = asyncio.Lock()
        self._cleanup_task: Optional[asyncio.Task] = None

    def _state_path(self, user_id: str) -> str:
        os.makedirs(settings.full_browser_state_dir, exist_ok=True)
        return os.path.join(settings.full_browser_state_dir, f"{user_id}.json")

    async def start(self) -> None:
        if not settings.full_browser_enabled:
            logger.info("Full-browser mode disabled (FULL_BROWSER_ENABLED=false)")
            return
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("Full-browser mode available (a Chromium+Xvfb+x11vnc trio is launched per tab, on first use)")

    async def stop(self) -> None:
        if self._cleanup_task:
            self._cleanup_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._cleanup_task
        async with self._lock:
            for tab_id in list(self._sessions.keys()):
                await self._close_session_unlocked(tab_id)
        if self._playwright:
            await self._playwright.stop()
            self._playwright = None

    async def _cleanup_loop(self) -> None:
        interval = 10
        while True:
            await asyncio.sleep(interval)
            now = time.monotonic()
            async with self._lock:
                for tab_id, session in list(self._sessions.items()):
                    idle = now - session.last_active
                    age = now - session.created_at
                    if idle > settings.full_browser_idle_timeout_seconds or age > settings.full_browser_max_lifetime_seconds:
                        logger.info("Closing idle/expired full-browser session %s", tab_id)
                        await self._close_session_unlocked(tab_id)

    async def _route_guard(self, route, request) -> None:
        try:
            await asyncio.to_thread(validate_url, request.url)
        except UnsafeUrlError:
            logger.warning("Full-browser mode blocked request to %s", request.url)
            await route.abort()
            return
        await route.continue_()

    def _alloc_display(self) -> int:
        n = _DISPLAY_BASE
        while n in self._used_displays:
            n += 1
        self._used_displays.add(n)
        return n

    async def _wait_for_socket(self, path: str, timeout: float = 10.0) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if os.path.exists(path):
                return
            await asyncio.sleep(0.05)
        raise RuntimeError(f"{path} never appeared within {timeout}s")

    async def _wait_for_tcp(self, port: int, timeout: float = 10.0) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                _, writer = await asyncio.open_connection("127.0.0.1", port)
            except OSError:
                await asyncio.sleep(0.05)
                continue
            writer.close()
            with contextlib.suppress(Exception):
                await writer.wait_closed()
            return
        raise RuntimeError(f"nothing listening on 127.0.0.1:{port} within {timeout}s")

    async def _kill(self, proc: Optional[asyncio.subprocess.Process]) -> None:
        if not proc or proc.returncode is not None:
            return
        with contextlib.suppress(ProcessLookupError):
            proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), timeout=3)
        except asyncio.TimeoutError:
            with contextlib.suppress(ProcessLookupError):
                proc.kill()

    async def _create_session(self, tab_id: str, user_id: str) -> FullBrowserSession:
        display_num = self._alloc_display()
        vnc_port = _VNC_PORT_BASE + (display_num - _DISPLAY_BASE)
        xvfb_proc: Optional[asyncio.subprocess.Process] = None
        x11vnc_proc: Optional[asyncio.subprocess.Process] = None
        browser: Optional[Browser] = None
        try:
            xvfb_proc = await asyncio.create_subprocess_exec(
                "Xvfb", f":{display_num}", "-screen", "0", "1280x800x24", "-ac", "-nolisten", "tcp",
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
            )
            await self._wait_for_socket(f"/tmp/.X11-unix/X{display_num}")

            x11vnc_proc = await asyncio.create_subprocess_exec(
                "x11vnc", "-display", f":{display_num}", "-rfbport", str(vnc_port),
                "-localhost", "-forever", "-shared", "-nopw", "-quiet",
                # XDAMAGE (on by default - deliberately NOT passing
                # -noxdamage) is what makes this event-driven: x11vnc gets
                # told exactly which pixels changed the instant they do,
                # instead of periodically diffing the whole framebuffer on
                # a timer. -threads splits input/output handling onto
                # separate threads so a burst of mouse/keyboard events
                # can't stall the next screen update behind it. Verified
                # locally (Xvfb+Chromium+x11vnc, a continuously animating
                # page) that incremental updates keep arriving promptly
                # with this combination.
                "-threads",
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
            )
            await self._wait_for_tcp(vnc_port)

            if not self._playwright:
                self._playwright = await async_playwright().start()

            browser = await self._playwright.chromium.launch(
                # Headed, not headless, into the private virtual display just
                # started above: several sites, Google's login flow being the
                # most notorious, actively fingerprint headless Chrome and
                # refuse to sign in on it; running headed closes off a number
                # of low-level differences that JS-visible property spoofing
                # alone (below) can't paper over.
                headless=False,
                env={**os.environ, "DISPLAY": f":{display_num}"},
                args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-extensions",
                    "--disable-background-networking",
                    "--disable-background-timer-throttling",
                    "--disable-backgrounding-occluded-windows",
                    "--disable-renderer-backgrounding",
                    "--mute-audio",
                    "--window-size=1280,800",
                    "--window-position=0,0",
                    # Sites like Google's login flow reject Chromium's default
                    # automation fingerprint ("this browser may not be
                    # secure") - this flag plus the UA override and init
                    # script below make it look like an ordinary desktop
                    # Chrome instead.
                    "--disable-blink-features=AutomationControlled",
                ],
            )

            state_path = self._state_path(user_id)
            context_kwargs = {
                "viewport": {"width": 1280, "height": 800},
                "user_agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
                ),
                "locale": "fr-FR",
            }
            if os.path.exists(state_path):
                context_kwargs["storage_state"] = state_path

            context = await browser.new_context(**context_kwargs)
            await context.route("**/*", self._route_guard)
            await context.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
            )
            page = await context.new_page()
        except Exception:
            self._used_displays.discard(display_num)
            if browser:
                with contextlib.suppress(Exception):
                    await browser.close()
            await self._kill(x11vnc_proc)
            await self._kill(xvfb_proc)
            raise

        session = FullBrowserSession(
            tab_id=tab_id,
            user_id=user_id,
            display_num=display_num,
            vnc_port=vnc_port,
            xvfb_proc=xvfb_proc,
            x11vnc_proc=x11vnc_proc,
            browser=browser,
            context=context,
            page=page,
        )
        self._sessions[tab_id] = session
        self._tab_owner[tab_id] = user_id
        return session

    async def get_or_create(self, tab_id: str, user_id: str) -> FullBrowserSession:
        if not settings.full_browser_enabled:
            raise RuntimeError("Full-browser mode is not enabled on this server.")

        async with self._lock:
            existing = self._sessions.get(tab_id)
            if existing:
                if self._tab_owner.get(tab_id) != user_id:
                    raise NotOwnerError()
                existing.touch()
                return existing

            if len(self._sessions) >= settings.full_browser_max_sessions:
                raise SessionLimitError()

            return await self._create_session(tab_id, user_id)

    def get(self, tab_id: str, user_id: str) -> Optional[FullBrowserSession]:
        session = self._sessions.get(tab_id)
        if not session or self._tab_owner.get(tab_id) != user_id:
            return None
        return session

    async def _close_session_unlocked(self, tab_id: str) -> None:
        session = self._sessions.pop(tab_id, None)
        self._tab_owner.pop(tab_id, None)
        if not session:
            return
        self._used_displays.discard(session.display_num)
        with contextlib.suppress(Exception):
            await session.context.storage_state(path=self._state_path(session.user_id))
        with contextlib.suppress(Exception):
            await session.browser.close()
        await self._kill(session.x11vnc_proc)
        await self._kill(session.xvfb_proc)

    async def close_tab(self, tab_id: str) -> None:
        async with self._lock:
            await self._close_session_unlocked(tab_id)

    def session_count(self) -> int:
        return len(self._sessions)


manager = FullBrowserManager()
