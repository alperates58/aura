"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, UserSession } from "@/store/useAuthStore";
import { api, getBasePath } from "@/lib/api";
import { getPushSubscription } from "@/lib/push_notifications";
import {
  ArrowLeft,
  X,
  User as UserIcon,
  Shield,
  Key,
  Bell,
  History,
  Sliders,
  Smartphone,
  CheckCircle2,
  ChevronRight,
  LogOut,
} from "lucide-react";
import {
  ProfileTab,
  PrivacyTab,
  SecurityTab,
  SessionsTab,
  NotificationsTab,
  AccessLogsTab,
} from "./settings";

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
  const { user, killSessions, logout } = useAuthStore();

  const [activeTab, setActiveTab] = useState<SettingsTabType>(
    (initialTab as SettingsTabType) || null
  );

  const [soundAlerts, setSoundAlerts] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("aura_sound_alerts");
      if (saved !== null) return saved !== "false";
    }
    return user?.privacy_settings?.sound_alerts ?? true;
  });

  const [isKillingSessions, setIsKillingSessions] = useState(false);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [userAccessLogs, setUserAccessLogs] = useState<any[]>([]);
  const [isLoadingUserLogs, setIsLoadingUserLogs] = useState(false);
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);

  const showToast = useCallback((msg: string = "Ayarlar başarıyla kaydedildi!") => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

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

  const loadUserLogs = useCallback(() => {
    setIsLoadingUserLogs(true);
    api
      .get("/users/access-logs")
      .then((res) => setUserAccessLogs(res.data))
      .catch((err) => console.error("Access log hatası:", err))
      .finally(() => setIsLoadingUserLogs(false));
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
    if (isOpen && activeTab === "access_logs") {
      loadUserLogs();
    }
  }, [isOpen, activeTab, loadUserLogs]);

  useEffect(() => {
    if (isOpen) {
      getPushSubscription().then((sub) => setIsPushSubscribed(!!sub));
    }
  }, [isOpen]);

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
      await loadSessions();
    } catch {
      alert("Oturumlar sonlandırılamadı.");
    } finally {
      setIsKillingSessions(false);
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
                  if (item.id === "security" && user?.has_panic_password) dynamicBadge = "Korumada";
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
            <ProfileTab user={user} showToast={showToast} />
          )}

          {/* 2. GİZLİLİK & TİKLER */}
          {activeTab === "privacy" && (
            <PrivacyTab user={user} showToast={showToast} />
          )}

          {/* 3. PANİK ŞİFRESİ & GÜVENLİK */}
          {activeTab === "security" && (
            <SecurityTab user={user} showToast={showToast} />
          )}

          {/* 3.5. AKTİF CİHAZLAR & OTURUMLAR */}
          {activeTab === "sessions" && (
            <SessionsTab
              user={user}
              sessions={sessions}
              isLoadingSessions={isLoadingSessions}
              loadSessions={loadSessions}
              handleKillOtherSessions={handleKillOtherSessions}
              isKillingSessions={isKillingSessions}
              showToast={showToast}
            />
          )}

          {/* 4. BİLDİRİMLER & SESLER */}
          {activeTab === "notifications" && (
            <NotificationsTab
              isPushSubscribed={isPushSubscribed}
              setIsPushSubscribed={setIsPushSubscribed}
              soundAlerts={soundAlerts}
              setSoundAlerts={setSoundAlerts}
              showToast={showToast}
            />
          )}

          {/* 5. GİRİŞ KAYITLARIM (GEÇMİŞ GÜVENLİK GÜNLÜĞÜ) */}
          {activeTab === "access_logs" && (
            <AccessLogsTab
              userAccessLogs={userAccessLogs}
              isLoadingUserLogs={isLoadingUserLogs}
              loadUserLogs={loadUserLogs}
            />
          )}
        </div>
      </div>
    </div>
  );
}
