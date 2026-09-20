import { create } from "zustand";
import type { AppId, WindowInstance } from "../types";

interface OpenOptions {
  initialUrl?: string;
  initialTab?: string;
  /** Open a brand-new window even if one for this appId is already open (used for the Navigateur launcher, never for Mail/Calendrier shortcuts). */
  forceNew?: boolean;
}

interface WindowState {
  windows: WindowInstance[];
  topZ: number;
  openWindow: (appId: AppId, title: string, opts?: OpenOptions) => string;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  toggleMinimize: (id: string) => void;
  toggleMaximize: (id: string) => void;
  updateBounds: (id: string, bounds: Partial<Pick<WindowInstance, "x" | "y" | "width" | "height">>) => void;
  hydrate: (windows: WindowInstance[]) => void;
}

let counter = 0;

export const useWindowStore = create<WindowState>((set, get) => ({
  windows: [],
  topZ: 1,

  openWindow: (appId, title, opts) => {
    if (!opts?.forceNew) {
      const existing = get().windows.find((w) => w.appId === appId);
      if (existing) {
        get().focusWindow(existing.id);
        set((s) => ({
          windows: s.windows.map((w) =>
            w.id === existing.id
              ? { ...w, minimized: false, initialTab: opts?.initialTab ?? w.initialTab }
              : w
          ),
        }));
        return existing.id;
      }
    }
    const z = get().topZ + 1;
    const offset = (counter++ % 6) * 24;
    const win: WindowInstance = {
      id: `${appId}-${Date.now()}-${counter}`,
      appId,
      title,
      x: 140 + offset,
      y: 90 + offset,
      width: 760,
      height: 520,
      minimized: false,
      maximized: false,
      zIndex: z,
      initialUrl: opts?.initialUrl,
      initialTab: opts?.initialTab,
    };
    set((s) => ({ windows: [...s.windows, win], topZ: z }));
    return win.id;
  },

  closeWindow: (id) => set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),

  focusWindow: (id) => {
    const z = get().topZ + 1;
    set((s) => ({
      topZ: z,
      windows: s.windows.map((w) => (w.id === id ? { ...w, zIndex: z } : w)),
    }));
  },

  toggleMinimize: (id) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: !w.minimized } : w)) })),

  toggleMaximize: (id) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, maximized: !w.maximized } : w)) })),

  updateBounds: (id, bounds) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, ...bounds } : w)) })),

  hydrate: (windows) => {
    const maxZ = windows.reduce((m, w) => Math.max(m, w.zIndex), 1);
    set({ windows, topZ: maxZ });
  },
}));
