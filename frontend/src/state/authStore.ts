import { create } from "zustand";
import { api, ApiError } from "../api/client";
import type { Me } from "../types";
import { restoreDesktopState, saveDesktopState } from "./persistence";

type AuthStage = "checking" | "login" | "mfa" | "authenticated";

interface AuthState {
  stage: AuthStage;
  me: Me | null;
  mfaToken: string | null;
  error: string | null;
  bootstrap: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  verifyMfa: (rawCode: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  updateProfile: (patch: { display_name?: string; avatar_url?: string }) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  stage: "checking",
  me: null,
  mfaToken: null,
  error: null,

  bootstrap: async () => {
    try {
      const me = await api.get<Me>("/auth/me");
      set({ me, stage: "authenticated" });
      await restoreDesktopState();
    } catch {
      set({ stage: "login" });
    }
  },

  login: async (username, password) => {
    set({ error: null });
    try {
      const res = await api.post<{ mfa_required: boolean; mfa_token: string }>("/auth/login", {
        username,
        password,
      });
      set({ mfaToken: res.mfa_token, stage: "mfa" });
    } catch (e) {
      set({ error: e instanceof ApiError ? e.message : "Connexion impossible" });
    }
  },

  verifyMfa: async (rawCode) => {
    const { mfaToken } = get();
    if (!mfaToken) return;
    set({ error: null });
    try {
      await api.post("/auth/mfa", { mfa_token: mfaToken, code: rawCode });
      const me = await api.get<Me>("/auth/me");
      set({ me, stage: "authenticated", mfaToken: null });
      await restoreDesktopState();
    } catch (e) {
      set({ error: e instanceof ApiError ? e.message : "Code invalide" });
    }
  },

  logout: async () => {
    await saveDesktopState();
    await api.post("/auth/logout").catch(() => undefined);
    set({ me: null, stage: "login", mfaToken: null });
  },

  clearError: () => set({ error: null }),

  updateProfile: async (patch) => {
    const me = await api.patch<Me>("/auth/me", patch);
    set({ me });
  },
}));
