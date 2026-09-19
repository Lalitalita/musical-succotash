import { useEffect, useState } from "react";
import { useWindowStore } from "../../state/windowStore";
import type { AppId } from "../../types";

interface Props {
  onToggleStart: () => void;
  startOpen: boolean;
}

const APP_ICONS: Record<AppId, string> = {
  browser: "🌐",
  "security-dashboard": "🛡️",
  about: "ℹ️",
};

export function Taskbar({ onToggleStart, startOpen }: Props) {
  const { windows, focusWindow, toggleMinimize } = useWindowStore();
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
    <div className="taskbar">
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
        >
          {APP_ICONS[w.appId]} {w.title}
        </button>
      ))}
      <div className="taskbar-clock">
        <div>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        <div>{now.toLocaleDateString()}</div>
      </div>
    </div>
  );
}
