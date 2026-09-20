import { create } from "zustand";
import type { FileSource } from "../types";

export interface PinnedFolder {
  id: string;
  label: string;
  source: FileSource;
  path: string;
  isDir: boolean;
}

export interface FileExplorerCategory {
  id: string;
  name: string;
  folders: PinnedFolder[];
}

interface FileExplorerCategoriesState {
  categories: FileExplorerCategory[];
  addCategory: (name: string) => FileExplorerCategory | null;
  removeCategory: (id: string) => void;
  renameCategory: (id: string, name: string) => void;
  moveCategory: (id: string, direction: -1 | 1) => void;
  pinFolder: (categoryId: string, folder: Omit<PinnedFolder, "id">) => void;
  unpinFolder: (categoryId: string, folderId: string) => void;
  hydrate: (categories: FileExplorerCategory[]) => void;
}

let counter = 0;

export const useFileExplorerCategoriesStore = create<FileExplorerCategoriesState>((set, get) => ({
  categories: [],

  addCategory: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const category: FileExplorerCategory = { id: `cat-${Date.now()}-${counter++}`, name: trimmed, folders: [] };
    set({ categories: [...get().categories, category] });
    return category;
  },

  removeCategory: (id) => set({ categories: get().categories.filter((c) => c.id !== id) }),

  renameCategory: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set({ categories: get().categories.map((c) => (c.id === id ? { ...c, name: trimmed } : c)) });
  },

  moveCategory: (id, direction) => {
    const categories = [...get().categories];
    const index = categories.findIndex((c) => c.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= categories.length) return;
    [categories[index], categories[target]] = [categories[target], categories[index]];
    set({ categories });
  },

  pinFolder: (categoryId, folder) =>
    set({
      categories: get().categories.map((c) =>
        c.id === categoryId
          ? { ...c, folders: [...c.folders, { ...folder, id: `pin-${Date.now()}-${counter++}` }] }
          : c
      ),
    }),

  unpinFolder: (categoryId, folderId) =>
    set({
      categories: get().categories.map((c) =>
        c.id === categoryId ? { ...c, folders: c.folders.filter((f) => f.id !== folderId) } : c
      ),
    }),

  hydrate: (categories) => set({ categories: Array.isArray(categories) ? categories : [] }),
}));
