from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Bookmark, User
from app.schemas import BookmarkCreate, BookmarkOut

router = APIRouter(prefix="/api/bookmarks", tags=["bookmarks"])


@router.get("", response_model=list[BookmarkOut])
def list_bookmarks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(Bookmark)
        .filter(Bookmark.user_id == user.id)
        .order_by(Bookmark.position, Bookmark.created_at)
        .all()
    )


@router.post("", response_model=BookmarkOut, status_code=status.HTTP_201_CREATED)
def create_bookmark(payload: BookmarkCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not payload.url.lower().startswith(("http://", "https://")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "L'adresse doit commencer par http:// ou https://")

    count = db.query(Bookmark).filter(Bookmark.user_id == user.id).count()
    bookmark = Bookmark(
        user_id=user.id,
        title=payload.title,
        url=payload.url,
        icon_url=payload.icon_url,
        position=count,
    )
    db.add(bookmark)
    db.commit()
    db.refresh(bookmark)
    return bookmark


@router.delete("/{bookmark_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bookmark(bookmark_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bookmark = (
        db.query(Bookmark).filter(Bookmark.id == bookmark_id, Bookmark.user_id == user.id).first()
    )
    if not bookmark:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Favori introuvable")
    db.delete(bookmark)
    db.commit()
    return None
