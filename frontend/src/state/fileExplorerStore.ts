import { create } from "zustand";
import type { FileSource } from "../types";

export interface ExplorerTab {
  id: string;
  source: FileSource;
  path: string;
}

interface FileExplorerWindowState {
  tabs: ExplorerTab[];
  activeTabId: string;
}

interface FileExplorerStoreState {
  byWindow: Record<string, FileExplorerWindowState>;
  ensureWindow: (windowId: string, initial?: { source: FileSource; path: string }) => void;
  addTab: (windowId: string) => void;
  closeTab: (windowId: string, tabId: string) => void;
  setActiveTab: (windowId: string, tabId: string) => void;
  navigate: (windowId: string, tabId: string, source: FileSource, path: string) => void;
  removeWindow: (windowId: string) => void;
  hydrate: (byWindow: Record<string, FileExplorerWindowState>) => void;
}

let counter = 0;
function newTabId() {
  return `fe-tab-${Date.now()}-${counter++}`;
}

function makeTab(source: FileSource = "local", path = ""): ExplorerTab {
  return { id: newTabId(), source, path };
}

export const useFileExplorerStore = create<FileExplorerStoreState>((set, get) => ({
  byWindow: {},

  ensureWindow: (windowId, initial) => {
    if (get().byWindow[windowId]) return;
    const tab = makeTab(initial?.source, initial?.path);
    set((s) => ({ byWindow: { ...s.byWindow, [windowId]: { tabs: [tab], activeTabId: tab.id } } }));
  },

  addTab: (windowId) => {
    set((s) => {
      const win = s.byWindow[windowId];
      const current = win?.tabs.find((t) => t.id === win.activeTabId);
      const tab = makeTab(current?.source ?? "local", current?.path ?? "");
      const tabs = win ? [...win.tabs, tab] : [tab];
      return { byWindow: { ...s.byWindow, [windowId]: { tabs, activeTabId: tab.id } } };
    });
  },

  closeTab: (windowId, tabId) => {
    set((s) => {
      const win = s.byWindow[windowId];
      if (!win || win.tabs.length <= 1) return s;
      const remaining = win.tabs.filter((t) => t.id !== tabId);
      const activeTabId = win.activeTabId === tabId ? remaining[remaining.length - 1].id : win.activeTabId;
      return { byWindow: { ...s.byWindow, [windowId]: { tabs: remaining, activeTabId } } };
    });
  },

  setActiveTab: (windowId, tabId) => {
    set((s) => {
      const win = s.byWindow[windowId];
      if (!win) return s;
      return { byWindow: { ...s.byWindow, [windowId]: { ...win, activeTabId: tabId } } };
    });
  },

  navigate: (windowId, tabId, source, path) => {
    set((s) => {
      const win = s.byWindow[windowId];
      if (!win) return s;
      const tabs = win.tabs.map((t) => (t.id === tabId ? { ...t, source, path } : t));
      return { byWindow: { ...s.byWindow, [windowId]: { ...win, tabs } } };
    });
  },

  removeWindow: (windowId) => {
    set((s) => {
      const { [windowId]: _removed, ...rest } = s.byWindow;
      return { byWindow: rest };
    });
  },

  hydrate: (byWindow) => set({ byWindow }),
}));
