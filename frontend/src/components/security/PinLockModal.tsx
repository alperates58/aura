"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { Lock, ShieldAlert, Delete, ArrowRight, ShieldCheck, KeyRound } from "lucide-react";

export default function PinLockModal() {
  const { isAppLocked, hasAppPin, unlockApp, setAppPin, logout, user } = useAuthStore();
  const securitySettings = useSettingsStore((s) => s.settings?.security_settings);

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);

  // Acil kaçış fonksiyonu
  const triggerEmergencyEscape = useCallback(() => {
    const redirectUrl =
      securitySettings?.inactivity_redirect_url ||
      user?.panic_redirect_url ||
      "https://www.google.com";

    try {
      logout();
    } catch (_) {}

    window.location.replace(redirectUrl);
  }, [securitySettings, user, logout]);

  // PIN kontrolü
  const handleDigitPress = (digit: string) => {
    if (errorMsg) setErrorMsg(null);

    if (!hasAppPin) {
      // PIN oluşturma modu
      if (!isConfirming) {
        if (pin.length < 6) {
          const next = pin + digit;
          setPin(next);
          if (next.length === 6) {
            setIsConfirming(true);
          }
        }
      } else {
        if (confirmPin.length < 6) {
          const next = confirmPin + digit;
          setConfirmPin(next);
          if (next.length === 6) {
            if (next === pin) {
              setAppPin(pin);
              setPin("");
              setConfirmPin("");
              setIsConfirming(false);
            } else {
              setErrorMsg("Girdiğiniz PIN kodları eşleşmedi. Tekrar deneyin.");
              setPin("");
              setConfirmPin("");
              setIsConfirming(false);
            }
          }
        }
      }
    } else {
      // PIN ile kilit açma modu
      if (pin.length < 6) {
        const next = pin + digit;
        setPin(next);
        if (next.length === 6) {
          const success = unlockApp(next);
          if (!success) {
            const nextFailed = failedAttempts + 1;
            setFailedAttempts(nextFailed);
            setErrorMsg("Hatalı PIN kodu!");
            setPin("");

            // 5 başarısız denemede acil durum panik çıkışı
            if (nextFailed >= 5) {
              triggerEmergencyEscape();
            }
          } else {
            setPin("");
            setFailedAttempts(0);
            setErrorMsg(null);
          }
        }
      }
    }
  };

  const handleBackspace = () => {
    if (errorMsg) setErrorMsg(null);
    if (!hasAppPin) {
      if (isConfirming) {
        setConfirmPin((prev) => prev.slice(0, -1));
      } else {
        setPin((prev) => prev.slice(0, -1));
      }
    } else {
      setPin((prev) => prev.slice(0, -1));
    }
  };

  // Fiziksel klavye desteği
  useEffect(() => {
    if (!isAppLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleDigitPress(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAppLocked, pin, confirmPin, isConfirming, hasAppPin]);

  if (!isAppLocked) return null;

  const currentDisplayPin = !hasAppPin && isConfirming ? confirmPin : pin;

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950/98 backdrop-blur-2xl flex flex-col items-center justify-between p-6 select-none animate-in fade-in duration-200">
      {/* Üst Bar: Logo & Acil Kaçış */}
      <div className="w-full max-w-sm flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center">
            <Lock className="w-4 h-4 text-purple-400" />
          </div>
          <span className="text-sm font-semibold tracking-wide text-slate-300">Aura Kalkanı</span>
        </div>

        <button
          onClick={triggerEmergencyEscape}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 text-xs font-semibold transition-all cursor-pointer"
          title="Oturumu anında kapat ve hedef sayfaya git"
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Acil Kaçış</span>
        </button>
      </div>

      {/* Orta Kısım: PIN Göstergesi */}
      <div className="flex flex-col items-center text-center my-auto">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600/20 to-indigo-600/20 border border-purple-500/30 flex items-center justify-center mb-4 shadow-lg shadow-purple-500/10">
          <KeyRound className="w-8 h-8 text-purple-400 animate-pulse" />
        </div>

        <h2 className="text-xl font-bold text-white mb-1.5 tracking-tight">
          {!hasAppPin
            ? isConfirming
              ? "PIN Kodunu Onaylayın"
              : "6 Haneli Kilit PIN'i Belirleyin"
            : "Ekran Kilitlendi"}
        </h2>

        <p className="text-xs text-slate-400 max-w-[260px] mb-6">
          {!hasAppPin
            ? isConfirming
              ? "Doğrulamak için 6 haneli PIN kodunuzu tekrar girin."
              : "Ekranınızı yabancı gözlerden korumak için 6 haneli bir PIN kodu seçin."
            : "Devam etmek ve sohbetlerinizi görüntülemek için 6 haneli PIN kodunuzu girin."}
        </p>

        {/* 6 Haneli Daire Göstergesi */}
        <div className="flex items-center gap-3.5 mb-3">
          {[0, 1, 2, 3, 4, 5].map((idx) => {
            const isFilled = currentDisplayPin.length > idx;
            return (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  isFilled
                    ? "bg-purple-500 shadow-md shadow-purple-500/50 scale-110"
                    : "border-2 border-slate-700 bg-slate-900/60"
                }`}
              />
            );
          })}
        </div>

        {errorMsg && (
          <p className="text-xs font-medium text-rose-400 animate-shake">
            {errorMsg}
          </p>
        )}
      </div>

      {/* Alt Kısım: Sayısal Tuş Takımı (Numpad) */}
      <div className="w-full max-w-xs grid grid-cols-3 gap-3 pb-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            onClick={() => handleDigitPress(digit)}
            className="h-14 rounded-2xl bg-slate-900/80 hover:bg-slate-800 active:bg-purple-600/30 border border-slate-800 hover:border-slate-700 text-xl font-bold text-white transition-all flex items-center justify-center cursor-pointer shadow-sm"
          >
            {digit}
          </button>
        ))}

        <div className="h-14 flex items-center justify-center">
          {/* Boş sol köşe */}
        </div>

        <button
          onClick={() => handleDigitPress("0")}
          className="h-14 rounded-2xl bg-slate-900/80 hover:bg-slate-800 active:bg-purple-600/30 border border-slate-800 hover:border-slate-700 text-xl font-bold text-white transition-all flex items-center justify-center cursor-pointer shadow-sm"
        >
          0
        </button>

        <button
          onClick={handleBackspace}
          className="h-14 rounded-2xl bg-slate-900/50 hover:bg-slate-800 active:bg-slate-700/50 border border-slate-800/80 text-slate-400 hover:text-white transition-all flex items-center justify-center cursor-pointer"
          title="Sil"
        >
          <Delete className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
