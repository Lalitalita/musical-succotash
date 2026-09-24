import { useState } from "react";
import { AppIconGlyph } from "../IconPicker/AppIconGlyph";
import { useAppIcon } from "../../state/appIconsStore";
import { useAuthStore } from "../../state/authStore";
import { useCustomAppsStore } from "../../state/customAppsStore";
import { openContextMenu } from "../../state/contextMenuStore";
import { saveDesktopState } from "../../state/persistence";
import { usePinnedAppsStore } from "../../state/pinnedAppsStore";
import { useSearchResults } from "../../state/searchResults";
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
  // Root-equivalent host access (see README's "Terminal et Docker") -
  // admin accounts only, same gate the backend itself enforces on every
  // request.
  { id: "terminal", adminOnly: true },
  { id: "dockerctl", adminOnly: true },
];

function AppRow({
  icon,
  iconUrl,
  label,
  onClick,
  disabled,
  title,
  contextMenu,
}: {
  icon: string;
  iconUrl?: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  contextMenu?: Parameters<typeof openContextMenu>[1];
}) {
  return (
    <button
      className="start-row"
      onClick={onClick}
      disabled={disabled}
      title={title}
      onContextMenu={contextMenu ? (e) => openContextMenu(e, contextMenu) : undefined}
    >
      <AppIconGlyph className="icon-glyph" icon={{ icon, iconUrl }} />
      <span>{label}</span>
    </button>
  );
}

function StartTile({ appId, onClick }: { appId: AppId; onClick: () => void }) {
  const icon = useAppIcon(appId);
  const pinned = usePinnedAppsStore((s) => s.pinned.includes(appId));
  return (
    <AppRow
      icon={icon.icon || "🌐"}
      iconUrl={icon.iconUrl}
      label={APP_LABELS[appId]}
      onClick={onClick}
      contextMenu={[
        {
          label: pinned ? "Détacher de la barre des tâches" : "Épingler à la barre des tâches",
          icon: "📌",
          onSelect: () => {
            if (pinned) usePinnedAppsStore.getState().unpin(appId);
            else usePinnedAppsStore.getState().pin(appId);
            saveDesktopState();
          },
        },
      ]}
    />
  );
}

export function StartMenu({ onClose }: Props) {
  const { openWindow } = useWindowStore();
  const { me, logout } = useAuthStore();
  const { mailUrl, calendarUrl } = useSettingsStore();
  const customApps = useCustomAppsStore((s) => s.apps);
  const [query, setQuery] = useState("");
  const results = useSearchResults(query);

  function launch(appId: AppId, title: string) {
    openWindow(appId, title);
    onClose();
  }

  function launchUrlApp(url: string, title: string, chromeless?: boolean, fullMode?: boolean) {
    if (!url) return;
    openWindow("browser", title, {
      forceNew: true,
      initialUrl: url,
      chromeless,
      initialMode: fullMode ? "full" : undefined,
    });
    onClose();
  }

  function pick(r: (typeof results)[number]) {
    r.onSelect();
    setQuery("");
    onClose();
  }

  function onSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && results[0]) pick(results[0]);
    if (e.key === "Escape") setQuery("");
  }

  const pinnedCustomApps = customApps.filter((a) => a.pinned);
  const searching = query.trim().length > 0;

  return (
    <div className="start-menu" onClick={(e) => e.stopPropagation()}>
      <input
        className="start-search"
        placeholder="Rechercher des applications, fichiers, calculs..."
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onSearchKeyDown}
      />

      {searching ? (
        <div className="start-search-results">
          {results.length === 0 && <div className="start-search-empty">Aucun résultat.</div>}
          {results.map((r) => (
            <button key={r.key} className="start-row" onClick={() => pick(r)}>
              <AppIconGlyph className="icon-glyph" icon={{ icon: r.icon, iconUrl: r.iconUrl }} />
              <span className="start-row-text">
                <span className="start-row-label">{r.label}</span>
                <span className="start-row-hint">{r.hint}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <h4>Épinglées</h4>
          <div className="start-list">
            {APPS.filter((a) => !a.adminOnly || me?.is_admin).map((a) => (
              <StartTile key={a.id} appId={a.id} onClick={() => launch(a.id, APP_LABELS[a.id])} />
            ))}
            <AppRow
              icon="📧"
              label="Messagerie"
              disabled={!mailUrl}
              title={mailUrl ? undefined : "Configurez l'URL dans Paramètres → Applications"}
              onClick={() => launchUrlApp(mailUrl, "Messagerie")}
            />
            <AppRow
              icon="📅"
              label="Calendrier"
              disabled={!calendarUrl}
              title={calendarUrl ? undefined : "Configurez l'URL dans Paramètres → Applications"}
              onClick={() => launchUrlApp(calendarUrl, "Calendrier")}
            />
            {pinnedCustomApps.map((a) => (
              <AppRow
                key={a.id}
                icon={a.icon}
                iconUrl={a.iconUrl}
                label={a.label}
                onClick={() => launchUrlApp(a.url, a.label, a.chromeless, a.fullMode)}
                contextMenu={[
                  {
                    label: "Détacher de l'épingle",
                    icon: "📌",
                    onSelect: () => {
                      useCustomAppsStore.getState().togglePinned(a.id);
                      saveDesktopState();
                    },
                  },
                ]}
              />
            ))}
          </div>
        </>
      )}

      <div className="start-menu-footer">
        <div className="start-user">
          <span className="avatar-mini">
            {me?.avatar_url ? <img src={me.avatar_url} alt="" /> : me?.username[0]?.toUpperCase()}
          </span>
          <span className="start-user-name">{me?.display_name || me?.username}</span>
        </div>
        <button className="logout-btn" onClick={() => logout()}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
