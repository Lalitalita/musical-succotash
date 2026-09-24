import { api, ApiError } from "../api/client";
import type { AppMetaId, FileTypeCategory } from "../constants/icons";
import { DEFAULT_SETTINGS, type AppId, type BrowserTab, type DesktopItem, type DesktopSettings, type WindowInstance } from "../types";
import { type IconOverride, useAppIconsStore } from "./appIconsStore";
import { useBrowserStore } from "./browserStore";
import { useCustomAppsStore } from "./customAppsStore";
import { useDesktopItemsStore } from "./desktopItemsStore";
import { useFileExplorerCategoriesStore, type FileExplorerCategory } from "./fileExplorerCategoriesStore";
import { useFileExplorerStore, type ExplorerTab } from "./fileExplorerStore";
import { useFileTypeIconsStore } from "./fileTypeIconsStore";
import { type BankIcon, useIconBankStore } from "./iconBankStore";
import { usePinnedAppsStore } from "./pinnedAppsStore";
import { useSettingsStore } from "./settingsStore";
import { useWindowStore } from "./windowStore";
import type { CustomApp } from "../types";

interface DesktopBlob {
  windows: WindowInstance[];
  browserTabs: Record<string, { tabs: BrowserTab[]; activeTabId: string }>;
  settings: DesktopSettings;
  desktopItems: DesktopItem[];
  appIcons: Partial<Record<AppMetaId, IconOverride>>;
  fileTypeIcons: Partial<Record<FileTypeCategory, IconOverride>>;
  pinnedApps: AppId[];
  customIcons: BankIcon[];
  fileExplorerCategories: FileExplorerCategory[];
  fileExplorerTabs: Record<string, { tabs: ExplorerTab[]; activeTabId: string }>;
  customApps: CustomApp[];
}

export function collectDesktopState(): DesktopBlob {
  const windows = useWindowStore.getState().windows;
  const openIds = new Set(windows.map((w) => w.id));
  const allTabs = useBrowserStore.getState().byWindow;
  const browserTabs = Object.fromEntries(Object.entries(allTabs).filter(([id]) => openIds.has(id)));
  const allExplorerTabs = useFileExplorerStore.getState().byWindow;
  const fileExplorerTabs = Object.fromEntries(Object.entries(allExplorerTabs).filter(([id]) => openIds.has(id)));

  return {
    windows,
    browserTabs,
    fileExplorerTabs,
    settings: {
      wallpaper: useSettingsStore.getState().wallpaper,
      wallpaperColor: useSettingsStore.getState().wallpaperColor,
      wallpaperImageUrl: useSettingsStore.getState().wallpaperImageUrl,
      accent: useSettingsStore.getState().accent,
      mailUrl: useSettingsStore.getState().mailUrl,
      calendarUrl: useSettingsStore.getState().calendarUrl,
    },
    desktopItems: useDesktopItemsStore.getState().items,
    appIcons: useAppIconsStore.getState().overrides,
    fileTypeIcons: useFileTypeIconsStore.getState().overrides,
    pinnedApps: usePinnedAppsStore.getState().pinned,
    customIcons: useIconBankStore.getState().customIcons,
    fileExplorerCategories: useFileExplorerCategoriesStore.getState().categories,
    customApps: useCustomAppsStore.getState().apps,
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
    if (state.fileExplorerTabs && typeof state.fileExplorerTabs === "object") {
      useFileExplorerStore.getState().hydrate(state.fileExplorerTabs);
    }
    if (state.settings) {
      useSettingsStore.getState().hydrate({ ...DEFAULT_SETTINGS, ...state.settings });
    }
    if (Array.isArray(state.desktopItems)) {
      useDesktopItemsStore.getState().hydrate(state.desktopItems);
    }
    if (state.appIcons) {
      useAppIconsStore.getState().hydrate(state.appIcons);
    }
    if (state.fileTypeIcons) {
      useFileTypeIconsStore.getState().hydrate(state.fileTypeIcons);
    }
    if (Array.isArray(state.pinnedApps)) {
      usePinnedAppsStore.getState().hydrate(state.pinnedApps);
    }
    if (Array.isArray(state.customIcons)) {
      useIconBankStore.getState().hydrate(state.customIcons);
    }
    if (Array.isArray(state.fileExplorerCategories)) {
      useFileExplorerCategoriesStore.getState().hydrate(state.fileExplorerCategories);
    }
    if (Array.isArray(state.customApps)) {
      useCustomAppsStore.getState().hydrate(state.customApps);
    }
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
  }
}
