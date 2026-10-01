"use client";

import React, { useState, useEffect } from "react";
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
import { User } from "@/store/useAuthStore";
import { useSettingsStore, applyThemeToDocument } from "@/store/useSettingsStore";
import { getContrastTextColor, getMutedTextColor } from "@/lib/utils";
import {
  ShieldAlert,
  ArrowLeft,
  Users,
  Sliders,
  MessageSquare,
  PhoneCall,
  Activity,
  FileText,
  Pencil,
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  HardDrive,
  Database,
  Server,
  Cpu,
  Clock,
  Phone,
  Save,
  RefreshCw,
  Ban,
  UserCheck,
  Palette,
  Sparkles,
  Lock,
  Globe,
  Radio,
  Check,
  ChevronRight,
  ExternalLink,
  Send,
  Eye,
  Filter,
  MapPin,
  Smartphone,
} from "lucide-react";

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabType;
}

type TabType =
  | "users"
  | "security_logs"
  | "theme"
  | "general"
  | "chat"
  | "calls"
  | "security"
  | "logs"
  | "stats";

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
    border_color: "#1E2D3D",
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

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<TabType | null>(initialTab || null);
  const [isLoading, setIsLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Settings state
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // Kullanıcı Bilgilerini Düzenleme State'i
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

  // Stats & Logs state
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [detailedHealth, setDetailedHealth] = useState<DetailedHealthResponse | null>(null);
  const [storageBreakdown, setStorageBreakdown] = useState<StorageBreakdownResponse | null>(null);
  const [activeCalls, setActiveCalls] = useState<ActiveCallTelemetry[]>([]);
  const [accessLogs, setAccessLogs] = useState<AdminAccessLog[]>([]);

  // Security Audit Logs state
  const [securityLogs, setSecurityLogs] = useState<AdminSecurityLog[]>([]);
  const [securityStats, setSecurityStats] = useState<AdminSecurityStats | null>(null);
  const [isSecurityLogsLoading, setIsSecurityLogsLoading] = useState(false);
  const [securityEventTypeFilter, setSecurityEventTypeFilter] = useState("all");

  // Theme customizer state
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

  // Handle initialTab changes when opening
  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      } else {
        setActiveTab(null);
      }
    }
  }, [initialTab, isOpen]);

  // Load initial tab data
  useEffect(() => {
    if (!isOpen) return;

    loadSettings();
    loadUsers();
    adminApi.getSecurityStats().then(setSecurityStats).catch(() => {});
    adminApi.getActiveCalls().then((res) => setActiveCalls(res.active_calls || [])).catch(() => {});

    if (activeTab === "users") loadUsers();
    if (activeTab === "stats") loadStats();
    if (activeTab === "calls") loadCallsData();
    if (activeTab === "logs") loadLogs();
    if (activeTab === "security_logs") loadSecurityLogs();
  }, [isOpen, activeTab, securityEventTypeFilter]);

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

  const handleUpdateColor = (updates: Partial<{
    accent: string;
    outgoing: string;
    text: string;
    mainBg: string;
    cardBg: string;
    border: string;
    incoming: string;
  }>) => {
    const newAcc = updates.accent ?? accentColor;
    const newOut = updates.outgoing ?? outgoingBubble;
    const newTxt = updates.text ?? outgoingText;
    const newMbg = updates.mainBg ?? mainBgColor;
    const newCrd = updates.cardBg ?? cardBgColor;
    const newBrd = updates.border ?? borderColor;
    const newInc = updates.incoming ?? incomingBubble;

    if (updates.accent !== undefined) setAccentColor(newAcc);
    if (updates.outgoing !== undefined) setOutgoingBubble(newOut);
    if (updates.text !== undefined) setOutgoingText(newTxt);
    if (updates.mainBg !== undefined) setMainBgColor(newMbg);
    if (updates.cardBg !== undefined) setCardBgColor(newCrd);
    if (updates.border !== undefined) setBorderColor(newBrd);
    if (updates.incoming !== undefined) setIncomingBubble(newInc);

    applyThemeToDocument({
      primary_color: newAcc,
      outgoing_bubble: newOut,
      outgoing_text: newTxt,
      main_bg: newMbg,
      card_bg: newCrd,
      border_color: newBrd,
      incoming_bubble: newInc,
    });
  };

  const loadSettings = async () => {
    setIsSettingsLoading(true);
    setSettingsError(null);
    try {
      const data = await adminApi.getSettings();
      setSettings(data);
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
      console.error("Ayarlar yüklenemedi", e);
      setSettingsError(e.response?.data?.error || "Ayarlar yüklenemedi.");
    } finally {
      setIsSettingsLoading(false);
    }
  };

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const res = await adminApi.getUsers({
        search: searchQuery,
        role: roleFilter,
        limit: 50,
      });
      setUsers(res.users);
      setTotalUsers(res.total);
    } catch (e) {
      console.error("Kullanıcılar alınamadı", e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const [res, health, storage] = await Promise.all([
        adminApi.getStats().catch(() => null),
        adminApi.getDetailedHealth().catch(() => null),
        adminApi.getStorageBreakdown().catch(() => null),
      ]);
      if (res) setStats(res);
      if (health) setDetailedHealth(health);
      if (storage) setStorageBreakdown(storage);
    } catch (e) {
      console.error("İstatistikler alınamadı", e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCallsData = async () => {
    try {
      const res = await adminApi.getActiveCalls();
      setActiveCalls(res.active_calls || []);
    } catch (e) {
      console.error("Aktif aramalar alınamadı", e);
    }
  };

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const res = await adminApi.getAccessLogs(50);
      setAccessLogs(res);
    } catch (e) {
      console.error("Günlükler alınamadı", e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSecurityLogs = async () => {
    setIsSecurityLogsLoading(true);
    try {
      const filter = securityEventTypeFilter === "all" ? undefined : securityEventTypeFilter;
      const [logs, statsData] = await Promise.all([
        adminApi.getSecurityLogs(100, filter),
        adminApi.getSecurityStats(),
      ]);
      setSecurityLogs(logs || []);
      setSecurityStats(statsData || null);
    } catch (e) {
      console.error("Güvenlik kayıtları alınamadı", e);
    } finally {
      setIsSecurityLogsLoading(false);
    }
  };

  const handleClearSecurityLogs = async () => {
    if (!window.confirm("Tüm güvenlik ihlali ve kayıtlarını temizlemek istediğinize emin misiniz?")) return;
    try {
      await adminApi.clearSecurityLogs();
      setSecurityLogs([]);
      if (securityStats) {
        setSecurityStats({
          ...securityStats,
          total_logs: 0,
          last_24h_logs: 0,
        });
      }
      setSaveSuccess("Güvenlik kayıtları temizlendi.");
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (e) {
      console.error("Güvenlik kayıtları temizlenemedi", e);
    }
  };

  const handleSaveSetting = async (key: string, value: any) => {
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
      setSaveSuccess(`"${key}" parametreleri kaydedildi!`);
      setTimeout(() => setSaveSuccess(null), 3000);
      loadSettings();
    } catch (e) {
      alert("Ayar kaydedilirken bir hata oluştu.");
    }
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
    await handleSaveSetting("theme_settings", updatedTheme);
  };

  const handleUpdateUserRole = async (user: User, newRole: string) => {
    try {
      await adminApi.updateUser(user.id, {
        role: newRole,
        is_banned: user.is_banned || false,
        ban_reason: user.ban_reason || "",
      });
      loadUsers();
    } catch (e) {
      alert("Rol güncellenemedi.");
    }
  };

  const handleToggleUserBan = async (user: User) => {
    const nextBanStatus = !user.is_banned;
    const reason = nextBanStatus
      ? prompt("Yasaklama gerekçesi (isteğe bağlı):") || "Yönetici tarafından askıya alındı"
      : "";

    try {
      await adminApi.updateUser(user.id, {
        role: user.role || "member",
        is_banned: nextBanStatus,
        ban_reason: reason,
      });
      loadUsers();
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
      loadUsers();
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
      setSaveSuccess(`@${editUsername} kullanıcısının bilgileri güncellendi!`);
      setTimeout(() => setSaveSuccess(null), 3500);
      setEditingUser(null);
      loadUsers();
    } catch (err: any) {
      setEditUserError(err?.response?.data?.error || "Kullanıcı güncellenemedi.");
    } finally {
      setIsSavingUser(false);
    }
  };

  if (!isOpen) return null;

  const NAV_ITEMS: {
    id: NonNullable<TabType>;
    label: string;
    desc: string;
    icon: any;
    color: string;
    badge?: string;
  }[] = [
    {
      id: "users",
      label: `Kullanıcı Yönetimi`,
      desc: "Kullanıcı hesapları, roller, yetkiler, şifre sıfırlama ve banlama",
      icon: Users,
      color: "from-blue-600 to-indigo-600 text-blue-300",
      badge: `${totalUsers} Kullanıcı`,
    },
    {
      id: "security_logs",
      label: "Güvenlik Günlükleri & Alarmlar",
      desc: "Kaba kuvvet, şüpheli oturumlar ve canlı tehdit kalkanı logları",
      icon: ShieldAlert,
      color: "from-rose-600 to-red-600 text-rose-300",
      badge: securityStats && securityStats.last_24h_logs > 0 ? `${securityStats.last_24h_logs} yeni ihlal` : undefined,
    },
    {
      id: "security",
      label: "Güvenlik & Kalkan Parametreleri",
      desc: "Kaba kuvvet eşikleri, oturum süreleri ve mesaj hız limitleri",
      icon: Lock,
      color: "from-amber-600 to-orange-600 text-amber-300",
    },
    {
      id: "theme",
      label: "Tema, Renkler & Görünüm",
      desc: "Grupo Chat hazır renk paletleri, mesaj balonları ve CSS stilleri",
      icon: Palette,
      color: "from-pink-600 to-rose-600 text-pink-300",
    },
    {
      id: "general",
      label: "Genel Sistem & Markalama",
      desc: "Platform adı, logo, kayıt olma izinleri ve bakım modu",
      icon: Globe,
      color: "from-emerald-600 to-teal-600 text-emerald-300",
    },
    {
      id: "chat",
      label: "Sohbet & Medya Limitleri",
      desc: "Maksimum dosya boyutu, mesaj düzenleme ve herkesten silme süreleri",
      icon: MessageSquare,
      color: "from-cyan-600 to-blue-600 text-cyan-300",
    },
    {
      id: "calls",
      label: "Arama & WebRTC Telemetrisi",
      desc: "LiveKit SFU sunucusu, sesli ve görüntülü arama izinleri",
      icon: PhoneCall,
      color: "from-purple-600 to-violet-600 text-purple-300",
      badge: activeCalls.length > 0 ? `${activeCalls.length} canlı görüşme` : undefined,
    },
    {
      id: "logs",
      label: "Erişim & Konum Kayıtları",
      desc: "Kullanıcı giriş IP'leri, cihaz bilgileri ve coğrafi konum geçmişi",
      icon: FileText,
      color: "from-slate-600 to-zinc-600 text-slate-300",
    },
    {
      id: "stats",
      label: "Sistem Sağlığı & Depolama",
      desc: "PostgreSQL, Redis, MinIO S3 ve sunucu yük durumu telemetrisi",
      icon: Activity,
      color: "from-green-600 to-emerald-600 text-green-300",
    },
  ];

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden select-none">
      {/* Karartma Katmanı (Backdrop) */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      />

      {/* AURA SOL ÇEKMECE PANELİ (WhatsApp Tarzı Kayan Çekmece) */}
      <div className="fixed inset-y-0 left-0 max-w-full flex z-[100]">
        <div className="w-screen max-w-full md:max-w-3xl lg:max-w-4xl h-[100dvh] bg-[#0D0F14] border-r border-[#222631] shadow-2xl flex flex-col animate-in slide-in-from-left duration-250 text-slate-200 relative">
          {/* Ayarlar Kaydedildi Kayan Toast Bildirimi */}
          {saveSuccess && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-emerald-600/95 text-white text-xs font-bold shadow-2xl shadow-emerald-950/80 border border-emerald-400/30 flex items-center gap-2 animate-in fade-in slide-in-from-top-3 duration-300 pointer-events-none backdrop-blur-md whitespace-nowrap">
              <CheckCircle2 className="w-4 h-4 text-emerald-200 flex-shrink-0" />
              <span>{saveSuccess}</span>
            </div>
          )}

          {/* Çekmece Üst Başlığı (Header) */}
          <div className="flex items-center justify-between px-3.5 sm:px-5 py-3 sm:py-4 border-b border-[#222631] bg-[#12151C] flex-shrink-0">
            {activeTab === null ? (
              <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
                <div className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-gradient-to-tr from-pink-600 to-rose-500 flex items-center justify-center text-white shadow-md shadow-pink-950/40 flex-shrink-0">
                  <ShieldAlert className="w-4 sm:w-5 h-4 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <h2 className="text-xs sm:text-sm font-bold text-white tracking-wide truncate">
                      Sistem Yönetim & Parametreleri
                    </h2>
                    <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded-full bg-pink-500/20 text-pink-400 border border-pink-500/30 flex-shrink-0">
                      Aura
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                    Yapılandırma, temalar, izinler ve limitler
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setActiveTab(null)}
                  className="p-1.5 sm:p-2 -ml-1 text-slate-300 hover:text-white rounded-xl hover:bg-slate-800/80 transition-all flex items-center gap-1.5 cursor-pointer group"
                  title="Ana Menüye Dön"
                >
                  <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform text-pink-400" />
                  <span className="text-xs font-bold text-slate-400 group-hover:text-white hidden sm:inline">Geri</span>
                </button>
                <div className="h-5 w-px bg-[#222631] mx-0.5 sm:mx-1" />
                <div className="min-w-0">
                  <h2 className="text-xs sm:text-sm font-bold text-white tracking-wide truncate">
                    {NAV_ITEMS.find((n) => n.id === activeTab)?.label || "Yönetim Paneli"}
                  </h2>
                  <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                    {NAV_ITEMS.find((n) => n.id === activeTab)?.desc || "Sistem yapılandırma alanı"}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-2">
              {saveSuccess && (
                <span className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full animate-in fade-in">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {saveSuccess}
                </span>
              )}
              <button
                onClick={onClose}
                title="Paneli Kapat"
                className="p-1.5 sm:p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/80 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Ana Gövde */}
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 md:p-6 bg-[#0B0D12]">
            {/* WHATSAPP TARZI DİKEY ANA MENÜ (activeTab === null) */}
            {activeTab === null && (
              <div className="space-y-4 max-w-3xl mx-auto">
                <div className="px-1 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                  <span>Yönetim ve Yapılandırma Modülleri</span>
                  <span className="text-[10px] text-slate-600 font-normal">{NAV_ITEMS.length} Modül</span>
                </div>

                <div className="space-y-2.5">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        className="w-full flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-[#12151E] hover:bg-[#181D29] active:bg-[#1E2333] border border-[#222635] hover:border-pink-500/30 transition-all duration-150 cursor-pointer text-left group shadow-xs hover:shadow-md"
                      >
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <div className={`w-10 h-10 rounded-2xl bg-gradient-to-tr ${item.color} flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform`}>
                            <Icon className="w-5 h-5 text-white" />
                          </div>
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-bold text-white group-hover:text-pink-300 transition-colors truncate">
                                {item.label}
                              </span>
                              {item.badge && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-400 font-semibold border border-pink-500/20 whitespace-nowrap">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 line-clamp-1">
                              {item.desc}
                            </p>
                          </div>
                        </div>

                        <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-pink-400 group-hover:translate-x-1 transition-all flex-shrink-0 ml-2" />
                      </button>
                    );
                  })}
                </div>

                <div className="pt-4 border-t border-[#1C202C] mt-6 flex items-center justify-between text-xs text-slate-500 px-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Aura Çekirdek Sistemi: Çevrimiçi</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-600">v1.0.0</span>
                </div>
              </div>
            )}
              
              {/* TAB 1: KULLANICI YÖNETİMİ */}
              {activeTab === "users" && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Kullanıcı adı veya ad ara..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && loadUsers()}
                        className="w-full bg-[#141720] border border-[#252936] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/60"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        className="flex-1 sm:flex-initial bg-[#141720] border border-[#252936] rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none"
                      >
                        <option value="all">Tüm Roller</option>
                        <option value="admin">Admin</option>
                        <option value="moderator">Moderatör</option>
                        <option value="member">Üye</option>
                      </select>

                      <button
                        onClick={loadUsers}
                        className="p-2 bg-[#141720] border border-[#252936] rounded-xl hover:bg-[#202534] text-slate-300 transition-colors cursor-pointer flex-shrink-0"
                        title="Yenile"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {users.map((u) => {
                      const isOnline = u.online_status === 1;
                      const isAdmin = u.role === "admin";
                      const isMod = u.role === "moderator";

                      return (
                        <div
                          key={u.id}
                          className="p-3.5 sm:p-4 rounded-2xl bg-[#12151D] border border-[#222634] hover:border-slate-700/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md"
                        >
                          {/* Sol: Avatar + İsimler + Rozetler */}
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="relative flex-shrink-0">
                              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-700 border border-slate-700 flex items-center justify-center font-bold text-sm text-pink-400 overflow-hidden shadow-inner">
                                {u.avatar_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={u.avatar_url}
                                    alt={u.display_name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  u.display_name?.charAt(0).toUpperCase() || "U"
                                )}
                              </div>
                              {isOnline && (
                                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#12151D]" />
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs sm:text-sm font-bold text-white truncate">
                                  {u.display_name}
                                </span>

                                {/* Rol Rozeti */}
                                {isAdmin ? (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                                    <ShieldAlert className="w-3 h-3 text-purple-400" />
                                    Yönetici
                                  </span>
                                ) : isMod ? (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                                    Moderatör
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60">
                                    Üye
                                  </span>
                                )}

                                {/* Yasaklı Rozeti */}
                                {u.is_banned && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40">
                                    YASAKLI
                                  </span>
                                )}
                              </div>

                              <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
                                <span className="font-mono text-slate-300">@{u.username}</span>
                                <span className="text-slate-600">•</span>
                                <span className="truncate">{u.email}</span>
                              </div>
                            </div>
                          </div>

                          {/* Sağ: Eylem Butonları */}
                          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-[#222634]">
                            {/* Düzenle Butonu */}
                            <button
                              onClick={() => handleOpenEditUser(u)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/35 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-semibold transition-colors cursor-pointer"
                              title="Kullanıcı Bilgilerini Düzenle"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Düzenle</span>
                            </button>

                            {/* Yasakla / Yasağı Kaldır */}
                            <button
                              onClick={() => handleToggleUserBan(u)}
                              title={u.is_banned ? "Yasağı Kaldır" : "Kullanıcıyı Yasakla"}
                              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                                u.is_banned
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                                  : "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                              }`}
                            >
                              {u.is_banned ? <UserCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                            </button>

                            {/* Kalıcı Sil */}
                            <button
                              onClick={() => handleDeleteUser(u.id, u.username)}
                              title="Kullanıcıyı Kalıcı Sil"
                              className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/80 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {users.length === 0 && (
                      <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                        Kriterlere uygun kullanıcı bulunamadı.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: GÜVENLİK GÜNLÜKLERİ & YETKİSİZ GİRİŞ İHLALLERİ */}
              {activeTab === "security_logs" && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  {/* Başlık ve Butonlar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#12151D] border border-[#222631] rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                        <ShieldAlert className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <span>Güvenlik Günlükleri & Yetkisiz Girişler</span>
                          {securityStats && securityStats.last_24h_logs > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold border border-red-500/30">
                              {securityStats.last_24h_logs} Yeni Olay
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-slate-400">
                          Kayıtsız hesaplarla yapılan giriş denemeleri, şüpheli IP adresleri ve güvenlik botu kayıtları
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={loadSecurityLogs}
                        disabled={isSecurityLogsLoading}
                        className="flex items-center gap-1.5 px-3 py-2 bg-[#181B24] border border-[#292D38] rounded-xl text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSecurityLogsLoading ? "animate-spin" : ""}`} />
                        <span>Yenile</span>
                      </button>
                      <button
                        onClick={handleClearSecurityLogs}
                        disabled={securityLogs.length === 0}
                        className="flex items-center gap-1.5 px-3 py-2 bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 rounded-xl text-xs text-red-300 hover:text-red-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Temizle</span>
                      </button>
                    </div>
                  </div>

                  {/* Özet İstatistik Kartları */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-[11px] font-semibold uppercase">Toplam Olay</span>
                        <ShieldAlert className="w-4 h-4 text-red-400" />
                      </div>
                      <div className="mt-2">
                        <div className="text-xl font-bold text-white font-mono">
                          {securityStats?.total_logs ?? securityLogs.length}
                        </div>
                        <span className="text-[10px] text-slate-500">Tüm zamanlar</span>
                      </div>
                    </div>

                    <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-[11px] font-semibold uppercase">Son 24 Saat</span>
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="mt-2">
                        <div className="text-xl font-bold text-amber-400 font-mono">
                          {securityStats?.last_24h_logs ?? 0}
                        </div>
                        <span className="text-[10px] text-slate-500">Aktif tehdit / deneme</span>
                      </div>
                    </div>

                    <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-[11px] font-semibold uppercase">Farklı IP Sayısı</span>
                        <Globe className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="mt-2">
                        <div className="text-xl font-bold text-blue-400 font-mono">
                          {securityStats?.unique_ips ?? 0}
                        </div>
                        <span className="text-[10px] text-slate-500">Kaynak adresi</span>
                      </div>
                    </div>

                    <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-[11px] font-semibold uppercase">En Çok Hedeflenen</span>
                        <Lock className="w-4 h-4 text-purple-400" />
                      </div>
                      <div className="mt-2 truncate">
                        <div className="text-sm font-bold text-purple-300 font-mono truncate">
                          {securityStats?.top_target_username ? `@${securityStats.top_target_username}` : "—"}
                        </div>
                        <span className="text-[10px] text-slate-500">Hedef hesap</span>
                      </div>
                    </div>
                  </div>

                  {/* Güvenlik Botu Bilgilendirme Kutusu */}
                  <div className="p-3.5 bg-gradient-to-r from-red-950/30 to-amber-950/20 border border-red-500/20 rounded-2xl flex items-start gap-3">
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-300 leading-relaxed">
                      <b className="text-white font-medium">Aura Otomatik Güvenlik Botu (@security): </b>
                      Kayıtlı olmayan kullanıcı adları ile giriş denendiğinde veya şüpheli oturum isteklerinde tüm çevrimiçi kullanıcılara anlık alarm iletilir ve durum akışında güvenlik uyarısı hikayesi otomatik olarak yayınlanır (15 dk koruma limiti).
                    </div>
                  </div>

                  {/* Filtre Barı */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Filter className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs text-slate-400">Olay Türü:</span>
                      <select
                        value={securityEventTypeFilter}
                        onChange={(e) => {
                          setSecurityEventTypeFilter(e.target.value);
                        }}
                        className="bg-[#141720] border border-[#252936] rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none focus:border-red-500/50 cursor-pointer"
                      >
                        <option value="all">Tüm Güvenlik Olayları</option>
                        <option value="unknown_user_login">Kayıtsız Kullanıcı Girişi</option>
                        <option value="failed_password_login">Hatalı Şifre Denemesi</option>
                        <option value="rate_limit_exceeded">Hız Sınırı Aşımı</option>
                      </select>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Gösterilen: {securityLogs.length} kayıt
                    </span>
                  </div>

                  {/* Kayıtlar Tablosu */}
                  <div className="border border-[#222631] rounded-2xl overflow-hidden bg-[#10131A]">
                    <div className="overflow-x-auto -mx-1 sm:mx-0">
                      <table className="w-full text-left text-xs min-w-[620px]">
                        <thead className="bg-[#141720] border-b border-[#222631] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="py-2.5 px-3 sm:px-3.5">Olay Türü</th>
                            <th className="py-2.5 px-3 sm:px-3.5">Hedef Kullanıcı</th>
                            <th className="py-2.5 px-3 sm:px-3.5">IP Adresi</th>
                            <th className="py-2.5 px-3 sm:px-3.5">Cihaz / Tarayıcı</th>
                            <th className="py-2.5 px-3 sm:px-3.5">Şiddet</th>
                            <th className="py-2.5 px-3 sm:px-3.5 text-right">Tarih</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1D212B]">
                          {securityLogs.map((log) => {
                            const isUnknownUser = log.event_type === "unknown_user_login" || log.event_type === "unknown_user_attempt";
                            const isFailedPassword = log.event_type === "failed_password_login" || log.event_type === "failed_password_attempt";
                            const isConcurrent = log.event_type === "concurrent_session_login";

                            let location = "";
                            if (log.details) {
                              if (typeof log.details === "object" && (log.details as any).location) {
                                location = (log.details as any).location;
                              } else if (typeof log.details === "string") {
                                try {
                                  const parsed = JSON.parse(log.details);
                                  location = parsed.location || "";
                                } catch {}
                              }
                            }

                            const severity = log.severity || (isUnknownUser ? "critical" : "high");
                            const attemptedUser = log.attempted_username || log.attempted_login || "—";

                            return (
                              <tr key={log.id} className="hover:bg-[#151922] transition-colors">
                                <td className="py-2.5 px-3 sm:px-3.5 font-semibold">
                                  {isUnknownUser ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/15 text-red-400 border border-red-500/30 text-[10px]">
                                      <ShieldAlert className="w-3 h-3" /> Kayıtsız Kullanıcı
                                    </span>
                                  ) : isFailedPassword ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px]">
                                      <Lock className="w-3 h-3" /> Hatalı Şifre
                                    </span>
                                  ) : isConcurrent ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px]">
                                      <Smartphone className="w-3 h-3" /> Çoklu Oturum
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-400 border border-purple-500/30 text-[10px]">
                                      <AlertTriangle className="w-3 h-3" /> {log.event_type}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 sm:px-3.5 font-mono font-bold text-white">
                                  @{attemptedUser}
                                </td>
                                <td className="py-2.5 px-3 sm:px-3.5">
                                  <div className="font-mono text-red-300 text-xs font-semibold">{log.ip_address}</div>
                                  {location ? (
                                    <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5" title={location}>
                                      <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                                      <span className="truncate max-w-[150px]">{location}</span>
                                    </div>
                                  ) : (
                                    <div className="text-[10px] text-slate-500">Konum Yok</div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 sm:px-3.5 text-slate-300 truncate max-w-[160px] sm:max-w-[200px]" title={log.device_info || log.user_agent}>
                                  {log.device_info || log.user_agent || "Bilinmeyen Cihaz"}
                                </td>
                                <td className="py-2.5 px-3 sm:px-3.5">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                      severity === "critical"
                                        ? "bg-red-600/30 text-red-300 border border-red-500/40"
                                        : severity === "high"
                                        ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                                        : "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
                                    }`}
                                  >
                                    {severity}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 sm:px-3.5 text-right text-slate-400 whitespace-nowrap font-mono text-[11px]">
                                  {new Date(log.created_at).toLocaleString("tr-TR")}
                                </td>
                              </tr>
                            );
                          })}
                          {securityLogs.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-10 text-center text-slate-500 text-xs">
                                <div className="flex flex-col items-center gap-2">
                                  <CheckCircle2 className="w-7 h-7 text-emerald-500/50" />
                                  <span>Kayıtlı herhangi bir güvenlik ihlali veya yetkisiz giriş bulunamadı.</span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: MERKEZİ SİSTEM TEMASI & RENK PARAMETRELERİ */}
              {activeTab === "theme" && (
                <div className="space-y-6">
                  {/* 1. KÜRATORLÜ PREMİUM KOYU TEMA KARTLARI */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Küratörlü Koyu Mod Koleksiyonu (9 Önayar)</span>
                      </div>
                      <span className="text-[11px] text-slate-400">Tek tıkla tüm platformu dönüştürün</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {THEME_PRESETS.map((p) => {
                        const isSelected =
                          outgoingBubble.toLowerCase() === p.bubble.toLowerCase() &&
                          accentColor.toLowerCase() === p.color.toLowerCase() &&
                          mainBgColor.toLowerCase() === p.main_bg.toLowerCase();

                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleApplyPreset(p)}
                            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 relative group overflow-hidden ${
                              isSelected
                                ? "border-indigo-400/80 bg-slate-800/80 shadow-lg shadow-indigo-950/40 ring-2 ring-indigo-500/50 scale-[1.01]"
                                : "border-[#222631] bg-[#12151D] hover:border-slate-700 hover:bg-[#161A24]"
                            }`}
                          >
                            {/* Başlık ve Rozet */}
                            <div className="flex items-center justify-between gap-1 w-full">
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                                  <span>{p.name}</span>
                                </div>
                                <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                                  {p.description}
                                </div>
                              </div>
                              <span
                                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 border"
                                style={{
                                  backgroundColor: `${p.color}18`,
                                  color: p.color,
                                  borderColor: `${p.color}35`,
                                }}
                              >
                                {p.badge}
                              </span>
                            </div>

                            {/* Mini Arayüz / Balon Mockup Görseli */}
                            <div
                              className="w-full rounded-xl p-2.5 border space-y-1.5 shadow-inner"
                              style={{
                                backgroundColor: p.main_bg,
                                borderColor: p.border_color,
                              }}
                            >
                              {/* Mini Gelen Mesaj */}
                              <div className="flex justify-start">
                                <div
                                  className="px-2 py-1 rounded-lg rounded-bl-none text-[10px] text-slate-300 border max-w-[85%]"
                                  style={{
                                    backgroundColor: p.incoming_bubble,
                                    borderColor: p.border_color,
                                  }}
                                >
                                  SaaS koyu mod harika!
                                </div>
                              </div>

                              {/* Mini Giden Mesaj */}
                              <div className="flex justify-end">
                                <div
                                  className="px-2 py-1 rounded-lg rounded-br-none text-[10px] shadow-sm max-w-[85%]"
                                  style={{
                                    backgroundColor: p.bubble,
                                    color: p.text,
                                  }}
                                >
                                  Kusursuz görünüyor ✓✓
                                </div>
                              </div>
                            </div>

                            {/* Alt Palet Renk Noktaları & Seçim İşareti */}
                            <div className="flex items-center justify-between pt-1 border-t border-white/5 w-full">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-xs"
                                  style={{ backgroundColor: p.color }}
                                  title={`Vurgu: ${p.color}`}
                                />
                                <span
                                  className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-xs"
                                  style={{ backgroundColor: p.bubble }}
                                  title={`Giden Balon: ${p.bubble}`}
                                />
                                <span
                                  className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-xs"
                                  style={{ backgroundColor: p.incoming_bubble }}
                                  title={`Gelen Balon: ${p.incoming_bubble}`}
                                />
                                <span
                                  className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-xs"
                                  style={{ backgroundColor: p.main_bg }}
                                  title={`Arka Plan: ${p.main_bg}`}
                                />
                              </div>
                              {isSelected && (
                                <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-400">
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Aktif</span>
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. ÖZEL RENK & TİPOGRAFİ İNCE AYARI */}
                  <div className="p-4 rounded-2xl bg-[#12151D] border border-[#222631] space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-indigo-400" />
                        <span>Özel Renk & Tipografi İnce Ayarı</span>
                      </div>
                      <span className="text-[10px] text-indigo-400 font-medium">Anında Canlı Önizleme</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {/* 1. Ana Vurgu Rengi */}
                      <div className="p-3 rounded-xl bg-[#161922] border border-[#252936]">
                        <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                          Ana Vurgu Rengi (Butonlar/İkonlar)
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={accentColor}
                            onChange={(e) => handleUpdateColor({ accent: e.target.value })}
                            className="flex-1 bg-[#10131A] border border-[#292D38] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                          />
                          <input
                            type="color"
                            value={accentColor.startsWith("#") ? accentColor : "#6366F1"}
                            onChange={(e) => handleUpdateColor({ accent: e.target.value })}
                            className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                            title="Vurgu Rengi Seç"
                          />
                        </div>
                      </div>

                      {/* 2. Giden Mesaj Balon Rengi */}
                      <div className="p-3 rounded-xl bg-[#161922] border border-[#252936]">
                        <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                          Giden Mesaj Balon Rengi
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={outgoingBubble}
                            onChange={(e) => handleUpdateColor({ outgoing: e.target.value })}
                            className="flex-1 bg-[#10131A] border border-[#292D38] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                          />
                          <input
                            type="color"
                            value={outgoingBubble.startsWith("#") ? outgoingBubble : "#4F46E5"}
                            onChange={(e) => handleUpdateColor({ outgoing: e.target.value })}
                            className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                            title="Giden Balon Rengi Seç"
                          />
                        </div>
                      </div>

                      {/* 3. Giden Mesaj Yazı Rengi */}
                      <div className="p-3 rounded-xl bg-[#161922] border border-[#252936]">
                        <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                          Giden Mesaj Yazı Rengi
                        </label>
                        <div className="flex items-center gap-2">
                          <select
                            value={
                              outgoingText === "auto" ||
                              outgoingText === "#FFFFFF" ||
                              outgoingText === "#0F172A"
                                ? outgoingText
                                : "custom"
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val !== "custom") {
                                handleUpdateColor({ text: val });
                              }
                            }}
                            className="flex-1 bg-[#10131A] border border-[#292D38] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none cursor-pointer"
                          >
                            <option value="auto">Otomatik (Akıllı Kontrast)</option>
                            <option value="#FFFFFF">Beyaz (#FFFFFF)</option>
                            <option value="#0F172A">Koyu Siyah (#0F172A)</option>
                            <option value="custom">Özel Hex Seç...</option>
                          </select>
                          <input
                            type="color"
                            value={effectiveTextColor.startsWith("#") ? effectiveTextColor : "#FFFFFF"}
                            onChange={(e) => handleUpdateColor({ text: e.target.value })}
                            className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                            title="Özel Yazı Rengi Seç"
                          />
                        </div>
                      </div>

                      {/* 4. Gelen Mesaj Balon Rengi */}
                      <div className="p-3 rounded-xl bg-[#161922] border border-[#252936]">
                        <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                          Gelen Mesaj Balon Rengi
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={incomingBubble}
                            onChange={(e) => handleUpdateColor({ incoming: e.target.value })}
                            className="flex-1 bg-[#10131A] border border-[#292D38] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                          />
                          <input
                            type="color"
                            value={incomingBubble.startsWith("#") ? incomingBubble : "#181C28"}
                            onChange={(e) => handleUpdateColor({ incoming: e.target.value })}
                            className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                            title="Gelen Balon Rengi Seç"
                          />
                        </div>
                      </div>

                      {/* 5. Panel ve Kart Zemin Rengi */}
                      <div className="p-3 rounded-xl bg-[#161922] border border-[#252936]">
                        <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                          Panel ve Kart Zemin Rengi
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={cardBgColor}
                            onChange={(e) => handleUpdateColor({ cardBg: e.target.value })}
                            className="flex-1 bg-[#10131A] border border-[#292D38] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                          />
                          <input
                            type="color"
                            value={cardBgColor.startsWith("#") ? cardBgColor : "#11141E"}
                            onChange={(e) => handleUpdateColor({ cardBg: e.target.value })}
                            className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                            title="Kart Rengi Seç"
                          />
                        </div>
                      </div>

                      {/* 6. Ana Zemin / Canvas Rengi */}
                      <div className="p-3 rounded-xl bg-[#161922] border border-[#252936]">
                        <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                          Ana Zemin / Canvas Rengi
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={mainBgColor}
                            onChange={(e) => handleUpdateColor({ mainBg: e.target.value })}
                            className="flex-1 bg-[#10131A] border border-[#292D38] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                          />
                          <input
                            type="color"
                            value={mainBgColor.startsWith("#") ? mainBgColor : "#090A0F"}
                            onChange={(e) => handleUpdateColor({ mainBg: e.target.value })}
                            className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                            title="Ana Zemin Rengi Seç"
                          />
                        </div>
                      </div>

                      {/* 7. Kenarlık & Ayraç Rengi */}
                      <div className="p-3 rounded-xl bg-[#161922] border border-[#252936]">
                        <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                          Kenarlık & Ayraç Rengi
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={borderColor}
                            onChange={(e) => handleUpdateColor({ border: e.target.value })}
                            className="flex-1 bg-[#10131A] border border-[#292D38] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                          />
                          <input
                            type="color"
                            value={borderColor.startsWith("#") ? borderColor : "#1E2333"}
                            onChange={(e) => handleUpdateColor({ border: e.target.value })}
                            className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                            title="Kenarlık Rengi Seç"
                          />
                        </div>
                      </div>

                      {/* 8. Tipografi & Font Family */}
                      <div className="p-3 rounded-xl bg-[#161922] border border-[#252936]">
                        <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                          Tipografi (Font Family)
                        </label>
                        <select
                          value={fontFamily}
                          onChange={(e) => setFontFamily(e.target.value)}
                          className="w-full bg-[#10131A] border border-[#292D38] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                        >
                          <option value="Inter">Inter (Varsayılan SaaS)</option>
                          <option value="Roboto">Roboto</option>
                          <option value="Poppins">Poppins Modern</option>
                          <option value="Outfit">Outfit Minimalist</option>
                          <option value="System">Sistem Varsayılanı</option>
                        </select>
                      </div>
                    </div>

                    {/* Akıllı Kontrast Bilgisi */}
                    <div className="flex items-center gap-2 text-[11px] text-slate-300 bg-[#0E1017] p-2.5 rounded-xl border border-[#222631]">
                      <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <span>
                        <strong>Akıllı Yazı Rengi:</strong> Otomatik mod açıkken giden balonun rengine göre yazı rengi maksimum kontrast (beyaz veya koyu) için otomatik adapte edilir.
                      </span>
                    </div>
                  </div>

                  {/* 3. CANLI SOHBET SİMÜLATÖRÜ / ÖNİZLEME */}
                  <div
                    className="p-4 rounded-2xl border space-y-3 transition-colors duration-200 shadow-xl"
                    style={{
                      backgroundColor: mainBgColor,
                      borderColor: borderColor,
                    }}
                  >
                    <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: borderColor }}>
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs"
                          style={{
                            backgroundColor: cardBgColor,
                            color: accentColor,
                            border: `1px solid ${borderColor}`,
                          }}
                        >
                          A
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white leading-tight">Antigravity Aura</div>
                          <div className="text-[10px] text-emerald-400 font-medium leading-tight">Çevrimiçi</div>
                        </div>
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Canlı Sohbet Önizlemesi
                      </div>
                    </div>

                    {/* Mesaj Akışı */}
                    <div className="space-y-2 py-1">
                      {/* Gelen Mesaj */}
                      <div className="flex justify-start">
                        <div
                          className="px-3.5 py-2 rounded-2xl rounded-bl-xs text-xs border max-w-[85%] shadow-sm transition-colors duration-200"
                          style={{
                            backgroundColor: incomingBubble,
                            borderColor: borderColor,
                            color: getContrastTextColor(incomingBubble),
                          }}
                        >
                          <div>Yeni SaaS koyu mod teması nasıl duruyor?</div>
                          <div
                            className="text-[10px] text-right mt-0.5"
                            style={{
                              color: getMutedTextColor(incomingBubble, getContrastTextColor(incomingBubble)),
                            }}
                          >
                            14:30
                          </div>
                        </div>
                      </div>

                      {/* Giden Mesaj */}
                      <div className="flex justify-end">
                        <div
                          className="px-3.5 py-2 rounded-2xl rounded-br-xs text-xs shadow-md max-w-[85%] transition-all duration-200"
                          style={{
                            backgroundColor: outgoingBubble,
                            color: effectiveTextColor,
                          }}
                        >
                          <div>Kusursuz! Gözü hiç yormuyor ve tam aradığım premium havayı veriyor.</div>
                          <div
                            className="text-[10px] text-right mt-0.5 flex items-center justify-end gap-1"
                            style={{
                              color: getMutedTextColor(outgoingBubble, effectiveTextColor),
                            }}
                          >
                            <span>14:31</span>
                            <span>✓✓</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Mock Yazma Barı */}
                    <div
                      className="p-1.5 rounded-xl border flex items-center gap-2"
                      style={{
                        backgroundColor: cardBgColor,
                        borderColor: borderColor,
                      }}
                    >
                      <div className="flex-1 px-3 py-1.5 rounded-lg text-xs text-slate-400 bg-slate-900/60">
                        Bir mesaj yazın...
                      </div>
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0"
                        style={{
                          backgroundColor: accentColor,
                          color: getContrastTextColor(accentColor),
                        }}
                      >
                        <Send className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>

                  {/* 4. TEMAYI KAYDET BUTONU */}
                  <button
                    type="button"
                    onClick={handleSaveTheme}
                    style={{
                      backgroundColor: accentColor,
                      color: getContrastTextColor(accentColor),
                    }}
                    className="w-full py-3.5 px-4 rounded-xl text-xs font-bold shadow-lg hover:brightness-110 active:scale-[0.99] flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>Temayı Canlı Uygula ve Veritabanına Kaydet (Tüm Kullanıcılar İçin)</span>
                  </button>
                </div>
              )}

              {/* TAB 3: GENEL & MARKALAMA */}
              {activeTab === "general" && settings && (
                <div className="space-y-4">
                  <div className="p-4 bg-[#12151D] border border-[#222631] rounded-2xl space-y-4">
                    <h3 className="text-xs font-bold text-white">Site Bilgileri & Markalama</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Platform Başlığı</label>
                        <input
                          type="text"
                          value={settings.site_info.site_name}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              site_info: { ...settings.site_info, site_name: e.target.value },
                            })
                          }
                          className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Slogan / Açıklama</label>
                        <input
                          type="text"
                          value={settings.site_info.site_tagline}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              site_info: { ...settings.site_info, site_tagline: e.target.value },
                            })
                          }
                          className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Logo URL</label>
                      <input
                        type="text"
                        value={settings.site_info.logo_url}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            site_info: { ...settings.site_info, logo_url: e.target.value },
                          })
                        }
                        className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                        placeholder="https://..."
                      />
                    </div>

                    <div className="pt-2 border-t border-[#222631] space-y-3">
                      <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <div className="min-w-0 pr-2">
                          <span className="text-xs font-semibold text-white block">Yeni Üye Kaydına İzin Ver</span>
                          <span className="text-[11px] text-slate-400">Kapatılırsa yalnız mevcut kullanıcılar giriş yapabilir</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.site_info.allow_registration}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              site_info: { ...settings.site_info, allow_registration: e.target.checked },
                            })
                          }
                          className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <div className="min-w-0 pr-2">
                          <span className="text-xs font-semibold text-rose-400 block">Bakım Modu (Maintenance)</span>
                          <span className="text-[11px] text-slate-400">Yöneticiler hariç tüm kullanıcılara erişim durdurulur</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.site_info.maintenance_mode}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              site_info: { ...settings.site_info, maintenance_mode: e.target.checked },
                            })
                          }
                          className="w-4 h-4 accent-rose-600 rounded cursor-pointer flex-shrink-0"
                        />
                      </label>
                    </div>

                    <button
                      onClick={() => handleSaveSetting("site_info", settings.site_info)}
                      className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Genel Ayarları Kaydet</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 4: SOHBET & MEDYA LİMİTLERİ */}
              {activeTab === "chat" && settings && (
                <div className="space-y-4">
                  <div className="p-4 bg-[#12151D] border border-[#222631] rounded-2xl space-y-4">
                    <h3 className="text-xs font-bold text-white">Medya & Depolama Limitleri</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Maksimum Dosya Boyutu (MB)</label>
                        <input
                          type="number"
                          value={settings.media_limits.max_file_size_mb ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSettings({
                              ...settings,
                              media_limits: {
                                ...settings.media_limits,
                                max_file_size_mb: val === "" ? ("" as any) : parseInt(val, 10),
                              },
                            });
                          }}
                          onBlur={() => {
                            if (!settings.media_limits.max_file_size_mb || Number(settings.media_limits.max_file_size_mb) < 1) {
                              setSettings({
                                ...settings,
                                media_limits: { ...settings.media_limits, max_file_size_mb: 50 },
                              });
                            }
                          }}
                          className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Maks. Ses Kayıt Süresi (Saniye)</label>
                        <input
                          type="number"
                          value={settings.media_limits.max_voice_seconds ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSettings({
                              ...settings,
                              media_limits: {
                                ...settings.media_limits,
                                max_voice_seconds: val === "" ? ("" as any) : parseInt(val, 10),
                              },
                            });
                          }}
                          onBlur={() => {
                            if (!settings.media_limits.max_voice_seconds || Number(settings.media_limits.max_voice_seconds) < 1) {
                              setSettings({
                                ...settings,
                                media_limits: { ...settings.media_limits, max_voice_seconds: 300 },
                              });
                            }
                          }}
                          className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                        />
                      </div>
                    </div>

                    <label className="flex items-center justify-between gap-3 cursor-pointer pt-2 border-t border-[#222631]">
                      <div className="min-w-0 pr-2">
                        <span className="text-xs font-semibold text-white block">Otomatik Görsel & Video Sıkıştırma</span>
                        <span className="text-[11px] text-slate-400">Yüklenen medyaları FFmpeg ile evrensel optimize formatlara dönüştür</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.media_limits.enable_compression}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            media_limits: {
                              ...settings.media_limits,
                              enable_compression: e.target.checked,
                            },
                          })
                        }
                        className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
                      />
                    </label>

                    <button
                      onClick={() => handleSaveSetting("media_limits", settings.media_limits)}
                      className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Medya Limitlerini Kaydet</span>
                    </button>
                  </div>

                  <div className="p-4 bg-[#12151D] border border-[#222631] rounded-2xl space-y-4">
                    <h3 className="text-xs font-bold text-white">Mesaj Düzenleme & Silme Kuralları</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Düzenleme Süre Sınırı (Dakika)</label>
                        <input
                          type="number"
                          value={settings.chat_settings.edit_time_limit_minutes ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSettings({
                              ...settings,
                              chat_settings: {
                                ...settings.chat_settings,
                                edit_time_limit_minutes: val === "" ? ("" as any) : parseInt(val, 10),
                              },
                            });
                          }}
                          onBlur={() => {
                            if (!settings.chat_settings.edit_time_limit_minutes || Number(settings.chat_settings.edit_time_limit_minutes) < 1) {
                              setSettings({
                                ...settings,
                                chat_settings: { ...settings.chat_settings, edit_time_limit_minutes: 15 },
                              });
                            }
                          }}
                          className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Herkesten Silme Süre Sınırı (Dakika)</label>
                        <input
                          type="number"
                          value={settings.chat_settings.delete_time_limit_minutes ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSettings({
                              ...settings,
                              chat_settings: {
                                ...settings.chat_settings,
                                delete_time_limit_minutes: val === "" ? ("" as any) : parseInt(val, 10),
                              },
                            });
                          }}
                          onBlur={() => {
                            if (!settings.chat_settings.delete_time_limit_minutes || Number(settings.chat_settings.delete_time_limit_minutes) < 1) {
                              setSettings({
                                ...settings,
                                chat_settings: { ...settings.chat_settings, delete_time_limit_minutes: 60 },
                              });
                            }
                          }}
                          className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-[#222631]">
                      <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <span className="text-xs font-semibold text-white min-w-0 pr-2">Mesaj Düzenlemeye İzin Ver</span>
                        <input
                          type="checkbox"
                          checked={settings.chat_settings.allow_message_edit}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              chat_settings: { ...settings.chat_settings, allow_message_edit: e.target.checked },
                            })
                          }
                          className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <span className="text-xs font-semibold text-white min-w-0 pr-2">Herkesten Silmeye İzin Ver</span>
                        <input
                          type="checkbox"
                          checked={settings.chat_settings.allow_delete_for_all}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              chat_settings: { ...settings.chat_settings, allow_delete_for_all: e.target.checked },
                            })
                          }
                          className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <span className="text-xs font-semibold text-white min-w-0 pr-2">Otomatik Link Önizlemeleri</span>
                        <input
                          type="checkbox"
                          checked={settings.chat_settings.enable_link_previews}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              chat_settings: { ...settings.chat_settings, enable_link_previews: e.target.checked },
                            })
                          }
                          className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
                        />
                      </label>
                    </div>

                    <button
                      onClick={() => handleSaveSetting("chat_settings", settings.chat_settings)}
                      className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Sohbet Kurallarını Kaydet</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 5: ARAMA & WEBRTC */}
              {activeTab === "calls" && settings && (
                <div className="space-y-4">
                  <div className="p-4 bg-[#12151D] border border-[#222631] rounded-2xl space-y-4">
                    <h3 className="text-xs font-bold text-white">LiveKit SFU Sesli & Görüntülü Arama</h3>

                    <div className="space-y-3">
                      <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <div className="min-w-0 pr-2">
                          <span className="text-xs font-semibold text-white block">Sesli Aramalar</span>
                          <span className="text-[11px] text-slate-400">1-e-1 yüksek kaliteli şifreli sesli görüşmeler</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.call_settings.enable_audio_calls}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              call_settings: { ...settings.call_settings, enable_audio_calls: e.target.checked },
                            })
                          }
                          className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <div className="min-w-0 pr-2">
                          <span className="text-xs font-semibold text-white block">Görüntülü Aramalar</span>
                          <span className="text-[11px] text-slate-400">LiveKit SFU üzerinden WebRTC HD video akışı</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.call_settings.enable_video_calls}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              call_settings: { ...settings.call_settings, enable_video_calls: e.target.checked },
                            })
                          }
                          className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <div className="min-w-0 pr-2">
                          <span className="text-xs font-semibold text-white block">Ekran Paylaşımı (Screen Share)</span>
                          <span className="text-[11px] text-slate-400">Görüşme sırasında masaüstü / pencere yayını</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.call_settings.enable_screen_share}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              call_settings: { ...settings.call_settings, enable_screen_share: e.target.checked },
                            })
                          }
                          className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
                        />
                      </label>
                    </div>

                    <div className="pt-2 border-t border-[#222631]">
                      <label className="text-[11px] text-slate-400 block mb-1">Maksimum Arama Süresi (Dakika)</label>
                      <input
                        type="number"
                        value={settings.call_settings.max_call_duration_minutes ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSettings({
                            ...settings,
                            call_settings: {
                              ...settings.call_settings,
                              max_call_duration_minutes: val === "" ? ("" as any) : parseInt(val, 10),
                            },
                          });
                        }}
                        onBlur={() => {
                          if (!settings.call_settings.max_call_duration_minutes || Number(settings.call_settings.max_call_duration_minutes) < 1) {
                            setSettings({
                              ...settings,
                              call_settings: { ...settings.call_settings, max_call_duration_minutes: 120 },
                            });
                          }
                        }}
                        className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>

                    <button
                      onClick={() => handleSaveSetting("call_settings", settings.call_settings)}
                      className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Arama Ayarlarını Kaydet</span>
                    </button>
                  </div>

                  {/* Canlı 1-e-1 Görüşme Oturumları İzleme Paneli */}
                  <div className="p-4 bg-[#12151D] border border-[#222631] rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-xs font-bold text-white">Canlı 1-e-1 Görüşmeler</h3>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold">
                          {activeCalls.length} Aktif
                        </span>
                      </div>
                      <button
                        onClick={loadCallsData}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                        title="Listeyi Yenile"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {activeCalls.length === 0 ? (
                      <div className="p-6 text-center text-slate-500 text-xs bg-[#181B24]/50 rounded-xl border border-[#222631]">
                        Şu anda sunucuda devam eden aktif bir sesli/görüntülü arama bulunmuyor.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {activeCalls.map((call) => (
                          <div
                            key={call.call_id}
                            className="p-3 bg-[#181B24] border border-[#292D38] rounded-xl flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                  call.status === "ringing"
                                    ? "bg-amber-400 animate-ping"
                                    : "bg-emerald-400 animate-pulse"
                                }`}
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-white truncate flex items-center gap-1.5">
                                  <span>{call.caller_name}</span>
                                  <span className="text-slate-500">↔</span>
                                  <span>{call.receiver_name}</span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  ID: {call.call_id.slice(0, 8)} •{" "}
                                  {call.status === "ringing" ? "Çalıyor" : "Bağlandı"}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-medium uppercase ${
                                  call.call_type === "video"
                                    ? "bg-pink-500/20 text-pink-300 border border-pink-500/30"
                                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                }`}
                              >
                                {call.call_type === "video" ? "Görüntülü" : "Sesli"}
                              </span>
                              <div className="flex items-center gap-1 font-mono text-[11px] text-slate-300">
                                <Clock className="w-3 h-3 text-slate-500" />
                                <span>
                                  {Math.floor(call.elapsed_seconds / 60)}:
                                  {String(call.elapsed_seconds % 60).padStart(2, "0")}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 6: GÜVENLİK & LİMİTLER */}
              {activeTab === "security" && settings && (
                <div className="space-y-4">
                  <div className="p-4 bg-[#12151D] border border-[#222631] rounded-2xl space-y-4">
                    <h3 className="text-xs font-bold text-white">Rate Limit & Spam Koruması</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Saniyede Maks. Mesaj</label>
                        <input
                          type="number"
                          value={settings.security_settings.max_messages_per_second ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSettings({
                              ...settings,
                              security_settings: {
                                ...settings.security_settings,
                                max_messages_per_second: val === "" ? ("" as any) : parseInt(val, 10),
                              },
                            });
                          }}
                          onBlur={() => {
                            if (!settings.security_settings.max_messages_per_second || Number(settings.security_settings.max_messages_per_second) < 1) {
                              setSettings({
                                ...settings,
                                security_settings: {
                                  ...settings.security_settings,
                                  max_messages_per_second: 5,
                                },
                              });
                            }
                          }}
                          className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Dakikada Maks. Mesaj</label>
                        <input
                          type="number"
                          value={settings.security_settings.max_messages_per_minute ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSettings({
                              ...settings,
                              security_settings: {
                                ...settings.security_settings,
                                max_messages_per_minute: val === "" ? ("" as any) : parseInt(val, 10),
                              },
                            });
                          }}
                          onBlur={() => {
                            if (!settings.security_settings.max_messages_per_minute || Number(settings.security_settings.max_messages_per_minute) < 1) {
                              setSettings({
                                ...settings,
                                security_settings: {
                                  ...settings.security_settings,
                                  max_messages_per_minute: 60,
                                },
                              });
                            }
                          }}
                          className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-[#222631]">
                      <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <span className="text-xs font-semibold text-white min-w-0 pr-2">Güçlü Şifre Zorunluluğu</span>
                        <input
                          type="checkbox"
                          checked={settings.security_settings.require_strong_passwords}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              security_settings: {
                                ...settings.security_settings,
                                require_strong_passwords: e.target.checked,
                              },
                            })
                          }
                          className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
                        />
                      </label>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        <div>
                          <label className="text-[11px] text-slate-400 block mb-1">Hatalı Giriş Kilidi (Deneme)</label>
                          <input
                            type="number"
                            value={settings.security_settings.lockout_attempts ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSettings({
                                ...settings,
                                security_settings: {
                                  ...settings.security_settings,
                                  lockout_attempts: val === "" ? ("" as any) : parseInt(val, 10),
                                },
                              });
                            }}
                            onBlur={() => {
                              if (!settings.security_settings.lockout_attempts || Number(settings.security_settings.lockout_attempts) < 1) {
                                setSettings({
                                  ...settings,
                                  security_settings: {
                                    ...settings.security_settings,
                                    lockout_attempts: 5,
                                  },
                                });
                              }
                            }}
                            className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] text-slate-400 block mb-1">Oturum Süresi (Gün)</label>
                          <input
                            type="number"
                            value={settings.security_settings.session_timeout_days ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSettings({
                                ...settings,
                                security_settings: {
                                  ...settings.security_settings,
                                  session_timeout_days: val === "" ? ("" as any) : parseInt(val, 10),
                                },
                              });
                            }}
                            onBlur={() => {
                              if (!settings.security_settings.session_timeout_days || Number(settings.security_settings.session_timeout_days) < 1) {
                                setSettings({
                                  ...settings,
                                  security_settings: {
                                    ...settings.security_settings,
                                    session_timeout_days: 30,
                                  },
                                });
                              }
                            }}
                            className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Otomatik Oturum Kapatma & Gizlilik Yönlendirmesi */}
                    <div className="space-y-4 pt-4 border-t border-[#222631]">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-pink-400" />
                        <div>
                          <h4 className="text-xs font-bold text-white">Ekran Kilidi & Çevrimdışı Otomatik Çıkış</h4>
                          <p className="text-[11px] text-slate-400">
                            Telefon kilitlendiğinde veya inaktif kalındığında oturumu kapatıp hedef siteye yönlendirir.
                          </p>
                        </div>
                      </div>

                      <label className="flex items-center justify-between gap-3 cursor-pointer bg-[#181B24] p-3 rounded-xl border border-[#292D38]">
                        <div>
                          <span className="text-xs font-semibold text-white block">İnaktivite Korumasını Etkinleştir</span>
                          <span className="text-[10px] text-slate-400 block">
                            Tuş kilidi kapalıyken belirlenen süre aşılırsa oturum sonlandırılır ve yönlendirme yapılır.
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.security_settings.inactivity_logout_enabled ?? false}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              security_settings: {
                                ...settings.security_settings,
                                inactivity_logout_enabled: e.target.checked,
                              },
                            })
                          }
                          className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
                        />
                      </label>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[11px] text-slate-400 block mb-1">
                            Çevrimdışı Kalma Süresi (Dakika)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="1440"
                            placeholder="15"
                            value={settings.security_settings.inactivity_timeout_minutes ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSettings({
                                ...settings,
                                security_settings: {
                                  ...settings.security_settings,
                                  inactivity_timeout_minutes: val === "" ? ("" as any) : parseInt(val, 10),
                                },
                              });
                            }}
                            onBlur={() => {
                              if (!settings.security_settings.inactivity_timeout_minutes || Number(settings.security_settings.inactivity_timeout_minutes) < 1) {
                                setSettings({
                                  ...settings,
                                  security_settings: {
                                    ...settings.security_settings,
                                    inactivity_timeout_minutes: 15,
                                  },
                                });
                              }
                            }}
                            className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-500 mt-1 block">Örn: 15 dakika boyunca kilitli kalırsa</span>
                        </div>

                        <div>
                          <label className="text-[11px] text-slate-400 block mb-1">
                            Yönlendirilecek Hedef Web Sitesi (URL)
                          </label>
                          <input
                            type="url"
                            placeholder="https://www.google.com"
                            value={settings.security_settings.inactivity_redirect_url ?? "https://www.google.com"}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                security_settings: {
                                  ...settings.security_settings,
                                  inactivity_redirect_url: e.target.value,
                                },
                              })
                            }
                            className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-500 mt-1 block">Süre dolunca anında bu adrese fırlatılır</span>
                        </div>
                      </div>

                      {/* Zamanlama / Mesai Saatleri Kuralı */}
                      <div className="pt-3 border-t border-[#222631] space-y-3">
                        <label className="flex items-center justify-between gap-3 cursor-pointer bg-[#181B24] p-3 rounded-xl border border-[#292D38]">
                          <div>
                            <span className="text-xs font-semibold text-white block">
                              Zaman Takvimi & Mesai Dışı Modu
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              Sadece belirli saatlerde (örneğin hafta içi 17:30 sonrası ve hafta sonu tam gün) devreye girsin.
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={settings.security_settings.inactivity_schedule_enabled ?? false}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                security_settings: {
                                  ...settings.security_settings,
                                  inactivity_schedule_enabled: e.target.checked,
                                },
                              })
                            }
                            className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
                          />
                        </label>

                        {settings.security_settings.inactivity_schedule_enabled && (
                          <div className="p-3 bg-[#181B24]/70 border border-[#292D38] rounded-xl space-y-3 animate-in fade-in duration-200">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="text-[11px] text-slate-400 block mb-1">
                                  Hafta İçi Başlangıç Saati (Akşam)
                                </label>
                                <input
                                  type="time"
                                  value={settings.security_settings.inactivity_weekday_start ?? "17:30"}
                                  onChange={(e) =>
                                    setSettings({
                                      ...settings,
                                      security_settings: {
                                        ...settings.security_settings,
                                        inactivity_weekday_start: e.target.value,
                                      },
                                    })
                                  }
                                  className="w-full bg-[#12151D] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                                />
                                <span className="text-[10px] text-slate-500 mt-1 block">
                                  Örn: 17:30'dan sonra koruma başlar
                                </span>
                              </div>

                              <div>
                                <label className="text-[11px] text-slate-400 block mb-1">
                                  Hafta İçi Bitiş Saati (Sabah)
                                </label>
                                <input
                                  type="time"
                                  value={settings.security_settings.inactivity_weekday_end ?? "08:30"}
                                  onChange={(e) =>
                                    setSettings({
                                      ...settings,
                                      security_settings: {
                                        ...settings.security_settings,
                                        inactivity_weekday_end: e.target.value,
                                      },
                                    })
                                  }
                                  className="w-full bg-[#12151D] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                                />
                                <span className="text-[10px] text-slate-500 mt-1 block">
                                  Örn: Sabah 08:30'a kadar devam eder
                                </span>
                              </div>
                            </div>

                            <label className="flex items-center justify-between gap-3 cursor-pointer pt-2 border-t border-[#222631]">
                              <div>
                                <span className="text-xs font-medium text-slate-200 block">
                                  Hafta Sonu Tam Gün (7/24) Devrede
                                </span>
                                <span className="text-[10px] text-slate-400 block">
                                  Cumartesi ve Pazar günleri saat kısıtı olmadan 24 saat boyunca aktiftir.
                                </span>
                              </div>
                              <input
                                type="checkbox"
                                checked={settings.security_settings.inactivity_weekend_full ?? true}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    security_settings: {
                                      ...settings.security_settings,
                                      inactivity_weekend_full: e.target.checked,
                                    },
                                  })
                                }
                                className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
                              />
                            </label>
                          </div>
                        )}
                      </div>

                      <div className="p-3 bg-pink-950/20 border border-pink-900/30 rounded-xl text-[11px] text-pink-300 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-pink-400 flex-shrink-0 mt-0.5" />
                        <span>
                          <strong>Gizlilik Kalkanı:</strong> Telefon tuş kilidi kapatıldığı an ekran görüntüsü zifiri karanlığa alınır. 
                          Kullanıcı süre dolduktan sonra kilidi açtığında sohbet yazıları 1 salise bile görünmeden doğrudan hedef site açılır.
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleSaveSetting("security_settings", settings.security_settings)}
                      className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Güvenlik Parametrelerini Kaydet</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 7: ERİŞİM GÜNLÜKLERİ */}
              {activeTab === "logs" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">
                      Giriş yapan kullanıcıların IP adresi, cihaz ve tarayıcı kayıtları
                    </p>
                    <button
                      onClick={loadLogs}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#141720] border border-[#252936] rounded-xl text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" /> Yenile
                    </button>
                  </div>

                  <div className="border border-[#222631] rounded-2xl overflow-hidden bg-[#10131A]">
                    <div className="overflow-x-auto -mx-1 sm:mx-0">
                      <table className="w-full text-left text-xs min-w-[500px]">
                        <thead className="bg-[#141720] border-b border-[#222631] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="py-2.5 px-3 sm:px-3.5">Kullanıcı</th>
                            <th className="py-2.5 px-3 sm:px-3.5">Cihaz & Tarayıcı</th>
                            <th className="py-2.5 px-3 sm:px-3.5">IP Adresi</th>
                            <th className="py-2.5 px-3 sm:px-3.5 text-right">Tarih</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1D212B]">
                          {accessLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-[#151922] transition-colors">
                              <td className="py-2.5 px-3 sm:px-3.5 font-semibold text-white">
                                {log.display_name ? `${log.display_name} (@${log.username})` : `@${log.username}`}
                              </td>
                              <td className="py-2.5 px-3 sm:px-3.5 text-slate-300 truncate max-w-[140px] sm:max-w-[200px]">
                                {log.device_info || "Bilinmeyen Cihaz"}
                              </td>
                              <td className="py-2.5 px-3 sm:px-3.5 font-mono text-slate-400">{log.ip_address}</td>
                              <td className="py-2.5 px-3 sm:px-3.5 text-right text-slate-500 whitespace-nowrap">
                                {new Date(log.created_at).toLocaleString("tr-TR")}
                              </td>
                            </tr>
                          ))}
                          {accessLogs.length === 0 && (
                            <tr>
                              <td colSpan={4} className="py-8 text-center text-slate-500 text-xs">
                                Henüz bir erişim kaydı yok.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 8: SİSTEM SAĞLIĞI & İZLEME */}
              {activeTab === "stats" && stats && (
                <div className="space-y-6">
                  {/* Başlık ve Çalışma Süresi */}
                  <div className="flex items-center justify-between p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl">
                    <div className="flex items-center gap-2.5">
                      <Server className="w-4 h-4 text-grupo-accent" />
                      <div>
                        <h3 className="text-xs font-bold text-white">Sistem Çalışma Süresi (Uptime)</h3>
                        <p className="text-[11px] text-slate-400">
                          {detailedHealth?.uptime_formatted
                            ? `${detailedHealth.uptime_formatted} kesintisiz aktif`
                            : "Sistem aktif çalışıyor"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={loadStats}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1.5 text-xs"
                      title="Metrikleri Tazele"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Yenile</span>
                    </button>
                  </div>

                  {/* 1. Servis Canlılık & Gecikme Metrikleri */}
                  <div>
                    <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
                      Mikro Servisler & Gecikme (Latency)
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase">PostgreSQL 16</span>
                          <Database className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                        <div className="mt-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xs font-bold text-emerald-400 capitalize">
                              {detailedHealth?.postgres?.status || stats.system_health.postgres}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                            {detailedHealth?.postgres?.latency_ms !== undefined
                              ? `${detailedHealth.postgres.latency_ms} ms ping`
                              : "< 5 ms"}
                          </span>
                        </div>
                      </div>

                      <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase">Redis 7</span>
                          <Activity className="w-3.5 h-3.5 text-rose-400" />
                        </div>
                        <div className="mt-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xs font-bold text-emerald-400 capitalize">
                              {detailedHealth?.redis?.status || stats.system_health.redis}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                            {detailedHealth?.redis?.latency_ms !== undefined
                              ? `${detailedHealth.redis.latency_ms} ms ping`
                              : "< 2 ms"}
                          </span>
                        </div>
                      </div>

                      <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase">LiveKit SFU</span>
                          <Radio className="w-3.5 h-3.5 text-purple-400" />
                        </div>
                        <div className="mt-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xs font-bold text-emerald-400 capitalize">
                              {detailedHealth?.livekit?.status || stats.system_health.livekit}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono mt-1 block truncate">
                            WebRTC SFU Aktif
                          </span>
                        </div>
                      </div>

                      <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase">MinIO S3</span>
                          <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                        </div>
                        <div className="mt-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xs font-bold text-emerald-400 capitalize">
                              {detailedHealth?.minio?.status || stats.system_health.minio}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                            {detailedHealth?.minio?.latency_ms !== undefined
                              ? `${detailedHealth.minio.latency_ms} ms ping`
                              : "< 10 ms"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. Runtime Telemetrisi & Trafik */}
                  <div>
                    <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
                      Bağlantı & Çalışma Metrikleri
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl">
                        <p className="text-[11px] text-slate-400">Toplam Üye</p>
                        <p className="text-xl font-bold text-white mt-1">{stats.total_users}</p>
                        <p className="text-[10px] text-emerald-400 mt-0.5">{stats.online_users} Çevrimiçi</p>
                      </div>

                      <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl">
                        <p className="text-[11px] text-slate-400">Canlı Soketler (WS)</p>
                        <p className="text-xl font-bold text-white mt-1">
                          {detailedHealth?.active_ws_connections !== undefined
                            ? detailedHealth.active_ws_connections
                            : stats.online_users}
                        </p>
                        <p className="text-[10px] text-purple-400 mt-0.5">Gerçek Zamanlı Hub</p>
                      </div>

                      <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl">
                        <p className="text-[11px] text-slate-400">Toplam Mesaj</p>
                        <p className="text-xl font-bold text-white mt-1">{stats.total_messages}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{stats.total_media} Medya</p>
                      </div>

                      <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl">
                        <p className="text-[11px] text-slate-400">Goroutine & RAM</p>
                        <p className="text-xl font-bold text-white mt-1">
                          {detailedHealth?.goroutines || stats.system_health.goroutines}
                        </p>
                        <p className="text-[10px] text-pink-400 mt-0.5">
                          {detailedHealth?.memory?.alloc_mb !== undefined
                            ? `${detailedHealth.memory.alloc_mb} MB RAM`
                            : `${stats.system_health.allocated_ram_mb} MB RAM`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 3. MinIO Nesne Depolama Analizi */}
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        MinIO Nesne Depolama Dağılımı
                      </h4>
                      {storageBreakdown?.cached && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          (Önbellekten • Redis 5dk TTL)
                        </span>
                      )}
                    </div>

                    <div className="p-4 bg-[#12151D] border border-[#222631] rounded-2xl space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-[#222631]">
                        <div>
                          <span className="text-xs text-slate-400 block">Toplam Kullanılan Alan</span>
                          <span className="text-lg font-bold text-white font-mono">
                            {storageBreakdown?.total?.total_mb
                              ? storageBreakdown.total.total_mb > 1024
                                ? `${storageBreakdown.total.total_gb.toFixed(2)} GB`
                                : `${storageBreakdown.total.total_mb.toFixed(1)} MB`
                              : "0 MB"}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-slate-400 block">Toplam Dosya</span>
                          <span className="text-lg font-bold text-grupo-accent font-mono">
                            {storageBreakdown?.total?.total_objects ?? 0} Adet
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="p-3 bg-[#181B24] rounded-xl border border-[#292D38]">
                          <span className="text-slate-400 text-[11px] block">Avatarlar</span>
                          <span className="font-bold text-white mt-1 block font-mono">
                            {storageBreakdown?.avatars?.total_mb !== undefined
                              ? `${storageBreakdown.avatars.total_mb.toFixed(1)} MB`
                              : "0 MB"}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {storageBreakdown?.avatars?.total_objects ?? 0} dosya
                          </span>
                        </div>

                        <div className="p-3 bg-[#181B24] rounded-xl border border-[#292D38]">
                          <span className="text-slate-400 text-[11px] block">Görsel & Video</span>
                          <span className="font-bold text-white mt-1 block font-mono">
                            {storageBreakdown?.media?.total_mb !== undefined
                              ? `${storageBreakdown.media.total_mb.toFixed(1)} MB`
                              : "0 MB"}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {storageBreakdown?.media?.total_objects ?? 0} dosya
                          </span>
                        </div>

                        <div className="p-3 bg-[#181B24] rounded-xl border border-[#292D38]">
                          <span className="text-slate-400 text-[11px] block">Sesli Mesajlar</span>
                          <span className="font-bold text-white mt-1 block font-mono">
                            {storageBreakdown?.voice?.total_mb !== undefined
                              ? `${storageBreakdown.voice.total_mb.toFixed(1)} MB`
                              : "0 MB"}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {storageBreakdown?.voice?.total_objects ?? 0} dosya
                          </span>
                        </div>

                        <div className="p-3 bg-[#181B24] rounded-xl border border-[#292D38]">
                          <span className="text-slate-400 text-[11px] block">Ekli Belgeler</span>
                          <span className="font-bold text-white mt-1 block font-mono">
                            {storageBreakdown?.files?.total_mb !== undefined
                              ? `${storageBreakdown.files.total_mb.toFixed(1)} MB`
                              : "0 MB"}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {storageBreakdown?.files?.total_objects ?? 0} dosya
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>

        </div>
      </div>

      {/* KULLANICI BİLGİLERİNİ DÜZENLEME MODALI */}
      {editingUser && (
        <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in select-none">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#0F1219] border border-[#252A38] rounded-3xl shadow-2xl p-5 sm:p-6 flex flex-col gap-4 text-slate-200 animate-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto"
          >
            {/* Modal Başlığı */}
            <div className="flex items-center justify-between pb-3 border-b border-[#222736]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    Kullanıcı Bilgilerini Düzenle
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    @{editingUser.username} profilini ve yetkilerini yönetin
                  </p>
                </div>
              </div>

              <button
                onClick={() => setEditingUser(null)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Hata Bildirimi */}
            {editUserError && (
              <div className="px-3.5 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{editUserError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSaveUser} className="space-y-3.5">
              {/* Ad Soyad */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Ad Soyad
                </label>
                <input
                  type="text"
                  required
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full bg-[#151922] border border-[#272D3D] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* Kullanıcı Adı */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Kullanıcı Adı (@)
                </label>
                <input
                  type="text"
                  required
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full bg-[#151922] border border-[#272D3D] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white font-mono focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* E-posta Adresi */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  E-posta Adresi
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full bg-[#151922] border border-[#272D3D] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* Yeni Şifre */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Yeni Şifre Belirle <span className="text-slate-500 font-normal">(İsteğe bağlı)</span>
                </label>
                <input
                  type="password"
                  placeholder="Mevcut şifreyi korumak için boş bırakın (En az 6 karakter)"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full bg-[#151922] border border-[#272D3D] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* Kullanıcı Rolü */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Kullanıcı Rolü
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "member", label: "Üye", desc: "Standart" },
                    { id: "moderator", label: "Moderatör", desc: "Denetçi" },
                    { id: "admin", label: "Yönetici", desc: "Tam Yetki" },
                  ].map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setEditRole(r.id)}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        editRole === r.id
                          ? "bg-indigo-600/20 border-indigo-500 text-white font-bold"
                          : "bg-[#151922] border-[#272D3D] text-slate-400 hover:text-white"
                      }`}
                    >
                      <div className="text-xs">{r.label}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Hesap Durumu */}
              <div className="pt-2 border-t border-[#222736]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">Hesap Durumu</div>
                    <div className="text-[11px] text-slate-400">
                      {editIsBanned ? "Bu kullanıcının erişimi engellendi." : "Hesap aktif ve giriş yapabilir."}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditIsBanned(!editIsBanned)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      editIsBanned
                        ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                        : "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                    }`}
                  >
                    {editIsBanned ? "Yasaklı" : "Aktif"}
                  </button>
                </div>

                {editIsBanned && (
                  <div className="mt-2.5">
                    <label className="block text-[11px] font-semibold text-rose-300 mb-1">
                      Yasaklanma Gerekçesi
                    </label>
                    <input
                      type="text"
                      placeholder="Örn: Topluluk kuralları ihlali"
                      value={editBanReason}
                      onChange={(e) => setEditBanReason(e.target.value)}
                      className="w-full bg-[#151922] border border-rose-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                )}
              </div>

              {/* Alt Butonlar */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#222736]">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition cursor-pointer"
                >
                  {isSavingUser ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>{isSavingUser ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
