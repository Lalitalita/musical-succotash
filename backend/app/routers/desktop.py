"""Per-user desktop session persistence: open windows, browser tabs,
wallpaper/accent and pinned app URLs, saved as one opaque JSON blob.
"""
import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import DesktopState, User
from app.schemas import DesktopStateIn, DesktopStateOut

router = APIRouter(prefix="/api/desktop", tags=["desktop"])

_MAX_STATE_BYTES = 256 * 1024


@router.get("/state", response_model=DesktopStateOut)
def get_state(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.query(DesktopState).filter(DesktopState.user_id == user.id).first()
    if not row:
        return DesktopStateOut(state={})
    try:
        return DesktopStateOut(state=json.loads(row.state_json))
    except (json.JSONDecodeError, TypeError):
        return DesktopStateOut(state={})


@router.put("/state", response_model=DesktopStateOut)
def save_state(payload: DesktopStateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    serialized = json.dumps(payload.state)
    if len(serialized.encode("utf-8")) > _MAX_STATE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "État du bureau trop volumineux.")

    row = db.query(DesktopState).filter(DesktopState.user_id == user.id).first()
    if row:
        row.state_json = serialized
    else:
        row = DesktopState(user_id=user.id, state_json=serialized)
        db.add(row)
    db.commit()
    return DesktopStateOut(state=payload.state)
