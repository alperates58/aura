"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, User } from "@/store/useAuthStore";
import { api, getBasePath } from "@/lib/api";
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
  Key,
  Bell,
  History,
  Sliders,
  Camera,
  Loader2,
  Lock,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  LogOut,
  ChevronRight,
  Sparkles,
} from "lucide-react";

export type SettingsTabType =
  | "profile"
  | "privacy"
  | "security"
  | "notifications"
  | "access_logs";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenAdmin?: (tab?: string) => void;
  initialTab?: string;
}

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
    (initialTab as SettingsTabType) || "profile"
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

  useEffect(() => {
    if (initialTab && isOpen) {
      if (
        initialTab === "profile" ||
        initialTab === "privacy" ||
        initialTab === "security" ||
        initialTab === "notifications" ||
        initialTab === "access_logs"
      ) {
        setActiveTab(initialTab as SettingsTabType);
      }
    }
  }, [initialTab, isOpen]);

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
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-[#222631] bg-[#12151C] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-pink-600 to-rose-500 flex items-center justify-center text-white shadow-md shadow-pink-950/40 flex-shrink-0 font-bold">
              ⚙️
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-wide truncate">
                Ayarlar & Profil
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Hesap, gizlilik, güvenlik kalkanı ve bildirim tercihleri
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {onOpenAdmin && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAdmin();
                }}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all cursor-pointer shadow-sm"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Sistem Parametreleri</span>
              </button>
            )}
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
          <div className="w-full md:w-60 bg-[#0F1218] border-b md:border-b-0 md:border-r border-[#222631] flex flex-row md:flex-col p-2.5 gap-1.5 md:gap-0 md:space-y-1 overflow-x-auto md:overflow-y-auto flex-shrink-0 no-scrollbar custom-scrollbar">
            <div className="hidden md:block px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Ayarlar Menüsü
            </div>

            <button
              onClick={() => setActiveTab("profile")}
              className={`flex-shrink-0 flex items-center gap-2.5 px-3 py-2 md:py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left whitespace-nowrap ${
                activeTab === "profile"
                  ? "bg-pink-600/15 text-pink-400 border border-pink-500/30 shadow-xs"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
              }`}
            >
              <UserIcon
                className={`w-4 h-4 flex-shrink-0 ${
                  activeTab === "profile" ? "text-pink-400" : "text-slate-400"
                }`}
              />
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
              <Shield
                className={`w-4 h-4 flex-shrink-0 ${
                  activeTab === "privacy" ? "text-pink-400" : "text-slate-400"
                }`}
              />
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
              <Key
                className={`w-4 h-4 flex-shrink-0 ${
                  activeTab === "security" ? "text-pink-400" : "text-slate-400"
                }`}
              />
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
              <Bell
                className={`w-4 h-4 flex-shrink-0 ${
                  activeTab === "notifications"
                    ? "text-pink-400"
                    : "text-slate-400"
                }`}
              />
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
              <History
                className={`w-4 h-4 flex-shrink-0 ${
                  activeTab === "access_logs"
                    ? "text-pink-400"
                    : "text-slate-400"
                }`}
              />
              <span>Giriş Kayıtlarım</span>
            </button>

            {/* SİSTEM PARAMETRELERİNE GEÇİŞ BUTONU */}
            {onOpenAdmin && (
              <div className="pt-3 border-t border-[#222631] mt-auto">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAdmin();
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/25 text-xs font-bold transition-all cursor-pointer shadow-sm group"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Sliders className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                    <span className="truncate">Sistem Parametreleri</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-amber-400/70" />
                </button>
              </div>
            )}
          </div>

          {/* 2. SÜTUN: Sağ İçerik Alanı */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#0B0D12]">
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

            {/* 5. GİRİŞ KAYITLARIM */}
            {activeTab === "access_logs" && (
              <div className="space-y-4 max-w-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">Son Giriş Kayıtlarım</h3>
                    <p className="text-xs text-slate-400">
                      Hesabınıza erişilen son IP adresleri, cihazlar ve oturum zamanları.
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
                  <div className="space-y-2 max-h-[450px] overflow-y-auto">
                    {userAccessLogs.map((log: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <Smartphone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <div>
                            <span className="font-semibold text-white block">{log.device_info || "Bilinmeyen Cihaz"}</span>
                            <span className="text-[11px] text-slate-400 font-mono">{log.ip_address}</span>
                          </div>
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
          </div>
        </div>
      </div>
    </div>
  );
}
