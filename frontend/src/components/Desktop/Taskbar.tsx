import { useEffect, useState } from "react";
import { openContextMenu } from "../../state/contextMenuStore";
import { useWindowStore } from "../../state/windowStore";
import type { AppId } from "../../types";
import { ClockFlyout } from "./ClockFlyout";

interface Props {
  onToggleStart: () => void;
  startOpen: boolean;
  onToggleClock: () => void;
  clockOpen: boolean;
}

const APP_ICONS: Record<AppId, string> = {
  browser: "🌐",
  "security-dashboard": "🛡️",
  settings: "⚙️",
  about: "ℹ️",
};

export function Taskbar({ onToggleStart, startOpen, onToggleClock, clockOpen }: Props) {
  const { windows, focusWindow, toggleMinimize, closeWindow } = useWindowStore();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
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
        <button
          key={w.id}
          className={`taskbar-btn ${!w.minimized ? "active" : ""}`}
          onClick={() => onTaskClick(w.id, w.minimized)}
          onContextMenu={(e) =>
            openContextMenu(e, [
              { label: "Restaurer", icon: "▢", onSelect: () => onTaskClick(w.id, w.minimized) },
              { label: "Fermer", icon: "✕", danger: true, separatorBefore: true, onSelect: () => closeWindow(w.id) },
            ])
          }
        >
          {APP_ICONS[w.appId]} {w.title}
        </button>
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
