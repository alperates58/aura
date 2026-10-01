"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, User } from "@/store/useAuthStore";
import { useSettingsStore, applyThemeToDocument } from "@/store/useSettingsStore";
import { api, getBasePath } from "@/lib/api";
import {
  adminApi,
  SystemSettings,
  AdminStatsResponse,
  AdminAccessLog,
  AdminSecurityLog,
  AdminSecurityStats,
  DetailedHealthResponse,
  StorageBreakdownResponse,
  ActiveCallTelemetry,
} from "@/lib/admin_api";
import { getContrastTextColor } from "@/lib/utils";
import { soundEffects } from "@/lib/sounds";
import {
  getPushSubscription,
  subscribeUserToPush,
  unsubscribeUserFromPush,
  sendTestPushNotification,
} from "@/lib/push_notifications";
import {
  X,
  User as UserIcon,
  Shield,
  Upload,
  Check,
  LogOut,
  Camera,
  Loader2,
  Lock,
  History,
  Laptop,
  Smartphone,
  Globe,
  Bell,
  Send,
  Sliders,
  Volume2,
  VolumeX,
  CheckCircle,
  Key,
  AlertTriangle,
  RefreshCw,
  PowerOff,
  ShieldAlert,
  ExternalLink,
  Users,
  PhoneCall,
  Activity,
  FileText,
  Pencil,
  Search,
  CheckCircle2,
  Trash2,
  HardDrive,
  Database,
  Server,
  Cpu,
  Clock,
  Phone,
  Save,
  Ban,
  UserCheck,
  Palette,
  Sparkles,
  Radio,
  ChevronRight,
  Eye,
  Filter,
  MapPin,
} from "lucide-react";

export type UnifiedTabType =
  // Kullanıcı Ayarları
  | "profile"
  | "privacy"
  | "security"
  | "notifications"
  | "access_logs"
  // Yönetici Parametreleri
  | "admin_users"
  | "admin_security_logs"
  | "admin_security"
  | "admin_theme"
  | "admin_general"
  | "admin_chat"
  | "admin_calls"
  | "admin_logs"
  | "admin_stats";

export const THEME_PRESETS = [
  {
    id: "obsidian-noir",
    name: "Obsidian Noir",
    badge: "Siyaha Yakın Derin Koyu",
    description: "Discord, Linear ve macOS ilhamlı; göz yormayan derin obsidian, antrasit kömür ve çinko zemin.",
    color: "#818CF8",
    bubble: "#27272A",
    text: "#F4F4F5",
    main_bg: "#09090B",
    card_bg: "#121215",
    border_color: "#27272A",
    incoming_bubble: "#18181B",
  },
  {
    id: "linear-obsidian",
    name: "Linear Midnight",
    badge: "Varsayılan SaaS",
    description: "Linear & Vercel ilhamlı; göz yormayan derin çivit ve gece mavisi.",
    color: "#6366F1",
    bubble: "#4F46E5",
    text: "#FFFFFF",
    main_bg: "#090A0F",
    card_bg: "#11141E",
    border_color: "#1E2333",
    incoming_bubble: "#181C28",
  },
  {
    id: "supabase-emerald",
    name: "Supabase Emerald",
    badge: "Siber Zümrüt",
    description: "Supabase tarzı fütüristik zümrüt yeşili ve mat antrasit zemin.",
    color: "#10B981",
    bubble: "#059669",
    text: "#FFFFFF",
    main_bg: "#080E0B",
    card_bg: "#0E1713",
    border_color: "#192B23",
    incoming_bubble: "#14221C",
  },
  {
    id: "raycast-midnight",
    name: "Raycast Midnight",
    badge: "Kozmik Mor",
    description: "Raycast Theme Studio esintili, asil ve derin elektrik moru tonları.",
    color: "#A855F7",
    bubble: "#7E22CE",
    text: "#FFFFFF",
    main_bg: "#0C0A14",
    card_bg: "#141021",
    border_color: "#241C38",
    incoming_bubble: "#1C162E",
  },
  {
    id: "telegram-amoled",
    name: "Telegram AMOLED",
    badge: "Zifiri Siyah",
    description: "OLED ekranlar için pil tasarruflu gerçek %100 siyah (#000000).",
    color: "#229ED9",
    bubble: "#1E4E79",
    text: "#FFFFFF",
    main_bg: "#000000",
    card_bg: "#0D0D0D",
    border_color: "#222222",
    incoming_bubble: "#181818",
  },
  {
    id: "whatsapp-stealth",
    name: "WhatsApp Stealth",
    badge: "Klasik Koyu",
    description: "Koyu petrol mavisi-yeşili ve kurşun zemin uyumu.",
    color: "#25D366",
    bubble: "#005C4B",
    text: "#E9EDEF",
    main_bg: "#0C1317",
    card_bg: "#111B21",
    border_color: "#222D34",
    incoming_bubble: "#202C33",
  },
  {
    id: "nordic-arctic",
    name: "Nordic Arctic",
    badge: "Soğuk Grafit",
    description: "macOS ve GitHub Dark soğuk grafit ve gök mavisi.",
    color: "#38BDF8",
    bubble: "#0284C7",
    text: "#FFFFFF",
    main_bg: "#0B111A",
    card_bg: "#111923",
    border_color: "#1E2333",
    incoming_bubble: "#192535",
  },
  {
    id: "cyber-crimson",
    name: "Cyber Crimson",
    badge: "Aura Rose",
    description: "Modern neon gül ve yakut kadife tonlarıyla lüks bir hava.",
    color: "#F43F5E",
    bubble: "#BE123C",
    text: "#FFFFFF",
    main_bg: "#0D080A",
    card_bg: "#160F13",
    border_color: "#2B1922",
    incoming_bubble: "#1F141A",
  },
  {
    id: "warm-amber",
    name: "Warm Amber",
    badge: "Sıcak Kehribar",
    description: "Espresso, kavrulmuş fındık ve yumuşak altın tonları.",
    color: "#F59E0B",
    bubble: "#B45309",
    text: "#FFFFFF",
    main_bg: "#0E0C0A",
    card_bg: "#161310",
    border_color: "#2B231C",
    incoming_bubble: "#211C17",
  },
  {
    id: "titanium-mono",
    name: "Titanium Mono",
    badge: "Minimalist Mat",
    description: "Ultra sade, dikkat dağıtmayan titanyum mat koyu gri.",
    color: "#94A3B8",
    bubble: "#334155",
    text: "#F8FAFC",
    main_bg: "#0B0C0E",
    card_bg: "#131519",
    border_color: "#23272F",
    incoming_bubble: "#1C1F26",
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: string;
}

export default function SettingsModal({ isOpen, onClose, initialTab }: Props) {
  const router = useRouter();
  const {
    user,
    updateProfile,
    uploadAvatar,
    updatePrivacy,
    logout,
    setPanicPassword,
    killSessions,
    regenerateSecurityCode,
  } = useAuthStore();

  const isAdminOrMod = user?.role === "admin" || user?.role === "moderator";

  // Tab State
  const [activeTab, setActiveTab] = useState<UnifiedTabType>(
    (initialTab as UnifiedTabType) || "profile"
  );

  useEffect(() => {
    if (initialTab && isOpen) {
      setActiveTab(initialTab as UnifiedTabType);
    }
  }, [initialTab, isOpen]);

  // ─────────────────────────────────────────────────────────────
  // 1. KULLANICI AYARLARI STATE'LERİ
  // ─────────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [readReceipts, setReadReceipts] = useState(user?.privacy_settings?.read_receipts ?? true);
  const [lastSeen, setLastSeen] = useState(user?.privacy_settings?.last_seen ?? true);
  const [allowCalls, setAllowCalls] = useState(user?.privacy_settings?.allow_calls ?? true);
  const [soundAlerts, setSoundAlerts] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("aura_sound_alerts");
      if (saved !== null) return saved !== "false";
    }
    return user?.privacy_settings?.sound_alerts ?? true;
  });

  // Panic & Security state
  const [panicLogin, setPanicLogin] = useState(user?.panic_login || "");
  const [panicPassword, setPanicPasswordInput] = useState("");
  const [panicRedirectUrl, setPanicRedirectUrl] = useState(user?.panic_redirect_url || "https://zodiacrf.com");
  const [hasPanicPassword, setHasPanicPassword] = useState(user?.has_panic_password || false);
  const [isSavingPanic, setIsSavingPanic] = useState(false);
  const [isKillingSessions, setIsKillingSessions] = useState(false);
  const [isRegeneratingSecurity, setIsRegeneratingSecurity] = useState(false);

  // Profile save & Push state
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [userAccessLogs, setUserAccessLogs] = useState<any[]>([]);
  const [isLoadingUserLogs, setIsLoadingUserLogs] = useState(false);

  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null);
  const [isPushLoading, setIsPushLoading] = useState(false);

  const showToast = (msg: string = "Ayarlar başarıyla kaydedildi!") => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || "");
      setBio(user.bio || "");
      setHasPanicPassword(!!user.has_panic_password);
      if (user.panic_login) setPanicLogin(user.panic_login);
      if (user.panic_redirect_url) {
        let clean = user.panic_redirect_url.trim().replace(/^https?:\/\/www\.zodiacrf\.com/i, "https://zodiacrf.com");
        setPanicRedirectUrl(clean);
      }
    }
  }, [user]);

  useEffect(() => {
    if (user?.privacy_settings?.sound_alerts !== undefined) {
      setSoundAlerts(user.privacy_settings.sound_alerts);
      soundEffects.setSoundEnabled(user.privacy_settings.sound_alerts);
      if (typeof window !== "undefined") {
        localStorage.setItem("aura_sound_alerts", String(user.privacy_settings.sound_alerts));
      }
    }
  }, [user?.privacy_settings?.sound_alerts]);

  useEffect(() => {
    if (isOpen) {
      getPushSubscription().then((sub) => setIsPushSubscribed(!!sub));
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeTab === "access_logs") {
      setIsLoadingUserLogs(true);
      api
        .get("/users/access-logs")
        .then((res) => setUserAccessLogs(res.data))
        .catch((err) => console.error("Access log hatası:", err))
        .finally(() => setIsLoadingUserLogs(false));
    }
  }, [isOpen, activeTab]);

  // ─────────────────────────────────────────────────────────────
  // 2. YÖNETİCİ PARAMETRELERİ (ADMIN) STATE'LERİ
  // ─────────────────────────────────────────────────────────────
  const [adminSettings, setAdminSettings] = useState<SystemSettings | null>(null);
  const [isAdminSettingsLoading, setIsAdminSettingsLoading] = useState(false);
  const [adminSettingsError, setAdminSettingsError] = useState<string | null>(null);

  // Admin Users State
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [totalAdminUsers, setTotalAdminUsers] = useState(0);
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const [adminRoleFilter, setAdminRoleFilter] = useState("all");
  const [isAdminUsersLoading, setIsAdminUsersLoading] = useState(false);

  // Edit user state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("member");
  const [editIsBanned, setEditIsBanned] = useState(false);
  const [editBanReason, setEditBanReason] = useState("");
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [editUserError, setEditUserError] = useState<string | null>(null);

  // Admin Stats & Logs State
  const [adminStats, setAdminStats] = useState<AdminStatsResponse | null>(null);
  const [detailedHealth, setDetailedHealth] = useState<DetailedHealthResponse | null>(null);
  const [storageBreakdown, setStorageBreakdown] = useState<StorageBreakdownResponse | null>(null);
  const [activeCalls, setActiveCalls] = useState<ActiveCallTelemetry[]>([]);
  const [adminAccessLogs, setAdminAccessLogs] = useState<AdminAccessLog[]>([]);
  const [isAdminLogsLoading, setIsAdminLogsLoading] = useState(false);

  // Security logs state
  const [adminSecurityLogs, setAdminSecurityLogs] = useState<AdminSecurityLog[]>([]);
  const [adminSecurityStats, setAdminSecurityStats] = useState<AdminSecurityStats | null>(null);
  const [isAdminSecurityLogsLoading, setIsAdminSecurityLogsLoading] = useState(false);
  const [securityEventTypeFilter, setSecurityEventTypeFilter] = useState("all");

  // Admin Theme Customizer State
  const [accentColor, setAccentColor] = useState("#6366F1");
  const [cardBgColor, setCardBgColor] = useState("#11141E");
  const [borderColor, setBorderColor] = useState("#1E2333");
  const [outgoingBubble, setOutgoingBubble] = useState("#4F46E5");
  const [outgoingText, setOutgoingText] = useState("auto");
  const [incomingBubble, setIncomingBubble] = useState("#181C28");
  const [mainBgColor, setMainBgColor] = useState("#090A0F");
  const [fontFamily, setFontFamily] = useState("Inter");

  const effectiveTextColor =
    outgoingText === "auto"
      ? getContrastTextColor(outgoingBubble)
      : outgoingText;

  // Load Admin Data on tab switch
  useEffect(() => {
    if (!isOpen || !isAdminOrMod) return;

    loadAdminSettings();
    if (activeTab === "admin_users") loadAdminUsers();
    if (activeTab === "admin_stats") loadAdminStats();
    if (activeTab === "admin_calls") loadAdminCallsData();
    if (activeTab === "admin_logs") loadAdminLogs();
    if (activeTab === "admin_security_logs") loadAdminSecurityLogs();
    adminApi.getSecurityStats().then(setAdminSecurityStats).catch(() => {});
  }, [isOpen, activeTab, securityEventTypeFilter, isAdminOrMod]);

  const loadAdminSettings = async () => {
    setIsAdminSettingsLoading(true);
    setAdminSettingsError(null);
    try {
      const data = await adminApi.getSettings();
      setAdminSettings(data);
      if (data.theme_settings) {
        const acc = data.theme_settings.primary_color || "#6366F1";
        const crd = data.theme_settings.card_bg || "#11141E";
        const brd = data.theme_settings.border_color || "#1E2333";
        const bbl = data.theme_settings.outgoing_bubble || "#4F46E5";
        const inc = data.theme_settings.incoming_bubble || "#181C28";
        const mbg = data.theme_settings.main_bg || "#090A0F";
        const txt = data.theme_settings.outgoing_text || "auto";

        setAccentColor(acc);
        setCardBgColor(crd);
        setBorderColor(brd);
        setOutgoingBubble(bbl);
        setIncomingBubble(inc);
        setMainBgColor(mbg);
        setOutgoingText(txt);
        setFontFamily(data.theme_settings.font_family || "Inter");
        applyThemeToDocument({
          primary_color: acc,
          card_bg: crd,
          border_color: brd,
          outgoing_bubble: bbl,
          incoming_bubble: inc,
          main_bg: mbg,
          outgoing_text: txt,
        });
      }
    } catch (e: any) {
      setAdminSettingsError(e.response?.data?.error || "Ayarlar yüklenemedi.");
    } finally {
      setIsAdminSettingsLoading(false);
    }
  };

  const loadAdminUsers = async () => {
    setIsAdminUsersLoading(true);
    try {
      const res = await adminApi.getUsers({
        search: adminSearchQuery,
        role: adminRoleFilter,
        limit: 50,
      });
      setAdminUsers(res.users);
      setTotalAdminUsers(res.total);
    } catch (e) {
      console.error("Kullanıcılar alınamadı", e);
    } finally {
      setIsAdminUsersLoading(false);
    }
  };

  const loadAdminStats = async () => {
    setIsAdminSettingsLoading(true);
    try {
      const [res, health, storage] = await Promise.all([
        adminApi.getStats().catch(() => null),
        adminApi.getDetailedHealth().catch(() => null),
        adminApi.getStorageBreakdown().catch(() => null),
      ]);
      if (res) setAdminStats(res);
      if (health) setDetailedHealth(health);
      if (storage) setStorageBreakdown(storage);
    } catch (e) {
      console.error("İstatistikler alınamadı", e);
    } finally {
      setIsAdminSettingsLoading(false);
    }
  };

  const loadAdminCallsData = async () => {
    try {
      const res = await adminApi.getActiveCalls();
      setActiveCalls(res.active_calls || []);
    } catch (e) {
      console.error("Aktif aramalar alınamadı", e);
    }
  };

  const loadAdminLogs = async () => {
    setIsAdminLogsLoading(true);
    try {
      const res = await adminApi.getAccessLogs(50);
      setAdminAccessLogs(res);
    } catch (e) {
      console.error("Günlükler alınamadı", e);
    } finally {
      setIsAdminLogsLoading(false);
    }
  };

  const loadAdminSecurityLogs = async () => {
    setIsAdminSecurityLogsLoading(true);
    try {
      const filter = securityEventTypeFilter === "all" ? undefined : securityEventTypeFilter;
      const [logs, statsData] = await Promise.all([
        adminApi.getSecurityLogs(100, filter),
        adminApi.getSecurityStats(),
      ]);
      setAdminSecurityLogs(logs || []);
      setAdminSecurityStats(statsData || null);
    } catch (e) {
      console.error("Güvenlik kayıtları alınamadı", e);
    } finally {
      setIsAdminSecurityLogsLoading(false);
    }
  };

  const handleClearAdminSecurityLogs = async () => {
    if (!window.confirm("Tüm güvenlik ihlali ve kayıtlarını temizlemek istediğinize emin misiniz?")) return;
    try {
      await adminApi.clearSecurityLogs();
      setAdminSecurityLogs([]);
      if (adminSecurityStats) {
        setAdminSecurityStats({
          ...adminSecurityStats,
          total_logs: 0,
          last_24h_logs: 0,
        });
      }
      showToast("Güvenlik kayıtları temizlendi.");
    } catch (e) {
      console.error("Güvenlik kayıtları temizlenemedi", e);
    }
  };

  const handleSaveAdminSetting = async (key: string, value: any) => {
    try {
      let sanitizedValue = value;
      if (key === "security_settings" && value) {
        sanitizedValue = {
          ...value,
          max_messages_per_second: Number(value.max_messages_per_second) || 5,
          max_messages_per_minute: Number(value.max_messages_per_minute) || 60,
          lockout_attempts: Number(value.lockout_attempts) || 5,
          session_timeout_days: Number(value.session_timeout_days) || 30,
          inactivity_timeout_minutes: Number(value.inactivity_timeout_minutes) || 15,
        };
      } else if (key === "media_limits" && value) {
        sanitizedValue = {
          ...value,
          max_file_size_mb: Number(value.max_file_size_mb) || 50,
          max_voice_seconds: Number(value.max_voice_seconds) || 120,
        };
      } else if (key === "chat_settings" && value) {
        sanitizedValue = {
          ...value,
          edit_time_limit_minutes: Number(value.edit_time_limit_minutes) || 15,
          delete_time_limit_minutes: Number(value.delete_time_limit_minutes) || 60,
        };
      } else if (key === "call_settings" && value) {
        sanitizedValue = {
          ...value,
          max_call_duration_minutes: Number(value.max_call_duration_minutes) || 120,
        };
      }

      await adminApi.updateSetting(key, sanitizedValue);
      useSettingsStore.getState().updateSettingLocally(key, sanitizedValue);
      if (key === "security_settings" && typeof window !== "undefined") {
        localStorage.setItem("aura_security_settings", JSON.stringify(sanitizedValue));
      }
      showToast(`"${key}" parametreleri başarıyla güncellendi!`);
      loadAdminSettings();
    } catch (e) {
      alert("Ayar kaydedilirken bir hata oluştu.");
    }
  };

  const handleApplyPreset = (preset: (typeof THEME_PRESETS)[0]) => {
    setAccentColor(preset.color);
    setOutgoingBubble(preset.bubble);
    setOutgoingText(preset.text || "auto");
    setMainBgColor(preset.main_bg);
    setCardBgColor(preset.card_bg);
    setBorderColor(preset.border_color);
    setIncomingBubble(preset.incoming_bubble);
    applyThemeToDocument({
      primary_color: preset.color,
      outgoing_bubble: preset.bubble,
      outgoing_text: preset.text || "auto",
      main_bg: preset.main_bg,
      card_bg: preset.card_bg,
      border_color: preset.border_color,
      incoming_bubble: preset.incoming_bubble,
    });
  };

  const handleSaveTheme = async () => {
    const updatedTheme = {
      primary_color: accentColor,
      card_bg: cardBgColor,
      nav_bg: "#0B0D14",
      main_bg: mainBgColor,
      border_color: borderColor,
      outgoing_bubble: outgoingBubble,
      outgoing_text: outgoingText,
      incoming_bubble: incomingBubble,
      font_family: fontFamily,
      border_radius: "rounded-2xl",
    };
    applyThemeToDocument(updatedTheme);
    useSettingsStore.getState().updateSettingLocally("theme_settings", updatedTheme);
    await handleSaveAdminSetting("theme_settings", updatedTheme);
  };

  const handleUpdateUserRole = async (targetUser: User, newRole: string) => {
    try {
      await adminApi.updateUser(targetUser.id, {
        role: newRole,
        is_banned: targetUser.is_banned || false,
        ban_reason: targetUser.ban_reason || "",
      });
      loadAdminUsers();
      showToast("Kullanıcı rolü güncellendi!");
    } catch (e) {
      alert("Rol güncellenemedi.");
    }
  };

  const handleToggleUserBan = async (targetUser: User) => {
    const nextBanStatus = !targetUser.is_banned;
    const reason = nextBanStatus
      ? prompt("Yasaklama gerekçesi (isteğe bağlı):") || "Yönetici tarafından askıya alındı"
      : "";

    try {
      await adminApi.updateUser(targetUser.id, {
        role: targetUser.role || "member",
        is_banned: nextBanStatus,
        ban_reason: reason,
      });
      loadAdminUsers();
      showToast(nextBanStatus ? "Kullanıcı engellendi!" : "Engel kaldırıldı!");
    } catch (e) {
      alert("Kullanıcı durumu güncellenemedi.");
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`@${username} kullanıcısını ve tüm verilerini kalıcı olarak silmek istediğinize emin misiniz?`)) {
      return;
    }
    try {
      await adminApi.deleteUser(userId);
      loadAdminUsers();
      showToast("Kullanıcı kalıcı olarak silindi.");
    } catch (e) {
      alert("Kullanıcı silinemedi.");
    }
  };

  const handleOpenEditUser = (u: User) => {
    setEditingUser(u);
    setEditDisplayName(u.display_name || "");
    setEditUsername(u.username || "");
    setEditEmail(u.email || "");
    setEditPassword("");
    setEditRole(u.role || "member");
    setEditIsBanned(Boolean(u.is_banned));
    setEditBanReason(u.ban_reason || "");
    setEditUserError(null);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!editDisplayName.trim()) {
      setEditUserError("Ad Soyad alanı boş bırakılamaz.");
      return;
    }
    if (!editUsername.trim()) {
      setEditUserError("Kullanıcı adı boş bırakılamaz.");
      return;
    }
    if (!editEmail.trim()) {
      setEditUserError("E-posta adresi boş bırakılamaz.");
      return;
    }
    if (editPassword && editPassword.length < 6) {
      setEditUserError("Yeni şifre en az 6 karakter olmalıdır.");
      return;
    }

    setIsSavingUser(true);
    setEditUserError(null);
    try {
      await adminApi.updateUser(editingUser.id, {
        display_name: editDisplayName.trim(),
        username: editUsername.trim().toLowerCase(),
        email: editEmail.trim().toLowerCase(),
        password: editPassword ? editPassword : undefined,
        role: editRole,
        is_banned: editIsBanned,
        ban_reason: editIsBanned ? editBanReason.trim() : "",
      });
      showToast(`@${editUsername} kullanıcısının bilgileri güncellendi!`);
      setEditingUser(null);
      loadAdminUsers();
    } catch (err: any) {
      setEditUserError(err?.response?.data?.error || "Kullanıcı güncellenemedi.");
    } finally {
      setIsSavingUser(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 3. KULLANICI İŞLEMLERİ (HANDLERS)
  // ─────────────────────────────────────────────────────────────
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateProfile(displayName, bio);
      setSaveSuccess(true);
      showToast("Profil ayarları başarıyla kaydedildi!");
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      alert("Profil güncellenemedi.");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrivacyToggle = async (key: "read_receipts" | "last_seen" | "allow_calls", val: boolean) => {
    if (key === "read_receipts") setReadReceipts(val);
    if (key === "last_seen") setLastSeen(val);
    if (key === "allow_calls") setAllowCalls(val);

    try {
      await updatePrivacy({ [key]: val });
      showToast("Gizlilik tercihleri kaydedildi!");
    } catch (err) {
      console.error("Gizlilik güncellenemedi:", err);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    try {
      await uploadAvatar(file);
      showToast("Profil fotoğrafı güncellendi!");
    } catch (err) {
      alert("Profil resmi yüklenemedi.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleTogglePush = async () => {
    setIsPushLoading(true);
    setPushStatusMessage(null);
    if (isPushSubscribed) {
      const res = await unsubscribeUserFromPush();
      setIsPushSubscribed(false);
      setPushStatusMessage(res.message);
      showToast(res.message);
    } else {
      const res = await subscribeUserToPush();
      setIsPushSubscribed(res.success);
      setPushStatusMessage(res.message);
      showToast(res.message);
    }
    setIsPushLoading(false);
    setTimeout(() => setPushStatusMessage(null), 4000);
  };

  const handleTestPush = async () => {
    setIsPushLoading(true);
    const res = await sendTestPushNotification();
    setPushStatusMessage(res.message);
    setIsPushLoading(false);
    setTimeout(() => setPushStatusMessage(null), 4000);
  };

  const handleToggleSound = async () => {
    const nextVal = !soundAlerts;
    setSoundAlerts(nextVal);
    soundEffects.setSoundEnabled(nextVal);
    if (typeof window !== "undefined") {
      localStorage.setItem("aura_sound_alerts", String(nextVal));
    }
    try {
      await updatePrivacy({ sound_alerts: nextVal });
      showToast(
        nextVal
          ? "Bildirim sesleri açıldı (Sesli mod)"
          : "Bildirim sesleri kapatıldı (Sessiz mod)"
      );
    } catch (e) {
      console.error("Ses ayarı kaydedilemedi:", e);
    }
  };

  const handleSavePanic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!panicLogin.trim()) {
      alert("Lütfen panik durumunda giriş yapacağınız sahte e-posta veya kullanıcı adı belirleyin.");
      return;
    }
    if (!panicPassword && !hasPanicPassword) {
      alert("Lütfen en az 6 karakterli bir panik şifresi belirleyin.");
      return;
    }
    if (panicPassword && panicPassword.length < 6) {
      alert("Panik şifresi en az 6 karakter olmalıdır.");
      return;
    }
    setIsSavingPanic(true);
    try {
      let targetUrl = (panicRedirectUrl || "https://zodiacrf.com").trim();
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = "https://" + targetUrl;
      }
      targetUrl = targetUrl.replace(/^https?:\/\/www\.zodiacrf\.com/i, "https://zodiacrf.com");
      setPanicRedirectUrl(targetUrl);

      const res = await setPanicPassword(panicLogin.trim(), panicPassword, targetUrl);
      setHasPanicPassword(res.has_panic_password);
      setPanicLogin(res.panic_login || panicLogin.trim());
      setPanicPasswordInput("");
      showToast("Panik giriş kimliği, şifresi ve yönlendirme linki kaydedildi!");
    } catch (err: any) {
      alert(err.response?.data?.error || "Panik ayarları kaydedilemedi.");
    } finally {
      setIsSavingPanic(false);
    }
  };

  const handleRemovePanic = async () => {
    if (!confirm("Panik girişini ve şifresini kaldırmak istediğinize emin misiniz?")) return;
    setIsSavingPanic(true);
    try {
      let targetUrl = (panicRedirectUrl || "https://zodiacrf.com").trim();
      targetUrl = targetUrl.replace(/^https?:\/\/www\.zodiacrf\.com/i, "https://zodiacrf.com");
      await setPanicPassword("", "", targetUrl);
      setHasPanicPassword(false);
      setPanicLogin("");
      setPanicPasswordInput("");
      showToast("Panik girişi devre dışı bırakıldı.");
    } catch (err) {
      alert("Panik şifresi kaldırılamadı.");
    } finally {
      setIsSavingPanic(false);
    }
  };

  const handleKillOtherSessions = async () => {
    if (!confirm("Bu cihaz haricindeki tüm aktif oturumları ve bağlantıları anında sonlandırmak istiyor musunuz?")) return;
    setIsKillingSessions(true);
    try {
      await killSessions();
      showToast("Tüm diğer oturumlar ve cihazlar sonlandırıldı!");
    } catch (err) {
      alert("Oturumlar sonlandırılamadı.");
    } finally {
      setIsKillingSessions(false);
    }
  };

  const handleRegenerateSecurity = async () => {
    if (!confirm("Uçtan uca güvenlik kodunuzu yenilemek istiyor musunuz? Tüm sohbetlerdeki 60 haneli doğrulama kodları güncellenecektir.")) return;
    setIsRegeneratingSecurity(true);
    try {
      await regenerateSecurityCode();
      showToast("Uçtan uca güvenlik anahtarınız başarıyla yenilendi!");
    } catch (err) {
      alert("Güvenlik kodu yenilenemedi.");
    } finally {
      setIsRegeneratingSecurity(false);
    }
  };

  const handleLogout = async () => {
    onClose();
    await logout();
    const bp = getBasePath();
    if (process.env.NEXT_PUBLIC_BASE_PATH) {
      router.push("/login");
    } else if (bp) {
      window.location.href = `${bp}/login`;
    } else {
      router.push("/login");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden select-none flex items-center justify-center p-0 sm:p-4">
      {/* Karartma Katmanı (Backdrop) */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
      />

      {/* AURA BİRLEŞİK AYARLAR VE YÖNETİM MODALI */}
      <div className="relative w-full max-w-5xl h-[100dvh] sm:h-[88vh] bg-[#0D0F14] border-0 sm:border border-[#222631] sm:rounded-3xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 text-slate-200 overflow-hidden z-[101]">
        {/* Kayan Toast Bildirimi */}
        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-emerald-600/95 text-white text-xs font-bold shadow-2xl border border-emerald-400/30 flex items-center gap-2 animate-in fade-in slide-in-from-top-3 duration-300 pointer-events-none backdrop-blur-md whitespace-nowrap">
            <CheckCircle2 className="w-4 h-4 text-emerald-200 flex-shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Üst Başlık Barı (Header) */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-[#222631] bg-[#12151C] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-pink-600 to-rose-500 flex items-center justify-center text-white shadow-md shadow-pink-950/40 flex-shrink-0 font-bold">
              ⚙️
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-wide truncate">
                  Ayarlar & Yönetim Merkezi
                </h2>
                {isAdminOrMod && (
                  <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold flex-shrink-0">
                    Yönetici
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Hesap, gizlilik, kalkan koruması ve sistem parametreleri
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              title="Kapat"
              className="p-1.5 sm:p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/80 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Ana Gövde: Sol Sidebar Navigasyonu + Sağ İçerik Alanı */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* 1. SÜTUN: Sol Kategori Menüsü */}
          <div className="w-full md:w-64 bg-[#0F1218] border-b md:border-b-0 md:border-r border-[#222631] flex flex-row md:flex-col p-2.5 gap-1.5 md:gap-0 md:space-y-1 overflow-x-auto md:overflow-y-auto flex-shrink-0 no-scrollbar custom-scrollbar">
            {/* KULLANICI AYARLARI BÖLÜMÜ */}
            <div className="hidden md:block px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Kullanıcı Tercihleri
            </div>

            <button
              onClick={() => setActiveTab("profile")}
              className={`flex-shrink-0 flex items-center gap-2.5 px-3 py-2 md:py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left whitespace-nowrap ${
                activeTab === "profile"
                  ? "bg-pink-600/15 text-pink-400 border border-pink-500/30 shadow-xs"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
              }`}
            >
              <UserIcon className={`w-4 h-4 flex-shrink-0 ${activeTab === "profile" ? "text-pink-400" : "text-slate-400"}`} />
              <span>Profilim</span>
            </button>

            <button
              onClick={() => setActiveTab("privacy")}
              className={`flex-shrink-0 flex items-center gap-2.5 px-3 py-2 md:py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left whitespace-nowrap ${
                activeTab === "privacy"
                  ? "bg-pink-600/15 text-pink-400 border border-pink-500/30 shadow-xs"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
              }`}
            >
              <Shield className={`w-4 h-4 flex-shrink-0 ${activeTab === "privacy" ? "text-pink-400" : "text-slate-400"}`} />
              <span>Gizlilik & Tikler</span>
            </button>

            <button
              onClick={() => setActiveTab("security")}
              className={`flex-shrink-0 flex items-center gap-2.5 px-3 py-2 md:py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left whitespace-nowrap ${
                activeTab === "security"
                  ? "bg-pink-600/15 text-pink-400 border border-pink-500/30 shadow-xs"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
              }`}
            >
              <Key className={`w-4 h-4 flex-shrink-0 ${activeTab === "security" ? "text-pink-400" : "text-slate-400"}`} />
              <span>Panik & Güvenlik</span>
            </button>

            <button
              onClick={() => setActiveTab("notifications")}
              className={`flex-shrink-0 flex items-center gap-2.5 px-3 py-2 md:py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left whitespace-nowrap ${
                activeTab === "notifications"
                  ? "bg-pink-600/15 text-pink-400 border border-pink-500/30 shadow-xs"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
              }`}
            >
              <Bell className={`w-4 h-4 flex-shrink-0 ${activeTab === "notifications" ? "text-pink-400" : "text-slate-400"}`} />
              <span>Bildirimler & Sesler</span>
            </button>

            <button
              onClick={() => setActiveTab("access_logs")}
              className={`flex-shrink-0 flex items-center gap-2.5 px-3 py-2 md:py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left whitespace-nowrap ${
                activeTab === "access_logs"
                  ? "bg-pink-600/15 text-pink-400 border border-pink-500/30 shadow-xs"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
              }`}
            >
              <History className={`w-4 h-4 flex-shrink-0 ${activeTab === "access_logs" ? "text-pink-400" : "text-slate-400"}`} />
              <span>Giriş Kayıtlarım</span>
            </button>

            {/* YÖNETİCİ PARAMETRELERİ BÖLÜMÜ (Admin Only) */}
            {isAdminOrMod && (
              <>
                <div className="hidden md:block pt-3 pb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-amber-400/90 border-t border-[#222631] mt-2">
                  👑 Sistem Yönetimi
                </div>

                <button
                  onClick={() => setActiveTab("admin_users")}
                  className={`flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 md:py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left whitespace-nowrap ${
                    activeTab === "admin_users"
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-xs"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Users className={`w-4 h-4 flex-shrink-0 ${activeTab === "admin_users" ? "text-amber-400" : "text-slate-400"}`} />
                    <span>Kullanıcı Yönetimi</span>
                  </div>
                  {totalAdminUsers > 0 && (
                    <span className="hidden md:inline-block text-[9px] px-1.5 py-0.2 rounded-md bg-slate-800 text-slate-400">
                      {totalAdminUsers}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("admin_theme")}
                  className={`flex-shrink-0 flex items-center gap-2.5 px-3 py-2 md:py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left whitespace-nowrap ${
                    activeTab === "admin_theme"
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-xs"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                  }`}
                >
                  <Palette className={`w-4 h-4 flex-shrink-0 ${activeTab === "admin_theme" ? "text-amber-400" : "text-slate-400"}`} />
                  <span>Tema & Görünüm</span>
                </button>

                <button
                  onClick={() => setActiveTab("admin_general")}
                  className={`flex-shrink-0 flex items-center gap-2.5 px-3 py-2 md:py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left whitespace-nowrap ${
                    activeTab === "admin_general"
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-xs"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                  }`}
                >
                  <Globe className={`w-4 h-4 flex-shrink-0 ${activeTab === "admin_general" ? "text-amber-400" : "text-slate-400"}`} />
                  <span>Genel & Markalama</span>
                </button>

                <button
                  onClick={() => setActiveTab("admin_chat")}
                  className={`flex-shrink-0 flex items-center gap-2.5 px-3 py-2 md:py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left whitespace-nowrap ${
                    activeTab === "admin_chat"
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-xs"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                  }`}
                >
                  <Sliders className={`w-4 h-4 flex-shrink-0 ${activeTab === "admin_chat" ? "text-amber-400" : "text-slate-400"}`} />
                  <span>Sohbet & Medya</span>
                </button>

                <button
                  onClick={() => setActiveTab("admin_calls")}
                  className={`flex-shrink-0 flex items-center gap-2.5 px-3 py-2 md:py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left whitespace-nowrap ${
                    activeTab === "admin_calls"
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-xs"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                  }`}
                >
                  <PhoneCall className={`w-4 h-4 flex-shrink-0 ${activeTab === "admin_calls" ? "text-amber-400" : "text-slate-400"}`} />
                  <span>Arama & WebRTC</span>
                </button>

                <button
                  onClick={() => setActiveTab("admin_security")}
                  className={`flex-shrink-0 flex items-center gap-2.5 px-3 py-2 md:py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left whitespace-nowrap ${
                    activeTab === "admin_security"
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-xs"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                  }`}
                >
                  <Lock className={`w-4 h-4 flex-shrink-0 ${activeTab === "admin_security" ? "text-amber-400" : "text-slate-400"}`} />
                  <span>Güvenlik & Kalkan</span>
                </button>

                <button
                  onClick={() => setActiveTab("admin_security_logs")}
                  className={`flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 md:py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left whitespace-nowrap ${
                    activeTab === "admin_security_logs"
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-xs"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <ShieldAlert className={`w-4 h-4 flex-shrink-0 ${activeTab === "admin_security_logs" ? "text-amber-400" : "text-slate-400"}`} />
                    <span>Güvenlik Günlükleri</span>
                  </div>
                  {adminSecurityStats && adminSecurityStats.last_24h_logs > 0 && (
                    <span className="hidden md:inline-block text-[9px] px-1.5 py-0.2 rounded-md bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30">
                      {adminSecurityStats.last_24h_logs} yeni
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("admin_logs")}
                  className={`flex-shrink-0 flex items-center gap-2.5 px-3 py-2 md:py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left whitespace-nowrap ${
                    activeTab === "admin_logs"
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-xs"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                  }`}
                >
                  <FileText className={`w-4 h-4 flex-shrink-0 ${activeTab === "admin_logs" ? "text-amber-400" : "text-slate-400"}`} />
                  <span>Erişim Logları</span>
                </button>

                <button
                  onClick={() => setActiveTab("admin_stats")}
                  className={`flex-shrink-0 flex items-center gap-2.5 px-3 py-2 md:py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left whitespace-nowrap ${
                    activeTab === "admin_stats"
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-xs"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                  }`}
                >
                  <Activity className={`w-4 h-4 flex-shrink-0 ${activeTab === "admin_stats" ? "text-amber-400" : "text-slate-400"}`} />
                  <span>Sistem Sağlığı</span>
                </button>
              </>
            )}

            {/* Alt Bilgi & Çıkış Butonu */}
            <div className="hidden md:flex flex-col mt-auto pt-4 border-t border-[#222631]/80 space-y-2">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                <span>Oturumu Kapat</span>
              </button>
            </div>
          </div>

          {/* 2. SÜTUN: Sağ İçerik Alanı (Seçili Tab) */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar bg-[#0D0F14]">
            {/* ─────────────────────────────────────────────────────────────
                TAB 1: PROFİLİM
            ────────────────────────────────────────────────────────────── */}
            {activeTab === "profile" && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h3 className="text-base font-bold text-white">Profil Bilgileri</h3>
                  <p className="text-xs text-slate-400">Görünen adınızı, durum mesajınızı ve profil fotoğrafınızı güncelleyin.</p>
                </div>

                {/* Avatar Yükleme */}
                <div className="flex items-center gap-5 p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
                  <div className="relative group">
                    <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-pink-500/40 flex items-center justify-center font-bold text-xl text-pink-400 overflow-hidden shadow-lg">
                      {user?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.avatar_url}
                          alt={user.display_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        user?.display_name?.charAt(0).toUpperCase() || "U"
                      )}
                    </div>
                    <label className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                      {isUploadingAvatar ? (
                        <Loader2 className="w-6 h-6 animate-spin text-pink-400" />
                      ) : (
                        <>
                          <Camera className="w-5 h-5 mb-0.5" />
                          <span className="text-[10px] font-medium">Değiştir</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarChange}
                        disabled={isUploadingAvatar}
                      />
                    </label>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{user?.display_name}</h3>
                    <p className="text-xs text-slate-400">@{user?.username}</p>
                    <p className="text-[11px] text-pink-400/80 mt-1">
                      Fotoğrafı değiştirmek için üzerine tıklayın
                    </p>
                  </div>
                </div>

                {/* Profil Düzenleme Formu */}
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Görünen Ad
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Hakkımda / Durum
                    </label>
                    <input
                      type="text"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Müsait, Aura kullanıyor..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500 transition-colors"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold shadow-lg shadow-pink-600/25 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      <span>Değişiklikleri Kaydet</span>
                    </button>

                    {saveSuccess && (
                      <span className="text-xs text-emerald-400 font-medium animate-in fade-in">
                        ✓ Profil güncellendi!
                      </span>
                    )}
                  </div>
                </form>

                {/* Hesap Detayları */}
                <div className="pt-4 border-t border-slate-800 space-y-2 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>Kayıtlı E-posta:</span>
                    <span className="text-slate-200 font-medium">{user?.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Kullanıcı Kimliği (UUID):</span>
                    <span className="font-mono text-[11px] text-slate-500">{user?.id}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                TAB 2: GİZLİLİK & TİKLER
            ────────────────────────────────────────────────────────────── */}
            {activeTab === "privacy" && (
              <div className="space-y-5 max-w-2xl">
                <div>
                  <h3 className="text-base font-bold text-white">Gizlilik Tercihleri</h3>
                  <p className="text-xs text-slate-400">WhatsApp tarzı mikro durumları ve arama erişiminizi kontrol edin.</p>
                </div>

                {/* Okundu Bilgisi (Mavi Tik) */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white">Okundu Bilgisi (Mavi Tik)</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Kapalıysa karşı taraf mesajları okuduğunuzu göremez.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePrivacyToggle("read_receipts", !readReceipts)}
                    className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer flex-shrink-0 ${
                      readReceipts ? "bg-pink-600" : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        readReceipts ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Son Görülme Zamanı */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white">Son Görülme Zamanı</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Çevrimdışı olduğunuzda son görülme zaman damganız gizlenir.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePrivacyToggle("last_seen", !lastSeen)}
                    className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer flex-shrink-0 ${
                      lastSeen ? "bg-pink-600" : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        lastSeen ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Sesli / Görüntülü Arama İzni */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white">Gelen Aramaları Kabul Et</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Kapalıysa gelen tüm WebRTC aramaları otomatik meşgule düşer.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePrivacyToggle("allow_calls", !allowCalls)}
                    className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer flex-shrink-0 ${
                      allowCalls ? "bg-pink-600" : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        allowCalls ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center gap-2 p-3 rounded-xl bg-pink-500/10 border border-pink-500/20 text-xs text-pink-300">
                  <Lock className="w-4 h-4 flex-shrink-0" />
                  <span>Tüm birebir mesajlar ve aramalar uçtan uca şifrelenir.</span>
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                TAB 3: PANİK & GÜVENLİK
            ────────────────────────────────────────────────────────────── */}
            {activeTab === "security" && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h3 className="text-base font-bold text-white">Panik Kalkanı & Acil Durum Koruması</h3>
                  <p className="text-xs text-slate-400">Zorlama altında güvenli sahte oturum açma ve uzaktan oturum kapatma araçları.</p>
                </div>

                {/* Bölüm 1: Panik Şifresi */}
                <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <span>Zorlama / Panik Kodu</span>
                        {hasPanicPassword ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            Aktif
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">
                            Devre Dışı
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Zorla şifreniz istendiğinde bu kodu girin. Girişte tüm sohbetler gizlenir ve tarayıcı derhal belirttiğiniz adrese yönlendirilir.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSavePanic} className="space-y-3 pt-2 border-t border-white/[0.05]">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                        Panik Giriş E-postası / Kullanıcı Adı (Sahte Giriş Kimliği)
                      </label>
                      <input
                        type="text"
                        value={panicLogin}
                        onChange={(e) => setPanicLogin(e.target.value)}
                        placeholder="Örn: decoy_guest@gmail.com veya guest_account"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                        Panik Şifresi (Sahte Şifre)
                      </label>
                      <input
                        type="password"
                        value={panicPassword}
                        onChange={(e) => setPanicPasswordInput(e.target.value)}
                        placeholder={hasPanicPassword ? "Şifreyi değiştirmek için yeni şifre girin..." : "Örn: gizli-panik-kodunuz-123"}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                        Yönlendirilecek Güvenli Sayfa / Link
                      </label>
                      <div className="relative">
                        <input
                          type="url"
                          value={panicRedirectUrl}
                          onChange={(e) => setPanicRedirectUrl(e.target.value)}
                          placeholder="https://zodiacrf.com"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-3 pr-8 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60 transition-colors"
                        />
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="submit"
                        disabled={isSavingPanic}
                        className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isSavingPanic ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        <span>{hasPanicPassword ? "Panik Kodunu Güncelle" : "Panik Kodunu Kaydet"}</span>
                      </button>

                      {hasPanicPassword && (
                        <button
                          type="button"
                          onClick={handleRemovePanic}
                          disabled={isSavingPanic}
                          className="px-3 py-2 rounded-xl text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          Kodu Kaldır
                        </button>
                      )}
                    </div>
                  </form>
                </div>

                {/* Bölüm 2: Uzaktan Cihaz Düşürme */}
                <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center flex-shrink-0">
                      <PowerOff className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-white">Uzaktan Tek Tıkla Cihaz Düşürme</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Bu cihaz hariç diğer tüm açık telefon, bilgisayar veya tabletlerdeki aktif oturum ve soket bağlantılarını anında sonlandırır.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleKillOtherSessions}
                      disabled={isKillingSessions}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-lg shadow-rose-600/25 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isKillingSessions ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PowerOff className="w-3.5 h-3.5" />}
                      <span>Tüm Diğer Oturumları Kapat</span>
                    </button>
                  </div>
                </div>

                {/* Bölüm 3: Uçtan Uca Güvenlik Kodu */}
                <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center flex-shrink-0">
                      <Key className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-white">Uçtan Uca Güvenlik Anahtarını Yenile</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Tüm sohbetlerinizdeki 60 haneli uçtan uca şifreleme doğrulama numaranızı yeniden oluşturur.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleRegenerateSecurity}
                      disabled={isRegeneratingSecurity}
                      className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRegeneratingSecurity ? "animate-spin" : ""}`} />
                      <span>Güvenlik Kodunu Yenile</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                TAB 4: BİLDİRİMLER & SESLER
            ────────────────────────────────────────────────────────────── */}
            {activeTab === "notifications" && (
              <div className="space-y-4 max-w-2xl">
                <div>
                  <h3 className="text-base font-bold text-white">Bildirimler ve Sesli Uyarılar</h3>
                  <p className="text-xs text-slate-400">Web Push arka plan bildirimleri ve ses efektlerini yönetin.</p>
                </div>

                {pushStatusMessage && (
                  <div className="p-3 rounded-xl bg-pink-500/10 border border-pink-500/20 text-xs text-pink-300">
                    {pushStatusMessage}
                  </div>
                )}

                {/* Web Push */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Anlık Cihaz Bildirimleri (Push)</span>
                      {isPushSubscribed ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          Aktif
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">
                          Kapalı
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Tarayıcı kapalıyken veya telefon kilitliyken bile anlık mesaj bildirimleri alın.
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isPushLoading}
                    onClick={handleTogglePush}
                    className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer flex-shrink-0 ${
                      isPushSubscribed ? "bg-pink-600" : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        isPushSubscribed ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Bildirim Sesleri */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      {soundAlerts ? <Volume2 className="w-4 h-4 text-pink-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
                      <span>Bildirim Sesleri ve Zil Sesi</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${soundAlerts ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-rose-500/20 text-rose-400 border-rose-500/30"}`}>
                        {soundAlerts ? "Sesli" : "Sessiz"}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Telefonunuz seslide olsa dahi mesaj sesleri sessize alınabilir.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleSound}
                    className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer flex-shrink-0 ${
                      soundAlerts ? "bg-pink-600" : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        soundAlerts ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Test Push */}
                {isPushSubscribed && (
                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">Test Bildirimi Gönder</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Bildirimlerin cihazınıza ulaştığını hemen test edin.
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isPushLoading}
                      onClick={handleTestPush}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-pink-400 border border-slate-700 transition-colors cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Test Et</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                TAB 5: GİRİŞ KAYITLARIM
            ────────────────────────────────────────────────────────────── */}
            {activeTab === "access_logs" && (
              <div className="space-y-4 max-w-3xl">
                <div>
                  <h3 className="text-base font-bold text-white">Hesap Giriş Kayıtları</h3>
                  <p className="text-xs text-slate-400">Hesabınıza yapılan son oturum açma işlemleri ve kullanılan cihazlar.</p>
                </div>

                {isLoadingUserLogs ? (
                  <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                    <Loader2 className="w-6 h-6 animate-spin text-pink-500" />
                    <span>Kayıtlar yükleniyor...</span>
                  </div>
                ) : userAccessLogs.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    Henüz kayıtlı bir giriş geçmişi bulunamadı.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                    {userAccessLogs.map((log: any, idx: number) => {
                      const isMobile =
                        log.device_info?.toLowerCase().includes("iphone") ||
                        log.device_info?.toLowerCase().includes("android");

                      return (
                        <div
                          key={log.id || idx}
                          className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 text-xs transition-colors hover:border-slate-700/80"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 text-pink-400">
                                {isMobile ? <Smartphone className="w-4 h-4" /> : <Laptop className="w-4 h-4" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-white truncate">
                                    {log.device_info || "Bilinmeyen Cihaz"}
                                  </span>
                                  {idx === 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                                      Son Giriş
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                                  <span className="flex items-center gap-1 font-mono">
                                    <Globe className="w-3 h-3 text-slate-500" />
                                    {log.ip_address}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="text-[11px] text-slate-400 text-right flex-shrink-0 font-medium">
                              {new Date(log.created_at).toLocaleString("tr-TR", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                YÖNETİCİ PARAMETRELERİ (ADMIN TABS)
            ────────────────────────────────────────────────────────────── */}
            {isAdminOrMod && (
              <>
                {/* 1. KULLANICI YÖNETİMİ */}
                {activeTab === "admin_users" && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold text-white">Kullanıcı Yönetimi ({totalAdminUsers})</h3>
                        <p className="text-xs text-slate-400">Sistemdeki kullanıcıları arayın, rollerini değiştirin veya engelleyin.</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Kullanıcı ara..."
                            value={adminSearchQuery}
                            onChange={(e) => setAdminSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && loadAdminUsers()}
                            className="bg-slate-900 border border-slate-800 rounded-xl py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                          />
                        </div>
                        <select
                          value={adminRoleFilter}
                          onChange={(e) => setAdminRoleFilter(e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded-xl py-1.5 px-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
                        >
                          <option value="all">Tüm Roller</option>
                          <option value="admin">Yöneticiler</option>
                          <option value="moderator">Moderatörler</option>
                          <option value="member">Üyeler</option>
                        </select>
                      </div>
                    </div>

                    {/* Kullanıcılar Tablosu */}
                    {isAdminUsersLoading ? (
                      <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                        <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                        <span>Kullanıcılar yükleniyor...</span>
                      </div>
                    ) : (
                      <div className="border border-[#222631] rounded-2xl overflow-hidden bg-slate-900/60">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-slate-300">
                            <thead className="bg-[#12151C] text-[11px] uppercase tracking-wider text-slate-400 border-b border-[#222631]">
                              <tr>
                                <th className="py-3 px-4">Kullanıcı</th>
                                <th className="py-3 px-4">E-posta</th>
                                <th className="py-3 px-4">Rol</th>
                                <th className="py-3 px-4">Durum</th>
                                <th className="py-3 px-4 text-right">Eylemler</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#222631]">
                              {adminUsers.map((u) => (
                                <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                                  <td className="py-3 px-4 flex items-center gap-2.5">
                                    <img
                                      src={u.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`}
                                      alt={u.display_name}
                                      className="w-7 h-7 rounded-lg object-cover bg-slate-800 border border-slate-700"
                                    />
                                    <div>
                                      <span className="font-semibold text-white block">{u.display_name}</span>
                                      <span className="text-[10px] text-slate-500">@{u.username}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 font-mono text-[11px] text-slate-400">{u.email}</td>
                                  <td className="py-3 px-4">
                                    <select
                                      value={u.role || "member"}
                                      onChange={(e) => handleUpdateUserRole(u, e.target.value)}
                                      className="bg-slate-950 border border-slate-700 rounded-lg py-1 px-2 text-[11px] text-amber-300 font-medium"
                                    >
                                      <option value="member">Üye</option>
                                      <option value="moderator">Moderatör</option>
                                      <option value="admin">Yönetici</option>
                                    </select>
                                  </td>
                                  <td className="py-3 px-4">
                                    {u.is_banned ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                        Engelli
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                        Aktif
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-right space-x-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditUser(u)}
                                      title="Düzenle"
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleUserBan(u)}
                                      title={u.is_banned ? "Engeli Kaldır" : "Engelle"}
                                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                        u.is_banned
                                          ? "text-emerald-400 hover:bg-emerald-500/20"
                                          : "text-rose-400 hover:bg-rose-500/20"
                                      }`}
                                    >
                                      {u.is_banned ? <UserCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteUser(u.id, u.username)}
                                      title="Sil"
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. TEMA VE GÖRÜNÜM STÜDYOSU */}
                {activeTab === "admin_theme" && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-white">Tema & Renk Paleti Stüdyosu</h3>
                        <p className="text-xs text-slate-400">10 hazır preset veya özel renk paletleriyle tüm platformun temasını anında özelleştirin.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleSaveTheme}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        <span>Temayı Kaydet & Uygula</span>
                      </button>
                    </div>

                    {/* Presetler Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {THEME_PRESETS.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => handleApplyPreset(p)}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                            accentColor.toLowerCase() === p.color.toLowerCase()
                              ? "border-amber-400/80 bg-amber-500/10 shadow-lg shadow-amber-500/10"
                              : "border-[#222631] bg-slate-900/60 hover:border-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">{p.name}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-slate-300 font-mono">
                              {p.badge}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 pt-1">
                            <span className="w-5 h-5 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: p.color }} />
                            <span className="w-5 h-5 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: p.bubble }} />
                            <span className="w-5 h-5 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: p.card_bg }} />
                            <span className="w-5 h-5 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: p.main_bg }} />
                          </div>
                          <p className="text-[10px] text-slate-400 line-clamp-2">{p.description}</p>
                        </div>
                      ))}
                    </div>

                    {/* Canlı Balon Önizleme */}
                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Canlı Mesajlaşma Önizlemesi</span>
                      <div className="p-4 rounded-xl space-y-2.5" style={{ backgroundColor: mainBgColor }}>
                        <div className="flex justify-start">
                          <div className="py-2 px-3 rounded-2xl text-xs text-white max-w-xs" style={{ backgroundColor: incomingBubble }}>
                            Harika görünüyor! Temayı değiştirdiğinde anında uygulanıyor mu?
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <div className="py-2 px-3 rounded-2xl text-xs max-w-xs font-medium" style={{ backgroundColor: outgoingBubble, color: effectiveTextColor }}>
                            Evet! CSS değişkenleri ve WebSocket canlı tema senkronizasyonu devrede ⚡
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. GENEL & MARKALAMA */}
                {activeTab === "admin_general" && adminSettings && (
                  <div className="space-y-5 max-w-2xl">
                    <div>
                      <h3 className="text-base font-bold text-white">Genel Platform Parametreleri</h3>
                      <p className="text-xs text-slate-400">Uygulama adı, kayıt izinleri ve varsayılan kullanıcı rolleri.</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                          Uygulama / Site Başlığı
                        </label>
                        <input
                          type="text"
                          value={adminSettings.site_info?.site_name || "Aura"}
                          onChange={(e) =>
                            setAdminSettings({
                              ...adminSettings,
                              site_info: {
                                ...adminSettings.site_info,
                                site_name: e.target.value,
                              },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                        <div>
                          <div className="text-sm font-bold text-white">Yeni Kullanıcı Kayıtları</div>
                          <div className="text-xs text-slate-400">Kapalıysa sadece yöneticiler yeni kullanıcı ekleyebilir.</div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setAdminSettings({
                              ...adminSettings,
                              site_info: {
                                ...adminSettings.site_info,
                                allow_registration: !adminSettings.site_info?.allow_registration,
                              },
                            })
                          }
                          className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer ${
                            adminSettings.site_info?.allow_registration ? "bg-amber-500" : "bg-slate-700"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              adminSettings.site_info?.allow_registration ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      <div className="pt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleSaveAdminSetting("site_info", adminSettings.site_info)}
                          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
                        >
                          <Save className="w-4 h-4" />
                          <span>Genel Ayarları Kaydet</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. SOHBET & MEDYA LİMİTLERİ */}
                {activeTab === "admin_chat" && adminSettings && (
                  <div className="space-y-5 max-w-2xl">
                    <div>
                      <h3 className="text-base font-bold text-white">Sohbet & Medya Parametreleri</h3>
                      <p className="text-xs text-slate-400">Mesaj düzenleme, herkesten silme süreleri ve dosya boyutu limitleri.</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                            Mesaj Düzenleme Limiti (Dakika)
                          </label>
                          <input
                            type="number"
                            value={adminSettings.chat_settings?.edit_time_limit_minutes || 15}
                            onChange={(e) =>
                              setAdminSettings({
                                ...adminSettings,
                                chat_settings: {
                                  ...adminSettings.chat_settings,
                                  edit_time_limit_minutes: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                            Herkesten Silme Limiti (Dakika)
                          </label>
                          <input
                            type="number"
                            value={adminSettings.chat_settings?.delete_time_limit_minutes || 60}
                            onChange={(e) =>
                              setAdminSettings({
                                ...adminSettings,
                                chat_settings: {
                                  ...adminSettings.chat_settings,
                                  delete_time_limit_minutes: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-amber-400"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                            Maksimum Dosya Boyutu (MB)
                          </label>
                          <input
                            type="number"
                            value={adminSettings.media_limits?.max_file_size_mb || 50}
                            onChange={(e) =>
                              setAdminSettings({
                                ...adminSettings,
                                media_limits: {
                                  ...adminSettings.media_limits,
                                  max_file_size_mb: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                            Maksimum Ses Kaydı (Saniye)
                          </label>
                          <input
                            type="number"
                            value={adminSettings.media_limits?.max_voice_seconds || 120}
                            onChange={(e) =>
                              setAdminSettings({
                                ...adminSettings,
                                media_limits: {
                                  ...adminSettings.media_limits,
                                  max_voice_seconds: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-amber-400"
                          />
                        </div>
                      </div>

                      <div className="pt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            handleSaveAdminSetting("chat_settings", adminSettings.chat_settings);
                            handleSaveAdminSetting("media_limits", adminSettings.media_limits);
                          }}
                          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
                        >
                          <Save className="w-4 h-4" />
                          <span>Sohbet & Medya Limitlerini Kaydet</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. ARAMA & WEBRTC */}
                {activeTab === "admin_calls" && adminSettings && (
                  <div className="space-y-5 max-w-2xl">
                    <div>
                      <h3 className="text-base font-bold text-white">LiveKit SFU Sesli & Görüntülü Arama Parametreleri</h3>
                      <p className="text-xs text-slate-400">Sunucu içi WebRTC SFU arama parametreleri ve aktif görüşmeler.</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold text-white">Sesli Arama Özelliği</div>
                          <div className="text-xs text-slate-400">Kullanıcılar 1-e-1 sesli arama başlatabilir.</div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setAdminSettings({
                              ...adminSettings,
                              call_settings: {
                                ...adminSettings.call_settings,
                                enable_audio_calls: !adminSettings.call_settings?.enable_audio_calls,
                              },
                            })
                          }
                          className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer ${
                            adminSettings.call_settings?.enable_audio_calls !== false ? "bg-emerald-500" : "bg-slate-700"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              adminSettings.call_settings?.enable_audio_calls !== false ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                        <div>
                          <div className="text-sm font-bold text-white">Görüntülü Arama & Ekran Paylaşımı</div>
                          <div className="text-xs text-slate-400">Kullanıcılar 1-e-1 video görüşmesi yapabilir.</div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setAdminSettings({
                              ...adminSettings,
                              call_settings: {
                                ...adminSettings.call_settings,
                                enable_video_calls: !adminSettings.call_settings?.enable_video_calls,
                              },
                            })
                          }
                          className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer ${
                            adminSettings.call_settings?.enable_video_calls !== false ? "bg-emerald-500" : "bg-slate-700"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              adminSettings.call_settings?.enable_video_calls !== false ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      <div className="pt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleSaveAdminSetting("call_settings", adminSettings.call_settings)}
                          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
                        >
                          <Save className="w-4 h-4" />
                          <span>Arama Ayarlarını Kaydet</span>
                        </button>
                      </div>
                    </div>

                    {/* Aktif Aramalar Listesi */}
                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Canlı Görüşme Telemetrisi ({activeCalls.length})
                        </span>
                        <button
                          type="button"
                          onClick={loadAdminCallsData}
                          className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {activeCalls.length === 0 ? (
                        <p className="text-xs text-slate-500 py-3 text-center">Şu anda sunucuda aktif bir görüşme bulunmuyor.</p>
                      ) : (
                        <div className="space-y-2">
                          {activeCalls.map((c, i) => (
                            <div key={i} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 text-emerald-400" />
                                <span className="font-semibold text-white">{c.caller_name} ➔ {c.receiver_name}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-medium uppercase ${
                                    c.call_type === "video"
                                      ? "bg-pink-500/20 text-pink-300 border border-pink-500/30"
                                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                  }`}
                                >
                                  {c.call_type === "video" ? "Görüntülü" : "Sesli"}
                                </span>
                                <span className="text-slate-400 font-mono">{c.elapsed_seconds} sn</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 6. GÜVENLİK & İNAKTİVİTE KALKANI */}
                {activeTab === "admin_security" && adminSettings && (
                  <div className="space-y-5 max-w-2xl">
                    <div>
                      <h3 className="text-base font-bold text-white">Sistem Güvenlik & İnaktivite Kalkanı</h3>
                      <p className="text-xs text-slate-400">Oturum zaman aşımı, inaktivite yönlendirmesi ve gece kalkanı takvimi.</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold text-white">İnaktivite Oturum Kapatma Kalkanı</div>
                          <div className="text-xs text-slate-400">Belirlenen süre dokunulmazsa oturum anında kapatılır ve yönlendirilir.</div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setAdminSettings({
                              ...adminSettings,
                              security_settings: {
                                ...adminSettings.security_settings,
                                inactivity_logout_enabled: !adminSettings.security_settings?.inactivity_logout_enabled,
                              },
                            })
                          }
                          className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer ${
                            adminSettings.security_settings?.inactivity_logout_enabled ? "bg-amber-500" : "bg-slate-700"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              adminSettings.security_settings?.inactivity_logout_enabled ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                            İnaktivite Süresi (Dakika)
                          </label>
                          <input
                            type="number"
                            value={adminSettings.security_settings?.inactivity_timeout_minutes || 15}
                            onChange={(e) =>
                              setAdminSettings({
                                ...adminSettings,
                                security_settings: {
                                  ...adminSettings.security_settings,
                                  inactivity_timeout_minutes: Number(e.target.value),
                                },
                              })
                            }
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                            Yönlendirme URL&apos;si
                          </label>
                          <input
                            type="url"
                            value={adminSettings.security_settings?.inactivity_redirect_url || "https://zodiacrf.com"}
                            onChange={(e) =>
                              setAdminSettings({
                                ...adminSettings,
                                security_settings: {
                                  ...adminSettings.security_settings,
                                  inactivity_redirect_url: e.target.value,
                                },
                              })
                            }
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-amber-400"
                          />
                        </div>
                      </div>

                      <div className="pt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleSaveAdminSetting("security_settings", adminSettings.security_settings)}
                          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
                        >
                          <Save className="w-4 h-4" />
                          <span>Güvenlik Parametrelerini Kaydet</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 7. GÜVENLİK GÜNLÜKLERİ & ALARMLAR */}
                {activeTab === "admin_security_logs" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-white">Güvenlik Günlükleri & Alarmlar</h3>
                        <p className="text-xs text-slate-400">Şüpheli oturum denemeleri, kalkan tetiklemeleri ve IP engellemeleri.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleClearAdminSecurityLogs}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-colors cursor-pointer"
                      >
                        Logları Temizle
                      </button>
                    </div>

                    {isAdminSecurityLogsLoading ? (
                      <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                        <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                        <span>Kayıtlar yükleniyor...</span>
                      </div>
                    ) : adminSecurityLogs.length === 0 ? (
                      <p className="py-8 text-center text-xs text-slate-500">Güvenlik günlüğü bulunmuyor.</p>
                    ) : (
                      <div className="space-y-2 max-h-[480px] overflow-y-auto">
                        {adminSecurityLogs.map((log) => (
                          <div key={log.id} className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-3">
                              <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
                              <div>
                                <span className="font-bold text-white block">{log.event_type}</span>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  {log.attempted_username ? `@${log.attempted_username} • ` : log.attempted_login ? `@${log.attempted_login} • ` : ""}
                                  {log.ip_address}
                                  {log.device_info ? ` (${log.device_info})` : ""}
                                </span>
                              </div>
                            </div>
                            <span className="text-[11px] text-slate-500 font-mono">
                              {new Date(log.created_at).toLocaleTimeString("tr-TR")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 8. SİSTEM ERİŞİM LOGLARI */}
                {activeTab === "admin_logs" && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-base font-bold text-white">Sistem Erişim Logları</h3>
                      <p className="text-xs text-slate-400">Tüm kullanıcıların IP, cihaz ve giriş zaman damgaları.</p>
                    </div>

                    {isAdminLogsLoading ? (
                      <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                        <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                        <span>Kayıtlar yükleniyor...</span>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[480px] overflow-y-auto">
                        {adminAccessLogs.map((log, i) => (
                          <div key={i} className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center justify-between text-xs">
                            <div>
                              <span className="font-semibold text-white block">{log.username}</span>
                              <span className="text-[11px] text-slate-400 font-mono">{log.ip_address} • {log.device_info}</span>
                            </div>
                            <span className="text-[11px] text-slate-500">
                              {new Date(log.created_at).toLocaleString("tr-TR")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 9. SİSTEM SAĞLIĞI & TELEMETRİ */}
                {activeTab === "admin_stats" && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-base font-bold text-white">Sistem Sağlığı & Canlı Telemetri</h3>
                      <p className="text-xs text-slate-400">PostgreSQL, Redis, MinIO S3 ve LiveKit sunucu durumu.</p>
                    </div>

                    {/* Sağlık Kartları */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 text-center space-y-1">
                        <Database className="w-5 h-5 text-emerald-400 mx-auto" />
                        <span className="text-xs font-bold text-white block">PostgreSQL</span>
                        <span className="text-[10px] text-emerald-400 font-semibold">Bağlı & Aktif</span>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 text-center space-y-1">
                        <Server className="w-5 h-5 text-rose-400 mx-auto" />
                        <span className="text-xs font-bold text-white block">Redis</span>
                        <span className="text-[10px] text-emerald-400 font-semibold">Pub/Sub Aktif</span>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 text-center space-y-1">
                        <HardDrive className="w-5 h-5 text-amber-400 mx-auto" />
                        <span className="text-xs font-bold text-white block">MinIO S3</span>
                        <span className="text-[10px] text-emerald-400 font-semibold">Depolama Hazır</span>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 text-center space-y-1">
                        <PhoneCall className="w-5 h-5 text-indigo-400 mx-auto" />
                        <span className="text-xs font-bold text-white block">LiveKit SFU</span>
                        <span className="text-[10px] text-emerald-400 font-semibold">WebRTC Hazır</span>
                      </div>
                    </div>

                    {/* İstatistik Sayaçları */}
                    {adminStats && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-slate-900/80 border border-slate-800 text-center">
                        <div>
                          <span className="text-2xl font-extrabold text-white block">{adminStats.total_users}</span>
                          <span className="text-[11px] text-slate-400">Toplam Kullanıcı</span>
                        </div>
                        <div>
                          <span className="text-2xl font-extrabold text-emerald-400 block">{adminStats.online_users}</span>
                          <span className="text-[11px] text-slate-400">Çevrimiçi</span>
                        </div>
                        <div>
                          <span className="text-2xl font-extrabold text-white block">{adminStats.total_messages}</span>
                          <span className="text-[11px] text-slate-400">Mesaj</span>
                        </div>
                        <div>
                          <span className="text-2xl font-extrabold text-indigo-400 block">{adminStats.total_calls}</span>
                          <span className="text-[11px] text-slate-400">Arama</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* KULLANICI DÜZENLEME MODALI (POPUP) */}
        {editingUser && (
          <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className="text-sm font-bold text-white">Kullanıcı Düzenle: @{editingUser.username}</h4>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {editUserError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  {editUserError}
                </div>
              )}

              <form onSubmit={handleSaveUser} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Görünen Ad</label>
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Kullanıcı Adı</label>
                  <input
                    type="text"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">E-posta</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Yeni Şifre (İsteğe Bağlı)</label>
                  <input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Değiştirmek istemiyorsanız boş bırakın"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-3.5 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingUser}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    {isSavingUser ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Kaydet</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
