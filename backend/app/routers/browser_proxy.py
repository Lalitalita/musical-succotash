"""Ultra-lightweight "remote browser": no video/canvas streaming at all.

The backend fetches the page with its own outbound connection, strips any
active content (scripts, event handlers, javascript: URIs, embedded
frames/objects), rewrites every link/asset reference to route back through
this proxy, and returns plain rewritten HTML that is dropped into a
sandboxed (scripting-disabled) iframe on the desktop. Bandwidth stays tiny
because only the text/markup and small static assets ever cross the wire.

Images, fonts, CSS, video and audio are streamed through /asset with Range
support so `<video>`/`<audio>` playback and seeking work - the bytes still
only ever transit through this backend, never fetched directly by the
client, but nothing here executes upstream JavaScript.
"""
import logging
from urllib.parse import parse_qsl, quote, urlencode, urljoin, urlparse, urlunparse

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import StreamingResponse

from app.browser_ssrf import UnsafeUrlError, validate_url
from app.config import get_settings
from app.deps import get_current_user
from app.models import User

router = APIRouter(prefix="/api/browser", tags=["browser"])
settings = get_settings()
logger = logging.getLogger("webdesktop.browser")

# A single shared, connection-pooling client instead of a fresh
# httpx.Client() per request: a typical page pulls in a dozen+ small assets,
# and opening a brand new TCP+TLS connection for every single one of them
# (the old behaviour) is the main reason browsing felt slow - keep-alive
# connection reuse cuts that handshake cost out almost entirely.
_http_client = httpx.Client(
    follow_redirects=False,
    timeout=settings.browser_proxy_timeout_seconds,
    limits=httpx.Limits(max_connections=100, max_keepalive_connections=20, keepalive_expiry=30),
)


def close_http_client() -> None:
    _http_client.close()

_MAX_REDIRECTS = 5

# Reserved query-param names used to carry the real target URL through a
# rewritten GET form (see _rewrite_html). Never a real site's own param.
_URL_PARAM = "url"
_FORM_BASE_PARAM = "__wd_url"

_ASSET_CONTENT_TYPES = (
    "text/css",
    "image/",
    "font/",
    "video/",
    "audio/",
    "application/font",
    "application/vnd.ms-fontobject",
)

_STRIP_TAGS = ["script", "iframe", "object", "embed", "noscript", "applet"]
_ASSET_TAG_ATTRS = [
    ("img", "src"),
    ("source", "src"),
    ("link", "href"),
    ("video", "src"),
    ("video", "poster"),
    ("audio", "src"),
]


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


def _proxy_view_url(target: str) -> str:
    return f"/api/browser/view?{_URL_PARAM}={quote(target, safe='')}"


def _proxy_asset_url(target: str) -> str:
    return f"/api/browser/asset?{_URL_PARAM}={quote(target, safe='')}"


def _resolve_target_url(request: Request) -> str:
    """Reconstruct the real target URL for a /view request.

    Plain navigation (typed address, clicked link) sends `url` directly.
    A rewritten GET form instead submits `__wd_url` (the form's action, as
    an absolute URL) plus the browser's own serialization of the form's
    fields as ordinary query params - because for a method="get" form the
    browser always replaces the action's query string with the submitted
    fields, so we can't smuggle the target through `url` there. We merge
    those submitted fields onto `__wd_url`'s query string ourselves.
    """
    params = dict(request.query_params)
    base = params.pop(_FORM_BASE_PARAM, None)
    direct = params.pop(_URL_PARAM, None)

    if base:
        parsed = urlparse(base)
        merged = dict(parse_qsl(parsed.query))
        merged.update(params)
        return urlunparse(parsed._replace(query=urlencode(merged)))

    if direct:
        return direct

    raise BrowserFetchError(status.HTTP_400_BAD_REQUEST, "Adresse manquante.")


def _fetch(url: str, method: str = "GET", data: list[tuple[str, str]] | None = None) -> tuple[httpx.Response, str]:
    current = url
    current_method = method
    current_body = urlencode(data).encode() if data else None

    for _ in range(_MAX_REDIRECTS):
        try:
            validate_url(current)
        except UnsafeUrlError as exc:
            raise BrowserFetchError(status.HTTP_400_BAD_REQUEST, str(exc))

        req_headers = {"User-Agent": settings.browser_proxy_user_agent}
        if current_body is not None:
            req_headers["Content-Type"] = "application/x-www-form-urlencoded"

        try:
            resp = _http_client.request(
                current_method,
                current,
                content=current_body,
                headers=req_headers,
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
            # Standard browser behaviour: a redirect after a POST is
            # followed up with a plain GET, body dropped.
            current_method = "GET"
            current_body = None
            continue
        return resp, current

    raise BrowserFetchError(status.HTTP_502_BAD_GATEWAY, "Trop de redirections.")


def _resolve_redirect_chain(url: str) -> str:
    """Like _fetch, but only follows redirects (no body read) to find the
    final URL - used before streaming an asset so we never buffer it."""
    current = url
    for _ in range(_MAX_REDIRECTS):
        try:
            validate_url(current)
        except UnsafeUrlError as exc:
            raise BrowserFetchError(status.HTTP_400_BAD_REQUEST, str(exc))

        try:
            with _http_client.stream("GET", current, headers={"User-Agent": settings.browser_proxy_user_agent}) as resp:
                if not resp.is_redirect:
                    return current
                location = resp.headers.get("location")
        except httpx.TimeoutException:
            raise BrowserFetchError(status.HTTP_504_GATEWAY_TIMEOUT, "La ressource a mis trop de temps à répondre.")
        except httpx.HTTPError as exc:
            raise BrowserFetchError(status.HTTP_502_BAD_GATEWAY, f"La requête a échoué ({exc}).")

        if not location:
            raise BrowserFetchError(status.HTTP_502_BAD_GATEWAY, "Redirection sans destination.")
        current = urljoin(current, location)

    raise BrowserFetchError(status.HTTP_502_BAD_GATEWAY, "Trop de redirections.")


def _rewrite_html(html: str, base_url: str) -> tuple[str, str]:
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
        method = (form.get("method") or "get").strip().lower()
        form["method"] = method

        if method == "post":
            # POST bodies aren't touched by the browser's own submission
            # logic, so the target can safely travel in the query string.
            form["action"] = _proxy_view_url(absolute)
        else:
            # A GET form submission always REPLACES the action's query
            # string with the serialized fields, so `?url=...` would be
            # lost. Carry the real target in a hidden field instead and
            # reconstruct it server-side (see _resolve_target_url).
            form["action"] = "/api/browser/view"
            hidden = soup.new_tag("input", type="hidden", attrs={"name": _FORM_BASE_PARAM, "value": absolute})
            form.insert(0, hidden)

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


def _wrap_page(title: str, rewritten_body: str) -> str:
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        f"<title>{title}</title>"
        "<base target='_self'>"
        "<style>body{font-family:'Segoe UI',sans-serif;color:#1b1b1b;background:#fff;"
        "max-width:960px;margin:0 auto;padding:16px;} img{max-width:100%;height:auto;}"
        "video,audio{max-width:100%;} a{color:#0067c0;}</style></head><body>" + rewritten_body + "</body></html>"
    )


def _handle_fetch_result(resp: httpx.Response, final_url: str) -> Response:
    content_type = resp.headers.get("content-type", "")
    if "text/html" not in content_type:
        return _error_page("Cette adresse ne renvoie pas une page web (type de contenu non pris en charge).")

    content = resp.content[: settings.browser_proxy_max_bytes]
    try:
        html = content.decode(resp.encoding or "utf-8", errors="replace")
    except (LookupError, TypeError):
        html = content.decode("utf-8", errors="replace")

    title, rewritten = _rewrite_html(html, final_url)
    return Response(content=_wrap_page(title, rewritten), media_type="text/html")


@router.get("/view", response_class=Response)
def view(request: Request, user: User = Depends(get_current_user)):
    try:
        target = _resolve_target_url(request)
        resp, final_url = _fetch(target)
    except BrowserFetchError as exc:
        return _error_page(exc.message)
    return _handle_fetch_result(resp, final_url)


@router.post("/view", response_class=Response)
async def view_post(request: Request, user: User = Depends(get_current_user)):
    try:
        target = _resolve_target_url(request)
        form = await request.form()
        data = [(k, v) for k, v in form.multi_items() if isinstance(v, str)]
        resp, final_url = _fetch(target, method="POST", data=data)
    except BrowserFetchError as exc:
        return _error_page(exc.message)
    return _handle_fetch_result(resp, final_url)


@router.get("/asset")
def asset(request: Request, url: str = Query(...), user: User = Depends(get_current_user)):
    try:
        final_url = _resolve_redirect_chain(url)
    except BrowserFetchError as exc:
        raise HTTPException(exc.status_code, exc.message)

    upstream_headers = {"User-Agent": settings.browser_proxy_user_agent}
    range_header = request.headers.get("range")
    if range_header:
        upstream_headers["Range"] = range_header

    try:
        req = _http_client.build_request("GET", final_url, headers=upstream_headers)
        upstream = _http_client.send(req, stream=True)
    except httpx.HTTPError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"La requête vers la ressource a échoué ({exc}).")

    content_type = upstream.headers.get("content-type", "application/octet-stream")
    if not any(content_type.startswith(p) for p in _ASSET_CONTENT_TYPES):
        upstream.close()
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Asset type not allowed through the proxy.")

    max_bytes = settings.browser_proxy_max_stream_bytes

    def body_iterator():
        sent = 0
        try:
            for chunk in upstream.iter_bytes():
                sent += len(chunk)
                if sent > max_bytes:
                    break
                yield chunk
        finally:
            upstream.close()

    passthrough_headers = {"accept-ranges": "bytes"}
    for h in ("content-length", "content-range", "cache-control"):
        if h in upstream.headers:
            passthrough_headers[h] = upstream.headers[h]

    status_code = upstream.status_code if upstream.status_code in (200, 206) else 200
    return StreamingResponse(body_iterator(), status_code=status_code, media_type=content_type, headers=passthrough_headers)
