"""SMTP alert emails for suspicious authentication activity."""
import logging
import smtplib
from email.message import EmailMessage

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger("webdesktop.mailer")


def send_alert(subject: str, body: str) -> None:
    if not settings.smtp_host or not settings.smtp_alert_to:
        logger.warning("SMTP alert skipped (not configured): %s", subject)
        return

    msg = EmailMessage()
    msg["Subject"] = f"[WebDesktop] {subject}"
    msg["From"] = settings.smtp_from
    msg["To"] = settings.smtp_alert_to
    msg.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.smtp_use_tls:
                server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
    except Exception:
        logger.exception("Failed to send security alert email: %s", subject)
