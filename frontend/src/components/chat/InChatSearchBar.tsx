"use client";

import { Search, X, ChevronUp, ChevronDown } from "lucide-react";

interface Props {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  matchCount: number;
  currentMatchIndex: number;
  onPrevMatch: () => void;
  onNextMatch: () => void;
  onClose: () => void;
}

export default function InChatSearchBar({
  searchQuery,
  onSearchChange,
  matchCount,
  currentMatchIndex,
  onPrevMatch,
  onNextMatch,
  onClose,
}: Props) {
  return (
    <div className="bg-slate-900/95 border-b border-grupo-dark-border px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 sm:gap-3 shadow-lg z-10 animate-in slide-in-from-top-2 duration-150 flex-shrink-0">
      <div className="flex-1 flex items-center gap-2 bg-slate-950/80 border border-slate-700/80 rounded-xl px-3 py-1.5 focus-within:border-grupo-accent transition-colors">
        <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) onPrevMatch();
              else onNextMatch();
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
          placeholder="Sohbette ara..."
          className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
          autoFocus
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange("")}
            className="p-0.5 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Sonuç Sayacı ve Gezinme Okları (WhatsApp Web Style) */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {searchQuery.trim() && (
          <span className="text-[11px] font-semibold text-slate-400 px-2 py-1 rounded-lg bg-slate-800">
            {matchCount > 0
              ? `${currentMatchIndex + 1} / ${matchCount}`
              : "Sonuç yok"}
          </span>
        )}

        <button
          onClick={onPrevMatch}
          disabled={matchCount === 0}
          title="Önceki Eşleşme (Yukarı)"
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 disabled:opacity-30 text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <ChevronUp className="w-4 h-4" />
        </button>

        <button
          onClick={onNextMatch}
          disabled={matchCount === 0}
          title="Sonraki Eşleşme (Aşağı)"
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 disabled:opacity-30 text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <ChevronDown className="w-4 h-4" />
        </button>

        <button
          onClick={onClose}
          title="Aramayı Kapat"
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer ml-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
