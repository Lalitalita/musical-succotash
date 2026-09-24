import { create } from "zustand";
import { api } from "../api/client";
import type { Note, NoteListItem } from "../types";

interface NotesState {
  notes: NoteListItem[];
  loaded: boolean;
  load: () => Promise<void>;
  getNote: (id: string) => Promise<Note>;
  create: () => Promise<Note>;
  update: (id: string, patch: Partial<Pick<Note, "title" | "folder" | "content">>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  loaded: false,

  load: async () => {
    try {
      const notes = await api.get<NoteListItem[]>("/notes");
      set({ notes, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  getNote: (id) => api.get<Note>(`/notes/${id}`),

  create: async () => {
    const note = await api.post<Note>("/notes", { title: "Sans titre", folder: "", content: "" });
    set({ notes: [{ id: note.id, title: note.title, folder: note.folder, updated_at: note.updated_at }, ...get().notes] });
    return note;
  },

  update: async (id, patch) => {
    const note = await api.patch<Note>(`/notes/${id}`, patch);
    set({
      notes: get().notes.map((n) =>
        n.id === id ? { id: note.id, title: note.title, folder: note.folder, updated_at: note.updated_at } : n
      ),
    });
  },

  remove: async (id) => {
    await api.del(`/notes/${id}`);
    set({ notes: get().notes.filter((n) => n.id !== id) });
  },
}));
