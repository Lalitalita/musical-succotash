"""Admin-only account management: the only way an account is ever created.

There is deliberately no public signup endpoint anywhere in this app - the
admin creates every account here, from Paramètres → Utilisateurs, and hands
the generated password + TOTP secret to that person out of band.
"""
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import User
from app.schemas import AdminUserCreate, AdminUserCreatedOut, AdminUserOut, AdminUserUpdate
from app.security import hash_password, new_totp_secret, totp_provisioning_uri

router = APIRouter(prefix="/api/admin/users", tags=["admin-users"], dependencies=[Depends(get_current_admin)])


@router.get("", response_model=list[AdminUserOut])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).order_by(User.created_at).all()


@router.post("", response_model=AdminUserCreatedOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: AdminUserCreate, db: Session = Depends(get_db)):
    generated_password = None
    password = payload.password
    if not password:
        generated_password = secrets.token_urlsafe(12)
        password = generated_password

    totp_secret = new_totp_secret()
    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(password),
        totp_secret=totp_secret,
        is_admin=payload.is_admin,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ce nom d'utilisateur ou cet email existe déjà.")
    db.refresh(user)

    return AdminUserCreatedOut(
        user=user,
        generated_password=generated_password,
        totp_secret=totp_secret,
        totp_uri=totp_provisioning_uri(totp_secret, user.username),
    )


@router.patch("/{user_id}", response_model=AdminUserCreatedOut)
def update_user(
    user_id: str,
    payload: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Utilisateur introuvable")

    if payload.is_admin is not None and not payload.is_admin and user.is_admin:
        remaining_admins = db.query(User).filter(User.is_admin.is_(True), User.id != user.id).count()
        if remaining_admins == 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Impossible de retirer le dernier compte administrateur.")

    if payload.email is not None:
        user.email = payload.email
    if payload.is_admin is not None:
        user.is_admin = payload.is_admin

    if payload.password:
        user.password_hash = hash_password(payload.password)

    if payload.reset_totp:
        user.totp_secret = new_totp_secret()

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Cet email existe déjà.")
    db.refresh(user)

    return AdminUserCreatedOut(
        user=user,
        totp_secret=user.totp_secret if payload.reset_totp else None,
        totp_uri=totp_provisioning_uri(user.totp_secret, user.username) if payload.reset_totp else None,
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: str, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    if user_id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Vous ne pouvez pas supprimer votre propre compte.")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Utilisateur introuvable")

    if user.is_admin:
        remaining_admins = db.query(User).filter(User.is_admin.is_(True), User.id != user.id).count()
        if remaining_admins == 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Impossible de supprimer le dernier compte administrateur.")

    db.delete(user)
    db.commit()
    return None
