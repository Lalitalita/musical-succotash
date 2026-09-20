"""SMTP alert emails for suspicious authentication activity."""
import logging
import smtplib
from email.message import EmailMessage

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger("webdesktop.mailer")


def send_alert(subject: str, body: str, to: str | None = None) -> bool:
    """Send a plain-text email via the configured SMTP relay.

    Returns True only if the message was actually handed off to the SMTP
    server - callers (e.g. the diagnostic report endpoint) use this to tell
    the user whether to fall back to downloading the report instead.
    """
    recipient = to or settings.smtp_alert_to
    if not settings.smtp_host or not recipient:
        logger.warning("SMTP alert skipped (not configured): %s", subject)
        return False

    msg = EmailMessage()
    msg["Subject"] = f"[WebDesktop] {subject}"
    msg["From"] = settings.smtp_from
    msg["To"] = recipient
    msg.set_content(body)

    try:
        # Port 465 is implicit TLS/SSL from the first byte (SMTPS) - issuing
        # STARTTLS on a plain smtplib.SMTP connection to it (as opposed to
        # port 587, which starts plaintext and upgrades) fails or hangs.
        # OVH's ssl0.ovh.net (a common relay for this project) is exactly
        # this case.
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                if settings.smtp_use_tls:
                    server.starttls()
                if settings.smtp_user:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        return True
    except Exception:
        logger.exception("Failed to send email: %s", subject)
        return False
