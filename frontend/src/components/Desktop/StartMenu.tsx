import { useAuthStore } from "../../state/authStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useWindowStore } from "../../state/windowStore";
import type { AppId } from "../../types";

interface Props {
  onClose: () => void;
}

const APPS: { id: AppId; title: string; icon: string; adminOnly?: boolean }[] = [
  { id: "browser", title: "Navigateur", icon: "🌐" },
  { id: "security-dashboard", title: "Sécurité", icon: "🛡️", adminOnly: true },
  { id: "settings", title: "Paramètres", icon: "⚙️" },
  { id: "about", title: "À propos", icon: "ℹ️" },
];

export function StartMenu({ onClose }: Props) {
  const { windows, openWindow, focusWindow, toggleMinimize } = useWindowStore();
  const { me, logout } = useAuthStore();
  const { mailUrl, calendarUrl } = useSettingsStore();

  function launch(appId: AppId, title: string) {
    openWindow(appId, title);
    onClose();
  }

  function launchUrlApp(url: string, title: string) {
    if (!url) return;
    const existing = windows.find((w) => w.appId === "browser" && w.title === title);
    if (existing) {
      if (existing.minimized) toggleMinimize(existing.id);
      focusWindow(existing.id);
    } else {
      openWindow("browser", title, { forceNew: true, initialUrl: url });
    }
    onClose();
  }

  return (
    <div className="start-menu" onClick={(e) => e.stopPropagation()}>
      <h4>Applications épinglées</h4>
      <div className="start-menu-grid">
        {APPS.filter((a) => !a.adminOnly || me?.is_admin).map((a) => (
          <button key={a.id} className="start-tile" onClick={() => launch(a.id, a.title)}>
            <span className="icon-glyph">{a.icon}</span>
            {a.title}
          </button>
        ))}
        <button
          className="start-tile"
          disabled={!mailUrl}
          title={mailUrl ? undefined : "Configurez l'URL dans Paramètres → Applications"}
          onClick={() => launchUrlApp(mailUrl, "Messagerie")}
        >
          <span className="icon-glyph">✉️</span>
          Messagerie
        </button>
        <button
          className="start-tile"
          disabled={!calendarUrl}
          title={calendarUrl ? undefined : "Configurez l'URL dans Paramètres → Applications"}
          onClick={() => launchUrlApp(calendarUrl, "Calendrier")}
        >
          <span className="icon-glyph">📅</span>
          Calendrier
        </button>
      </div>
      <div className="start-menu-footer">
        <div className="start-user">
          <span className="avatar-mini">
            {me?.avatar_url ? <img src={me.avatar_url} alt="" /> : me?.username[0]?.toUpperCase()}
          </span>
          {me?.display_name || me?.username}
        </div>
        <button className="logout-btn" onClick={() => logout()}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
