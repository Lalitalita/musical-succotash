import { useRef, useState } from "react";
import { openContextMenu } from "../../state/contextMenuStore";
import { saveDesktopState } from "../../state/persistence";
import type { IconOverride } from "../../state/appIconsStore";
import { IconPicker } from "../IconPicker/IconPicker";
import { AppIconGlyph } from "../IconPicker/AppIconGlyph";

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
  onSetIcon: (id: string, value: IconOverride) => void;
}

const DRAG_THRESHOLD = 4;

export function DesktopIcon({ id, label, icon, iconUrl, x, y, onOpen, onRemove, onMove, onSetIcon }: Props) {
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

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
            { label: "Changer l'icône...", icon: "🖼", onSelect: () => setPicking(true) },
            ...(onRemove
              ? [{ label: "Supprimer", icon: "🗑", danger: true, separatorBefore: true, onSelect: onRemove }]
              : []),
          ])
        }
      >
        <AppIconGlyph className="icon-glyph" icon={{ icon, iconUrl }} />
        <span>{label}</span>
      </button>
      {picking && (
        <IconPicker
          value={{ icon, iconUrl }}
          onChange={(v) => {
            onSetIcon(id, v);
            saveDesktopState();
          }}
          onClose={() => setPicking(false)}
          title={`Icône - ${label}`}
        />
      )}
    </>
  );
}
