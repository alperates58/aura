"use client";

import React from "react";
import { RefreshCw, Loader2, Smartphone, Laptop } from "lucide-react";

interface AccessLogsTabProps {
  userAccessLogs: any[];
  isLoadingUserLogs: boolean;
  loadUserLogs: () => void;
}

export const AccessLogsTab: React.FC<AccessLogsTabProps> = ({
  userAccessLogs,
  isLoadingUserLogs,
  loadUserLogs,
}) => {
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-white">Giriş Kayıtlarım & Geçmiş</h3>
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-mono border border-slate-700">
              Güvenlik Denetim Günlüğü
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Hesabınıza bugüne kadar yapılan başarılı girişlerin değişmez tarihçesidir (Aktif açık oturumları kapatmak için &quot;Aktif Cihazlarım&quot; sekmesini kullanın).
          </p>
        </div>
        <button
          type="button"
          onClick={loadUserLogs}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isLoadingUserLogs ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {isLoadingUserLogs ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
          <Loader2 className="w-6 h-6 animate-spin text-pink-500" />
          <span>Kayıtlar yükleniyor...</span>
        </div>
      ) : userAccessLogs.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-500">
          Henüz kayıtlı bir giriş geçmişi bulunmuyor.
        </p>
      ) : (
        <div className="space-y-2.5">
          {userAccessLogs.map((log: any, idx: number) => {
            const isMobile =
              (log.device_info || "").toLowerCase().includes("iphone") ||
              (log.device_info || "").toLowerCase().includes("android");
            return (
              <div
                key={idx}
                className="p-3 sm:p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shadow-xs"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 flex-shrink-0">
                    {isMobile ? (
                      <Smartphone className="w-4 h-4 text-pink-400" />
                    ) : (
                      <Laptop className="w-4 h-4 text-blue-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white text-xs truncate">
                        {log.device_info || "Bilinmeyen Cihaz"}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                        Giriş Yapıldı
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono block mt-0.5">
                      {log.ip_address}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-end sm:text-right flex-shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-800/80">
                  <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono">
                    {new Date(log.created_at).toLocaleString("tr-TR")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
