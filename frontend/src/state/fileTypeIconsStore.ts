import { create } from "zustand";
import { DEFAULT_FILE_TYPE_ICONS, type FileTypeCategory } from "../constants/icons";
import type { IconOverride } from "./appIconsStore";

interface FileTypeIconsState {
  overrides: Partial<Record<FileTypeCategory, IconOverride>>;
  setOverride: (category: FileTypeCategory, value: IconOverride) => void;
  hydrate: (overrides: Partial<Record<FileTypeCategory, IconOverride>>) => void;
}

export const useFileTypeIconsStore = create<FileTypeIconsState>((set, get) => ({
  overrides: {},

  setOverride: (category, value) => set({ overrides: { ...get().overrides, [category]: value } }),

  hydrate: (overrides) => set({ overrides: overrides && typeof overrides === "object" ? overrides : {} }),
}));

export function useFileTypeIcon(category: FileTypeCategory): IconOverride {
  const override = useFileTypeIconsStore((s) => s.overrides[category]);
  return override && (override.icon || override.iconUrl) ? override : { icon: DEFAULT_FILE_TYPE_ICONS[category] };
}
