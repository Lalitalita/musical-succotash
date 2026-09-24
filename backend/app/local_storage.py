"""Per-user local file storage layout, shared between the File Explorer
(routers/files.py) and full-browser mode downloads (full_browser.py) so
both agree on where a user's files - including anything they download in
full mode - actually live on disk.
"""
from pathlib import Path

from app.config import get_settings

settings = get_settings()

# Named exactly as asked for, not translated - a plain, familiar home
# layout so Local in the File Explorer looks like an actual home folder
# instead of a bare, empty root.
HOME_SUBFOLDERS = ("Downloads", "Desktop", "Documents", "Pictures")


def user_root(user_id: str) -> Path:
    root = Path(settings.local_files_root) / user_id
    root.mkdir(parents=True, exist_ok=True)
    for name in HOME_SUBFOLDERS:
        (root / name).mkdir(exist_ok=True)
    return root.resolve()


def downloads_dir(user_id: str) -> Path:
    return (user_root(user_id) / "Downloads").resolve()


def unique_path(directory: Path, filename: str) -> Path:
    """Avoid clobbering an existing file - same "name (1).ext" convention
    as a normal desktop download manager."""
    name = Path(filename or "fichier").name or "fichier"
    stem, suffix = Path(name).stem, Path(name).suffix
    candidate = directory / name
    counter = 1
    while candidate.exists():
        candidate = directory / f"{stem} ({counter}){suffix}"
        counter += 1
    return candidate
