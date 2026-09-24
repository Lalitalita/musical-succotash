"""Start Menu file search: queries the background-built index (see
app/file_indexer.py) instead of touching the filesystem or the SMB share on
every keystroke.
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import IndexedFile, User

router = APIRouter(prefix="/api/search", tags=["search"])


class IndexedFileOut(BaseModel):
    source: str
    path: str
    name: str
    is_dir: bool
    size: int

    class Config:
        from_attributes = True


@router.get("/files", response_model=list[IndexedFileOut])
def search_files(
    q: str = Query(..., min_length=1, max_length=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    needle = q.strip().lower()
    if not needle:
        return []

    # Visible scope mirrors the File Explorer itself: this user's own Local
    # storage, plus the shared SMB share (user_id is NULL there) if any.
    rows = (
        db.query(IndexedFile)
        .filter(
            or_(IndexedFile.user_id == user.id, IndexedFile.user_id.is_(None)),
            IndexedFile.name_lower.contains(needle),
        )
        # Names that START with the query rank above ones that merely
        # contain it, then shorter (more specific) names first.
        .order_by((~IndexedFile.name_lower.startswith(needle)), IndexedFile.name)
        .limit(15)
        .all()
    )
    return rows
