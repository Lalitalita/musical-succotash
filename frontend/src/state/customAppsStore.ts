import { create } from "zustand";
import type { IconOverride } from "./appIconsStore";
import type { CustomApp } from "../types";

interface CustomAppsState {
  apps: CustomApp[];
  add: (app: Omit<CustomApp, "id">) => void;
  remove: (id: string) => void;
  togglePinned: (id: string) => void;
  setIcon: (id: string, value: IconOverride) => void;
  hydrate: (apps: CustomApp[]) => void;
}

let counter = 0;

export const useCustomAppsStore = create<CustomAppsState>((set, get) => ({
  apps: [],

  add: (app) => {
    set({ apps: [...get().apps, { ...app, id: `custom-app-${Date.now()}-${counter++}` }] });
  },

  remove: (id) => set({ apps: get().apps.filter((a) => a.id !== id) }),

  togglePinned: (id) =>
    set({ apps: get().apps.map((a) => (a.id === id ? { ...a, pinned: !a.pinned } : a)) }),

  setIcon: (id, value) =>
    set({
      apps: get().apps.map((a) => (a.id === id ? { ...a, icon: value.icon ?? a.icon, iconUrl: value.iconUrl } : a)),
    }),

  hydrate: (apps) => set({ apps: Array.isArray(apps) ? apps : [] }),
}));
