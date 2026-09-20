import { create } from "zustand";
import { DEFAULT_APP_ICONS, type AppMetaId } from "../constants/icons";

export interface IconOverride {
  icon?: string;
  iconUrl?: string;
}

interface AppIconsState {
  overrides: Partial<Record<AppMetaId, IconOverride>>;
  setOverride: (id: AppMetaId, value: IconOverride) => void;
  hydrate: (overrides: Partial<Record<AppMetaId, IconOverride>>) => void;
}

export const useAppIconsStore = create<AppIconsState>((set, get) => ({
  overrides: {},

  setOverride: (id, value) => set({ overrides: { ...get().overrides, [id]: value } }),

  hydrate: (overrides) => set({ overrides: overrides && typeof overrides === "object" ? overrides : {} }),
}));

/** Resolved icon for an app: the user's override if set, else the default
 * emoji - use this everywhere an app icon is rendered instead of a
 * hardcoded literal, so a change in Paramètres applies everywhere at once. */
export function useAppIcon(id: AppMetaId): IconOverride {
  const override = useAppIconsStore((s) => s.overrides[id]);
  return override && (override.icon || override.iconUrl) ? override : { icon: DEFAULT_APP_ICONS[id] };
}
