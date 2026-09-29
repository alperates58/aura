"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { api, getBasePath } from "@/lib/api";
import {
  X,
  User,
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
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  getPushSubscription,
  subscribeUserToPush,
  unsubscribeUserFromPush,
  sendTestPushNotification,
} from "@/lib/push_notifications";
import { soundEffects } from "@/lib/sounds";


interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenAdmin?: () => void;
}

export default function SettingsModal({ isOpen, onClose, onOpenAdmin }: Props) {
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

  const [activeTab, setActiveTab] = useState<"profile" | "privacy" | "security" | "notifications" | "access_logs">("profile");
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

  // Security features state (Panic password, Remote kill sessions, Security code)
  const [panicLogin, setPanicLogin] = useState(user?.panic_login || "");
  const [panicPassword, setPanicPasswordInput] = useState("");
  const [panicRedirectUrl, setPanicRedirectUrl] = useState(user?.panic_redirect_url || "https://zodiacrf.com");
  const [hasPanicPassword, setHasPanicPassword] = useState(user?.has_panic_password || false);
  const [isSavingPanic, setIsSavingPanic] = useState(false);
  const [isKillingSessions, setIsKillingSessions] = useState(false);
  const [isRegeneratingSecurity, setIsRegeneratingSecurity] = useState(false);

  useEffect(() => {
    if (user) {
      setHasPanicPassword(!!user.has_panic_password);
      if (user.panic_login) {
        setPanicLogin(user.panic_login);
      }
      if (user.panic_redirect_url) {
        let clean = user.panic_redirect_url.trim();
        clean = clean.replace(/^https?:\/\/www\.zodiacrf\.com/i, "https://zodiacrf.com");
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

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [accessLogs, setAccessLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const showToast = (msg: string = "Ayarlar başarıyla kaydedildi!") => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Push notifications state
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null);
  const [isPushLoading, setIsPushLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getPushSubscription().then((sub) => setIsPushSubscribed(!!sub));
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeTab === "access_logs") {
      setIsLoadingLogs(true);
      api
        .get("/users/access-logs")
        .then((res) => setAccessLogs(res.data))
        .catch((err) => console.error("Access log hatası:", err))
        .finally(() => setIsLoadingLogs(false));
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

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

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in select-none"
    >
      <div className="w-full max-w-lg bg-grupo-dark-card border border-grupo-dark-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh] relative">
        {/* Ayarlar Kaydedildi Kayan Toast Bildirimi */}
        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-emerald-600/95 text-white text-xs font-bold shadow-2xl shadow-emerald-950/80 border border-emerald-400/30 flex items-center gap-2 animate-in fade-in slide-in-from-top-3 duration-300 pointer-events-none backdrop-blur-md whitespace-nowrap">
            <CheckCircle className="w-4 h-4 text-emerald-200 flex-shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Başlık Barı */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-grupo-dark-border flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-pink-500/10 text-pink-400 flex items-center justify-center font-bold">
              ⚙️
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Ayarlar ve Profil</h2>
              <p className="text-xs text-slate-400">Hesabınızı ve tercihlerinizi yönetin</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Butonları (Mobilde tam genişlik ve responsive etiketler) */}
        <div className="flex items-center overflow-x-auto scrollbar-none border-b border-grupo-dark-border px-1.5 sm:px-6 pt-1 sm:pt-2 bg-slate-900/40">
          <button
            onClick={() => setActiveTab("profile")}
            className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-3 text-[11px] sm:text-xs font-bold border-b-2 transition-colors cursor-pointer flex-shrink-0 whitespace-nowrap ${
              activeTab === "profile"
                ? "border-grupo-accent text-pink-400"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            <span className="hidden sm:inline">Profilim</span>
            <span className="sm:hidden">Profil</span>
          </button>
          <button
            onClick={() => setActiveTab("privacy")}
            className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-3 text-[11px] sm:text-xs font-bold border-b-2 transition-colors cursor-pointer flex-shrink-0 whitespace-nowrap ${
              activeTab === "privacy"
                ? "border-grupo-accent text-pink-400"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            <span>Gizlilik</span>
          </button>

          <button
            onClick={() => setActiveTab("security")}
            className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-3 text-[11px] sm:text-xs font-bold border-b-2 transition-colors cursor-pointer flex-shrink-0 whitespace-nowrap ${
              activeTab === "security"
                ? "border-grupo-accent text-pink-400"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <Key className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            <span className="hidden sm:inline">Güvenlik</span>
            <span className="sm:hidden">Güvenlik</span>
          </button>

          <button
            onClick={() => setActiveTab("notifications")}
            className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-3 text-[11px] sm:text-xs font-bold border-b-2 transition-colors cursor-pointer flex-shrink-0 whitespace-nowrap ${
              activeTab === "notifications"
                ? "border-grupo-accent text-pink-400"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            <span className="hidden sm:inline">Web Push</span>
            <span className="sm:hidden">Push</span>
          </button>
          <button
            onClick={() => setActiveTab("access_logs")}
            className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-3 text-[11px] sm:text-xs font-bold border-b-2 transition-colors cursor-pointer flex-shrink-0 whitespace-nowrap ${
              activeTab === "access_logs"
                ? "border-grupo-accent text-pink-400"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            <span className="hidden sm:inline">Giriş Kayıtları</span>
            <span className="sm:hidden">Girişler</span>
          </button>
        </div>

        {/* Tab İçerikleri */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 sm:space-y-6">
          {activeTab === "profile" && (
            <div className="space-y-6">
              {/* Avatar Yükleme */}
              <div className="flex items-center gap-5">
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
                    Görseli değiştirmek için üzerine tıklayın
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
                    className="w-full bg-slate-900 border border-grupo-dark-border rounded-xl py-2.5 px-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-grupo-accent transition-colors"
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
                    className="w-full bg-slate-900 border border-grupo-dark-border rounded-xl py-2.5 px-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-grupo-accent transition-colors"
                  />
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2.5 rounded-xl bg-grupo-accent hover:bg-grupo-accent-hover text-white text-xs font-bold shadow-lg shadow-pink-500/25 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>Değişiklikleri Kaydet</span>
                  </button>

                  {saveSuccess && (
                    <span className="text-xs text-emerald-400 font-medium animate-in fade-in">
                      ✓ Profil güncellendi!
                    </span>
                  )}
                </div>
              </form>

              {/* Hesap Bilgileri */}
              <div className="pt-4 border-t border-grupo-dark-border space-y-2 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>Kayıtlı E-posta:</span>
                  <span className="text-slate-200 font-medium">{user?.email}</span>
                </div>
                <div className="flex justify-between">
                  <span>Kullanıcı Kimliği:</span>
                  <span className="font-mono text-[11px] text-slate-500">{user?.id}</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === "privacy" && (
            <div className="space-y-5">
              {/* Okundu Bilgisi (Mavi Tik) */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-grupo-dark-border flex items-center justify-between gap-4">
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
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-grupo-dark-border flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white">Son Görülme Zamanı</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Çevrimiçi olmadığınızda son görülme bilginiz gizlenir.
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
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-grupo-dark-border flex items-center justify-between gap-4">
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

              {/* Bildirim Sesleri Aç / Kapat */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-grupo-dark-border flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                    {soundAlerts ? <Volume2 className="w-4 h-4 text-pink-400 flex-shrink-0" /> : <VolumeX className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                    <span>Bildirim Sesleri ve Uyarılar</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        soundAlerts
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}
                    >
                      {soundAlerts ? "Sesli" : "Sessiz"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {soundAlerts
                      ? "Yeni mesaj geldiğinde ses efekti çalınır."
                      : "Telefonunuz seslide olsa dahi bildirimler sessiz iletilir ve ses çalmaz."}
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
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 flex items-center justify-center ${
                      soundAlerts ? "translate-x-5" : "translate-x-0"
                    }`}
                  >
                    {soundAlerts ? (
                      <Volume2 className="w-2.5 h-2.5 text-pink-600" />
                    ) : (
                      <VolumeX className="w-2.5 h-2.5 text-slate-500" />
                    )}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-2 p-3 rounded-xl bg-pink-500/10 border border-pink-500/20 text-xs text-pink-300">
                <Lock className="w-4 h-4 flex-shrink-0" />
                <span>Tüm iletişim ve görüşmeler self-hosted sunucumuzda şifrelenir.</span>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-6">
              {/* Bölüm 1: Panik Şifresi & Yönlendirme Linki */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-grupo-dark-border space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
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
                      className="w-full bg-slate-950 border border-grupo-dark-border rounded-xl py-2 px-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60 transition-colors"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Zorla şifre istendiğinde gerçek kullanıcı adınızı değil, bu sahte kullanıcı adı/e-posta ve şifrenizi girin.
                    </p>
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
                      className="w-full bg-slate-950 border border-grupo-dark-border rounded-xl py-2 px-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60 transition-colors"
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
                        className="w-full bg-slate-950 border border-grupo-dark-border rounded-xl py-2 pl-3 pr-8 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/60 transition-colors"
                      />
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Örn: https://zodiacrf.com veya bir haber sitesi. Panik şifresi girildiğinde kişi hiçbir mesajınızı görmeden bu adrese atılır.
                    </p>
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

              {/* Bölüm 2: Uzaktan Cihaz Düşürme (Remote Kill Session) */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-grupo-dark-border space-y-3">
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
                    {isKillingSessions ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <PowerOff className="w-3.5 h-3.5" />
                    )}
                    <span>Tüm Diğer Oturumları Kapat</span>
                  </button>
                </div>
              </div>

              {/* Bölüm 3: Uçtan Uca Güvenlik Kodu Sıfırlama */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-grupo-dark-border space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center flex-shrink-0">
                    <Key className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-white">Uçtan Uca Güvenlik Anahtarını Yenile</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Tüm sohbetlerinizdeki 60 haneli uçtan uca şifreleme doğrulama numaranızı yeniden oluşturur. Karşı taraf da kodun yenilendiğini görür.
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

          {activeTab === "notifications" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-grupo-dark-border">
                <div>
                  <h4 className="text-sm font-bold text-white">Web Push Bildirimleri (VAPID)</h4>
                  <p className="text-xs text-slate-400">
                    Tarayıcı kapalıyken veya telefon kilitliyken bile anlık mesaj bildirimleri alın.
                  </p>
                </div>
                <Bell className="w-5 h-5 text-pink-400" />
              </div>

              {pushStatusMessage && (
                <div className="p-3 rounded-xl bg-pink-500/10 border border-pink-500/20 text-xs text-pink-300 animate-fadeIn">
                  {pushStatusMessage}
                </div>
              )}

              {/* Web Push Aç / Kapat */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-grupo-dark-border flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Anlık Cihaz Bildirimleri</span>
                    {isPushSubscribed ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                        Aktif
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 whitespace-nowrap">
                        Kapalı
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Yeni bir mesaj geldiğinde cihazınızda zil sesi ve önizleme ile bildirim çıkar.
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isPushLoading}
                  onClick={handleTogglePush}
                  className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer flex-shrink-0 ${
                    isPushSubscribed ? "bg-grupo-accent" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      isPushSubscribed ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Sesli Bildirim ve Zil Sesi Aç / Kapat */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-grupo-dark-border flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    {soundAlerts ? <Volume2 className="w-4 h-4 text-pink-400 flex-shrink-0" /> : <VolumeX className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                    <span>Bildirim Sesleri ve Zil Sesi</span>
                    {soundAlerts ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                        Sesli
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 whitespace-nowrap">
                        Sessiz
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Telefonunuz seslide olsa dahi bildirimler sessiz iletilir ve mesaj sesi çalmaz.
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
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 flex items-center justify-center ${
                      soundAlerts ? "translate-x-5" : "translate-x-0"
                    }`}
                  >
                    {soundAlerts ? (
                      <Volume2 className="w-2.5 h-2.5 text-pink-600" />
                    ) : (
                      <VolumeX className="w-2.5 h-2.5 text-slate-500" />
                    )}
                  </span>
                </button>
              </div>

              {/* Test Bildirimi Butonu */}
              {isPushSubscribed && (
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-grupo-dark-border flex items-center justify-between">
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

              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 text-[11px] text-slate-400 space-y-1">
                <p className="font-semibold text-slate-300">💡 Nasıl Çalışır?</p>
                <p>
                  Aura, Google FCM veya Apple Push sunucularına doğrudan şifreli RFC standardında VAPID istekleri gönderir. Sekmeniz tamamen kapalı olsa dahi telefonunuz uyanır.
                </p>
              </div>
            </div>
          )}

          {activeTab === "access_logs" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-grupo-dark-border gap-2">
                <div className="min-w-0 pr-1">
                  <h4 className="text-sm font-bold text-white">Son Giriş Kayıtları (Access Logs)</h4>
                  <p className="text-xs text-slate-400">
                    Hesabınıza yapılan son oturum açma işlemleri ve kullanılan cihazlar.
                  </p>
                </div>
                <History className="w-5 h-5 text-pink-400 flex-shrink-0" />
              </div>

              {isLoadingLogs ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                  <Loader2 className="w-6 h-6 animate-spin text-pink-500" />
                  <span>Kayıtlar yükleniyor...</span>
                </div>
              ) : accessLogs.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Henüz kayıtlı bir giriş geçmişi bulunamadı.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {accessLogs.map((log: any, idx: number) => {
                    const isMobile =
                      log.device_info?.toLowerCase().includes("iphone") ||
                      log.device_info?.toLowerCase().includes("android");

                    return (
                      <div
                        key={log.id || idx}
                        className="p-3 sm:p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 text-xs transition-colors hover:border-slate-700/80"
                      >
                        <div className="flex items-start sm:items-center justify-between gap-3">
                          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 text-pink-400 mt-0.5 sm:mt-0">
                              {isMobile ? (
                                <Smartphone className="w-4 h-4" />
                              ) : (
                                <Laptop className="w-4 h-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center flex-wrap gap-1.5">
                                <span className="font-semibold text-white truncate max-w-[140px] xs:max-w-[200px] sm:max-w-none">
                                  {log.device_info || "Bilinmeyen Cihaz"}
                                </span>
                                {idx === 0 && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20 whitespace-nowrap flex-shrink-0">
                                    Son Giriş
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="flex items-center gap-1 font-mono">
                                  <Globe className="w-3 h-3 text-slate-500 flex-shrink-0" />
                                  {log.ip_address}
                                </span>
                                <span className="text-slate-600 sm:hidden">•</span>
                                <span className="text-[11px] text-slate-400 sm:hidden font-medium">
                                  {new Date(log.created_at).toLocaleString("tr-TR", {
                                    day: "2-digit",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Geniş ekranda sağ tarafta tarih */}
                          <div className="hidden sm:block text-[11px] text-slate-400 text-right flex-shrink-0 font-medium">
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
        </div>

        {/* Alt Bar: Parametreler & Çıkış Butonu */}
        <div className="p-3 sm:p-4 border-t border-grupo-dark-border bg-slate-900/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              <span>Çıkış Yap</span>
            </button>
            {onOpenAdmin && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAdmin();
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
              >
                <Sliders className="w-4 h-4 flex-shrink-0" />
                <span>Aura Parametreleri</span>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-3.5 sm:px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
