import { create } from "zustand";
import { api } from "../api/client";

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  is_admin: boolean;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface AdminUserCreated {
  user: AdminUser;
  generated_password: string | null;
  totp_secret: string | null;
  totp_uri: string | null;
}

interface AdminUsersState {
  users: AdminUser[];
  loaded: boolean;
  lastCreated: AdminUserCreated | null;
  load: () => Promise<void>;
  create: (username: string, email: string, isAdmin: boolean, password?: string) => Promise<void>;
  update: (
    id: string,
    patch: { email?: string; is_admin?: boolean; password?: string; reset_totp?: boolean }
  ) => Promise<AdminUserCreated>;
  remove: (id: string) => Promise<void>;
  dismissLastCreated: () => void;
}

export const useAdminUsersStore = create<AdminUsersState>((set, get) => ({
  users: [],
  loaded: false,
  lastCreated: null,

  load: async () => {
    const users = await api.get<AdminUser[]>("/admin/users");
    set({ users, loaded: true });
  },

  create: async (username, email, isAdmin, password) => {
    const created = await api.post<AdminUserCreated>("/admin/users", {
      username,
      email,
      is_admin: isAdmin,
      password: password || undefined,
    });
    set({ users: [...get().users, created.user], lastCreated: created });
  },

  update: async (id, patch) => {
    const result = await api.patch<AdminUserCreated>(`/admin/users/${id}`, patch);
    set({ users: get().users.map((u) => (u.id === id ? result.user : u)) });
    if (result.totp_secret) set({ lastCreated: result });
    return result;
  },

  remove: async (id) => {
    await api.del(`/admin/users/${id}`);
    set({ users: get().users.filter((u) => u.id !== id) });
  },

  dismissLastCreated: () => set({ lastCreated: null }),
}));
