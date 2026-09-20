import { PointerEvent, ReactNode, useRef, useState } from "react";
import { openContextMenu } from "../../state/contextMenuStore";
import { useWindowStore } from "../../state/windowStore";
import type { WindowInstance } from "../../types";

interface Props {
  win: WindowInstance;
  children: ReactNode;
  /** Replaces the plain title text in the titlebar - used by BrowserApp to
   * fold its tab strip into the same draggable row as the window controls,
   * instead of stacking two separate header bars. */
  titlebarContent?: ReactNode;
}

export function Window({ win, children, titlebarContent }: Props) {
  const { closeWindow, focusWindow, toggleMinimize, toggleMaximize, updateBounds } = useWindowStore();
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef({ mouseX: 0, mouseY: 0, winX: 0, winY: 0 });
  const resizing = useRef<{ mouseX: number; mouseY: number; w: number; h: number } | null>(null);

  if (win.minimized) return null;

  function onTitlePointerDown(e: PointerEvent) {
    if (win.maximized) return;
    focusWindow(win.id);
    setDragging(true);
    dragOrigin.current = { mouseX: e.clientX, mouseY: e.clientY, winX: win.x, winY: win.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onTitlePointerMove(e: PointerEvent) {
    if (!dragging) return;
    const dx = e.clientX - dragOrigin.current.mouseX;
    const dy = e.clientY - dragOrigin.current.mouseY;
    updateBounds(win.id, {
      x: Math.max(0, dragOrigin.current.winX + dx),
      y: Math.max(0, dragOrigin.current.winY + dy),
    });
  }

  function onTitlePointerUp(e: PointerEvent) {
    setDragging(false);
    (e.target as Element).releasePointerCapture(e.pointerId);
  }

  function onResizeStart(e: PointerEvent) {
    e.stopPropagation();
    focusWindow(win.id);
    resizing.current = { mouseX: e.clientX, mouseY: e.clientY, w: win.width, h: win.height };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onResizeMove(e: PointerEvent) {
    if (!resizing.current) return;
    const dx = e.clientX - resizing.current.mouseX;
    const dy = e.clientY - resizing.current.mouseY;
    updateBounds(win.id, {
      width: Math.max(320, resizing.current.w + dx),
      height: Math.max(200, resizing.current.h + dy),
    });
  }

  function onResizeEnd(e: PointerEvent) {
    resizing.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
  }

  const style = win.maximized
    ? { left: 0, top: 0, width: "100vw", height: "calc(100vh - var(--taskbar-height))", zIndex: win.zIndex }
    : { left: win.x, top: win.y, width: win.width, height: win.height, zIndex: win.zIndex };

  return (
    <div
      className={`app-window ${win.maximized ? "maximized" : ""}`}
      style={style}
      onPointerDown={() => focusWindow(win.id)}
    >
      <div
        className={`window-titlebar ${dragging ? "dragging" : ""} ${titlebarContent ? "has-content" : ""}`}
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
        onDoubleClick={(e) => {
          const target = e.target as HTMLElement;
          if (
            !target.closest(
              ".browser-tab, .browser-tab-new, .file-explorer-tabbar-tab, .file-explorer-tabbar-new, .file-explorer-tabbar-settings"
            )
          )
            toggleMaximize(win.id);
        }}
        onContextMenu={(e) =>
          openContextMenu(e, [
            { label: "Réduire", icon: "—", onSelect: () => toggleMinimize(win.id) },
            { label: win.maximized ? "Restaurer" : "Agrandir", icon: "▢", onSelect: () => toggleMaximize(win.id) },
            { label: "Fermer", icon: "✕", danger: true, separatorBefore: true, onSelect: () => closeWindow(win.id) },
          ])
        }
      >
        {titlebarContent || <span className="window-title">{win.title}</span>}
        <div className="window-controls">
          <button onClick={() => toggleMinimize(win.id)} aria-label="Réduire">
            &#8211;
          </button>
          <button onClick={() => toggleMaximize(win.id)} aria-label="Agrandir">
            {win.maximized ? "❐" : "☐"}
          </button>
          <button className="close" onClick={() => closeWindow(win.id)} aria-label="Fermer">
            ✕
          </button>
        </div>
      </div>
      <div className="window-body">{children}</div>
      {!win.maximized && (
        <div
          className="resize-handle"
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
        />
      )}
    </div>
  );
}
