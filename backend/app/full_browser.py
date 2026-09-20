"""Full-browser mode: a real headless Chromium tab per session, opted into
per-tab from the desktop when the ultra-light text-mode proxy isn't enough
(JS-heavy sites). The page renders server-side; the client only ever
receives JPEG screenshots and sends back input events - the site's own
JavaScript never reaches the browser running on the user's machine, and
every network request the page makes is still funnelled through this
backend and re-validated against the same SSRF guard as text mode.

Every user gets a single persistent Chromium *context* (cookies,
localStorage) shared across all of their full-mode tabs, saved to disk on a
timer and on shutdown - closing a tab or restarting the backend no longer
signs you out of whatever you were logged into.

This is deliberately opt-in and resource-capped (FULL_BROWSER_MAX_SESSIONS)
since a headless Chromium tab is orders of magnitude heavier than the text
proxy - see the README for the bandwidth/CPU trade-off this implies.
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


class SessionLimitError(Exception):
    pass


class NotOwnerError(Exception):
    pass


@dataclass
class UserBrowserContext:
    user_id: str
    context: BrowserContext
    pages: dict[str, Page] = field(default_factory=dict)
    created_at: float = field(default_factory=time.monotonic)
    last_active: float = field(default_factory=time.monotonic)

    def touch(self) -> None:
        self.last_active = time.monotonic()


@dataclass
class FullBrowserSession:
    tab_id: str
    user_id: str
    page: Page
    ucontext: UserBrowserContext

    def touch(self) -> None:
        self.ucontext.touch()


class FullBrowserManager:
    def __init__(self) -> None:
        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None
        self._contexts: dict[str, UserBrowserContext] = {}
        self._tab_owner: dict[str, str] = {}
        self._lock = asyncio.Lock()
        self._cleanup_task: Optional[asyncio.Task] = None

    def _state_path(self, user_id: str) -> str:
        os.makedirs(settings.full_browser_state_dir, exist_ok=True)
        return os.path.join(settings.full_browser_state_dir, f"{user_id}.json")

    async def start(self) -> None:
        if not settings.full_browser_enabled:
            logger.info("Full-browser mode disabled (FULL_BROWSER_ENABLED=false)")
            return
        # Chromium itself is launched lazily, on first actual use (see
        # _ensure_browser): most deployments/sessions never touch full
        # mode at all, and eagerly starting a headless Chromium process for
        # every backend start is a needless permanent memory/CPU cost on a
        # small host.
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("Full-browser mode available (Chromium launches on first use)")

    async def _ensure_browser(self) -> Browser:
        if self._browser:
            return self._browser
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            # Headed, not headless: rendered into the virtual framebuffer the
            # container's entrypoint starts with xvfb-run (nothing is ever
            # actually displayed anywhere - it only exists so Chromium
            # believes it has a real screen). Several sites, Google's login
            # flow being the most notorious, actively fingerprint headless
            # Chrome and refuse to sign in on it; running headed closes off
            # a number of low-level differences that JS-visible property
            # spoofing alone (below) can't paper over.
            headless=False,
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
                # Sites like Google's login flow reject Chromium's default
                # automation fingerprint ("this browser may not be secure") -
                # this flag plus the UA override and init script below make
                # it look like an ordinary desktop Chrome instead.
                "--disable-blink-features=AutomationControlled",
            ],
        )
        logger.info("Full-browser mode: Chromium launched on first use")
        return self._browser

    async def _save_state(self, ucontext: UserBrowserContext) -> None:
        with contextlib.suppress(Exception):
            await ucontext.context.storage_state(path=self._state_path(ucontext.user_id))

    async def stop(self) -> None:
        if self._cleanup_task:
            self._cleanup_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._cleanup_task
        for user_id in list(self._contexts.keys()):
            await self._close_context_unlocked(user_id)
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()

    async def _cleanup_loop(self) -> None:
        elapsed_since_save = 0
        interval = 10
        while True:
            await asyncio.sleep(interval)
            elapsed_since_save += interval
            now = time.monotonic()

            save_due = elapsed_since_save >= settings.full_browser_state_save_interval_seconds
            if save_due:
                elapsed_since_save = 0

            for user_id, ucontext in list(self._contexts.items()):
                idle = now - ucontext.last_active
                age = now - ucontext.created_at
                if idle > settings.full_browser_idle_timeout_seconds or age > settings.full_browser_max_lifetime_seconds:
                    logger.info("Closing idle/expired full-browser context for user %s", user_id)
                    async with self._lock:
                        await self._close_context_unlocked(user_id)
                elif save_due:
                    await self._save_state(ucontext)

    async def _route_guard(self, route, request) -> None:
        try:
            await asyncio.to_thread(validate_url, request.url)
        except UnsafeUrlError:
            logger.warning("Full-browser mode blocked request to %s", request.url)
            await route.abort()
            return
        await route.continue_()

    async def _get_or_create_context(self, user_id: str) -> UserBrowserContext:
        existing = self._contexts.get(user_id)
        if existing:
            existing.touch()
            return existing

        browser = await self._ensure_browser()
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
        # Playwright's default Chromium exposes navigator.webdriver = true
        # and a few other automation tells that Google's login flow in
        # particular checks for and rejects outright.
        await context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
        )

        ucontext = UserBrowserContext(user_id=user_id, context=context)
        self._contexts[user_id] = ucontext
        return ucontext

    async def get_or_create(self, tab_id: str, user_id: str) -> FullBrowserSession:
        if not settings.full_browser_enabled:
            raise RuntimeError("Full-browser mode is not enabled on this server.")

        async with self._lock:
            owner = self._tab_owner.get(tab_id)
            if owner:
                if owner != user_id:
                    raise NotOwnerError()
                ucontext = self._contexts[owner]
                ucontext.touch()
                return FullBrowserSession(tab_id=tab_id, user_id=user_id, page=ucontext.pages[tab_id], ucontext=ucontext)

            total_tabs = sum(len(c.pages) for c in self._contexts.values())
            if total_tabs >= settings.full_browser_max_sessions:
                raise SessionLimitError()

            ucontext = await self._get_or_create_context(user_id)
            page = await ucontext.context.new_page()
            ucontext.pages[tab_id] = page
            self._tab_owner[tab_id] = user_id
            ucontext.touch()
            return FullBrowserSession(tab_id=tab_id, user_id=user_id, page=page, ucontext=ucontext)

    async def close_tab(self, tab_id: str) -> None:
        """Close just this tab's page - the user's context (cookies, other
        open tabs) stays alive."""
        async with self._lock:
            user_id = self._tab_owner.pop(tab_id, None)
            if not user_id:
                return
            ucontext = self._contexts.get(user_id)
            if not ucontext:
                return
            page = ucontext.pages.pop(tab_id, None)
            if page:
                with contextlib.suppress(Exception):
                    await page.close()
            await self._save_state(ucontext)

    async def _close_context_unlocked(self, user_id: str) -> None:
        ucontext = self._contexts.pop(user_id, None)
        if not ucontext:
            return
        for tab_id in list(ucontext.pages.keys()):
            self._tab_owner.pop(tab_id, None)
        await self._save_state(ucontext)
        with contextlib.suppress(Exception):
            await ucontext.context.close()

    def session_count(self) -> int:
        return sum(len(c.pages) for c in self._contexts.values())


manager = FullBrowserManager()
