"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { Lock, Mail, User as UserIcon, AlertCircle, Smile, ShieldAlert, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { getBasePath } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((state) => state.register);
  const settings = useSettingsStore((state) => state.settings);

  const [form, setForm] = useState({
    username: "",
    display_name: "",
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const siteName = settings?.site_info?.site_name || "Aura";
  const allowRegistration = settings?.site_info?.allow_registration !== false;
  const isMaintenance = settings?.site_info?.maintenance_mode === true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!allowRegistration) {
      setError("Yeni üye alımı yönetici tarafından kapatılmıştır.");
      return;
    }

    if (!form.username.trim() || !form.email.trim() || !form.password) {
      setError("Lütfen zorunlu alanları doldurun.");
      return;
    }

    if (form.password.length < 6) {
      setError("Şifreniz en az 6 karakter olmalıdır.");
      return;
    }

    try {
      setLoading(true);
      await register(
        form.username.trim(),
        form.display_name.trim() || form.username.trim(),
        form.email.trim(),
        form.password
      );
      const bp = getBasePath();
      if (process.env.NEXT_PUBLIC_BASE_PATH) {
        router.push("/");
      } else if (bp) {
        window.location.href = `${bp}/`;
      } else {
        router.push("/");
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || "Kayıt olunurken bir hata oluştu.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[100dvh] w-full flex items-center justify-center bg-[#08090D] p-4 sm:p-6 overflow-x-hidden overflow-y-auto selection:bg-indigo-500/30 selection:text-white">
      {/* Ambient background glow & subtle grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[500px] sm:w-[650px] h-[350px] bg-gradient-to-b from-indigo-500/15 via-purple-500/5 to-transparent blur-[120px] rounded-full"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(#1E2333_1px,transparent_1px)] [background-size:24px_24px] opacity-20 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_60%,transparent_100%)]"
      />

      {/* Main Register Card */}
      <div className="relative w-full max-w-[390px] sm:max-w-[420px] bg-[#0E1017]/90 backdrop-blur-2xl border border-white/[0.08] rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.02)] z-10">
        {/* Subtle top border accent highlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-px inset-x-8 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent"
        />

        {/* Minimalist Aura Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="relative mb-3 flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.1] shadow-[0_0_20px_-3px_rgba(99,102,241,0.3)]">
            <div className="absolute inset-0 rounded-2xl bg-indigo-500/10 blur-sm pointer-events-none" />
            <svg
              className="w-6 h-6 relative z-10"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <circle
                cx="12"
                cy="12"
                r="8"
                stroke="url(#aura-stroke-grad-reg)"
                className="opacity-95"
              />
              <circle cx="12" cy="12" r="3.2" fill="url(#aura-fill-grad-reg)" />
              <defs>
                <linearGradient id="aura-stroke-grad-reg" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#818CF8" />
                  <stop offset="1" stopColor="#C084FC" />
                </linearGradient>
                <linearGradient id="aura-fill-grad-reg" x1="9" y1="9" x2="15" y2="15" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#A5B4FC" />
                  <stop offset="1" stopColor="#818CF8" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="text-2xl sm:text-[26px] font-semibold tracking-[-0.03em] text-white">
            {siteName}
          </h1>
        </div>

        {!allowRegistration ? (
          <div className="space-y-5 text-center">
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
              <ShieldAlert className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="text-sm font-semibold text-white">Kayıtlar Kapalı</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Yeni üye alımı geçici olarak durdurulmuştur.
              </p>
            </div>

            <Link
              href="/login"
              className="w-full h-11 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.1] text-white font-medium text-sm transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Giriş Sayfasına Dön</span>
            </Link>
          </div>
        ) : (
          <>
            {isMaintenance && (
              <div className="mb-5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2.5 text-amber-300 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                <span>Sistem bakım modundadır.</span>
              </div>
            )}

            {error && (
              <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2.5 text-rose-300 text-xs sm:text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1.5">
                  Kullanıcı Adı <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                      })
                    }
                    placeholder="ornek_kullanici"
                    autoComplete="username"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck="false"
                    className="w-full h-11 bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.08] focus:border-indigo-500/80 focus:bg-white/[0.05] focus:ring-2 focus:ring-indigo-500/20 rounded-xl pl-10 pr-4 text-base sm:text-sm text-white placeholder:text-slate-500 outline-none transition-all"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1.5">
                  Görünen Ad
                </label>
                <div className="relative">
                  <Smile className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    value={form.display_name}
                    onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                    placeholder="Ad Soyad"
                    className="w-full h-11 bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.08] focus:border-indigo-500/80 focus:bg-white/[0.05] focus:ring-2 focus:ring-indigo-500/20 rounded-xl pl-10 pr-4 text-base sm:text-sm text-white placeholder:text-slate-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1.5">
                  E-posta <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="ornek@alanadi.com"
                    autoComplete="email"
                    className="w-full h-11 bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.08] focus:border-indigo-500/80 focus:bg-white/[0.05] focus:ring-2 focus:ring-indigo-500/20 rounded-xl pl-10 pr-4 text-base sm:text-sm text-white placeholder:text-slate-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1.5">
                  Şifre <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="En az 6 karakter"
                    autoComplete="new-password"
                    className="w-full h-11 bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.08] focus:border-indigo-500/80 focus:bg-white/[0.05] focus:ring-2 focus:ring-indigo-500/20 rounded-xl pl-10 pr-11 text-base sm:text-sm text-white placeholder:text-slate-500 outline-none transition-all"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors cursor-pointer rounded-lg"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 sm:h-12 mt-2 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-500 hover:opacity-95 active:scale-[0.99] text-white font-medium text-sm shadow-[0_0_20px_-3px_rgba(99,102,241,0.35)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <div className="flex items-center gap-2 text-white/90">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Hesap oluşturuluyor...</span>
                  </div>
                ) : (
                  <span>Kayıt Ol</span>
                )}
              </button>
            </form>

            <div className="mt-6 text-center text-xs text-slate-400">
              Zaten hesabınız var mı?{" "}
              <Link
                href="/login"
                className="text-slate-200 hover:text-white font-medium underline underline-offset-4 decoration-slate-600 hover:decoration-white transition-colors ml-1"
              >
                Giriş Yapın
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
