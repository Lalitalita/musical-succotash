"""Self-update endpoints - admin + LAN-only, see app/updater.py."""
from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_current_admin, require_lan_or_whitelisted
from app.models import User
from app.updater import get_status, start_update

router = APIRouter(prefix="/api/admin/update", tags=["admin-update"])


@router.get("/status")
def status_(
    user: User = Depends(get_current_admin),
    _ip: str = Depends(require_lan_or_whitelisted),
):
    return get_status()


@router.post("/apply")
def apply(
    user: User = Depends(get_current_admin),
    _ip: str = Depends(require_lan_or_whitelisted),
):
    if not start_update():
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Mise à jour indisponible (déjà en cours, ou non activée dans la configuration).",
        )
    return {"started": True}
