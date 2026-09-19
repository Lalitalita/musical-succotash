import { ChangeEvent, useEffect, useRef, useState } from "react";
import { api } from "../../../api/client";
import { useAuthStore } from "../../../state/authStore";
import { useSettingsStore } from "../../../state/settingsStore";
import { useWindowStore } from "../../../state/windowStore";
import { UsersPanel } from "./UsersPanel";

type Tab = "compte" | "bureau" | "applications" | "utilisateurs" | "systeme";

const WALLPAPERS = [
  { id: "default", label: "Aurore", css: "linear-gradient(160deg, #0f2027, #203a43 55%, #2c5364)" },
  { id: "sunset", label: "Coucher de soleil", css: "linear-gradient(160deg, #1a2980, #26d0ce)" },
  { id: "forest", label: "Forêt", css: "linear-gradient(160deg, #134e5e, #71b280)" },
  { id: "plum", label: "Prune", css: "linear-gradient(160deg, #2b1055, #7597de)" },
  { id: "slate", label: "Ardoise", css: "linear-gradient(160deg, #232526, #414345)" },
];

const ACCENTS = ["#4cc2ff", "#ff6b9d", "#7bd389", "#ffb454", "#c792ea", "#ff5c5c"];

export function SettingsApp() {
  const [tab, setTab] = useState<Tab>("compte");
  const { me, updateProfile } = useAuthStore();
  const settings = useSettingsStore();
  const [displayName, setDisplayName] = useState(me?.display_name || "");
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [health, setHealth] = useState<"checking" | "ok" | "down">("checking");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get("/health")
      .then(() => setHealth("ok"))
      .catch(() => setHealth("down"));
  }, []);

  async function onAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSavingAvatar(true);
    try {
      const { url } = await api.upload("/uploads", file);
      await updateProfile({ avatar_url: url });
    } finally {
      setSavingAvatar(false);
    }
  }

  async function saveDisplayName() {
    await updateProfile({ display_name: displayName });
  }

  return (
    <div className="settings-app">
      <div className="settings-tabs">
        {(
          [
            ["compte", "Compte"],
            ["bureau", "Bureau"],
            ["applications", "Applications"],
            ...(me?.is_admin ? ([["utilisateurs", "Utilisateurs"]] as [Tab, string][]) : []),
            ["systeme", "Système"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} className={`settings-tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="settings-content">
        {tab === "compte" && (
          <div>
            <h4>Profil</h4>
            <div className="settings-avatar-row">
              <div className="settings-avatar" onClick={() => fileInput.current?.click()}>
                {me?.avatar_url ? (
                  <img src={me.avatar_url} alt="avatar" />
                ) : (
                  <span>{me?.username[0]?.toUpperCase()}</span>
                )}
              </div>
              <div>
                <button className="settings-btn" onClick={() => fileInput.current?.click()} disabled={savingAvatar}>
                  {savingAvatar ? "Envoi..." : "Changer la photo"}
                </button>
                <input ref={fileInput} type="file" accept="image/*" hidden onChange={onAvatarChange} />
              </div>
            </div>

            <label className="settings-label">Nom affiché</label>
            <input
              className="settings-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onBlur={saveDisplayName}
              placeholder={me?.username}
            />

            <label className="settings-label">Nom d'utilisateur</label>
            <input className="settings-input" value={me?.username || ""} disabled />

            <label className="settings-label">Email</label>
            <input className="settings-input" value={me?.email || ""} disabled />
          </div>
        )}

        {tab === "bureau" && (
          <div>
            <h4>Fond d'écran</h4>
            <div className="wallpaper-grid">
              {WALLPAPERS.map((w) => (
                <button
                  key={w.id}
                  className={`wallpaper-swatch ${settings.wallpaper === w.id ? "active" : ""}`}
                  style={{ background: w.css }}
                  onClick={() => settings.update({ wallpaper: w.id })}
                >
                  <span>{w.label}</span>
                </button>
              ))}
            </div>

            <h4>Couleur d'accent</h4>
            <div className="accent-row">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  className={`accent-swatch ${settings.accent === c ? "active" : ""}`}
                  style={{ background: c }}
                  onClick={() => settings.update({ accent: c })}
                />
              ))}
            </div>
          </div>
        )}

        {tab === "applications" && (
          <div>
            <h4>Applications de messagerie</h4>
            <p className="settings-hint">
              Renseignez l'adresse de votre webmail et de votre calendrier (ex. une instance Roundcube). Ils
              s'ouvriront via le navigateur texte sécurisé, accessibles depuis le menu Démarrer et le volet horloge.
            </p>
            <label className="settings-label">URL du webmail</label>
            <input
              className="settings-input"
              placeholder="https://webmail.example.com"
              value={settings.mailUrl}
              onChange={(e) => settings.update({ mailUrl: e.target.value })}
            />
            <label className="settings-label">URL du calendrier</label>
            <input
              className="settings-input"
              placeholder="https://calendrier.example.com"
              value={settings.calendarUrl}
              onChange={(e) => settings.update({ calendarUrl: e.target.value })}
            />
          </div>
        )}

        {tab === "utilisateurs" && me?.is_admin && <UsersPanel />}

        {tab === "systeme" && (
          <div>
            <h4>État du système</h4>
            <div className="settings-row">
              <span>Backend API</span>
              <span className={`status-pill ${health === "ok" ? "ok" : health === "down" ? "fail" : "warn"}`}>
                {health === "checking" ? "Vérification..." : health === "ok" ? "En ligne" : "Injoignable"}
              </span>
            </div>
            <div className="settings-row">
              <span>Compte</span>
              <span>{me?.is_admin ? "Administrateur" : "Utilisateur"}</span>
            </div>
            {me?.is_admin && (
              <button
                className="settings-btn"
                onClick={() => useWindowStore.getState().openWindow("security-dashboard", "Sécurité")}
              >
                Ouvrir le tableau de bord de sécurité
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
