from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Note, User
from app.schemas import NoteCreate, NoteListOut, NoteOut, NoteUpdate

router = APIRouter(prefix="/api/notes", tags=["notes"])


def _get_owned_note(note_id: str, user: User, db: Session) -> Note:
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == user.id).first()
    if not note:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note introuvable")
    return note


@router.get("", response_model=list[NoteListOut])
def list_notes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Note).filter(Note.user_id == user.id).order_by(Note.updated_at.desc()).all()


@router.get("/{note_id}", response_model=NoteOut)
def get_note(note_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _get_owned_note(note_id, user, db)


@router.post("", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = Note(user_id=user.id, title=payload.title, folder=payload.folder, content=payload.content)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.patch("/{note_id}", response_model=NoteOut)
def update_note(
    note_id: str, payload: NoteUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    note = _get_owned_note(note_id, user, db)
    if payload.title is not None:
        note.title = payload.title
    if payload.folder is not None:
        note.folder = payload.folder
    if payload.content is not None:
        note.content = payload.content
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = _get_owned_note(note_id, user, db)
    db.delete(note)
    db.commit()
    return None
