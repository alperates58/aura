"use client";

import React, { useState } from "react";
import { SystemSettings } from "@/lib/admin_api";
import { maskBannedWords } from "@/lib/utils";
import { Ban, Trash2, X, Sparkles, Save } from "lucide-react";

interface BannedWordsTabProps {
  settings: SystemSettings;
  setSettings: React.Dispatch<React.SetStateAction<SystemSettings | null>>;
  onSave: (category: string, data: any) => Promise<boolean>;
}

export const BannedWordsTab: React.FC<BannedWordsTabProps> = ({
  settings,
  setSettings,
  onSave,
}) => {
  const [bannedWordTester, setBannedWordTester] = useState(
    "Örnek: Bu platformda küfür ve kumar kelimeleri yasaktır."
  );
  const [quickBannedWordInput, setQuickBannedWordInput] = useState("");

  const handleAddQuickWord = () => {
    const trimmed = quickBannedWordInput.trim().toLowerCase();
    if (!trimmed) return;
    const current = settings.chat_settings.banned_words || [];
    if (!current.includes(trimmed)) {
      setSettings({
        ...settings,
        chat_settings: {
          ...settings.chat_settings,
          banned_words: [...current, trimmed],
        },
      });
    }
    setQuickBannedWordInput("");
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Başlık Kartı */}
      <div className="p-5 bg-gradient-to-br from-rose-950/40 via-[#12151D] to-[#12151D] border border-rose-500/30 rounded-2xl relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white flex items-center justify-center shadow-lg shadow-rose-500/20 shrink-0">
              <Ban className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Yasaklı Kelimeler & Otomatik Sansür Kalkanı
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Aktif Filtre
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
                Belirlediğiniz kelimeler hem geçmiş hem de canlı yazılan tüm birebir sohbet mesajlarında otomatik olarak sansürlenir (Örn: <code className="text-rose-300 font-mono">elma</code> ➔ <code className="text-emerald-400 font-mono">e***</code>).
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-2xl font-black text-rose-400 font-mono">
              {(settings.chat_settings.banned_words || []).length}
            </span>
            <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Kayıtlı Kelime
            </span>
          </div>
        </div>
      </div>

      {/* Hızlı Kelime Ekleme & Toplu Düzenleme */}
      <div className="p-5 bg-[#12151D] border border-[#222631] rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white flex items-center gap-2">
            <span>Kelime Ekle & Toplu Liste</span>
          </h3>
          {settings.chat_settings.banned_words && settings.chat_settings.banned_words.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Tüm yasaklı kelimeleri silmek istediğinizden emin misiniz?")) {
                  setSettings({
                    ...settings,
                    chat_settings: {
                      ...settings.chat_settings,
                      banned_words: [],
                    },
                  });
                }
              }}
              className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Tümünü Temizle</span>
            </button>
          )}
        </div>

        {/* Hızlı Tekli Kelime Ekleme Çubuğu */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={quickBannedWordInput}
              onChange={(e) => setQuickBannedWordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddQuickWord();
                }
              }}
              placeholder="Hızlı kelime ekleyin ve Enter'a basın... (örn: kumar)"
              className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/60"
            />
          </div>
          <button
            type="button"
            onClick={handleAddQuickWord}
            className="px-4 py-2.5 bg-rose-600/30 hover:bg-rose-600/40 border border-rose-500/40 text-rose-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <Ban className="w-3.5 h-3.5" />
            <span>Ekle</span>
          </button>
        </div>

        {/* İnteraktif Kelime Rozetleri (Silme butonlu 'x') */}
        <div>
          <label className="text-[11px] font-semibold text-slate-400 block mb-2">
            Tanımlı Kelimeler ({settings.chat_settings.banned_words?.length || 0})
          </label>
          {settings.chat_settings.banned_words && settings.chat_settings.banned_words.length > 0 ? (
            <div className="flex flex-wrap gap-2 p-3 bg-[#181B24]/60 border border-[#292D38] rounded-xl max-h-48 overflow-y-auto">
              {settings.chat_settings.banned_words.map((word, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs font-mono font-medium group hover:bg-rose-500/25 transition-all"
                >
                  <span>{word}</span>
                  <span className="text-[10px] text-slate-400">➔</span>
                  <span className="text-emerald-400">{maskBannedWords(word, [word])}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = (settings.chat_settings.banned_words || []).filter((_, i) => i !== idx);
                      setSettings({
                        ...settings,
                        chat_settings: {
                          ...settings.chat_settings,
                          banned_words: updated,
                        },
                      });
                    }}
                    className="w-4 h-4 rounded hover:bg-rose-600 text-rose-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors ml-0.5"
                    title={`'${word}' kelimesini kaldır`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#181B24]/40 border border-[#292D38] text-center text-xs text-slate-500">
              Henüz hiçbir yasaklı kelime eklenmedi. Yukarıdaki alandan veya aşağıdaki toplu metin kutusundan kelime ekleyebilirsiniz.
            </div>
          )}
        </div>

        {/* Toplu Düzenleme Alanı */}
        <div>
          <label className="text-[11px] font-semibold text-slate-400 block mb-1">
            Toplu Düzenleme (Virgül, noktalı virgül veya yeni satır ile ayırın)
          </label>
          <textarea
            rows={3}
            value={(settings.chat_settings.banned_words || []).join(", ")}
            onChange={(e) => {
              const raw = e.target.value;
              const words = raw
                .split(/[,;\n]+/)
                .map((w) => w.trim().toLowerCase())
                .filter(Boolean);
              const uniqueWords = Array.from(new Set(words));
              setSettings({
                ...settings,
                chat_settings: {
                  ...settings.chat_settings,
                  banned_words: uniqueWords,
                },
              });
            }}
            placeholder="Örnek: elma, armut, kumar, dolandırıcı, küfür"
            className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500/50 resize-none font-mono"
          />
        </div>
      </div>

      {/* Canlı Test & Simülasyon Kum Havuzu */}
      <div className="p-5 bg-[#12151D] border border-[#222631] rounded-2xl space-y-3.5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold text-white">Canlı Sansür Simülasyonu</h3>
          <span className="text-[10px] text-slate-400 font-normal">
            (Aşağıya bir cümle yazarak sansür algoritmasını anlık test edin)
          </span>
        </div>

        <div className="space-y-2">
          <input
            type="text"
            value={bannedWordTester}
            onChange={(e) => setBannedWordTester(e.target.value)}
            placeholder="Test edilecek bir mesaj yazın..."
            className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50"
          />

          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
              Sohbette Görünecek Nihai Çıktı:
            </span>
            <p className="text-xs font-medium text-emerald-300 break-words leading-relaxed font-mono">
              {maskBannedWords(bannedWordTester, settings.chat_settings.banned_words || []) || (
                <span className="text-slate-600 italic">Mesaj boş</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Kaydet Butonu */}
      <button
        onClick={() => onSave("chat_settings", settings.chat_settings)}
        className="w-full py-3 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-rose-900/40"
      >
        <Save className="w-4 h-4" />
        <span>Yasaklı Kelimeleri ve Sansür Kuralını Kaydet</span>
      </button>
    </div>
  );
};
