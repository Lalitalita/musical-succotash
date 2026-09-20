"""Self-service management of the external IMAP accounts fetched into a
user's unified Roundcube inbox, and of that user's own auto-generated
password for the internal Dovecot account backing it. See app/mail_config.py.
"""
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.crypto import decrypt, encrypt
from app.database import get_db
from app.deps import get_current_user
from app.mail_config import regenerate_all
from app.models import MailAccount, User

router = APIRouter(prefix="/api/mail", tags=["mail"])


class MailAccountIn(BaseModel):
    label: str
    imap_host: str
    imap_port: int = 993
    imap_username: str
    imap_password: str


class MailAccountOut(BaseModel):
    id: str
    label: str
    imap_host: str
    imap_port: int
    imap_username: str

    class Config:
        from_attributes = True


@router.get("/accounts", response_model=list[MailAccountOut])
def list_accounts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(MailAccount).filter(MailAccount.user_id == user.id).all()


@router.post("/accounts", response_model=MailAccountOut)
def add_account(payload: MailAccountIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    account = MailAccount(
        user_id=user.id,
        label=payload.label.strip() or payload.imap_username,
        imap_host=payload.imap_host.strip(),
        imap_port=payload.imap_port,
        imap_username=payload.imap_username.strip(),
        imap_password_encrypted=encrypt(payload.imap_password),
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    regenerate_all(db)
    return account


@router.delete("/accounts/{account_id}")
def delete_account(account_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    account = db.query(MailAccount).filter(MailAccount.id == account_id, MailAccount.user_id == user.id).first()
    if not account:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Compte introuvable.")
    db.delete(account)
    db.commit()
    regenerate_all(db)
    return {"deleted": True}


@router.get("/internal-password")
def get_internal_password(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Returns (generating one on first call) the password for this user's
    own account on the bundled Dovecot server - to be pasted once into
    Roundcube's login screen (username = webdesktop username)."""
    if not user.mail_password_encrypted:
        user.mail_password_encrypted = encrypt(secrets.token_urlsafe(18))
        db.commit()
        regenerate_all(db)
    return {"username": user.username, "password": decrypt(user.mail_password_encrypted)}
