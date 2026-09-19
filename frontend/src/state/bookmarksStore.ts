import { create } from "zustand";
import { api } from "../api/client";
import type { Bookmark } from "../types";

interface BookmarksState {
  bookmarks: Bookmark[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (title: string, url: string, iconUrl?: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useBookmarksStore = create<BookmarksState>((set, get) => ({
  bookmarks: [],
  loaded: false,

  load: async () => {
    try {
      const bookmarks = await api.get<Bookmark[]>("/bookmarks");
      set({ bookmarks, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  add: async (title, url, iconUrl) => {
    const bookmark = await api.post<Bookmark>("/bookmarks", { title, url, icon_url: iconUrl });
    set({ bookmarks: [...get().bookmarks, bookmark] });
  },

  remove: async (id) => {
    await api.del(`/bookmarks/${id}`);
    set({ bookmarks: get().bookmarks.filter((b) => b.id !== id) });
  },
}));
