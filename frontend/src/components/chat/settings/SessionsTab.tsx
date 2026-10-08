"use client";

import React, { useState } from "react";
import { User, UserSession, useAuthStore } from "@/store/useAuthStore";
import { formatStoryTime } from "@/lib/utils";
import {
  Smartphone,
  Tablet,
  Laptop,
  RefreshCw,
  Loader2,
  CheckCircle2,
  LogOut,
  ShieldCheck,
} from "lucide-react";

interface SessionsTabProps {
  user: User | null;
  sessions: UserSession[];
  isLoadingSessions: boolean;
  loadSessions: () => Promise<void>;
  handleKillOtherSessions: () => Promise<void>;
  isKillingSessions: boolean;
  showToast: (msg?: string) => void;
}

export const SessionsTab: React.FC<SessionsTabProps> = ({
  user,
  sessions,
  isLoadingSessions,
  loadSessions,
  handleKillOtherSessions,
  isKillingSessions,
  showToast,
}) => {
  const [terminatingSessionId, setTerminatingSessionId] = useState<string | null>(null);

  // Tarayıcı ortamında istemci cihaz bilgisi
  const clientInfo = (() => {
    if (typeof window === "undefined") {
      return {
        device_name: "Windows Bilgisayar",
        device_type: "desktop" as const,
        os: "Windows",
        browser: "Google Chrome",
      };
    }
    const ua = navigator.userAgent.toLowerCase();
    let device_type: "desktop" | "mobile" | "tablet" = "desktop";
    let os = "Windows";
    let device_name = "Windows Bilgisayar";
    let browser = "Google Chrome";

    if (
      ua.includes("ipad") ||
      (ua.includes("macintosh") && "ontouchend" in document)
    ) {
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
      device_name =
        device_type === "mobile" ? "Android Cihaz" : "Android Tablet";
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
    } else if (
      ua.includes("chrome/") &&
      !ua.includes("edg/") &&
      !ua.includes("opr/")
    ) {
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
          <RefreshCw
            className={`w-4 h-4 ${
              isLoadingSessions ? "animate-spin text-pink-400" : ""
            }`}
          />
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
                        <span className="font-sans text-slate-300">
                          {currentSession.location}
                        </span>
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
          </div>

          {/* 2. DİĞER AKTİF CİHAZLAR */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Diğer Aktif Cihazlar (
                {sessions.filter((s) => !s.is_current).length})
              </div>

              {sessions.some((s) => !s.is_current) && (
                <button
                  type="button"
                  onClick={handleKillOtherSessions}
                  disabled={isKillingSessions}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>
                    {isKillingSessions
                      ? "Kapatılıyor..."
                      : "Diğer Tüm Oturumları Kapat"}
                  </span>
                </button>
              )}
            </div>

            {sessions.filter((s) => !s.is_current).length === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 text-center flex flex-col items-center justify-center gap-2">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-slate-200">
                  Başka Açık Cihaz Yok
                </h4>
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
                                  <span className="text-slate-400">
                                    {s.location}
                                  </span>
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
                            if (
                              !confirm(
                                `"${s.device_name}" cihazındaki oturumu sonlandırmak istediğinizden emin misiniz?`
                              )
                            )
                              return;
                            setTerminatingSessionId(s.session_id);
                            try {
                              await useAuthStore
                                .getState()
                                .terminateSession(s.session_id);
                              showToast(
                                "Seçilen cihazın oturumu uzaktan kapatıldı."
                              );
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
                              <span className="text-[11px] sm:text-xs">
                                Oturumu Kapat
                              </span>
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
  );
};
