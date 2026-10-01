"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, MessageSquare } from "lucide-react";
import { format } from "date-fns";

export interface GalleryMediaItem {
  id: string;
  url: string;
  type: "image" | "video";
  name?: string;
  caption?: string;
  senderName?: string;
  sentAt?: string;
}

interface Props {
  isOpen: boolean;
  initialIndex?: number;
  items: GalleryMediaItem[];
  onClose: () => void;
  onJumpToMessage?: (messageId: string) => void;
}

export default function MediaGalleryModal({
  isOpen,
  initialIndex = 0,
  items,
  onClose,
  onJumpToMessage,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomLevel, setZoomLevel] = useState(1);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setZoomLevel(1);
  }, [initialIndex, isOpen]);

  const handlePrev = useCallback(() => {
    setZoomLevel(1);
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
  }, [items.length]);

  const handleNext = useCallback(() => {
    setZoomLevel(1);
    setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
  }, [items.length]);

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.5, 3));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 0.5, 0.5));
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
  };

  // Klavye kısayolları
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      } else if (e.key === "+" || e.key === "=") {
        handleZoomIn();
      } else if (e.key === "-") {
        handleZoomOut();
      } else if (e.key === "0") {
        handleResetZoom();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleNext, handlePrev, onClose]);

  if (!isOpen || items.length === 0) return null;

  const currentItem = items[currentIndex];
  if (!currentItem) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-2 sm:p-4 select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Üst Bar: Bilgi & Kontroller */}
      <div
        className="flex items-center justify-between px-3 py-2 z-10 bg-gradient-to-b from-black/80 to-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white/90">
              {currentIndex + 1} / {items.length}
            </span>
            {currentItem.senderName && (
              <span className="text-xs text-slate-300 font-medium">
                • {currentItem.senderName}
              </span>
            )}
          </div>
          {currentItem.sentAt && (
            <span className="text-[11px] text-slate-400">
              {format(new Date(currentItem.sentAt), "dd.MM.yyyy HH:mm")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* WhatsApp Stili: Sohbette Göster Butonu */}
          {onJumpToMessage && currentItem.id && (
            <button
              onClick={() => {
                onClose();
                onJumpToMessage(currentItem.id);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-grupo-accent hover:text-white text-slate-200 transition-all text-xs font-semibold cursor-pointer border border-slate-700/60 shadow-md"
              title="Bu mesajı sohbette göster"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Sohbette Göster</span>
            </button>
          )}

          {/* Zoom Kontrolleri (Görseller için) */}
          {currentItem.type === "image" && (
            <div className="flex items-center bg-slate-800/80 rounded-xl p-0.5 border border-slate-700/60">
              <button
                onClick={handleZoomOut}
                disabled={zoomLevel <= 0.5}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
                title="Uzaklaştır (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={handleResetZoom}
                className="px-2 py-1 text-[11px] font-bold text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Sıfırla (0)"
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                onClick={handleZoomIn}
                disabled={zoomLevel >= 3}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
                title="Yakınlaştır (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors cursor-pointer border border-slate-700/60"
            title="Kapat (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Orta Alan: Medya Görüntüleyici & Gezinme Okları */}
      <div
        className="relative flex-1 flex items-center justify-center overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Önceki Butonu */}
        {items.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute left-2 sm:left-4 z-20 p-2.5 sm:p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700/80 shadow-2xl transition-all cursor-pointer hover:scale-105 active:scale-95"
            title="Önceki (Sol Ok)"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        )}

        {/* Medya İçeriği */}
        <div className="max-w-full max-h-[80vh] flex items-center justify-center overflow-auto p-2">
          {currentItem.type === "video" ? (
            <video
              key={currentItem.id}
              src={currentItem.url}
              controls
              controlsList="nodownload"
              autoPlay
              playsInline
              className="max-w-full max-h-[78vh] rounded-2xl shadow-2xl bg-black object-contain"
              onContextMenu={(e) => e.preventDefault()}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={currentItem.id}
              src={currentItem.url}
              alt={currentItem.name || "Medya"}
              style={{
                transform: `scale(${zoomLevel})`,
                transition: "transform 0.15s ease-out",
              }}
              className="max-w-full max-h-[78vh] rounded-2xl shadow-2xl object-contain cursor-grab active:cursor-grabbing select-none"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
            />
          )}
        </div>

        {/* Sonraki Butonu */}
        {items.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute right-2 sm:right-4 z-20 p-2.5 sm:p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700/80 shadow-2xl transition-all cursor-pointer hover:scale-105 active:scale-95"
            title="Sonraki (Sağ Ok)"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        )}
      </div>

      {/* Alt Bar: Açıklama (Caption) */}
      {currentItem.caption && (
        <div
          className="w-full max-w-2xl mx-auto px-4 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-800/80 text-white text-xs sm:text-sm text-center backdrop-blur-md z-10 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {currentItem.caption}
        </div>
      )}
    </div>
  );
}
