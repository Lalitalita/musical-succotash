import { useAuthStore } from "../../state/authStore";
import { useWindowStore } from "../../state/windowStore";
import type { AppId } from "../../types";

interface Props {
  onClose: () => void;
}

const APPS: { id: AppId; title: string; icon: string; adminOnly?: boolean }[] = [
  { id: "browser", title: "Navigateur", icon: "🌐" },
  { id: "security-dashboard", title: "Sécurité", icon: "🛡️", adminOnly: true },
  { id: "about", title: "À propos", icon: "ℹ️" },
];

export function StartMenu({ onClose }: Props) {
  const { openWindow } = useWindowStore();
  const { me, logout } = useAuthStore();

  function launch(appId: AppId, title: string) {
    openWindow(appId, title);
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
      </div>
      <div className="start-menu-footer">
        <div className="start-user">
          <span className="avatar-mini">{me?.username[0]?.toUpperCase()}</span>
          {me?.username}
        </div>
        <button className="logout-btn" onClick={() => logout()}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
