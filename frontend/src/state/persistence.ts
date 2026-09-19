import { api, ApiError } from "../api/client";
import { DEFAULT_SETTINGS, type DesktopSettings, type WindowInstance } from "../types";
import { useBrowserStore } from "./browserStore";
import { useSettingsStore } from "./settingsStore";
import { useWindowStore } from "./windowStore";

interface DesktopBlob {
  windows: WindowInstance[];
  browserTabs: Record<string, { tabs: { id: string; title: string; address: string; src: string | null }[]; activeTabId: string }>;
  settings: DesktopSettings;
}

export function collectDesktopState(): DesktopBlob {
  const windows = useWindowStore.getState().windows;
  const openIds = new Set(windows.map((w) => w.id));
  const allTabs = useBrowserStore.getState().byWindow;
  const browserTabs = Object.fromEntries(Object.entries(allTabs).filter(([id]) => openIds.has(id)));

  return {
    windows,
    browserTabs,
    settings: {
      wallpaper: useSettingsStore.getState().wallpaper,
      accent: useSettingsStore.getState().accent,
      mailUrl: useSettingsStore.getState().mailUrl,
      calendarUrl: useSettingsStore.getState().calendarUrl,
    },
  };
}

export async function saveDesktopState(): Promise<void> {
  try {
    await api.put("/desktop/state", { state: collectDesktopState() });
  } catch {
    // best-effort: losing the session snapshot is not worth surfacing an error to the user
  }
}

export async function restoreDesktopState(): Promise<void> {
  try {
    const res = await api.get<{ state: Partial<DesktopBlob> }>("/desktop/state");
    const state = res.state || {};

    if (Array.isArray(state.windows) && state.windows.length > 0) {
      useWindowStore.getState().hydrate(state.windows);
    }
    if (state.browserTabs && typeof state.browserTabs === "object") {
      useBrowserStore.getState().hydrate(state.browserTabs);
    }
    if (state.settings) {
      useSettingsStore.getState().hydrate({ ...DEFAULT_SETTINGS, ...state.settings });
    }
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
  }
}
