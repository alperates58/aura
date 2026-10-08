"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { Shield, Lock, LogOut, Radio, X, AlertTriangle, ArrowRight } from "lucide-react";
import { performEmergencyEscape } from "@/lib/emergency";

export default function GhostPanicTouch() {
  const { user, lockApp, killSessions, logout, hasAppPin } = useAuthStore();
  const securitySettings = useSettingsStore((s) => s.settings?.security_settings);

  // Buton konumu ve sürükleme durumu (SSR uyuşmazlığını önlemek için başlangıçta -1, -1)
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: -1, y: -1 });

  const [hasPinLocal, setHasPinLocal] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isOpenMenu, setIsOpenMenu] = useState(false);
  const [isAwake, setIsAwake] = useState(false);
  const [isKilling, setIsKilling] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // PIN kontrolü: Hem store hem localStorage kontrol edilir
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const has = !!localStorage.getItem("aura_app_pin_hash");
        setHasPinLocal(has);
        if (has && !hasAppPin) {
          useAuthStore.setState({ hasAppPin: true });
        }
      }
    } catch (_) {}
  }, [hasAppPin]);

  const effectiveHasPin = hasAppPin || hasPinLocal;

  // Sürükleme ve tıklama ref'leri
  const pointerStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const buttonStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPointerActiveRef = useRef<boolean>(false);
  const hasDraggedRef = useRef<boolean>(false);

  const tapCountRef = useRef<number>(0);
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const awakeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Acil kaçış fonksiyonu (Sıfır onay, doğrudan hedef siteye yönlendirme ve geri dönüş engeli)
  const triggerEmergencyEscape = useCallback(() => {
    const redirectUrl =
      securitySettings?.inactivity_redirect_url ||
      user?.panic_redirect_url ||
      "https://www.google.com";

    performEmergencyEscape(redirectUrl);
  }, [securitySettings, user]);

  // İlk montaj ve ekran boyutu takibi
  useEffect(() => {
    setIsMounted(true);
    const snapToEdge = (curX: number, curY: number) => {
      const isRight = curX > window.innerWidth / 2;
      const snappedX = isRight ? Math.max(16, window.innerWidth - 60) : 16;
      const clampedY = Math.min(Math.max(60, curY), window.innerHeight - 90);
      return { x: snappedX, y: clampedY };
    };

    let startPos = { x: -1, y: -1 };
    try {
      const saved = localStorage.getItem("aura_ghost_touch_pos");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          startPos = parsed;
        }
      }
    } catch (_) {}

    if (startPos.x === -1 || startPos.y === -1) {
      startPos = snapToEdge(window.innerWidth - 60, window.innerHeight - 130);
    } else {
      startPos = snapToEdge(startPos.x, startPos.y);
    }
    setPosition(startPos);

    const handleResize = () => {
      setPosition((prev) => snapToEdge(prev.x, prev.y));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Butonu uyandır (şeffaflığı geçici olarak kaldır)
  const wakeUp = () => {
    setIsAwake(true);
    if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current);
    awakeTimeoutRef.current = setTimeout(() => {
      setIsAwake(false);
    }, 3000);
  };

  // Temiz tıklama mantığı (Sürükleme yapılmadığında çağrılır)
  // Tek tık: Uyandır
  // Çift tık: Menüyü aç
  // 3 tık (Triple tap): Anında Google / Panik kaçışı
  const handleCleanTap = () => {
    wakeUp();
    tapCountRef.current += 1;

    if (tapCountRef.current === 3) {
      // 3 TIK (TRIPLE TAP) -> ANINDA KAÇIŞ
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      tapCountRef.current = 0;
      triggerEmergencyEscape();
      return;
    }

    if (tapCountRef.current === 1) {
      // 1. Tık: 360ms bekle, başka tık gelmezse sadece uyandırma işlemi tamamlanır
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      tapTimerRef.current = setTimeout(() => {
        tapCountRef.current = 0;
      }, 360);
    } else if (tapCountRef.current === 2) {
      // 2. Tık: 270ms bekle, 3. tık gelmezse menüyü aç/kapat
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      tapTimerRef.current = setTimeout(() => {
        tapCountRef.current = 0;
        setIsOpenMenu((prev) => !prev);
      }, 270);
    }
  };

  // Pointer Eventleri (Hem Dokunmatik Hem Fare ile Sürükleme)
  const handlePointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    isPointerActiveRef.current = true;
    hasDraggedRef.current = false;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    buttonStartRef.current = { x: position.x, y: position.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPointerActiveRef.current) return;
    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 8 pikselden fazla hareket sürükleme olarak algılanır
    if (!hasDraggedRef.current && dist > 8) {
      hasDraggedRef.current = true;
      setIsDragging(true);
      setIsOpenMenu(false); // Sürükleme başlayınca menüyü kapat
    }

    if (hasDraggedRef.current) {
      const newX = Math.min(Math.max(10, buttonStartRef.current.x + dx), window.innerWidth - 56);
      const newY = Math.min(Math.max(40, buttonStartRef.current.y + dy), window.innerHeight - 70);
      setPosition({ x: newX, y: newY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isPointerActiveRef.current) return;
    isPointerActiveRef.current = false;

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (hasDraggedRef.current) {
      // Sürükleme tamamlandı: Ekranın en yakın kenarına mıknatısla yapış
      setIsDragging(false);
      const isRight = position.x > window.innerWidth / 2;
      const snappedX = isRight ? Math.max(16, window.innerWidth - 60) : 16;
      const clampedY = Math.min(Math.max(60, position.y), window.innerHeight - 90);
      const finalPos = { x: snappedX, y: clampedY };
      setPosition(finalPos);

      try {
        localStorage.setItem("aura_ghost_touch_pos", JSON.stringify(finalPos));
      } catch (_) {}
      return; // Sürükleme bittiğinde tıklama fonksiyonunu çalıştırma!
    }

    // Gerçek tıklama
    handleCleanTap();
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

  if (!isMounted || position.x === -1) return null;

  // Menü açılma yönü hesabı (Butonun ekranın hangi çeyreğinde olduğuna göre)
  const isRightSide = position.x > (typeof window !== "undefined" ? window.innerWidth / 2 : 200);
  const isBottomSide = position.y > (typeof window !== "undefined" ? window.innerHeight / 2 : 400);

  return (
    <>
      {/* Toast Bilgilendirmesi */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-xl bg-emerald-600/90 text-white text-xs font-bold shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-200">
          {toast}
        </div>
      )}

      {/* AssistiveTouch Sabit Konteyneri */}
      <div
        style={{
          position: "fixed",
          left: `${position.x}px`,
          top: `${position.y}px`,
          zIndex: 9998,
          touchAction: "none",
          transition: isDragging ? "none" : "all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
        className="select-none flex flex-col items-center"
      >
        {/* Mikro Menü (Çift Tıklamada Açılır) */}
        {isOpenMenu && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              [isBottomSide ? "bottom" : "top"]: "56px",
              [isRightSide ? "right" : "left"]: "0px",
            }}
            className="w-60 rounded-2xl bg-slate-900/95 border border-slate-800 shadow-2xl p-2.5 backdrop-blur-xl flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-150 text-slate-200"
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

            {/* 1. Acil Kaçış (Google'a Git) */}
            <button
              onClick={triggerEmergencyEscape}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 text-xs font-semibold text-left transition-all cursor-pointer text-red-300"
            >
              <div className="w-6 h-6 rounded-lg bg-red-600 text-white flex items-center justify-center flex-shrink-0">
                <LogOut className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-red-200">Acil Kaçış (Google)</span>
                <span className="text-[10px] text-red-300/70 font-normal">Oturumu silip anında yönlendir</span>
              </div>
            </button>

            {/* 2. PIN ile Ekranı Kilitle (PIN belirlenmediyse pasif) */}
            <button
              onClick={() => {
                if (!effectiveHasPin) {
                  setToast("Önce Ayarlar > Güvenlik menüsünden 6 haneli PIN belirleyin.");
                  setTimeout(() => setToast(null), 3500);
                  return;
                }
                handleLockScreen();
              }}
              disabled={!effectiveHasPin}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold text-left transition-all ${
                effectiveHasPin
                  ? "hover:bg-slate-800/80 cursor-pointer"
                  : "opacity-40 cursor-not-allowed hover:bg-transparent"
              }`}
              title={effectiveHasPin ? "Ekranı 6 haneli PIN ile dondur" : "PIN kodu henüz belirlenmedi (Pasif)"}
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  effectiveHasPin
                    ? "bg-purple-600/20 text-purple-400"
                    : "bg-slate-800 text-slate-500"
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className={effectiveHasPin ? "text-white" : "text-slate-400"}>PIN ile Kilitle</span>
                  {!effectiveHasPin && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-normal">
                      Pasif
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 font-normal">
                  {effectiveHasPin ? "Ekranı 6 haneli PIN ile dondur" : "PIN belirlenmedi (Ayarlar'dan kurun)"}
                </span>
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
                <span className="text-[10px] text-amber-400/70 font-normal">Diğer telefon & PC oturumlarını öldür</span>
              </div>
            </button>

            <div className="px-2 py-1.5 text-[9px] text-slate-400 leading-tight bg-slate-950/60 rounded-lg border border-slate-800/60 mt-1">
              💡 <b>Refleks:</b> Butona <b>3 kez seri</b> vurduğunuzda direkt Google&apos;a atar. Çift tıkla bu menü açılır. İstediğiniz yere sürükleyebilirsiniz.
            </div>
          </div>
        )}

        {/* Hayalet Buton (Sürüklenebilir & Edge-Snapping) */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`w-11 h-11 rounded-full bg-slate-950/80 border border-white/20 shadow-2xl backdrop-blur-md flex items-center justify-center cursor-grab active:cursor-grabbing transition-opacity duration-300 ${
            isOpenMenu
              ? "opacity-100 ring-2 ring-purple-500/60 scale-105"
              : isDragging
              ? "opacity-100 ring-2 ring-purple-400 scale-110 shadow-purple-500/40"
              : isAwake
              ? "opacity-95"
              : "opacity-20 hover:opacity-90 active:opacity-100"
          }`}
          title="Panik Butonu (3 Tık: Acil Kaçış, Çift Tık: Menü, Sürükle: Taşı)"
          aria-label="AssistiveTouch Panik Butonu"
        >
          <div className="w-6 h-6 rounded-full border border-purple-400/60 flex items-center justify-center bg-purple-600/20 pointer-events-none">
            <Shield className="w-3.5 h-3.5 text-purple-300" />
          </div>
        </div>
      </div>
    </>
  );
}
