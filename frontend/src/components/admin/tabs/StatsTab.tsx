"use client";

import React from "react";
import {
  AdminStatsResponse,
  DetailedHealthResponse,
  StorageBreakdownResponse,
} from "@/lib/admin_api";
import {
  Server,
  RefreshCw,
  Database,
  Activity,
  Radio,
  HardDrive,
} from "lucide-react";

interface StatsTabProps {
  stats: AdminStatsResponse;
  detailedHealth: DetailedHealthResponse | null;
  storageBreakdown: StorageBreakdownResponse | null;
  loadStats: () => void;
}

export const StatsTab: React.FC<StatsTabProps> = ({
  stats,
  detailedHealth,
  storageBreakdown,
  loadStats,
}) => {
  return (
    <div className="space-y-6">
      {/* Başlık ve Çalışma Süresi */}
      <div className="flex items-center justify-between p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl">
        <div className="flex items-center gap-2.5">
          <Server className="w-4 h-4 text-grupo-accent" />
          <div>
            <h3 className="text-xs font-bold text-white">Sistem Çalışma Süresi (Uptime)</h3>
            <p className="text-[11px] text-slate-400">
              {detailedHealth?.uptime_formatted
                ? `${detailedHealth.uptime_formatted} kesintisiz aktif`
                : "Sistem aktif çalışıyor"}
            </p>
          </div>
        </div>
        <button
          onClick={loadStats}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1.5 text-xs"
          title="Metrikleri Tazele"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Yenile</span>
        </button>
      </div>

      {/* 1. Servis Canlılık & Gecikme Metrikleri */}
      <div>
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
          Mikro Servisler & Gecikme (Latency)
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase">PostgreSQL 16</span>
              <Database className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-emerald-400 capitalize">
                  {detailedHealth?.postgres?.status || stats.system_health.postgres}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                {detailedHealth?.postgres?.latency_ms !== undefined
                  ? `${detailedHealth.postgres.latency_ms} ms ping`
                  : "< 5 ms"}
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase">Redis 7</span>
              <Activity className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-emerald-400 capitalize">
                  {detailedHealth?.redis?.status || stats.system_health.redis}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                {detailedHealth?.redis?.latency_ms !== undefined
                  ? `${detailedHealth.redis.latency_ms} ms ping`
                  : "< 2 ms"}
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase">LiveKit SFU</span>
              <Radio className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-emerald-400 capitalize">
                  {detailedHealth?.livekit?.status || stats.system_health.livekit}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono mt-1 block truncate">
                WebRTC SFU Aktif
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase">MinIO S3</span>
              <HardDrive className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-emerald-400 capitalize">
                  {detailedHealth?.minio?.status || stats.system_health.minio}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                {detailedHealth?.minio?.latency_ms !== undefined
                  ? `${detailedHealth.minio.latency_ms} ms ping`
                  : "< 10 ms"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Runtime Telemetrisi & Trafik */}
      <div>
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
          Bağlantı & Çalışma Metrikleri
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl">
            <p className="text-[11px] text-slate-400">Toplam Üye</p>
            <p className="text-xl font-bold text-white mt-1">{stats.total_users}</p>
            <p className="text-[10px] text-emerald-400 mt-0.5">{stats.online_users} Çevrimiçi</p>
          </div>

          <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl">
            <p className="text-[11px] text-slate-400">Canlı Soketler (WS)</p>
            <p className="text-xl font-bold text-white mt-1">
              {detailedHealth?.active_ws_connections !== undefined
                ? detailedHealth.active_ws_connections
                : stats.online_users}
            </p>
            <p className="text-[10px] text-purple-400 mt-0.5">Gerçek Zamanlı Hub</p>
          </div>

          <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl">
            <p className="text-[11px] text-slate-400">Toplam Mesaj</p>
            <p className="text-xl font-bold text-white mt-1">{stats.total_messages}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{stats.total_media} Medya</p>
          </div>

          <div className="p-3.5 bg-[#12151D] border border-[#222631] rounded-2xl">
            <p className="text-[11px] text-slate-400">Goroutine & RAM</p>
            <p className="text-xl font-bold text-white mt-1">
              {detailedHealth?.goroutines || stats.system_health.goroutines}
            </p>
            <p className="text-[10px] text-pink-400 mt-0.5">
              {detailedHealth?.memory?.alloc_mb !== undefined
                ? `${detailedHealth.memory.alloc_mb} MB RAM`
                : `${stats.system_health.allocated_ram_mb} MB RAM`}
            </p>
          </div>
        </div>
      </div>

      {/* 3. MinIO Nesne Depolama Analizi */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            MinIO Nesne Depolama Dağılımı
          </h4>
          {storageBreakdown?.cached && (
            <span className="text-[10px] text-slate-500 font-mono">
              (Önbellekten • Redis 5dk TTL)
            </span>
          )}
        </div>

        <div className="p-4 bg-[#12151D] border border-[#222631] rounded-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#222631]">
            <div>
              <span className="text-xs text-slate-400 block">Toplam Kullanılan Alan</span>
              <span className="text-lg font-bold text-white font-mono">
                {storageBreakdown?.total?.total_mb
                  ? storageBreakdown.total.total_mb > 1024
                    ? `${storageBreakdown.total.total_gb.toFixed(2)} GB`
                    : `${storageBreakdown.total.total_mb.toFixed(1)} MB`
                  : "0 MB"}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block">Toplam Dosya</span>
              <span className="text-lg font-bold text-grupo-accent font-mono">
                {storageBreakdown?.total?.total_objects ?? 0} Adet
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-[#181B24] rounded-xl border border-[#292D38]">
              <span className="text-slate-400 text-[11px] block">Avatarlar</span>
              <span className="font-bold text-white mt-1 block font-mono">
                {storageBreakdown?.avatars?.total_mb !== undefined
                  ? `${storageBreakdown.avatars.total_mb.toFixed(1)} MB`
                  : "0 MB"}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {storageBreakdown?.avatars?.total_objects ?? 0} dosya
              </span>
            </div>

            <div className="p-3 bg-[#181B24] rounded-xl border border-[#292D38]">
              <span className="text-slate-400 text-[11px] block">Görsel & Video</span>
              <span className="font-bold text-white mt-1 block font-mono">
                {storageBreakdown?.media?.total_mb !== undefined
                  ? `${storageBreakdown.media.total_mb.toFixed(1)} MB`
                  : "0 MB"}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {storageBreakdown?.media?.total_objects ?? 0} dosya
              </span>
            </div>

            <div className="p-3 bg-[#181B24] rounded-xl border border-[#292D38]">
              <span className="text-slate-400 text-[11px] block">Sesli Mesajlar</span>
              <span className="font-bold text-white mt-1 block font-mono">
                {storageBreakdown?.voice?.total_mb !== undefined
                  ? `${storageBreakdown.voice.total_mb.toFixed(1)} MB`
                  : "0 MB"}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {storageBreakdown?.voice?.total_objects ?? 0} dosya
              </span>
            </div>

            <div className="p-3 bg-[#181B24] rounded-xl border border-[#292D38]">
              <span className="text-slate-400 text-[11px] block">Ekli Belgeler</span>
              <span className="font-bold text-white mt-1 block font-mono">
                {storageBreakdown?.files?.total_mb !== undefined
                  ? `${storageBreakdown.files.total_mb.toFixed(1)} MB`
                  : "0 MB"}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {storageBreakdown?.files?.total_objects ?? 0} dosya
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
