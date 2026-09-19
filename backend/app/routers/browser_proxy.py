"""Ultra-lightweight "remote browser": no video/canvas streaming at all.

The backend fetches the page with its own outbound connection, strips any
active content (scripts, event handlers, javascript: URIs, embedded
frames/objects), rewrites every link/asset reference to route back through
this proxy, and returns plain rewritten HTML that is dropped into a
sandboxed (scripting-disabled) iframe on the desktop. Bandwidth stays tiny
because only the text/markup and small static assets ever cross the wire.
"""
import logging
from urllib.parse import quote, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.browser_ssrf import UnsafeUrlError, validate_url
from app.config import get_settings
from app.deps import get_current_user
from app.models import User

router = APIRouter(prefix="/api/browser", tags=["browser"])
settings = get_settings()
logger = logging.getLogger("webdesktop.browser")


class BrowserFetchError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _error_page(message: str) -> Response:
    page = (
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<title>Page inaccessible</title>"
        "<style>body{font-family:'Segoe UI',sans-serif;color:#444;background:#fff;"
        "display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}"
        ".box{max-width:420px;text-align:center;padding:24px;}"
        ".box .glyph{font-size:40px;margin-bottom:12px;}"
        "</style></head><body><div class='box'>"
        "<div class='glyph'>&#9888;</div>"
        "<h3>Impossible de charger cette page</h3>"
        f"<p>{message}</p>"
        "</div></body></html>"
    )
    return Response(content=page, media_type="text/html")

_MAX_REDIRECTS = 5

_ASSET_CONTENT_TYPES = (
    "text/css",
    "image/",
    "font/",
    "application/font",
    "application/vnd.ms-fontobject",
)

_STRIP_TAGS = ["script", "iframe", "object", "embed", "noscript", "applet"]
_ASSET_TAG_ATTRS = [
    ("img", "src"),
    ("source", "src"),
    ("link", "href"),
]


def _proxy_view_url(target: str) -> str:
    return f"/api/browser/view?url={quote(target, safe='')}"


def _proxy_asset_url(target: str) -> str:
    return f"/api/browser/asset?url={quote(target, safe='')}"


def _fetch(url: str, headers: dict | None = None) -> tuple[httpx.Response, str]:
    current = url
    for _ in range(_MAX_REDIRECTS):
        try:
            validate_url(current)
        except UnsafeUrlError as exc:
            raise BrowserFetchError(status.HTTP_400_BAD_REQUEST, str(exc))

        with httpx.Client(follow_redirects=False, timeout=settings.browser_proxy_timeout_seconds) as client:
            try:
                resp = client.get(
                    current,
                    headers={"User-Agent": settings.browser_proxy_user_agent, **(headers or {})},
                )
            except httpx.TimeoutException:
                raise BrowserFetchError(status.HTTP_504_GATEWAY_TIMEOUT, "Le site a mis trop de temps à répondre.")
            except httpx.HTTPError as exc:
                raise BrowserFetchError(status.HTTP_502_BAD_GATEWAY, f"La requête vers le site a échoué ({exc}).")

        if resp.is_redirect:
            location = resp.headers.get("location")
            if not location:
                raise BrowserFetchError(status.HTTP_502_BAD_GATEWAY, "Redirection sans destination.")
            current = urljoin(current, location)
            continue
        return resp, current

    raise BrowserFetchError(status.HTTP_502_BAD_GATEWAY, "Trop de redirections.")


def _rewrite_html(html: str, base_url: str) -> str:
    soup = BeautifulSoup(html, "lxml")

    for tag in soup.find_all(_STRIP_TAGS):
        tag.decompose()

    # Strip inline event handlers and javascript: URIs everywhere.
    for tag in soup.find_all(True):
        for attr in list(tag.attrs):
            if attr.lower().startswith("on"):
                del tag.attrs[attr]
        for url_attr in ("href", "src", "action", "formaction"):
            if tag.get(url_attr, "").strip().lower().startswith("javascript:"):
                del tag.attrs[url_attr]
        if "style" in tag.attrs:
            del tag.attrs["style"]  # drop inline style: can smuggle url()/expression() abuse

    for meta in soup.find_all("meta", attrs={"http-equiv": True}):
        if meta.get("http-equiv", "").lower() == "refresh":
            meta.decompose()

    for a in soup.find_all("a", href=True):
        absolute = urljoin(base_url, a["href"])
        if urlparse(absolute).scheme in ("http", "https"):
            a["href"] = _proxy_view_url(absolute)
        a["target"] = "_self"

    for form in soup.find_all("form"):
        action = form.get("action") or base_url
        absolute = urljoin(base_url, action)
        form["action"] = _proxy_view_url(absolute)
        form["method"] = (form.get("method") or "get").lower()

    for tag_name, attr in _ASSET_TAG_ATTRS:
        for tag in soup.find_all(tag_name, **{attr: True}):
            if tag_name == "link" and tag.get("rel") and "stylesheet" not in tag.get("rel"):
                continue
            absolute = urljoin(base_url, tag[attr])
            if urlparse(absolute).scheme in ("http", "https"):
                tag[attr] = _proxy_asset_url(absolute)

    title = soup.title.string.strip() if soup.title and soup.title.string else base_url
    body = str(soup)
    return title, body


@router.get("/view", response_class=Response)
def view(url: str = Query(...), user: User = Depends(get_current_user)):
    try:
        resp, final_url = _fetch(url)
    except BrowserFetchError as exc:
        return _error_page(exc.message)

    content_type = resp.headers.get("content-type", "")
    if "text/html" not in content_type:
        return _error_page("Cette adresse ne renvoie pas une page web (type de contenu non pris en charge).")

    content = resp.content[: settings.browser_proxy_max_bytes]
    try:
        html = content.decode(resp.encoding or "utf-8", errors="replace")
    except (LookupError, TypeError):
        html = content.decode("utf-8", errors="replace")

    title, rewritten = _rewrite_html(html, final_url)
    page = (
        "<!doctype html><html><head><meta charset='utf-8'>"
        f"<title>{title}</title>"
        "<base target='_self'>"
        "<style>body{font-family:'Segoe UI',sans-serif;color:#1b1b1b;background:#fff;"
        "max-width:960px;margin:0 auto;padding:16px;} img{max-width:100%;height:auto;}"
        "a{color:#0067c0;}</style></head><body>" + rewritten + "</body></html>"
    )
    return Response(content=page, media_type="text/html")


@router.get("/asset")
def asset(url: str = Query(...), user: User = Depends(get_current_user)):
    try:
        resp, _ = _fetch(url)
    except BrowserFetchError as exc:
        raise HTTPException(exc.status_code, exc.message)

    content_type = resp.headers.get("content-type", "application/octet-stream")

    if not any(content_type.startswith(p) for p in _ASSET_CONTENT_TYPES):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Asset type not allowed through the proxy.")

    content = resp.content[: settings.browser_proxy_max_bytes]
    return Response(content=content, media_type=content_type)
