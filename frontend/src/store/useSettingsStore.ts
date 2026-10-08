import { create } from "zustand";
import { getApiBaseUrl } from "@/lib/api";
import { getContrastTextColor, getMutedTextColor } from "@/lib/utils";
import axios from "axios";

export interface PublicSettings {
  site_info: {
    site_name: string;
    site_tagline: string;
    site_url: string;
    logo_url: string;
    allow_registration: boolean;
    default_theme: string;
    maintenance_mode: boolean;
  };
  theme_settings: {
    primary_color: string;
    card_bg: string;
    nav_bg: string;
    main_bg: string;
    border_color: string;
    outgoing_bubble: string;
    outgoing_text?: string;
    incoming_bubble: string;
    font_family: string;
    border_radius: string;
  };
  media_limits: {
    max_file_size_mb: number;
    allowed_extensions: string[];
    max_voice_seconds: number;
    enable_compression: boolean;
  };
  chat_settings: {
    allow_message_edit: boolean;
    edit_time_limit_minutes: number;
    allow_delete_for_all: boolean;
    delete_time_limit_minutes: number;
    disappearing_messages_default: number;
    enable_link_previews: boolean;
    enable_social_embeds: boolean;
    banned_words?: string[];
  };
  call_settings: {
    enable_audio_calls: boolean;
    enable_video_calls: boolean;
    enable_screen_share: boolean;
    max_call_duration_minutes: number;
  };
  security_settings?: {
    max_messages_per_second?: number;
    max_messages_per_minute?: number;
    require_strong_passwords?: boolean;
    lockout_attempts?: number;
    session_timeout_days?: number;
    inactivity_logout_enabled?: boolean;
    inactivity_timeout_minutes?: number;
    inactivity_redirect_url?: string;
    inactivity_schedule_enabled?: boolean;
    inactivity_weekday_start?: string;
    inactivity_weekday_end?: string;
    inactivity_weekend_full?: boolean;
  };
}

export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  site_info: {
    site_name: "Aura",
    site_tagline: "",
    site_url: "",
    logo_url: "",
    allow_registration: false, // Güvenlik Kuralı: Kanıtlanana kadar kapalı (Fail-Closed)
    default_theme: "dark",
    maintenance_mode: false,
  },
  theme_settings: {
    primary_color: "#6366F1",
    card_bg: "#11141E",
    nav_bg: "#0B0D14",
    main_bg: "#090A0F",
    border_color: "#1E2333",
    outgoing_bubble: "#4F46E5",
    incoming_bubble: "#181C28",
    font_family: "Inter",
    border_radius: "rounded-2xl",
  },
  media_limits: {
    max_file_size_mb: 50,
    allowed_extensions: [".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm", ".mov", ".pdf", ".zip", ".docx", ".txt"],
    max_voice_seconds: 300,
    enable_compression: true,
  },
  chat_settings: {
    allow_message_edit: true,
    edit_time_limit_minutes: 15,
    allow_delete_for_all: true,
    delete_time_limit_minutes: 60,
    disappearing_messages_default: 0,
    enable_link_previews: true,
    enable_social_embeds: true,
    banned_words: [],
  },
  call_settings: {
    enable_audio_calls: true,
    enable_video_calls: true,
    enable_screen_share: true,
    max_call_duration_minutes: 120,
  },
  security_settings: {
    max_messages_per_second: 5,
    max_messages_per_minute: 60,
    require_strong_passwords: true, // Guvenlik Kurali: Ayar DB'den kesinlesene kadar guclu sifre aktiftir (Fail-Closed)
    lockout_attempts: 5,
    session_timeout_days: 30,
    inactivity_logout_enabled: false,
    inactivity_timeout_minutes: 15,
    inactivity_redirect_url: "https://www.google.com",
    inactivity_schedule_enabled: false,
    inactivity_weekday_start: "17:30",
    inactivity_weekday_end: "08:30",
    inactivity_weekend_full: true,
  },
};

function hexToRgba(hex: string, alpha: number = 1): string {
  let c = hex.replace("#", "").trim();
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const num = parseInt(c, 16);
  if (isNaN(num) || c.length !== 6) return `rgba(99, 102, 241, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const applyThemeToDocument = (
  themeOrPrimary:
    | (Partial<PublicSettings["theme_settings"]> & { outgoing_text?: string })
    | string,
  card_bg?: string,
  border_color?: string,
  outgoing_bubble?: string,
  incoming_bubble?: string,
  main_bg?: string
) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  let theme: Partial<PublicSettings["theme_settings"]> & { outgoing_text?: string };

  if (typeof themeOrPrimary === "string") {
    theme = {
      primary_color: themeOrPrimary,
      card_bg,
      border_color,
      outgoing_bubble,
      incoming_bubble,
      main_bg,
    };
  } else {
    theme = themeOrPrimary || {};
  }

  if (theme.primary_color) {
    root.style.setProperty("--accent", theme.primary_color);
    root.style.setProperty("--primary", theme.primary_color);
    root.style.setProperty("--accent-hover", theme.primary_color);
    
    // Vurgu rengine göre kontrast metin rengi (beyaz veya koyu)
    const accentTextColor = getContrastTextColor(theme.primary_color);
    root.style.setProperty("--accent-text", accentTextColor);

    // Vurgu renginin gölge ve rgb değerleri
    root.style.setProperty("--accent-shadow", hexToRgba(theme.primary_color, 0.35));
    const pureRgba = hexToRgba(theme.primary_color, 1);
    const rgbOnly = pureRgba.replace("rgba(", "").replace(", 1)", "");
    root.style.setProperty("--accent-rgb", rgbOnly);
  }
  if (theme.card_bg) {
    root.style.setProperty("--card", theme.card_bg);
  }
  if (theme.border_color) {
    root.style.setProperty("--border", theme.border_color);
  }
  if (theme.outgoing_bubble) {
    root.style.setProperty("--outgoing-bubble", theme.outgoing_bubble);
    // Metin rengini belirle: "auto" ise veya belirtilmemişse balona göre akıllı kontrast uygula
    const textColor =
      theme.outgoing_text && theme.outgoing_text !== "auto"
        ? theme.outgoing_text
        : getContrastTextColor(theme.outgoing_bubble);

    root.style.setProperty("--outgoing-text", textColor);
    const mutedColor = getMutedTextColor(theme.outgoing_bubble, textColor);
    root.style.setProperty("--outgoing-text-muted", mutedColor);
  } else if (theme.outgoing_text && theme.outgoing_text !== "auto") {
    root.style.setProperty("--outgoing-text", theme.outgoing_text);
    const mutedColor = getMutedTextColor(undefined, theme.outgoing_text);
    root.style.setProperty("--outgoing-text-muted", mutedColor);
  }
  if (theme.incoming_bubble) {
    root.style.setProperty("--incoming-bubble", theme.incoming_bubble);
    const incomingText = getContrastTextColor(theme.incoming_bubble);
    root.style.setProperty("--incoming-text", incomingText);
    const incomingMuted = getMutedTextColor(theme.incoming_bubble, incomingText);
    root.style.setProperty("--incoming-text-muted", incomingMuted);
  }
  if (theme.main_bg) {
    root.style.setProperty("--background", theme.main_bg);
  }
};

interface SettingsStore {
  settings: PublicSettings;
  isLoaded: boolean;
  isLoading: boolean;
  fetchSettings: () => Promise<void>;
  updateSettingLocally: (key: string, value: any) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: DEFAULT_PUBLIC_SETTINGS,
  isLoaded: false,
  isLoading: false,

  fetchSettings: async () => {
    set({ isLoading: true });
    try {
      const url = `${getApiBaseUrl()}/public/settings`;
      const res = await axios.get<PublicSettings>(url, { withCredentials: true, timeout: 5000 });
      if (res.data && res.data.site_info) {
        set({ settings: res.data, isLoaded: true, isLoading: false });
        if (typeof window !== "undefined") {
          localStorage.removeItem("aura_user_theme");
        }
        if (res.data.theme_settings) {
          applyThemeToDocument(res.data.theme_settings);
        }
        if (res.data.security_settings && typeof window !== "undefined") {
          localStorage.setItem("aura_security_settings", JSON.stringify(res.data.security_settings));
        }
        if (res.data.site_info.site_name && typeof document !== "undefined") {
          document.title = res.data.site_info.site_name;
        }
      }
    } catch (e) {
      console.warn("Aura sistem parametreleri yüklenemedi:", e);
      set({ isLoading: false, isLoaded: true });
    }
  },

  updateSettingLocally: (key: string, value: any) => {
    set((state) => {
      const updated = { ...state.settings, [key]: value };
      if (key === "theme_settings") {
        applyThemeToDocument(value);
      }
      if (key === "security_settings" && typeof window !== "undefined") {
        localStorage.setItem("aura_security_settings", JSON.stringify(value));
      }
      return { settings: updated };
    });
  },
}));
