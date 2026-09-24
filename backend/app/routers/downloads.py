from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.downloads import manager
from app.models import Download, User
from app.schemas import DownloadCreate, DownloadOut

router = APIRouter(prefix="/api/downloads", tags=["downloads"])


@router.get("", response_model=list[DownloadOut])
def list_downloads(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Download).filter(Download.user_id == user.id).order_by(Download.created_at.desc()).all()


@router.post("", response_model=DownloadOut, status_code=status.HTTP_201_CREATED)
async def create_download(
    payload: DownloadCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if not payload.url.lower().startswith(("http://", "https://")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "L'adresse doit commencer par http:// ou https://")

    download = Download(user_id=user.id, url=payload.url)
    db.add(download)
    db.commit()
    db.refresh(download)
    # manager.start() calls asyncio.create_task(), which needs to run on the
    # actual event loop - a plain `def` route here would execute in
    # Starlette's worker threadpool instead (no running loop in that
    # thread), making create_task() raise immediately and this whole
    # endpoint fail with a 500 for every single URL, downloads never
    # actually starting.
    manager.start(download.id, user.id, payload.url)
    return download


@router.delete("/{download_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_download(download_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    download = db.query(Download).filter(Download.id == download_id, Download.user_id == user.id).first()
    if not download:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Téléchargement introuvable")
    # Removes the row from the list only - the file itself (if it finished)
    # stays in Downloads, same as clearing browser download history doesn't
    # delete the file. A still-running download keeps running in the
    # background; it'll just no longer show up once done.
    db.delete(download)
    db.commit()
    return None
