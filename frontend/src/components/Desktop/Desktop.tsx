import { useState } from "react";
import { useWindowStore } from "../../state/windowStore";
import { StartMenu } from "./StartMenu";
import { Taskbar } from "./Taskbar";
import { WindowManager } from "./WindowManager";

export function Desktop() {
  const [startOpen, setStartOpen] = useState(false);
  const { openWindow } = useWindowStore();

  return (
    <div className="desktop" onClick={() => startOpen && setStartOpen(false)}>
      <div className="desktop-icons">
        <button className="desktop-icon" onDoubleClick={() => openWindow("browser", "Navigateur")}>
          <span className="icon-glyph">🌐</span>
          <span>Navigateur</span>
        </button>
      </div>

      <WindowManager />

      {startOpen && <StartMenu onClose={() => setStartOpen(false)} />}

      <Taskbar startOpen={startOpen} onToggleStart={() => setStartOpen((v) => !v)} />
    </div>
  );
}
