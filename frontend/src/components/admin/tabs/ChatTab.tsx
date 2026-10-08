"use client";

import React from "react";
import { SystemSettings } from "@/lib/admin_api";
import { Save, Ban, ChevronRight } from "lucide-react";

interface ChatTabProps {
  settings: SystemSettings;
  setSettings: React.Dispatch<React.SetStateAction<SystemSettings | null>>;
  handleSaveSetting: (key: string, value: any) => Promise<void>;
  onOpenBannedWords: () => void;
}

export const ChatTab: React.FC<ChatTabProps> = ({
  settings,
  setSettings,
  handleSaveSetting,
  onOpenBannedWords,
}) => {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-[#12151D] border border-[#222631] rounded-2xl space-y-4">
        <h3 className="text-xs font-bold text-white">Medya & Depolama Limitleri</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Maksimum Dosya Boyutu (MB)</label>
            <input
              type="number"
              value={settings.media_limits.max_file_size_mb ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setSettings({
                  ...settings,
                  media_limits: {
                    ...settings.media_limits,
                    max_file_size_mb: val === "" ? ("" as any) : parseInt(val, 10),
                  },
                });
              }}
              onBlur={() => {
                if (!settings.media_limits.max_file_size_mb || Number(settings.media_limits.max_file_size_mb) < 1) {
                  setSettings({
                    ...settings,
                    media_limits: { ...settings.media_limits, max_file_size_mb: 50 },
                  });
                }
              }}
              className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Maks. Ses Kayıt Süresi (Saniye)</label>
            <input
              type="number"
              value={settings.media_limits.max_voice_seconds ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setSettings({
                  ...settings,
                  media_limits: {
                    ...settings.media_limits,
                    max_voice_seconds: val === "" ? ("" as any) : parseInt(val, 10),
                  },
                });
              }}
              onBlur={() => {
                if (!settings.media_limits.max_voice_seconds || Number(settings.media_limits.max_voice_seconds) < 1) {
                  setSettings({
                    ...settings,
                    media_limits: { ...settings.media_limits, max_voice_seconds: 300 },
                  });
                }
              }}
              className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 cursor-pointer pt-2 border-t border-[#222631]">
          <div className="min-w-0 pr-2">
            <span className="text-xs font-semibold text-white block">Otomatik Görsel & Video Sıkıştırma</span>
            <span className="text-[11px] text-slate-400">Yüklenen medyaları FFmpeg ile evrensel optimize formatlara dönüştür</span>
          </div>
          <input
            type="checkbox"
            checked={settings.media_limits.enable_compression}
            onChange={(e) =>
              setSettings({
                ...settings,
                media_limits: {
                  ...settings.media_limits,
                  enable_compression: e.target.checked,
                },
              })
            }
            className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
          />
        </label>

        <button
          onClick={() => handleSaveSetting("media_limits", settings.media_limits)}
          className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Medya Limitlerini Kaydet</span>
        </button>
      </div>

      <div className="p-4 bg-[#12151D] border border-[#222631] rounded-2xl space-y-4">
        <h3 className="text-xs font-bold text-white">Mesaj Düzenleme & Silme Kuralları</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Düzenleme Süre Sınırı (Dakika)</label>
            <input
              type="number"
              value={settings.chat_settings.edit_time_limit_minutes ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setSettings({
                  ...settings,
                  chat_settings: {
                    ...settings.chat_settings,
                    edit_time_limit_minutes: val === "" ? ("" as any) : parseInt(val, 10),
                  },
                });
              }}
              onBlur={() => {
                if (!settings.chat_settings.edit_time_limit_minutes || Number(settings.chat_settings.edit_time_limit_minutes) < 1) {
                  setSettings({
                    ...settings,
                    chat_settings: { ...settings.chat_settings, edit_time_limit_minutes: 15 },
                  });
                }
              }}
              className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Herkesten Silme Süre Sınırı (Dakika)</label>
            <input
              type="number"
              value={settings.chat_settings.delete_time_limit_minutes ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setSettings({
                  ...settings,
                  chat_settings: {
                    ...settings.chat_settings,
                    delete_time_limit_minutes: val === "" ? ("" as any) : parseInt(val, 10),
                  },
                });
              }}
              onBlur={() => {
                if (!settings.chat_settings.delete_time_limit_minutes || Number(settings.chat_settings.delete_time_limit_minutes) < 1) {
                  setSettings({
                    ...settings,
                    chat_settings: { ...settings.chat_settings, delete_time_limit_minutes: 60 },
                  });
                }
              }}
              className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-[#222631]">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-xs font-semibold text-white min-w-0 pr-2">Mesaj Düzenlemeye İzin Ver</span>
            <input
              type="checkbox"
              checked={settings.chat_settings.allow_message_edit}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  chat_settings: { ...settings.chat_settings, allow_message_edit: e.target.checked },
                })
              }
              className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
            />
          </label>

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-xs font-semibold text-white min-w-0 pr-2">Herkesten Silmeye İzin Ver</span>
            <input
              type="checkbox"
              checked={settings.chat_settings.allow_delete_for_all}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  chat_settings: { ...settings.chat_settings, allow_delete_for_all: e.target.checked },
                })
              }
              className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
            />
          </label>

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-xs font-semibold text-white min-w-0 pr-2">Otomatik Link Önizlemeleri</span>
            <input
              type="checkbox"
              checked={settings.chat_settings.enable_link_previews}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  chat_settings: { ...settings.chat_settings, enable_link_previews: e.target.checked },
                })
              }
              className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
            />
          </label>
        </div>

        <button
          onClick={() => handleSaveSetting("chat_settings", settings.chat_settings)}
          className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Sohbet Kurallarını Kaydet</span>
        </button>
      </div>

      {/* YASAKLI KELİMELER BAĞLANTISI */}
      <div className="p-4 bg-gradient-to-r from-rose-950/20 to-[#12151D] border border-rose-500/20 rounded-2xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30 shrink-0">
            <Ban className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              <span>Yasaklı Kelimeler & Otomatik Sansür</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-normal">
                {(settings.chat_settings.banned_words || []).length} kelime
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Yasaklı kelime yönetimi ve canlı test aracı sol menüde ayrı bir sekmeye taşındı.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenBannedWords}
          className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer shadow-lg shadow-rose-900/30"
        >
          <span>Yönet</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
