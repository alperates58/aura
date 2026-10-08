"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search, X, Sparkles, ChevronDown } from "lucide-react";
import {
  EmojiCategory,
  CATEGORIES,
  SKIN_TONES,
  KAOMOJIS,
  EMOJI_DATABASE,
} from "./emoji/emojiData";

export type { EmojiCategory };

const RECENT_EMOJIS_KEY = "aura_recent_emojis";

interface EmojiPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  className?: string;
  anchorPosition?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
}

export default function EmojiPicker({
  isOpen,
  onClose,
  onSelectEmoji,
  className = "",
  anchorPosition = "bottom-left",
}: EmojiPickerProps) {
  const [activeTab, setActiveTab] = useState<"emoji" | "kaomoji">("emoji");
  const [activeCategory, setActiveCategory] = useState<EmojiCategory>("smileys");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSkinTone, setSelectedSkinTone] = useState<string>("");
  const [isTonePickerOpen, setIsTonePickerOpen] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [hoveredEmoji, setHoveredEmoji] = useState<{ emoji: string; name: string } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // localStorage'dan son kullanılan emojileri yükle
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_EMOJIS_KEY);
      if (stored) {
        setRecentEmojis(JSON.parse(stored));
      } else {
        // Varsayılan popüler emojiler
        setRecentEmojis(["😂", "❤️", "🔥", "👍", "😍", "🙏", "✨", "🥰", "🇹🇷", "👏", "🤣", "🎉"]);
      }
    } catch {
      setRecentEmojis(["😂", "❤️", "🔥", "👍", "😍", "🙏"]);
    }
  }, []);

  // Açıldığında arama kutusuna odaklan (PC'de harika bir deneyim)
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 80);
    } else {
      setSearchQuery("");
      setIsTonePickerOpen(false);
      setHoveredEmoji(null);
    }
  }, [isOpen]);

  // Dışarı tıklayınca veya ESC tuşuna basılınca kapat
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Emojiyi seç ve son kullanılanlara ekle
  const handleEmojiClick = (rawEmoji: string, name?: string) => {
    let finalEmoji = rawEmoji;

    // Ten rengi uygulanabilir mi kontrol et
    if (selectedSkinTone) {
      const dbItem = EMOJI_DATABASE.find((item) => item.emoji === rawEmoji);
      if (dbItem?.supportsTone) {
        finalEmoji = rawEmoji + selectedSkinTone;
      }
    }

    onSelectEmoji(finalEmoji);

    // Son kullanılanları güncelle (maksimum 18 adet)
    setRecentEmojis((prev) => {
      const filtered = prev.filter((item) => item !== finalEmoji && item !== rawEmoji);
      const updated = [finalEmoji, ...filtered].slice(0, 18);
      try {
        localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error("Recent emojis kaydedilemedi:", err);
      }
      return updated;
    });
  };

  // Kaomoji tıklandığında ekle
  const handleKaomojiClick = (text: string) => {
    onSelectEmoji(text);
  };

  // Ten rengi seçildiğinde
  const handleSelectSkinTone = (toneCode: string) => {
    setSelectedSkinTone(toneCode);
    setIsTonePickerOpen(false);
  };

  // Arama filtresi
  const filteredEmojis = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.trim().toLowerCase();
    return EMOJI_DATABASE.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        item.emoji === query
    );
  }, [searchQuery]);

  // Kategoriye göre filtrelenmiş emojiler
  const currentCategoryEmojis = useMemo((): EmojiItem[] => {
    if (activeCategory === "recent") {
      return recentEmojis.map((e) => {
        const found = EMOJI_DATABASE.find((item) => item.emoji === e || e.startsWith(item.emoji));
        return {
          emoji: e,
          name: found ? found.name : "Son Kullanılan",
          category: "recent" as EmojiCategory,
          tags: [],
          supportsTone: found?.supportsTone || false,
        };
      });
    }
    return EMOJI_DATABASE.filter((item) => item.category === activeCategory);
  }, [activeCategory, recentEmojis]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Gelişmiş Emoji Klavyesi"
      className={`absolute z-50 select-none animate-in fade-in zoom-in-95 duration-200 ease-out ${
        anchorPosition === "bottom-left"
          ? "bottom-16 left-0 sm:left-1"
          : anchorPosition === "bottom-right"
          ? "bottom-16 right-0"
          : "top-14 left-0"
      } ${className}`}
    >
      {/* Kart Gövdesi: Glassmorphism + Grupo Teması */}
      <div className="w-[340px] sm:w-[380px] h-[430px] flex flex-col bg-slate-900/95 border border-slate-700/80 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.65)] backdrop-blur-2xl overflow-hidden ring-1 ring-white/10">
        
        {/* ÜST BAŞLIK & SEKMELER */}
        <div className="flex items-center justify-between px-3.5 pt-3 pb-2 border-b border-slate-800/80">
          {/* Sekme Butonları */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-800/80 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setActiveTab("emoji");
                setSearchQuery("");
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "emoji"
                  ? "bg-slate-700/90 text-white shadow-sm ring-1 ring-white/10"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Smile className="w-3.5 h-3.5 text-amber-400" />
              <span>Emojiler</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("kaomoji");
                setSearchQuery("");
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "kaomoji"
                  ? "bg-slate-700/90 text-white shadow-sm ring-1 ring-white/10"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-pink-400" />
              <span>Kaomoji</span>
            </button>
          </div>

          {/* Sağ Aksiyonlar: Ten Rengi Seçici & Kapat Butonu */}
          <div className="flex items-center gap-1">
            {activeTab === "emoji" && (
              <div className="relative">
                <button
                  type="button"
                  title="Ten Rengi Seç"
                  onClick={() => setIsTonePickerOpen(!isTonePickerOpen)}
                  className="w-7 h-7 rounded-lg hover:bg-slate-800/80 flex items-center justify-center text-sm transition-transform active:scale-95 cursor-pointer"
                >
                  <span>
                    {selectedSkinTone
                      ? SKIN_TONES.find((t) => t.code === selectedSkinTone)?.sample || "👋"
                      : "👋"}
                  </span>
                </button>

                {/* Ten Rengi Açılır Menüsü */}
                {isTonePickerOpen && (
                  <div className="absolute right-0 top-9 p-1.5 bg-slate-900 border border-slate-700/80 rounded-xl shadow-xl z-50 flex items-center gap-1 animate-in fade-in zoom-in-95 duration-100">
                    {SKIN_TONES.map((tone) => (
                      <button
                        key={tone.id}
                        type="button"
                        onClick={() => handleSelectSkinTone(tone.code)}
                        title={tone.label}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:scale-125 transition-transform cursor-pointer ${
                          selectedSkinTone === tone.code
                            ? "bg-slate-700 ring-2 ring-amber-400"
                            : "hover:bg-slate-800"
                        }`}
                      >
                        {tone.sample}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              title="Kapat (Esc)"
              className="w-7 h-7 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* CANLI ARAMA ÇUBUĞU */}
        <div className="px-3 pt-2.5 pb-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-3 text-slate-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === "emoji"
                  ? "Emoji ara... (örn: gül, kalp, ateş, selam)"
                  : "İfade ara..."
              }
              className="w-full bg-slate-800/80 border border-slate-700/60 focus:border-amber-400/70 rounded-xl py-1.5 pl-8 pr-7 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-400/50 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* KATEGORİ NAVİGASYONU (Sadece Arama Yokken ve Emoji Sekmesinde) */}
        {activeTab === "emoji" && !searchQuery.trim() && (
          <div className="flex items-center px-2 py-1 gap-0.5 border-b border-slate-800/60 overflow-x-auto scrollbar-none">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(cat.id);
                    if (scrollContainerRef.current) {
                      scrollContainerRef.current.scrollTop = 0;
                    }
                  }}
                  title={cat.label}
                  className={`p-1.5 rounded-lg flex items-center justify-center transition-all cursor-pointer flex-shrink-0 ${
                    isActive
                      ? "text-amber-400 bg-amber-400/10 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>
        )}

        {/* EMOJİ VEYA KAOMOJI İÇERİK ALANI */}
        <div
          ref={scrollContainerRef}
          className="flex-1 px-2.5 py-2 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent space-y-3"
        >
          {/* DURUM 1: ARAMA SONUÇLARI */}
          {searchQuery.trim() ? (
            <div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1 mb-2">
                Arama Sonuçları ({filteredEmojis.length})
              </div>
              {filteredEmojis.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <div className="text-3xl mb-2">🔍</div>
                  <p className="text-xs font-medium">Eşleşen emoji bulunamadı</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Farklı bir anahtar kelime deneyin (örn: &quot;kalp&quot;, &quot;gül&quot;)
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-7 sm:grid-cols-8 gap-1">
                  {filteredEmojis.map((item, idx) => {
                    const displayEmoji =
                      selectedSkinTone && (item as any).supportsTone
                        ? item.emoji + selectedSkinTone
                        : item.emoji;
                    return (
                      <button
                        key={`${item.emoji}-${idx}`}
                        type="button"
                        onClick={() => handleEmojiClick(item.emoji, item.name)}
                        onMouseEnter={() =>
                          setHoveredEmoji({ emoji: displayEmoji, name: item.name })
                        }
                        onMouseLeave={() => setHoveredEmoji(null)}
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl hover:bg-slate-800/90 hover:scale-125 active:scale-95 transition-all duration-150 cursor-pointer select-none"
                      >
                        {displayEmoji}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeTab === "emoji" ? (
            /* DURUM 2: EMOJİ KATEGORİSİ */
            <div>
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  {CATEGORIES.find((c) => c.id === activeCategory)?.label || "Emojiler"}
                </span>
                <span className="text-[10px] text-slate-400">
                  {currentCategoryEmojis.length} emoji
                </span>
              </div>

              {currentCategoryEmojis.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">Henüz son kullanılan emoji yok</p>
                  <p className="text-[10px] text-slate-500">
                    Sohbette kullandığınız emojiler burada listelenecektir.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-7 sm:grid-cols-8 gap-1">
                  {currentCategoryEmojis.map((item, idx) => {
                    const displayEmoji =
                      selectedSkinTone && (item as any).supportsTone
                        ? item.emoji + selectedSkinTone
                        : item.emoji;
                    return (
                      <button
                        key={`${item.emoji}-${idx}`}
                        type="button"
                        onClick={() => handleEmojiClick(item.emoji, item.name)}
                        onMouseEnter={() =>
                          setHoveredEmoji({ emoji: displayEmoji, name: item.name })
                        }
                        onMouseLeave={() => setHoveredEmoji(null)}
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl hover:bg-slate-800/90 hover:scale-125 active:scale-95 transition-all duration-150 cursor-pointer select-none"
                      >
                        {displayEmoji}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* DURUM 3: KAOMOJI SEKMESİ */
            <div className="space-y-3.5">
              {KAOMOJIS.map((group) => (
                <div key={group.category}>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1.5">
                    {group.category}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {group.list.map((km, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleKaomojiClick(km)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 text-xs text-slate-200 hover:text-white font-mono transition-all text-center truncate cursor-pointer hover:shadow-sm"
                      >
                        {km}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ALT BİLGİ / ÖNİZLEME ÇUBUĞU (FOOTER PREVIEW - WhatsApp / Discord Stili) */}
        <div className="h-11 px-3 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between text-xs">
          {hoveredEmoji ? (
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-2xl flex-shrink-0 animate-in zoom-in-75 duration-100">
                {hoveredEmoji.emoji}
              </span>
              <span className="text-slate-300 font-medium truncate text-xs">
                {hoveredEmoji.name}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-[11px]">
              <span className="text-amber-400 font-bold">✨ Aura</span>
              <span>Bir emojiye tıklayarak mesaja ekleyin</span>
            </div>
          )}

          {activeTab === "emoji" && (
            <div className="text-[10px] text-slate-400 hidden sm:block">
              {selectedSkinTone ? "Ten tonu aktif" : "Standart"}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
