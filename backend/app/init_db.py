"""First-run bootstrap: create tables and seed a single admin account.

If BOOTSTRAP_ADMIN_PASSWORD is left empty, a random password is generated
and, together with the TOTP provisioning URI, printed once to the
container logs -- this is the only place it is ever shown.

Set RESET_ADMIN_PASSWORD=true in the environment to force a fresh password
and TOTP secret for the bootstrap admin account on the next restart, even
if it already exists -- useful when the password was lost since the
Postgres data survives a `docker compose down`/rebuild. Remember to set it
back to false afterwards, otherwise the password resets on every restart.
"""
import logging
import secrets

from sqlalchemy import inspect, text

from app.config import get_settings
from app.database import Base, SessionLocal, engine
from app.models import User
from app.security import hash_password, new_totp_secret, totp_provisioning_uri

logger = logging.getLogger("webdesktop.init_db")
settings = get_settings()

# Columns added to the `users` table after its first release. create_all()
# only creates brand-new tables, so on an already-deployed database these
# need an explicit, idempotent ALTER TABLE to show up.
_USER_TABLE_ADDITIONS = {
    "display_name": "VARCHAR(64)",
    "avatar_url": "VARCHAR(512)",
}


def _apply_lightweight_migrations() -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return  # brand new database, create_all() already made the final shape

    existing = {col["name"] for col in inspector.get_columns("users")}
    missing = {name: ddl for name, ddl in _USER_TABLE_ADDITIONS.items() if name not in existing}
    if not missing:
        return

    with engine.begin() as conn:
        for name, ddl in missing.items():
            conn.execute(text(f"ALTER TABLE users ADD COLUMN {name} {ddl}"))
    logger.info("Applied lightweight migration: added columns %s to users", list(missing))


def _print_credentials_banner(title: str, admin: User, password: str, totp_secret: str) -> None:
    uri = totp_provisioning_uri(totp_secret, admin.username)
    banner = "\n".join(
        [
            "",
            "=" * 72,
            f" {title}".center(72),
            "=" * 72,
            f" Admin username : {admin.username}",
            f" Admin password : {password}",
            f" TOTP secret    : {totp_secret}",
            f" TOTP QR URI    : {uri}",
            " Add the TOTP secret to Aegis / Google Authenticator.",
            " The 2FA screen looks like a date field but expects the 6-digit code.",
            "=" * 72,
            "",
        ]
    )
    logger.warning(banner)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _apply_lightweight_migrations()

    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            if settings.reset_admin_password:
                admin = db.query(User).filter(User.username == settings.bootstrap_admin_username).first()
                if admin is None:
                    logger.warning(
                        "RESET_ADMIN_PASSWORD is set but no user named '%s' exists - ignoring.",
                        settings.bootstrap_admin_username,
                    )
                    return
                password = settings.bootstrap_admin_password or secrets.token_urlsafe(18)
                totp_secret = new_totp_secret()
                admin.password_hash = hash_password(password)
                admin.totp_secret = totp_secret
                db.commit()
                _print_credentials_banner("WEBDESKTOP - ADMIN PASSWORD RESET", admin, password, totp_secret)
                logger.warning(
                    "Set RESET_ADMIN_PASSWORD back to false, otherwise this password resets on every restart."
                )
            return

        password = settings.bootstrap_admin_password or secrets.token_urlsafe(18)
        totp_secret = new_totp_secret()

        admin = User(
            username=settings.bootstrap_admin_username,
            email=settings.bootstrap_admin_email,
            password_hash=hash_password(password),
            totp_secret=totp_secret,
            is_admin=True,
        )
        db.add(admin)
        db.commit()

        _print_credentials_banner("WEBDESKTOP - FIRST RUN BOOTSTRAP", admin, password, totp_secret)
    finally:
        db.close()
