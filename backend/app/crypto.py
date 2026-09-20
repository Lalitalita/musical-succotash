"""Symmetric encryption for secrets we must store but not hash (mail
account passwords, the internal webmail password) - derived from
SECRET_KEY so no extra key management is needed, consistent with how the
rest of the app already treats SECRET_KEY as the one root secret.
"""
import base64
import hashlib

from cryptography.fernet import Fernet

from app.config import get_settings

settings = get_settings()


def _fernet() -> Fernet:
    key = hashlib.sha256(settings.secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()
