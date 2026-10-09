"use client";

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  Send,
  Smile,
  Mic,
  Sparkles,
  Phone,
  Video,
  UploadCloud,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useChatStore } from "@/store/useChatStore";
import { useCallStore } from "@/store/useCallStore";
import { useStoryStore } from "@/store/useStoryStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import ActiveChatHeader from "@/components/chat/ActiveChatHeader";
import MessageSelectionBar from "@/components/chat/MessageSelectionBar";
import InChatSearchBar from "@/components/chat/InChatSearchBar";
import ListenTogetherIsland from "@/components/chat/ListenTogetherIsland";
import MessageBubble from "@/components/chat/MessageBubble";
import ReplyBar from "@/components/chat/ReplyBar";
import MediaUploadMenu from "@/components/chat/MediaUploadMenu";
import AudioRecorder from "@/components/chat/AudioRecorder";
import EmojiPicker from "@/components/chat/EmojiPicker";
import dynamic from "next/dynamic";
import EmptyChatState from "@/components/chat/EmptyChatState";

// Chat içi ağır çekmece ve modalları dinamik (lazy) yükle
const ContactInfoDrawer = dynamic(() => import("@/components/chat/ContactInfoDrawer"), { ssr: false });
const MediaStagingModal = dynamic(() => import("@/components/chat/MediaStagingModal"), { ssr: false });
const MediaGalleryModal = dynamic(() => import("@/components/chat/MediaGalleryModal"), { ssr: false });
const PdfPreviewModal = dynamic(() => import("@/components/chat/PdfPreviewModal"), { ssr: false });
const DoodleModal = dynamic(() => import("@/components/chat/DoodleModal"), { ssr: false });
import type { GalleryMediaItem } from "@/components/chat/MediaGalleryModal";
export type { GalleryMediaItem };
import { api, resolveMediaUrl } from "@/lib/api";
import { compressImage, validateVideo } from "@/lib/compression";
import { focusChatInput } from "@/lib/utils";

const isSameCalendarDay = (d1: Date, d2: Date) => {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

const formatMessageDateDivider = (dateString?: string) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameCalendarDay(date, today)) return "Bugün";
  if (isSameCalendarDay(date, yesterday)) return "Dün";

  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  }).format(date);
};

export interface ChatboxProps {
  onBackToChatList: () => void;
  onOpenSafetyNumber: () => void;
  onOpenListenTogether: () => void;
  isKeyboardOpen?: boolean;
  onUserActivity?: () => void;
  // Navigation / Modal States
  showContactDrawer: boolean;
  setShowContactDrawer: (open: boolean) => void;
  isChatSearchOpen: boolean;
  setIsChatSearchOpen: (open: boolean) => void;
  chatSearchQuery: string;
  setChatSearchQuery: (q: string) => void;
  confirmCallType: "audio" | "video" | null;
  setConfirmCallType: (type: "audio" | "video" | null) => void;
  showActiveDeleteConfirm: "delete" | "clear" | null;
  setShowActiveDeleteConfirm: (type: "delete" | "clear" | null) => void;
  previewMedia: any;
  setPreviewMedia: (media: any) => void;
}

export default function Chatbox({
  onBackToChatList,
  onOpenSafetyNumber,
  onOpenListenTogether,
  isKeyboardOpen = false,
  onUserActivity,
  showContactDrawer,
  setShowContactDrawer,
  isChatSearchOpen,
  setIsChatSearchOpen,
  chatSearchQuery,
  setChatSearchQuery,
  confirmCallType,
  setConfirmCallType,
  showActiveDeleteConfirm,
  setShowActiveDeleteConfirm,
  previewMedia,
  setPreviewMedia,
}: ChatboxProps) {
  const { user } = useAuthStore();
  const settings = useSettingsStore((state) => state.settings);
  const {
    conversations,
    activeConversationId,
    messages,
    typingMap,
    selectConversation,
    deleteConversation,
    clearConversation,
    sendMessage,
    sendMediaMessage,
    sendTyping,
    toggleStar,
    replyingTo,
    setReplyingTo,
    hasMoreMessages,
    loadingOlderMessages,
    loadOlderMessages,
    blockConversation,
    unblockConversation,
    searchMessages,
    selectedMessageIds,
    isSelectionMode,
    deleteSelectedMessages,
    startSelectionMode,
    selectAllMessages,
    clearSelection,
    editingMessageId,
    setEditingMessageId,
  } = useChatStore();
  const initiateCall = useCallStore((state) => state.initiateCall);
  const { storyGroups, openViewer } = useStoryStore();

  const [showActiveChatMenu, setShowActiveChatMenu] = useState(false);
  const [isDeletingActive, setIsDeletingActive] = useState(false);

  // Giriş ve Kompozisyon Durumları
  const [inputMessage, setInputMessage] = useState("");
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  // Sürükle ve Bırak Durumları
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounterRef = useRef(0);

  // Medya Hazırlama / Staging
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [isStagingModalOpen, setIsStagingModalOpen] = useState(false);

  // PDF Önizleme Modalı
  const [previewPdf, setPreviewPdf] = useState<{ url: string; name?: string } | null>(null);

  // Gelişmiş Medya Galerisi (Lightbox Gallery)
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);

  // Çizim (Doodle) Modalı
  const [isDoodleOpen, setIsDoodleOpen] = useState(false);

  // WhatsApp Stili Scroll Motoru & ResizeObserver
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesInnerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef<boolean>(true);
  const prevLastMsgIdRef = useRef<string | null>(null);

  // Kullanıcı Niyeti (User Intent) Takipçisi - Focus veya layout shift sırasında pagination tetiklenmesini önler
  const isUserInteractingRef = useRef<boolean>(false);
  const userInteractionTimerRef = useRef<NodeJS.Timeout | null>(null);

  const markUserInteracting = useCallback(() => {
    isUserInteractingRef.current = true;
    if (userInteractionTimerRef.current) {
      clearTimeout(userInteractionTimerRef.current);
    }
    userInteractionTimerRef.current = setTimeout(() => {
      isUserInteractingRef.current = false;
    }, 1200);
  }, []);

  // Arama Eşleşmeleri ve Vurgu
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [serverSearchResults, setServerSearchResults] = useState<any[]>([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const isMessagesLoaded = Boolean(activeConversationId && messages[activeConversationId] !== undefined);
  const activeMessages = activeConversationId ? messages[activeConversationId] || [] : [];
  const isOtherTyping = activeConversationId ? typingMap[activeConversationId] : false;

  const messageMap = useMemo(() => {
    const map = new Map<string, (typeof activeMessages)[0]>();
    for (const m of activeMessages) {
      map.set(m.id, m);
    }
    return map;
  }, [activeMessages]);

  const otherUserStoryGroup = useMemo(() => {
    if (!activeConv?.other_user?.id) return null;
    return (
      storyGroups.find(
        (g) => g.user.id === activeConv.other_user.id && g.stories.length > 0
      ) || null
    );
  }, [storyGroups, activeConv?.other_user?.id]);
  const hasOtherStory = !!otherUserStoryGroup;
  const hasOtherUnviewed = !!otherUserStoryGroup?.has_unviewed;
  const isOtherCloseFriends = !!otherUserStoryGroup?.has_close_friends;

  // Dünya Standardı: Layout Thrashing (düzen çöküşü) yapmayan akıllı textarea boyutlayıcı
  const adjustTextareaHeight = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    // Modern CSS field-sizing desteği varsa JS hesaplaması yapma (sıfır reflow)
    if (typeof CSS !== "undefined" && CSS.supports && CSS.supports("field-sizing", "content")) {
      return;
    }
    // Güvenli Fallback: Boyut gerçekten değişmediyse DOM'a müdahale etme
    const prevHeight = el.offsetHeight;
    el.style.height = "auto";
    const maxHeight = 140;
    const targetHeight = Math.min(Math.max(el.scrollHeight, 40), maxHeight);
    if (Math.abs(prevHeight - targetHeight) > 2) {
      el.style.height = `${targetHeight}px`;
    } else {
      el.style.height = `${prevHeight}px`;
    }
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  // WhatsApp Standardı: En alta kaydırma fonksiyonu
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = messagesContainerRef.current;
    if (!el) return;
    isNearBottomRef.current = true;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
      bottomAnchorRef.current?.scrollIntoView({ block: "end", behavior });
    });
  }, []);

  // Harici uyanış veya taban tetikleyici dinleyicisi
  useEffect(() => {
    const handleScrollReq = () => {
      isNearBottomRef.current = true;
      scrollToBottom("auto");
    };
    window.addEventListener("aura:scroll_to_bottom", handleScrollReq);
    return () => window.removeEventListener("aura:scroll_to_bottom", handleScrollReq);
  }, [scrollToBottom]);

  // Konuşma değiştiğinde bayrakları ve input alanını sıfırla
  useEffect(() => {
    setIsEmojiPickerOpen(false);
    if (!activeConversationId) return;
    isNearBottomRef.current = true;
    prevLastMsgIdRef.current = null;
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.overflowY = "hidden";
    }
  }, [activeConversationId]);

  // Yanıtla seçildiğinde mesaj yazma alanına otomatik odaklan
  useEffect(() => {
    if (replyingTo) {
      focusChatInput();
    }
  }, [replyingTo]);

  // WhatsApp Standardı: Sohbet açıldığında tabana yerleş; hem içerik hem container boyut değişiminde tabanda kal
  useEffect(() => {
    const container = messagesContainerRef.current;
    const content = messagesInnerRef.current;
    if (!container || !content || !activeConversationId) return;

    // Yeni sohbete girildiğinde doğrudan en altta başla
    isNearBottomRef.current = true;
    container.scrollTop = container.scrollHeight;

    // Hem içerik div'i (mesajlar, görseller) hem de dış container (klavye, ekran kilidi açılışı, yeniden boyutlandırma)
    // boyutu değiştikçe kullanıcı yukarı kaydırmadıysa tabanda tut
    const ro = new ResizeObserver(() => {
      if (!container) return;
      if (isNearBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    });

    ro.observe(content);
    ro.observe(container);

    // İlk mount anında DOM paint sonrası tabana sabitle
    const rafId = requestAnimationFrame(() => {
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [activeConversationId]);

  // Dünya Standardı: IntersectionObserver ile Nöbetçi Div (Top Sentinel) Tabanlı Eski Mesaj Yükleme
  useEffect(() => {
    const container = messagesContainerRef.current;
    const sentinel = topSentinelRef.current;
    if (!container || !sentinel || !activeConversationId) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        const entry = entries[0];
        // SADECE kullanıcı bilinçli olarak yukarı kaydırıyorsa eski mesajları çek!
        // Klavye açılması, focus olması veya layout sarsıntısı anında tetiklenmeyi KESİNLİKLE ENGELLER!
        if (
          entry &&
          entry.isIntersecting &&
          isUserInteractingRef.current &&
          !useChatStore.getState().loadingOlderMessages &&
          useChatStore.getState().hasMoreMessages[activeConversationId] !== false &&
          container.scrollHeight > container.clientHeight
        ) {
          const prevScrollHeight = container.scrollHeight;
          const prevScrollTop = container.scrollTop;
          const loaded = await useChatStore.getState().loadOlderMessages(activeConversationId);
          if (loaded) {
            requestAnimationFrame(() => {
              if (messagesContainerRef.current) {
                const diff = messagesContainerRef.current.scrollHeight - prevScrollHeight;
                messagesContainerRef.current.scrollTop = prevScrollTop + diff;
              }
            });
          }
        }
      },
      {
        root: container,
        rootMargin: "80px 0px 0px 0px",
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeConversationId]);

  // Mobil sanal klavye açılıp kapanırken visualViewport resize/scroll takibi ve anlık tabana sabitleme
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;

    const handleVVChange = () => {
      if (typeof window !== "undefined" && (window.scrollY !== 0 || window.scrollX !== 0)) {
        window.scrollTo(0, 0);
      }
      if (typeof document !== "undefined") {
        if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
        if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
      }
      const container = messagesContainerRef.current;
      if (!container) return;
      if (isNearBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    };

    vv.addEventListener("resize", handleVVChange);
    vv.addEventListener("scroll", handleVVChange);
    return () => {
      vv.removeEventListener("resize", handleVVChange);
      vv.removeEventListener("scroll", handleVVChange);
    };
  }, []);

  // Mesajlar yüklendiğinde veya yeni bir son mesaj geldiğinde tabana yerleş
  useEffect(() => {
    if (!activeConversationId) return;
    const currentMsgs = messages[activeConversationId];
    if (!currentMsgs || currentMsgs.length === 0) return;

    const container = messagesContainerRef.current;
    if (!container) return;

    const lastMsg = currentMsgs[currentMsgs.length - 1];
    if (!lastMsg) return;

    // İlk yükleme (sohbete girildiğinde ve mesajlar asenkron olarak geldiğinde):
    if (!prevLastMsgIdRef.current) {
      prevLastMsgIdRef.current = lastMsg.id;
      isNearBottomRef.current = true;
      scrollToBottom("auto");
      requestAnimationFrame(() => scrollToBottom("auto"));
      setTimeout(() => scrollToBottom("auto"), 50);
      return;
    }

    // Son mesaj ID'si değişmediyse (eski mesajlar/arşiv yüklendiyse) tabana kaydırma!
    if (prevLastMsgIdRef.current === lastMsg.id) {
      return;
    }
    prevLastMsgIdRef.current = lastMsg.id;

    // Yeni son mesaj geldiğinde: benim mesajımsa veya kullanıcı zaten tabana yakınsa KESİNLİKLE EN ALTA İN!
    if (lastMsg.is_mine || isNearBottomRef.current) {
      isNearBottomRef.current = true;
      scrollToBottom("auto");
      requestAnimationFrame(() => scrollToBottom("auto"));
    }
  }, [messages, activeConversationId, scrollToBottom]);

  // Aktif Konuşmanın Medya Galerisi Öğeleri
  const galleryItems = useMemo<GalleryMediaItem[]>(() => {
    if (!activeConversationId) return [];
    const msgs = messages[activeConversationId] || [];
    return msgs
      .filter(
        (m) =>
          (m.message_type === "image" ||
            m.message_type === "video" ||
            /\.(mp4|mov|webm|m4v|mkv|avi|3gp)($|\?)/i.test(m.media_url || "") ||
            /\.(jpg|jpeg|png|webp|gif)($|\?)/i.test(m.media_url || "")) &&
          m.media_url &&
          !m.is_deleted_for_all
      )
      .map((m) => {
        const isVid =
          m.message_type === "video" ||
          /\.(mp4|mov|webm|m4v|mkv|avi|3gp)($|\?)/i.test(m.media_url || "");
        return {
          id: m.id,
          url: resolveMediaUrl(m.media_url),
          type: (isVid ? "video" : "image") as "image" | "video",
          name: m.media_metadata?.file_name,
          caption: m.content,
          senderName: m.is_mine ? "Sen" : activeConv?.other_user.display_name,
          sentAt: m.sent_at || m.created_at,
        };
      });
  }, [activeConversationId, messages, activeConv]);

  // Medya Ön-Yükleme (Media Preload)
  useEffect(() => {
    if (!activeConversationId) return;
    const mediaUrls = galleryItems.slice(0, 5).map((it) => it.url);
    mediaUrls.forEach((url) => {
      if (
        url &&
        (url.endsWith(".jpg") ||
          url.endsWith(".png") ||
          url.endsWith(".webp") ||
          url.includes("format="))
      ) {
        const img = new Image();
        img.src = url;
      }
    });
  }, [activeConversationId, galleryItems]);

  // Pano Yapıştırma (Clipboard Paste - Ctrl+V)
  const handleComposerPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!activeConv) return;
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            setStagedFile(file);
            setIsStagingModalOpen(true);
            return;
          }
        }
      }
    }
    setTimeout(adjustTextareaHeight, 0);
  };

  // Sürükle ve Bırak (Drag & Drop) Olayları
  const handleDragEnter = (e: React.DragEvent) => {
    if (!activeConv) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragActive(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!activeConv) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      setIsDragActive(false);
      dragCounterRef.current = 0;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!activeConv) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!activeConv) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    dragCounterRef.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      setStagedFile(file);
      setIsStagingModalOpen(true);
    }
  };

  // Hazırlanan Medyayı Gönderme
  const handleSendStagedMedia = async (
    file: File,
    caption: string,
    onProgress: (percent: number) => void,
    signal: AbortSignal
  ) => {
    if (!activeConv) return;
    const mediaLimits = settings?.media_limits;
    if (mediaLimits?.max_file_size_mb && file.size > mediaLimits.max_file_size_mb * 1024 * 1024) {
      throw new Error(`Dosya boyutu sistem sınırını aşıyor (En fazla ${mediaLimits.max_file_size_mb} MB).`);
    }

    const fileName = file.name.toLowerCase();
    const isVideo =
      file.type.startsWith("video/") ||
      /\.(mp4|mov|webm|m4v|mkv|avi|3gp)$/i.test(fileName);
    const isAudio =
      file.type.startsWith("audio/") ||
      /\.(mp3|m4a|wav|ogg|aac|weba)$/i.test(fileName);
    const isImage =
      !isVideo &&
      !isAudio &&
      (file.type.startsWith("image/") ||
        /\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(fileName));

    const effectiveCategory = isVideo
      ? "video"
      : isAudio
      ? "voice"
      : isImage
      ? "image"
      : "file";

    let fileToUpload = file;
    if (isImage) {
      fileToUpload = await compressImage(file);
    } else if (isVideo) {
      const val = validateVideo(file);
      if (!val.valid) {
        throw new Error(val.error || "Geçersiz video formatı.");
      }
    }

    const formData = new FormData();
    formData.append("file", fileToUpload);
    formData.append("category", effectiveCategory);

    const res = await api.post("/media/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      signal,
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });

    const { media_url, metadata } = res.data;
    const mediaType = isVideo ? "video" : isAudio ? "voice" : isImage ? "image" : "file";
    sendMediaMessage(activeConv.id, media_url, mediaType, metadata, caption);
  };

  // Sunucu tabanlı geçmiş arama sonuçları
  useEffect(() => {
    if (!activeConversationId || !chatSearchQuery.trim() || chatSearchQuery.trim().length < 2) {
      setServerSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await searchMessages(activeConversationId, chatSearchQuery.trim());
        setServerSearchResults(results || []);
      } catch (e) {
        // ignore
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [activeConversationId, chatSearchQuery, searchMessages]);

  // Sohbet İçi Arama ve Eşleşmeler
  const searchFilteredMessages = useMemo(() => {
    if (!chatSearchQuery.trim()) return [];
    const q = chatSearchQuery.trim().toLowerCase();
    const map = new Map<string, any>();
    activeMessages.forEach((m) => {
      if (
        !m.is_deleted_for_all &&
        (m.content?.toLowerCase().includes(q) ||
          m.media_metadata?.file_name?.toLowerCase().includes(q))
      ) {
        map.set(m.id, m);
      }
    });
    serverSearchResults.forEach((m) => {
      if (!map.has(m.id)) {
        map.set(m.id, m);
      }
    });
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(a.created_at || a.sent_at).getTime() -
        new Date(b.created_at || b.sent_at).getTime()
    );
  }, [activeMessages, chatSearchQuery, serverSearchResults]);

  const handleJumpToMessage = async (conversationId: string, messageId: string) => {
    if (!messageId) return;

    // Hedef mesaja atlarken tabana sabitlemeyi hemen kapat
    isNearBottomRef.current = false;

    if (activeConversationId !== conversationId) {
      await selectConversation(conversationId);
      await new Promise((r) => setTimeout(r, 100));
      isNearBottomRef.current = false;
    }
    setShowContactDrawer(false);
    setIsGalleryOpen(false);

    const scrollToTarget = (element: HTMLElement) => {
      isNearBottomRef.current = false;
      setHighlightedMessageId(messageId);
      const container = messagesContainerRef.current;
      if (container && element) {
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const offset = elementRect.top - containerRect.top;
        const targetScrollTop =
          container.scrollTop +
          offset -
          container.clientHeight / 2 +
          element.clientHeight / 2;
        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: "smooth",
        });
      } else if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };

    const triggerCentering = (element: HTMLElement) => {
      scrollToTarget(element);
      setTimeout(() => {
        const reEl = document.getElementById(`msg-${messageId}`);
        if (reEl) scrollToTarget(reEl);
      }, 150);
      setTimeout(() => {
        const reEl = document.getElementById(`msg-${messageId}`);
        if (reEl) scrollToTarget(reEl);
      }, 300);
    };

    // 1. Doğrudan DOM kontrolü
    let el = document.getElementById(`msg-${messageId}`);
    if (el) {
      triggerCentering(el);
      return;
    }

    // 2. Hassas yükleme (loadMessagesAround)
    try {
      await useChatStore.getState().loadMessagesAround(conversationId, messageId);
    } catch (e) {
      console.warn("loadMessagesAround hatası:", e);
    }

    // DOM'a React tarafından basılmasını bekle (polling)
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 60));
      el = document.getElementById(`msg-${messageId}`);
      if (el) {
        triggerCentering(el);
        return;
      }
    }

    // 3. Fallback: Kademeli yükleme
    for (let i = 0; i < 5; i++) {
      const hasMore = await useChatStore.getState().loadOlderMessages(conversationId);
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((r) => setTimeout(r, 60));
        el = document.getElementById(`msg-${messageId}`);
        if (el) {
          triggerCentering(el);
          return;
        }
      }
      if (!hasMore) break;
    }
  };

  useEffect(() => {
    if (highlightedMessageId) {
      const timer = setTimeout(() => {
        setHighlightedMessageId(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [highlightedMessageId]);

  const activeMatchedMessageId =
    highlightedMessageId ||
    (searchFilteredMessages.length > 0
      ? searchFilteredMessages[currentMatchIndex]?.id
      : null);

  useEffect(() => {
    if (activeMatchedMessageId) {
      isNearBottomRef.current = false;
      const el = document.getElementById(`msg-${activeMatchedMessageId}`);
      if (el) {
        const container = messagesContainerRef.current;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const elementRect = el.getBoundingClientRect();
          const offset = elementRect.top - containerRect.top;
          const targetScrollTop =
            container.scrollTop +
            offset -
            container.clientHeight / 2 +
            el.clientHeight / 2;
          container.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: "smooth",
          });
        } else {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }
  }, [activeMatchedMessageId, currentMatchIndex]);

  const handleNextMatch = () => {
    if (searchFilteredMessages.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % searchFilteredMessages.length);
  };

  const handlePrevMatch = () => {
    if (searchFilteredMessages.length === 0) return;
    setCurrentMatchIndex((prev) =>
      prev === 0 ? searchFilteredMessages.length - 1 : prev - 1
    );
  };

  // Karşı tarafın mesajı seçildiğinde "Herkesten Sil" butonunun gizlenmesi
  const canDeleteSelectedForAll = useMemo(() => {
    if (!isSelectionMode || selectedMessageIds.length === 0 || !activeConversationId) return false;
    const currentMsgs = messages[activeConversationId] || [];
    const selectedMsgs = currentMsgs.filter((m) => selectedMessageIds.includes(m.id));
    if (selectedMsgs.length === 0) return false;
    return selectedMsgs.every((m) => m.is_mine && !m.is_deleted_for_all);
  }, [isSelectionMode, selectedMessageIds, activeConversationId, messages]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || !activeConversationId) return;

    onUserActivity?.();
    sendMessage(activeConversationId, inputMessage.trim());
    setInputMessage("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.overflowY = "hidden";
    }
    isNearBottomRef.current = true;
    scrollToBottom("auto");
    requestAnimationFrame(() => scrollToBottom("auto"));
    setTimeout(() => scrollToBottom("auto"), 40);
    setTimeout(() => scrollToBottom("auto"), 120);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    lastTypingSentRef.current = 0;
    sendTyping(activeConversationId, false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUserActivity?.();
    setInputMessage(e.target.value);
    adjustTextareaHeight();
    if (!activeConversationId) return;

    const now = Date.now();
    if (now - lastTypingSentRef.current > 3000) {
      lastTypingSentRef.current = now;
      sendTyping(activeConversationId, true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      if (activeConversationId) {
        lastTypingSentRef.current = 0;
        sendTyping(activeConversationId, false);
      }
    }, 2500);
  };

  const handleSelectEmoji = useCallback(
    (emoji: string) => {
      onUserActivity?.();
      const input = inputRef.current;
      if (input) {
        const start = input.selectionStart ?? inputMessage.length;
        const end = input.selectionEnd ?? inputMessage.length;
        const nextVal = inputMessage.slice(0, start) + emoji + inputMessage.slice(end);
        setInputMessage(nextVal);

        if (activeConversationId) {
          sendTyping(activeConversationId, true);
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          typingTimeoutRef.current = setTimeout(() => {
            if (activeConversationId) {
              sendTyping(activeConversationId, false);
            }
          }, 3000);
        }

        setTimeout(() => {
          input.focus();
          const newPos = start + emoji.length;
          input.setSelectionRange(newPos, newPos);
          adjustTextareaHeight();
        }, 0);
      } else {
        setInputMessage((prev) => prev + emoji);
        setTimeout(adjustTextareaHeight, 0);
      }
    },
    [inputMessage, activeConversationId, sendTyping, adjustTextareaHeight, onUserActivity]
  );

  return (
    <main
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`${
        activeConversationId ? "flex w-full" : "hidden md:flex"
      } md:flex-1 flex-col bg-grupo-dark-bg relative h-full min-h-0 max-h-full overflow-hidden`}
    >
      {/* Sürükle ve Bırak (Drag & Drop) Görsel Katmanı */}
      {isDragActive && (
        <div className="absolute inset-4 z-40 bg-indigo-950/85 border-2 border-dashed border-indigo-400 rounded-3xl flex flex-col items-center justify-center gap-3 backdrop-blur-md pointer-events-none animate-in fade-in zoom-in-95 select-none shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/30 text-indigo-400 flex items-center justify-center shadow-2xl animate-bounce">
            <UploadCloud className="w-8 h-8" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-white">Dosyayı göndermek için buraya bırakın</p>
            <p className="text-xs text-indigo-300 mt-1">Görsel, video, ses veya belge</p>
          </div>
        </div>
      )}

      {activeConv ? (
        <>
          {/* Sohbet Üst Başlığı (ChatHeader) */}
          <ActiveChatHeader
            activeConv={activeConv}
            isOtherTyping={isOtherTyping}
            hasOtherStory={hasOtherStory}
            hasOtherUnviewed={hasOtherUnviewed}
            isOtherCloseFriends={isOtherCloseFriends}
            otherUserStoryGroup={otherUserStoryGroup}
            isChatSearchOpen={isChatSearchOpen}
            showContactDrawer={showContactDrawer}
            showActiveChatMenu={showActiveChatMenu}
            enableAudioCalls={settings?.call_settings?.enable_audio_calls !== false}
            enableVideoCalls={settings?.call_settings?.enable_video_calls !== false}
            onBackToChatList={onBackToChatList}
            onOpenStory={(sg) => openViewer(sg, 0)}
            onToggleContactDrawer={() => setShowContactDrawer(!showContactDrawer)}
            onToggleChatSearch={() => {
              setIsChatSearchOpen(!isChatSearchOpen);
              if (isChatSearchOpen) {
                setChatSearchQuery("");
                setCurrentMatchIndex(0);
              }
            }}
            onStartCall={(type) => setConfirmCallType(type)}
            onToggleActiveChatMenu={() => setShowActiveChatMenu(!showActiveChatMenu)}
            onOpenSafetyNumber={onOpenSafetyNumber}
            onStartSelectionMode={startSelectionMode}
            onConfirmDelete={(type) => setShowActiveDeleteConfirm(type)}
          />

          {/* ÇOKLU MESAJ SEÇİM EYLEM BARI */}
          {isSelectionMode && (
            <MessageSelectionBar
              selectedCount={selectedMessageIds.length}
              canDeleteForAll={canDeleteSelectedForAll}
              onClearSelection={clearSelection}
              onSelectAll={() => selectAllMessages(activeConv.id)}
              onDeleteForMe={async () => {
                if (selectedMessageIds.length === 0) return;
                if (!confirm(`${selectedMessageIds.length} adet mesajı kendinizden silmek istediğinize emin misiniz?`)) return;
                try {
                  await deleteSelectedMessages(false);
                } catch (err: any) {
                  alert(err.response?.data?.error || "Mesajlar silinemedi.");
                }
              }}
              onDeleteForAll={async () => {
                if (selectedMessageIds.length === 0) return;
                if (!confirm(`${selectedMessageIds.length} adet mesajı herkesten silmek istediğinize emin misiniz?`)) return;
                try {
                  await deleteSelectedMessages(true);
                } catch (err: any) {
                  alert(err.response?.data?.error || "Mesajlar silinemedi.");
                }
              }}
            />
          )}

          {/* WHATSAPP TARZI SOHBET İÇİ ARAMA BARI */}
          {isChatSearchOpen && (
            <InChatSearchBar
              searchQuery={chatSearchQuery}
              onSearchChange={(val) => {
                setChatSearchQuery(val);
                setCurrentMatchIndex(0);
              }}
              matchCount={searchFilteredMessages.length}
              currentMatchIndex={currentMatchIndex}
              onPrevMatch={handlePrevMatch}
              onNextMatch={handleNextMatch}
              onClose={() => {
                setIsChatSearchOpen(false);
                setChatSearchQuery("");
                setCurrentMatchIndex(0);
              }}
            />
          )}

          {/* Mesaj Akışı ve Dinamik Ada Alanı */}
          <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* BİRLİKTE DİNLE DİNAMİK ADA (DYNAMIC ISLAND) */}
            <ListenTogetherIsland
              conversationId={activeConv.id}
              otherUserName={activeConv.other_user?.display_name || activeConv.other_user?.username}
              onOpenChooser={onOpenListenTogether}
            />

            {/* Mesaj Akışı */}
            <div
              ref={messagesContainerRef}
              onWheel={markUserInteracting}
              onTouchStart={markUserInteracting}
              onTouchMove={markUserInteracting}
              onScroll={(e) => {
                const el = e.currentTarget;
                if (!activeConversationId) return;

                // Kullanıcı tabana 120px'ten yakın mı kontrol et
                const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                isNearBottomRef.current = distFromBottom < 120;
              }}
              className="flex-1 min-h-0 p-2.5 sm:p-4 md:p-5 lg:p-6 overflow-y-auto overflow-x-hidden overscroll-contain"
              style={{ scrollBehavior: "auto" }}
            >
              <div ref={messagesInnerRef} className="flex flex-col min-h-full">
                {/* DÜNYA STANDARDI: TOP SENTINEL (IntersectionObserver Gözlemcisi) */}
                <div ref={topSentinelRef} className="h-2 w-full flex-shrink-0 pointer-events-none" />

                {loadingOlderMessages && (
                  <div className="flex justify-center py-2">
                    <div className="w-5 h-5 border-2 border-grupo-accent border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {!isMessagesLoaded ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-grupo-accent border-t-transparent rounded-full animate-spin opacity-40" />
                  </div>
                ) : activeMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
                    <Sparkles className="w-8 h-8 text-grupo-accent/50 mb-2" />
                    <p className="text-sm font-medium">Bu sohbette henüz mesaj yok.</p>
                    <p className="text-xs text-slate-600 mt-1">İlk mesajı göndererek başlayın!</p>
                  </div>
                ) : (
                  <>
                    {/* Mesaj sayısı azken tabana yaslayan, taştığında scroll hesaplarını bozmayan Flex standardı */}
                    <div className="mt-auto" />
                    {activeMessages.map((m, index) => {
                    const prevMsg = index > 0 ? activeMessages[index - 1] : null;
                    const currentTimestamp = m.sent_at || m.created_at;
                    const prevTimestamp = prevMsg?.sent_at || prevMsg?.created_at;
                    const showDateDivider =
                      !prevTimestamp ||
                      (currentTimestamp &&
                        !isSameCalendarDay(
                          new Date(currentTimestamp),
                          new Date(prevTimestamp)
                        ));

                    return (
                      <div key={m.id}>
                        {showDateDivider && currentTimestamp && (
                          <div className="flex justify-center my-3 sticky top-1 z-10 pointer-events-none">
                            <span className="px-3.5 py-1 rounded-full text-[11px] font-semibold bg-slate-900/90 backdrop-blur-md text-slate-400 border border-slate-800 shadow-md pointer-events-auto select-none">
                              {formatMessageDateDivider(currentTimestamp)}
                            </span>
                          </div>
                        )}
                        <div id={`msg-${m.id}`}>
                          <MessageBubble
                            message={m}
                            searchQuery={chatSearchQuery}
                            isHighlightedMatch={m.id === activeMatchedMessageId}
                            onJumpToMessage={(targetId) => handleJumpToMessage(activeConv.id, targetId)}
                            otherUserName={activeConv.other_user.display_name}
                            repliedMessage={m.reply_to_id ? messageMap.get(m.reply_to_id) : undefined}
                            onOpenMedia={(msgId) => {
                              const idx = galleryItems.findIndex((it) => it.id === msgId);
                              setGalleryInitialIndex(idx >= 0 ? idx : 0);
                              setIsGalleryOpen(true);
                            }}
                            onOpenPdf={(url, name) => setPreviewPdf({ url, name })}
                          />
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
                {/* DÜNYA STANDARDI: BOTTOM ANCHOR (Tarayıcının Scroll Çapası) */}
                <div ref={bottomAnchorRef} className="h-px w-full flex-shrink-0 pointer-events-none" style={{ overflowAnchor: "auto" }} />
              </div>
            </div>
          </div>

          {/* Mesaj Giriş Barı & Alıntılama & Medya Menüsü */}
          <footer
            className={`p-2.5 sm:p-4 ${
              isKeyboardOpen
                ? "pb-2.5 sm:pb-4"
                : "pb-[max(0.625rem,env(safe-area-inset-bottom))]"
            } border-t border-grupo-dark-border bg-grupo-dark-card/40 backdrop-blur-md flex-shrink-0`}
          >
            {activeConv.is_blocked ? (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>Bu konuşma engellenmiştir. Mesaj gönderemezsiniz.</span>
                </div>
                <button
                  type="button"
                  onClick={() => unblockConversation(activeConv.id)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors cursor-pointer"
                >
                  Engeli Kaldır
                </button>
              </div>
            ) : (
              <>
                <ReplyBar />

                <div className="flex items-end gap-2 sm:gap-3">
                  <MediaUploadMenu
                    conversationId={activeConv.id}
                    onStartVoice={() => setIsRecordingVoice(true)}
                    onOpenEmoji={() => setIsEmojiPickerOpen((prev) => !prev)}
                    onStageFile={(file) => {
                      setStagedFile(file);
                      setIsStagingModalOpen(true);
                    }}
                    onOpenDoodle={() => setIsDoodleOpen(true)}
                    onOpenListenTogether={onOpenListenTogether}
                  />

                  {/* WhatsApp / Telegram Stili Gelişmiş Emoji Butonu & Popover */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsEmojiPickerOpen((prev) => !prev)}
                      title="Emoji ve İfade Klavyesi"
                      className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer flex-shrink-0 ${
                        isEmojiPickerOpen
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.35)] scale-105"
                          : "bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-amber-400 border border-grupo-dark-border"
                      }`}
                    >
                      <Smile
                        className={`w-5 h-5 transition-transform duration-300 ${
                          isEmojiPickerOpen ? "rotate-12 scale-110 text-amber-400" : ""
                        }`}
                      />
                    </button>

                    {/* Gelişmiş Emoji Klavyesi Popover */}
                    <EmojiPicker
                      isOpen={isEmojiPickerOpen}
                      onClose={() => setIsEmojiPickerOpen(false)}
                      onSelectEmoji={handleSelectEmoji}
                      anchorPosition="bottom-left"
                    />
                  </div>

                  {isRecordingVoice ? (
                    <AudioRecorder
                      conversationId={activeConv.id}
                      onCancel={() => setIsRecordingVoice(false)}
                      onComplete={() => setIsRecordingVoice(false)}
                    />
                  ) : (
                    <form onSubmit={handleSend} className="flex-1 flex items-end gap-2">
                      <textarea
                        id="aura-chat-input"
                        ref={inputRef}
                        rows={1}
                        value={inputMessage}
                        onChange={handleInputChange}
                        onPaste={handleComposerPaste}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                            return;
                          }
                          if (e.key === "ArrowUp" && !inputMessage.trim() && activeConversationId) {
                            e.preventDefault();
                            const currentMsgs = messages[activeConversationId] || [];
                            const lastMineMsg = [...currentMsgs]
                              .reverse()
                              .find((m) => m.is_mine && !m.is_deleted_for_all && m.message_type === "text");
                            if (lastMineMsg) {
                              setEditingMessageId(lastMineMsg.id);
                            }
                          }
                        }}
                        onFocus={() => {
                          setIsInputFocused(true);
                          if (isNearBottomRef.current) {
                            scrollToBottom("auto");
                          }
                        }}
                        onBlur={() => {
                          setIsInputFocused(false);
                        }}
                        placeholder=""
                        style={{
                          borderColor:
                            isInputFocused || inputMessage.trim()
                              ? "var(--accent, #6366F1)"
                              : undefined,
                          boxShadow: isInputFocused
                            ? "0 0 0 1px var(--accent, #6366F1)"
                            : undefined,
                          minHeight: "40px",
                          maxHeight: "140px",
                          fieldSizing: "content",
                        }}
                        className="flex-1 bg-slate-900/90 border border-grupo-dark-border rounded-2xl py-2 sm:py-2.5 px-3.5 sm:px-4 text-[15px] sm:text-sm text-white focus:outline-none transition-all resize-none leading-normal overflow-y-hidden"
                      />

                      {inputMessage.trim() ? (
                        <button
                          type="submit"
                          style={{
                            backgroundColor: "var(--accent, #6366F1)",
                            color: "var(--accent-text, #ffffff)",
                            boxShadow:
                              "0 10px 15px -3px var(--accent-shadow, rgba(99, 102, 241, 0.35))",
                          }}
                          className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl hover:brightness-110 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
                        >
                          <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsRecordingVoice(true)}
                          title="Sesli Mesaj Kaydet"
                          className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-white border border-grupo-dark-border flex items-center justify-center transition-colors cursor-pointer flex-shrink-0"
                        >
                          <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      )}
                    </form>
                  )}
                </div>
              </>
            )}
          </footer>
        </>
      ) : (
        /* Aktif Konuşma Yokken Karşılama Ekranı (Desktop) */
        <EmptyChatState />
      )}

      {/* WhatsApp Stili Kişi Bilgisi Çekmecesi */}
      {showContactDrawer && activeConv && (
        <ContactInfoDrawer
          activeConv={activeConv}
          messages={activeMessages}
          currentUser={user}
          hasOtherStory={hasOtherStory}
          hasOtherUnviewed={hasOtherUnviewed}
          isOtherCloseFriends={isOtherCloseFriends}
          otherUserStoryGroup={otherUserStoryGroup}
          onClose={() => setShowContactDrawer(false)}
          onStartCall={(type) => setConfirmCallType(type)}
          onOpenListenTogether={onOpenListenTogether}
          onOpenSearch={() => setIsChatSearchOpen(true)}
          onOpenSafetyNumber={onOpenSafetyNumber}
          onOpenStory={(sg) => openViewer(sg, 0)}
          onPreviewMedia={setPreviewMedia}
          onOpenGalleryAtIndex={(idx) => {
            setGalleryInitialIndex(idx);
            setIsGalleryOpen(true);
          }}
          onBlockToggle={async () => {
            try {
              if (activeConv.is_blocked) {
                await unblockConversation(activeConv.id);
              } else {
                await blockConversation(activeConv.id);
              }
            } catch (e) {
              console.error("Engelleme hatası:", e);
            }
          }}
          onClearChat={() => setShowActiveDeleteConfirm("clear")}
          onDeleteChat={() => setShowActiveDeleteConfirm("delete")}
          onJumpToMessage={(msgId) => handleJumpToMessage(activeConv.id, msgId)}
          onToggleStarMessage={async (msgId) => {
            try {
              await toggleStar(msgId);
            } catch (e) {
              console.error("Yıldızlama hatası:", e);
            }
          }}
        />
      )}

      {/* AKTİF SOHBETİ SİL / TEMİZLE ONAY MODALI */}
      {showActiveDeleteConfirm && activeConv && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-500 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {showActiveDeleteConfirm === "delete" ? "Sohbeti Sil" : "Geçmişi Temizle"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  @{activeConv.other_user.username} ile olan sohbet
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {showActiveDeleteConfirm === "delete"
                ? "Bu sohbeti listenizden silmek istediğinize emin misiniz? Sohbet ve mesajlar sizin için kaldırılacaktır."
                : "Bu sohbetteki tüm mesajları temizlemek istediğinize emin misiniz? Mesajlar sizin için görünmez olacaktır."}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowActiveDeleteConfirm(null)}
                disabled={isDeletingActive}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsDeletingActive(true);
                  try {
                    if (showActiveDeleteConfirm === "delete") {
                      await deleteConversation(activeConv.id);
                      setShowContactDrawer(false);
                    } else {
                      await clearConversation(activeConv.id);
                    }
                  } catch (e) {
                    alert("İşlem gerçekleştirilemedi.");
                  } finally {
                    setIsDeletingActive(false);
                    setShowActiveDeleteConfirm(null);
                  }
                }}
                disabled={isDeletingActive}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-md shadow-rose-600/30"
              >
                {isDeletingActive ? (
                  <span>İşleniyor...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{showActiveDeleteConfirm === "delete" ? "Sohbeti Sil" : "Temizle"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ARAMA BAŞLATMA ONAY MODALI */}
      {confirmCallType && activeConv && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  confirmCallType === "audio"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-grupo-accent/20 text-grupo-accent"
                }`}
              >
                {confirmCallType === "audio" ? (
                  <Phone className="w-6 h-6 animate-pulse" />
                ) : (
                  <Video className="w-6 h-6 animate-pulse" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {confirmCallType === "audio" ? "Sesli Arama Başlat" : "Görüntülü Arama Başlat"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  @{activeConv.other_user.username}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              <span className="font-semibold text-white">{activeConv.other_user.display_name}</span> ile{" "}
              <span className="font-semibold text-white">
                {confirmCallType === "audio" ? "sesli arama" : "görüntülü arama"}
              </span>{" "}
              başlatmak istediğinize emin misiniz?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmCallType(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  const type = confirmCallType;
                  setConfirmCallType(null);
                  initiateCall(activeConv.id, type);
                }}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer flex items-center gap-2 shadow-lg ${
                  confirmCallType === "audio"
                    ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30"
                    : "bg-grupo-accent hover:brightness-110 shadow-lg"
                }`}
              >
                {confirmCallType === "audio" ? (
                  <>
                    <Phone className="w-3.5 h-3.5" />
                    <span>Aramayı Başlat</span>
                  </>
                ) : (
                  <>
                    <Video className="w-3.5 h-3.5" />
                    <span>Aramayı Başlat</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GELİŞMİŞ ÇOKLU MEDYA GALERİSİ (LIGHTBOX GALLERY) */}
      <MediaGalleryModal
        isOpen={isGalleryOpen}
        initialIndex={galleryInitialIndex}
        items={galleryItems}
        onClose={() => setIsGalleryOpen(false)}
        onJumpToMessage={(msgId) => {
          if (activeConv) {
            handleJumpToMessage(activeConv.id, msgId);
          }
        }}
      />

      {/* GÜVENLİ PDF ÖNİZLEME MODALI */}
      <PdfPreviewModal
        pdfUrl={previewPdf?.url || null}
        fileName={previewPdf?.name}
        onClose={() => setPreviewPdf(null)}
      />

      {/* MEDYA HAZIRLAMA / STAGING MODALI */}
      <MediaStagingModal
        file={stagedFile}
        isOpen={isStagingModalOpen}
        onClose={() => {
          setIsStagingModalOpen(false);
          setStagedFile(null);
        }}
        onSend={handleSendStagedMedia}
      />

      {/* 1-E-1 CANLI EŞZAMANLI ÇİZİM (DOODLE) MODALI */}
      <DoodleModal
        isOpen={isDoodleOpen}
        conversationId={activeConversationId}
        onClose={() => setIsDoodleOpen(false)}
        onSendDoodle={(file) => {
          setIsDoodleOpen(false);
          setStagedFile(file);
          setIsStagingModalOpen(true);
        }}
      />
    </main>
  );
}
