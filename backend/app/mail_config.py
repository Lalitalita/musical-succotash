"""Regenerates the shared config that lets the fetchmail + Dovecot
containers turn each user's list of external IMAP accounts (app/models.py:
MailAccount) into a single, unified inbox reachable through the bundled
Roundcube - see docker-compose.yml's `dovecot`/`fetchmail` services and
mail/ for the images these files are mounted into.

Called any time a user's mail accounts or internal mail password change.
Not perf-sensitive (fires on rare config changes, not per-request), so the
simplest correct thing - rewrite both files from scratch - is fine.
"""
import crypt  # stdlib, removed in Python 3.13 - fine as long as backend/Dockerfile pins 3.12
import os
import re

from sqlalchemy.orm import Session

from app.config import get_settings
from app.crypto import decrypt
from app.models import MailAccount, User

settings = get_settings()


def _safe_folder(label: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", label).strip("_")
    return cleaned or "compte"


def _config_dir() -> str:
    os.makedirs(settings.mail_config_dir, exist_ok=True)
    return settings.mail_config_dir


def regenerate_all(db: Session) -> None:
    _write_dovecot_passwd(db)
    _write_fetchmailrc(db)


def _write_dovecot_passwd(db: Session) -> None:
    path = os.path.join(_config_dir(), "dovecot-users")
    lines = []
    for user in db.query(User).filter(User.mail_password_encrypted.isnot(None)).all():
        password = decrypt(user.mail_password_encrypted)
        hashed = crypt.crypt(password, crypt.mksalt(crypt.METHOD_SHA512))
        lines.append(f"{user.username}:{{SHA512-CRYPT}}{hashed}::::::")
    with open(path, "w") as f:
        f.write("\n".join(lines) + ("\n" if lines else ""))
    os.chmod(path, 0o600)


def _write_fetchmailrc(db: Session) -> None:
    path = os.path.join(_config_dir(), "fetchmailrc")
    blocks = ["set daemon 300", "set no bouncemail", "set no spambounce", ""]

    accounts = db.query(MailAccount).all()
    users_by_id = {u.id: u for u in db.query(User).all()}
    seen_folders: dict[str, set[str]] = {}

    for acc in accounts:
        user = users_by_id.get(acc.user_id)
        if not user or not user.mail_password_encrypted:
            continue

        folder = _safe_folder(acc.label)
        used = seen_folders.setdefault(user.username, set())
        suffix = 2
        base_folder = folder
        while folder in used:
            folder = f"{base_folder}_{suffix}"
            suffix += 1
        used.add(folder)

        password = decrypt(acc.imap_password_encrypted)
        blocks.append(
            "\n".join(
                [
                    f"poll {acc.imap_host} port {acc.imap_port} proto imap",
                    f"  user '{acc.imap_username}' there with password '{password}' is '{user.username}' here",
                    f"  mda \"/usr/local/bin/deliver-lmtp.py {user.username} {folder}\"",
                    "  ssl",
                    "  keep",
                    "",
                ]
            )
        )

    with open(path, "w") as f:
        f.write("\n".join(blocks))
    os.chmod(path, 0o600)
