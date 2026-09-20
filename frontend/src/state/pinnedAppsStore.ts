import { create } from "zustand";
import type { AppId } from "../types";

interface PinnedAppsState {
  pinned: AppId[];
  pin: (id: AppId) => void;
  unpin: (id: AppId) => void;
  hydrate: (pinned: AppId[]) => void;
}

export const usePinnedAppsStore = create<PinnedAppsState>((set, get) => ({
  pinned: [],

  pin: (id) => {
    if (get().pinned.includes(id)) return;
    set({ pinned: [...get().pinned, id] });
  },

  unpin: (id) => set({ pinned: get().pinned.filter((p) => p !== id) }),

  hydrate: (pinned) => set({ pinned: Array.isArray(pinned) ? pinned : [] }),
}));
