"use client";

import React from "react";
import { THEME_PRESETS, ThemePreset } from "../constants/themePresets";
import { getContrastTextColor, getMutedTextColor } from "@/lib/utils";
import { Sparkles, Check, Sliders, Send, Save } from "lucide-react";

interface ThemeTabProps {
  accentColor: string;
  outgoingBubble: string;
  outgoingText: string;
  incomingBubble: string;
  cardBgColor: string;
  mainBgColor: string;
  borderColor: string;
  fontFamily: string;
  effectiveTextColor: string;
  handleApplyPreset: (p: ThemePreset) => void;
  handleUpdateColor: (colors: {
    accent?: string;
    outgoing?: string;
    text?: string;
    incoming?: string;
    cardBg?: string;
    mainBg?: string;
    border?: string;
  }) => void;
  setFontFamily: (font: string) => void;
  handleSaveTheme: () => void;
}

export const ThemeTab: React.FC<ThemeTabProps> = ({
  accentColor,
  outgoingBubble,
  outgoingText,
  incomingBubble,
  cardBgColor,
  mainBgColor,
  borderColor,
  fontFamily,
  effectiveTextColor,
  handleApplyPreset,
  handleUpdateColor,
  setFontFamily,
  handleSaveTheme,
}) => {
  return (
    <div className="space-y-6">
      {/* 1. KÜRATORLÜ PREMİUM KOYU TEMA KARTLARI */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-white flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Küratörlü Koyu Mod Koleksiyonu (9 Önayar)</span>
          </div>
          <span className="text-[11px] text-slate-400">Tek tıkla tüm platformu dönüştürün</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {THEME_PRESETS.map((p) => {
            const isSelected =
              outgoingBubble.toLowerCase() === p.bubble.toLowerCase() &&
              accentColor.toLowerCase() === p.color.toLowerCase() &&
              mainBgColor.toLowerCase() === p.main_bg.toLowerCase();

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleApplyPreset(p)}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 relative group overflow-hidden ${
                  isSelected
                    ? "border-indigo-400/80 bg-slate-800/80 shadow-lg shadow-indigo-950/40 ring-2 ring-indigo-500/50 scale-[1.01]"
                    : "border-[#222631] bg-[#12151D] hover:border-slate-700 hover:bg-[#161A24]"
                }`}
              >
                {/* Başlık ve Rozet */}
                <div className="flex items-center justify-between gap-1 w-full">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                      <span>{p.name}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                      {p.description}
                    </div>
                  </div>
                  <span
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 border"
                    style={{
                      backgroundColor: `${p.color}18`,
                      color: p.color,
                      borderColor: `${p.color}35`,
                    }}
                  >
                    {p.badge}
                  </span>
                </div>

                {/* Mini Arayüz / Balon Mockup Görseli */}
                <div
                  className="w-full rounded-xl p-2.5 border space-y-1.5 shadow-inner"
                  style={{
                    backgroundColor: p.main_bg,
                    borderColor: p.border_color,
                  }}
                >
                  {/* Mini Gelen Mesaj */}
                  <div className="flex justify-start">
                    <div
                      className="px-2 py-1 rounded-lg rounded-bl-none text-[10px] text-slate-300 border max-w-[85%]"
                      style={{
                        backgroundColor: p.incoming_bubble,
                        borderColor: p.border_color,
                      }}
                    >
                      SaaS koyu mod harika!
                    </div>
                  </div>

                  {/* Mini Giden Mesaj */}
                  <div className="flex justify-end">
                    <div
                      className="px-2 py-1 rounded-lg rounded-br-none text-[10px] shadow-sm max-w-[85%]"
                      style={{
                        backgroundColor: p.bubble,
                        color: p.text,
                      }}
                    >
                      Kusursuz görünüyor ✓✓
                    </div>
                  </div>
                </div>

                {/* Alt Palet Renk Noktaları & Seçim İşareti */}
                <div className="flex items-center justify-between pt-1 border-t border-white/5 w-full">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-xs"
                      style={{ backgroundColor: p.color }}
                      title={`Vurgu: ${p.color}`}
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-xs"
                      style={{ backgroundColor: p.bubble }}
                      title={`Giden Balon: ${p.bubble}`}
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-xs"
                      style={{ backgroundColor: p.incoming_bubble }}
                      title={`Gelen Balon: ${p.incoming_bubble}`}
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-xs"
                      style={{ backgroundColor: p.main_bg }}
                      title={`Arka Plan: ${p.main_bg}`}
                    />
                  </div>
                  {isSelected && (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-400">
                      <Check className="w-3.5 h-3.5" />
                      <span>Aktif</span>
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. ÖZEL RENK & TİPOGRAFİ İNCE AYARI */}
      <div className="p-4 rounded-2xl bg-[#12151D] border border-[#222631] space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <span>Özel Renk & Tipografi İnce Ayarı</span>
          </div>
          <span className="text-[10px] text-indigo-400 font-medium">Anında Canlı Önizleme</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {/* 1. Ana Vurgu Rengi */}
          <div className="p-3 rounded-xl bg-[#161922] border border-[#252936]">
            <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
              Ana Vurgu Rengi (Butonlar/İkonlar)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={accentColor}
                onChange={(e) => handleUpdateColor({ accent: e.target.value })}
                className="flex-1 bg-[#10131A] border border-[#292D38] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
              <input
                type="color"
                value={accentColor.startsWith("#") ? accentColor : "#6366F1"}
                onChange={(e) => handleUpdateColor({ accent: e.target.value })}
                className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                title="Vurgu Rengi Seç"
              />
            </div>
          </div>

          {/* 2. Giden Mesaj Balon Rengi */}
          <div className="p-3 rounded-xl bg-[#161922] border border-[#252936]">
            <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
              Giden Mesaj Balon Rengi
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={outgoingBubble}
                onChange={(e) => handleUpdateColor({ outgoing: e.target.value })}
                className="flex-1 bg-[#10131A] border border-[#292D38] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
              <input
                type="color"
                value={outgoingBubble.startsWith("#") ? outgoingBubble : "#4F46E5"}
                onChange={(e) => handleUpdateColor({ outgoing: e.target.value })}
                className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                title="Giden Balon Rengi Seç"
              />
            </div>
          </div>

          {/* 3. Giden Mesaj Yazı Rengi */}
          <div className="p-3 rounded-xl bg-[#161922] border border-[#252936]">
            <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
              Giden Mesaj Yazı Rengi
            </label>
            <div className="flex items-center gap-2">
              <select
                value={
                  outgoingText === "auto" ||
                  outgoingText === "#FFFFFF" ||
                  outgoingText === "#0F172A"
                    ? outgoingText
                    : "custom"
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val !== "custom") {
                    handleUpdateColor({ text: val });
                  }
                }}
                className="flex-1 bg-[#10131A] border border-[#292D38] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="auto">Otomatik (Akıllı Kontrast)</option>
                <option value="#FFFFFF">Beyaz (#FFFFFF)</option>
                <option value="#0F172A">Koyu Siyah (#0F172A)</option>
                <option value="custom">Özel Hex Seç...</option>
              </select>
              <input
                type="color"
                value={effectiveTextColor.startsWith("#") ? effectiveTextColor : "#FFFFFF"}
                onChange={(e) => handleUpdateColor({ text: e.target.value })}
                className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                title="Özel Yazı Rengi Seç"
              />
            </div>
          </div>

          {/* 4. Gelen Mesaj Balon Rengi */}
          <div className="p-3 rounded-xl bg-[#161922] border border-[#252936]">
            <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
              Gelen Mesaj Balon Rengi
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={incomingBubble}
                onChange={(e) => handleUpdateColor({ incoming: e.target.value })}
                className="flex-1 bg-[#10131A] border border-[#292D38] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
              <input
                type="color"
                value={incomingBubble.startsWith("#") ? incomingBubble : "#181C28"}
                onChange={(e) => handleUpdateColor({ incoming: e.target.value })}
                className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                title="Gelen Balon Rengi Seç"
              />
            </div>
          </div>

          {/* 5. Panel ve Kart Zemin Rengi */}
          <div className="p-3 rounded-xl bg-[#161922] border border-[#252936]">
            <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
              Panel ve Kart Zemin Rengi
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={cardBgColor}
                onChange={(e) => handleUpdateColor({ cardBg: e.target.value })}
                className="flex-1 bg-[#10131A] border border-[#292D38] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
              <input
                type="color"
                value={cardBgColor.startsWith("#") ? cardBgColor : "#11141E"}
                onChange={(e) => handleUpdateColor({ cardBg: e.target.value })}
                className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                title="Kart Rengi Seç"
              />
            </div>
          </div>

          {/* 6. Ana Zemin / Canvas Rengi */}
          <div className="p-3 rounded-xl bg-[#161922] border border-[#252936]">
            <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
              Ana Zemin / Canvas Rengi
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={mainBgColor}
                onChange={(e) => handleUpdateColor({ mainBg: e.target.value })}
                className="flex-1 bg-[#10131A] border border-[#292D38] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
              <input
                type="color"
                value={mainBgColor.startsWith("#") ? mainBgColor : "#090A0F"}
                onChange={(e) => handleUpdateColor({ mainBg: e.target.value })}
                className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                title="Ana Zemin Rengi Seç"
              />
            </div>
          </div>

          {/* 7. Kenarlık & Ayraç Rengi */}
          <div className="p-3 rounded-xl bg-[#161922] border border-[#252936]">
            <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
              Kenarlık & Ayraç Rengi
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={borderColor}
                onChange={(e) => handleUpdateColor({ border: e.target.value })}
                className="flex-1 bg-[#10131A] border border-[#292D38] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
              <input
                type="color"
                value={borderColor.startsWith("#") ? borderColor : "#1E2333"}
                onChange={(e) => handleUpdateColor({ border: e.target.value })}
                className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                title="Kenarlık Rengi Seç"
              />
            </div>
          </div>

          {/* 8. Tipografi & Font Family */}
          <div className="p-3 rounded-xl bg-[#161922] border border-[#252936]">
            <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
              Tipografi (Font Family)
            </label>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="w-full bg-[#10131A] border border-[#292D38] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
            >
              <option value="Inter">Inter (Varsayılan SaaS)</option>
              <option value="Roboto">Roboto</option>
              <option value="Poppins">Poppins Modern</option>
              <option value="Outfit">Outfit Minimalist</option>
              <option value="System">Sistem Varsayılanı</option>
            </select>
          </div>
        </div>

        {/* Akıllı Kontrast Bilgisi */}
        <div className="flex items-center gap-2 text-[11px] text-slate-300 bg-[#0E1017] p-2.5 rounded-xl border border-[#222631]">
          <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>
            <strong>Akıllı Yazı Rengi:</strong> Otomatik mod açıkken giden balonun rengine göre yazı rengi maksimum kontrast (beyaz veya koyu) için otomatik adapte edilir.
          </span>
        </div>
      </div>

      {/* 3. CANLI SOHBET SİMÜLATÖRÜ / ÖNİZLEME */}
      <div
        className="p-4 rounded-2xl border space-y-3 transition-colors duration-200 shadow-xl"
        style={{
          backgroundColor: mainBgColor,
          borderColor: borderColor,
        }}
      >
        <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: borderColor }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs"
              style={{
                backgroundColor: cardBgColor,
                color: accentColor,
                border: `1px solid ${borderColor}`,
              }}
            >
              A
            </div>
            <div>
              <div className="text-xs font-bold text-white leading-tight">Antigravity Aura</div>
              <div className="text-[10px] text-emerald-400 font-medium leading-tight">Çevrimiçi</div>
            </div>
          </div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Canlı Sohbet Önizlemesi
          </div>
        </div>

        {/* Mesaj Akışı */}
        <div className="space-y-2 py-1">
          {/* Gelen Mesaj */}
          <div className="flex justify-start">
            <div
              className="px-3.5 py-2 rounded-2xl rounded-bl-xs text-xs border max-w-[85%] shadow-sm transition-colors duration-200"
              style={{
                backgroundColor: incomingBubble,
                borderColor: borderColor,
                color: getContrastTextColor(incomingBubble),
              }}
            >
              <div>Yeni SaaS koyu mod teması nasıl duruyor?</div>
              <div
                className="text-[10px] text-right mt-0.5"
                style={{
                  color: getMutedTextColor(incomingBubble, getContrastTextColor(incomingBubble)),
                }}
              >
                14:30
              </div>
            </div>
          </div>

          {/* Giden Mesaj */}
          <div className="flex justify-end">
            <div
              className="px-3.5 py-2 rounded-2xl rounded-br-xs text-xs shadow-md max-w-[85%] transition-all duration-200"
              style={{
                backgroundColor: outgoingBubble,
                color: effectiveTextColor,
              }}
            >
              <div>Kusursuz! Gözü hiç yormuyor ve tam aradığım premium havayı veriyor.</div>
              <div
                className="text-[10px] text-right mt-0.5 flex items-center justify-end gap-1"
                style={{
                  color: getMutedTextColor(outgoingBubble, effectiveTextColor),
                }}
              >
                <span>14:31</span>
                <span>✓✓</span>
              </div>
            </div>
          </div>
        </div>

        {/* Mock Yazma Barı */}
        <div
          className="p-1.5 rounded-xl border flex items-center gap-2"
          style={{
            backgroundColor: cardBgColor,
            borderColor: borderColor,
          }}
        >
          <div className="flex-1 px-3 py-1.5 rounded-lg text-xs text-slate-400 bg-slate-900/60">
            Bir mesaj yazın...
          </div>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0"
            style={{
              backgroundColor: accentColor,
              color: getContrastTextColor(accentColor),
            }}
          >
            <Send className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* 4. TEMAYI KAYDET BUTONU */}
      <button
        type="button"
        onClick={handleSaveTheme}
        style={{
          backgroundColor: accentColor,
          color: getContrastTextColor(accentColor),
        }}
        className="w-full py-3.5 px-4 rounded-xl text-xs font-bold shadow-lg hover:brightness-110 active:scale-[0.99] flex items-center justify-center gap-2 transition-all cursor-pointer"
      >
        <Save className="w-4 h-4" />
        <span>Temayı Canlı Uygula ve Veritabanına Kaydet (Tüm Kullanıcılar İçin)</span>
      </button>
    </div>
  );
};
