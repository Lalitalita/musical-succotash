import { FormEvent, useState } from "react";
import { useDesktopItemsStore } from "../../state/desktopItemsStore";
import type { AppId } from "../../types";

interface Props {
  onClose: () => void;
}

const APP_OPTIONS: { id: AppId; label: string; icon: string }[] = [
  { id: "browser", label: "Navigateur", icon: "🌐" },
  { id: "files", label: "Explorateur de fichiers", icon: "📁" },
  { id: "security-dashboard", label: "Sécurité", icon: "🛡️" },
  { id: "settings", label: "Paramètres", icon: "⚙️" },
  { id: "about", label: "À propos", icon: "ℹ️" },
];

export function NewShortcutForm({ onClose }: Props) {
  const { add } = useDesktopItemsStore();
  const [kind, setKind] = useState<"app" | "url">("url");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [appId, setAppId] = useState<AppId>("browser");
  const [icon, setIcon] = useState("🔗");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (kind === "url") {
      if (!url.trim()) return;
      add({ kind: "url", label: label.trim() || url.trim(), url: url.trim(), icon });
    } else {
      const option = APP_OPTIONS.find((o) => o.id === appId)!;
      add({ kind: "app", label: label.trim() || option.label, appId, icon: option.icon });
    }
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <h3>Nouveau raccourci</h3>

        <div className="shortcut-kind-row">
          <button type="button" className={kind === "url" ? "active" : ""} onClick={() => setKind("url")}>
            Site web
          </button>
          <button type="button" className={kind === "app" ? "active" : ""} onClick={() => setKind("app")}>
            Application
          </button>
        </div>

        {kind === "url" ? (
          <>
            <label className="settings-label">Adresse</label>
            <input
              className="settings-input"
              placeholder="https://exemple.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
            <label className="settings-label">Icône (emoji, optionnel)</label>
            <input className="settings-input" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} />
          </>
        ) : (
          <>
            <label className="settings-label">Application</label>
            <select className="settings-input" value={appId} onChange={(e) => setAppId(e.target.value as AppId)}>
              {APP_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.icon} {o.label}
                </option>
              ))}
            </select>
          </>
        )}

        <label className="settings-label">Nom affiché (optionnel)</label>
        <input className="settings-input" value={label} onChange={(e) => setLabel(e.target.value)} />

        <div className="modal-actions">
          <button type="button" className="settings-btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="settings-btn primary">
            Créer
          </button>
        </div>
      </form>
    </div>
  );
}
