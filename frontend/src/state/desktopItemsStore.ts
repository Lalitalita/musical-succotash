import { create } from "zustand";
import type { DesktopItem } from "../types";

interface DesktopItemsState {
  items: DesktopItem[];
  add: (item: Omit<DesktopItem, "id">) => void;
  remove: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  setIcon: (id: string, iconUrl: string) => void;
  hydrate: (items: DesktopItem[]) => void;
}

let counter = 0;

export const useDesktopItemsStore = create<DesktopItemsState>((set, get) => ({
  items: [],

  add: (item) => {
    set({ items: [...get().items, { ...item, id: `shortcut-${Date.now()}-${counter++}` }] });
  },

  remove: (id) => set({ items: get().items.filter((i) => i.id !== id) }),

  move: (id, x, y) =>
    set({ items: get().items.map((i) => (i.id === id ? { ...i, x, y } : i)) }),

  setIcon: (id, iconUrl) => set({ items: get().items.map((i) => (i.id === id ? { ...i, iconUrl } : i)) }),

  hydrate: (items) => set({ items: Array.isArray(items) ? items : [] }),
}));
