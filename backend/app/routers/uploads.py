"""Small images uploaded by a user: avatars and custom bookmark icons.

Stored as plain files on a local volume (no need for object storage at this
scale) under a random UUID name -- the original filename is never trusted
or reused, which rules out path traversal and extension-based attacks.
"""
import os
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.config import get_settings
from app.deps import get_current_user
from app.models import User

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
settings = get_settings()

_ALLOWED_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/x-icon": ".ico",
}

_SAFE_NAME = re.compile(r"^[a-f0-9\-]{36}\.[a-z]{2,4}$")


@router.post("")
async def upload_image(file: UploadFile, user: User = Depends(get_current_user)):
    ext = _ALLOWED_TYPES.get(file.content_type)
    if not ext:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Format d'image non supporté.")

    data = await file.read(settings.upload_max_bytes + 1)
    if len(data) > settings.upload_max_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Image trop volumineuse.")

    os.makedirs(settings.uploads_dir, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    with open(os.path.join(settings.uploads_dir, filename), "wb") as f:
        f.write(data)

    return {"url": f"/api/uploads/{filename}"}


@router.get("/{filename}")
def get_upload(filename: str, user: User = Depends(get_current_user)):
    if not _SAFE_NAME.match(filename):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")

    path = os.path.join(settings.uploads_dir, filename)
    if not os.path.isfile(path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")

    return FileResponse(path)
