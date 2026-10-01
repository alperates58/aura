"use client";

import { X, Trash2 } from "lucide-react";

interface Props {
  selectedCount: number;
  canDeleteForAll: boolean;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onDeleteForMe: () => void;
  onDeleteForAll: () => void;
}

export default function MessageSelectionBar({
  selectedCount,
  canDeleteForAll,
  onClearSelection,
  onSelectAll,
  onDeleteForMe,
  onDeleteForAll,
}: Props) {
  return (
    <div className="bg-indigo-950/95 border-b border-indigo-700/60 px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 sm:gap-3 shadow-xl z-20 animate-in slide-in-from-top-2 duration-150 flex-shrink-0 backdrop-blur-md">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={onClearSelection}
          className="p-1.5 rounded-lg hover:bg-white/10 text-indigo-200 hover:text-white transition-colors cursor-pointer flex-shrink-0"
          title="Seçimi İptal Et"
        >
          <X className="w-5 h-5" />
        </button>
        <span className="text-xs sm:text-sm font-semibold text-white truncate">
          {selectedCount} mesaj seçildi
        </span>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        <button
          onClick={onSelectAll}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          Tümünü Seç
        </button>

        {/* Benden Sil */}
        <button
          onClick={onDeleteForMe}
          disabled={selectedCount === 0}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 disabled:opacity-50 text-rose-200 hover:text-white text-xs font-medium border border-rose-500/30 transition-colors cursor-pointer"
          title="Seçili mesajları benden sil"
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-300" />
          <span className="hidden sm:inline">Benden Sil</span>
        </button>

        {/* Herkesten Sil (Sadece seçili tüm mesajlar bana aitse görünür) */}
        {canDeleteForAll && (
          <button
            onClick={onDeleteForAll}
            disabled={selectedCount === 0}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold shadow transition-colors cursor-pointer"
            title="Seçili mesajları herkesten sil"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Herkesten Sil</span>
          </button>
        )}
      </div>
    </div>
  );
}
