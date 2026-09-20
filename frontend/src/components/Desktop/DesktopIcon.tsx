import { useRef, useState } from "react";
import { api } from "../../api/client";
import { openContextMenu } from "../../state/contextMenuStore";
import { saveDesktopState } from "../../state/persistence";

interface Props {
  id: string;
  label: string;
  icon: string;
  iconUrl?: string;
  x: number;
  y: number;
  onOpen: () => void;
  onRemove?: () => void;
  onMove: (id: string, x: number, y: number) => void;
  onSetIcon: (id: string, url: string) => void;
}

const DRAG_THRESHOLD = 4;

export function DesktopIcon({ id, label, icon, iconUrl, x, y, onOpen, onRemove, onMove, onSetIcon }: Props) {
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: x, origY: y, moved: false };
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    setDragPos({ x: Math.max(0, d.origX + dx), y: Math.max(0, d.origY + dy) });
  }

  function onPointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.moved && dragPos) {
      onMove(id, dragPos.x, dragPos.y);
      saveDesktopState();
    }
    setDragPos(null);
  }

  async function onIconFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { url } = await api.upload("/uploads", file);
    onSetIcon(id, url);
    saveDesktopState();
  }

  const pos = dragPos || { x, y };

  return (
    <>
      <button
        className="desktop-icon"
        style={{ position: "absolute", left: pos.x, top: pos.y }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onOpen}
        onContextMenu={(e) =>
          openContextMenu(e, [
            { label: "Ouvrir", icon: "↗", onSelect: onOpen },
            { label: "Changer l'icône...", icon: "🖼", onSelect: () => fileInput.current?.click() },
            ...(onRemove
              ? [{ label: "Supprimer", icon: "🗑", danger: true, separatorBefore: true, onSelect: onRemove }]
              : []),
          ])
        }
      >
        <span className="icon-glyph">
          {iconUrl ? <img className="icon-image" src={iconUrl} alt="" /> : icon}
        </span>
        <span>{label}</span>
      </button>
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={onIconFileChange} />
    </>
  );
}
