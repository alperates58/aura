"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Headphones,
  Music,
  Play,
  Clipboard,
  Check,
  Search,
  Loader2,
  ListMusic,
} from "lucide-react";
import {
  fetchMediaMetadata,
  isYouTubeUrl,
  isYouTubeMusicUrl,
  isYouTubePlaylistUrl,
  extractYouTubePlaylistId,
  MediaMeta,
} from "@/lib/youtube";
import { useListenTogetherStore } from "@/store/useListenTogetherStore";

interface ListenTogetherModalProps {
  isOpen: boolean;
  conversationId: string | null;
  onClose: () => void;
}

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: string;
  url: string;
}

export default function ListenTogetherModal({
  isOpen,
  conversationId,
  onClose,
}: ListenTogetherModalProps) {
  const [inputQuery, setInputQuery] = useState("");
  const [previewMeta, setPreviewMeta] = useState<MediaMeta | null>(null);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  // Arama sonuçları
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const startSession = useListenTogetherStore((state) => state.startSession);

  // Girdi URL mi yoksa arama kelimesi mi?
  const isUrl = /^https?:\/\//i.test(inputQuery.trim());

  // 1. Link girildiğinde önizleme meta verisini çek
  useEffect(() => {
    const trimmed = inputQuery.trim();
    if (!trimmed || !isUrl) {
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
  }, [inputQuery, isUrl]);

  // 2. Metin arama (şarkı adı) yazıldığında YouTube / YouTube Music'te ara
  useEffect(() => {
    const trimmed = inputQuery.trim();
    if (!trimmed || isUrl) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let isCancelled = false;
    setIsSearching(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/youtube/search?q=${encodeURIComponent(trimmed)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && Array.isArray(data.results)) {
            setSearchResults(data.results);
          }
        }
      } catch {
        if (!isCancelled) setSearchResults([]);
      } finally {
        if (!isCancelled) setIsSearching(false);
      }
    }, 400);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [inputQuery, isUrl]);

  if (!isOpen) return null;

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputQuery(text.trim());
        setHasCopied(true);
        setTimeout(() => setHasCopied(false), 1500);
      }
    } catch {}
  };

  const handleStartUrl = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!conversationId || !inputQuery.trim()) return;

    const url = inputQuery.trim();
    const playlistId = extractYouTubePlaylistId(url);

    const meta: MediaMeta = previewMeta || {
      mediaType: playlistId
        ? "youtube_playlist"
        : isYouTubeMusicUrl(url)
        ? "youtube_music"
        : isYouTubeUrl(url)
        ? "youtube"
        : "audio",
      url,
      playlistId: playlistId || undefined,
      title: playlistId ? "YouTube Çalma Listesi" : "Müzik Parçası",
      artist: "Birlikte Dinle",
      thumbnail: "",
    };

    startSession(conversationId, meta);
    onClose();
  };

  const handleSelectSearchResult = (item: SearchResult) => {
    if (!conversationId) return;
    startSession(conversationId, {
      mediaType: "youtube_music",
      url: item.url,
      youtubeId: item.id,
      title: item.title,
      artist: item.artist,
      thumbnail: item.thumbnail,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl p-5 sm:p-6 flex flex-col gap-4 text-white animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {/* Üst Bar - Sade ve Gereksiz Yazılardan Arındırılmış */}
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-pink-600 to-rose-500 flex items-center justify-center shadow-lg shadow-pink-600/30">
              <Headphones className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-base font-bold text-white">Birlikte Dinle</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Link / Şarkı Arama Giriş Alanı */}
        <form onSubmit={handleStartUrl} className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Şarkı adı, YouTube linki veya Çalma Listesi:</span>
            <button
              type="button"
              onClick={handlePasteClipboard}
              className="text-[11px] text-pink-400 hover:text-pink-300 transition flex items-center gap-1 cursor-pointer"
            >
              {hasCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Clipboard className="w-3 h-3" />}
              <span>{hasCopied ? "Yapıştırıldı" : "Panodan Yapıştır"}</span>
            </button>
          </div>

          <div className="relative flex items-center">
            <div className="absolute left-3.5 text-slate-400 pointer-events-none">
              {isSearching || isLoadingMeta ? (
                <Loader2 className="w-4 h-4 animate-spin text-pink-400" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </div>
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Şarkı veya sanatçı adı yazın, ya da link yapıştırın..."
              className="w-full bg-slate-950 border border-slate-700/80 focus:border-pink-500 rounded-2xl pl-10 pr-20 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition shadow-inner"
              autoFocus
            />
            {isUrl && (
              <button
                type="submit"
                disabled={!inputQuery.trim()}
                className="absolute right-1.5 px-3.5 py-1.5 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition shadow-md cursor-pointer"
              >
                Başlat
              </button>
            )}
          </div>
        </form>

        {/* 1. URL Önizleme Kartı (Eğer Link Yapıştırıldıysa) */}
        {isUrl && previewMeta && (
          <div className="p-3 bg-slate-950 border border-slate-800/90 rounded-2xl flex items-center gap-3 shadow-lg animate-in fade-in">
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
                {previewMeta.mediaType === "youtube_playlist" ? (
                  <span className="px-1.5 py-0.5 rounded bg-amber-600/30 border border-amber-500/40 text-[9px] font-bold text-amber-300 flex items-center gap-1">
                    <ListMusic className="w-3 h-3" />
                    <span>Çalma Listesi ({previewMeta.trackCount || previewMeta.tracks?.length || "Liste"})</span>
                  </span>
                ) : previewMeta.mediaType === "youtube_music" ? (
                  <span className="px-1.5 py-0.5 rounded bg-red-600/30 border border-red-500/40 text-[9px] font-bold text-red-300">
                    YouTube Music
                  </span>
                ) : previewMeta.mediaType === "youtube" ? (
                  <span className="px-1.5 py-0.5 rounded bg-rose-600/30 border border-rose-500/40 text-[9px] font-bold text-rose-300">
                    YouTube
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-pink-600/30 border border-pink-500/40 text-[9px] font-bold text-pink-300">
                    Ses Dosyası
                  </span>
                )}
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <h4 className="text-xs font-bold text-white truncate">{previewMeta.title}</h4>
              <p className="text-[10px] text-slate-400 truncate">{previewMeta.artist}</p>
            </div>
          </div>
        )}

        {/* 1.1 Çalma Listesi İçindeki Şarkılar Listesi (Varsa) */}
        {isUrl && previewMeta?.tracks && previewMeta.tracks.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-slate-400">
              Çalma Listesindeki Parçalar ({previewMeta.tracks.length}):
            </span>
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
              {previewMeta.tracks.map((track, idx) => (
                <div
                  key={track.id + idx}
                  onClick={() => {
                    if (!conversationId) return;
                    startSession(conversationId, {
                      mediaType: "youtube_playlist",
                      url: inputQuery.trim(),
                      playlistId: previewMeta.playlistId,
                      youtubeId: track.id,
                      title: track.title,
                      artist: track.artist,
                      thumbnail: track.thumbnail,
                    });
                    onClose();
                  }}
                  className="p-2 rounded-2xl bg-slate-950/70 hover:bg-slate-800/90 border border-slate-800/80 hover:border-pink-500/40 flex items-center justify-between gap-3 cursor-pointer transition group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[10px] font-mono text-slate-500 w-4 text-right shrink-0">
                      {idx + 1}
                    </span>
                    <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={track.thumbnail}
                        alt={track.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <div className="min-w-0 flex flex-col">
                      <span className="text-xs font-semibold text-white group-hover:text-pink-300 transition truncate">
                        {track.title}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate">
                        {track.artist}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-xl bg-pink-600/30 group-hover:bg-pink-600 text-pink-300 group-hover:text-white border border-pink-500/40 text-[11px] font-bold transition flex items-center gap-1 shrink-0"
                  >
                    <Play className="w-3 h-3 fill-current ml-0.5" />
                    <span>Çal</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2. YouTube Music Canlı Arama Sonuçları (Doğrudan Şarkı İsmi Yazıldıysa) */}
        {!isUrl && inputQuery.trim() && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-slate-400">
              YouTube Music Arama Sonuçları:
            </span>

            {isSearching ? (
              <div className="flex items-center justify-center py-8 gap-2 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-pink-500" />
                <span>Müzikler aranıyor...</span>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
                {searchResults.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectSearchResult(item)}
                    className="p-2 rounded-2xl bg-slate-950/70 hover:bg-slate-800/90 border border-slate-800/80 hover:border-pink-500/40 flex items-center justify-between gap-3 cursor-pointer transition group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-white/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <span className="text-xs font-semibold text-white group-hover:text-pink-300 transition truncate">
                          {item.title}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 truncate">
                          <span>{item.artist}</span>
                          {item.duration && (
                            <>
                              <span>•</span>
                              <span>{item.duration}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="px-3 py-1 rounded-xl bg-pink-600/30 group-hover:bg-pink-600 text-pink-300 group-hover:text-white border border-pink-500/40 text-xs font-bold transition flex items-center gap-1 shrink-0"
                    >
                      <Play className="w-3 h-3 fill-current ml-0.5" />
                      <span>Çal</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-slate-500">
                Sonuç bulunamadı. Şarkı veya sanatçı adını değiştirmeyi deneyin.
              </div>
            )}
          </div>
        )}

        {/* 3. Boşken Hızlı Önerilenler */}
        {!inputQuery.trim() && (
          <div className="flex flex-col gap-2 pt-1">
            <span className="text-xs font-semibold text-slate-400">
              Hızlı Başlat (Popüler Akışlar & Listeler):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  setInputQuery(
                    "https://music.youtube.com/playlist?list=PL2fuh5iJAcBS3vNCW6hswGSNyaN1n283f"
                  )
                }
                className="p-2.5 rounded-2xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 hover:border-pink-500/40 text-left transition flex items-center justify-between cursor-pointer group"
              >
                <div className="min-w-0 flex-1">
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Çalma Listesi
                  </span>
                  <p className="text-xs font-semibold text-white group-hover:text-pink-300 transition truncate mt-1">
                    Chopin - Best of (Piano)
                  </p>
                </div>
                <div className="w-7 h-7 rounded-full bg-slate-800 group-hover:bg-pink-600 text-slate-400 group-hover:text-white flex items-center justify-center transition shrink-0 ml-2">
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => setInputQuery("https://www.youtube.com/watch?v=jfKfPfyJRdk")}
                className="p-2.5 rounded-2xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 hover:border-pink-500/40 text-left transition flex items-center justify-between cursor-pointer group"
              >
                <div className="min-w-0 flex-1">
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                    Lofi Beats
                  </span>
                  <p className="text-xs font-semibold text-white group-hover:text-pink-300 transition truncate mt-1">
                    Lofi Girl - Canlı Akış
                  </p>
                </div>
                <div className="w-7 h-7 rounded-full bg-slate-800 group-hover:bg-pink-600 text-slate-400 group-hover:text-white flex items-center justify-center transition shrink-0 ml-2">
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
