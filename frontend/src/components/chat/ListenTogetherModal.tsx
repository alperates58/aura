"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Headphones,
  Music,
  Radio,
  Sparkles,
  ExternalLink,
  Play,
  Clipboard,
  Check,
  Flame,
} from "lucide-react";
import { fetchMediaMetadata, isYouTubeUrl, isYouTubeMusicUrl, MediaMeta } from "@/lib/youtube";
import { useListenTogetherStore } from "@/store/useListenTogetherStore";

interface ListenTogetherModalProps {
  isOpen: boolean;
  conversationId: string | null;
  onClose: () => void;
}

// Hızlı Başlatma Hazır Listesi (Hemen dinlemek isteyenler için)
const QUICK_PRESETS = [
  {
    title: "Lofi Girl - Canlı Beats",
    artist: "Lofi Hip Hop Radio",
    url: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
    tag: "Lofi",
  },
  {
    title: "Synthwave / Chillwave Akışı",
    artist: "Lofi Girl",
    url: "https://www.youtube.com/watch?v=4xDzrJKXOOY",
    tag: "Synthwave",
  },
  {
    title: "Akustik ve Sakinleştirici Parçalar",
    artist: "Chill Music Lab",
    url: "https://www.youtube.com/watch?v=mAKsZ26SabQ",
    tag: "Acoustic",
  },
];

export default function ListenTogetherModal({
  isOpen,
  conversationId,
  onClose,
}: ListenTogetherModalProps) {
  const [urlInput, setUrlInput] = useState("");
  const [previewMeta, setPreviewMeta] = useState<MediaMeta | null>(null);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  const startSession = useListenTogetherStore((state) => state.startSession);

  // Link değiştikçe önizleme meta verisini çek
  useEffect(() => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setPreviewMeta(null);
      return;
    }

    let isCancelled = false;
    setIsLoadingMeta(true);

    const timer = setTimeout(async () => {
      try {
        const meta = await fetchMediaMetadata(trimmed);
        if (!isCancelled) {
          setPreviewMeta(meta);
        }
      } catch {
        if (!isCancelled) setPreviewMeta(null);
      } finally {
        if (!isCancelled) setIsLoadingMeta(false);
      }
    }, 350);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [urlInput]);

  if (!isOpen) return null;

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrlInput(text.trim());
        setHasCopied(true);
        setTimeout(() => setHasCopied(false), 1500);
      }
    } catch {}
  };

  const handleStart = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!conversationId || !urlInput.trim()) return;

    const meta = previewMeta || {
      mediaType: isYouTubeMusicUrl(urlInput)
        ? "youtube_music"
        : isYouTubeUrl(urlInput)
        ? "youtube"
        : "audio",
      url: urlInput.trim(),
      title: "Müzik Parçası",
      artist: "Birlikte Dinle",
      thumbnail: "",
    };

    startSession(conversationId, meta);
    onClose();
  };

  const handlePickPreset = (presetUrl: string) => {
    setUrlInput(presetUrl);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl p-5 sm:p-6 flex flex-col gap-4 text-white animate-in zoom-in-95 duration-200">
        {/* Üst Bar */}
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-pink-600 to-rose-500 flex items-center justify-center shadow-lg shadow-pink-600/30">
              <Headphones className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5">
                <span>Birlikte Dinle</span>
                <span className="px-1.5 py-0.5 rounded-full bg-pink-500/20 text-pink-400 text-[10px] font-bold border border-pink-500/30">
                  1-e-1 Senkron
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                YouTube, YouTube Music veya MP3/Radyo akışını aynı anda dinleyin
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Link Giriş Alanı */}
        <form onSubmit={handleStart} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Müzik veya Video Linki:</span>
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="text-[11px] text-pink-400 hover:text-pink-300 transition flex items-center gap-1 cursor-pointer"
              >
                {hasCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Clipboard className="w-3 h-3" />}
                <span>{hasCopied ? "Yapıştırıldı" : "Panodan Yapıştır"}</span>
              </button>
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://music.youtube.com/watch?v=... veya https://youtube.com/..."
                className="w-full bg-slate-950 border border-slate-700/80 focus:border-pink-500 rounded-2xl pl-3.5 pr-20 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition shadow-inner"
                autoFocus
              />
              <button
                type="submit"
                disabled={!urlInput.trim()}
                className="absolute right-1.5 px-3.5 py-1.5 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition shadow-md cursor-pointer"
              >
                Başlat
              </button>
            </div>
          </div>
        </form>

        {/* Canlı Önizleme Kartı */}
        {isLoadingMeta ? (
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl flex items-center gap-3 animate-pulse">
            <div className="w-12 h-12 bg-slate-800 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-slate-800 rounded w-3/4" />
              <div className="h-2.5 bg-slate-800 rounded w-1/2" />
            </div>
          </div>
        ) : previewMeta ? (
          <div className="p-3 bg-slate-950 border border-slate-800/90 rounded-2xl flex items-center gap-3 shadow-lg">
            <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-white/10">
              {previewMeta.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewMeta.thumbnail}
                  alt={previewMeta.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-pink-600/20 text-pink-400">
                  <Music className="w-6 h-6" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                {previewMeta.mediaType === "youtube_music" ? (
                  <span className="px-1.5 py-0.2 rounded bg-red-600/30 border border-red-500/40 text-[9px] font-bold text-red-300">
                    YouTube Music
                  </span>
                ) : previewMeta.mediaType === "youtube" ? (
                  <span className="px-1.5 py-0.2 rounded bg-rose-600/30 border border-rose-500/40 text-[9px] font-bold text-rose-300">
                    YouTube
                  </span>
                ) : (
                  <span className="px-1.5 py-0.2 rounded bg-pink-600/30 border border-pink-500/40 text-[9px] font-bold text-pink-300">
                    Ses Dosyası
                  </span>
                )}
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <h4 className="text-xs font-bold text-white truncate">{previewMeta.title}</h4>
              <p className="text-[10px] text-slate-400 truncate">{previewMeta.artist}</p>
            </div>
          </div>
        ) : null}

        {/* Hızlı Önerilen Parçalar (Presets) */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>Hızlı Başlat (Örnek Akışlar):</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {QUICK_PRESETS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handlePickPreset(p.url)}
                className="p-2.5 rounded-2xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 hover:border-pink-500/40 text-left transition flex flex-col justify-between cursor-pointer group"
              >
                <div>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                    {p.tag}
                  </span>
                  <p className="text-xs font-semibold text-white group-hover:text-pink-300 transition truncate mt-1.5">
                    {p.title}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">{p.artist}</p>
                </div>
                <div className="flex items-center justify-end mt-2">
                  <div className="w-6 h-6 rounded-full bg-slate-800 group-hover:bg-pink-600 text-slate-400 group-hover:text-white flex items-center justify-center transition">
                    <Play className="w-3 h-3 fill-current ml-0.5" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Bilgilendirme Notu */}
        <div className="bg-slate-950/50 border border-white/5 rounded-2xl p-2.5 text-[11px] text-slate-400 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-pink-400 shrink-0" />
          <span>
            Başlattığınızda müzik sohbetin üstünde <strong>Dinamik Ada</strong> olarak asılı kalır; yazışırken kesintisiz dinleyebilir ve dilediğiniz an durdurabilirsiniz.
          </span>
        </div>
      </div>
    </div>
  );
}
