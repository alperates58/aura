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
import { getContrastTextColor } from "@/lib/utils";
import {
  Shield,
  ShieldAlert,
  ArrowLeft,
  Users,
  MessageSquare,
  PhoneCall,
  Activity,
  FileText,
  X,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Globe,
  Palette,
  Ban,
  ChevronRight,
} from "lucide-react";

import { THEME_PRESETS, ThemePreset } from "./constants/themePresets";
export { THEME_PRESETS };
export type { ThemePreset };
export { ThemeTab } from "./tabs/ThemeTab";

import {
  ThemeTab as ThemeTabView,
  GeneralTab,
  ChatTab,
  BannedWordsTab,
  SecurityTouchTab,
  CallsTab,
  SecurityParamsTab,
  LogsTab,
  StatsTab,
  EmergencyTab,
  UsersTab,
  SecurityLogsTab,
} from "./tabs";
import { EditUserModal } from "./modals/EditUserModal";
import { TerminateSessionsModal, NuclearPurgeModal } from "./modals/EmergencyModals";

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
  | "banned_words"
  | "security_touch"
  | "calls"
  | "security"
  | "logs"
  | "stats"
  | "emergency";

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

  // Emergency actions state
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [emergencyPassword, setEmergencyPassword] = useState("");
  const [purgeConfirmationText, setPurgeConfirmationText] = useState("");
  const [isEmergencyLoading, setIsEmergencyLoading] = useState(false);
  const [emergencyAlert, setEmergencyAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleTerminateAllSessions = async () => {
    if (!emergencyPassword) {
      setEmergencyAlert({ type: "error", message: "Lütfen yönetici şifrenizi girin." });
      return;
    }
    setIsEmergencyLoading(true);
    setEmergencyAlert(null);
    try {
      const res = await adminApi.terminateAllSessions(emergencyPassword);
      setEmergencyAlert({ type: "success", message: res.message });
      setShowTerminateModal(false);
      setEmergencyPassword("");
    } catch (err: any) {
      setEmergencyAlert({
        type: "error",
        message: err.response?.data?.error || "Oturumlar kapatılamadı.",
      });
    } finally {
      setIsEmergencyLoading(false);
    }
  };

  const handleMasterPurge = async () => {
    if (!emergencyPassword) {
      setEmergencyAlert({ type: "error", message: "Lütfen yönetici şifrenizi girin." });
      return;
    }
    if (purgeConfirmationText.trim() !== "HER ŞEYİ SİL") {
      setEmergencyAlert({ type: "error", message: "Lütfen onay kutusuna tam olarak 'HER ŞEYİ SİL' yazın." });
      return;
    }
    setIsEmergencyLoading(true);
    setEmergencyAlert(null);
    try {
      const res = await adminApi.masterPurgeData(emergencyPassword, purgeConfirmationText.trim());
      setEmergencyAlert({ type: "success", message: res.message });
      setShowPurgeModal(false);
      setEmergencyPassword("");
      setPurgeConfirmationText("");
      setTimeout(() => {
        window.location.reload();
      }, 2500);
    } catch (err: any) {
      setEmergencyAlert({
        type: "error",
        message: err.response?.data?.error || "Nükleer temizlik başarısız oldu.",
      });
    } finally {
      setIsEmergencyLoading(false);
    }
  };

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

  const handleSaveSetting = async (key: string, value: any): Promise<boolean> => {
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
      return true;
    } catch (e) {
      alert("Ayar kaydedilirken bir hata oluştu.");
      return false;
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
      id: "banned_words",
      label: "Yasaklı Kelimeler & Sansür",
      desc: "Otomatik kelime sansürü, kural dışı kelime listesi ve canlı filtreleme",
      icon: Ban,
      color: "from-rose-600 to-pink-600 text-rose-300",
      badge:
        settings?.chat_settings?.banned_words && settings.chat_settings.banned_words.length > 0
          ? `${settings.chat_settings.banned_words.length} kelime`
          : undefined,
    },
    {
      id: "security_touch",
      label: "Güvenlik Touch",
      desc: "AssistiveTouch butonu, opaklık, varsayılan konum ve acil çıkış hedef adresi",
      icon: Shield,
      color: "from-purple-600 to-indigo-600 text-purple-300",
      badge:
        settings?.security_settings?.enable_assistive_touch !== false
          ? `%${settings?.security_settings?.assistive_touch_opacity ?? 30}`
          : "Kapalı",
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
    {
      id: "emergency",
      label: "Acil Durum & Nükleer Sıfırlama",
      desc: "Herkesi siteden atma, mesaj geçmişini ve sohbet medyalarını kalıcı imha etme",
      icon: AlertTriangle,
      color: "from-rose-600 to-red-700 text-rose-300",
      badge: "Kritik",
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
        <div className="w-screen max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl h-[100dvh] bg-[#0D0F14] border-r border-[#222631] shadow-2xl flex flex-col animate-in slide-in-from-left duration-250 text-slate-200 relative">
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        className="w-full text-left p-4 rounded-2xl bg-[#12151D] border border-[#222631] hover:border-pink-500/40 hover:bg-[#161A24] transition-all duration-200 cursor-pointer flex items-center justify-between group shadow-sm hover:shadow-lg hover:shadow-pink-950/20 active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div
                            className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center flex-shrink-0 shadow-md transition-transform duration-200 group-hover:scale-105`}
                          >
                            <Icon className="w-5 h-5 text-white" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs sm:text-sm font-bold text-white group-hover:text-pink-300 transition-colors truncate">
                                {item.label}
                              </span>
                              {item.badge && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-pink-500/15 text-pink-300 border border-pink-500/25 flex-shrink-0">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1 group-hover:text-slate-300 transition-colors">
                              {item.desc}
                            </p>
                          </div>
                        </div>

                        <div className="w-7 h-7 rounded-xl bg-slate-800/50 flex items-center justify-center text-slate-500 group-hover:text-white group-hover:bg-pink-600/30 transition-all flex-shrink-0 ml-2">
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="pt-4 flex items-center justify-between text-xs text-slate-500 px-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Aura Çekirdek Sistemi: Çevrimiçi</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-600">v1.0.0</span>
                </div>
              </div>
            )}

            {/* TAB: KULLANICI YÖNETİMİ */}
            {activeTab === "users" && (
              <UsersTab
                users={users}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                roleFilter={roleFilter}
                setRoleFilter={setRoleFilter}
                isLoading={isLoading}
                loadUsers={loadUsers}
                onOpenEditUser={handleOpenEditUser}
                onToggleUserBan={handleToggleUserBan}
                onDeleteUser={handleDeleteUser}
              />
            )}

            {/* TAB: GÜVENLİK GÜNLÜKLERİ */}
            {activeTab === "security_logs" && (
              <SecurityLogsTab
                securityLogs={securityLogs}
                securityStats={securityStats}
                isSecurityLogsLoading={isSecurityLogsLoading}
                securityEventTypeFilter={securityEventTypeFilter}
                setSecurityEventTypeFilter={setSecurityEventTypeFilter}
                loadSecurityLogs={loadSecurityLogs}
                handleClearSecurityLogs={handleClearSecurityLogs}
              />
            )}

            {/* TAB: TEMA VE RENKLER */}
            {activeTab === "theme" && (
              <ThemeTabView
                accentColor={accentColor}
                outgoingBubble={outgoingBubble}
                outgoingText={outgoingText}
                incomingBubble={incomingBubble}
                cardBgColor={cardBgColor}
                borderColor={borderColor}
                mainBgColor={mainBgColor}
                fontFamily={fontFamily}
                effectiveTextColor={effectiveTextColor}
                setFontFamily={setFontFamily}
                handleApplyPreset={handleApplyPreset}
                handleUpdateColor={handleUpdateColor}
                handleSaveTheme={handleSaveTheme}
              />
            )}

            {/* TAB: GENEL BİLGİLER & MARKALAMA */}
            {activeTab === "general" && settings && (
              <GeneralTab
                settings={settings}
                setSettings={setSettings}
                onSave={handleSaveSetting}
              />
            )}

            {/* TAB: SOHBET & MEDYA LİMİTLERİ */}
            {activeTab === "chat" && settings && (
              <ChatTab
                settings={settings}
                setSettings={setSettings}
                onSave={handleSaveSetting}
                onNavigateToBannedWords={() => setActiveTab("banned_words")}
              />
            )}

            {/* TAB: YASAKLI KELİMELER & SANSÜR */}
            {activeTab === "banned_words" && settings && (
              <BannedWordsTab
                settings={settings}
                setSettings={setSettings}
                onSave={handleSaveSetting}
              />
            )}

            {/* TAB: GÜVENLİK TOUCH (ASSISTIVETOUCH) */}
            {activeTab === "security_touch" && settings && (
              <SecurityTouchTab
                settings={settings}
                setSettings={setSettings}
                onSave={handleSaveSetting}
              />
            )}

            {/* TAB: ARAMA & WEBRTC */}
            {activeTab === "calls" && settings && (
              <CallsTab
                settings={settings}
                setSettings={setSettings}
                onSave={handleSaveSetting}
                activeCalls={activeCalls}
                loadCallsData={loadCallsData}
              />
            )}

            {/* TAB: GÜVENLİK & LİMİTLER */}
            {activeTab === "security" && settings && (
              <SecurityParamsTab
                settings={settings}
                setSettings={setSettings}
                onSave={handleSaveSetting}
              />
            )}

            {/* TAB: ERİŞİM GÜNLÜKLERİ */}
            {activeTab === "logs" && (
              <LogsTab
                accessLogs={accessLogs}
                loadLogs={loadLogs}
              />
            )}

            {/* TAB: SİSTEM SAĞLIĞI & İZLEME */}
            {activeTab === "stats" && stats && (
              <StatsTab
                stats={stats}
                detailedHealth={detailedHealth}
                storageBreakdown={storageBreakdown}
                loadStats={loadStats}
              />
            )}

            {/* TAB: ACİL DURUM & NÜKLEER SIFIRLAMA */}
            {activeTab === "emergency" && (
              <EmergencyTab
                emergencyAlert={emergencyAlert}
                onOpenTerminateModal={() => {
                  setEmergencyAlert(null);
                  setEmergencyPassword("");
                  setShowTerminateModal(true);
                }}
                onOpenPurgeModal={() => {
                  setEmergencyAlert(null);
                  setEmergencyPassword("");
                  setPurgeConfirmationText("");
                  setShowPurgeModal(true);
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* KULLANICI BİLGİLERİNİ DÜZENLEME MODALI */}
      <EditUserModal
        editingUser={editingUser}
        onClose={() => setEditingUser(null)}
        editDisplayName={editDisplayName}
        setEditDisplayName={setEditDisplayName}
        editUsername={editUsername}
        setEditUsername={setEditUsername}
        editEmail={editEmail}
        setEditEmail={setEditEmail}
        editPassword={editPassword}
        setEditPassword={setEditPassword}
        editRole={editRole}
        setEditRole={setEditRole}
        editIsBanned={editIsBanned}
        setEditIsBanned={setEditIsBanned}
        editBanReason={editBanReason}
        setEditBanReason={setEditBanReason}
        isSavingUser={isSavingUser}
        editUserError={editUserError}
        onSave={handleSaveUser}
      />

      {/* TÜM OTURUMLARI SONLANDIRMA ONAY MODALI */}
      <TerminateSessionsModal
        isOpen={showTerminateModal}
        onClose={() => setShowTerminateModal(false)}
        emergencyPassword={emergencyPassword}
        setEmergencyPassword={setEmergencyPassword}
        onTerminate={handleTerminateAllSessions}
        isLoading={isEmergencyLoading}
      />

      {/* NÜKLEER VERİ İMHASI ONAY MODALI */}
      <NuclearPurgeModal
        isOpen={showPurgeModal}
        onClose={() => setShowPurgeModal(false)}
        purgeConfirmationText={purgeConfirmationText}
        setPurgeConfirmationText={setPurgeConfirmationText}
        emergencyPassword={emergencyPassword}
        setEmergencyPassword={setEmergencyPassword}
        onPurge={handleMasterPurge}
        isLoading={isEmergencyLoading}
      />
    </div>
  );
};
