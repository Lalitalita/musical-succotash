import { create } from "zustand";
import type { BrowserTab } from "../types";
import { normalizeUrl, viewSrc } from "../utils/url";

interface BrowserWindowState {
  tabs: BrowserTab[];
  activeTabId: string;
}

interface BrowserStoreState {
  byWindow: Record<string, BrowserWindowState>;
  ensureWindow: (windowId: string, initialUrl?: string) => void;
  addTab: (windowId: string, address?: string) => void;
  closeTab: (windowId: string, tabId: string) => void;
  setActiveTab: (windowId: string, tabId: string) => void;
  navigate: (windowId: string, tabId: string, addressInput: string) => void;
  removeWindow: (windowId: string) => void;
  hydrate: (byWindow: Record<string, BrowserWindowState>) => void;
}

let counter = 0;
function newTabId() {
  return `tab-${Date.now()}-${counter++}`;
}

function makeTab(address = ""): BrowserTab {
  const url = address ? normalizeUrl(address) : "";
  return {
    id: newTabId(),
    title: address ? address : "Nouvel onglet",
    address,
    src: url ? viewSrc(url) : null,
  };
}

export const useBrowserStore = create<BrowserStoreState>((set, get) => ({
  byWindow: {},

  ensureWindow: (windowId, initialUrl) => {
    if (get().byWindow[windowId]) return;
    const tab = makeTab(initialUrl);
    set((s) => ({
      byWindow: { ...s.byWindow, [windowId]: { tabs: [tab], activeTabId: tab.id } },
    }));
  },

  addTab: (windowId, address) => {
    const tab = makeTab(address);
    set((s) => {
      const win = s.byWindow[windowId] ?? { tabs: [], activeTabId: "" };
      return {
        byWindow: {
          ...s.byWindow,
          [windowId]: { tabs: [...win.tabs, tab], activeTabId: tab.id },
        },
      };
    });
  },

  closeTab: (windowId, tabId) => {
    set((s) => {
      const win = s.byWindow[windowId];
      if (!win) return s;
      const remaining = win.tabs.filter((t) => t.id !== tabId);
      if (remaining.length === 0) {
        const fresh = makeTab();
        return { byWindow: { ...s.byWindow, [windowId]: { tabs: [fresh], activeTabId: fresh.id } } };
      }
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

  navigate: (windowId, tabId, addressInput) => {
    const url = normalizeUrl(addressInput);
    if (!url) return;
    set((s) => {
      const win = s.byWindow[windowId];
      if (!win) return s;
      const tabs = win.tabs.map((t) =>
        t.id === tabId ? { ...t, address: addressInput, title: addressInput, src: viewSrc(url) } : t
      );
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
