import { useState } from "react";
import { openContextMenu } from "../../state/contextMenuStore";
import { useDesktopItemsStore } from "../../state/desktopItemsStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useWindowStore } from "../../state/windowStore";
import type { AppId } from "../../types";
import { normalizeUrl } from "../../utils/url";
import { ContextMenu } from "./ContextMenu";
import { NewShortcutForm } from "./NewShortcutForm";
import { StartMenu } from "./StartMenu";
import { Taskbar } from "./Taskbar";
import { WindowManager } from "./WindowManager";

const WALLPAPERS: Record<string, string> = {
  default: "linear-gradient(160deg, #0f2027, #203a43 55%, #2c5364)",
  sunset: "linear-gradient(160deg, #1a2980, #26d0ce)",
  forest: "linear-gradient(160deg, #134e5e, #71b280)",
  plum: "linear-gradient(160deg, #2b1055, #7597de)",
  slate: "linear-gradient(160deg, #232526, #414345)",
};

const APP_TITLES: Record<AppId, string> = {
  browser: "Navigateur",
  "security-dashboard": "Sécurité",
  settings: "Paramètres",
  files: "Explorateur de fichiers",
};

export function Desktop() {
  const [startOpen, setStartOpen] = useState(false);
  const [clockOpen, setClockOpen] = useState(false);
  const [addingShortcut, setAddingShortcut] = useState(false);
  const { openWindow } = useWindowStore();
  const wallpaper = useSettingsStore((s) => s.wallpaper);
  const { items, remove } = useDesktopItemsStore();

  function closeFlyouts() {
    setStartOpen(false);
    setClockOpen(false);
  }

  function openItem(item: (typeof items)[number]) {
    if (item.kind === "app" && item.appId) {
      openWindow(item.appId, APP_TITLES[item.appId] || item.label);
    } else if (item.kind === "url" && item.url) {
      const url = normalizeUrl(item.url);
      openWindow("browser", item.label, { forceNew: true, initialUrl: url });
    }
  }

  return (
    <div
      className="desktop"
      style={{ background: WALLPAPERS[wallpaper] || WALLPAPERS.default }}
      onClick={closeFlyouts}
      onContextMenu={(e) =>
        openContextMenu(e, [
          { label: "Actualiser", icon: "⟳", onSelect: () => window.location.reload() },
          {
            label: "Nouvelle fenêtre Navigateur",
            icon: "🌐",
            onSelect: () => openWindow("browser", "Navigateur", { forceNew: true }),
          },
          { label: "Nouveau raccourci", icon: "➕", onSelect: () => setAddingShortcut(true) },
          {
            label: "Personnaliser l'arrière-plan",
            icon: "🎨",
            separatorBefore: true,
            onSelect: () => openWindow("settings", "Paramètres"),
          },
          { label: "Paramètres", icon: "⚙️", onSelect: () => openWindow("settings", "Paramètres") },
        ])
      }
    >
      <div className="desktop-icons">
        <button className="desktop-icon" onDoubleClick={() => openWindow("browser", "Navigateur")}>
          <span className="icon-glyph">🌐</span>
          <span>Navigateur</span>
        </button>
        {items.map((item) => (
          <button
            key={item.id}
            className="desktop-icon"
            onDoubleClick={() => openItem(item)}
            onContextMenu={(e) =>
              openContextMenu(e, [
                { label: "Ouvrir", icon: "↗", onSelect: () => openItem(item) },
                { label: "Supprimer", icon: "🗑", danger: true, separatorBefore: true, onSelect: () => remove(item.id) },
              ])
            }
          >
            <span className="icon-glyph">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <WindowManager />

      {startOpen && <StartMenu onClose={() => setStartOpen(false)} />}

      <Taskbar
        startOpen={startOpen}
        onToggleStart={() => {
          setClockOpen(false);
          setStartOpen((v) => !v);
        }}
        clockOpen={clockOpen}
        onToggleClock={() => {
          setStartOpen(false);
          setClockOpen((v) => !v);
        }}
      />

      {addingShortcut && <NewShortcutForm onClose={() => setAddingShortcut(false)} />}

      <ContextMenu />
    </div>
  );
}
