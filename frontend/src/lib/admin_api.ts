// admin_api.ts - Yönetim Paneli & Sistem Parametreleri API İstemcisi

import { api } from "./api";
import { User } from "@/store/useAuthStore";

export interface SystemSettings {
  site_info: {
    site_name: string;
    site_tagline: string;
    site_url: string;
    logo_url: string;
    allow_registration: boolean;
    default_theme: string;
    maintenance_mode: boolean;
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
  };
  call_settings: {
    enable_audio_calls: boolean;
    enable_video_calls: boolean;
    enable_screen_share: boolean;
    max_call_duration_minutes: number;
  };
  security_settings: {
    max_messages_per_second: number;
    max_messages_per_minute: number;
    require_strong_passwords: boolean;
    lockout_attempts: number;
    session_timeout_days: number;
    inactivity_logout_enabled?: boolean;
    inactivity_timeout_minutes?: number;
    inactivity_redirect_url?: string;
    inactivity_schedule_enabled?: boolean;
    inactivity_weekday_start?: string;
    inactivity_weekday_end?: string;
    inactivity_weekend_full?: boolean;
  };
  notification_settings: {
    enable_web_push: boolean;
    enable_sound_alerts: boolean;
    vapid_public_key: string;
  };
  theme_settings?: {
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
}

export interface AdminUsersResponse {
  users: User[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminStatsResponse {
  total_users: number;
  online_users: number;
  banned_users: number;
  total_messages: number;
  total_media: number;
  total_calls: number;
  total_call_seconds: number;
  system_health: {
    postgres: string;
    redis: string;
    livekit: string;
    minio: string;
    goroutines: number;
    allocated_ram_mb: number;
    sys_ram_mb: number;
    num_gc: number;
  };
}

export interface DetailedHealthResponse {
  postgres: { status: string; latency_ms: number };
  redis: { status: string; latency_ms: number };
  minio: { status: string; latency_ms: number };
  livekit: { status: string; url: string };
  uptime_seconds: number;
  uptime_formatted: string;
  active_ws_connections: number;
  active_online_users: number;
  goroutines: number;
  memory: {
    alloc_mb: number;
    sys_mb: number;
    heap_alloc_mb: number;
    heap_inuse_mb: number;
    num_gc: number;
  };
}

export interface StorageBucketStat {
  bucket_name: string;
  total_bytes: number;
  total_objects: number;
  total_mb: number;
}

export interface StorageBreakdownResponse {
  avatars?: StorageBucketStat;
  media?: StorageBucketStat;
  voice?: StorageBucketStat;
  files?: StorageBucketStat;
  total: {
    total_bytes: number;
    total_objects: number;
    total_mb: number;
    total_gb: number;
  };
  cached?: boolean;
}

export interface ActiveCallTelemetry {
  call_id: string;
  conversation_id: string;
  call_type: string;
  status: string;
  started_at?: string;
  elapsed_seconds: number;
  caller_name: string;
  receiver_name: string;
}

export interface ActiveCallsResponse {
  active_calls: ActiveCallTelemetry[];
  count: number;
}

export interface AdminAccessLog {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  ip_address: string;
  user_agent: string;
  device_info: string;
  created_at: string;
}

export interface AdminSecurityLog {
  id: string;
  event_type: string;
  attempted_username: string;
  ip_address: string;
  user_agent: string;
  device_info: string;
  details: string;
  severity: string;
  created_at: string;
}

export interface AdminSecurityStats {
  total_logs: number;
  last_24h_logs: number;
  unique_ips: number;
  top_target_username: string;
}

export const adminApi = {
  getSettings: async (): Promise<SystemSettings> => {
    const res = await api.get<SystemSettings>("/admin/settings");
    return res.data;
  },

  updateSetting: async (key: string, value: any): Promise<void> => {
    await api.put("/admin/settings", { key, value });
  },

  getUsers: async (params?: {
    search?: string;
    role?: string;
    banned?: string;
    limit?: number;
    offset?: number;
  }): Promise<AdminUsersResponse> => {
    const res = await api.get<AdminUsersResponse>("/admin/users", { params });
    return res.data;
  },

  updateUser: async (
    id: string,
    data: {
      display_name?: string;
      username?: string;
      email?: string;
      password?: string;
      role?: string;
      is_banned?: boolean;
      ban_reason?: string;
    }
  ): Promise<void> => {
    await api.put(`/admin/users/${id}`, data);
  },

  deleteUser: async (id: string): Promise<void> => {
    await api.delete(`/admin/users/${id}`);
  },

  getStats: async (): Promise<AdminStatsResponse> => {
    const res = await api.get<AdminStatsResponse>("/admin/stats");
    return res.data;
  },

  getDetailedHealth: async (): Promise<DetailedHealthResponse> => {
    const res = await api.get<DetailedHealthResponse>("/admin/health-detailed");
    return res.data;
  },

  getStorageBreakdown: async (): Promise<StorageBreakdownResponse> => {
    const res = await api.get<StorageBreakdownResponse>("/admin/storage-breakdown");
    return res.data;
  },

  getActiveCalls: async (): Promise<ActiveCallsResponse> => {
    const res = await api.get<ActiveCallsResponse>("/admin/active-calls");
    return res.data;
  },

  getAccessLogs: async (limit: number = 50): Promise<AdminAccessLog[]> => {
    const res = await api.get<AdminAccessLog[]>("/admin/access-logs", {
      params: { limit },
    });
    return res.data;
  },

  getSecurityLogs: async (limit: number = 50, eventType?: string): Promise<AdminSecurityLog[]> => {
    const res = await api.get<AdminSecurityLog[]>("/admin/security/logs", {
      params: { limit, event_type: eventType },
    });
    return res.data;
  },

  clearSecurityLogs: async (): Promise<void> => {
    await api.delete("/admin/security/logs");
  },

  getSecurityStats: async (): Promise<AdminSecurityStats> => {
    const res = await api.get<AdminSecurityStats>("/admin/security/stats");
    return res.data;
  },
};
