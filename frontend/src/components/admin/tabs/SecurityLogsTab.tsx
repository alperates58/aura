"use client";

import React from "react";
import { AdminSecurityLog, AdminSecurityStats } from "@/lib/admin_api";
import {
  ShieldAlert,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Globe,
  Lock,
  Filter,
  Smartphone,
  Clock,
  MapPin,
  Laptop,
  CheckCircle2,
} from "lucide-react";

interface SecurityLogsTabProps {
  securityLogs: AdminSecurityLog[];
  securityStats: AdminSecurityStats | null;
  isSecurityLogsLoading: boolean;
  securityEventTypeFilter: string;
  setSecurityEventTypeFilter: (filter: string) => void;
  loadSecurityLogs: () => void;
  handleClearSecurityLogs: () => void;
}

export const SecurityLogsTab: React.FC<SecurityLogsTabProps> = ({
  securityLogs,
  securityStats,
  isSecurityLogsLoading,
  securityEventTypeFilter,
  setSecurityEventTypeFilter,
  loadSecurityLogs,
  handleClearSecurityLogs,
}) => {
  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Başlık ve Butonlar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#12151D] border border-[#222631] rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Güvenlik Günlükleri & Yetkisiz Girişler</span>
              {securityStats && securityStats.last_24h_logs > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold border border-red-500/30">
                  {securityStats.last_24h_logs} Yeni Olay
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              Kayıtsız hesaplarla yapılan giriş denemeleri, şüpheli IP adresleri ve güvenlik botu kayıtları
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSecurityLogs}
            disabled={isSecurityLogsLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#181B24] border border-[#292D38] rounded-xl text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSecurityLogsLoading ? "animate-spin" : ""}`} />
            <span>Yenile</span>
          </button>
          <button
            onClick={handleClearSecurityLogs}
            disabled={securityLogs.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 rounded-xl text-xs text-red-300 hover:text-red-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Temizle</span>
          </button>
        </div>
      </div>

      {/* Özet İstatistik Kartları */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase">Toplam Olay</span>
            <ShieldAlert className="w-4 h-4 text-red-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-white font-mono">
              {securityStats?.total_logs ?? securityLogs.length}
            </div>
            <span className="text-[10px] text-slate-500">Tüm zamanlar</span>
          </div>
        </div>

        <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase">Son 24 Saat</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-amber-400 font-mono">
              {securityStats?.last_24h_logs ?? 0}
            </div>
            <span className="text-[10px] text-slate-500">Aktif tehdit / deneme</span>
          </div>
        </div>

        <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase">Farklı IP Sayısı</span>
            <Globe className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-blue-400 font-mono">
              {securityStats?.unique_ips ?? 0}
            </div>
            <span className="text-[10px] text-slate-500">Kaynak adresi</span>
          </div>
        </div>

        <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase">En Çok Hedeflenen</span>
            <Lock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 truncate">
            <div className="text-sm font-bold text-purple-300 font-mono truncate">
              {securityStats?.top_target_username ? `@${securityStats.top_target_username}` : "—"}
            </div>
            <span className="text-[10px] text-slate-500">Hedef hesap</span>
          </div>
        </div>
      </div>

      {/* Filtre Barı */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs text-slate-400">Olay Türü:</span>
          <select
            value={securityEventTypeFilter}
            onChange={(e) => {
              setSecurityEventTypeFilter(e.target.value);
            }}
            className="bg-[#141720] border border-[#252936] rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none focus:border-red-500/50 cursor-pointer"
          >
            <option value="all">Tüm Güvenlik Olayları</option>
            <option value="unknown_user_login">Kayıtsız Kullanıcı Girişi</option>
            <option value="failed_password_login">Hatalı Şifre Denemesi</option>
            <option value="rate_limit_exceeded">Hız Sınırı Aşımı</option>
          </select>
        </div>
        <span className="text-[11px] text-slate-500 font-mono">
          Gösterilen: {securityLogs.length} kayıt
        </span>
      </div>

      {/* Kayıtlar Listesi & Tablosu */}
      <div className="border border-[#222631] rounded-2xl overflow-hidden bg-[#10131A]">
        {/* MOBİL GÖRÜNÜM (Kart Yapısı - Sağa Kaydırma Gerektirmez) */}
        <div className="block sm:hidden divide-y divide-[#1D212B]">
          {securityLogs.map((log) => {
            const isUnknownUser =
              log.event_type === "unknown_user_login" || log.event_type === "unknown_user_attempt";
            const isFailedPassword =
              log.event_type === "failed_password_login" || log.event_type === "failed_password_attempt";
            const isConcurrent = log.event_type === "concurrent_session_login";
            const isInactivity = log.event_type === "inactivity_timeout_redirect";

            let location = "";
            if (log.details) {
              if (typeof log.details === "object" && (log.details as any).location) {
                location = (log.details as any).location;
              } else if (typeof log.details === "string") {
                try {
                  const parsed = JSON.parse(log.details);
                  location = parsed.location || "";
                } catch {}
              }
            }

            const severity = log.severity || (isUnknownUser ? "critical" : "high");
            const attemptedUser = log.attempted_username || log.attempted_login || "—";
            const isMobileDev =
              (log.device_info || log.user_agent || "").toLowerCase().includes("iphone") ||
              (log.device_info || log.user_agent || "").toLowerCase().includes("android");

            return (
              <div key={log.id} className="p-3 space-y-2 hover:bg-[#151922] transition-colors">
                {/* Üst Bar: Olay Rozeti + Şiddet + Tarih */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    {isUnknownUser ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/15 text-red-400 border border-red-500/30 text-[10px] font-semibold">
                        <ShieldAlert className="w-3 h-3" /> Kayıtsız Kullanıcı
                      </span>
                    ) : isFailedPassword ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-semibold">
                        <Lock className="w-3 h-3" /> Hatalı Şifre
                      </span>
                    ) : isConcurrent ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-semibold">
                        <Smartphone className="w-3 h-3" /> Çoklu Oturum
                      </span>
                    ) : isInactivity ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/15 text-orange-400 border border-orange-500/30 text-[10px] font-semibold">
                        <Clock className="w-3 h-3" /> İnaktivite Zaman Aşımı
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-400 border border-purple-500/30 text-[10px] font-semibold">
                        <AlertTriangle className="w-3 h-3" /> {log.event_type}
                      </span>
                    )}

                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                        severity === "critical"
                          ? "bg-red-600/30 text-red-300 border border-red-500/40"
                          : severity === "high"
                          ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                          : "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
                      }`}
                    >
                      {severity}
                    </span>
                  </div>

                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(log.created_at).toLocaleString("tr-TR")}
                  </span>
                </div>

                {/* Orta Kısım: Hedef Kullanıcı & IP / Konum */}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="font-mono font-bold text-white flex items-center gap-1">
                    <span className="text-slate-400 font-normal text-[11px]">Hedef:</span>
                    <span>@{attemptedUser}</span>
                  </div>

                  <div className="text-right">
                    <span className="font-mono text-red-300 text-xs font-semibold">{log.ip_address}</span>
                    {location && (
                      <div className="text-[10px] text-slate-400 flex items-center justify-end gap-1 mt-0.5">
                        <MapPin className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                        <span className="truncate max-w-[130px]">{location}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Alt Kısım: Cihaz Bilgisi */}
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1 border-t border-[#1a1e29]">
                  {isMobileDev ? (
                    <Smartphone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  ) : (
                    <Laptop className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  )}
                  <span className="truncate">{log.device_info || log.user_agent || "Bilinmeyen Cihaz"}</span>
                </div>
              </div>
            );
          })}

          {securityLogs.length === 0 && (
            <div className="py-10 text-center text-slate-500 text-xs">
              <div className="flex flex-col items-center gap-2">
                <CheckCircle2 className="w-7 h-7 text-emerald-500/50" />
                <span>Kayıtlı herhangi bir güvenlik ihlali veya yetkisiz giriş bulunamadı.</span>
              </div>
            </div>
          )}
        </div>

        {/* MASAÜSTÜ & TABLET GÖRÜNÜM (Klasik Tablo) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[780px]">
            <thead className="bg-[#141720] border-b border-[#222631] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-3 sm:px-3.5 w-[150px]">Olay Türü</th>
                <th className="py-2.5 px-3 sm:px-3.5 w-[130px]">Hedef Kullanıcı</th>
                <th className="py-2.5 px-3 sm:px-3.5 w-[170px]">IP Adresi</th>
                <th className="py-2.5 px-3 sm:px-3.5 min-w-[150px]">Cihaz / Tarayıcı</th>
                <th className="py-2.5 px-3 sm:px-3.5 w-[85px] text-center">Şiddet</th>
                <th className="py-2.5 px-3 sm:px-3.5 w-[145px] text-right">Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D212B]">
              {securityLogs.map((log) => {
                const isUnknownUser =
                  log.event_type === "unknown_user_login" || log.event_type === "unknown_user_attempt";
                const isFailedPassword =
                  log.event_type === "failed_password_login" || log.event_type === "failed_password_attempt";
                const isConcurrent = log.event_type === "concurrent_session_login";
                const isInactivity = log.event_type === "inactivity_timeout_redirect";

                let location = "";
                if (log.details) {
                  if (typeof log.details === "object" && (log.details as any).location) {
                    location = (log.details as any).location;
                  } else if (typeof log.details === "string") {
                    try {
                      const parsed = JSON.parse(log.details);
                      location = parsed.location || "";
                    } catch {}
                  }
                }

                const severity = log.severity || (isUnknownUser ? "critical" : "high");
                const attemptedUser = log.attempted_username || log.attempted_login || "—";

                return (
                  <tr key={log.id} className="hover:bg-[#151922] transition-colors">
                    <td className="py-2.5 px-3 sm:px-3.5 font-semibold whitespace-nowrap">
                      {isUnknownUser ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/15 text-red-400 border border-red-500/30 text-[10px]">
                          <ShieldAlert className="w-3 h-3" /> Kayıtsız Kullanıcı
                        </span>
                      ) : isFailedPassword ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px]">
                          <Lock className="w-3 h-3" /> Hatalı Şifre
                        </span>
                      ) : isConcurrent ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px]">
                          <Smartphone className="w-3 h-3" /> Çoklu Oturum
                        </span>
                      ) : isInactivity ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/15 text-orange-400 border border-orange-500/30 text-[10px]">
                          <Clock className="w-3 h-3" /> İnaktivite Zaman Aşımı
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-400 border border-purple-500/30 text-[10px]">
                          <AlertTriangle className="w-3 h-3" /> {log.event_type}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 sm:px-3.5 font-mono font-bold text-white whitespace-nowrap">
                      @{attemptedUser}
                    </td>
                    <td className="py-2.5 px-3 sm:px-3.5">
                      <div className="font-mono text-red-300 text-xs font-semibold whitespace-nowrap">
                        {log.ip_address}
                      </div>
                      {location ? (
                        <div
                          className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5"
                          title={location}
                        >
                          <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span className="truncate max-w-[140px]">{location}</span>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-500">Konum Yok</div>
                      )}
                    </td>
                    <td
                      className="py-2.5 px-3 sm:px-3.5 text-slate-300 truncate max-w-[160px] sm:max-w-[200px]"
                      title={log.device_info || log.user_agent}
                    >
                      {log.device_info || log.user_agent || "Bilinmeyen Cihaz"}
                    </td>
                    <td className="py-2.5 px-3 sm:px-3.5 text-center whitespace-nowrap">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          severity === "critical"
                            ? "bg-red-600/30 text-red-300 border border-red-500/40"
                            : severity === "high"
                            ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                            : "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
                        }`}
                      >
                        {severity}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 sm:px-3.5 text-right text-slate-400 whitespace-nowrap font-mono text-[11px]">
                      {new Date(log.created_at).toLocaleString("tr-TR")}
                    </td>
                  </tr>
                );
              })}
              {securityLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500 text-xs">
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-7 h-7 text-emerald-500/50" />
                      <span>Kayıtlı herhangi bir güvenlik ihlali veya yetkisiz giriş bulunamadı.</span>
                    </div>
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
