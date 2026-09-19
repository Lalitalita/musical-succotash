import { useState } from "react";
import { openContextMenu } from "../../state/contextMenuStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useWindowStore } from "../../state/windowStore";
import { ContextMenu } from "./ContextMenu";
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

export function Desktop() {
  const [startOpen, setStartOpen] = useState(false);
  const [clockOpen, setClockOpen] = useState(false);
  const { openWindow } = useWindowStore();
  const wallpaper = useSettingsStore((s) => s.wallpaper);

  function closeFlyouts() {
    setStartOpen(false);
    setClockOpen(false);
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

      <ContextMenu />
    </div>
  );
}
