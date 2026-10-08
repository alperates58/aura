"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { Shield, LogOut, Radio, X, AlertTriangle, ArrowRight } from "lucide-react";
import { performEmergencyEscape } from "@/lib/emergency";

export default function GhostPanicTouch() {
  const { user, killSessions, logout } = useAuthStore();
  const securitySettings = useSettingsStore((s) => s.settings?.security_settings);

  // Buton konumu ve sürükleme durumu (SSR uyuşmazlığını önlemek için başlangıçta -1, -1)
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: -1, y: -1 });

  const [isMounted, setIsMounted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isOpenMenu, setIsOpenMenu] = useState(false);
  const [isAwake, setIsAwake] = useState(false);
  const [isKilling, setIsKilling] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Sürükleme ve tıklama ref'leri
  const pointerStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const buttonStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPointerActiveRef = useRef<boolean>(false);
  const hasDraggedRef = useRef<boolean>(false);

  const tapCountRef = useRef<number>(0);
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const awakeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isEscapingRef = useRef<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Acil kaçış fonksiyonu (Her zaman öncelikle Güvenlik Touch / İnaktivite için tanımlanan hedef siteye yönlendirir)
  const triggerEmergencyEscape = useCallback(() => {
    if (isEscapingRef.current) return;
    isEscapingRef.current = true;

    // 1. Güvenlik Touch özel yönlendirme adresi var mı?
    let redirectUrl =
      securitySettings?.assistive_touch_redirect_url?.trim() ||
      useSettingsStore.getState().settings?.security_settings?.assistive_touch_redirect_url?.trim();

    // 2. Yoksa inaktivite için tanımlanan siteyi al
    if (!redirectUrl) {
      redirectUrl =
        securitySettings?.inactivity_redirect_url?.trim() ||
        useSettingsStore.getState().settings?.security_settings?.inactivity_redirect_url?.trim();
    }

    // 3. LocalStorage'da kayıtlı security ayarlarından kontrol et
    if (!redirectUrl && typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("aura_security_settings");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.assistive_touch_redirect_url && typeof parsed.assistive_touch_redirect_url === "string" && parsed.assistive_touch_redirect_url.trim()) {
            redirectUrl = parsed.assistive_touch_redirect_url.trim();
          } else if (parsed?.inactivity_redirect_url && typeof parsed.inactivity_redirect_url === "string" && parsed.inactivity_redirect_url.trim()) {
            redirectUrl = parsed.inactivity_redirect_url.trim();
          }
        }
      } catch (_) {}
    }

    // 4. Son çare Google (ASLA user?.panic_redirect_url kullanılmaz)
    if (!redirectUrl) {
      redirectUrl = "https://www.google.com";
    }

    performEmergencyEscape(redirectUrl);
  }, [securitySettings]);

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
      const saved = localStorage.getItem("aura_ghost_touch_pos_v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          startPos = parsed;
        }
      }
    } catch (_) {}

    if (startPos.x === -1 || startPos.y === -1) {
      // Varsayılan konumu ayarlardan al (sol orta, sağ orta, sol alt, sağ alt)
      const defaultPos = securitySettings?.assistive_touch_default_pos || "left_center";
      const rightX = typeof window !== "undefined" ? Math.max(16, window.innerWidth - 60) : 300;
      const winH = typeof window !== "undefined" ? window.innerHeight : 800;

      if (defaultPos === "right_center") {
        startPos = snapToEdge(rightX, winH / 2 - 22);
      } else if (defaultPos === "left_bottom") {
        startPos = snapToEdge(16, winH - 100);
      } else if (defaultPos === "right_bottom") {
        startPos = snapToEdge(rightX, winH - 100);
      } else {
        // "left_center"
        startPos = snapToEdge(16, winH / 2 - 22);
      }
    } else {
      startPos = snapToEdge(startPos.x, startPos.y);
    }
    setPosition(startPos);

    const handleResize = () => {
      setPosition((prev) => snapToEdge(prev.x, prev.y));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [securitySettings?.assistive_touch_default_pos]);

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
  // 3 tık (Triple tap): Anında Kaçış (Eğer açıksa)
  const handleCleanTap = () => {
    wakeUp();
    tapCountRef.current += 1;

    if (tapCountRef.current === 3) {
      // 3 TIK (TRIPLE TAP) -> HIZLI KAÇIŞ
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      tapCountRef.current = 0;
      if (securitySettings?.enable_triple_tap_escape !== false) {
        triggerEmergencyEscape();
      }
      return;
    }

    if (tapCountRef.current === 1) {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      tapTimerRef.current = setTimeout(() => {
        tapCountRef.current = 0;
      }, 360);
    } else if (tapCountRef.current === 2) {
      // 2. Tık: Çift tık menüsü (Eğer açıksa)
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      tapTimerRef.current = setTimeout(() => {
        tapCountRef.current = 0;
        if (securitySettings?.enable_double_tap_menu !== false) {
          setIsOpenMenu((prev) => !prev);
        }
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
        localStorage.setItem("aura_ghost_touch_pos_v2", JSON.stringify(finalPos));
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

  // Dışarı tıklandığında menüyü kapat (Menü içi tıklamaları yoksay)
  useEffect(() => {
    if (!isOpenMenu) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent | PointerEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return;
      }
      setIsOpenMenu(false);
    };

    const timer = setTimeout(() => {
      window.addEventListener("pointerdown", handleClickOutside);
    }, 60);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", handleClickOutside);
    };
  }, [isOpenMenu]);

  if (!isMounted || position.x === -1 || securitySettings?.enable_assistive_touch === false) return null;

  // Menü açılma yönü hesabı (Butonun ekranın hangi çeyreğinde olduğuna göre)
  const isRightSide = position.x > (typeof window !== "undefined" ? window.innerWidth / 2 : 200);
  const isBottomSide = position.y > (typeof window !== "undefined" ? window.innerHeight / 2 : 400);

  const opacityPercent = typeof securitySettings?.assistive_touch_opacity === "number" ? securitySettings.assistive_touch_opacity : 30;

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
          transition: isDragging ? "none" : "all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
        className="select-none flex flex-col items-center pointer-events-auto"
      >
        {/* Mikro Menü (Çift Tıklamada Açılır) */}
        {isOpenMenu && (
          <div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              [isBottomSide ? "bottom" : "top"]: "56px",
              [isRightSide ? "right" : "left"]: "0px",
              touchAction: "auto",
              pointerEvents: "auto",
            }}
            className="w-60 rounded-2xl bg-slate-900/95 border border-slate-800 shadow-2xl p-2.5 backdrop-blur-xl flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-150 text-slate-200"
          >
            <div className="flex items-center justify-between px-2 py-1 border-b border-slate-800/80 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                <span>Security</span>
              </span>
              <button
                type="button"
                onClick={() => setIsOpenMenu(false)}
                className="text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 1. Acil Çıkış (Her zaman inaktivite / Güvenlik Touch için tanımlı siteye yönlendirir) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerEmergencyEscape();
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                triggerEmergencyEscape();
              }}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 text-xs font-semibold text-left transition-all cursor-pointer text-red-300"
            >
              <div className="w-6 h-6 rounded-lg bg-red-600 text-white flex items-center justify-center flex-shrink-0">
                <LogOut className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-red-200">Acil Çıkış</span>
                <span className="text-[10px] text-red-300/70 font-normal">Oturumu kapatıp anında yönlendir</span>
              </div>
            </button>

            {/* 2. Tüm Cihazları Düşür */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleKillAllSessions();
              }}
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
          </div>
        )}

        {/* Hayalet Buton (Sürüklenebilir & Edge-Snapping) */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            touchAction: "none",
            opacity: isOpenMenu || isDragging ? 1 : isAwake ? 0.95 : opacityPercent / 100,
          }}
          className={`w-11 h-11 rounded-full bg-slate-950/85 border border-white/40 ring-1 ring-white/10 shadow-[0_0_12px_rgba(255,255,255,0.08),0_4px_16px_rgba(0,0,0,0.6)] backdrop-blur-md flex items-center justify-center cursor-grab active:cursor-grabbing transition-all duration-300 ${
            isOpenMenu
              ? "ring-2 ring-purple-500/60 scale-105"
              : isDragging
              ? "ring-2 ring-purple-400 scale-110 shadow-purple-500/40"
              : "hover:!opacity-95 active:!opacity-100"
          }`}
          title="Security (3 Tık: Acil Çıkış, Çift Tık: Menü, Sürükle: Taşı)"
          aria-label="AssistiveTouch Security Butonu"
        >
          <div className="w-6 h-6 rounded-full border border-purple-400/60 flex items-center justify-center bg-purple-600/20 pointer-events-none">
            <Shield className="w-3.5 h-3.5 text-purple-300" />
          </div>
        </div>
      </div>
    </>
  );
}
