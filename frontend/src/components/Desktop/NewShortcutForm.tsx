import { FormEvent, useState } from "react";
import { DEFAULT_APP_ICONS, APP_LABELS } from "../../constants/icons";
import { useDesktopItemsStore } from "../../state/desktopItemsStore";
import type { IconOverride } from "../../state/appIconsStore";
import { AppIconGlyph } from "../IconPicker/AppIconGlyph";
import { IconPicker } from "../IconPicker/IconPicker";
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
  const [fullMode, setFullMode] = useState(false);
  const [chromeless, setChromeless] = useState(false);
  const [appId, setAppId] = useState<AppId>("browser");
  const [appFullMode, setAppFullMode] = useState(false);
  const [icon, setIcon] = useState<IconOverride>({ icon: "🔗" });
  const [picking, setPicking] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (kind === "url") {
      if (!url.trim()) return;
      add({
        kind: "url",
        label: label.trim() || url.trim(),
        url: url.trim(),
        icon: icon.icon || "🔗",
        iconUrl: icon.iconUrl,
        fullMode,
        // Full mode's real Chromium window can't have its own chrome
        // hidden (see README) - only text mode can look chromeless.
        chromeless: chromeless && !fullMode,
      });
    } else {
      add({
        kind: "app",
        label: label.trim() || APP_LABELS[appId],
        appId,
        icon: DEFAULT_APP_ICONS[appId],
        // Only "Navigateur" is a real browser page - mode complet is a
        // browsing concept, meaningless for Fichiers/Sécurité/Paramètres.
        fullMode: appId === "browser" && appFullMode,
      });
    }
    onClose();
  }

  return (
    <>
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
              <label className="settings-label">Icône</label>
              <button type="button" className="settings-btn shortcut-icon-pick" onClick={() => setPicking(true)}>
                <AppIconGlyph className="icon-glyph" icon={icon} />
                Choisir une icône...
              </button>

              <label className="settings-checkbox-row">
                <input
                  type="checkbox"
                  checked={fullMode}
                  onChange={(e) => setFullMode(e.target.checked)}
                />
                Ouvrir en mode complet (JavaScript activé - pour un site comme Instagram)
              </label>

              <label className="settings-checkbox-row">
                <input
                  type="checkbox"
                  checked={chromeless && !fullMode}
                  disabled={fullMode}
                  onChange={(e) => setChromeless(e.target.checked)}
                />
                Style application (masque la barre d'adresse et les favoris)
              </label>
              {fullMode && (
                <p className="settings-hint">
                  Indisponible en mode complet : le vrai navigateur garde ses propres onglets.
                </p>
              )}
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

              <label className="settings-checkbox-row">
                <input
                  type="checkbox"
                  checked={appId === "browser" && appFullMode}
                  disabled={appId !== "browser"}
                  onChange={(e) => setAppFullMode(e.target.checked)}
                />
                Ouvrir en mode complet (JavaScript activé)
              </label>
              {appId !== "browser" && (
                <p className="settings-hint">
                  Le mode complet est propre au Navigateur - sans objet pour {APP_LABELS[appId]}.
                </p>
              )}
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

      {picking && (
        <IconPicker value={icon} onChange={setIcon} onClose={() => setPicking(false)} title="Icône du raccourci" />
      )}
    </>
  );
}
