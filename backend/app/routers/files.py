"""File explorer: per-user local storage plus one shared household SMB share.

Two independent backends are exposed under the same shape of endpoints:

- ``/api/files/local*``  -- files on local disk, isolated per user under
  ``settings.local_files_root/{user.id}/``.
- ``/api/files/smb*``    -- files on a single, globally configured SMB share
  (a home NAS), reachable by any authenticated user of this install.

Every path received from the client is untrusted input and is sanitized by
``_sanitize_rel_path`` before it ever touches the filesystem or the SMB
client, rejecting any attempt to escape the configured root (``../`` style
traversal, absolute paths, etc). See ``app/browser_ssrf.py`` for the same
philosophy applied to outbound URLs.
"""
import errno
import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import smbclient
import smbclient.path as smbclient_path
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from smbprotocol.exceptions import SMBException

from app.config import get_settings
from app.deps import get_current_user
from app.models import User

router = APIRouter(prefix="/api/files", tags=["files"])
settings = get_settings()
logger = logging.getLogger("webdesktop.files")

_UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MiB


class FileEntryOut(BaseModel):
    name: str
    is_dir: bool
    size: int
    mtime: str


# --------------------------------------------------------------------------
# Shared path-safety helpers
# --------------------------------------------------------------------------


def _sanitize_rel_path(raw: Optional[str]) -> str:
    """Normalize a client-supplied relative path and reject any traversal.

    Returns a clean, forward-slash separated relative path with no leading
    slash and no ``..`` segments. Raises HTTPException(400) otherwise.
    """
    text = (raw or "").strip().replace("\\", "/")
    parts = [p for p in text.split("/") if p not in ("", ".")]
    if any(p == ".." for p in parts):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Chemin invalide : sortie du répertoire interdite.",
        )
    return "/".join(parts)


def _safe_filename(name: Optional[str]) -> str:
    base = os.path.basename((name or "").replace("\\", "/")).strip()
    base = base.lstrip(".") or "fichier"
    return base


def _content_disposition(filename: str) -> str:
    ascii_fallback = filename.encode("ascii", "ignore").decode("ascii") or "fichier"
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(filename)}"


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


# --------------------------------------------------------------------------
# Local per-user storage
# --------------------------------------------------------------------------


def _local_user_root(user: User) -> Path:
    root = Path(settings.local_files_root) / user.id
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def _local_resolve(user: User, raw_path: Optional[str]) -> Path:
    root = _local_user_root(user)
    rel = _sanitize_rel_path(raw_path)
    candidate = root.joinpath(*rel.split("/")) if rel else root
    resolved = candidate.resolve()
    try:
        resolved.relative_to(root)
    except ValueError:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Chemin invalide : sortie du répertoire interdite.",
        )
    return resolved


@router.get("/local", response_model=list[FileEntryOut])
def list_local(path: str = Query(default=""), user: User = Depends(get_current_user)):
    target = _local_resolve(user, path)
    if not target.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dossier introuvable.")
    if not target.is_dir():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Le chemin indiqué n'est pas un dossier.")

    entries = []
    for entry in os.scandir(target):
        st = entry.stat(follow_symlinks=False)
        entries.append(
            FileEntryOut(
                name=entry.name,
                is_dir=entry.is_dir(follow_symlinks=False),
                size=0 if entry.is_dir(follow_symlinks=False) else st.st_size,
                mtime=_iso(st.st_mtime),
            )
        )
    entries.sort(key=lambda e: (not e.is_dir, e.name.lower()))
    return entries


@router.post("/local/upload")
def upload_local(
    path: str = Query(default=""),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    target_dir = _local_resolve(user, path)
    target_dir.mkdir(parents=True, exist_ok=True)
    if not target_dir.is_dir():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Le chemin indiqué n'est pas un dossier.")

    dest = target_dir / _safe_filename(file.filename)
    try:
        with open(dest, "wb") as out:
            shutil.copyfileobj(file.file, out, length=_UPLOAD_CHUNK_SIZE)
    except OSError as exc:
        logger.warning("Local upload failed: %s", exc)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Échec de l'envoi du fichier.")
    finally:
        file.file.close()

    return {"name": dest.name}


@router.get("/local/download")
def download_local(path: str = Query(...), user: User = Depends(get_current_user)):
    target = _local_resolve(user, path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fichier introuvable.")
    return FileResponse(
        target,
        filename=target.name,
        headers={"Content-Disposition": _content_disposition(target.name)},
    )


@router.delete("/local")
def delete_local(path: str = Query(...), user: User = Depends(get_current_user)):
    target = _local_resolve(user, path)
    if target == _local_user_root(user):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Impossible de supprimer le dossier racine.")
    if not target.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Élément introuvable.")
    try:
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
    except OSError as exc:
        logger.warning("Local delete failed: %s", exc)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Échec de la suppression.")
    return {"ok": True}


@router.post("/local/mkdir")
def mkdir_local(path: str = Query(...), user: User = Depends(get_current_user)):
    target = _local_resolve(user, path)
    try:
        target.mkdir(parents=True, exist_ok=False)
    except FileExistsError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Un dossier avec ce nom existe déjà.")
    except OSError as exc:
        logger.warning("Local mkdir failed: %s", exc)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Échec de la création du dossier.")
    return {"name": target.name}


# --------------------------------------------------------------------------
# SMB share (single household NAS share, shared across all users)
# --------------------------------------------------------------------------

_smb_session_ready = False


def _require_smb_configured() -> None:
    if not settings.smb_host or not settings.smb_share:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Partage SMB non configuré. Définissez SMB_HOST, SMB_SHARE (et si besoin "
            "SMB_USERNAME / SMB_PASSWORD / SMB_DOMAIN) dans la configuration du serveur.",
        )


def _ensure_smb_session() -> None:
    global _smb_session_ready
    _require_smb_configured()
    if _smb_session_ready:
        return
    username = settings.smb_username or None
    if username and settings.smb_domain:
        username = f"{settings.smb_domain}\\{username}"
    try:
        smbclient.register_session(
            settings.smb_host,
            username=username,
            password=settings.smb_password or None,
            port=settings.smb_port,
        )
    except SMBException as exc:
        logger.warning("SMB session error: %s", exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Authentification SMB refusée.")
    except OSError as exc:
        logger.warning("SMB connection error: %s", exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Connexion au partage SMB impossible.")
    _smb_session_ready = True


def _smb_root() -> str:
    return f"\\\\{settings.smb_host}\\{settings.smb_share}"


def _smb_resolve(raw_path: Optional[str]) -> str:
    rel = _sanitize_rel_path(raw_path)
    root = _smb_root()
    if not rel:
        return root
    return root + "\\" + rel.replace("/", "\\")


def _smb_error_to_http(exc: Exception) -> HTTPException:
    errno_num = getattr(exc, "errno", None)
    if errno_num == errno.ENOENT:
        return HTTPException(status.HTTP_404_NOT_FOUND, "Élément introuvable sur le partage SMB.")
    if errno_num == errno.EEXIST:
        return HTTPException(status.HTTP_409_CONFLICT, "Un élément avec ce nom existe déjà sur le partage SMB.")
    if errno_num in (errno.EACCES, errno.EPERM):
        return HTTPException(status.HTTP_403_FORBIDDEN, "Accès refusé sur le partage SMB.")
    logger.warning("SMB operation failed: %s", exc)
    return HTTPException(status.HTTP_502_BAD_GATEWAY, "Erreur de communication avec le partage SMB.")


@router.get("/smb", response_model=list[FileEntryOut])
def list_smb(path: str = Query(default=""), user: User = Depends(get_current_user)):
    _ensure_smb_session()
    target = _smb_resolve(path)
    try:
        entries = []
        for entry in smbclient.scandir(target):
            st = entry.stat()
            is_dir = entry.is_dir()
            entries.append(
                FileEntryOut(
                    name=entry.name,
                    is_dir=is_dir,
                    size=0 if is_dir else st.st_size,
                    mtime=_iso(st.st_mtime),
                )
            )
    except (SMBException, OSError) as exc:
        raise _smb_error_to_http(exc)
    entries.sort(key=lambda e: (not e.is_dir, e.name.lower()))
    return entries


@router.post("/smb/upload")
def upload_smb(
    path: str = Query(default=""),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    _ensure_smb_session()
    target_dir = _smb_resolve(path)
    dest = target_dir + "\\" + _safe_filename(file.filename)
    try:
        if not smbclient_path.isdir(target_dir):
            smbclient.makedirs(target_dir, exist_ok=True)
        with smbclient.open_file(dest, mode="wb") as out:
            while True:
                chunk = file.file.read(_UPLOAD_CHUNK_SIZE)
                if not chunk:
                    break
                out.write(chunk)
    except (SMBException, OSError) as exc:
        raise _smb_error_to_http(exc)
    finally:
        file.file.close()
    return {"name": _safe_filename(file.filename)}


@router.get("/smb/download")
def download_smb(path: str = Query(...), user: User = Depends(get_current_user)):
    _ensure_smb_session()
    target = _smb_resolve(path)
    name = target.rsplit("\\", 1)[-1] or "fichier"

    try:
        if smbclient_path.isdir(target):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Impossible de télécharger un dossier.")

        def stream():
            with smbclient.open_file(target, mode="rb") as f:
                while True:
                    chunk = f.read(_UPLOAD_CHUNK_SIZE)
                    if not chunk:
                        break
                    yield chunk

    except HTTPException:
        raise
    except (SMBException, OSError) as exc:
        raise _smb_error_to_http(exc)

    return StreamingResponse(
        stream(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": _content_disposition(name)},
    )


@router.delete("/smb")
def delete_smb(path: str = Query(...), user: User = Depends(get_current_user)):
    _ensure_smb_session()
    target = _smb_resolve(path)
    if target == _smb_root():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Impossible de supprimer la racine du partage.")

    def _remove_recursive(p: str) -> None:
        if smbclient_path.isdir(p):
            for entry in smbclient.scandir(p):
                _remove_recursive(entry.path)
            smbclient.rmdir(p)
        else:
            smbclient.remove(p)

    try:
        if not smbclient_path.exists(target):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Élément introuvable sur le partage SMB.")
        _remove_recursive(target)
    except HTTPException:
        raise
    except (SMBException, OSError) as exc:
        raise _smb_error_to_http(exc)
    return {"ok": True}


@router.post("/smb/mkdir")
def mkdir_smb(path: str = Query(...), user: User = Depends(get_current_user)):
    _ensure_smb_session()
    target = _smb_resolve(path)
    try:
        smbclient.makedirs(target, exist_ok=False)
    except (SMBException, OSError) as exc:
        raise _smb_error_to_http(exc)
    return {"name": target.rsplit("\\", 1)[-1]}
