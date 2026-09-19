import { create } from "zustand";
import { DEFAULT_SETTINGS, type DesktopSettings } from "../types";

interface SettingsState extends DesktopSettings {
  update: (patch: Partial<DesktopSettings>) => void;
  hydrate: (settings: DesktopSettings) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULT_SETTINGS,
  update: (patch) => set(patch),
  hydrate: (settings) => set(settings),
}));
