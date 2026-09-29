"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useStoryStore, StoryAuthor } from "@/store/useStoryStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useChatStore } from "@/store/useChatStore";
import { useSocketStore } from "@/store/useSocketStore";
import {
  X,
  Plus,
  Trash2,
  Eye,
  Music2,
  Volume2,
  VolumeX,
  Send,
  Pencil,
  Share2,
  Heart,
  Bookmark,
  ShieldAlert,
  Globe,
  Lock,
  MapPin,
  Smartphone,
  Clock,
} from "lucide-react";
import { formatStoryTime } from "@/lib/utils";
import { api, resolveMediaUrl } from "@/lib/api";
import { AddToHighlightModal } from "./StoryHighlightModal";
import {
  extractYouTubeVideoId,
  formatTimeSeconds,
  getTextStyleClasses,
  getTextSizeClasses,
} from "./StoryCreatorModal";

const parseSecurityStory = (caption?: string) => {
  if (!caption) return null;
  const lines = caption.split("\n");
  let targetUser = "";
  let ip = "";
  let location = "";
  let device = "";
  let time = "";
  const isFailedPassword = caption.includes("Hatalı Şifre") || caption.includes("Şüpheli Giriş") || caption.includes("Şüpheli Oturum");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes("Denenen:") || trimmed.includes("Kullanıcı:")) {
      const parts = trimmed.split(":");
      if (parts.length > 1) targetUser = parts.slice(1).join(":").trim();
    } else if (trimmed.includes("IP:")) {
      const parts = trimmed.split(":");
      if (parts.length > 1) ip = parts.slice(1).join(":").trim();
    } else if (trimmed.includes("Konum:")) {
      const parts = trimmed.split(":");
      if (parts.length > 1) location = parts.slice(1).join(":").trim();
    } else if (trimmed.includes("Cihaz:")) {
      const parts = trimmed.split(":");
      if (parts.length > 1) device = parts.slice(1).join(":").trim();
    } else if (trimmed.includes("Zaman:")) {
      const parts = trimmed.split(":");
      if (parts.length > 1) time = parts.slice(1).join(":").trim();
    }
  }

  if (!targetUser && !ip) return null;

  return { targetUser, ip, location, device, time, isFailedPassword };
};

export default function StoryViewerModal() {
  const { user } = useAuthStore();
  const {
    activeViewerGroup,
    activeViewerStoryIndex,
    closeViewer,
    openCreator,
    setViewerStoryIndex,
    markStoryViewed,
    deleteStory,
    getStoryViewers,
    storyGroups,
    openViewer,
  } = useStoryStore();

  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isMediaLoaded, setIsMediaLoaded] = useState(false);
  const [videoDurationMs, setVideoDurationMs] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [viewersModalOpen, setViewersModalOpen] = useState(false);
  const [viewersList, setViewersList] = useState<StoryAuthor[]>([]);
  const [replyText, setReplyText] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replyFeedback, setReplyFeedback] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [burstEmoji, setBurstEmoji] = useState<string | null>(null);
  const [isHighlightModalOpen, setIsHighlightModalOpen] = useState(false);

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);

  const currentStory = activeViewerGroup?.stories[activeViewerStoryIndex];
  const isOwnStory = activeViewerGroup?.user.id === user?.id;

  // Modalı güvenli kapat (Tarayıcı geçmişiyle senkronize)
  const handleSafeClose = useCallback(() => {
    if (typeof window !== "undefined" && window.history.state?.aura_story_viewer) {
      window.history.back();
    } else {
      closeViewer();
    }
  }, [closeViewer]);

  // Hikaye süresi: Video için gerçek video süresi varsa o (maksimum 60s), yoksa duration_seconds (varsayılan 10s)
  const storyDuration =
    currentStory?.media_type === "video" && videoDurationMs && videoDurationMs > 1000
      ? Math.min(60000, videoDurationMs)
      : ((currentStory?.duration_seconds && currentStory.duration_seconds > 0
          ? currentStory.duration_seconds
          : 10)) * 1000;

  const ytVideoId = currentStory?.music_url ? extractYouTubeVideoId(currentStory.music_url) : null;
  const hasMusic = Boolean(currentStory?.music_url || currentStory?.music_title || ytVideoId);
  const startSec = Math.max(0, currentStory?.music_start || 0);
  const storyDur = Math.max(5, Math.round(storyDuration / 1000));
  const endSec =
    currentStory?.music_end && currentStory.music_end > startSec
      ? currentStory.music_end
      : startSec + storyDur;

  // YouTube API postMessage komut gönderici (dizi argüman formatı)
  const sendYtCommand = useCallback((func: string, args: any[] = []) => {
    try {
      if (ytIframeRef.current?.contentWindow) {
        ytIframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: "command", func, args }),
          "*"
        );
      }
    } catch {}
  }, []);

  // Ses durumunu değiştir (Mute / Unmute)
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const nextMuted = !prev;
      sendYtCommand(nextMuted ? "mute" : "unMute", []);
      if (!nextMuted) {
        sendYtCommand("setVolume", [100]);
        sendYtCommand("playVideo", []);
      }
      return nextMuted;
    });
  }, [sendYtCommand]);

  // YouTube Iframe yüklendiğinde ve story açıldığında sesli otomatik başlatma
  const handleIframeLoad = useCallback(() => {
    sendYtCommand("setVolume", [100]);
    sendYtCommand(isMuted ? "mute" : "unMute", []);
    if (!isPaused) {
      sendYtCommand("playVideo", []);
    }

    const retries = [150, 400, 800, 1400];
    retries.forEach((delay) => {
      setTimeout(() => {
        sendYtCommand("setVolume", [100]);
        sendYtCommand(isMuted ? "mute" : "unMute", []);
        if (!isPaused) {
          sendYtCommand("playVideo", []);
        }
      }, delay);
    });
  }, [isMuted, isPaused, sendYtCommand]);

  // YouTube'un postMessage olaylarını dinle (onReady, stateChange)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "onReady" || data.info?.playerState === 1 || data.info?.playerState === -1) {
            sendYtCommand("setVolume", [100]);
            sendYtCommand(isMuted ? "mute" : "unMute", []);
            if (!isPaused) {
              sendYtCommand("playVideo", []);
            }
          }
        } catch {}
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [sendYtCommand, isMuted, isPaused]);

  // İleri git
  const handleNext = useCallback(() => {
    if (!activeViewerGroup) return;
    if (activeViewerStoryIndex < activeViewerGroup.stories.length - 1) {
      setViewerStoryIndex(activeViewerStoryIndex + 1);
      setProgress(0);
    } else {
      // Bir sonraki kullanıcının hikaye grubuna geç
      const currentIndex = storyGroups.findIndex(
        (g) => g.user.id === activeViewerGroup.user.id
      );
      if (currentIndex !== -1 && currentIndex < storyGroups.length - 1) {
        openViewer(storyGroups[currentIndex + 1], 0);
        setProgress(0);
      } else {
        handleSafeClose();
      }
    }
  }, [activeViewerGroup, activeViewerStoryIndex, storyGroups, setViewerStoryIndex, openViewer, handleSafeClose]);

  // Geri git
  const handlePrev = useCallback(() => {
    if (!activeViewerGroup) return;
    if (activeViewerStoryIndex > 0) {
      setViewerStoryIndex(activeViewerStoryIndex - 1);
      setProgress(0);
    } else {
      // Bir önceki kullanıcının hikayesine geç
      const currentIndex = storyGroups.findIndex(
        (g) => g.user.id === activeViewerGroup.user.id
      );
      if (currentIndex > 0) {
        const prevGroup = storyGroups[currentIndex - 1];
        openViewer(prevGroup, prevGroup.stories.length - 1);
        setProgress(0);
      }
    }
  }, [activeViewerGroup, activeViewerStoryIndex, storyGroups, setViewerStoryIndex, openViewer]);

  // Tarayıcı / Android Geri Butonu Yönetimi (popstate)
  useEffect(() => {
    if (!activeViewerGroup) return;

    window.history.pushState({ aura_story_viewer: true }, "");

    const handlePopState = () => {
      closeViewer();
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [activeViewerGroup, closeViewer]);

  // Klavye Kontrolleri (Escape, Sol/Sağ Ok, Boşluk, M)
  useEffect(() => {
    if (!activeViewerGroup) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      switch (e.key) {
        case "Escape":
          handleSafeClose();
          break;
        case "ArrowRight":
          handleNext();
          break;
        case "ArrowLeft":
          handlePrev();
          break;
        case " ":
          e.preventDefault();
          setIsPaused((prev) => !prev);
          break;
        case "m":
        case "M":
          toggleMute();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeViewerGroup, handleSafeClose, handleNext, handlePrev, toggleMute]);

  // Sonraki hikaye medyasını önceden yükle (Preload next story)
  useEffect(() => {
    if (!activeViewerGroup) return;
    let nextMediaUrl: string | null = null;
    let nextMediaType: string | null = null;

    if (activeViewerStoryIndex < activeViewerGroup.stories.length - 1) {
      const nextStory = activeViewerGroup.stories[activeViewerStoryIndex + 1];
      nextMediaUrl = nextStory.media_url;
      nextMediaType = nextStory.media_type;
    } else {
      const currentGroupIdx = storyGroups.findIndex(
        (g) => g.user.id === activeViewerGroup.user.id
      );
      if (currentGroupIdx !== -1 && currentGroupIdx < storyGroups.length - 1) {
        const nextGroup = storyGroups[currentGroupIdx + 1];
        if (nextGroup.stories.length > 0) {
          nextMediaUrl = nextGroup.stories[0].media_url;
          nextMediaType = nextGroup.stories[0].media_type;
        }
      }
    }

    if (nextMediaUrl) {
      const resolved = resolveMediaUrl(nextMediaUrl);
      if (nextMediaType === "image") {
        const img = new Image();
        img.src = resolved;
      } else if (nextMediaType === "video") {
        const dummyVideo = document.createElement("video");
        dummyVideo.preload = "auto";
        dummyVideo.src = resolved;
      }
    }
  }, [activeViewerGroup, activeViewerStoryIndex, storyGroups]);

  // Hikaye değiştiğinde state sıfırla
  useEffect(() => {
    setProgress(0);
    setIsBuffering(false);
    setVideoDurationMs(null);
    if (!currentStory) return;

    if (currentStory.media_type === "text" || currentStory.media_type === "audio") {
      setIsMediaLoaded(true);
    } else {
      setIsMediaLoaded(false);
    }
  }, [currentStory?.id, currentStory?.media_type]);

  // 1.5s aktif görüntüleme eşiği (Hemen geçilen hikayeler görüldü sayılmaz)
  useEffect(() => {
    if (!currentStory || isOwnStory || currentStory.has_viewed) return;
    const viewTimer = setTimeout(() => {
      markStoryViewed(currentStory.id);
    }, 1500);

    return () => clearTimeout(viewTimer);
  }, [currentStory?.id, isOwnStory, currentStory?.has_viewed, markStoryViewed]);

  // Video elementinin duraklatma ve oynatma senkronizasyonu
  useEffect(() => {
    if (videoRef.current) {
      if (isPaused || isBuffering || viewersModalOpen) {
        videoRef.current.pause();
      } else if (isMediaLoaded) {
        videoRef.current.play().catch(() => {});
      }
    }
  }, [isPaused, isBuffering, isMediaLoaded, viewersModalOpen]);

  // Otomatik ilerleme zamanlayıcısı (Medya yüklenmeden ve buffering varken durur)
  useEffect(() => {
    if (!currentStory || isPaused || viewersModalOpen || isBuffering || !isMediaLoaded) return;

    const interval = 50; // 50ms adım
    const step = (interval / storyDuration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          handleNext();
          return 0;
        }
        return prev + step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [currentStory, isPaused, viewersModalOpen, isBuffering, isMediaLoaded, storyDuration, handleNext]);

  // Normal HTML5 ses oynatma kontrolü (eğer YouTube değilse)
  useEffect(() => {
    if (!ytVideoId && currentStory?.music_url && audioRef.current) {
      if (isPaused || isBuffering || viewersModalOpen) {
        audioRef.current.pause();
      } else if (isMediaLoaded) {
        audioRef.current.play().catch(() => {});
      }
    }
  }, [currentStory, isPaused, isBuffering, isMediaLoaded, viewersModalOpen, ytVideoId]);

  // YouTube Iframe oynatma kontrolü (duraklat / devam et)
  useEffect(() => {
    if (ytVideoId) {
      sendYtCommand(isPaused || isBuffering || viewersModalOpen ? "pauseVideo" : "playVideo", []);
    }
  }, [isPaused, isBuffering, viewersModalOpen, ytVideoId, sendYtCommand]);

  // YouTube Iframe sessize alma kontrolü
  useEffect(() => {
    if (ytVideoId) {
      sendYtCommand(isMuted ? "mute" : "unMute", []);
    }
  }, [isMuted, ytVideoId, sendYtCommand]);

  if (!activeViewerGroup || !currentStory) return null;

  // Hikaye silme
  const handleDelete = async () => {
    if (confirm("Bu hikayeyi silmek istediğinizden emin misiniz?")) {
      await deleteStory(currentStory.id);
    }
  };

  // İzleyenler modalını aç
  const handleOpenViewers = async () => {
    setIsPaused(true);
    const viewers = await getStoryViewers(currentStory.id);
    setViewersList(viewers);
    setViewersModalOpen(true);
  };

  // Hikayeye mesajla yanıt ver
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || isSendingReply) return;

    setIsSendingReply(true);
    try {
      // 1. Karşı tarafla konuşmayı bul veya oluştur
      const convRes = await api.post("/conversations", {
        recipient_id: activeViewerGroup.user.id,
      });
      const conversationId = convRes.data.id;

      // 2. Mesaj metnini hazırla
      const storyContext = `📸 [Hikaye Yanıtı]: ${currentStory.caption || "Hikaye"}\n${replyText.trim()}`;

      // 3. Tek bir kanal üzerinden mesaj gönder (WebSocket bağlıysa soketten, değilse HTTP Fallback - ASLA ikisi birden değil)
      const isSocketConnected = useSocketStore.getState().isConnected;
      if (isSocketConnected) {
        useChatStore.getState().sendMessage(conversationId, storyContext);
      } else {
        await api.post(`/conversations/${conversationId}/messages`, {
          content: storyContext,
          message_type: "text",
        });
      }

      // 4. Konuşma listesini arka planda tazele
      useChatStore.getState().loadConversations();

      setReplyText("");
      setReplyFeedback("Yanıtınız mesaj olarak iletildi! ✨");
      setTimeout(() => setReplyFeedback(null), 3000);
    } catch (err) {
      console.error("Yanıt gönderilemedi:", err);
      setReplyFeedback("Yanıt iletilemedi.");
      setTimeout(() => setReplyFeedback(null), 3000);
    } finally {
      setIsSendingReply(false);
    }
  };

  // Dokunmatik ve Fare Sürükleme Hareketleri (Aşağı kaydırarak kapatma & Yatay geçiş)
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    touchStartRef.current = { x: clientX, y: clientY, time: Date.now() };
    setIsPaused(true);
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!touchStartRef.current) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const deltaY = clientY - touchStartRef.current.y;
    const deltaX = clientX - touchStartRef.current.x;

    // Aşağı sürükleme (Swipe-down to close)
    if (deltaY > 10 && deltaY > Math.abs(deltaX)) {
      setIsDragging(true);
      setDragOffset(deltaY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent | React.MouseEvent) => {
    if (!viewersModalOpen) {
      setIsPaused(false);
    }
    if (!touchStartRef.current) {
      setDragOffset(0);
      setIsDragging(false);
      return;
    }

    const clientX = "changedTouches" in e ? e.changedTouches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "changedTouches" in e ? e.changedTouches[0].clientY : (e as React.MouseEvent).clientY;
    const deltaY = clientY - touchStartRef.current.y;
    const deltaX = clientX - touchStartRef.current.x;
    const deltaTime = Date.now() - touchStartRef.current.time;

    // Aşağı kaydırarak kapatma eşiği (100px veya hızlı çekiş)
    if (isDragging) {
      if (deltaY > 100 || (deltaY > 50 && deltaTime < 250)) {
        handleSafeClose();
      }
      setDragOffset(0);
      setIsDragging(false);
      touchStartRef.current = null;
      return;
    }

    // Yatay kaydırma ile kullanıcı hikaye grupları arası geçiş
    if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0) {
        // Sola kaydır -> Sonraki kullanıcı grubu
        const currentIndex = storyGroups.findIndex(
          (g) => g.user.id === activeViewerGroup?.user.id
        );
        if (currentIndex !== -1 && currentIndex < storyGroups.length - 1) {
          openViewer(storyGroups[currentIndex + 1], 0);
        } else {
          handleSafeClose();
        }
      } else {
        // Sağa kaydır -> Önceki kullanıcı grubu
        const currentIndex = storyGroups.findIndex(
          (g) => g.user.id === activeViewerGroup?.user.id
        );
        if (currentIndex > 0) {
          const prevGroup = storyGroups[currentIndex - 1];
          openViewer(prevGroup, 0);
        }
      }
    }

    touchStartRef.current = null;
    setDragOffset(0);
    setIsDragging(false);
  };

  // Instagram Tarzı Hızlı Emoji Tepkisi
  const handleQuickReaction = async (emoji: string) => {
    if (!currentStory || !activeViewerGroup) return;
    setBurstEmoji(emoji);
    setTimeout(() => setBurstEmoji(null), 1800);

    try {
      // 1. Hikaye tepkisi API'si
      await useStoryStore.getState().sendReaction(currentStory.id, emoji);

      // 2. DM sohbetine zengin hikaye yanıtı
      const convRes = await api.post("/conversations", {
        recipient_id: activeViewerGroup.user.id,
      });
      const conversationId = convRes.data.id;
      const reactionContext = `📸 [Hikaye Tepkisi]: ${emoji}`;

      const isSocketConnected = useSocketStore.getState().isConnected;
      if (isSocketConnected) {
        useChatStore.getState().sendMessage(conversationId, reactionContext);
      } else {
        await api.post(`/conversations/${conversationId}/messages`, {
          content: reactionContext,
          message_type: "text",
        });
      }
      setReplyFeedback(`${emoji} Tepkiniz gönderildi!`);
      setTimeout(() => setReplyFeedback(null), 2500);
    } catch (err) {
      console.error("Tepki gönderilemedi:", err);
    }
  };

  // Hikayeyi Paylaş (Web Share API & Pano Kopyalama)
  const handleShareStory = async () => {
    if (!currentStory) return;
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Aura Hikayesi",
          text: currentStory.caption || "Aura'da paylaşılan hikayeye göz atın!",
          url: shareUrl,
        });
      } catch (err) {
        // Kullanıcı iptal etti
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setReplyFeedback("Bağlantı kopyalandı! 📋");
        setTimeout(() => setReplyFeedback(null), 2500);
      } catch {
        setReplyFeedback("Bağlantı kopyalanamadı.");
        setTimeout(() => setReplyFeedback(null), 2500);
      }
    }
  };

  const resolvedMediaUrl = resolveMediaUrl(currentStory.media_url);

  // Müzik rozetinin kaydedilmiş koordinatları
  const musicBadgeSticker = Array.isArray(currentStory.stickers)
    ? currentStory.stickers.find((s: any) => s.type === "music_badge")
    : null;
  const badgeX = musicBadgeSticker?.x ?? 30;
  const badgeY = musicBadgeSticker?.y ?? 15;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hikaye Görüntüleyici"
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center select-none animate-in fade-in duration-200"
    >
      {/* HİKAYE KARTI KAPSAYICISI (9:16 Mobil Oranı & Safe Area) */}
      <div
        className="relative w-full max-w-md h-[100dvh] sm:h-[88vh] sm:max-h-[820px] bg-slate-950 sm:rounded-3xl overflow-hidden flex flex-col justify-between shadow-2xl border border-slate-800 pt-[calc(env(safe-area-inset-top)+6px)] pb-[calc(env(safe-area-inset-bottom)+8px)] touch-none"
        style={{
          transform: dragOffset > 0 ? `translateY(${dragOffset}px) scale(${Math.max(0.88, 1 - dragOffset / 1200)})` : undefined,
          opacity: dragOffset > 0 ? Math.max(0.4, 1 - dragOffset / 450) : 1,
          transition: isDragging ? "none" : "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease",
        }}
        onMouseDown={handleTouchStart}
        onMouseMove={handleTouchMove}
        onMouseUp={handleTouchEnd}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Yüzen Tepki Patlaması (Emoji Burst) */}
        {burstEmoji && (
          <div className="absolute inset-0 pointer-events-none z-40 flex items-center justify-center">
            <div className="text-7xl animate-bounce drop-shadow-[0_12px_24px_rgba(0,0,0,0.9)] duration-500 scale-125 transition-transform">
              {burstEmoji}
            </div>
          </div>
        )}

        {/* 1. ÜST BAR: Progress Barlar & Yazar Bilgisi */}
        <div className="absolute top-0 inset-x-0 z-30 p-3 sm:p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          {/* Çoklu Parçalı Progress Barlar */}
          <div className="flex items-center gap-1.5 mb-3">
            {activeViewerGroup.stories.map((story, idx) => {
              let fillPercent = 0;
              if (idx < activeViewerStoryIndex) fillPercent = 100;
              else if (idx === activeViewerStoryIndex) fillPercent = progress;

              return (
                <div
                  key={story.id}
                  className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden"
                >
                  <div
                    className="h-full bg-white transition-all duration-75 rounded-full"
                    style={{ width: `${fillPercent}%` }}
                  />
                </div>
              );
            })}
          </div>

          {/* Yazar Bilgisi ve Aksiyon Butonları */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-slate-800 overflow-hidden border border-white/40 flex items-center justify-center font-bold text-xs text-pink-400">
                {activeViewerGroup.user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveMediaUrl(activeViewerGroup.user.avatar_url)}
                    alt={activeViewerGroup.user.display_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  activeViewerGroup.user.display_name.charAt(0).toUpperCase()
                )}
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white drop-shadow-md">
                    {activeViewerGroup.user.display_name}
                  </span>
                  {currentStory.audience === "close_friends" && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950 font-bold flex items-center gap-0.5 shadow-sm">
                      <span>★</span>
                      <span>Yakın Arkadaşlar</span>
                    </span>
                  )}
                  {isOwnStory && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-pink-500/80 text-white font-semibold">
                      Sen
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-white/70">
                  <span>{formatStoryTime(currentStory.created_at)}</span>
                  <span>•</span>
                  <span>{Math.round(storyDuration / 1000)}s</span>
                </div>
              </div>
            </div>

            {/* Sağ Üst Kontroller (Ses Aç/Kapat, Düzenle, Ekle, Öne Çıkar, Sil, Kapat) */}
            <div className="flex items-center gap-1.5">
              {/* SES AÇMA / KAPAMA BUTONU */}
              {(hasMusic || currentStory.media_type === "video") && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMute();
                  }}
                  title={isMuted ? "Sesi Aç" : "Sesi Kapat"}
                  className="p-2 text-white hover:text-pink-400 rounded-full bg-black/40 hover:bg-black/60 border border-white/20 transition-all cursor-pointer"
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" />
                  )}
                </button>
              )}

              {isOwnStory && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSafeClose();
                      openCreator(currentStory);
                    }}
                    title="Hikayeyi Düzenle (Süre, Müzik, Yazı)"
                    className="p-2 text-white/80 hover:text-amber-400 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSafeClose();
                      openCreator();
                    }}
                    title="Yeni Hikaye Ekle"
                    className="p-2 text-white/80 hover:text-pink-400 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPaused(true);
                      setIsHighlightModalOpen(true);
                    }}
                    title="Öne Çıkanlara Ekle"
                    className="p-2 text-white/80 hover:text-pink-400 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <Bookmark className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete();
                    }}
                    title="Hikayeyi Sil"
                    className="p-2 text-white/80 hover:text-rose-400 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSafeClose();
                }}
                className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* 2. MERKEZ MEDYA ALANI */}
        <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden">
          {/* Yükleniyor / Ara Belleğe Alınıyor (Buffering) Göstergesi */}
          {(!isMediaLoaded || isBuffering) && currentStory.media_type !== "text" && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-xs pointer-events-none animate-in fade-in duration-150">
              <div className="w-9 h-9 rounded-full border-2 border-pink-500/30 border-t-pink-500 animate-spin" />
              <span className="text-[11px] text-white/80 font-medium mt-2 drop-shadow">Yükleniyor...</span>
            </div>
          )}

          {/* Görsel Hikaye */}
          {currentStory.media_type === "image" && resolvedMediaUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolvedMediaUrl}
              alt="Story"
              onLoad={() => {
                setIsMediaLoaded(true);
                setIsBuffering(false);
              }}
              onError={() => {
                setIsMediaLoaded(true);
                setIsBuffering(false);
              }}
              className="w-full h-full object-contain pointer-events-none"
            />
          )}

          {/* Video Hikaye */}
          {currentStory.media_type === "video" && resolvedMediaUrl && (
            <video
              ref={videoRef}
              src={resolvedMediaUrl}
              autoPlay
              playsInline
              muted={isMuted}
              onLoadedMetadata={(e) => {
                const dur = e.currentTarget.duration;
                if (dur && !isNaN(dur) && dur > 0) {
                  setVideoDurationMs(Math.round(dur * 1000));
                }
              }}
              onCanPlay={() => {
                setIsBuffering(false);
                setIsMediaLoaded(true);
              }}
              onWaiting={() => setIsBuffering(true)}
              onStalled={() => setIsBuffering(true)}
              onPlaying={() => setIsBuffering(false)}
              onEnded={() => handleNext()}
              className="w-full h-full object-contain pointer-events-none"
            />
          )}

          {/* Metin veya Ses Hikayesi (Renkli Gradient Arka Plan) */}
          {(currentStory.media_type === "text" || currentStory.media_type === "audio" || (!resolvedMediaUrl && currentStory.caption)) && (() => {
            const isSecurityStory =
              Boolean(currentStory.caption?.includes("GÜVENLİK ALARMI")) ||
              activeViewerGroup?.user?.username === "security";
            const secInfo = isSecurityStory ? parseSecurityStory(currentStory.caption) : null;

            return (
              <div
                className={`w-full h-full bg-gradient-to-br ${
                  currentStory.background_color || (isSecurityStory ? "from-red-950 via-slate-950 to-black" : "from-pink-900 to-slate-950")
                } flex flex-col items-center justify-center p-4 sm:p-8 text-center`}
              >
                {currentStory.media_type === "audio" && (
                  <div className="w-24 h-24 rounded-full bg-black/40 border-2 border-pink-500/60 flex items-center justify-center mb-6 shadow-2xl animate-spin duration-7000">
                    <Music2 className="w-10 h-10 text-pink-400" />
                  </div>
                )}

                {secInfo ? (
                  <div className="w-full max-w-[340px] sm:max-w-sm mx-auto p-4 sm:p-5 rounded-3xl bg-slate-950/90 border border-red-500/40 shadow-2xl shadow-red-950/70 backdrop-blur-xl animate-in zoom-in-95 duration-200 text-left select-none">
                    {/* Kart Başlığı */}
                    <div className="flex items-center gap-3 pb-3 border-b border-red-500/20 mb-3">
                      <div className="w-10 h-10 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0 shadow-lg shadow-red-950/50">
                        <ShieldAlert className="w-5 h-5 animate-pulse" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                            Aura Tehdit Kalkanı
                          </span>
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                        </div>
                        <h4 className="text-xs sm:text-sm font-bold text-white tracking-tight mt-0.5 truncate">
                          {secInfo.isFailedPassword ? "Şüpheli Giriş Engellendi" : "Yetkisiz Giriş Teşebbüsü"}
                        </h4>
                      </div>
                    </div>

                    {/* Detay Tablosu */}
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/70 border border-white/5 gap-2">
                        <span className="text-[11px] text-slate-400 flex items-center gap-1.5 shrink-0">
                          <Lock className="w-3.5 h-3.5 text-purple-400" /> Hedef Hesap:
                        </span>
                        <span className="font-mono font-bold text-white text-[11px] truncate">
                          {secInfo.targetUser || "@bilinmeyen"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/70 border border-white/5 gap-2">
                        <span className="text-[11px] text-slate-400 flex items-center gap-1.5 shrink-0">
                          <Globe className="w-3.5 h-3.5 text-red-400" /> Gerçek IP:
                        </span>
                        <span className="font-mono font-bold text-red-300 text-[11px] px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20">
                          {secInfo.ip || "—"}
                        </span>
                      </div>

                      {secInfo.location && (
                        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/70 border border-white/5 gap-2">
                          <span className="text-[11px] text-slate-400 flex items-center gap-1.5 shrink-0">
                            <MapPin className="w-3.5 h-3.5 text-emerald-400" /> Konum:
                          </span>
                          <span className="font-medium text-emerald-300 text-[11px] truncate max-w-[170px] text-right">
                            {secInfo.location}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/70 border border-white/5 gap-2">
                        <span className="text-[11px] text-slate-400 flex items-center gap-1.5 shrink-0">
                          <Smartphone className="w-3.5 h-3.5 text-blue-400" /> Cihaz / Tarayıcı:
                        </span>
                        <span className="text-slate-300 text-[11px] truncate max-w-[170px] text-right" title={secInfo.device}>
                          {secInfo.device || "Bilinmeyen Cihaz"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/70 border border-white/5 gap-2">
                        <span className="text-[11px] text-slate-400 flex items-center gap-1.5 shrink-0">
                          <Clock className="w-3.5 h-3.5 text-amber-400" /> Tespit Saati:
                        </span>
                        <span className="font-mono text-slate-300 text-[11px]">
                          {secInfo.time || "Şimdi"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-xl bg-red-950/30 border border-red-500/20 gap-2">
                        <span className="text-[11px] text-red-300 flex items-center gap-1.5 shrink-0">
                          <span>🛡️</span> Sistem Aksiyonu:
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                          Engellendi & Kaydedildi
                        </span>
                      </div>
                    </div>

                    {/* Alt Kalkan Bilgilendirmesi */}
                    <div className="mt-3 pt-2 border-t border-red-500/15 text-[10px] text-slate-400 text-center flex items-center justify-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Aura Tehdit Kalkanı 7/24 Devrede</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xl sm:text-2xl font-bold text-white drop-shadow-lg leading-relaxed max-w-sm">
                    {currentStory.caption}
                  </p>
                )}
              </div>
            );
          })()}

          {/* SÜRÜKLENMİŞ ÇIKARTMALAR (Metin Yazıları, Emojiler) */}
          {Array.isArray(currentStory.stickers) &&
            currentStory.stickers.map((st, i) => {
              if (st.type === "emoji" && st.emoji) {
                return (
                  <div
                    key={`st-emoji-${i}`}
                    style={{
                      left: `${st.x ?? 50}%`,
                      top: `${st.y ?? 50}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                    className="absolute z-20 pointer-events-none select-none text-5xl sm:text-6xl drop-shadow-[0_8px_16px_rgba(0,0,0,0.8)]"
                  >
                    {st.emoji}
                  </div>
                );
              }

              if (st.type === "text" && st.text) {
                return (
                  <div
                    key={`st-text-${i}`}
                    style={{
                      left: `${st.x ?? 50}%`,
                      top: `${st.y ?? 50}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                    className={`absolute z-20 max-w-[85%] text-center px-4 py-2 rounded-2xl break-words whitespace-pre-wrap pointer-events-none select-none transition-all ${getTextStyleClasses(
                      st.style
                    )} ${getTextSizeClasses(st.fontSize)}`}
                  >
                    {st.text}
                  </div>
                );
              }

              return null;
            })}

          {/* SÜRÜKLENMİŞ YOUTUBE MUSIC ROZETİ */}
          {(currentStory.music_title || ytVideoId) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleMute();
              }}
              style={{
                left: `${badgeX}%`,
                top: `${badgeY}%`,
                transform: "translate(-50%, -50%)",
              }}
              title="Müziği Aç / Kapat"
              className="absolute z-20 flex items-center gap-2 bg-black/80 hover:bg-black/95 backdrop-blur-md border border-white/20 rounded-full px-3 py-1.5 shadow-xl text-white transition-all cursor-pointer group"
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0 transition-all ${
                  isMuted ? "bg-slate-700" : "bg-rose-600 animate-pulse shadow-md"
                }`}
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-300" /> : <Volume2 className="w-3.5 h-3.5 text-white" />}
              </div>
              <div className="text-left pr-1 min-w-0 max-w-[200px]">
                <div className="text-[11px] font-bold truncate">
                  {currentStory.music_title && !currentStory.music_title.startsWith("http")
                    ? currentStory.music_title
                    : "YouTube Music"}
                </div>
                <div className="text-[9px] text-white/70 truncate flex items-center gap-1.5">
                  <span>
                    {currentStory.music_artist && !currentStory.music_artist.startsWith("http")
                      ? currentStory.music_artist
                      : "Müzik"}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-emerald-400" />
                  <span className="text-[8px] text-emerald-400 font-mono">
                    {formatTimeSeconds(startSec)} - {formatTimeSeconds(endSec)}
                  </span>
                </div>
              </div>
            </button>
          )}

          {/* YOUTUBE GÖMÜLÜ SES OYNATICI (CANLI ŞARKI ÇALMA) */}
          {ytVideoId && (
            <iframe
              ref={ytIframeRef}
              key={`yt-story-${currentStory.id}-${ytVideoId}`}
              src={`https://www.youtube.com/embed/${ytVideoId}?autoplay=1&mute=0&start=${startSec}&end=${endSec}&enablejsapi=1&controls=0&playsinline=1&modestbranding=1&origin=${
                typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : ""
              }`}
              allow="autoplay *; encrypted-media *; fullscreen *"
              onLoad={handleIframeLoad}
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: "1px",
                height: "1px",
                opacity: 0.01,
                pointerEvents: "none",
                zIndex: 0,
              }}
              title="YouTube Story Audio"
            />
          )}

          {/* STANDART SES DOSYASI OYNATICI (YOUTUBE DEĞİLSE) */}
          {!ytVideoId && currentStory.music_url && (
            <audio
              ref={audioRef}
              src={resolveMediaUrl(currentStory.music_url)}
              autoPlay
              loop
              muted={isMuted}
            />
          )}

          {/* SOL & SAĞ DOKUNMA/TIKLAMA NAVİGASYONU */}
          <div
            className="absolute inset-y-0 left-0 w-1/3 z-10 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
          />
          <div
            className="absolute inset-y-0 right-0 w-1/3 z-10 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
          />
        </div>

        {/* 3. ALT ALAN: Altyazı, İzleyenler & Yanıt Gönderme */}
        <div
          className={`relative z-30 p-3.5 sm:p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col gap-2 transition-opacity duration-200 ${
            viewersModalOpen ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          {/* Görsel/Video Hikayesi için Altyazı */}
          {(currentStory.media_type === "image" || currentStory.media_type === "video") &&
            currentStory.caption && (
              <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-2.5 text-center text-xs text-white drop-shadow-md">
                {currentStory.caption}
              </div>
            )}

          {/* Sahibi ise: İzleyenler Butonu */}
          {isOwnStory ? (
            <button
              onClick={handleOpenViewers}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/15 text-white text-xs font-semibold transition-all cursor-pointer"
            >
              <Eye className="w-4 h-4 text-emerald-400" />
              <span>
                {currentStory.views_count > 0
                  ? `${currentStory.views_count} Kişi Gördü`
                  : "Henüz kimse görmedi"}
              </span>
            </button>
          ) : (
            /* Başkası ise: Hızlı Tepkiler ve Hikayeye Yanıt Gönder Kutusu */
            <div className="flex flex-col gap-2 w-full">
              {replyFeedback && (
                <div className="self-center bg-emerald-600/90 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
                  {replyFeedback}
                </div>
              )}

              {/* Instagram Tarzı Hızlı Emoji Tepkileri */}
              <div className="flex items-center justify-around py-1 px-2 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10">
                {["❤️", "😂", "🔥", "😮", "😢", "👏"].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuickReaction(emoji);
                    }}
                    className="text-xl hover:scale-135 active:scale-95 transition-transform p-1 cursor-pointer"
                    title={`${emoji} Tepki Ver`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Yanıt Gönderme Formu */}
              <form onSubmit={handleSendReply} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={replyText}
                  onFocus={() => setIsPaused(true)}
                  onBlur={() => !viewersModalOpen && setIsPaused(false)}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Hikayeye yanıt ver..."
                  className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-3.5 py-2 text-xs text-white placeholder-white/60 backdrop-blur-md focus:outline-none focus:border-pink-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim() || isSendingReply}
                  className="p-2 rounded-2xl bg-pink-500 hover:bg-pink-400 disabled:opacity-40 text-white transition-all cursor-pointer flex-shrink-0"
                  title="Yanıt Gönder"
                >
                  <Send className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShareStory();
                  }}
                  className="p-2 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-all cursor-pointer flex-shrink-0"
                  title="Hikayeyi Paylaş"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}
        </div>

        {/* İzleyenler alt çekmecesi */}
        {viewersModalOpen && (
          <div className="absolute inset-0 z-50 flex flex-col justify-end">
            <div
              onClick={(e) => {
                e.stopPropagation();
                setViewersModalOpen(false);
                setIsPaused(false);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
            />

            <div
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 w-full bg-slate-900/98 backdrop-blur-xl border-t border-slate-700/80 rounded-t-3xl p-5 flex flex-col max-h-[75%] shadow-2xl animate-in slide-in-from-bottom duration-300"
            >
              <div
                onClick={() => {
                  setViewersModalOpen(false);
                  setIsPaused(false);
                }}
                className="w-12 h-1 bg-slate-600 rounded-full mx-auto mb-3.5 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
              />

              <div className="flex items-center justify-between pb-3 border-b border-slate-800 flex-shrink-0">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Eye className="w-4 h-4 text-emerald-400" />
                  <span>Görüntüleyenler ({viewersList.length})</span>
                </div>
                <button
                  onClick={() => {
                    setViewersModalOpen(false);
                    setIsPaused(false);
                  }}
                  className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Kapat"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 py-2 min-h-0">
                {viewersList.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Henüz kimse bu hikayeyi görmedi.
                  </div>
                ) : (
                  viewersList.map((viewer) => (
                    <div key={viewer.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden border border-slate-700 flex items-center justify-center font-bold text-xs text-pink-400 flex-shrink-0">
                          {viewer.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolveMediaUrl(viewer.avatar_url)}
                              alt={viewer.display_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            viewer.display_name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {viewer.display_name}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            @{viewer.username}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium flex-shrink-0 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <Eye className="w-3 h-3" />
                        <span>{viewer.viewed_at ? formatStoryTime(viewer.viewed_at) : "Gördü"}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {isHighlightModalOpen && currentStory && (
          <AddToHighlightModal
            isOpen={isHighlightModalOpen}
            onClose={() => {
              setIsHighlightModalOpen(false);
              setIsPaused(false);
            }}
            story={currentStory}
          />
        )}
      </div>
    </div>
  );
}
