import { create } from "zustand";
import { api } from "@/lib/api";
import { compressAvatar } from "@/lib/compression";
import { soundEffects } from "@/lib/sounds";

export interface User {
  id: string;
  username: string;
  display_name: string;
  email: string;
  avatar_url: string;
  bio: string;
  role?: string;
  is_banned?: boolean;
  ban_reason?: string;
  online_status: number;
  last_seen_at: string;
  panic_login?: string;
  has_panic_password?: boolean;
  panic_redirect_url?: string;
  security_number_salt?: string;
  token_version?: number;
  privacy_settings: {
    read_receipts: boolean;
    last_seen: boolean;
    allow_calls: boolean;
    sound_alerts?: boolean;
  };
  created_at: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  checkAuth: () => Promise<boolean>;
  login: (login: string, pass: string) => Promise<{ user: User; is_panic_mode?: boolean; panic_redirect_url?: string }>;
  register: (username: string, displayName: string, email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (displayName: string, bio: string) => Promise<void>;
  uploadAvatar: (file: File) => Promise<string>;
  updatePrivacy: (settings: Partial<User["privacy_settings"]>) => Promise<void>;
  setPanicPassword: (login: string, password: string, redirectUrl: string) => Promise<{ has_panic_password: boolean; panic_login: string; panic_redirect_url: string }>;
  killSessions: () => Promise<void>;
  regenerateSecurityCode: () => Promise<string>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  checkAuth: async () => {
    try {
      set({ isLoading: true });
      const res = await api.get<User>("/auth/me");
      const user = res.data;
      if (user?.privacy_settings?.sound_alerts !== undefined) {
        soundEffects.setSoundEnabled(user.privacy_settings.sound_alerts);
      }
      set({ user, isAuthenticated: true, isLoading: false });
      return true;
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
      return false;
    }
  },

  login: async (login, password) => {
    const res = await api.post<{ user: User; is_panic_mode?: boolean; panic_redirect_url?: string }>("/auth/login", { login, password });
    const user = res.data.user;
    if (user?.privacy_settings?.sound_alerts !== undefined) {
      soundEffects.setSoundEnabled(user.privacy_settings.sound_alerts);
    }
    set({ user, isAuthenticated: true });
    return res.data;
  },

  register: async (username, displayName, email, password) => {
    const res = await api.post<{ user: User }>("/auth/register", {
      username,
      display_name: displayName,
      email,
      password,
    });
    const user = res.data.user;
    if (user?.privacy_settings?.sound_alerts !== undefined) {
      soundEffects.setSoundEnabled(user.privacy_settings.sound_alerts);
    }
    set({ user, isAuthenticated: true });
  },

  logout: async () => {
    try {
      // 1. WebSocket'i manuel olarak kapat ve otomatik yeniden bağlanmasını engelle
      const { useSocketStore } = await import("./useSocketStore");
      useSocketStore.getState().disconnect();

      // 2. ChatStore durumunu sıfırla (aktif sohbeti ve mesajları temizle)
      const { useChatStore } = await import("./useChatStore");
      useChatStore.getState().reset();

      // 3. Arama durumunu sıfırla
      const { useCallStore } = await import("./useCallStore");
      useCallStore.getState().resetCall();

      // 4. Sunucuya logout isteği gönder (sunucu da soketi kapatıp offline yayınlar)
      await api.post("/auth/logout");
    } catch (err) {
      console.error("Çıkış hatası:", err);
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },

  updateProfile: async (displayName, bio) => {
    const res = await api.put<User>("/users/profile", { display_name: displayName, bio });
    set({ user: res.data });
  },

  uploadAvatar: async (file: File) => {
    const compressed = await compressAvatar(file);
    const formData = new FormData();
    formData.append("avatar", compressed);
    const res = await api.post<{ avatar_url: string }>("/users/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const currentUser = get().user;
    if (currentUser) {
      set({ user: { ...currentUser, avatar_url: res.data.avatar_url } });
    }
    return res.data.avatar_url;
  },

  updatePrivacy: async (settings) => {
    if (settings.sound_alerts !== undefined) {
      soundEffects.setSoundEnabled(settings.sound_alerts);
    }
    const res = await api.patch<{ privacy_settings: User["privacy_settings"] }>("/users/privacy", settings);
    const currentUser = get().user;
    if (currentUser) {
      set({
        user: {
          ...currentUser,
          privacy_settings: res.data.privacy_settings,
        },
      });
    }
  },

  setPanicPassword: async (panic_login, panic_password, panic_redirect_url) => {
    const res = await api.post<{ message: string; has_panic_password: boolean; panic_login: string; panic_redirect_url: string }>("/users/panic-password", {
      panic_login,
      panic_password,
      panic_redirect_url,
    });
    const currentUser = get().user;
    if (currentUser) {
      set({
        user: {
          ...currentUser,
          has_panic_password: res.data.has_panic_password,
          panic_login: res.data.panic_login,
          panic_redirect_url: res.data.panic_redirect_url,
        },
      });
    }
    return res.data;
  },

  killSessions: async () => {
    const res = await api.post<{ message: string; token_version: number; access_token?: string }>("/users/kill-sessions");
    const currentUser = get().user;
    if (currentUser) {
      set({
        user: {
          ...currentUser,
          token_version: res.data?.token_version || ((currentUser.token_version || 1) + 1),
        },
      });
    }
  },

  regenerateSecurityCode: async () => {
    const res = await api.post<{ message: string; security_number_salt: string }>("/users/regenerate-security-code");
    const currentUser = get().user;
    if (currentUser) {
      set({
        user: {
          ...currentUser,
          security_number_salt: res.data.security_number_salt,
        },
      });
    }
    return res.data.security_number_salt;
  },
}));
