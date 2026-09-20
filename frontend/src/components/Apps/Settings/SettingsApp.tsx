import { ChangeEvent, useEffect, useRef, useState } from "react";
import { api } from "../../../api/client";
import type { AppMetaId } from "../../../constants/icons";
import { saveDesktopState } from "../../../state/persistence";
import { useAuthStore } from "../../../state/authStore";
import { useSettingsStore } from "../../../state/settingsStore";
import { useWindowStore } from "../../../state/windowStore";
import { AboutPanel } from "./AboutPanel";
import { AppsSettingsPanel } from "./AppsSettingsPanel";
import { IconBankPanel } from "./IconBankPanel";
import { UpdatePanel } from "./UpdatePanel";
import { UsersPanel } from "./UsersPanel";

type Tab = "compte" | "bureau" | "applications" | "icones" | "utilisateurs" | "systeme" | "apropos";

const WALLPAPERS = [
  { id: "default", label: "Aurore", css: "linear-gradient(160deg, #0f2027, #203a43 55%, #2c5364)" },
  { id: "sunset", label: "Coucher de soleil", css: "linear-gradient(160deg, #1a2980, #26d0ce)" },
  { id: "forest", label: "Forêt", css: "linear-gradient(160deg, #134e5e, #71b280)" },
  { id: "plum", label: "Prune", css: "linear-gradient(160deg, #2b1055, #7597de)" },
  { id: "slate", label: "Ardoise", css: "linear-gradient(160deg, #232526, #414345)" },
];

const ACCENTS = ["#4cc2ff", "#ff6b9d", "#7bd389", "#ffb454", "#c792ea", "#ff5c5c"];

interface Props {
  /** A plain tab id ("bureau"), or "applications:<appId>" to also jump
   * straight to that app's detail panel within the Applications tab (used
   * by the File Explorer's own "Paramètres" button). */
  initialTab?: string;
}

function parseInitialTab(initialTab?: string): { tab?: Tab; appId?: AppMetaId } {
  if (!initialTab) return {};
  const [tab, appId] = initialTab.split(":");
  return { tab: tab as Tab, appId: appId as AppMetaId | undefined };
}

export function SettingsApp({ initialTab }: Props) {
  const [tab, setTab] = useState<Tab>(parseInitialTab(initialTab).tab || "compte");
  const [appDetail, setAppDetail] = useState<AppMetaId | undefined>(parseInitialTab(initialTab).appId);
  const { me, updateProfile } = useAuthStore();
  const settings = useSettingsStore();
  const [displayName, setDisplayName] = useState(me?.display_name || "");
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [uploadingWallpaper, setUploadingWallpaper] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [health, setHealth] = useState<"checking" | "ok" | "down">("checking");
  const fileInput = useRef<HTMLInputElement>(null);
  const wallpaperFileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!initialTab) return;
    const parsed = parseInitialTab(initialTab);
    if (parsed.tab) setTab(parsed.tab);
    setAppDetail(parsed.appId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);

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

  async function onWallpaperFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingWallpaper(true);
    try {
      const { url } = await api.upload("/uploads", file);
      settings.update({ wallpaper: "custom-image", wallpaperImageUrl: url });
      await saveDesktopState();
    } finally {
      setUploadingWallpaper(false);
    }
  }

  function onWallpaperColorChange(color: string) {
    settings.update({ wallpaper: "custom-color", wallpaperColor: color });
    saveDesktopState();
  }

  return (
    <div className="settings-app">
      <div className="settings-tabs">
        {(
          [
            ["compte", "👤", "Compte"],
            ["bureau", "🎨", "Bureau"],
            ["applications", "🧩", "Applications"],
            ["icones", "🖼️", "Banque d'icônes"],
            ...(me?.is_admin ? ([["utilisateurs", "👥", "Utilisateurs"]] as [Tab, string, string][]) : []),
            ["systeme", "⚙️", "Système"],
            ["apropos", "ℹ️", "À propos"],
          ] as [Tab, string, string][]
        ).map(([id, tabIcon, label]) => (
          <button key={id} className={`settings-tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
            <span className="settings-tab-icon">{tabIcon}</span>
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
                  onClick={() => {
                    settings.update({ wallpaper: w.id });
                    saveDesktopState();
                  }}
                >
                  <span>{w.label}</span>
                </button>
              ))}
            </div>

            <h4>Personnalisation avancée</h4>
            <p className="settings-hint">Une couleur unie de votre choix, ou une image à vous.</p>
            <div className="wallpaper-custom-row">
              <label className={`wallpaper-swatch custom-color ${settings.wallpaper === "custom-color" ? "active" : ""}`}>
                <input
                  type="color"
                  value={settings.wallpaperColor}
                  onChange={(e) => onWallpaperColorChange(e.target.value)}
                />
                <span>Couleur unie</span>
              </label>
              <button
                className={`wallpaper-swatch custom-image ${settings.wallpaper === "custom-image" ? "active" : ""}`}
                style={
                  settings.wallpaperImageUrl ? { backgroundImage: `url(${settings.wallpaperImageUrl})` } : undefined
                }
                onClick={() => wallpaperFileInput.current?.click()}
                disabled={uploadingWallpaper}
              >
                <span>{uploadingWallpaper ? "Envoi..." : "Image personnalisée"}</span>
              </button>
              <input ref={wallpaperFileInput} type="file" accept="image/*" hidden onChange={onWallpaperFileChange} />
            </div>

            <h4>Couleur d'accent</h4>
            <div className="accent-row">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  className={`accent-swatch ${settings.accent === c ? "active" : ""}`}
                  style={{ background: c }}
                  onClick={() => {
                    settings.update({ accent: c });
                    saveDesktopState();
                  }}
                />
              ))}
              <label className="accent-swatch custom-accent">
                <input type="color" value={settings.accent} onChange={(e) => {
                  settings.update({ accent: e.target.value });
                  saveDesktopState();
                }} />
              </label>
            </div>
          </div>
        )}

        {tab === "applications" && <AppsSettingsPanel initialAppId={appDetail} />}

        {tab === "icones" && <IconBankPanel />}

        {tab === "utilisateurs" && me?.is_admin && <UsersPanel />}

        {tab === "apropos" && <AboutPanel />}

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

            <h4>Navigation</h4>
            <p className="settings-hint">
              Vos connexions (Google, Instagram...) sont mémorisées automatiquement. Si un site reste bloqué dans un
              état bizarre, effacez ses cookies pour repartir d'une session propre.
            </p>
            <button
              className="settings-btn"
              onClick={async () => {
                await api.del("/browser/cookies");
                setResetDone(true);
              }}
            >
              Effacer les cookies de navigation
            </button>
            {resetDone && <p className="settings-hint">Cookies effacés.</p>}

            {me?.is_admin && <UpdatePanel />}
          </div>
        )}
      </div>
    </div>
  );
}
