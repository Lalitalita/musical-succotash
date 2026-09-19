import { useState } from "react";
import { api, ApiError } from "../../../api/client";
import { collectDesktopState } from "../../../state/persistence";

function gatherClientInfo(): Record<string, unknown> {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screen: { width: screen.width, height: screen.height, pixelRatio: window.devicePixelRatio },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    localTime: new Date().toString(),
  };
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface ReportResponse {
  sent: boolean;
  report_text: string;
}

export function AboutPanel() {
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generateReport(): Promise<ReportResponse | null> {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      return await api.post<ReportResponse>("/diagnostics/report", {
        description,
        client_info: gatherClientInfo(),
        desktop_state: collectDesktopState(),
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Échec de la génération du rapport.");
      return null;
    } finally {
      setSending(false);
    }
  }

  async function onDownload() {
    const res = await generateReport();
    if (res) downloadText(`webdesktop-rapport-${Date.now()}.txt`, res.report_text);
  }

  async function onSendEmail() {
    const res = await generateReport();
    if (res) {
      setResult(
        res.sent
          ? "Rapport envoyé par email."
          : "SMTP non configuré sur ce serveur - téléchargez le rapport à la place."
      );
    }
  }

  return (
    <div>
      <h4>WebDesktop</h4>
      <p className="settings-hint">
        Bureau virtuel exécuté entièrement dans le navigateur, servi par un backend conteneurisé. Authentification
        Argon2id + double facteur, proxy de navigation texte sans flux vidéo, mode complet Chromium en secours pour
        les sites qui en ont besoin.
      </p>

      <h4>Signaler un problème</h4>
      <p className="settings-hint">
        Génère un rapport avec les infos de votre appareil et l'état complet du bureau (fenêtres, onglets,
        paramètres) - pratique à joindre en cas de bug ou de demande de mise à jour.
      </p>

      <label className="settings-label">Description du problème</label>
      <textarea
        className="settings-input about-textarea"
        rows={4}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Ce qui s'est passé, ce que vous faisiez juste avant..."
      />

      {error && <div className="auth-error">{error}</div>}
      {result && <div className="settings-hint">{result}</div>}

      <div className="about-actions">
        <button className="settings-btn" onClick={onDownload} disabled={sending}>
          {sending ? "Génération..." : "Télécharger le rapport"}
        </button>
        <button className="settings-btn primary" onClick={onSendEmail} disabled={sending}>
          {sending ? "Envoi..." : "Envoyer par email"}
        </button>
      </div>
    </div>
  );
}
