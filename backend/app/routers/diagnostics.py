"""Diagnostic report: bundles device/app info, the full desktop-state
snapshot, and a free-text problem description into one text report, to
send by email (reusing the existing SMTP alert relay) or download.
"""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.config import get_settings
from app.deps import get_current_user
from app.mailer import send_alert
from app.models import User
from app.schemas import DiagnosticReportRequest, DiagnosticReportResponse

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])
settings = get_settings()


def _build_report(user: User, payload: DiagnosticReportRequest) -> str:
    lines = [
        "=== Rapport de diagnostic WebDesktop ===",
        f"Horodatage (UTC) : {datetime.now(timezone.utc).isoformat()}",
        f"Application      : {settings.app_name} ({settings.environment})",
        f"Compte           : {user.username} ({user.email})",
        "",
        "--- Description du problème ---",
        payload.description or "(aucune description fournie)",
        "",
        "--- Informations sur l'appareil ---",
        json.dumps(payload.client_info, indent=2, ensure_ascii=False),
        "",
        "--- État complet du bureau (fenêtres, onglets, paramètres) ---",
        json.dumps(payload.desktop_state, indent=2, ensure_ascii=False),
    ]
    return "\n".join(lines)


@router.post("/report", response_model=DiagnosticReportResponse)
def create_report(payload: DiagnosticReportRequest, user: User = Depends(get_current_user)):
    report_text = _build_report(user, payload)
    sent = send_alert(f"Rapport de diagnostic - {user.username}", report_text)
    return DiagnosticReportResponse(sent=sent, report_text=report_text)
