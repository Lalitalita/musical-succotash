import { useEffect, useState } from "react";
import { AppIconGlyph } from "../IconPicker/AppIconGlyph";
import { useAppIcon } from "../../state/appIconsStore";
import { openContextMenu } from "../../state/contextMenuStore";
import { useWindowStore } from "../../state/windowStore";
import type { WindowInstance } from "../../types";
import { ClockFlyout } from "./ClockFlyout";

interface Props {
  onToggleStart: () => void;
  startOpen: boolean;
  onToggleClock: () => void;
  clockOpen: boolean;
}

function TaskbarButton({ win, onClick }: { win: WindowInstance; onClick: () => void }) {
  const icon = useAppIcon(win.appId);
  return (
    <button
      className={`taskbar-btn ${!win.minimized ? "active" : ""}`}
      onClick={onClick}
      onContextMenu={(e) =>
        openContextMenu(e, [
          { label: "Restaurer", icon: "▢", onSelect: onClick },
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

export function Taskbar({ onToggleStart, startOpen, onToggleClock, clockOpen }: Props) {
  const { windows, focusWindow, toggleMinimize } = useWindowStore();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    // Ticks every second so the clock flyout can show a live HH:MM:SS
    // clock while it's open; a per-second React state update is cheap.
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  function onTaskClick(id: string, minimized: boolean) {
    if (minimized) toggleMinimize(id);
    focusWindow(id);
  }

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
      <input className="taskbar-search" placeholder="Rechercher" />
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
