import { AppIconGlyph } from "../IconPicker/AppIconGlyph";
import { useAppIcon } from "../../state/appIconsStore";
import { useAuthStore } from "../../state/authStore";
import { openContextMenu } from "../../state/contextMenuStore";
import { saveDesktopState } from "../../state/persistence";
import { usePinnedAppsStore } from "../../state/pinnedAppsStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useWindowStore } from "../../state/windowStore";
import { APP_LABELS } from "../../constants/icons";
import type { AppId } from "../../types";

interface Props {
  onClose: () => void;
}

const APPS: { id: AppId; adminOnly?: boolean }[] = [
  { id: "browser" },
  { id: "files" },
  { id: "security-dashboard", adminOnly: true },
  { id: "settings" },
  { id: "notes" },
  { id: "downloads" },
  { id: "sessions" },
  // Root-equivalent host access (see docker-compose.dockerctl.yml) - admin
  // accounts only, same gate the backend itself enforces on every request.
  { id: "terminal", adminOnly: true },
  { id: "dockerctl", adminOnly: true },
];

function StartTile({
  appId,
  onClick,
  disabled,
  title,
  pinnable,
}: {
  appId: AppId | "mail" | "calendar";
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  pinnable?: AppId;
}) {
  const icon = useAppIcon(appId);
  const pinned = usePinnedAppsStore((s) => (pinnable ? s.pinned.includes(pinnable) : false));
  return (
    <button
      className="start-tile"
      onClick={onClick}
      disabled={disabled}
      title={title}
      onContextMenu={
        pinnable
          ? (e) =>
              openContextMenu(e, [
                {
                  label: pinned ? "Détacher de la barre des tâches" : "Épingler à la barre des tâches",
                  icon: "📌",
                  onSelect: () => {
                    if (pinned) usePinnedAppsStore.getState().unpin(pinnable);
                    else usePinnedAppsStore.getState().pin(pinnable);
                    saveDesktopState();
                  },
                },
              ])
          : undefined
      }
    >
      <AppIconGlyph className="icon-glyph" icon={icon} />
      {APP_LABELS[appId]}
    </button>
  );
}

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
          <StartTile key={a.id} appId={a.id} pinnable={a.id} onClick={() => launch(a.id, APP_LABELS[a.id])} />
        ))}
        <StartTile
          appId="mail"
          disabled={!mailUrl}
          title={mailUrl ? undefined : "Configurez l'URL dans Paramètres → Applications"}
          onClick={() => launchUrlApp(mailUrl, "Messagerie")}
        />
        <StartTile
          appId="calendar"
          disabled={!calendarUrl}
          title={calendarUrl ? undefined : "Configurez l'URL dans Paramètres → Applications"}
          onClick={() => launchUrlApp(calendarUrl, "Calendrier")}
        />
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
