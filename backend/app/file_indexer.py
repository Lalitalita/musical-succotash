"""Background indexer powering the Start Menu's file search: periodically
walks every user's Local storage plus the shared SMB share (if configured)
and stores a flat, searchable list of file/folder names in the
`indexed_files` table (see app/models.py) - so a search doesn't have to walk
the filesystem (or hit the SMB share) on every keystroke.

Runs once at startup and then on a fixed interval (app/config.py's
FILE_INDEX_INTERVAL_SECONDS) for as long as the process is alive - no
manual trigger needed for the feature to work out of the box, though
`reindex_now()` is exposed for an explicit "reindex" action if one is ever
wired to the UI.
"""
import asyncio
import logging
import os
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.local_storage import user_root
from app.models import IndexedFile, User

logger = logging.getLogger("webdesktop.file_indexer")
settings = get_settings()


def _index_local_user(db: Session, user_id: str) -> int:
    root = user_root(user_id)
    rows: list[dict] = []
    cap = settings.file_index_max_entries_per_scope
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = Path(dirpath).relative_to(root).as_posix()
        rel_dir = "" if rel_dir == "." else rel_dir
        for name in dirnames:
            rows.append({"path": rel_dir, "name": name, "is_dir": True, "size": 0})
        for name in filenames:
            try:
                size = (Path(dirpath) / name).stat().st_size
            except OSError:
                size = 0
            rows.append({"path": rel_dir, "name": name, "is_dir": False, "size": size})
        if len(rows) >= cap:
            break

    db.query(IndexedFile).filter(IndexedFile.user_id == user_id, IndexedFile.source == "local").delete()
    for r in rows[:cap]:
        db.add(
            IndexedFile(
                user_id=user_id,
                source="local",
                path=r["path"],
                name=r["name"],
                name_lower=r["name"].lower(),
                is_dir=r["is_dir"],
                size=r["size"],
            )
        )
    db.commit()
    return len(rows[:cap])


def _index_smb(db: Session) -> int:
    if not settings.smb_host or not settings.smb_share:
        return 0

    # Local imports: files.py's SMB helpers are the single source of truth
    # for session setup / path resolution, reused here rather than
    # duplicated - imported lazily to avoid a circular import at module
    # load time (files.py doesn't import this module, but app.routers is
    # assembled at startup before this would otherwise be safe to import
    # eagerly).
    import smbclient
    from app.routers.files import _ensure_smb_session, _smb_root

    try:
        _ensure_smb_session()
    except Exception as exc:  # noqa: BLE001 - indexing is best-effort, never crash the loop
        logger.info("SMB indexing skipped (share unreachable): %s", exc)
        return 0

    root = _smb_root()
    rows: list[dict] = []
    cap = settings.file_index_max_entries_per_scope
    try:
        for dirpath, dirnames, filenames in smbclient.walk(root):
            rel_dir = dirpath[len(root):].strip("\\").replace("\\", "/")
            for name in dirnames:
                rows.append({"path": rel_dir, "name": name, "is_dir": True, "size": 0})
            for name in filenames:
                rows.append({"path": rel_dir, "name": name, "is_dir": False, "size": 0})
            if len(rows) >= cap:
                break
    except Exception as exc:  # noqa: BLE001 - best-effort, one bad share shouldn't kill the loop
        logger.warning("SMB indexing walk failed: %s", exc)
        return 0

    db.query(IndexedFile).filter(IndexedFile.user_id.is_(None), IndexedFile.source == "smb").delete()
    for r in rows[:cap]:
        db.add(
            IndexedFile(
                user_id=None,
                source="smb",
                path=r["path"],
                name=r["name"],
                name_lower=r["name"].lower(),
                is_dir=r["is_dir"],
                size=r["size"],
            )
        )
    db.commit()
    return len(rows[:cap])


def reindex_now() -> None:
    """Synchronous, blocking full reindex - always called via
    asyncio.to_thread by the loop below, never awaited directly."""
    db = SessionLocal()
    try:
        user_ids = [u.id for u in db.query(User.id).all()]
        total = 0
        for user_id in user_ids:
            try:
                total += _index_local_user(db, user_id)
            except Exception:  # noqa: BLE001 - one broken user's storage shouldn't stop the rest
                logger.exception("Local file indexing failed for user %s", user_id)
        total += _index_smb(db)
        logger.info("File index rebuilt: %d entries", total)
    finally:
        db.close()


class FileIndexer:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _loop(self) -> None:
        while True:
            try:
                await asyncio.to_thread(reindex_now)
            except Exception:  # noqa: BLE001 - never let the background loop die
                logger.exception("File indexing pass failed")
            await asyncio.sleep(settings.file_index_interval_seconds)


manager = FileIndexer()
