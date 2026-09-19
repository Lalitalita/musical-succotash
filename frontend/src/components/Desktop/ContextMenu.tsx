import { useEffect, useRef } from "react";
import { useContextMenuStore } from "../../state/contextMenuStore";

export function ContextMenu() {
  const { visible, x, y, items, close } = useContextMenuStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [visible, close]);

  if (!visible) return null;

  const clampedX = Math.min(x, window.innerWidth - 220);
  const clampedY = Math.min(y, window.innerHeight - items.length * 34 - 60);

  return (
    <div ref={ref} className="context-menu" style={{ left: clampedX, top: clampedY }}>
      {items.map((item, i) => (
        <div key={i}>
          {item.separatorBefore && <div className="context-menu-sep" />}
          <button
            className={`context-menu-item ${item.danger ? "danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              item.onSelect?.();
              close();
            }}
          >
            {item.icon && <span className="icon-glyph">{item.icon}</span>}
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}
