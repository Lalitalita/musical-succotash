import { create } from "zustand";
import { api } from "../api/client";
import type { BrowserTab, BrowserTabMode } from "../types";
import { normalizeUrl, viewSrc } from "../utils/url";

/** Full-browser mode gives every tab in "full" mode its own private
 * Chromium+Xvfb+x11vnc trio on the backend (see app/full_browser.py) - much
 * heavier than the old shared-browser design, so it's worth eagerly
 * releasing it as soon as we know the tab no longer needs it instead of
 * waiting out the idle timeout. Best-effort: losing this ping just means
 * the backend's own idle cleanup reclaims it a little later instead. */
function releaseFullBrowserSession(tabId: string): void {
  api.del(`/browser/full/${tabId}`).catch(() => {});
}

interface BrowserWindowState {
  tabs: BrowserTab[];
  activeTabId: string;
}

interface BrowserStoreState {
  byWindow: Record<string, BrowserWindowState>;
  ensureWindow: (windowId: string, initialUrl?: string, initialMode?: BrowserTabMode) => void;
  addTab: (windowId: string, address?: string) => void;
  closeTab: (windowId: string, tabId: string) => void;
  setActiveTab: (windowId: string, tabId: string) => void;
  navigate: (windowId: string, tabId: string, addressInput: string) => void;
  reload: (windowId: string, tabId: string) => void;
  /** Reflects what the remote page itself reports (polled from
   * /browser/full/:tab/meta) back into the tab - e.g. the user followed a
   * link inside the VNC view rather than typing into our address bar. */
  updateTabMeta: (windowId: string, tabId: string, meta: Partial<Pick<BrowserTab, "address" | "title">>) => void;
  setMode: (windowId: string, tabId: string, mode: BrowserTabMode) => void;
  removeWindow: (windowId: string) => void;
  hydrate: (byWindow: Record<string, BrowserWindowState>) => void;
}

let counter = 0;
function newTabId() {
  return `tab-${Date.now()}-${counter++}`;
}

function makeTab(address = "", mode: BrowserTabMode = "text"): BrowserTab {
  const url = address ? normalizeUrl(address) : "";
  return {
    id: newTabId(),
    title: address ? address : "Nouvel onglet",
    address,
    src: mode === "text" && url ? viewSrc(url) : null,
    mode,
  };
}

export const useBrowserStore = create<BrowserStoreState>((set, get) => ({
  byWindow: {},

  ensureWindow: (windowId, initialUrl, initialMode) => {
    if (get().byWindow[windowId]) return;
    const tab = makeTab(initialUrl, initialMode);
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
      if (win.tabs.find((t) => t.id === tabId)?.mode === "full") releaseFullBrowserSession(tabId);
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
      const tabs = win.tabs.map((t) => {
        if (t.id !== tabId) return t;
        if (t.mode === "full") {
          return { ...t, address: addressInput, title: addressInput };
        }
        // Cache-bust so clicking the same bookmark/link twice (or re-typing
        // the same address) always reloads the iframe: an identical `src`
        // string is a no-op for React/the DOM, which otherwise looked like
        // "nothing happens" when navigating back to the current page.
        return { ...t, address: addressInput, title: addressInput, src: viewSrc(url, Date.now()) };
      });
      return { byWindow: { ...s.byWindow, [windowId]: { ...win, tabs } } };
    });
  },

  reload: (windowId, tabId) => {
    set((s) => {
      const win = s.byWindow[windowId];
      if (!win) return s;
      const tabs = win.tabs.map((t) => {
        if (t.id !== tabId || !t.address || t.mode === "full") return t;
        const url = normalizeUrl(t.address);
        return url ? { ...t, src: viewSrc(url, Date.now()) } : t;
      });
      return { byWindow: { ...s.byWindow, [windowId]: { ...win, tabs } } };
    });
  },

  updateTabMeta: (windowId, tabId, meta) => {
    set((s) => {
      const win = s.byWindow[windowId];
      if (!win) return s;
      const tabs = win.tabs.map((t) => (t.id === tabId ? { ...t, ...meta } : t));
      return { byWindow: { ...s.byWindow, [windowId]: { ...win, tabs } } };
    });
  },

  setMode: (windowId, tabId, mode) => {
    const win = get().byWindow[windowId];
    const current = win?.tabs.find((t) => t.id === tabId);
    if (current?.mode === "full" && mode !== "full") releaseFullBrowserSession(tabId);

    set((s) => {
      const win = s.byWindow[windowId];
      if (!win) return s;
      const tabs = win.tabs.map((t) => {
        if (t.id !== tabId) return t;
        if (mode === "text") {
          // The tab's `src` is only ever recomputed by navigate()/reload()
          // while already in text mode, so after browsing around in full
          // mode (which only updates `address`) it would otherwise still
          // point at whatever page was last loaded in text mode - looking
          // like switching modes "jumps back" to an old URL.
          const url = t.address ? normalizeUrl(t.address) : null;
          return { ...t, mode, src: url ? viewSrc(url, Date.now()) : t.src };
        }
        return { ...t, mode };
      });
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
