import { useEffect, useRef, useState } from "react";
import { APP_LABELS } from "../../constants/icons";
import { AppIconGlyph } from "../IconPicker/AppIconGlyph";
import { useAppIcon } from "../../state/appIconsStore";
import { openContextMenu } from "../../state/contextMenuStore";
import { saveDesktopState } from "../../state/persistence";
import { usePinnedAppsStore } from "../../state/pinnedAppsStore";
import { useWindowStore } from "../../state/windowStore";
import type { AppId, WindowInstance } from "../../types";
import { ClockFlyout } from "./ClockFlyout";
import { SearchOverlay, type SearchOverlayHandle } from "./SearchOverlay";

interface Props {
  onToggleStart: () => void;
  startOpen: boolean;
  onToggleClock: () => void;
  clockOpen: boolean;
  searchOpen: boolean;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
}

function pinMenuItem(appId: AppId, pinned: boolean) {
  return {
    label: pinned ? "Détacher de la barre des tâches" : "Épingler à la barre des tâches",
    icon: "📌",
    separatorBefore: true,
    onSelect: () => {
      if (pinned) usePinnedAppsStore.getState().unpin(appId);
      else usePinnedAppsStore.getState().pin(appId);
      saveDesktopState();
    },
  };
}

function TaskbarButton({ win, onClick }: { win: WindowInstance; onClick: () => void }) {
  const icon = useAppIcon(win.appId);
  const pinned = usePinnedAppsStore((s) => s.pinned.includes(win.appId));
  return (
    <button
      className={`taskbar-btn ${!win.minimized ? "active" : ""}`}
      onClick={onClick}
      onContextMenu={(e) =>
        openContextMenu(e, [
          { label: "Restaurer", icon: "▢", onSelect: onClick },
          pinMenuItem(win.appId, pinned),
          {
            label: "Fermer",
            icon: "✕",
            danger: true,
            separatorBefore: true,
            onSelect: () => useWindowStore.getState().closeWindow(win.id),
          },
        ])
      }
    >
      <AppIconGlyph className="icon-glyph" icon={icon} /> {win.title}
    </button>
  );
}

function PinnedTaskbarButton({ appId }: { appId: AppId }) {
  const icon = useAppIcon(appId);
  const openWindow = useWindowStore((s) => s.openWindow);
  return (
    <button
      className="taskbar-btn pinned"
      onClick={() => openWindow(appId, APP_LABELS[appId])}
      onContextMenu={(e) =>
        openContextMenu(e, [
          { label: "Ouvrir", icon: "▢", onSelect: () => openWindow(appId, APP_LABELS[appId]) },
          pinMenuItem(appId, true),
        ])
      }
    >
      <AppIconGlyph className="icon-glyph" icon={icon} /> {APP_LABELS[appId]}
    </button>
  );
}

export function Taskbar({
  onToggleStart,
  startOpen,
  onToggleClock,
  clockOpen,
  searchOpen,
  onOpenSearch,
  onCloseSearch,
}: Props) {
  const { windows, focusWindow, toggleMinimize } = useWindowStore();
  const pinnedApps = usePinnedAppsStore((s) => s.pinned);
  const [now, setNow] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchOverlayRef = useRef<SearchOverlayHandle>(null);

  useEffect(() => {
    // Ticks every second so the clock flyout can show a live HH:MM:SS
    // clock while it's open; a per-second React state update is cheap.
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenSearch();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenSearch]);

  function onTaskClick(id: string, minimized: boolean) {
    if (minimized) toggleMinimize(id);
    focusWindow(id);
  }

  const openAppIds = new Set(windows.map((w) => w.appId));

  return (
    <div
      className="taskbar"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        className={`taskbar-btn ${startOpen ? "active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleStart();
        }}
        aria-label="Démarrer"
      >
        ⊞
      </button>
      <div className="taskbar-search-wrap">
        <input
          ref={searchInputRef}
          className="taskbar-search"
          placeholder="Rechercher (Ctrl+K)"
          value={searchQuery}
          onFocus={onOpenSearch}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            onOpenSearch();
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onCloseSearch();
              setSearchQuery("");
              searchInputRef.current?.blur();
            }
            if (e.key === "Enter") searchOverlayRef.current?.runFirst();
          }}
        />
        {searchOpen && (
          <SearchOverlay
            ref={searchOverlayRef}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onClose={() => {
              onCloseSearch();
              setSearchQuery("");
            }}
          />
        )}
      </div>
      {pinnedApps
        .filter((id) => !openAppIds.has(id))
        .map((id) => (
          <PinnedTaskbarButton key={id} appId={id} />
        ))}
      {windows.map((w) => (
        <TaskbarButton key={w.id} win={w} onClick={() => onTaskClick(w.id, w.minimized)} />
      ))}
      <div
        className={`taskbar-clock ${clockOpen ? "active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleClock();
        }}
      >
        <div>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        <div>{now.toLocaleDateString()}</div>
        {clockOpen && <ClockFlyout onClose={onToggleClock} />}
      </div>
    </div>
  );
}
