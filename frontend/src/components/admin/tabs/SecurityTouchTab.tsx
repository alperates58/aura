"use client";

import React from "react";
import { SystemSettings } from "@/lib/admin_api";
import {
  Shield,
  Sliders,
  Eye,
  ExternalLink,
  MapPin,
  Sparkles,
  Check,
  Save,
} from "lucide-react";

interface SecurityTouchTabProps {
  settings: SystemSettings;
  setSettings: React.Dispatch<React.SetStateAction<SystemSettings | null>>;
  onSave: (category: string, data: any) => Promise<boolean>;
}

export const SecurityTouchTab: React.FC<SecurityTouchTabProps> = ({
  settings,
  setSettings,
  onSave,
}) => {
  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Başlık Kartı */}
      <div className="p-5 bg-gradient-to-br from-indigo-950/40 via-[#12151D] to-[#12151D] border border-indigo-500/30 rounded-2xl relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Güvenlik Touch (AssistiveTouch) Yönetimi
                </h2>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    settings.security_settings.enable_assistive_touch !== false
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  {settings.security_settings.enable_assistive_touch !== false
                    ? "Aktif"
                    : "Pasif"}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
                Ekranda serbestçe sürüklenebilen hayalet AssistiveTouch butonunun görünümünü, boşta bekleme opaklığını, ilk açılış konumunu ve 3 tık / çift tık acil kaçış web adresini tek merkezden yapılandırın.
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-2xl font-black text-indigo-400 font-mono">
              %{settings.security_settings.assistive_touch_opacity ?? 30}
            </span>
            <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Boşta Opaklık
            </span>
          </div>
        </div>
      </div>

      {/* 1. Buton Durumu & Temel İzinler */}
      <div className="p-5 bg-[#12151D] border border-[#222631] rounded-2xl space-y-4">
        <h3 className="text-xs font-bold text-white flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-400" />
          <span>Genel Buton Durumu</span>
        </h3>

        <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#181B24] border border-[#292D38] cursor-pointer hover:border-indigo-500/30 transition-colors">
          <div>
            <span className="text-xs font-semibold text-white block">
              AssistiveTouch Butonunu Göster
            </span>
            <span className="text-[11px] text-slate-400">
              Kapalı konuma getirildiğinde ekranda yüzen hayalet buton tüm kullanıcılarda tamamen gizlenir.
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.security_settings.enable_assistive_touch !== false}
            onChange={(e) =>
              setSettings({
                ...settings,
                security_settings: {
                  ...settings.security_settings,
                  enable_assistive_touch: e.target.checked,
                },
              })
            }
            className="w-4 h-4 accent-indigo-600 rounded cursor-pointer shrink-0"
          />
        </label>
      </div>

      {/* 2. Opaklık & Canlı Önizleme */}
      <div className="p-5 bg-[#12151D] border border-[#222631] rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white flex items-center gap-2">
            <Eye className="w-4 h-4 text-purple-400" />
            <span>Boşta Bekleme Opaklığı (Opacity)</span>
          </h3>
          <span className="text-xs font-bold text-purple-300 font-mono">
            %{settings.security_settings.assistive_touch_opacity ?? 30}
          </span>
        </div>

        <p className="text-[11px] text-slate-400">
          Buton kullanılmadığı anlarda ekranda ne kadar hayalet / şeffaf kalacağını belirler. Üzerine gelindiğinde veya tıklandığında otomatik olarak netleşir (%95).
        </p>

        {/* Hızlı Butonlar */}
        <div className="flex flex-wrap gap-2 pt-1">
          {[10, 20, 30, 40, 50, 75, 100].map((val) => {
            const current = settings.security_settings.assistive_touch_opacity ?? 30;
            const isSelected = current === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() =>
                  setSettings({
                    ...settings,
                    security_settings: {
                      ...settings.security_settings,
                      assistive_touch_opacity: val,
                    },
                  })
                }
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400"
                    : "bg-[#181B24] text-slate-400 hover:text-white border border-[#292D38] hover:border-slate-700"
                }`}
              >
                %{val} {val === 30 && "(Varsayılan)"}
              </button>
            );
          })}
        </div>

        {/* Hassas Slider */}
        <div className="pt-2">
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={settings.security_settings.assistive_touch_opacity ?? 30}
            onChange={(e) =>
              setSettings({
                ...settings,
                security_settings: {
                  ...settings.security_settings,
                  assistive_touch_opacity: parseInt(e.target.value, 10),
                },
              })
            }
            className="w-full accent-indigo-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
            <span>%10 (Çok Hayalet)</span>
            <span>%50</span>
            <span>%100 (Tam Görünür)</span>
          </div>
        </div>

        {/* Canlı Simülasyon Kartı (Obsidian Noir Zemin) */}
        <div className="p-4 rounded-xl bg-[#09090B] border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
            <span>Obsidian Noir Canlı Simülasyonu</span>
            <span className="text-[10px] text-slate-500">
              (Farenizi butonun üzerine getirip test edebilirsiniz)
            </span>
          </div>
          <div className="h-20 rounded-lg bg-[#0E0F14] border border-slate-800/80 relative flex items-center justify-center overflow-hidden">
            <div
              style={{
                opacity: (settings.security_settings.assistive_touch_opacity ?? 30) / 100,
              }}
              className="w-11 h-11 rounded-full bg-slate-950/85 border border-white/40 ring-1 ring-white/10 shadow-[0_0_12px_rgba(255,255,255,0.08),0_4px_16px_rgba(0,0,0,0.6)] backdrop-blur-md flex items-center justify-center cursor-pointer transition-all duration-300 hover:!opacity-95"
              title="Önizleme Butonu"
            >
              <div className="w-6 h-6 rounded-full border border-purple-400/60 flex items-center justify-center bg-purple-600/20 pointer-events-none">
                <Shield className="w-3.5 h-3.5 text-purple-300" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Acil Çıkış & Kaçış Hedef Web Sitesi (URL) */}
      <div className="p-5 bg-[#12151D] border border-[#222631] rounded-2xl space-y-4">
        <h3 className="text-xs font-bold text-white flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-emerald-400" />
          <span>Acil Çıkış & 3 Tık Kaçış Hedef Adresi (URL)</span>
        </h3>

        <p className="text-[11px] text-slate-400 leading-relaxed">
          Kullanıcı AssistiveTouch butonuna <b>3 kez seri</b> dokunduğunda veya mikro menüden <b>&apos;Acil Çıkış&apos;</b> seçeneğine tıkladığında tüm oturum kalıcı silinerek anında bu web sitesine fırlatılır. (Örn: İnaktivite kuralıyla senkron çalışır).
        </p>

        <div>
          <label className="text-[11px] font-semibold text-slate-400 block mb-1">
            Yönlendirilecek Hedef Web Sitesi
          </label>
          <input
            type="url"
            value={
              settings.security_settings.assistive_touch_redirect_url ||
              settings.security_settings.inactivity_redirect_url ||
              ""
            }
            onChange={(e) => {
              const val = e.target.value;
              setSettings({
                ...settings,
                security_settings: {
                  ...settings.security_settings,
                  assistive_touch_redirect_url: val,
                  inactivity_redirect_url: val,
                },
              });
            }}
            placeholder="https://www.google.com"
            className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>

        {/* Hızlı URL Seçenekleri */}
        <div>
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block mb-2">
            Önceden Tanımlı Hızlı Adresler
          </span>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Google", url: "https://www.google.com" },
              { label: "Wikipedia", url: "https://www.wikipedia.org" },
              { label: "E-Devlet", url: "https://www.turkiye.gov.tr" },
              { label: "Google Haberler", url: "https://news.google.com" },
              { label: "Hava Durumu", url: "https://weather.com" },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setSettings({
                    ...settings,
                    security_settings: {
                      ...settings.security_settings,
                      assistive_touch_redirect_url: preset.url,
                      inactivity_redirect_url: preset.url,
                    },
                  });
                }}
                className="px-3 py-1.5 rounded-lg bg-[#181B24] hover:bg-[#202430] border border-[#292D38] text-[11px] text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>{preset.label}</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  ({preset.url.replace("https://", "")})
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Varsayılan Ekran Konumu */}
      <div className="p-5 bg-[#12151D] border border-[#222631] rounded-2xl space-y-4">
        <h3 className="text-xs font-bold text-white flex items-center gap-2">
          <MapPin className="w-4 h-4 text-amber-400" />
          <span>Varsayılan Ekran Konumu (İlk Açılış)</span>
        </h3>
        <p className="text-[11px] text-slate-400">
          Kullanıcı butonu istediği yere sürükleyip bırakabilir; ekran kenarına mıknatısla yapışır. Bu ayar ilk kez giren kullanıcıların butonunun nerede belireceğini seçer.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { id: "left_center", label: "Sol Orta (Önerilen)", desc: "Sol kenara yaslı, dikey ekran ortası" },
            { id: "right_center", label: "Sağ Orta", desc: "Sağ kenara yaslı, dikey ekran ortası" },
            { id: "left_bottom", label: "Sol Alt", desc: "Sol kenara yaslı, alt navigasyon üstü" },
            { id: "right_bottom", label: "Sağ Alt", desc: "Sağ kenara yaslı, alt köşe" },
          ].map((pos) => {
            const current = settings.security_settings.assistive_touch_default_pos || "left_center";
            const isSelected = current === pos.id;
            return (
              <button
                key={pos.id}
                type="button"
                onClick={() =>
                  setSettings({
                    ...settings,
                    security_settings: {
                      ...settings.security_settings,
                      assistive_touch_default_pos: pos.id,
                    },
                  })
                }
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? "bg-indigo-600/15 border-indigo-500/50 ring-1 ring-indigo-500/40 text-white"
                    : "bg-[#181B24] border-[#292D38] hover:border-slate-700 text-slate-400 hover:text-white"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">{pos.label}</span>
                  {isSelected && <Check className="w-4 h-4 text-indigo-400" />}
                </div>
                <span className="text-[11px] text-slate-400">{pos.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Refleks ve Tetikleyici Ayarları */}
      <div className="p-5 bg-[#12151D] border border-[#222631] rounded-2xl space-y-3.5">
        <h3 className="text-xs font-bold text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-pink-400" />
          <span>Refleks ve Tetikleyici İzinleri</span>
        </h3>

        <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#181B24] border border-[#292D38] cursor-pointer hover:border-indigo-500/30 transition-colors">
          <div>
            <span className="text-xs font-semibold text-white block">
              3 Tık (Triple Tap) Hızlı Kaçış
            </span>
            <span className="text-[11px] text-slate-400">
              Butona seri 3 kez dokunulduğunda beklemeden ve onay istemeden derhal hedef adrese kaçış yapar.
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.security_settings.enable_triple_tap_escape !== false}
            onChange={(e) =>
              setSettings({
                ...settings,
                security_settings: {
                  ...settings.security_settings,
                  enable_triple_tap_escape: e.target.checked,
                },
              })
            }
            className="w-4 h-4 accent-indigo-600 rounded cursor-pointer shrink-0"
          />
        </label>

        <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#181B24] border border-[#292D38] cursor-pointer hover:border-indigo-500/30 transition-colors">
          <div>
            <span className="text-xs font-semibold text-white block">
              Çift Tık (Double Tap) Mikro Menü
            </span>
            <span className="text-[11px] text-slate-400">
              Butona 2 kez dokunulduğunda Acil Çıkış ve Tüm Cihazları Düşür menüsünü açar.
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.security_settings.enable_double_tap_menu !== false}
            onChange={(e) =>
              setSettings({
                ...settings,
                security_settings: {
                  ...settings.security_settings,
                  enable_double_tap_menu: e.target.checked,
                },
              })
            }
            className="w-4 h-4 accent-indigo-600 rounded cursor-pointer shrink-0"
          />
        </label>
      </div>

      {/* Kaydet Butonu */}
      <button
        type="button"
        onClick={() => onSave("security_settings", settings.security_settings)}
        className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/40"
      >
        <Save className="w-4 h-4" />
        <span>Güvenlik Touch Parametrelerini Kaydet</span>
      </button>
    </div>
  );
};
