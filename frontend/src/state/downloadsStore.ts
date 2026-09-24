import { create } from "zustand";
import { api } from "../api/client";
import type { Download } from "../types";

interface DownloadsState {
  downloads: Download[];
  loaded: boolean;
  load: () => Promise<void>;
  create: (url: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  downloads: [],
  loaded: false,

  load: async () => {
    try {
      const downloads = await api.get<Download[]>("/downloads");
      set({ downloads, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  create: async (url) => {
    const download = await api.post<Download>("/downloads", { url });
    set({ downloads: [download, ...get().downloads] });
  },

  remove: async (id) => {
    await api.del(`/downloads/${id}`);
    set({ downloads: get().downloads.filter((d) => d.id !== id) });
  },
}));
