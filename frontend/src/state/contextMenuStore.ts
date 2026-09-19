import type { MouseEvent } from "react";
import { create } from "zustand";

export interface ContextMenuItem {
  label: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  onSelect?: () => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  open: (x: number, y: number, items: ContextMenuItem[]) => void;
  close: () => void;
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  visible: false,
  x: 0,
  y: 0,
  items: [],
  open: (x, y, items) => set({ visible: true, x, y, items }),
  close: () => set({ visible: false }),
}));

export function openContextMenu(e: MouseEvent, items: ContextMenuItem[]) {
  e.preventDefault();
  e.stopPropagation();
  useContextMenuStore.getState().open(e.clientX, e.clientY, items);
}
