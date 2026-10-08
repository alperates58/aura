"use client";

import React from "react";
import { SystemSettings, ActiveCallTelemetry } from "@/lib/admin_api";
import { Activity, RefreshCw, Clock, Save } from "lucide-react";

interface CallsTabProps {
  settings: SystemSettings;
  setSettings: React.Dispatch<React.SetStateAction<SystemSettings | null>>;
  onSave: (category: string, data: any) => Promise<boolean>;
  activeCalls: ActiveCallTelemetry[];
  loadCallsData: () => void;
}

export const CallsTab: React.FC<CallsTabProps> = ({
  settings,
  setSettings,
  onSave,
  activeCalls,
  loadCallsData,
}) => {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-[#12151D] border border-[#222631] rounded-2xl space-y-4">
        <h3 className="text-xs font-bold text-white">LiveKit SFU Sesli & Görüntülü Arama</h3>

        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div className="min-w-0 pr-2">
              <span className="text-xs font-semibold text-white block">Sesli Aramalar</span>
              <span className="text-[11px] text-slate-400">1-e-1 yüksek kaliteli şifreli sesli görüşmeler</span>
            </div>
            <input
              type="checkbox"
              checked={settings.call_settings.enable_audio_calls}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  call_settings: { ...settings.call_settings, enable_audio_calls: e.target.checked },
                })
              }
              className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
            />
          </label>

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div className="min-w-0 pr-2">
              <span className="text-xs font-semibold text-white block">Görüntülü Aramalar</span>
              <span className="text-[11px] text-slate-400">LiveKit SFU üzerinden WebRTC HD video akışı</span>
            </div>
            <input
              type="checkbox"
              checked={settings.call_settings.enable_video_calls}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  call_settings: { ...settings.call_settings, enable_video_calls: e.target.checked },
                })
              }
              className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
            />
          </label>

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div className="min-w-0 pr-2">
              <span className="text-xs font-semibold text-white block">Ekran Paylaşımı (Screen Share)</span>
              <span className="text-[11px] text-slate-400">Görüşme sırasında masaüstü / pencere yayını</span>
            </div>
            <input
              type="checkbox"
              checked={settings.call_settings.enable_screen_share}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  call_settings: { ...settings.call_settings, enable_screen_share: e.target.checked },
                })
              }
              className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
            />
          </label>
        </div>

        <div className="pt-2 border-t border-[#222631]">
          <label className="text-[11px] text-slate-400 block mb-1">Maksimum Arama Süresi (Dakika)</label>
          <input
            type="number"
            value={settings.call_settings.max_call_duration_minutes ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              setSettings({
                ...settings,
                call_settings: {
                  ...settings.call_settings,
                  max_call_duration_minutes: val === "" ? ("" as any) : parseInt(val, 10),
                },
              });
            }}
            onBlur={() => {
              if (
                !settings.call_settings.max_call_duration_minutes ||
                Number(settings.call_settings.max_call_duration_minutes) < 1
              ) {
                setSettings({
                  ...settings,
                  call_settings: { ...settings.call_settings, max_call_duration_minutes: 120 },
                });
              }
            }}
            className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
          />
        </div>

        <button
          onClick={() => onSave("call_settings", settings.call_settings)}
          className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Arama Ayarlarını Kaydet</span>
        </button>
      </div>

      {/* Canlı 1-e-1 Görüşme Oturumları İzleme Paneli */}
      <div className="p-4 bg-[#12151D] border border-[#222631] rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white">Canlı 1-e-1 Görüşmeler</h3>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold">
              {activeCalls.length} Aktif
            </span>
          </div>
          <button
            onClick={loadCallsData}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            title="Listeyi Yenile"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {activeCalls.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs bg-[#181B24]/50 rounded-xl border border-[#222631]">
            Şu anda sunucuda devam eden aktif bir sesli/görüntülü arama bulunmuyor.
          </div>
        ) : (
          <div className="space-y-2">
            {activeCalls.map((call) => (
              <div
                key={call.call_id}
                className="p-3 bg-[#181B24] border border-[#292D38] rounded-xl flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      call.status === "ringing"
                        ? "bg-amber-400 animate-ping"
                        : "bg-emerald-400 animate-pulse"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-white truncate flex items-center gap-1.5">
                      <span>{call.caller_name}</span>
                      <span className="text-slate-500">↔</span>
                      <span>{call.receiver_name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ID: {call.call_id.slice(0, 8)} •{" "}
                      {call.status === "ringing" ? "Çalıyor" : "Bağlandı"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium uppercase ${
                      call.call_type === "video"
                        ? "bg-pink-500/20 text-pink-300 border border-pink-500/30"
                        : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    }`}
                  >
                    {call.call_type === "video" ? "Görüntülü" : "Sesli"}
                  </span>
                  <div className="flex items-center gap-1 font-mono text-[11px] text-slate-300">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>
                      {Math.floor(call.elapsed_seconds / 60)}:
                      {String(call.elapsed_seconds % 60).padStart(2, "0")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
