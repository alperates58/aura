"use client";

import React, { useState } from "react";
import {
  Play,
  Pause,
  X,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
  RotateCcw,
  RotateCw,
  Video,
  VideoOff,
  Music,
  ExternalLink,
  Radio,
  Sparkles,
} from "lucide-react";
import { useListenTogetherStore } from "@/store/useListenTogetherStore";

interface Props {
  otherUserName?: string;
  onOpenChooser?: () => void;
}

function formatTime(sec: number): string {
  if (!sec || isNaN(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export default function ListenTogetherIsland({ otherUserName, onOpenChooser }: Props) {
  const {
    session,
    isPlaying,
    currentTime,
    duration,
    isMuted,
    volume,
    isIslandExpanded,
    showVideo,
    togglePlay,
    seekTo,
    toggleMute,
    setVolume,
    toggleIslandExpanded,
    toggleShowVideo,
    stopSession,
  } = useListenTogetherStore((state) => ({
    session: state.session,
    isPlaying: state.session?.isPlaying ?? false,
    currentTime: state.session?.currentTime ?? 0,
    duration: state.session?.duration ?? 0,
    isMuted: state.session?.isMuted ?? false,
    volume: state.session?.volume ?? 80,
    isIslandExpanded: state.isIslandExpanded,
    showVideo: state.showVideo,
    togglePlay: state.togglePlay,
    seekTo: state.seekTo,
    toggleMute: state.toggleMute,
    setVolume: state.setVolume,
    toggleIslandExpanded: state.toggleIslandExpanded,
    toggleShowVideo: state.toggleShowVideo,
    stopSession: state.stopSession,
  }));

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);

  if (!session) return null;

  const isYouTube = session.mediaType === "youtube" || session.mediaType === "youtube_music";
  const isMusic = session.mediaType === "youtube_music";
  const percent = duration > 0 ? ((isScrubbing ? scrubValue : currentTime) / duration) * 100 : 0;

  return (
    <aside
      aria-label="Birlikte Dinle Canlı Müzik Adası"
      className="absolute top-2 sm:top-2.5 left-1/2 -translate-x-1/2 z-30 w-auto max-w-[94%] sm:max-w-md transition-all duration-300 pointer-events-auto"
    >
      {/* 1. KOMPAKT DİNAMİK ADA (PILL / HAP GÖRÜNÜMÜ) */}
      {!isIslandExpanded ? (
        <div
          onClick={toggleIslandExpanded}
          className="group relative flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-slate-950/85 hover:bg-slate-950/95 backdrop-blur-2xl border border-white/10 hover:border-pink-500/40 shadow-[0_8px_30px_rgb(0,0,0,0.65)] hover:shadow-[0_0_20px_rgba(236,72,153,0.25)] transition-all cursor-pointer select-none text-white animate-in fade-in slide-in-from-top-3 duration-200"
        >
          {/* Sol: Dönen Mini Vinil Kapak */}
          <div className="relative w-7 h-7 rounded-full overflow-hidden border border-white/20 shrink-0 bg-slate-800 shadow-md">
            {session.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.thumbnail}
                alt="Albüm Kapağı"
                className={`w-full h-full object-cover ${
                  isPlaying ? "animate-[spin_6s_linear_infinite]" : ""
                }`}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-pink-600 to-indigo-600">
                <Music className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            {/* Ortadaki Vinil Deliği */}
            <div className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-slate-950 border border-white/30" />
          </div>

          {/* Ritmik Ses Dalgaları (Equalizer bars) */}
          <div className="flex items-center gap-0.5 h-3 shrink-0">
            <span
              className={`w-0.5 rounded-full bg-pink-400 transition-all ${
                isPlaying ? "h-3 animate-pulse" : "h-1"
              }`}
            />
            <span
              className={`w-0.5 rounded-full bg-rose-400 transition-all delay-75 ${
                isPlaying ? "h-2.5 animate-pulse" : "h-1"
              }`}
            />
            <span
              className={`w-0.5 rounded-full bg-amber-400 transition-all delay-150 ${
                isPlaying ? "h-3.5 animate-pulse" : "h-1"
              }`}
            />
            <span
              className={`w-0.5 rounded-full bg-emerald-400 transition-all delay-200 ${
                isPlaying ? "h-2 animate-pulse" : "h-1"
              }`}
            />
          </div>

          {/* Başlık & Sanatçı */}
          <div className="flex flex-col min-w-0 max-w-[130px] sm:max-w-[190px]">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-white truncate leading-tight">
                {session.title}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[9px] text-slate-400 truncate">
              {isMusic ? (
                <span className="text-red-400 font-bold shrink-0">YT Music</span>
              ) : isYouTube ? (
                <span className="text-rose-400 font-bold shrink-0">YouTube</span>
              ) : (
                <span className="text-pink-400 font-bold shrink-0">Ses Akışı</span>
              )}
              <span>•</span>
              <span className="truncate">{session.artist}</span>
            </div>
          </div>

          {/* Hızlı Oynat / Durdur Butonu */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            title={isPlaying ? "Durdur" : "Oynat"}
            className="w-7 h-7 rounded-full bg-pink-600 hover:bg-pink-500 text-white flex items-center justify-center transition shadow-md hover:scale-105 shrink-0 cursor-pointer ml-0.5"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-white" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
            )}
          </button>

          {/* Genişlet İkonu */}
          <div className="text-slate-400 group-hover:text-white transition pl-0.5 shrink-0">
            <ChevronDown className="w-3.5 h-3.5" />
          </div>

          {/* Kapat / Ayrıl Butonu */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              stopSession();
            }}
            title="Birlikte Dinlemeyi Kapat"
            className="p-1 rounded-full text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition shrink-0 cursor-pointer -mr-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        /* 2. GENİŞLETİLMİŞ DİNAMİK ADA KARTI (EXPANDED CARD) */
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-[330px] sm:w-[380px] rounded-3xl p-4 bg-slate-950/95 backdrop-blur-3xl border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.85)] text-white flex flex-col gap-3.5 select-none animate-in zoom-in-95 duration-200"
        >
          {/* Üst Bilgi & Kapat Barı */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[11px] font-bold text-emerald-400 tracking-wide">
                Canlı Senkronize
              </span>
              {otherUserName && (
                <span className="text-[11px] text-slate-400 truncate max-w-[120px]">
                  • {otherUserName} ile
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleIslandExpanded}
                title="Adaya Küçült"
                className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={stopSession}
                title="Oturumu Sonlandır"
                className="p-1 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Orta Kısım: Albüm Kapağı & Şarkı Bilgisi */}
          <div className="flex items-center gap-3.5">
            <div className="relative w-14 h-14 rounded-2xl overflow-hidden border border-white/15 shrink-0 bg-slate-900 shadow-xl group">
              {session.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.thumbnail}
                  alt={session.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-600 via-rose-600 to-indigo-700">
                  <Music className="w-7 h-7 text-white" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 flex flex-col">
              <h4 className="text-xs sm:text-sm font-bold text-white truncate leading-snug">
                {session.title}
              </h4>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">{session.artist}</p>
              <div className="flex items-center gap-1.5 mt-1">
                {isMusic ? (
                  <span className="px-1.5 py-0.5 rounded-md bg-red-600/30 border border-red-500/40 text-[9px] font-bold text-red-300">
                    YouTube Music
                  </span>
                ) : isYouTube ? (
                  <span className="px-1.5 py-0.5 rounded-md bg-rose-600/30 border border-rose-500/40 text-[9px] font-bold text-rose-300">
                    YouTube Video
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-md bg-pink-600/30 border border-pink-500/40 text-[9px] font-bold text-pink-300">
                    Radyo / Ses
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* İlerleme Çubuğu (Scrubber / Timeline) */}
          <div className="flex flex-col gap-1 pt-1">
            <div className="relative w-full flex items-center">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.5}
                value={isScrubbing ? scrubValue : currentTime}
                onMouseDown={() => setIsScrubbing(true)}
                onTouchStart={() => setIsScrubbing(true)}
                onChange={(e) => setScrubValue(parseFloat(e.target.value))}
                onMouseUp={(e) => {
                  setIsScrubbing(false);
                  seekTo(parseFloat((e.target as HTMLInputElement).value));
                }}
                onTouchEnd={(e) => {
                  setIsScrubbing(false);
                  seekTo(parseFloat((e.target as HTMLInputElement).value));
                }}
                className="w-full accent-pink-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>{formatTime(isScrubbing ? scrubValue : currentTime)}</span>
              <span>{duration > 0 ? formatTime(duration) : "--:--"}</span>
            </div>
          </div>

          {/* Ana Kontroller (Geri 10s, Oynat/Durdur, İleri 10s, Ses, Video) */}
          <div className="flex items-center justify-between pt-1">
            {/* Sol: Sessize Alma ve Ses Düzeyi */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMute}
                title={isMuted ? "Sesi Aç" : "Sesi Kapat"}
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolume(parseInt(e.target.value, 10))}
                className="w-16 accent-pink-500 cursor-pointer h-1 bg-slate-800 rounded-lg hidden sm:block"
                title="Ses Düzeyi"
              />
            </div>

            {/* Merkez: 10s Geri, Büyük Oynat/Durdur, 10s İleri */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => seekTo(Math.max(0, currentTime - 10))}
                title="10 saniye geri sar"
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={togglePlay}
                title={isPlaying ? "Durdur" : "Oynat"}
                className="w-12 h-12 rounded-full bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white flex items-center justify-center transition shadow-lg shadow-pink-600/35 hover:scale-105 cursor-pointer"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-white" />
                ) : (
                  <Play className="w-5 h-5 fill-white ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => seekTo(Math.min(duration || Infinity, currentTime + 10))}
                title="10 saniye ileri sar"
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>

            {/* Sağ: Video Toggle (Eğer YouTube ise) veya Değiştir Butonu */}
            <div className="flex items-center gap-1">
              {isYouTube && (
                <button
                  type="button"
                  onClick={toggleShowVideo}
                  title={showVideo ? "Videoyu Gizle" : "Videoyu Göster (PiP)"}
                  className={`p-2 rounded-xl transition cursor-pointer ${
                    showVideo
                      ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                      : "bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  {showVideo ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>

          {/* Alt Kısım: "Parçayı Değiştir" / Yeni Link Girişi Butonu */}
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-400">Başka bir müzik mi dinleyeceksiniz?</span>
            <button
              type="button"
              onClick={() => {
                if (onOpenChooser) onOpenChooser();
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-pink-500/50 text-pink-300 hover:text-pink-200 font-semibold transition cursor-pointer flex items-center gap-1.5"
            >
              <Sparkles className="w-3 h-3 text-pink-400" />
              <span>Değiştir</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
