import { create } from "zustand";
import type { DesktopItem } from "../types";

interface DesktopItemsState {
  items: DesktopItem[];
  add: (item: Omit<DesktopItem, "id">) => void;
  remove: (id: string) => void;
  hydrate: (items: DesktopItem[]) => void;
}

let counter = 0;

export const useDesktopItemsStore = create<DesktopItemsState>((set, get) => ({
  items: [],

  add: (item) => {
    set({ items: [...get().items, { ...item, id: `shortcut-${Date.now()}-${counter++}` }] });
  },

  remove: (id) => set({ items: get().items.filter((i) => i.id !== id) }),

  hydrate: (items) => set({ items: Array.isArray(items) ? items : [] }),
}));
