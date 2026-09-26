"use client";

import React, { useEffect, useRef } from "react";
import { useListenTogetherStore } from "@/store/useListenTogetherStore";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

let isYtScriptLoading = false;
let isYtReady = false;
const ytReadyCallbacks: Array<() => void> = [];

function loadYouTubeApi(onReady: () => void) {
  if (typeof window === "undefined") return;
  if (window.YT && window.YT.Player) {
    onReady();
    return;
  }

  ytReadyCallbacks.push(onReady);

  if (!isYtScriptLoading) {
    isYtScriptLoading = true;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      isYtReady = true;
      while (ytReadyCallbacks.length > 0) {
        const cb = ytReadyCallbacks.shift();
        cb?.();
      }
    };
  }
}

export default function ListenTogetherController() {
  const session = useListenTogetherStore((state) => state.session);
  const syncTrigger = useListenTogetherStore((state) => state.syncTrigger);
  const setCurrentTime = useListenTogetherStore((state) => state.setCurrentTime);
  const setDuration = useListenTogetherStore((state) => state.setDuration);
  const play = useListenTogetherStore((state) => state.play);
  const pause = useListenTogetherStore((state) => state.pause);
  const showVideo = useListenTogetherStore((state) => state.showVideo);

  const ytPlayerRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isInternalUpdateRef = useRef(false);
  const currentVideoIdRef = useRef<string | null>(null);

  const mediaType = session?.mediaType;
  const isYouTube = mediaType === "youtube" || mediaType === "youtube_music";
  const youtubeId = session?.youtubeId;
  const isPlaying = session?.isPlaying ?? false;
  const isMuted = session?.isMuted ?? false;
  const volume = session?.volume ?? 80;

  // 1. YouTube Oynatıcı Başlatma ve Yönetimi
  useEffect(() => {
    if (!isYouTube || !youtubeId) {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.stopVideo();
        } catch {}
      }
      return;
    }

    loadYouTubeApi(() => {
      const container = document.getElementById("yt-player-element");
      if (!container) return;

      if (!ytPlayerRef.current) {
        currentVideoIdRef.current = youtubeId;
        ytPlayerRef.current = new window.YT.Player("yt-player-element", {
          height: "100%",
          width: "100%",
          videoId: youtubeId,
          playerVars: {
            autoplay: isPlaying ? 1 : 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            origin: typeof window !== "undefined" ? window.location.origin : "",
          },
          events: {
            onReady: (event: any) => {
              if (isMuted) {
                event.target.mute();
              } else {
                event.target.unMute();
                event.target.setVolume(volume);
              }

              if (session?.currentTime && session.currentTime > 0) {
                event.target.seekTo(session.currentTime, true);
              }
              if (isPlaying) {
                event.target.playVideo();
              }
              const dur = event.target.getDuration();
              if (dur) setDuration(dur);
            },
            onStateChange: (event: any) => {
              // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
              if (isInternalUpdateRef.current) return;
              if (event.data === 1 && !useListenTogetherStore.getState().session?.isPlaying) {
                play();
              } else if (event.data === 2 && useListenTogetherStore.getState().session?.isPlaying) {
                pause();
              }
            },
          },
        });
      } else {
        // Video değiştiyse yükle
        if (currentVideoIdRef.current !== youtubeId) {
          currentVideoIdRef.current = youtubeId;
          try {
            ytPlayerRef.current.loadVideoById({
              videoId: youtubeId,
              startSeconds: session?.currentTime || 0,
            });
            if (isPlaying) {
              ytPlayerRef.current.playVideo();
            }
          } catch {}
        }
      }
    });
  }, [isYouTube, youtubeId]);

  // 2. Senkronizasyon Tetikleyicisi (Play / Pause / Seek / Start / Stop)
  useEffect(() => {
    if (!syncTrigger) return;
    const { type, time } = syncTrigger;

    isInternalUpdateRef.current = true;

    if (isYouTube && ytPlayerRef.current) {
      try {
        const player = ytPlayerRef.current;
        if (type === "play") {
          player.playVideo();
        } else if (type === "pause") {
          player.pauseVideo();
        } else if (type === "seek") {
          player.seekTo(time, true);
        } else if (type === "start") {
          if (youtubeId && currentVideoIdRef.current !== youtubeId) {
            currentVideoIdRef.current = youtubeId;
            player.loadVideoById(youtubeId, time);
          } else {
            player.seekTo(time, true);
            player.playVideo();
          }
        } else if (type === "stop") {
          player.stopVideo();
        }
      } catch {}
    } else if (!isYouTube && audioRef.current) {
      const audio = audioRef.current;
      if (type === "play") {
        audio.play().catch(() => {});
      } else if (type === "pause") {
        audio.pause();
      } else if (type === "seek") {
        audio.currentTime = time;
      } else if (type === "start") {
        audio.currentTime = time;
        audio.play().catch(() => {});
      } else if (type === "stop") {
        audio.pause();
        audio.currentTime = 0;
      }
    }

    const timer = setTimeout(() => {
      isInternalUpdateRef.current = false;
    }, 500);

    return () => clearTimeout(timer);
  }, [syncTrigger, isYouTube, youtubeId]);

  // 3. Ses ve Sessize Alma (Volume / Mute)
  useEffect(() => {
    if (isYouTube && ytPlayerRef.current) {
      try {
        if (isMuted) {
          ytPlayerRef.current.mute();
        } else {
          ytPlayerRef.current.unMute();
          ytPlayerRef.current.setVolume(volume);
        }
      } catch {}
    } else if (audioRef.current) {
      audioRef.current.muted = isMuted;
      audioRef.current.volume = volume / 100;
    }
  }, [isMuted, volume, isYouTube]);

  // 4. Periyodik Zaman Güncelleme & Drift Önleme
  useEffect(() => {
    if (!session || !isPlaying) return;

    const interval = setInterval(() => {
      if (isYouTube && ytPlayerRef.current) {
        try {
          const cur = ytPlayerRef.current.getCurrentTime();
          const dur = ytPlayerRef.current.getDuration();
          if (typeof cur === "number" && !isNaN(cur)) {
            setCurrentTime(cur);
          }
          if (typeof dur === "number" && !isNaN(dur) && dur > 0) {
            setDuration(dur);
          }
        } catch {}
      } else if (!isYouTube && audioRef.current) {
        const audio = audioRef.current;
        setCurrentTime(audio.currentTime);
        if (audio.duration && !isNaN(audio.duration)) {
          setDuration(audio.duration);
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isPlaying, isYouTube, Boolean(session)]);

  if (!session) return null;

  return (
    <>
      {/* Doğrudan Ses (MP3/WAV/AAC/Radyo) Oynatıcı */}
      {!isYouTube && (
        <audio
          ref={audioRef}
          src={session.url}
          autoPlay={isPlaying}
          onLoadedMetadata={() => {
            if (audioRef.current) {
              setDuration(audioRef.current.duration || 0);
            }
          }}
          onEnded={() => {
            useListenTogetherStore.getState().pause();
          }}
        />
      )}

      {/* YouTube IFrame Konteyneri */}
      {/* Video kapalıyken arka planda 1x1 piksel kesintisiz çalar, video açılınca Floating PiP olarak görünür */}
      <div
        className={
          showVideo && isYouTube
            ? "fixed top-20 right-4 sm:right-8 z-40 w-64 sm:w-80 aspect-video rounded-2xl overflow-hidden border border-white/20 shadow-2xl bg-black animate-in zoom-in-95 duration-200"
            : "fixed -top-[9999px] -left-[9999px] w-1 h-1 opacity-0 pointer-events-none"
        }
      >
        <div id="yt-player-element" className="w-full h-full" />
      </div>
    </>
  );
}
