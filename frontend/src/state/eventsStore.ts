import { create } from "zustand";
import { api } from "../api/client";

export interface AgendaEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string | null;
}

interface EventsState {
  events: AgendaEvent[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (title: string, startAt: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useEventsStore = create<EventsState>((set, get) => ({
  events: [],
  loaded: false,

  load: async () => {
    try {
      const events = await api.get<AgendaEvent[]>("/events");
      set({ events, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  add: async (title, startAt) => {
    const event = await api.post<AgendaEvent>("/events", { title, start_at: startAt });
    set({ events: [...get().events, event].sort((a, b) => a.start_at.localeCompare(b.start_at)) });
  },

  remove: async (id) => {
    await api.del(`/events/${id}`);
    set({ events: get().events.filter((e) => e.id !== id) });
  },
}));
