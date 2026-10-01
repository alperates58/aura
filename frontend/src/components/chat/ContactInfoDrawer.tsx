"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  ChevronLeft,
  X,
  Phone,
  Video,
  Search,
  Headphones,
  ImageIcon,
  HardDrive,
  Star,
  FileText,
  Link as LinkIcon,
  Eraser,
  ShieldAlert,
  ShieldCheck,
  Play,
  Pause,
  Download,
  Trash2,
  Sparkles,
  Music,
  ArrowRight,
  Key,
  Palette,
  Globe,
  Youtube,
  ExternalLink,
} from "lucide-react";
import { Conversation, Message } from "@/store/useChatStore";
import { User } from "@/store/useAuthStore";
import { api, resolveMediaUrl } from "@/lib/api";
import { formatLastSeen, formatMessageTime } from "@/lib/utils";
import { HighlightsBar } from "@/components/story/StoryHighlightModal";
import MediaGalleryModal, { GalleryMediaItem } from "@/components/chat/MediaGalleryModal";

interface Props {
  activeConv: Conversation;
  messages: Message[];
  currentUser: User | null;
  hasOtherStory?: boolean;
  hasOtherUnviewed?: boolean;
  isOtherCloseFriends?: boolean;
  otherUserStoryGroup?: any;
  onClose: () => void;
  onStartCall: (type: "audio" | "video") => void;
  onOpenListenTogether?: () => void;
  onOpenSearch: () => void;
  onOpenSafetyNumber?: () => void;
  onOpenStory?: (storyGroup: any) => void;
  onPreviewMedia?: (media: { url: string; type: "video" | "image"; name?: string }) => void;
  onOpenGalleryAtIndex?: (index: number) => void;
  onBlockToggle: () => Promise<void>;
  onClearChat: () => void;
  onDeleteChat?: () => void;
  onJumpToMessage?: (messageId: string) => void;
  onToggleStarMessage?: (messageId: string) => Promise<void>;
}

type DrawerView = "main" | "media_links_docs" | "storage" | "starred";
type MediaTab = "media" | "voices" | "links" | "docs";

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

interface LinkMetadata {
  url: string;
  title: string;
  description: string;
  image: string;
  site_name: string;
}

const previewCache = new Map<string, LinkMetadata>();
const ytMetaCache = new Map<string, { title: string; author: string }>();

function parseYouTubeUrl(url: string) {
  const ytMusicRegex = /https?:\/\/music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/i;
  const ytRegex = /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
  const isMusic = ytMusicRegex.test(url);
  const match = url.match(ytMusicRegex) || url.match(ytRegex);
  return {
    isYouTube: !!match,
    isMusic,
    videoId: match ? match[1] : null,
  };
}

function formatBytes(bytes: number, decimals = 1) {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function getMonthYearHeader(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(d);
  } catch {
    return "Bilinmeyen Tarih";
  }
}

// Mini Audio Player for Voice Notes tab
function VoiceItemPlayer({
  audioUrl,
  duration,
  isMine,
}: {
  audioUrl: string;
  duration?: number;
  isMine: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSec, setCurrentSec] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const finalUrl = resolveMediaUrl(audioUrl);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
        setCurrentSec(Math.floor(audio.currentTime));
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentSec(0);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const formatSec = (s: number) => {
    const m = Math.floor(s / 60);
    const rem = Math.floor(s % 60);
    return `${m}:${rem < 10 ? "0" : ""}${rem}`;
  };

  return (
    <div className="flex items-center gap-3 w-full">
      <audio ref={audioRef} src={finalUrl} preload="none" />
      <button
        type="button"
        onClick={togglePlay}
        style={{
          backgroundColor: "var(--accent-shadow, rgba(233, 30, 99, 0.2))",
          color: "var(--accent, #E91E63)",
        }}
        className="w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer flex-shrink-0 hover:scale-105"
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>

      {/* Progress Bar & Durations */}
      <div className="flex-1 min-w-0">
        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-grupo-accent rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1 font-mono">
          <span>{isPlaying ? formatSec(currentSec) : "0:00"}</span>
          <span>{duration ? formatSec(duration) : audioRef.current?.duration ? formatSec(audioRef.current.duration) : "Ses"}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// YouTube & YouTube Music Özel Kartı (Önizleme, Sanatçı/Şarkı & Oynat)
// ─────────────────────────────────────────────────────────────
function DrawerYouTubeCard({
  url,
  videoId,
  isMusic,
  messageId,
  originalTitle,
  onJumpToMessage,
  onClose,
}: {
  url: string;
  videoId: string;
  isMusic: boolean;
  messageId: string;
  originalTitle: string;
  onJumpToMessage?: (messageId: string) => void;
  onClose: () => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [meta, setMeta] = useState<{ title: string; author: string } | null>(() => ytMetaCache.get(videoId) || null);

  useEffect(() => {
    if (ytMetaCache.has(videoId)) return;
    let isMounted = true;
    fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.title) {
          const item = { title: data.title, author: data.author_name || "" };
          ytMetaCache.set(videoId, item);
          setMeta(item);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [url, videoId]);

  const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const displayTitle = meta?.title || originalTitle;
  const artistName = meta?.author || (isMusic ? "YouTube Music Sanatçısı" : "YouTube Kanalı");

  return (
    <div className="p-3 bg-slate-900/90 rounded-2xl border border-white/10 space-y-2.5 overflow-hidden transition-all hover:border-grupo-accent/40 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center text-white shadow-sm">
            {isMusic ? <Music className="w-3 h-3" /> : <Youtube className="w-3 h-3" />}
          </div>
          <span className="text-[11px] font-bold text-red-400">
            {isMusic ? "YouTube Music" : "YouTube"}
          </span>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px] font-medium transition-colors"
        >
          <span>Aç</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {isPlaying ? (
        <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black shadow-inner">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
            title="YouTube Player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full border-0"
          />
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div
            onClick={() => setIsPlaying(true)}
            className="relative w-20 h-16 rounded-xl overflow-hidden bg-black flex-shrink-0 cursor-pointer group shadow-sm"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbUrl}
              alt="Thumbnail"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform opacity-85 group-hover:opacity-100"
            />
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 flex items-center justify-center transition-colors">
              <div className="w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-bold text-white line-clamp-2 leading-snug">
              {displayTitle}
            </h4>
            <p className="text-[11px] text-slate-400 truncate mt-0.5 font-medium">
              {artistName}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px]">
        <button
          type="button"
          onClick={() => setIsPlaying(!isPlaying)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-600/15 hover:bg-red-600/25 text-red-400 font-bold transition-colors cursor-pointer"
        >
          {isPlaying ? (
            <>
              <Pause className="w-3 h-3 fill-current" />
              <span>Durdur</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 fill-current ml-0.5" />
              <span>Hemen Çal</span>
            </>
          )}
        </button>

        {onJumpToMessage && (
          <button
            type="button"
            onClick={() => {
              onJumpToMessage(messageId);
              onClose();
            }}
            className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors cursor-pointer font-medium"
          >
            <span>Sohbette Göster</span>
            <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Standart Web Bağlantıları Önizleme Kartı (OpenGraph)
// ─────────────────────────────────────────────────────────────
function DrawerWebLinkCard({
  url,
  domain,
  messageId,
  fallbackTitle,
  onJumpToMessage,
  onClose,
}: {
  url: string;
  domain: string;
  messageId: string;
  fallbackTitle: string;
  onJumpToMessage?: (messageId: string) => void;
  onClose: () => void;
}) {
  const [meta, setMeta] = useState<LinkMetadata | null>(() => previewCache.get(url) || null);

  useEffect(() => {
    if (previewCache.has(url)) return;
    let isMounted = true;
    api
      .post<LinkMetadata>("/media/link-preview", { url }, { timeout: 6000 })
      .then((res) => {
        if (!isMounted) return;
        if (res.data && (res.data.title || res.data.description || res.data.image)) {
          previewCache.set(url, res.data);
          setMeta(res.data);
        }
      })
      .catch(() => {})
      .finally(() => {});

    return () => {
      isMounted = false;
    };
  }, [url]);

  const displayTitle = meta?.title || fallbackTitle;
  const displayImage = meta?.image;

  return (
    <div className="p-3 bg-slate-900/90 rounded-2xl border border-white/10 space-y-2 overflow-hidden transition-all hover:border-grupo-accent/40 shadow-sm">
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5 text-grupo-accent font-medium truncate max-w-[200px]">
          <Globe className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{meta?.site_name || domain}</span>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-400 hover:text-white flex items-center gap-1 transition-colors flex-shrink-0"
        >
          <span>Aç</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="flex items-start gap-3">
        {displayImage && (
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-950 flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayImage}
              alt="Önizleme"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-slate-200 hover:text-grupo-accent line-clamp-2 leading-snug transition-colors"
          >
            {displayTitle}
          </a>
          {meta?.description && (
            <p className="text-[10px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">
              {meta.description}
            </p>
          )}
        </div>
      </div>

      {onJumpToMessage && (
        <div className="flex justify-end pt-1 border-t border-white/5">
          <button
            type="button"
            onClick={() => {
              onJumpToMessage(messageId);
              onClose();
            }}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors cursor-pointer font-medium"
          >
            <span>Sohbette Göster</span>
            <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function ContactInfoDrawer({
  activeConv,
  messages,
  currentUser,
  hasOtherStory,
  hasOtherUnviewed,
  isOtherCloseFriends,
  otherUserStoryGroup,
  onClose,
  onStartCall,
  onOpenListenTogether,
  onOpenSearch,
  onOpenSafetyNumber,
  onOpenStory,
  onPreviewMedia,
  onBlockToggle,
  onClearChat,
  onDeleteChat,
  onJumpToMessage,
  onToggleStarMessage,
}: Props) {
  const [currentView, setCurrentView] = useState<DrawerView>("main");
  const [mediaTab, setMediaTab] = useState<MediaTab>("media");
  const [isBlocking, setIsBlocking] = useState(false);
  const [drawerGalleryIndex, setDrawerGalleryIndex] = useState<number | null>(null);

  // Veritabanındaki tüm konuşma medyalarını sunucudan dinamik yükleme
  const [serverAssets, setServerAssets] = useState<Message[]>([]);
  const [, setLoadingAssets] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!activeConv?.id) return;
    setLoadingAssets(true);
    api
      .get<Message[]>(`/conversations/${activeConv.id}/media`)
      .then((res) => {
        if (isMounted && res.data) {
          setServerAssets(res.data);
        }
      })
      .catch((err) => {
        console.error("Konuşma medyaları yüklenirken hata:", err);
      })
      .finally(() => {
        if (isMounted) setLoadingAssets(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeConv?.id]);

  // Hem bellekteki canlı mesajları hem de sunucudan çekilen tüm arşivi birleştir
  const allMessages = useMemo(() => {
    const map = new Map<string, Message>();
    serverAssets.forEach((m) => map.set(m.id, m));
    messages.forEach((m) => map.set(m.id, m));
    return Array.from(map.values());
  }, [serverAssets, messages]);

  // 1. Paylaşılan Medyalar (Fotoğraf, Video & Çizimler)
  const mediaItems = useMemo(() => {
    return allMessages.filter(
      (m) =>
        !m.is_deleted_for_all &&
        m.media_url &&
        (m.message_type === "image" ||
          m.message_type === "video" ||
          m.message_type === "doodle" ||
          /\.(mp4|mov|webm|m4v|mkv|avi|3gp|png|jpg|jpeg|webp|gif)($|\?)/i.test(m.media_url || ""))
    );
  }, [allMessages]);

  // Drawer için tam donanımlı Galeri Formatı
  const drawerGalleryItems = useMemo<GalleryMediaItem[]>(() => {
    return mediaItems.map((m) => {
      const isVid =
        m.message_type === "video" ||
        /\.(mp4|mov|webm|m4v|mkv|avi|3gp)($|\?)/i.test(m.media_url || "");
      const isMine = m.sender_id === currentUser?.id || m.is_mine;
      return {
        id: m.id,
        url: resolveMediaUrl(m.media_url),
        type: (isVid ? "video" : "image") as "image" | "video",
        name: m.media_metadata?.file_name,
        caption: m.content,
        senderName: isMine ? "Sen" : activeConv?.other_user.display_name,
        sentAt: m.sent_at || m.created_at,
      };
    });
  }, [mediaItems, currentUser?.id, activeConv?.other_user.display_name]);

  // 2. Paylaşılan Ses Kayıtları (Voice Notes)
  const voiceItems = useMemo(() => {
    return allMessages.filter(
      (m) =>
        !m.is_deleted_for_all &&
        m.media_url &&
        (m.message_type === "voice" ||
          /\.(webm|mp3|ogg|wav|m4a|aac)($|\?)/i.test(m.media_url || ""))
    );
  }, [allMessages]);

  // 3. Paylaşılan Belgeler
  const docItems = useMemo(() => {
    return allMessages.filter(
      (m) =>
        !m.is_deleted_for_all &&
        (m.message_type === "file" ||
          (m.media_url &&
            /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar|tar|gz|7z|apk|exe|csv)($|\?)/i.test(
              m.media_url || ""
            )))
    );
  }, [allMessages]);

  // 4. Paylaşılan Bağlantılar (Mesaj içerisindeki URL'ler)
  const linkItems = useMemo(() => {
    const list: {
      messageId: string;
      url: string;
      title: string;
      domain: string;
      createdAt: string;
      content: string;
    }[] = [];

    allMessages.forEach((m) => {
      if (m.is_deleted_for_all || !m.content) return;
      const matches = m.content.match(URL_REGEX);
      if (matches) {
        matches.forEach((rawUrl) => {
          const u = rawUrl.replace(/[.,;:!?]+$/, "");
          let domain = "";
          try {
            domain = new URL(u).hostname.replace(/^www\./, "");
          } catch {
            domain = u;
          }
          list.push({
            messageId: m.id,
            url: u,
            title: m.content.length > 80 ? m.content.slice(0, 80) + "..." : m.content,
            domain,
            createdAt: m.created_at,
            content: m.content,
          });
        });
      }
    });

    return list;
  }, [allMessages]);

  // 5. Yıldızlı Mesajlar (Bu sohbete ait)
  const starredItems = useMemo(() => {
    return allMessages.filter((m) => m.is_starred && !m.is_deleted_for_all);
  }, [allMessages]);

  // 6. Depolama İstatistikleri
  const storageStats = useMemo(() => {
    let photosSize = 0;
    let photosCount = 0;
    let videosSize = 0;
    let videosCount = 0;
    let docsSize = 0;
    let docsCount = 0;
    let audioSize = 0;
    let audioCount = 0;

    allMessages.forEach((m) => {
      if (m.is_deleted_for_all) return;
      const size = m.media_metadata?.file_size || (m.media_url ? 150 * 1024 : 0);

      if (
        m.message_type === "image" ||
        m.message_type === "doodle" ||
        /\.(png|jpg|jpeg|webp|gif)($|\?)/i.test(m.media_url || "")
      ) {
        photosSize += size;
        photosCount++;
      } else if (
        m.message_type === "video" ||
        /\.(mp4|mov|webm|m4v|mkv|avi|3gp)($|\?)/i.test(m.media_url || "")
      ) {
        videosSize += size;
        videosCount++;
      } else if (
        m.message_type === "file" ||
        /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar|7z)($|\?)/i.test(m.media_url || "")
      ) {
        docsSize += size;
        docsCount++;
      } else if (
        m.message_type === "voice" ||
        /\.(webm|mp3|ogg|wav|m4a|aac)($|\?)/i.test(m.media_url || "")
      ) {
        audioSize += size;
        audioCount++;
      }
    });

    const totalBytes = photosSize + videosSize + docsSize + audioSize;

    return {
      totalBytes,
      totalFormatted: formatBytes(totalBytes),
      photosSize,
      photosCount,
      videosSize,
      videosCount,
      docsSize,
      docsCount,
      audioSize,
      audioCount,
    };
  }, [allMessages]);

  // Medya / Ses / Bağlantı / Belge toplam sayısı
  const totalMediaLinksDocsCount =
    mediaItems.length + voiceItems.length + linkItems.length + docItems.length;

  // Belgeler aylık grup
  const groupedDocs = useMemo(() => {
    const map = new Map<string, Message[]>();
    docItems.forEach((item) => {
      const groupKey = getMonthYearHeader(item.created_at);
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey)!.push(item);
    });
    return Array.from(map.entries());
  }, [docItems]);

  // Bağlantılar aylık grup
  const groupedLinks = useMemo(() => {
    const map = new Map<string, typeof linkItems>();
    linkItems.forEach((item) => {
      const groupKey = getMonthYearHeader(item.createdAt);
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey)!.push(item);
    });
    return Array.from(map.entries());
  }, [linkItems]);

  // Ses kayıtları aylık grup
  const groupedVoices = useMemo(() => {
    const map = new Map<string, Message[]>();
    voiceItems.forEach((item) => {
      const groupKey = getMonthYearHeader(item.created_at);
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey)!.push(item);
    });
    return Array.from(map.entries());
  }, [voiceItems]);

  return (
    <aside className="fixed inset-y-0 right-0 w-full sm:w-[380px] bg-grupo-dark-bg border-l border-grupo-dark-border z-40 shadow-2xl flex flex-col select-none overflow-hidden animate-in slide-in-from-right duration-200">
      {/* ─────────────────────────────────────────────────────────────
          1. ANA GÖRÜNÜM: KİŞİ BİLGİSİ (AURA TEMA UYUMLU)
      ────────────────────────────────────────────────────────────── */}
      {currentView === "main" && (
        <div className="flex-1 flex flex-col h-full overflow-y-auto custom-scrollbar">
          {/* Üst Bar */}
          <div className="sticky top-0 z-20 bg-grupo-dark-card/95 backdrop-blur-md px-3.5 sm:px-4 h-14 border-b border-grupo-dark-border flex items-center justify-between">
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 flex items-center justify-center transition-all cursor-pointer shadow-xs"
              title="Geri"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-sm font-bold text-white tracking-wide">Kişi Bilgisi</h2>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 flex items-center justify-center transition-all cursor-pointer shadow-xs"
              title="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Profil Alanı */}
          <div className="pt-6 pb-3 px-4 flex flex-col items-center text-center">
            {/* Büyük Dairesel Avatar */}
            <div
              onClick={() => {
                if (hasOtherStory && onOpenStory) {
                  onOpenStory(otherUserStoryGroup);
                } else if (activeConv.other_user.avatar_url && onPreviewMedia) {
                  onPreviewMedia({
                    url: resolveMediaUrl(activeConv.other_user.avatar_url),
                    type: "image",
                    name: activeConv.other_user.display_name,
                  });
                }
              }}
              className={`relative mb-3 flex flex-col items-center ${
                hasOtherStory || activeConv.other_user.avatar_url
                  ? "cursor-pointer group/avatar"
                  : ""
              }`}
            >
              <div
                className={`w-24 h-24 rounded-full flex items-center justify-center transition-transform group-hover/avatar:scale-105 shadow-2xl ${
                  hasOtherStory
                    ? `p-[3px] ${
                        hasOtherUnviewed
                          ? isOtherCloseFriends
                            ? "bg-gradient-to-tr from-emerald-500 via-green-400 to-teal-400 ring-4 ring-emerald-500/25 animate-pulse"
                            : "bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-400 ring-4 ring-pink-500/20"
                          : isOtherCloseFriends
                          ? "border-2 border-emerald-500/70"
                          : "border-2 border-slate-700"
                      }`
                    : "border-2 border-grupo-dark-border bg-grupo-dark-card"
                }`}
              >
                <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center font-bold text-3xl text-grupo-accent overflow-hidden">
                  {activeConv.other_user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveMediaUrl(activeConv.other_user.avatar_url)}
                      alt={activeConv.other_user.display_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    activeConv.other_user.display_name.charAt(0).toUpperCase()
                  )}
                </div>
              </div>

              {/* Hikaye Durum Butonu (Varsa) */}
              {hasOtherStory && (
                <div
                  className={`mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all group-hover/avatar:scale-105 shadow-md ${
                    hasOtherUnviewed
                      ? isOtherCloseFriends
                        ? "bg-emerald-500 text-slate-950 font-bold"
                        : "bg-gradient-to-r from-pink-500 via-rose-500 to-amber-400 text-white font-bold"
                      : isOtherCloseFriends
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-grupo-dark-card text-slate-300 border border-slate-700"
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{hasOtherUnviewed ? "Hikayeyi İzle" : "Hikayeyi Gör"}</span>
                </div>
              )}
            </div>

            {/* İsim ve Kullanıcı Adı */}
            <h3 className="text-xl font-bold text-white tracking-tight">
              {activeConv.other_user.display_name}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">@{activeConv.other_user.username}</p>

            {/* Çevrimiçi / Son Görülme Rozeti */}
            <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-grupo-dark-card border border-grupo-dark-border">
              <span
                className={`w-2 h-2 rounded-full ${
                  activeConv.is_online ? "bg-emerald-500" : "bg-slate-500"
                }`}
              />
              <span className={activeConv.is_online ? "text-emerald-400 font-medium" : "text-slate-400"}>
                {activeConv.is_online
                  ? "Çevrimiçi"
                  : formatLastSeen(
                      activeConv.other_user.last_seen_at,
                      activeConv.other_user.privacy_settings?.last_seen
                    ) || "Çevrimdışı"}
              </span>
            </div>
          </div>

          {/* Aura Özel: Öne Çıkanlar (Story Highlights) Albüm Barı */}
          <div className="px-4 py-1">
            <HighlightsBar
              userId={activeConv.other_user.id}
              isOwnProfile={activeConv.other_user.id === currentUser?.id}
            />
          </div>

          {/* 4'lü Hızlı Eylem Butonları (Sesli, Görüntülü, Birlikte Dinle, Ara) */}
          <div className="px-4 py-2">
            <div className="grid grid-cols-4 gap-2">
              {/* 1. Sesli Arama */}
              <button
                onClick={() => onStartCall("audio")}
                className="flex flex-col items-center justify-center gap-1.5 py-2.5 px-1 rounded-2xl bg-grupo-dark-card hover:bg-slate-800/80 border border-grupo-dark-border text-white transition-all cursor-pointer group shadow-sm"
              >
                <div className="w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Phone className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-semibold text-slate-200">Sesli</span>
              </button>

              {/* 2. Görüntülü Arama */}
              <button
                onClick={() => onStartCall("video")}
                className="flex flex-col items-center justify-center gap-1.5 py-2.5 px-1 rounded-2xl bg-grupo-dark-card hover:bg-slate-800/80 border border-grupo-dark-border text-white transition-all cursor-pointer group shadow-sm"
              >
                <div className="w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Video className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-semibold text-slate-200">Görüntülü</span>
              </button>

              {/* 3. Aura Özel: Birlikte Dinle */}
              <button
                onClick={() => {
                  onClose();
                  if (onOpenListenTogether) onOpenListenTogether();
                }}
                className="flex flex-col items-center justify-center gap-1.5 py-2.5 px-1 rounded-2xl bg-grupo-dark-card hover:bg-slate-800/80 border border-grupo-dark-border text-white transition-all cursor-pointer group shadow-sm"
              >
                <div
                  style={{
                    backgroundColor: "var(--accent-shadow, rgba(233, 30, 99, 0.15))",
                    color: "var(--accent, #E91E63)",
                  }}
                  className="w-8 h-8 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform"
                >
                  <Headphones className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-semibold text-slate-200">Dinle</span>
              </button>

              {/* 4. Sohbet İçi Ara */}
              <button
                onClick={() => {
                  onClose();
                  onOpenSearch();
                }}
                className="flex flex-col items-center justify-center gap-1.5 py-2.5 px-1 rounded-2xl bg-grupo-dark-card hover:bg-slate-800/80 border border-grupo-dark-border text-white transition-all cursor-pointer group shadow-sm"
              >
                <div className="w-8 h-8 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Search className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-semibold text-slate-200">Ara</span>
              </button>
            </div>
          </div>

          {/* 1. GRUP KARTI: Medya, Depolama ve Yıldızlı */}
          <div className="p-4 space-y-3">
            <div className="bg-grupo-dark-card rounded-2xl border border-grupo-dark-border divide-y divide-grupo-dark-border overflow-hidden shadow-sm">
              {/* Medya, bağlantı ve belgeler */}
              <button
                onClick={() => {
                  setMediaTab("media");
                  setCurrentView("media_links_docs");
                }}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-slate-800/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center flex-shrink-0">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-slate-200 truncate">
                    Medya, bağlantı ve belgeler
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400 flex-shrink-0">
                  <span className="text-xs font-medium">
                    {totalMediaLinksDocsCount > 0 ? totalMediaLinksDocsCount : "Yok"}
                  </span>
                  <ChevronLeft className="w-4 h-4 rotate-180 text-slate-500" />
                </div>
              </button>

              {/* Depolama alanını yönet */}
              <button
                onClick={() => setCurrentView("storage")}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-slate-800/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center flex-shrink-0">
                    <HardDrive className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-slate-200 truncate">
                    Depolama alanını yönet
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400 flex-shrink-0">
                  <span className="text-xs font-medium">{storageStats.totalFormatted}</span>
                  <ChevronLeft className="w-4 h-4 rotate-180 text-slate-500" />
                </div>
              </button>

              {/* Yıldızlı Mesajlar */}
              <button
                onClick={() => setCurrentView("starred")}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-slate-800/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-amber-400/15 text-amber-400 flex items-center justify-center flex-shrink-0">
                    <Star className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-slate-200 truncate">Yıldızlı</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400 flex-shrink-0">
                  <span className="text-xs font-medium">
                    {starredItems.length > 0 ? starredItems.length : "Yok"}
                  </span>
                  <ChevronLeft className="w-4 h-4 rotate-180 text-slate-500" />
                </div>
              </button>
            </div>

            {/* Şifreleme ve Güvenlik Kodu (E2EE) */}
            {onOpenSafetyNumber && (
              <div className="bg-grupo-dark-card rounded-2xl border border-grupo-dark-border overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSafetyNumber();
                  }}
                  className="w-full p-3.5 flex items-center justify-between hover:bg-slate-800/50 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center flex-shrink-0">
                      <Key className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white">Şifreleme & Güvenlik</div>
                      <div className="text-[10px] text-slate-400 truncate">60 haneli uçtan uca şifreleme kodu</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex-shrink-0">
                    v{activeConv.safety_number_version || 1}
                  </span>
                </button>
              </div>
            )}

            {/* Hakkında (Biyografi) Kartı */}
            {activeConv.other_user.bio && (
              <div className="bg-grupo-dark-card rounded-2xl border border-grupo-dark-border p-4 shadow-sm">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Hakkında
                </span>
                <p className="text-sm text-slate-200 leading-relaxed">
                  {activeConv.other_user.bio}
                </p>
              </div>
            )}

            {/* 2. GRUP KARTI: Alt Yıkıcı Eylemler (Sohbeti Temizle & Engelle) */}
            <div className="bg-grupo-dark-card rounded-2xl border border-grupo-dark-border divide-y divide-grupo-dark-border overflow-hidden shadow-sm mt-4">
              {/* Sohbeti Temizle */}
              <button
                type="button"
                onClick={onClearChat}
                className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-slate-800/50 transition-colors cursor-pointer text-amber-400"
              >
                <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center flex-shrink-0">
                  <Eraser className="w-4 h-4" />
                </div>
                <span className="text-sm font-semibold">Sohbeti Temizle</span>
              </button>

              {/* Kişiyi Engelle / Engeli Kaldır */}
              <button
                type="button"
                disabled={isBlocking}
                onClick={async () => {
                  setIsBlocking(true);
                  try {
                    await onBlockToggle();
                  } finally {
                    setIsBlocking(false);
                  }
                }}
                className={`w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-slate-800/50 transition-colors cursor-pointer ${
                  activeConv.is_blocked ? "text-emerald-400" : "text-rose-500"
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    activeConv.is_blocked
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-rose-500/15 text-rose-500"
                  }`}
                >
                  {activeConv.is_blocked ? (
                    <ShieldCheck className="w-4 h-4" />
                  ) : (
                    <ShieldAlert className="w-4 h-4" />
                  )}
                </div>
                <span className="text-sm font-semibold">
                  {activeConv.is_blocked
                    ? `${activeConv.other_user.display_name} engelini kaldır`
                    : `${activeConv.other_user.display_name} kişisini engelle`}
                </span>
              </button>

              {/* Sohbeti Sil */}
              {onDeleteChat && (
                <button
                  type="button"
                  onClick={onDeleteChat}
                  className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-slate-800/50 transition-colors cursor-pointer text-rose-500"
                >
                  <div className="w-7 h-7 rounded-lg bg-rose-500/15 text-rose-500 flex items-center justify-center flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold">Sohbeti Sil</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. ALT GÖRÜNÜM: MEDYA, SESLER, BAĞLANTILAR VE BELGELER
      ────────────────────────────────────────────────────────────── */}
      {currentView === "media_links_docs" && (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-grupo-dark-bg">
          {/* Üst Bar & 4'lü Segmented Tab Kontrolü */}
          <div className="sticky top-0 z-20 bg-grupo-dark-card/95 backdrop-blur-md px-3 pt-3 pb-2 border-b border-grupo-dark-border flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setCurrentView("main")}
                className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 flex items-center justify-center transition-all cursor-pointer shadow-xs"
                title="Geri"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-xs font-bold text-slate-200 truncate max-w-[180px]">
                {activeConv.other_user.display_name}
              </span>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 flex items-center justify-center transition-all cursor-pointer shadow-xs"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 4'lü Segmented Bar [ Medya | Sesler | Bağlantılar | Belgeler ] */}
            <div className="grid grid-cols-4 p-1 bg-slate-900/90 rounded-xl border border-grupo-dark-border gap-1">
              <button
                onClick={() => setMediaTab("media")}
                className={`py-1.5 text-[11px] font-semibold rounded-lg transition-all cursor-pointer text-center truncate px-1 ${
                  mediaTab === "media"
                    ? "bg-grupo-dark-card text-white shadow-sm font-bold border border-grupo-dark-border"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Medya ({mediaItems.length})
              </button>
              <button
                onClick={() => setMediaTab("voices")}
                className={`py-1.5 text-[11px] font-semibold rounded-lg transition-all cursor-pointer text-center truncate px-1 ${
                  mediaTab === "voices"
                    ? "bg-grupo-dark-card text-white shadow-sm font-bold border border-grupo-dark-border"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Ses ({voiceItems.length})
              </button>
              <button
                onClick={() => setMediaTab("links")}
                className={`py-1.5 text-[11px] font-semibold rounded-lg transition-all cursor-pointer text-center truncate px-1 ${
                  mediaTab === "links"
                    ? "bg-grupo-dark-card text-white shadow-sm font-bold border border-grupo-dark-border"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Link ({linkItems.length})
              </button>
              <button
                onClick={() => setMediaTab("docs")}
                className={`py-1.5 text-[11px] font-semibold rounded-lg transition-all cursor-pointer text-center truncate px-1 ${
                  mediaTab === "docs"
                    ? "bg-grupo-dark-card text-white shadow-sm font-bold border border-grupo-dark-border"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Belge ({docItems.length})
              </button>
            </div>
          </div>

          {/* Sekme İçerikleri */}
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col justify-between">
            {/* 1. Medya Sekmesi */}
            {mediaTab === "media" && (
              <div className="flex-1">
                {mediaItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-10 text-center text-slate-500 my-auto">
                    <ImageIcon className="w-12 h-12 stroke-[1.2] mb-2 text-slate-600" />
                    <p className="text-sm font-medium">Henüz medya paylaşılmamış</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Fotoğraf, video ve çizimler burada listelenecektir.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1 p-1">
                    {mediaItems.map((m, idx) => {
                      const isVid =
                        m.message_type === "video" ||
                        /\.(mp4|mov|webm|m4v|mkv|avi|3gp)($|\?)/i.test(m.media_url || "");
                      const isDoodle = m.message_type === "doodle";
                      const finalUrl = resolveMediaUrl(m.media_url);

                      return (
                        <div
                          key={m.id}
                          onClick={() => setDrawerGalleryIndex(idx)}
                          className="aspect-square bg-grupo-dark-card relative cursor-pointer group overflow-hidden"
                        >
                          {isVid ? (
                            <div className="w-full h-full relative bg-black flex items-center justify-center">
                              <video
                                src={finalUrl}
                                className="w-full h-full object-cover pointer-events-none opacity-80"
                                preload="metadata"
                              />
                              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                                <div className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-xs flex items-center justify-center text-white">
                                  <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
                                </div>
                              </div>
                              {m.media_metadata?.duration && (
                                <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/70 text-[9px] text-white font-medium">
                                  {Math.floor(m.media_metadata.duration / 60)}:
                                  {String(Math.floor(m.media_metadata.duration % 60)).padStart(2, "0")}
                                </span>
                              )}
                            </div>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={finalUrl}
                              alt="Medya"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              loading="lazy"
                            />
                          )}

                          {isDoodle && (
                            <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-pink-600/90 text-[8px] font-bold text-white flex items-center gap-0.5 shadow">
                              <Palette className="w-2.5 h-2.5" />
                              <span>Çizim</span>
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {mediaItems.length > 0 && (
                  <div className="py-4 text-center text-xs text-slate-400 font-medium">
                    {mediaItems.length} Medya
                  </div>
                )}
              </div>
            )}

            {/* 2. Sesler Sekmesi (Voice Notes) */}
            {mediaTab === "voices" && (
              <div className="flex-1">
                {voiceItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-10 text-center text-slate-500 my-auto">
                    <Music className="w-12 h-12 stroke-[1.2] mb-2 text-slate-600" />
                    <p className="text-sm font-medium">Henüz sesli mesaj bulunmuyor</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Gönderilen tüm ses kayıtları burada listelenir.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 py-2">
                    {groupedVoices.map(([monthKey, items]) => (
                      <div key={monthKey} className="space-y-1">
                        <div className="px-4 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          {monthKey}
                        </div>
                        <div className="divide-y divide-grupo-dark-border bg-grupo-dark-card border-y border-grupo-dark-border">
                          {items.map((m) => {
                            const isMine = m.sender_id === currentUser?.id || m.is_mine;
                            return (
                              <div
                                key={m.id}
                                className="p-3.5 space-y-2 hover:bg-slate-800/40 transition-colors"
                              >
                                <div className="flex items-center justify-between text-[11px] text-slate-400">
                                  <span className="font-semibold text-slate-300">
                                    {isMine ? "Siz" : activeConv.other_user.display_name}
                                  </span>
                                  <span>{formatMessageTime(m.created_at)}</span>
                                </div>
                                <VoiceItemPlayer
                                  audioUrl={m.media_url || ""}
                                  duration={m.media_metadata?.duration}
                                  isMine={isMine}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {voiceItems.length > 0 && (
                  <div className="py-4 text-center text-xs text-slate-400 font-medium">
                    {voiceItems.length} Ses Kaydı
                  </div>
                )}
              </div>
            )}

            {/* 3. Bağlantılar Sekmesi (Zengin YouTube Music & Web Önizlemeleri) */}
            {mediaTab === "links" && (
              <div className="flex-1">
                {linkItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-10 text-center text-slate-500 my-auto">
                    <LinkIcon className="w-12 h-12 stroke-[1.2] mb-2 text-slate-600" />
                    <p className="text-sm font-medium">Henüz bağlantı paylaşılmamış</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Paylaşılan YouTube, müzik ve web linkleri burada listelenecektir.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 py-2 px-3">
                    {groupedLinks.map(([monthKey, items]) => (
                      <div key={monthKey} className="space-y-2.5">
                        <div className="px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          {monthKey}
                        </div>
                        <div className="space-y-2.5">
                          {items.map((item, idx) => {
                            const ytInfo = parseYouTubeUrl(item.url);
                            if (ytInfo.isYouTube && ytInfo.videoId) {
                              return (
                                <DrawerYouTubeCard
                                  key={`${item.messageId}-${idx}`}
                                  url={item.url}
                                  videoId={ytInfo.videoId}
                                  isMusic={ytInfo.isMusic}
                                  messageId={item.messageId}
                                  originalTitle={item.title}
                                  onJumpToMessage={onJumpToMessage}
                                  onClose={onClose}
                                />
                              );
                            }

                            return (
                              <DrawerWebLinkCard
                                key={`${item.messageId}-${idx}`}
                                url={item.url}
                                domain={item.domain}
                                messageId={item.messageId}
                                fallbackTitle={item.title}
                                onJumpToMessage={onJumpToMessage}
                                onClose={onClose}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {linkItems.length > 0 && (
                  <div className="py-4 text-center text-xs text-slate-400 font-medium">
                    {linkItems.length} Bağlantı
                  </div>
                )}
              </div>
            )}

            {/* 4. Belgeler Sekmesi */}
            {mediaTab === "docs" && (
              <div className="flex-1">
                {docItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-10 text-center text-slate-500 my-auto">
                    <FileText className="w-12 h-12 stroke-[1.2] mb-2 text-slate-600" />
                    <p className="text-sm font-medium">Henüz belge paylaşılmamış</p>
                    <p className="text-xs text-slate-600 mt-1">
                      PDF ve diğer dokümanlar burada listelenecektir.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 py-2">
                    {groupedDocs.map(([monthKey, items]) => (
                      <div key={monthKey} className="space-y-1">
                        <div className="px-4 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          {monthKey}
                        </div>
                        <div className="divide-y divide-grupo-dark-border bg-grupo-dark-card border-y border-grupo-dark-border">
                          {items.map((m) => {
                            const fileName = m.media_metadata?.file_name || "Belge";
                            const fileSize = m.media_metadata?.file_size
                              ? formatBytes(m.media_metadata.file_size)
                              : "";
                            const ext =
                              fileName.split(".").pop()?.toUpperCase() || "DOSYA";
                            const finalUrl = resolveMediaUrl(m.media_url);

                            return (
                              <div
                                key={m.id}
                                className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-800/40 transition-colors"
                              >
                                <a
                                  href={finalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={fileName}
                                  className="flex items-center gap-3 min-w-0 flex-1 group"
                                >
                                  <div className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                                    <FileText className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-grupo-accent transition-colors">
                                      {fileName}
                                    </p>
                                    <span className="text-[11px] text-slate-400 block mt-0.5">
                                      {fileSize ? `${fileSize} • ` : ""}
                                      {ext}
                                    </span>
                                  </div>
                                </a>

                                <div className="flex items-center gap-1">
                                  {onJumpToMessage && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onJumpToMessage(m.id);
                                        onClose();
                                      }}
                                      title="Mesaja git"
                                      className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
                                    >
                                      <ChevronLeft className="w-4 h-4 rotate-180" />
                                    </button>
                                  )}
                                  <a
                                    href={finalUrl}
                                    download={fileName}
                                    title="İndir"
                                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
                                  >
                                    <Download className="w-4 h-4" />
                                  </a>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {docItems.length > 0 && (
                  <div className="py-4 text-center text-xs text-slate-400 font-medium">
                    {docItems.length} Belge
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. ALT GÖRÜNÜM: DEPOLAMA ALANINI YÖNET
      ────────────────────────────────────────────────────────────── */}
      {currentView === "storage" && (
        <div className="flex-1 flex flex-col h-full overflow-y-auto custom-scrollbar bg-grupo-dark-bg">
          {/* Üst Bar */}
          <div className="sticky top-0 z-20 bg-grupo-dark-card/95 backdrop-blur-md px-3.5 sm:px-4 h-14 border-b border-grupo-dark-border flex items-center justify-between">
            <button
              onClick={() => setCurrentView("main")}
              className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 flex items-center justify-center transition-all cursor-pointer shadow-xs"
              title="Geri"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-sm font-bold text-white tracking-wide">Depolama</h2>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 flex items-center justify-center transition-all cursor-pointer shadow-xs"
              title="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Toplam Alan Kartı */}
            <div className="bg-grupo-dark-card rounded-2xl border border-grupo-dark-border p-5 text-center shadow-sm">
              <span className="text-xs font-semibold text-slate-400 block mb-1">
                Bu Sohbette Kullanılan Alan
              </span>
              <h3 className="text-3xl font-extrabold text-white tracking-tight">
                {storageStats.totalFormatted}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Fotoğraf, video, ses kaydı ve belgeler
              </p>
            </div>

            {/* Kategori Dağılımı */}
            <div className="bg-grupo-dark-card rounded-2xl border border-grupo-dark-border divide-y divide-grupo-dark-border overflow-hidden shadow-sm">
              {/* Fotoğraflar */}
              <div className="px-4 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">Fotoğraflar</span>
                    <span className="text-[10px] text-slate-400">{storageStats.photosCount} öğe</span>
                  </div>
                </div>
                <span className="text-xs font-bold text-slate-300">
                  {formatBytes(storageStats.photosSize)}
                </span>
              </div>

              {/* Videolar */}
              <div className="px-4 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center">
                    <Video className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">Videolar</span>
                    <span className="text-[10px] text-slate-400">{storageStats.videosCount} öğe</span>
                  </div>
                </div>
                <span className="text-xs font-bold text-slate-300">
                  {formatBytes(storageStats.videosSize)}
                </span>
              </div>

              {/* Belgeler */}
              <div className="px-4 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">Belgeler</span>
                    <span className="text-[10px] text-slate-400">{storageStats.docsCount} öğe</span>
                  </div>
                </div>
                <span className="text-xs font-bold text-slate-300">
                  {formatBytes(storageStats.docsSize)}
                </span>
              </div>

              {/* Ses Kayıtları */}
              <div className="px-4 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    style={{
                      backgroundColor: "var(--accent-shadow, rgba(233, 30, 99, 0.15))",
                      color: "var(--accent, #E91E63)",
                    }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                  >
                    <Music className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">Sesli Mesajlar</span>
                    <span className="text-[10px] text-slate-400">{storageStats.audioCount} öğe</span>
                  </div>
                </div>
                <span className="text-xs font-bold text-slate-300">
                  {formatBytes(storageStats.audioSize)}
                </span>
              </div>
            </div>

            {/* Hızlı Temizle Butonu */}
            <button
              type="button"
              onClick={onClearChat}
              className="w-full py-3 px-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Eraser className="w-4 h-4" />
              <span>Sohbet Alanını Boşalt (Geçmişi Temizle)</span>
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. ALT GÖRÜNÜM: YILDIZLI MESAJLAR (BU SOHBETE AİT)
      ────────────────────────────────────────────────────────────── */}
      {currentView === "starred" && (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-grupo-dark-bg">
          {/* Üst Bar */}
          <div className="sticky top-0 z-20 bg-grupo-dark-card/95 backdrop-blur-md px-3.5 sm:px-4 h-14 border-b border-grupo-dark-border flex items-center justify-between">
            <button
              onClick={() => setCurrentView("main")}
              className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 flex items-center justify-center transition-all cursor-pointer shadow-xs"
              title="Geri"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-sm font-bold text-white tracking-wide">Yıldızlı Mesajlar</h2>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 flex items-center justify-center transition-all cursor-pointer shadow-xs"
              title="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2.5">
            {starredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-10 text-center text-slate-500 my-auto">
                <Star className="w-12 h-12 stroke-[1.2] mb-2 text-slate-600" />
                <p className="text-sm font-medium">Yıldızlı mesaj bulunmuyor</p>
                <p className="text-xs text-slate-600 mt-1">
                  Önemli mesajları yıldızlayarak burada saklayabilirsiniz.
                </p>
              </div>
            ) : (
              starredItems.map((msg) => {
                const isMine = msg.sender_id === currentUser?.id || msg.is_mine;

                return (
                  <div
                    key={msg.id}
                    className="p-3.5 rounded-2xl bg-grupo-dark-card border border-grupo-dark-border space-y-2 shadow-sm relative group"
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-grupo-dark-border pb-1.5">
                      <span className="font-semibold text-slate-300">
                        {isMine ? "Siz" : activeConv.other_user.display_name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span>{formatMessageTime(msg.created_at)}</span>
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      </div>
                    </div>

                    {/* Mesaj İçeriği */}
                    {msg.content && (
                      <p className="text-xs text-slate-200 leading-relaxed break-words whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    )}

                    {/* Medya Önizlemesi Varsa */}
                    {msg.media_url && (
                      <div className="pt-1">
                        {msg.message_type === "image" ||
                        msg.message_type === "doodle" ||
                        /\.(png|jpg|jpeg|webp|gif)($|\?)/i.test(msg.media_url) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={resolveMediaUrl(msg.media_url)}
                            alt="Medya"
                            className="max-h-32 rounded-xl object-cover border border-white/10"
                          />
                        ) : msg.message_type === "voice" ? (
                          <VoiceItemPlayer
                            audioUrl={msg.media_url}
                            duration={msg.media_metadata?.duration}
                            isMine={isMine}
                          />
                        ) : msg.message_type === "file" ? (
                          <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-900/80 border border-white/10 text-xs text-slate-300">
                            <FileText className="w-4 h-4 text-rose-400" />
                            <span className="truncate">
                              {msg.media_metadata?.file_name || "Dosya"}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* Aksiyonlar: Mesaja Git & Yıldızı Kaldır */}
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-grupo-dark-border">
                      {onToggleStarMessage && (
                        <button
                          type="button"
                          onClick={() => onToggleStarMessage(msg.id)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          Yıldızı Kaldır
                        </button>
                      )}
                      {onJumpToMessage && (
                        <button
                          type="button"
                          onClick={() => {
                            onJumpToMessage(msg.id);
                            onClose();
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-grupo-accent hover:opacity-80 transition-opacity cursor-pointer flex items-center gap-1"
                        >
                          <span>Mesaja Git</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          5. ÇEKMECE İÇİ TAM EKRAN MEDYA GALERİSİ (LIGHTBOX)
      ────────────────────────────────────────────────────────────── */}
      {drawerGalleryIndex !== null && (
        <MediaGalleryModal
          isOpen={drawerGalleryIndex !== null}
          initialIndex={drawerGalleryIndex}
          items={drawerGalleryItems}
          onClose={() => setDrawerGalleryIndex(null)}
          onJumpToMessage={(msgId) => {
            setDrawerGalleryIndex(null);
            if (onJumpToMessage) {
              onJumpToMessage(msgId);
            }
            onClose();
          }}
        />
      )}
    </aside>
  );
}
