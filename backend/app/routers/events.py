from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Event, User
from app.schemas import EventCreate, EventOut, EventUpdate

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=list[EventOut])
def list_events(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    upcoming_days: int = Query(default=30, le=365),
    limit: int = Query(default=20, le=200),
):
    since = datetime.utcnow() - timedelta(hours=1)  # small grace window for events "just now"
    until = datetime.utcnow() + timedelta(days=upcoming_days)
    return (
        db.query(Event)
        .filter(Event.user_id == user.id, Event.start_at >= since, Event.start_at <= until)
        .order_by(Event.start_at)
        .limit(limit)
        .all()
    )


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(payload: EventCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    event = Event(user_id=user.id, title=payload.title, start_at=payload.start_at, end_at=payload.end_at)
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.patch("/{event_id}", response_model=EventOut)
def update_event(
    event_id: str, payload: EventUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    event = db.query(Event).filter(Event.id == event_id, Event.user_id == user.id).first()
    if not event:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Événement introuvable")
    if payload.title is not None:
        event.title = payload.title
    if payload.start_at is not None:
        event.start_at = payload.start_at
    if payload.end_at is not None:
        event.end_at = payload.end_at
    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id, Event.user_id == user.id).first()
    if not event:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Événement introuvable")
    db.delete(event)
    db.commit()
    return None
