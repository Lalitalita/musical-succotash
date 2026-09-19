"""Full-browser mode: a real headless Chromium tab per session, opted into
per-tab from the desktop when the ultra-light text-mode proxy isn't enough
(JS-heavy sites). The page renders server-side; the client only ever
receives JPEG screenshots and sends back input events - the site's own
JavaScript never reaches the browser running on the user's machine, and
every network request the page makes is still funnelled through this
backend and re-validated against the same SSRF guard as text mode.

This is deliberately opt-in and resource-capped (FULL_BROWSER_MAX_SESSIONS)
since a headless Chromium tab is orders of magnitude heavier than the text
proxy - see the README for the bandwidth/CPU trade-off this implies.
"""
import asyncio
import contextlib
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from playwright.async_api import Browser, BrowserContext, Page, Playwright, async_playwright

from app.browser_ssrf import UnsafeUrlError, validate_url
from app.config import get_settings

logger = logging.getLogger("webdesktop.full_browser")
settings = get_settings()


class SessionLimitError(Exception):
    pass


class NotOwnerError(Exception):
    pass


@dataclass
class FullBrowserSession:
    tab_id: str
    user_id: str
    context: BrowserContext
    page: Page
    created_at: float = field(default_factory=time.monotonic)
    last_active: float = field(default_factory=time.monotonic)

    def touch(self) -> None:
        self.last_active = time.monotonic()


class FullBrowserManager:
    def __init__(self) -> None:
        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None
        self._sessions: dict[str, FullBrowserSession] = {}
        self._lock = asyncio.Lock()
        self._cleanup_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        if not settings.full_browser_enabled:
            logger.info("Full-browser mode disabled (FULL_BROWSER_ENABLED=false)")
            return
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        )
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("Full-browser mode ready (Chromium launched)")

    async def stop(self) -> None:
        if self._cleanup_task:
            self._cleanup_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._cleanup_task
        for tab_id in list(self._sessions.keys()):
            await self._close_session_unlocked(tab_id)
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()

    async def _cleanup_loop(self) -> None:
        while True:
            await asyncio.sleep(30)
            now = time.monotonic()
            for tab_id, session in list(self._sessions.items()):
                idle = now - session.last_active
                age = now - session.created_at
                if idle > settings.full_browser_idle_timeout_seconds or age > settings.full_browser_max_lifetime_seconds:
                    logger.info("Closing idle/expired full-browser session %s", tab_id)
                    async with self._lock:
                        await self._close_session_unlocked(tab_id)

    async def _route_guard(self, route, request) -> None:
        try:
            await asyncio.to_thread(validate_url, request.url)
        except UnsafeUrlError:
            logger.warning("Full-browser mode blocked request to %s", request.url)
            await route.abort()
            return
        await route.continue_()

    async def get_or_create(self, tab_id: str, user_id: str) -> FullBrowserSession:
        if not settings.full_browser_enabled or not self._browser:
            raise RuntimeError("Full-browser mode is not enabled on this server.")

        async with self._lock:
            existing = self._sessions.get(tab_id)
            if existing:
                if existing.user_id != user_id:
                    raise NotOwnerError()
                existing.touch()
                return existing

            if len(self._sessions) >= settings.full_browser_max_sessions:
                raise SessionLimitError()

            context = await self._browser.new_context(viewport={"width": 1280, "height": 800})
            page = await context.new_page()
            await page.route("**/*", self._route_guard)

            session = FullBrowserSession(tab_id=tab_id, user_id=user_id, context=context, page=page)
            self._sessions[tab_id] = session
            return session

    async def _close_session_unlocked(self, tab_id: str) -> None:
        session = self._sessions.pop(tab_id, None)
        if not session:
            return
        with contextlib.suppress(Exception):
            await session.context.close()

    async def close_session(self, tab_id: str) -> None:
        async with self._lock:
            await self._close_session_unlocked(tab_id)

    def session_count(self) -> int:
        return len(self._sessions)


manager = FullBrowserManager()
