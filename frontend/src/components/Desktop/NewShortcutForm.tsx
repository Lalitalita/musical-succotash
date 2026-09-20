import { FormEvent, useState } from "react";
import { DEFAULT_APP_ICONS, APP_LABELS } from "../../constants/icons";
import { useDesktopItemsStore } from "../../state/desktopItemsStore";
import type { AppId } from "../../types";

interface Props {
  onClose: () => void;
}

const APP_IDS: AppId[] = ["browser", "files", "security-dashboard", "settings"];

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
      add({ kind: "app", label: label.trim() || APP_LABELS[appId], appId, icon: DEFAULT_APP_ICONS[appId] });
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
              {APP_IDS.map((id) => (
                <option key={id} value={id}>
                  {DEFAULT_APP_ICONS[id]} {APP_LABELS[id]}
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
