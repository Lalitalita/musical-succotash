"""Terminal mode: a real shell in the browser, via a `ttyd` container (see
docker-compose.yml's `terminal` service and docker-compose.dockerctl.yml).

This router does NOT proxy any terminal traffic itself - ttyd already
speaks WebSocket fluently, and the frontend's Nginx already proxies
WebSockets reliably (see nginx.conf's /api/browser/full/ws location, the
same pattern reused here for /api/terminal/). Nginx sends every request
under /api/terminal/ through an `auth_request` sub-request to THIS single
endpoint first, so admin+LAN gating happens exactly the same way it does
everywhere else in this app (the same two dependencies used by every other
sensitive admin endpoint) - just decided in Python, enforced in Nginx.

The `terminal` container is only ever reachable on the internal Docker
network - nothing here, nginx included, ever exposes it directly.
"""
from fastapi import APIRouter, Depends

from app.deps import get_current_admin, require_lan_or_whitelisted
from app.models import User

router = APIRouter(prefix="/api/terminal", tags=["terminal"])


@router.get("/authcheck")
def authcheck(
    user: User = Depends(get_current_admin),
    _ip: str = Depends(require_lan_or_whitelisted),
):
    return {"ok": True}
