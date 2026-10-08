"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { Shield, Lock, LogOut, Radio, X, AlertTriangle } from "lucide-react";

export default function GhostPanicTouch() {
  const { user, lockApp, killSessions, logout } = useAuthStore();
  const securitySettings = useSettingsStore((s) => s.settings?.security_settings);

  const [isOpenMenu, setIsOpenMenu] = useState(false);
  const [isKilling, setIsKilling] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const lastTapRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Çift dokunma (Double Tap) ve Tek dokunma tespiti
  const handleTouchOrClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const now = Date.now();
    const diff = now - lastTapRef.current;

    if (diff < 350 && diff > 0) {
      // Çift tıklama / çift dokunma tespit edildi!
      // Zamanlayıcıyı iptal et ve anında acil kaçışı tetikle
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      triggerEmergencyEscape();
    } else {
      // Tek tıklama: 350ms bekle, ikinci tıklama gelmezse menüyü aç/kapat
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setIsOpenMenu((prev) => !prev);
      }, 350);
    }

    lastTapRef.current = now;
  };

  const handleKillAllSessions = async () => {
    setIsKilling(true);
    try {
      await killSessions();
      setToast("Tüm diğer cihazların oturumu kapatıldı!");
      setTimeout(() => setToast(null), 3000);
      setIsOpenMenu(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsKilling(false);
    }
  };

  const handleLockScreen = () => {
    setIsOpenMenu(false);
    lockApp();
  };

  // Dışarı tıklandığında menüyü kapat
  useEffect(() => {
    if (!isOpenMenu) return;
    const handleClickOutside = () => setIsOpenMenu(false);
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [isOpenMenu]);

  return (
    <>
      {/* Toast Bilgilendirmesi */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-xl bg-emerald-600/90 text-white text-xs font-bold shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-200">
          {toast}
        </div>
      )}

      {/* AssistiveTouch Konteyneri */}
      <div className="fixed bottom-24 right-4 sm:bottom-6 sm:right-6 z-[9998] flex flex-col items-end">
        {/* Mikro Menü (Tek Dokunuşta Açılır) */}
        {isOpenMenu && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="mb-3 w-56 rounded-2xl bg-slate-900/95 border border-slate-800 shadow-2xl p-2.5 backdrop-blur-xl flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-150 text-slate-200"
          >
            <div className="flex items-center justify-between px-2 py-1 border-b border-slate-800/80 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                <span>Panik Kalkanı</span>
              </span>
              <button
                onClick={() => setIsOpenMenu(false)}
                className="text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 1. PIN ile Ekranı Kilitle */}
            <button
              onClick={handleLockScreen}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-slate-800/80 text-xs font-semibold text-left transition-all cursor-pointer"
            >
              <div className="w-6 h-6 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center flex-shrink-0">
                <Lock className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col">
                <span className="text-white">PIN ile Kilitle</span>
                <span className="text-[10px] text-slate-400 font-normal">Ekranı 6 haneli PIN ile dondur</span>
              </div>
            </button>

            {/* 2. Oturumu Kapat ve Kaç */}
            <button
              onClick={triggerEmergencyEscape}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-red-500/10 text-xs font-semibold text-left transition-all cursor-pointer text-red-400"
            >
              <div className="w-6 h-6 rounded-lg bg-red-600/20 text-red-400 flex items-center justify-center flex-shrink-0">
                <LogOut className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col">
                <span>Oturumu Kapat & Kaç</span>
                <span className="text-[10px] text-red-400/70 font-normal">Bu cihazdan çıkıp Google'a git</span>
              </div>
            </button>

            {/* 3. Tüm Cihazları Düşür */}
            <button
              onClick={handleKillAllSessions}
              disabled={isKilling}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-amber-500/10 text-xs font-semibold text-left transition-all cursor-pointer text-amber-400"
            >
              <div className="w-6 h-6 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                <Radio className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col">
                <span>Tüm Cihazları Düşür</span>
                <span className="text-[10px] text-amber-400/70 font-normal">Diğer tüm telefon & PC oturumlarını öldür</span>
              </div>
            </button>

            <div className="px-2 py-1 text-[9px] text-slate-500 text-center border-t border-slate-800/60 mt-1">
              💡 İpucu: Bu butona <b>2 kez hızlıca</b> vurursanız anında acil çıkış yapar.
            </div>
          </div>
        )}

        {/* Hayalet Buton (iOS AssistiveTouch Tarzı) */}
        <button
          onClick={handleTouchOrClick}
          className={`w-11 h-11 rounded-full bg-slate-950/70 border border-white/20 shadow-2xl backdrop-blur-md flex items-center justify-center cursor-pointer transition-all duration-300 ${
            isOpenMenu
              ? "opacity-100 ring-2 ring-purple-500/50 scale-105"
              : "opacity-25 hover:opacity-100 active:opacity-100"
          }`}
          title="Panik Butonu (Çift tıkla: Acil Kaçış, Tek tıkla: Menü)"
          aria-label="AssistiveTouch Panik Butonu"
        >
          <div className="w-6 h-6 rounded-full border border-purple-400/60 flex items-center justify-center bg-purple-600/20">
            <Shield className="w-3.5 h-3.5 text-purple-300" />
          </div>
        </button>
      </div>
    </>
  );
}
