"use client";

import React from "react";
import { AdminAccessLog } from "@/lib/admin_api";
import { RefreshCw, Smartphone, Laptop } from "lucide-react";

interface LogsTabProps {
  accessLogs: AdminAccessLog[];
  loadLogs: () => void;
}

export const LogsTab: React.FC<LogsTabProps> = ({ accessLogs, loadLogs }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Giriş yapan kullanıcıların IP adresi, cihaz ve tarayıcı kayıtları
        </p>
        <button
          onClick={loadLogs}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#141720] border border-[#252936] rounded-xl text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" /> Yenile
        </button>
      </div>

      <div className="border border-[#222631] rounded-2xl overflow-hidden bg-[#10131A]">
        {/* MOBİL GÖRÜNÜM (Kart Yapısı) */}
        <div className="block sm:hidden divide-y divide-[#1D212B]">
          {accessLogs.map((log) => {
            const isMobileDev =
              (log.device_info || "").toLowerCase().includes("iphone") ||
              (log.device_info || "").toLowerCase().includes("android");
            return (
              <div key={log.id} className="p-3 space-y-1.5 hover:bg-[#151922] transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white text-xs truncate">
                    {log.display_name ? `${log.display_name} (@${log.username})` : `@${log.username}`}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">
                    {new Date(log.created_at).toLocaleString("tr-TR")}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5 truncate">
                    {isMobileDev ? (
                      <Smartphone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    ) : (
                      <Laptop className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    )}
                    <span className="truncate">{log.device_info || "Bilinmeyen Cihaz"}</span>
                  </div>
                  <span className="font-mono text-slate-400 text-xs flex-shrink-0">
                    {log.ip_address}
                  </span>
                </div>
              </div>
            );
          })}

          {accessLogs.length === 0 && (
            <div className="py-8 text-center text-slate-500 text-xs">
              Henüz bir erişim kaydı yok.
            </div>
          )}
        </div>

        {/* MASAÜSTÜ GÖRÜNÜM (Tablo) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[640px]">
            <thead className="bg-[#141720] border-b border-[#222631] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-3 sm:px-3.5 min-w-[150px]">Kullanıcı</th>
                <th className="py-2.5 px-3 sm:px-3.5 min-w-[170px]">Cihaz & Tarayıcı</th>
                <th className="py-2.5 px-3 sm:px-3.5 w-[140px]">IP Adresi</th>
                <th className="py-2.5 px-3 sm:px-3.5 w-[150px] text-right">Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D212B]">
              {accessLogs.map((log) => (
                <tr key={log.id} className="hover:bg-[#151922] transition-colors">
                  <td className="py-2.5 px-3 sm:px-3.5 font-semibold text-white whitespace-nowrap">
                    {log.display_name ? `${log.display_name} (@${log.username})` : `@${log.username}`}
                  </td>
                  <td className="py-2.5 px-3 sm:px-3.5 text-slate-300 truncate max-w-[180px] sm:max-w-[240px]">
                    {log.device_info || "Bilinmeyen Cihaz"}
                  </td>
                  <td className="py-2.5 px-3 sm:px-3.5 font-mono text-slate-400 whitespace-nowrap">
                    {log.ip_address}
                  </td>
                  <td className="py-2.5 px-3 sm:px-3.5 text-right text-slate-400 whitespace-nowrap font-mono text-[11px]">
                    {new Date(log.created_at).toLocaleString("tr-TR")}
                  </td>
                </tr>
              ))}
              {accessLogs.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500 text-xs">
                    Henüz bir erişim kaydı yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
