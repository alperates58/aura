"use client";

import React from "react";
import { SystemSettings } from "@/lib/admin_api";
import { Save } from "lucide-react";

interface GeneralTabProps {
  settings: SystemSettings;
  setSettings: React.Dispatch<React.SetStateAction<SystemSettings | null>>;
  handleSaveSetting?: (key: string, value: any) => Promise<any>;
  onSave?: (key: string, value: any) => Promise<any>;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({
  settings,
  setSettings,
  handleSaveSetting,
  onSave,
}) => {
  const saveFn = onSave || handleSaveSetting || (async () => {});
  return (
    <div className="space-y-4">
      <div className="p-4 bg-[#12151D] border border-[#222631] rounded-2xl space-y-4">
        <h3 className="text-xs font-bold text-white">Site Bilgileri & Markalama</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Platform Başlığı</label>
            <input
              type="text"
              value={settings.site_info.site_name}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  site_info: { ...settings.site_info, site_name: e.target.value },
                })
              }
              className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Slogan / Açıklama</label>
            <input
              type="text"
              value={settings.site_info.site_tagline}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  site_info: { ...settings.site_info, site_tagline: e.target.value },
                })
              }
              className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] text-slate-400 block mb-1">Logo URL</label>
          <input
            type="text"
            value={settings.site_info.logo_url}
            onChange={(e) =>
              setSettings({
                ...settings,
                site_info: { ...settings.site_info, logo_url: e.target.value },
              })
            }
            className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            placeholder="https://..."
          />
        </div>

        <div className="pt-2 border-t border-[#222631] space-y-3">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div className="min-w-0 pr-2">
              <span className="text-xs font-semibold text-white block">Yeni Üye Kaydına İzin Ver</span>
              <span className="text-[11px] text-slate-400">Kapatılırsa yalnız mevcut kullanıcılar giriş yapabilir</span>
            </div>
            <input
              type="checkbox"
              checked={settings.site_info.allow_registration}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  site_info: { ...settings.site_info, allow_registration: e.target.checked },
                })
              }
              className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
            />
          </label>

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div className="min-w-0 pr-2">
              <span className="text-xs font-semibold text-rose-400 block">Bakım Modu (Maintenance)</span>
              <span className="text-[11px] text-slate-400">Yöneticiler hariç tüm kullanıcılara erişim durdurulur</span>
            </div>
            <input
              type="checkbox"
              checked={settings.site_info.maintenance_mode}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  site_info: { ...settings.site_info, maintenance_mode: e.target.checked },
                })
              }
              className="w-4 h-4 accent-rose-600 rounded cursor-pointer flex-shrink-0"
            />
          </label>
        </div>

        <button
          onClick={() => saveFn("site_info", settings.site_info)}
          className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Genel Ayarları Kaydet</span>
        </button>
      </div>
    </div>
  );
};
