"use client";

import React, { useState, useEffect } from "react";
import { User, useAuthStore } from "@/store/useAuthStore";
import { Lock, ShieldAlert } from "lucide-react";

interface SecurityTabProps {
  user: User | null;
  showToast: (msg?: string) => void;
}

export const SecurityTab: React.FC<SecurityTabProps> = ({ user, showToast }) => {
  const { setPanicPassword, killSessions, regenerateSecurityCode } = useAuthStore();
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

  useEffect(() => {
    if (user) {
      setHasPanicPassword(!!user.has_panic_password);
      if (user.panic_login) setPanicLogin(user.panic_login);
      if (user.panic_redirect_url) {
        const clean = user.panic_redirect_url
          .trim()
          .replace(/^https?:\/\/www\.zodiacrf\.com/i, "https://zodiacrf.com");
        setPanicRedirectUrl(clean);
      }
    }
  }, [user]);

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
    } catch {
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
    } catch {
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
    } catch {
      alert("Güvenlik kodu yenilenemedi.");
    } finally {
      setIsRegeneratingSecurity(false);
    }
  };

  return (
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

      {/* ANİ REFLEKS KAÇIŞ PROTOKOLLERİ BİLGİ KARTI */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900/90 to-slate-950 border border-slate-800 space-y-3">
        <div className="flex items-center gap-2.5 text-xs font-bold text-amber-400">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <span>Ani Refleks Kaçış Protokolleri (Panik Tetikleyicileri)</span>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
            <span>
              <b>Masaüstü / PC (Çift ESC):</b> Klavyenizde 450 milisaniye içinde iki kez art arda <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-white font-mono text-[10px]">ESC</kbd> tuşuna bastığınızda mevcut oturum anında kapatılır ve panik yönlendirme adresinize ışınlanırsınız.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
            <span>
              <b>Mobil / Dokunmatik (Hayalet Buton):</b> Ekranın dilediğiniz yerine sürükleyip bırakabileceğiniz yarı şeffaf AssistiveTouch butonu üzerinden <b>3 kez seri</b> dokunduğunuzda (Triple Tap) anında acil çıkış yapar. <b>2 kez dokunduğunuzda</b> ise acil kaçış ve tüm cihazları düşürme menüsü açılır.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
