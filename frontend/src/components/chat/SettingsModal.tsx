"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, User, UserSession } from "@/store/useAuthStore";
import { api, getBasePath } from "@/lib/api";
import { soundEffects } from "@/lib/sounds";
import { formatStoryTime } from "@/lib/utils";
import {
  getPushSubscription,
  subscribeUserToPush,
  unsubscribeUserFromPush,
  sendTestPushNotification,
} from "@/lib/push_notifications";
import {
  ArrowLeft,
  X,
  User as UserIcon,
  Shield,
  Key,
  Bell,
  History,
  Sliders,
  Camera,
  Loader2,
  Lock,
  Smartphone,
  Laptop,
  Tablet,
  Monitor,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  LogOut,
  ChevronRight,
  Sparkles,
  Trash2,
  Globe,
} from "lucide-react";

export type SettingsTabType =
  | "profile"
  | "privacy"
  | "security"
  | "sessions"
  | "notifications"
  | "access_logs"
  | null;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenAdmin?: (tab?: string) => void;
  initialTab?: string;
}

export const SETTINGS_NAV_ITEMS = [
  {
    id: "profile" as const,
    label: "Profil & Hesap",
    desc: "Görünen ad, biyografi ve avatar fotoğrafı",
    icon: UserIcon,
    color: "from-pink-600 to-rose-500",
    badge: null as string | null,
  },
  {
    id: "privacy" as const,
    label: "Gizlilik & Tikler",
    desc: "Okundu bilgisi (mavi tik), son görülme ve arama izinleri",
    icon: Shield,
    color: "from-emerald-600 to-teal-500",
    badge: null as string | null,
  },
  {
    id: "security" as const,
    label: "Panik Modu & Güvenlik",
    desc: "Sahte yönlendirme şifresi, panik kodu ve uçtan uca anahtarlar",
    icon: Key,
    color: "from-amber-600 to-orange-500",
    badge: null as string | null,
  },
  {
    id: "sessions" as const,
    label: "Aktif Cihazlarım",
    desc: "Bağlı telefon, tablet, bilgisayar oturumları ve uzaktan çıkış",
    icon: Smartphone,
    color: "from-blue-600 to-cyan-500",
    badge: null as string | null,
  },
  {
    id: "notifications" as const,
    label: "Bildirimler & Sesler",
    desc: "Web Push anlık bildirimleri ve mesaj ses efektleri",
    icon: Bell,
    color: "from-purple-600 to-indigo-500",
    badge: null as string | null,
  },
  {
    id: "access_logs" as const,
    label: "Giriş Kayıtlarım",
    desc: "Hesabınıza yapılan başarılı girişlerin güvenlik denetim günlüğü",
    icon: History,
    color: "from-indigo-600 to-violet-500",
    badge: "Güvenlik Günlüğü" as string | null,
  },
];

export default function SettingsModal({
  isOpen,
  onClose,
  onOpenAdmin,
  initialTab,
}: Props) {
  const router = useRouter();
  const {
    user,
    updateProfile,
    updatePrivacy,
    uploadAvatar,
    setPanicPassword,
    killSessions,
    regenerateSecurityCode,
    logout,
  } = useAuthStore();

  const [activeTab, setActiveTab] = useState<SettingsTabType>(
    (initialTab as SettingsTabType) || null
  );

  // Profile form state
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [readReceipts, setReadReceipts] = useState(
    user?.privacy_settings?.read_receipts ?? true
  );
  const [lastSeen, setLastSeen] = useState(
    user?.privacy_settings?.last_seen ?? true
  );
  const [allowCalls, setAllowCalls] = useState(
    user?.privacy_settings?.allow_calls ?? true
  );
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
  const [panicRedirectUrl, setPanicRedirectUrl] = useState(
    user?.panic_redirect_url || "https://zodiacrf.com"
  );
  const [hasPanicPassword, setHasPanicPassword] = useState(
    user?.has_panic_password || false
  );
  const [isSavingPanic, setIsSavingPanic] = useState(false);
  const [isKillingSessions, setIsKillingSessions] = useState(false);
  const [isRegeneratingSecurity, setIsRegeneratingSecurity] = useState(false);

  // Active Sessions & Devices state
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [terminatingSessionId, setTerminatingSessionId] = useState<string | null>(null);

  // Profile save & Push state
  const [isSaving, setIsSaving] = useState(false);
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

  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const list = await useAuthStore.getState().getSessions();
      setSessions(list);
    } catch (err) {
      console.error("Oturumlar yüklenemedi:", err);
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab as SettingsTabType);
      } else {
        setActiveTab(null);
      }
    }
  }, [initialTab, isOpen]);

  useEffect(() => {
    if (isOpen && activeTab === "sessions") {
      loadSessions();
    }
  }, [isOpen, activeTab, loadSessions]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || "");
      setBio(user.bio || "");
      setHasPanicPassword(!!user.has_panic_password);
      if (user.panic_login) setPanicLogin(user.panic_login);
      if (user.panic_redirect_url) {
        let clean = user.panic_redirect_url
          .trim()
          .replace(/^https?:\/\/www\.zodiacrf\.com/i, "https://zodiacrf.com");
        setPanicRedirectUrl(clean);
      }
    }
  }, [user]);

  useEffect(() => {
    if (user?.privacy_settings?.sound_alerts !== undefined) {
      setSoundAlerts(user.privacy_settings.sound_alerts);
      soundEffects.setSoundEnabled(user.privacy_settings.sound_alerts);
      if (typeof window !== "undefined") {
        localStorage.setItem(
          "aura_sound_alerts",
          String(user.privacy_settings.sound_alerts)
        );
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

  // Handlers
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateProfile(displayName, bio);
      showToast("Profil ayarları başarıyla kaydedildi!");
    } catch (err) {
      alert("Profil güncellenemedi.");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrivacyToggle = async (
    key: "read_receipts" | "last_seen" | "allow_calls",
    val: boolean
  ) => {
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

  const handleAvatarChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
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
      alert(
        "Lütfen panik durumunda giriş yapacağınız sahte e-posta veya kullanıcı adı belirleyin."
      );
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
      targetUrl = targetUrl.replace(
        /^https?:\/\/www\.zodiacrf\.com/i,
        "https://zodiacrf.com"
      );
      setPanicRedirectUrl(targetUrl);

      const res = await setPanicPassword(
        panicLogin.trim(),
        panicPassword,
        targetUrl
      );
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
    if (!confirm("Panik girişini ve şifresini kaldırmak istediğinize emin misiniz?"))
      return;
    setIsSavingPanic(true);
    try {
      let targetUrl = (panicRedirectUrl || "https://zodiacrf.com").trim();
      targetUrl = targetUrl.replace(
        /^https?:\/\/www\.zodiacrf\.com/i,
        "https://zodiacrf.com"
      );
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
    if (
      !confirm(
        "Bu cihaz haricindeki tüm aktif oturumları ve bağlantıları anında sonlandırmak istiyor musunuz?"
      )
    )
      return;
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
    if (
      !confirm(
        "Uçtan uca güvenlik kodunuzu yenilemek istiyor musunuz? Tüm sohbetlerdeki 60 haneli doğrulama kodları güncellenecektir."
      )
    )
      return;
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

      {/* AURA AYARLAR VE PROFİL MODALI */}
      <div className="relative w-full max-w-4xl h-[100dvh] sm:h-[85vh] bg-[#0D0F14] border-0 sm:border border-[#222631] sm:rounded-3xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 text-slate-200 overflow-hidden z-[101]">
        {/* Kayan Toast Bildirimi */}
        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-emerald-600/95 text-white text-xs font-bold shadow-2xl border border-emerald-400/30 flex items-center gap-2 animate-in fade-in slide-in-from-top-3 duration-300 pointer-events-none backdrop-blur-md whitespace-nowrap">
            <CheckCircle2 className="w-4 h-4 text-emerald-200 flex-shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Üst Başlık Barı (Header) */}
        <div className="flex items-center justify-between px-3.5 sm:px-5 py-3 sm:py-4 border-b border-[#222631] bg-[#12151C] flex-shrink-0">
          {activeTab === null ? (
            <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
              <div className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-gradient-to-tr from-pink-600 to-rose-500 flex items-center justify-center text-white shadow-md shadow-pink-950/40 flex-shrink-0 font-bold">
                ⚙️
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h2 className="text-xs sm:text-sm font-bold text-white tracking-wide truncate">
                    Ayarlar & Profil
                  </h2>
                  <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded-full bg-pink-500/20 text-pink-400 border border-pink-500/30 flex-shrink-0">
                    Aura
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                  Hesap, gizlilik, güvenlik kalkanı ve bildirim tercihleri
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
              <button
                type="button"
                onClick={() => setActiveTab(null)}
                className="p-1.5 sm:p-2 -ml-1 text-slate-300 hover:text-white rounded-xl hover:bg-slate-800/80 transition-all flex items-center gap-1.5 cursor-pointer group"
                title="Ayarlar Menüsüne Dön"
              >
                <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform text-pink-400" />
                <span className="text-xs font-bold text-slate-400 group-hover:text-white hidden sm:inline">Geri</span>
              </button>
              <div className="h-5 w-px bg-[#222631] mx-0.5 sm:mx-1" />
              <div className="min-w-0">
                <h2 className="text-xs sm:text-sm font-bold text-white tracking-wide truncate">
                  {SETTINGS_NAV_ITEMS.find((n) => n.id === activeTab)?.label || "Ayarlar"}
                </h2>
                <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                  {SETTINGS_NAV_ITEMS.find((n) => n.id === activeTab)?.desc || "Hesap ve profil yapılandırması"}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-2">
            <button
              onClick={onClose}
              title="Kapat"
              className="p-1.5 sm:p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/80 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Ana Gövde */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 md:p-6 bg-[#0B0D12]">
          {/* DİKEY ANA AYARLAR MENÜSÜ (activeTab === null) */}
          {activeTab === null && (
            <div className="space-y-4 max-w-3xl mx-auto">
              {/* Profil Kartı Banner */}
              <div className="p-4 rounded-2xl bg-[#12151E] border border-[#222635] flex items-center gap-4 shadow-sm">
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-xl text-pink-400 flex-shrink-0">
                  {user?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt={user.display_name} className="w-full h-full object-cover" />
                  ) : (
                    user?.display_name?.charAt(0).toUpperCase() || "U"
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white truncate">{user?.display_name || user?.username}</h3>
                    <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                      Çevrimiçi
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono truncate">@{user?.username}</p>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{user?.bio || "Aura kullanıcısı"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("profile")}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors flex-shrink-0 cursor-pointer"
                >
                  Profili Düzenle
                </button>
              </div>

              <div className="px-1 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                <span>Hesap & Sistem Tercihleri</span>
                <span className="text-[10px] text-slate-600 font-normal">{SETTINGS_NAV_ITEMS.length} Kategori</span>
              </div>

              <div className="space-y-2.5">
                {SETTINGS_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  let dynamicBadge = item.badge;
                  if (item.id === "security" && hasPanicPassword) dynamicBadge = "Korumada";
                  if (item.id === "sessions" && sessions.length > 0) dynamicBadge = `${sessions.length} Cihaz`;
                  if (item.id === "notifications" && isPushSubscribed) dynamicBadge = "Push Aktif";

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className="w-full flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-[#12151E] hover:bg-[#181D29] active:bg-[#1E2333] border border-[#222635] hover:border-pink-500/30 transition-all duration-150 cursor-pointer text-left group shadow-xs hover:shadow-md"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div className={`w-10 h-10 rounded-2xl bg-gradient-to-tr ${item.color} flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform text-white`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-bold text-white group-hover:text-pink-300 transition-colors truncate">
                              {item.label}
                            </span>
                            {dynamicBadge && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-400 font-semibold border border-pink-500/20 whitespace-nowrap">
                                {dynamicBadge}
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

                {/* SİSTEM PARAMETRELERİNE GEÇİŞ KARTI (Admin) */}
                {onOpenAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAdmin();
                    }}
                    className="w-full flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent hover:from-amber-500/20 hover:to-amber-500/10 active:bg-amber-500/25 border border-amber-500/30 hover:border-amber-500/50 transition-all duration-150 cursor-pointer text-left group shadow-xs hover:shadow-md mt-2"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-600 flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform text-white">
                        <Sliders className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-bold text-amber-300 group-hover:text-amber-200 transition-colors truncate">
                            Sistem Parametreleri
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-semibold border border-amber-500/30 whitespace-nowrap">
                            Yönetici
                          </span>
                        </div>
                        <p className="text-xs text-amber-200/70 line-clamp-1">
                          Sistem temaları, kayıt izinleri, hız sınırları ve canlı telemetri
                        </p>
                      </div>
                    </div>

                    <ChevronRight className="w-5 h-5 text-amber-400/80 group-hover:translate-x-1 transition-all flex-shrink-0 ml-2" />
                  </button>
                )}
              </div>

              {/* Alt Bilgi ve Çıkış Butonu */}
              <div className="pt-4 border-t border-[#1C202C] mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 px-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Aura Güvenli Oturum: Aktif</span>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 transition-all cursor-pointer font-semibold text-xs"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Hesaptan Çıkış Yap</span>
                </button>
              </div>
            </div>
          )}
            {/* 1. PROFİL DÜZENLEME */}
            {activeTab === "profile" && (
              <div className="space-y-5 max-w-xl">
                <div>
                  <h3 className="text-base font-bold text-white">Profil Bilgileri</h3>
                  <p className="text-xs text-slate-400">
                    Aura ağındaki diğer kullanıcıların sizi nasıl göreceğini özelleştirin.
                  </p>
                </div>

                {/* Avatar Yükleme */}
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <div className="relative group">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-xl text-pink-400">
                      {user?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.avatar_url}
                          alt={displayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        displayName.charAt(0).toUpperCase() || "U"
                      )}
                    </div>
                    <label className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                      {isUploadingAvatar ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Camera className="w-5 h-5" />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        disabled={isUploadingAvatar}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                      {user?.display_name}
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                      @{user?.username}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {user?.email}
                    </div>
                  </div>
                </div>

                {/* Profil Formu */}
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Görünen Ad
                    </label>
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-pink-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Biyografi / Durum Mesajı
                    </label>
                    <textarea
                      rows={3}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Kendiniz hakkında birkaç cümle..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-pink-500 resize-none"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-pink-600/30"
                    >
                      {isSaving ? "Kaydediliyor..." : "Profili Güncelle"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* 2. GİZLİLİK & TİKLER */}
            {activeTab === "privacy" && (
              <div className="space-y-5 max-w-xl">
                <div>
                  <h3 className="text-base font-bold text-white">Gizlilik & Tikler</h3>
                  <p className="text-xs text-slate-400">
                    WhatsApp mikro durumlarınızı ve görünürlük tercihlerinizi yönetin.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">Okundu Bilgisi (Mavi Tik)</div>
                      <div className="text-xs text-slate-400">
                        Kapatılırsa mesajları okuduğunuzda karşı tarafa çift mavi tik gitmez.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePrivacyToggle("read_receipts", !readReceipts)}
                      className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer ${
                        readReceipts ? "bg-emerald-500" : "bg-slate-700"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          readReceipts ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">Son Görülme Zamanı</div>
                      <div className="text-xs text-slate-400">
                        Diğer kullanıcıların son görülme zamanınızı görmesine izin verin.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePrivacyToggle("last_seen", !lastSeen)}
                      className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer ${
                        lastSeen ? "bg-emerald-500" : "bg-slate-700"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          lastSeen ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">Gelen Sesli & Görüntülü Aramalar</div>
                      <div className="text-xs text-slate-400">
                        Kişilerinizin size LiveKit üzerinden 1-e-1 arama başlatabilmesine izin verin.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePrivacyToggle("allow_calls", !allowCalls)}
                      className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer ${
                        allowCalls ? "bg-emerald-500" : "bg-slate-700"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          allowCalls ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3. PANİK ŞİFRESİ & GÜVENLİK */}
            {activeTab === "security" && (
              <div className="space-y-5 max-w-xl">
                <div>
                  <h3 className="text-base font-bold text-white">Panik Modu & Oturum Güvenliği</h3>
                  <p className="text-xs text-slate-400">
                    Zorlama anında sahte yönlendirme şifresi belirleyin ve aktif cihazları kontrol edin.
                  </p>
                </div>

                {/* Panik Şifresi Belirleme */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <span>Zorlama / Panik Girişi</span>
                        {hasPanicPassword && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                            Aktif Korumada
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Zorlama veya tehdit anında bu sahte kullanıcı adı/şifre ile giriş yapıldığında sohbetler açılmaz, belirlenen adrese yönlendirilir.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSavePanic} className="space-y-3 pt-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                        Sahte Giriş Kimliği (E-Posta veya Kullanıcı Adı)
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Örn: muhasebe@zodiacrf.com veya guest_user"
                        value={panicLogin}
                        onChange={(e) => setPanicLogin(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                        Panik Şifresi
                      </label>
                      <input
                        type="password"
                        placeholder={hasPanicPassword ? "Değiştirmek için yeni şifre girin" : "En az 6 karakter"}
                        value={panicPassword}
                        onChange={(e) => setPanicPasswordInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                        Zorlama Anında Yönlendirilecek Web Sitesi
                      </label>
                      <input
                        type="url"
                        value={panicRedirectUrl}
                        onChange={(e) => setPanicRedirectUrl(e.target.value)}
                        placeholder="https://zodiacrf.com"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      {hasPanicPassword && (
                        <button
                          type="button"
                          onClick={handleRemovePanic}
                          className="text-xs text-rose-400 hover:underline cursor-pointer"
                        >
                          Panik Girişini Kaldır
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={isSavingPanic}
                        className="ml-auto px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all cursor-pointer shadow-md"
                      >
                        {isSavingPanic ? "Kaydediliyor..." : "Panik Ayarlarını Kaydet"}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Oturumları Sonlandırma & Güvenlik Kodu */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">Tüm Diğer Oturumları Kapat</div>
                      <div className="text-xs text-slate-400">
                        Bu cihaz haricindeki tüm aktif tarayıcı ve oturumları anında sonlandırır.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleKillOtherSessions}
                      disabled={isKillingSessions}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold hover:bg-rose-500/30 transition-colors cursor-pointer"
                    >
                      {isKillingSessions ? "Kapatılıyor..." : "Tümünü Kapat"}
                    </button>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">Uçtan Uca Güvenlik Kodunu Sıfırla</div>
                      <div className="text-xs text-slate-400">
                        Tüm sohbetlerdeki 60 haneli doğrulama kodlarını yeniden üretir.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRegenerateSecurity}
                      disabled={isRegeneratingSecurity}
                      className="px-3 py-1.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold hover:bg-indigo-500/30 transition-colors cursor-pointer"
                    >
                      {isRegeneratingSecurity ? "Yenileniyor..." : "Yenile"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3.5. AKTİF CİHAZLAR & OTURUMLAR */}
            {activeTab === "sessions" && (
              <div className="space-y-6 max-w-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Smartphone className="w-5 h-5 text-pink-400" />
                      <span>Aktif Cihazlar & Oturumlar</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Aura hesabınıza şu anda bağlı olan tüm bilgisayar, telefon ve tarayıcı oturumları.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={loadSessions}
                    title="Listeyi Yenile"
                    className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingSessions ? "animate-spin text-pink-400" : ""}`} />
                  </button>
                </div>

                {isLoadingSessions && sessions.length === 0 ? (
                  <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                    <Loader2 className="w-7 h-7 animate-spin text-pink-500" />
                    <span>Aktif oturumlar taranıyor...</span>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* 1. BU CİHAZ (ŞU ANKİ OTURUM) */}
                    <div>
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">
                        Bu Cihaz (Şu Anki Oturum)
                      </div>

                      {(() => {
                        // Tarayıcı ortamında istemci cihaz bilgisi
                        const clientInfo = (() => {
                          if (typeof window === "undefined") {
                            return { device_name: "Windows Bilgisayar", device_type: "desktop" as const, os: "Windows", browser: "Google Chrome" };
                          }
                          const ua = navigator.userAgent.toLowerCase();
                          let device_type: "desktop" | "mobile" | "tablet" = "desktop";
                          let os = "Windows";
                          let device_name = "Windows Bilgisayar";
                          let browser = "Google Chrome";

                          if (ua.includes("ipad") || (ua.includes("macintosh") && "ontouchend" in document)) {
                            device_type = "tablet";
                            os = "iPadOS";
                            device_name = "Apple iPad";
                          } else if (ua.includes("iphone")) {
                            device_type = "mobile";
                            os = "iOS";
                            device_name = "Apple iPhone";
                          } else if (ua.includes("android")) {
                            device_type = ua.includes("mobile") ? "mobile" : "tablet";
                            os = "Android";
                            device_name = device_type === "mobile" ? "Android Cihaz" : "Android Tablet";
                          } else if (ua.includes("macintosh") || ua.includes("mac os")) {
                            device_type = "desktop";
                            os = "macOS";
                            device_name = "Apple Mac";
                          } else if (ua.includes("linux")) {
                            device_type = "desktop";
                            os = "Linux";
                            device_name = "Linux Bilgisayar";
                          }

                          if (ua.includes("edg/") || ua.includes("edge/")) {
                            browser = "Microsoft Edge";
                          } else if (ua.includes("opr/") || ua.includes("opera")) {
                            browser = "Opera";
                          } else if (ua.includes("chrome/") && !ua.includes("edg/") && !ua.includes("opr/")) {
                            browser = "Google Chrome";
                          } else if (ua.includes("safari/") && !ua.includes("chrome/")) {
                            browser = "Safari";
                          } else if (ua.includes("firefox/")) {
                            browser = "Mozilla Firefox";
                          }

                          return { device_name, device_type, os, browser };
                        })();

                        const currentSession = sessions.find((s) => s.is_current) || {
                          device_name: clientInfo.device_name,
                          device_type: clientInfo.device_type,
                          os: clientInfo.os,
                          browser: clientInfo.browser,
                          ip_address: "Mevcut Bağlantı",
                          location: "Yerel Oturum",
                          is_current: true,
                          last_active_at: new Date().toISOString(),
                          id: "curr",
                          user_id: user?.id || "",
                          session_id: "curr",
                          created_at: new Date().toISOString(),
                        };

                        return (
                          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-950 border border-emerald-500/30 shadow-lg shadow-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0 shadow-sm">
                                {currentSession.device_type === "mobile" ? (
                                  <Smartphone className="w-6 h-6" />
                                ) : currentSession.device_type === "tablet" ? (
                                  <Tablet className="w-6 h-6" />
                                ) : (
                                  <Laptop className="w-6 h-6" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-sm font-bold text-white truncate">
                                    {currentSession.device_name}
                                  </h4>
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    <span>Bu Cihaz (Şu Anki Oturum)</span>
                                  </span>
                                </div>
                                <p className="text-xs text-slate-300 mt-0.5">
                                  {currentSession.browser} • {currentSession.os}
                                </p>
                                <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1 flex-wrap font-mono">
                                  <span>{currentSession.ip_address}</span>
                                  {currentSession.location && (
                                    <>
                                      <span>•</span>
                                      <span className="font-sans text-slate-300">{currentSession.location}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20 self-start sm:self-center">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Çevrimiçi & Aktif</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* 2. DİĞER AKTİF CİHAZLAR */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Diğer Aktif Cihazlar ({sessions.filter((s) => !s.is_current).length})
                        </div>

                        {sessions.some((s) => !s.is_current) && (
                          <button
                            type="button"
                            onClick={handleKillOtherSessions}
                            disabled={isKillingSessions}
                            className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>{isKillingSessions ? "Kapatılıyor..." : "Diğer Tüm Oturumları Kapat"}</span>
                          </button>
                        )}
                      </div>

                      {sessions.filter((s) => !s.is_current).length === 0 ? (
                        <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 text-center flex flex-col items-center justify-center gap-2">
                          <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                            <ShieldCheck className="w-5 h-5" />
                          </div>
                          <h4 className="text-xs font-bold text-slate-200">Başka Açık Cihaz Yok</h4>
                          <p className="text-[11px] text-slate-400 max-w-sm">
                            Hesabınıza şu anda yalnızca bu cihaz üzerinden erişilmektedir. Diğer cihaz oturumları kapalıdır.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {sessions
                            .filter((s) => !s.is_current)
                            .map((s) => {
                              const isTerminating = terminatingSessionId === s.session_id;

                              return (
                                <div
                                  key={s.id || s.session_id}
                                  className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/70 hover:bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 transition-all flex items-center justify-between gap-3"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 flex-shrink-0">
                                      {s.device_type === "mobile" ? (
                                        <Smartphone className="w-5 h-5" />
                                      ) : s.device_type === "tablet" ? (
                                        <Tablet className="w-5 h-5" />
                                      ) : (
                                        <Laptop className="w-5 h-5" />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                                          {s.device_name}
                                        </h4>
                                        {s.is_online ? (
                                          <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold border border-emerald-500/30 flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                            <span>Çevrimiçi</span>
                                          </span>
                                        ) : (
                                          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[10px] border border-slate-700/60">
                                            Çevrimdışı
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                        {s.browser} • {s.os}
                                      </p>
                                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5 flex-wrap">
                                        <span className="font-mono">{s.ip_address}</span>
                                        {s.location && (
                                          <>
                                            <span>•</span>
                                            <span className="text-slate-400">{s.location}</span>
                                          </>
                                        )}
                                        <span>•</span>
                                        <span className="text-slate-400">
                                          {formatStoryTime(s.last_active_at)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!confirm(`"${s.device_name}" cihazındaki oturumu sonlandırmak istediğinizden emin misiniz?`)) return;
                                      setTerminatingSessionId(s.session_id);
                                      try {
                                        await useAuthStore.getState().terminateSession(s.session_id);
                                        showToast("Cihaz oturumu kapatıldı.");
                                        await loadSessions();
                                      } catch {
                                        alert("Oturum kapatılamadı.");
                                      } finally {
                                        setTerminatingSessionId(null);
                                      }
                                    }}
                                    disabled={isTerminating}
                                    title="Bu cihazdaki oturumu uzaktan sonlandır"
                                    className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 flex-shrink-0 shadow-sm"
                                  >
                                    {isTerminating ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                                    ) : (
                                      <>
                                        <LogOut className="w-3.5 h-3.5" />
                                        <span className="text-[11px] sm:text-xs">Oturumu Kapat</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. BİLDİRİMLER & SESLER */}
            {activeTab === "notifications" && (
              <div className="space-y-5 max-w-xl">
                <div>
                  <h3 className="text-base font-bold text-white">Bildirimler & Sesler</h3>
                  <p className="text-xs text-slate-400">
                    Tarayıcı Web Push bildirimleri ve gelen/giden mesaj ses efektleri.
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Web Push */}
                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-white">Web Push Bildirimleri</div>
                        <div className="text-xs text-slate-400">
                          Uygulama kapalıyken bile arka planda anlık mesaj bildirimleri alın.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleTogglePush}
                        disabled={isPushLoading}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          isPushSubscribed
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                        }`}
                      >
                        {isPushLoading ? "İşleniyor..." : isPushSubscribed ? "Aktif" : "Etkinleştir"}
                      </button>
                    </div>

                    {isPushSubscribed && (
                      <div className="pt-2 border-t border-slate-800 flex justify-end">
                        <button
                          type="button"
                          onClick={handleTestPush}
                          disabled={isPushLoading}
                          className="text-xs text-pink-400 hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Test Bildirimi Gönder</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Ses Efektleri */}
                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">Mesaj ve Arama Sesleri</div>
                      <div className="text-xs text-slate-400">
                        Mesaj gönderildiğinde, alındığında ve arama geldiğinde ses efekti çal.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleSound}
                      className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer ${
                        soundAlerts ? "bg-emerald-500" : "bg-slate-700"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          soundAlerts ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 5. GİRİŞ KAYITLARIM (GEÇMİŞ GÜVENLİK GÜNLÜĞÜ) */}
            {activeTab === "access_logs" && (
              <div className="space-y-4 max-w-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-white">Giriş Kayıtlarım & Geçmiş</h3>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-mono border border-slate-700">
                        Güvenlik Denetim Günlüğü
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Hesabınıza bugüne kadar yapılan başarılı girişlerin değişmez tarihçesidir (Aktif açık oturumları kapatmak için &quot;Aktif Cihazlarım&quot; sekmesini kullanın).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLoadingUserLogs(true);
                      api
                        .get("/users/access-logs")
                        .then((res) => setUserAccessLogs(res.data))
                        .finally(() => setIsLoadingUserLogs(false));
                    }}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingUserLogs ? "animate-spin" : ""}`} />
                  </button>
                </div>

                {isLoadingUserLogs ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                    <Loader2 className="w-6 h-6 animate-spin text-pink-500" />
                    <span>Kayıtlar yükleniyor...</span>
                  </div>
                ) : userAccessLogs.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500">Henüz kayıtlı bir giriş geçmişi bulunmuyor.</p>
                ) : (
                  <div className="space-y-2.5">
                    {userAccessLogs.map((log: any, idx: number) => {
                      const isMobile = (log.device_info || "").toLowerCase().includes("iphone") || (log.device_info || "").toLowerCase().includes("android");
                      return (
                        <div
                          key={idx}
                          className="p-3 sm:p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shadow-xs"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 flex-shrink-0">
                              {isMobile ? (
                                <Smartphone className="w-4 h-4 text-pink-400" />
                              ) : (
                                <Laptop className="w-4 h-4 text-blue-400" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-white text-xs truncate">{log.device_info || "Bilinmeyen Cihaz"}</span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                                  Giriş Yapıldı
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-400 font-mono block mt-0.5">{log.ip_address}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-end sm:text-right flex-shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-800/80">
                            <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono">
                              {new Date(log.created_at).toLocaleString("tr-TR")}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
}
