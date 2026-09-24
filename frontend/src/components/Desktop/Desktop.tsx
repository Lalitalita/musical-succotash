import { CSSProperties, useState } from "react";
import { APP_LABELS } from "../../constants/icons";
import { AppIconGlyph } from "../IconPicker/AppIconGlyph";
import { useAppIcon } from "../../state/appIconsStore";
import { openContextMenu } from "../../state/contextMenuStore";
import { useDesktopItemsStore } from "../../state/desktopItemsStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useWindowStore } from "../../state/windowStore";
import { normalizeUrl } from "../../utils/url";
import { ContextMenu } from "./ContextMenu";
import { DesktopIcon } from "./DesktopIcon";
import { NewShortcutForm } from "./NewShortcutForm";
import { StartMenu } from "./StartMenu";
import { Taskbar } from "./Taskbar";
import { WindowManager } from "./WindowManager";

const ICON_COL_WIDTH = 102;
const ICON_ROW_HEIGHT = 108;

// Positions are relative to .desktop-icons's padding box (see global.css) -
// (0, 0) already lands at the usual 20px inset from the screen edge.
function defaultIconPos(index: number): { x: number; y: number } {
  const perColumn = Math.max(1, Math.floor((window.innerHeight - 80) / ICON_ROW_HEIGHT));
  const col = Math.floor(index / perColumn);
  const row = index % perColumn;
  return { x: col * ICON_COL_WIDTH, y: row * ICON_ROW_HEIGHT };
}

const WALLPAPERS: Record<string, string> = {
  default: "linear-gradient(160deg, #0f2027, #203a43 55%, #2c5364)",
  sunset: "linear-gradient(160deg, #1a2980, #26d0ce)",
  forest: "linear-gradient(160deg, #134e5e, #71b280)",
  plum: "linear-gradient(160deg, #2b1055, #7597de)",
  slate: "linear-gradient(160deg, #232526, #414345)",
};

export function Desktop() {
  const [startOpen, setStartOpen] = useState(false);
  const [clockOpen, setClockOpen] = useState(false);
  const [addingShortcut, setAddingShortcut] = useState(false);
  const { openWindow } = useWindowStore();
  const wallpaper = useSettingsStore((s) => s.wallpaper);
  const wallpaperColor = useSettingsStore((s) => s.wallpaperColor);
  const wallpaperImageUrl = useSettingsStore((s) => s.wallpaperImageUrl);
  const { items, remove, move, setIcon } = useDesktopItemsStore();
  const browserIcon = useAppIcon("browser");

  const desktopStyle: CSSProperties =
    wallpaper === "custom-color"
      ? { background: wallpaperColor }
      : wallpaper === "custom-image" && wallpaperImageUrl
      ? { backgroundImage: `url(${wallpaperImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
      : { background: WALLPAPERS[wallpaper] || WALLPAPERS.default };

  function closeFlyouts() {
    setStartOpen(false);
    setClockOpen(false);
  }

  function openItem(item: (typeof items)[number]) {
    if (item.kind === "app" && item.appId) {
      openWindow(item.appId, APP_LABELS[item.appId] || item.label);
    } else if (item.kind === "url" && item.url) {
      const url = normalizeUrl(item.url);
      openWindow("browser", item.label, {
        forceNew: true,
        initialUrl: url,
        initialMode: item.fullMode ? "full" : undefined,
      });
    }
  }

  return (
    <div
      className="desktop"
      style={desktopStyle}
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
            onSelect: () => openWindow("settings", "Paramètres", { initialTab: "bureau" }),
          },
          { label: "Paramètres", icon: "⚙️", onSelect: () => openWindow("settings", "Paramètres") },
        ])
      }
    >
      <div className="desktop-icons">
        <button className="desktop-icon desktop-icon-fixed" onDoubleClick={() => openWindow("browser", "Navigateur")}>
          <AppIconGlyph className="icon-glyph" icon={browserIcon} />
          <span>Navigateur</span>
        </button>
        {items.map((item, index) => {
          const pos = item.x != null && item.y != null ? { x: item.x, y: item.y } : defaultIconPos(index + 1);
          return (
            <DesktopIcon
              key={item.id}
              id={item.id}
              label={item.label}
              icon={item.icon}
              iconUrl={item.iconUrl}
              x={pos.x}
              y={pos.y}
              onOpen={() => openItem(item)}
              onRemove={() => remove(item.id)}
              onMove={move}
              onSetIcon={setIcon}
            />
          );
        })}
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
