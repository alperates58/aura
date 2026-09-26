"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { useChatStore } from "@/store/useChatStore";
import { useSocketStore } from "@/store/useSocketStore";
import { useCallStore } from "@/store/useCallStore";
import { useStoryStore } from "@/store/useStoryStore";
import { useBackNavigation } from "@/lib/useBackNavigation";
import { useSettingsStore, applyThemeToDocument } from "@/store/useSettingsStore";
import IncomingCallModal from "@/components/call/IncomingCallModal";
import ActiveCallModal from "@/components/call/ActiveCallModal";
import SideNavigation, { NavTab } from "@/components/layout/SideNavigation";
import MobileNavigation from "@/components/layout/MobileNavigation";
import SettingsModal from "@/components/chat/SettingsModal";
import { AdminPanelModal } from "@/components/admin/AdminPanelModal";
import StoriesBar from "@/components/story/StoriesBar";
import StoryViewerModal from "@/components/story/StoryViewerModal";
import StoryCreatorModal from "@/components/story/StoryCreatorModal";
import StoryHighlightViewerModal from "@/components/story/StoryHighlightViewerModal";
import { HighlightsBar } from "@/components/story/StoryHighlightModal";
import StoryNotificationBanner from "@/components/story/StoryNotificationBanner";
import MessageBubble from "@/components/chat/MessageBubble";
import MessageInfoModal from "@/components/chat/MessageInfoModal";
import ReplyBar from "@/components/chat/ReplyBar";
import MediaUploadMenu from "@/components/chat/MediaUploadMenu";
import AudioRecorder from "@/components/chat/AudioRecorder";
import EmojiPicker from "@/components/chat/EmojiPicker";
import MediaStagingModal from "@/components/chat/MediaStagingModal";
import PdfPreviewModal from "@/components/chat/PdfPreviewModal";
import MediaGalleryModal, { GalleryMediaItem } from "@/components/chat/MediaGalleryModal";
import DoodleModal from "@/components/chat/DoodleModal";
import ListenTogetherModal from "@/components/chat/ListenTogetherModal";
import ListenTogetherIsland from "@/components/chat/ListenTogetherIsland";
import ListenTogetherController from "@/components/chat/ListenTogetherController";
import { compressImage, validateVideo } from "@/lib/compression";
import { api, resolveMediaUrl, getApiBaseUrl } from "@/lib/api";
import { formatLastSeen } from "@/lib/utils";
import { notificationManager } from "@/lib/notifications";
import { subscribeUserToPush, getPushSubscription } from "@/lib/push_notifications";
import ConversationListItem from "@/components/chat/ConversationListItem";
import {
  MessageSquare,
  LogOut,
  Send,
  Search,
  Smile,
  UserPlus,
  ShieldCheck,
  Sparkles,
  Phone,
  Video,
  ArrowLeft,
  Mic,
  Star,
  StarOff,
  Users,
  Info,
  X,
  FileText,
  Image as ImageIcon,
  Trash2,
  Eraser,
  MoreVertical,
  AlertCircle,
  Sliders,
  Play,
  ChevronUp,
  ChevronDown,
  CheckSquare,
  UploadCloud,
} from "lucide-react";

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

export default function HomePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, checkAuth, logout } = useAuthStore();
  const settings = useSettingsStore((state) => state.settings);
  const {
    conversations,
    activeConversationId,
    messages,
    typingMap,
    loadConversations,
    selectConversation,
    deselectConversation,
    deleteConversation,
    clearConversation,
    sendMessage,
    sendMediaMessage,
    sendTyping,
    startNewConversation,
    starredMessages,
    loadStarredMessages,
    toggleStar,
    selectedMessageInfo,
    setSelectedMessageInfo,
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
  const { connect, isConnected, isReconnecting, pendingQueueCount } = useSocketStore();
  const initiateCall = useCallStore((state) => state.initiateCall);
  const {
    activeViewerGroup,
    closeViewer,
    isCreatorOpen,
    closeCreator,
    storyGroups,
    openViewer,
    loadStories,
    activeHighlight,
  } = useStoryStore();

  const [activeTab, setActiveTab] = useState<NavTab>("chats");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showContactDrawer, setShowContactDrawer] = useState(false);
  const [showActiveChatMenu, setShowActiveChatMenu] = useState(false);
  const [showActiveDeleteConfirm, setShowActiveDeleteConfirm] = useState<"delete" | "clear" | null>(null);
  const [isDeletingActive, setIsDeletingActive] = useState(false);
  const [confirmCallType, setConfirmCallType] = useState<"audio" | "video" | null>(null);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<{
    url: string;
    type: "image" | "video";
    name?: string;
  } | null>(null);

  // Medya Hazırlama / Staging (Pano Yapıştırma, Sürükle-Bırak, Açıklama ve İlerleme)
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [isStagingModalOpen, setIsStagingModalOpen] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounterRef = useRef(0);

  // PDF Önizleme Modalı
  const [previewPdf, setPreviewPdf] = useState<{ url: string; name?: string } | null>(null);

  // Gelişmiş Medya Galerisi (Lightbox Gallery)
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);

  // Gizlilik Kalkanı: Tuş kilidi kapandığında veya inaktivite yönlendirmesinde sohbeti anında gizler
  const [isPrivacyCurtainActive, setIsPrivacyCurtainActive] = useState(() => {
    if (typeof window !== "undefined") {
      const inactiveSince = localStorage.getItem("aura_inactive_since");
      if (inactiveSince || document.hidden) {
        return true;
      }
    }
    return false;
  });

  // İnaktivite süresi dolduğunda yönlendirme durumu
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Sohbet İçi Arama Durumları (WhatsApp Tarzı)
  const [isChatSearchOpen, setIsChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Çevrimdışı / Yeniden Bağlanma Bildirimi (5 saniye gecikmeli - anlık kopmalarda gereksiz bildirim göstermez)
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (!isConnected) {
      timer = setTimeout(() => {
        setShowOfflineBanner(true);
      }, 5000);
    } else {
      setShowOfflineBanner(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isConnected]);

  // Android Sistem Geri Tuşu & Tarayıcı Geri Gezinme Yönetimi
  const { handleBackToChatList, showExitToast } = useBackNavigation({
    activeConversationId,
    onCloseChat: deselectConversation,
    previewMedia,
    onClosePreviewMedia: () => setPreviewMedia(null),
    showContactDrawer,
    onCloseContactDrawer: () => setShowContactDrawer(false),
    isChatSearchOpen,
    onCloseChatSearch: () => {
      setIsChatSearchOpen(false);
      setChatSearchQuery("");
      setCurrentMatchIndex(0);
    },
    confirmCallType,
    onCloseConfirmCallType: () => setConfirmCallType(null),
    showActiveDeleteConfirm,
    onCloseActiveDeleteConfirm: () => setShowActiveDeleteConfirm(null),
    isSettingsOpen,
    onCloseSettings: () => {
      setIsSettingsOpen(false);
      if (activeTab === "settings") setActiveTab("chats");
    },
    isAdminPanelOpen,
    onCloseAdminPanel: () => setIsAdminPanelOpen(false),
    selectedMessageInfo,
    onCloseMessageInfo: () => setSelectedMessageInfo(null),
    isStoryViewerOpen: !!activeViewerGroup,
    onCloseStoryViewer: closeViewer,
    isStoryCreatorOpen: isCreatorOpen,
    onCloseStoryCreator: closeCreator,
  });

  const [inputMessage, setInputMessage] = useState("");
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [contactsList, setContactsList] = useState<any[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isDoodleOpen, setIsDoodleOpen] = useState(false);
  const [isListenTogetherOpen, setIsListenTogetherOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [viewportTop, setViewportTop] = useState<number>(0);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastInteractionRef = useRef<number>(Date.now());
  const lastActiveSavedRef = useRef<number>(0);
  const registerUserActivity = useCallback((force = false) => {
    const now = Date.now();
    lastInteractionRef.current = now;
    if (typeof window !== "undefined") {
      localStorage.removeItem("aura_inactive_since");
      if (force || now - lastActiveSavedRef.current >= 2000) {
        lastActiveSavedRef.current = now;
        localStorage.setItem("aura_last_active", now.toString());
      }
    }
  }, []);

  // WhatsApp stili otomatik genişleyen mesaj kutusu hesaplayıcısı
  const adjustTextareaHeight = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 140; // ~5-6 satır (WhatsApp standardı)
    const scrollHeight = el.scrollHeight;
    if (scrollHeight > maxHeight) {
      el.style.height = `${maxHeight}px`;
      el.style.overflowY = "auto";
    } else {
      el.style.height = `${Math.max(scrollHeight, 40)}px`;
      el.style.overflowY = "hidden";
    }
  }, []);

  // Karşı tarafın mesajı seçildiğinde veya bana ait olmayan herhangi bir mesaj seçildiğinde
  // "Herkesten Sil" butonunun kesinlikle gizlenmesi (Admin dahi olsa başkasının mesajını silemez)
  const canDeleteSelectedForAll = useMemo(() => {
    if (!isSelectionMode || selectedMessageIds.length === 0 || !activeConversationId) return false;
    const currentMsgs = messages[activeConversationId] || [];
    const selectedMsgs = currentMsgs.filter((m) => selectedMessageIds.includes(m.id));
    if (selectedMsgs.length === 0) return false;
    return selectedMsgs.every((m) => m.is_mine && !m.is_deleted_for_all);
  }, [isSelectionMode, selectedMessageIds, activeConversationId, messages]);

  const updateViewportMetrics = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.visualViewport) {
      setViewportHeight(window.visualViewport.height);
      const hasActiveInput =
        typeof document !== "undefined" &&
        document.activeElement &&
        (document.activeElement.tagName === "INPUT" ||
          document.activeElement.tagName === "TEXTAREA");
      setViewportTop(hasActiveInput ? (window.visualViewport.offsetTop || 0) : 0);
    } else {
      setViewportHeight(window.innerHeight);
      setViewportTop(0);
    }
  }, []);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialScrolledConvsRef = useRef<Record<string, boolean>>({});
  const prevMessagesCountRef = useRef<Record<string, number>>({});
  const isPrependingOlderRef = useRef(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  // Akıllı ve güvenli en alta kaydırma fonksiyonu (Sadece mesaj konteynerini kaydırır, tarayıcı penceresini/document'ı kaydırmaz)
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (messagesContainerRef.current) {
      const el = messagesContainerRef.current;
      const isHidden = typeof document !== "undefined" && document.hidden;
      // Ekran kilitli veya sekme arka plandaysa rAF durduğu için kesinlikle doğrudan ve "auto" kaydır
      if (isHidden || behavior === "auto") {
        el.scrollTop = el.scrollHeight;
      } else {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: "smooth",
        });
      }
    }
    if (messagesEndRef.current && behavior === "auto") {
      messagesEndRef.current.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, []);

  useEffect(() => {
    updateViewportMetrics();

    const handleViewportChange = () => {
      updateViewportMetrics();
      scrollToBottom("auto");
    };

    const handleWindowScroll = () => {
      if (typeof window !== "undefined" && window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleWindowScroll, { passive: true });

    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (vv) {
      vv.addEventListener("resize", handleViewportChange);
      vv.addEventListener("scroll", handleViewportChange);
    }

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleWindowScroll);
      if (vv) {
        vv.removeEventListener("resize", handleViewportChange);
        vv.removeEventListener("scroll", handleViewportChange);
      }
    };
  }, [updateViewportMetrics, scrollToBottom]);

  const isKeyboardOpen =
    typeof window !== "undefined" && viewportHeight
      ? viewportHeight < window.innerHeight * 0.82
      : false;

  // 1. Oturum Kontrolü & Kullanıcı Temasını Uygula
  useEffect(() => {
    checkAuth().then((authed) => {
      if (!authed) {
        router.replace("/login");
      }
    });

    // Eski yerel tema kalıntılarını temizle (tek merkez parametreler)
    if (typeof window !== "undefined") {
      localStorage.removeItem("aura_user_theme");
    }
  }, [checkAuth, router]);

  // 2. WebSocket ve Konuşmaları Yükle
  useEffect(() => {
    if (isAuthenticated) {
      connect();
      loadConversations();
      loadStarredMessages();
      loadStories();
    }
  }, [isAuthenticated]);

  // 2b. Bildirim İzni ve Web Push Otomatik Kaydı
  useEffect(() => {
    if (!isAuthenticated) return;
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        const timer = setTimeout(() => {
          notificationManager.requestPermission().then((granted) => {
            if (granted) {
              subscribeUserToPush().catch(() => {});
            }
          });
        }, 2500);
        return () => clearTimeout(timer);
      } else if (Notification.permission === "granted") {
        getPushSubscription().then((sub) => {
          if (!sub) {
            subscribeUserToPush().catch(() => {});
          }
        });
      }
    }
  }, [isAuthenticated]);

  // Konuşma değiştiğinde bayrakları sıfırla
  useEffect(() => {
    setIsEmojiPickerOpen(false);
    if (!activeConversationId) return;
    initialScrolledConvsRef.current[activeConversationId] = false;
    isPrependingOlderRef.current = false;
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.overflowY = "hidden";
    }
  }, [activeConversationId]);

  // 3. Mesaj listesi otomatik en alta kaydırma
  useEffect(() => {
    if (!activeConversationId) return;
    const currentMsgs = messages[activeConversationId] || [];

    // Mesajlar henüz yüklenmediyse bekle
    if (currentMsgs.length === 0) return;

    // A. İlk açılışta veya konuşma değiştirildiğinde: ANINDA ve KESİN en alta sabitle
    if (!initialScrolledConvsRef.current[activeConversationId]) {
      const snapToBottom = () => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: "auto", block: "end" });
        }
      };

      // İlk açılışta kesinlikle 'auto' (anlık) tabana yerleş, asla animasyonla kaydırma
      snapToBottom();
      const r1 = requestAnimationFrame(snapToBottom);
      const t1 = setTimeout(snapToBottom, 30);
      const t2 = setTimeout(snapToBottom, 100);
      const t3 = setTimeout(() => {
        snapToBottom();
        // Artık kullanıcı en alta indi, bundan sonra onScroll eski mesajları çekebilir
        if (activeConversationId) {
          initialScrolledConvsRef.current[activeConversationId] = true;
        }
      }, 250);

      prevMessagesCountRef.current[activeConversationId] = currentMsgs.length;

      return () => {
        cancelAnimationFrame(r1);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }

    // B. Eğer eski mesajlar yukarı eklendiyse (sayfalama / pagination): alta kaydırma!
    if (isPrependingOlderRef.current) {
      isPrependingOlderRef.current = false;
      prevMessagesCountRef.current[activeConversationId] = currentMsgs.length;
      return;
    }

    // C. Yeni bir mesaj geldiğinde (aşağıya eklendiğinde)
    const prevCount = prevMessagesCountRef.current[activeConversationId] || 0;
    prevMessagesCountRef.current[activeConversationId] = currentMsgs.length;

    if (currentMsgs.length > prevCount) {
      const isHidden = typeof document !== "undefined" && document.hidden;
      if (isHidden) {
        scrollToBottom("auto");
      } else {
        const el = messagesContainerRef.current;
        const isNearBottom = el
          ? el.scrollHeight - el.scrollTop - el.clientHeight < 250
          : true;
        const lastMsg = currentMsgs[currentMsgs.length - 1];
        const isMine = lastMsg?.is_mine;

        if (isNearBottom || isMine) {
          scrollToBottom("smooth");
          const timer = setTimeout(() => scrollToBottom("auto"), 100);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [messages, activeConversationId, scrollToBottom]);

  // 3b. Kullanıcı telefon kilidini açtığında veya sekmeye geri döndüğünde bağlantıyı tazele ve inaktiviteyi denetle
  useEffect(() => {
    // Doğrudan DOM müdahalesi ile anında senkron kalkan çekme (React render döngüsünü beklemeden)
    const showShieldSynchronously = () => {
      if (typeof document !== "undefined") {
        const curtain = document.getElementById("aura-privacy-curtain");
        const main = document.getElementById("aura-main-content");
        if (curtain) {
          curtain.style.setProperty("display", "flex", "important");
          curtain.style.setProperty("visibility", "visible", "important");
          curtain.style.setProperty("opacity", "1", "important");
          void curtain.offsetHeight; // Chromium ve Safari için anında layout reflow zorla
        }
        if (main) {
          main.style.setProperty("visibility", "hidden", "important");
        }
      }
    };

    const hideShieldSynchronously = () => {
      if (typeof document !== "undefined") {
        const curtain = document.getElementById("aura-privacy-curtain");
        const main = document.getElementById("aura-main-content");
        if (curtain) {
          curtain.style.setProperty("display", "none", "important");
          curtain.style.setProperty("visibility", "hidden", "important");
        }
        if (main) {
          main.style.setProperty("visibility", "visible", "important");
        }
      }
    };

    // Güvenlik ayarlarını en güncel kaynaktan oku (önce localStorage önbelleği, yoksa Zustand store)
    const getEffectiveSecuritySettings = () => {
      if (typeof window !== "undefined") {
        try {
          const cached = localStorage.getItem("aura_security_settings");
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && typeof parsed === "object") {
              return parsed;
            }
          }
        } catch (e) {}
      }
      return useSettingsStore.getState().settings?.security_settings;
    };

    // Zaman Takvimi Kuralı: Belirlenen gün ve saat aralığında mıyız?
    const isScheduleActiveNow = (sec: any): boolean => {
      // Zaman takvimi açıkça aktif edilmemişse 7/24 kesintisiz devrededir!
      if (!sec || sec.inactivity_schedule_enabled !== true) {
        return true;
      }

      const now = new Date();
      const day = now.getDay(); // 0: Pazar, 6: Cumartesi
      const isWeekend = day === 0 || day === 6;

      if (isWeekend && sec.inactivity_weekend_full !== false) {
        return true;
      }

      // Saat kontrolü (hafta içi veya hafta sonu tam gün kapalıysa belirlenen saat aralığı)
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const parseTimeToMinutes = (t?: string, defaultMin: number = 0) => {
        if (!t || !t.includes(":")) return defaultMin;
        const parts = t.split(":");
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
      };

      const startMinutes = parseTimeToMinutes(sec.inactivity_weekday_start, 17 * 60 + 30); // 17:30
      const endMinutes = parseTimeToMinutes(sec.inactivity_weekday_end, 8 * 60 + 30); // 08:30

      if (startMinutes > endMinutes) {
        // Geceyi aşan aralık (Örn: Hafta içi 17:30 akşam başlar, ertesi sabah 08:30'a kadar sürer)
        return currentMinutes >= startMinutes || currentMinutes < endMinutes;
      } else if (startMinutes < endMinutes) {
        // Aynı gün içi aralık (Örn: 09:00 - 18:00)
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
      }

      return true;
    };

    // İnaktivite süresini denetleyip gerekiyorsa anında yönlendiren yardımcı fonksiyon
    const checkInactivityAndRedirect = (): boolean => {
      const sec = getEffectiveSecuritySettings();
      if (!sec || !sec.inactivity_logout_enabled) {
        return false;
      }

      // Aktif sesli/görüntülü arama devam ediyorsa veya ses kaydı alınıyorsa ASLA atma!
      if (useCallStore.getState().callState !== "idle" || isRecordingVoice) {
        registerUserActivity(true);
        return false;
      }

      // Eğer zaman takvimi aktifse ve şu an koruma saatleri dışındaysak (örn. gündüz mesai saati):
      if (!isScheduleActiveNow(sec)) {
        return false;
      }

      const now = Date.now();
      const isHidden = typeof document !== "undefined" && document.hidden;
      const inactiveSinceStr =
        typeof window !== "undefined" ? localStorage.getItem("aura_inactive_since") : null;
      const lastActiveStr =
        typeof window !== "undefined" ? localStorage.getItem("aura_last_active") : null;

      const inactiveSince = inactiveSinceStr ? parseInt(inactiveSinceStr, 10) : 0;
      const lastActive = Math.max(
        lastInteractionRef.current || 0,
        lastActiveStr ? parseInt(lastActiveStr, 10) : 0
      );

      // Sayfa ön plandayken kullanıcı son 20 saniye içinde dokunmuş/yazmışsa eski bayat inactive_since varsa temizle
      if (!isHidden && now - lastActive < 20000 && inactiveSince > 0) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("aura_inactive_since");
        }
      }

      // Etkin inaktivite zaman damgası hesabı:
      // A) Sayfa arka planda / kilitli ise (isHidden): Telefonun kilitlendiği an (inactiveSince) veya son aktiflik anı kullanılır.
      // B) Sayfa ön planda ve açıksa (!isHidden): Kullanıcının son fiziksel işlem (dokunma, yazma, kaydırma) anı kullanılır!
      let effectiveInactiveAt = 0;
      if (isHidden) {
        if (inactiveSince > 0 && lastActive > 0) {
          effectiveInactiveAt = Math.min(inactiveSince, lastActive);
        } else {
          effectiveInactiveAt = inactiveSince || lastActive;
        }
      } else {
        effectiveInactiveAt = lastActive;
      }

      if (effectiveInactiveAt <= 0) {
        return false;
      }

      const elapsedMs = now - effectiveInactiveAt;
      const elapsedMinutes = elapsedMs / (1000 * 60);

      // Kullanıcının girdiği dakika değerini kesin sayısal olarak al (ASLA hardcoded değil)
      const parsedTimeout = Number(sec.inactivity_timeout_minutes);
      const timeoutMinutes = !isNaN(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 15;

      console.log(
        `⏱️ [Aura Inactivity] Denetim: Ön plan: ${!isHidden} / Geçen süre: ${elapsedMinutes.toFixed(
          2
        )} dk (${Math.round(elapsedMs / 1000)} sn) / Sınır: ${timeoutMinutes} dk`
      );

      if (elapsedMinutes >= timeoutMinutes) {
        console.warn(
          `🚨 [Aura Inactivity] Süre (${timeoutMinutes} dk) doldu! Oturum anında kapatılıyor ve yönlendiriliyor...`
        );
        setIsRedirecting(true);
        showShieldSynchronously();
        setIsPrivacyCurtainActive(true);

        if (typeof window !== "undefined") {
          localStorage.removeItem("aura_inactive_since");
          localStorage.removeItem("aura_last_active");
        }

        // 1. Soketi ve Store durumlarını sessizce kapat (Asla isAuthenticated: false yapma ki Aura yükleniyor... ekranına düşmesin!)
        try {
          useSocketStore.getState().disconnect();
          useChatStore.getState().reset();
          useCallStore.getState().resetCall();
        } catch (e) {}

        // 2. Arka planda sunucuya HttpOnly çerezleri temizlemesi için logout isteği at
        try {
          const apiBase = getApiBaseUrl().replace(/\/+$/, "");
          const logoutUrl = `${apiBase}/auth/logout`;
          if (typeof fetch !== "undefined") {
            fetch(logoutUrl, {
              method: "POST",
              credentials: "include",
              keepalive: true,
            }).catch(() => {});
          }
          if (typeof navigator !== "undefined" && navigator.sendBeacon) {
            navigator.sendBeacon(logoutUrl);
          }
        } catch (e) {}

        // 3. Hedef siteye ANINDA ve ASLA TAKILMAYACAK ŞEKİLDE yönlendir (Mobil Chrome kısıtlamalarını aşacak çoklu yöntem)
        let targetUrl = sec.inactivity_redirect_url?.trim() || "https://www.google.com";
        if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
          targetUrl = "https://" + targetUrl;
        }

        const forceNavigate = () => {
          try {
            const link = document.createElement("a");
            link.href = targetUrl;
            link.rel = "noreferrer noopener";
            link.target = "_self";
            document.body.appendChild(link);
            link.click();
          } catch (e) {}

          try {
            window.location.replace(targetUrl);
          } catch (e) {}
          try {
            window.location.href = targetUrl;
          } catch (e) {}
          try {
            window.location.assign(targetUrl);
          } catch (e) {}
        };

        // Hemen yönlendirmeyi başlat
        forceNavigate();

        // Mobil tarayıcılarda render döngüsü takılmalarına karşı aşamalı tetikleme
        setTimeout(forceNavigate, 30);
        setTimeout(forceNavigate, 100);
        setTimeout(forceNavigate, 300);

        // Kullanıcı ekrana dokunduğu anda anında kullanıcı etkileşimiyle fırlat (popup/navigation guard aşımı)
        if (typeof window !== "undefined") {
          window.addEventListener("touchstart", forceNavigate, { capture: true, once: true });
          window.addEventListener("pointerdown", forceNavigate, { capture: true, once: true });
          window.addEventListener("click", forceNavigate, { capture: true, once: true });
        }

        return true;
      }

      return false;
    };

    // Sayfa mount olduğunda süre aşımı varsa hemen fırlat
    if (checkInactivityAndRedirect()) {
      return;
    }

    const markUserActive = registerUserActivity;

    // İlk kez açılıyorsa başlangıç damgasını vur
    if (typeof window !== "undefined" && !localStorage.getItem("aura_last_active")) {
      markUserActive(true);
    }

    const handleGoingToBackground = () => {
      // Eğer zaten yönlendirme sürecindeysek hiçbir şey yapma
      if (isRedirecting) return;
      const sec = getEffectiveSecuritySettings();
      if (sec?.inactivity_logout_enabled && isScheduleActiveNow(sec)) {
        // DOM'da senkron kalkan çek ve reflow zorla (Mobil ekran kapanırken son frame kalkan olsun!)
        showShieldSynchronously();
        setIsPrivacyCurtainActive(true);
        if (typeof window !== "undefined") {
          const nowTs = Date.now().toString();
          localStorage.setItem("aura_inactive_since", nowTs);
          console.log("🔒 [Aura Inactivity] Kilitlendi / Arka plana geçti. Zaman:", new Date().toLocaleTimeString());
        }
      }
    };

    const handleComingToForeground = () => {
      // Önce inaktivite zaman aşımını kontrol et
      if (checkInactivityAndRedirect()) {
        return; // Süre dolduysa anında yönlendirir, kalkan açık kalır!
      }

      // Süre dolmadıysa kalkanı kaldır ve kilitlenme damgasını temizle
      hideShieldSynchronously();
      setIsPrivacyCurtainActive(false);
      if (typeof window !== "undefined") {
        localStorage.removeItem("aura_inactive_since");
        markUserActive(true);
      }

      notificationManager.stopFlash();

      // Kilit ekranı geçiş animasyonunu karşılamak için aşamalı metrik güncellemesi
      updateViewportMetrics();
      setTimeout(updateViewportMetrics, 100);
      setTimeout(updateViewportMetrics, 300);

      // Kilit açıldığında document scroll'unu sıfırla ve mesajları tam tabana çek
      if (typeof window !== "undefined") {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
      }
      scrollToBottom("auto");
      setTimeout(() => scrollToBottom("auto"), 60);
      setTimeout(() => scrollToBottom("auto"), 150);
      setTimeout(() => scrollToBottom("auto"), 350);

      // 1. WebSocket kopmuşsa yeniden bağla
      const socketState = useSocketStore.getState();
      if (
        !socketState.socket ||
        (socketState.socket.readyState !== WebSocket.OPEN &&
          socketState.socket.readyState !== WebSocket.CONNECTING)
      ) {
        socketState.connect();
      }

      // 2. Kilit açıldığında güncel konuşmaları ve okunmamış sayılarını çek
      useChatStore.getState().loadConversations();

      // 3. Açık sohbet varsa mesajları tazele
      const curConvId = useChatStore.getState().activeConversationId;
      if (curConvId) {
        useChatStore
          .getState()
          .loadMessages(curConvId)
          .then(() => {
            scrollToBottom("auto");
            setTimeout(() => scrollToBottom("auto"), 50);
            setTimeout(() => scrollToBottom("auto"), 150);
          })
          .catch(() => {});

        const allMsgs = useChatStore.getState().messages;
        const convMessages = allMsgs[curConvId] || [];
        const unreadIds = convMessages
          .filter((m) => !m.is_mine && !m.read_at)
          .map((m) => m.id);

        if (unreadIds.length > 0) {
          useSocketStore.getState().sendAction("read_ack", {
            conversation_id: curConvId,
            message_ids: unreadIds,
          });
        }
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.hidden) {
        handleGoingToBackground();
      } else {
        handleComingToForeground();
      }
    };

    const handlePageShow = () => {
      handleComingToForeground();
    };

    const handleUserInteraction = () => {
      // Sadece sayfa arka plandayken / kilitliyken gelen uyanış dokunuşu süreyi sıfırlamasın:
      const isHidden = typeof document !== "undefined" && document.hidden;
      if (isHidden && checkInactivityAndRedirect()) {
        return;
      }
      markUserActive();
    };

    const activityEvents = [
      "touchstart",
      "touchmove",
      "touchend",
      "mousedown",
      "scroll",
      "keydown",
    ];
    activityEvents.forEach((ev) => {
      window.addEventListener(ev, handleUserInteraction, { passive: true, capture: true });
    });

    // Kullanıcı ekran açıkken uyuyakaldığında veya dokunmadığında süresi dolunca anında yakala
    const idleCheckInterval = setInterval(() => {
      checkInactivityAndRedirect();
    }, 1000);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handleGoingToBackground);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleComingToForeground);
    window.addEventListener("freeze", handleGoingToBackground);
    window.addEventListener("resume", handleComingToForeground);
    window.addEventListener("online", handleComingToForeground);

    return () => {
      clearInterval(idleCheckInterval);
      activityEvents.forEach((ev) => {
        window.removeEventListener(ev, handleUserInteraction, { capture: true } as any);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handleGoingToBackground);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleComingToForeground);
      window.removeEventListener("freeze", handleGoingToBackground);
      window.removeEventListener("resume", handleComingToForeground);
      window.removeEventListener("online", handleComingToForeground);
    };
  }, [scrollToBottom, updateViewportMetrics]);

  // 4. Kişiler sekmesine geçildiğinde tüm kullanıcıları yükle
  useEffect(() => {
    if (activeTab === "contacts" && isAuthenticated) {
      setIsLoadingContacts(true);
      api
        .get("/users/search?q=")
        .then((res) => {
          setContactsList(res.data);
        })
        .catch((err) => console.error("Kişiler yüklenemedi:", err))
        .finally(() => setIsLoadingContacts(false));
    }
  }, [activeTab, isAuthenticated]);

  // 5. Kullanıcı Arama
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      const delay = setTimeout(async () => {
        try {
          const res = await api.get(`/users/search?q=${encodeURIComponent(searchQuery)}`);
          setSearchResults(res.data);
        } catch (e) {
          console.error("Arama hatası:", e);
        }
      }, 300);
      return () => clearTimeout(delay);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const activeMessages = activeConversationId ? messages[activeConversationId] || [] : [];
  const isOtherTyping = activeConversationId ? typingMap[activeConversationId] : false;

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

  // Medya Ön-Yükleme (Media Preload): Aktif sohbetteki son 5 medya görselini önceden önbelleğe alır
  useEffect(() => {
    if (!activeConversationId) return;
    const mediaUrls = galleryItems.slice(0, 5).map((it) => it.url);
    mediaUrls.forEach((url) => {
      if (url && (url.endsWith(".jpg") || url.endsWith(".png") || url.endsWith(".webp") || url.includes("format="))) {
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

  // Hazırlanan Medyayı Gönderme (İlerleme çubuğu, İptal ve Sıkıştırma destekli)
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

  // Sohbet değiştiğinde aramayı sıfırla
  useEffect(() => {
    setIsChatSearchOpen(false);
    setChatSearchQuery("");
    setCurrentMatchIndex(0);
  }, [activeConversationId]);

  // Sunucu tabanlı geçmiş arama sonuçları
  const [serverSearchResults, setServerSearchResults] = useState<any[]>([]);

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

  // Sohbet İçi Arama ve Eşleşmeler (WhatsApp Tarzı + Sunucu Geçmişi Birleşimi)
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

  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const handleJumpToMessage = async (conversationId: string, messageId: string) => {
    if (activeConversationId !== conversationId) {
      await selectConversation(conversationId);
    }
    setShowContactDrawer(false);
    setHighlightedMessageId(messageId);
    setTimeout(() => {
      const el = document.getElementById(`msg-${messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 200);
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
      const el = document.getElementById(`msg-${activeMatchedMessageId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
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

  // Masaüstü Klavye Kısayolları (Ctrl+K ile Arama, Esc ile Kapatma)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Ctrl+K veya Cmd+K ile Canlı Aramaya Odaklan
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // 2. Esc tuşu ile açık modalları, önizlemeleri veya yanıtlamayı kapat
      if (e.key === "Escape") {
        if (isGalleryOpen) {
          setIsGalleryOpen(false);
          return;
        }
        if (previewPdf) {
          setPreviewPdf(null);
          return;
        }
        if (isStagingModalOpen) {
          setIsStagingModalOpen(false);
          setStagedFile(null);
          return;
        }
        if (selectedMessageInfo) {
          setSelectedMessageInfo(null);
          return;
        }
        if (isEmojiPickerOpen) {
          setIsEmojiPickerOpen(false);
          return;
        }
        if (isSelectionMode) {
          clearSelection();
          return;
        }
        if (replyingTo) {
          setReplyingTo(null);
          return;
        }
        if (editingMessageId) {
          setEditingMessageId(null);
          return;
        }
        if (isChatSearchOpen) {
          setIsChatSearchOpen(false);
          setChatSearchQuery("");
          return;
        }
        if (searchQuery) {
          setSearchQuery("");
          return;
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [
    isGalleryOpen,
    previewPdf,
    isStagingModalOpen,
    selectedMessageInfo,
    isEmojiPickerOpen,
    isSelectionMode,
    replyingTo,
    editingMessageId,
    isChatSearchOpen,
    searchQuery,
    clearSelection,
    setSelectedMessageInfo,
    setReplyingTo,
    setEditingMessageId,
  ]);

  // Toplam okunmamış mesaj sayısı
  const totalUnreadCount = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);

  // Yıldızlı mesajlar listesi (DB ve hafızadaki yıldızlılar birleşimi)
  const combinedStarredMessages = useMemo(() => {
    const memoryStarred = Object.values(messages).flat().filter((m) => m.is_starred);
    const map = new Map<string, any>();
    (starredMessages || []).forEach((m) => map.set(m.id, m));
    memoryStarred.forEach((m) => {
      if (m.is_starred) map.set(m.id, m);
      else map.delete(m.id);
    });
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [messages, starredMessages]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || !activeConversationId) return;

    registerUserActivity(true);
    sendMessage(activeConversationId, inputMessage.trim());
    setInputMessage("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.overflowY = "hidden";
    }
    setTimeout(() => scrollToBottom("smooth"), 50);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    lastTypingSentRef.current = 0;
    sendTyping(activeConversationId, false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    registerUserActivity();
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
      registerUserActivity();
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
    [inputMessage, activeConversationId, sendTyping, adjustTextareaHeight]
  );

  const handleStartChat = async (targetUserId: string) => {
    setSearchQuery("");
    setSearchResults([]);
    setActiveTab("chats");
    await startNewConversation(targetUserId);
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  if (isRedirecting || isLoading || !isAuthenticated) {
    return (
      <div
        onClick={() => {
          if (isRedirecting) {
            try {
              const cached = typeof window !== "undefined" ? localStorage.getItem("aura_security_settings") : null;
              const s = cached ? JSON.parse(cached) : null;
              let url = s?.inactivity_redirect_url?.trim() || "https://www.google.com";
              if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
              window.location.replace(url);
              window.location.href = url;
            } catch (e) {}
          }
        }}
        className="flex h-[100dvh] w-screen items-center justify-center bg-grupo-dark-bg text-white cursor-pointer select-none"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-grupo-accent border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-slate-400 font-medium">Aura yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* GİZLİLİK KALKANI: Tuş kilidi kapatıldığında veya inaktivite yönlendirmesinde sohbeti sıfır sızıntıyla örter */}
      <div
        id="aura-privacy-curtain"
        onClick={() => {
          if (isRedirecting) {
            try {
              const cached = typeof window !== "undefined" ? localStorage.getItem("aura_security_settings") : null;
              const s = cached ? JSON.parse(cached) : null;
              let url = s?.inactivity_redirect_url?.trim() || "https://www.google.com";
              if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
              window.location.replace(url);
              window.location.href = url;
            } catch (e) {}
          }
        }}
        className="fixed inset-0 z-[9999999] bg-[#090A0F] flex flex-col items-center justify-center pointer-events-auto select-none transition-none cursor-pointer"
        style={{
          display: isPrivacyCurtainActive ? "flex" : "none",
          backgroundColor: "var(--background, #090A0F)",
        }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-grupo-accent border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-slate-400 font-medium">
            Aura yükleniyor...
          </p>
        </div>
      </div>

      <div
        id="aura-main-content"
        className="fixed inset-x-0 flex flex-col w-full bg-grupo-dark-bg text-slate-100 select-none overflow-hidden"
        style={{
          top: `${viewportTop}px`,
          height: viewportHeight ? `${viewportHeight}px` : "100%",
          maxHeight: viewportHeight ? `${viewportHeight}px` : "100%",
          visibility: isPrivacyCurtainActive ? "hidden" : "visible",
        }}
      >
        {/* Çevrimdışı / Yeniden Bağlanma Bildirim Çubuğu (5 saniyeden uzun süren kesintilerde Outbox Durumu ile) */}
        {!isConnected && showOfflineBanner && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-1.5 flex items-center justify-between text-xs text-amber-300 backdrop-blur-md z-40 transition-all shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
              <span>
                {isReconnecting
                  ? "Bağlantı koptu, yeniden bağlanılıyor..."
                  : "Çevrimdışı mod. Mesajlarınız cihazda sıraya alınıyor."}
              </span>
              {pendingQueueCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-[10px] font-mono font-medium">
                  {pendingQueueCount} bekleyen
                </span>
              )}
            </div>
            <button
              onClick={() => connect()}
              className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-medium transition cursor-pointer text-[11px]"
            >
              Tekrar Dene
            </button>
          </div>
        )}

        <div className="flex-1 flex w-full overflow-hidden relative">
        {/* 1. SÜTUN: Grupo Açılır/Kapanır Sol Dikey Menü (SideNavigation) */}
        <SideNavigation
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === "settings") setIsSettingsOpen(true);
        }}
        unreadCount={totalUnreadCount}
        starredCount={combinedStarredMessages.length}
        isConnected={isConnected}
        user={user}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAdmin={() => setIsAdminPanelOpen(true)}
        onLogout={handleLogout}
      />

      {/* 2. SÜTUN: Sohbet / Rehber / Yıldızlı Listesi (AsideList - 340px) */}
      <aside
        className={`${
          activeConversationId ? "hidden md:flex" : "flex w-full"
        } md:w-[340px] bg-grupo-dark-card border-r border-grupo-dark-border flex-col z-10 flex-shrink-0 h-full`}
      >
        {/* Kullanıcı Profili Üst Barı (Mobilde görünür) */}
        <div className="p-3.5 sm:p-4 border-b border-grupo-dark-border flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="relative flex-shrink-0 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-sm text-grupo-accent overflow-hidden">
                {user?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatar_url}
                    alt={user.display_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  user?.display_name?.charAt(0).toUpperCase() || "U"
                )}
              </div>
              <span
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-grupo-dark-card ${
                  isConnected ? "bg-emerald-500" : "bg-rose-500"
                }`}
              ></span>
            </button>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white truncate">{user?.display_name}</h2>
              <p className="text-xs text-slate-400 truncate">@{user?.username}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 md:hidden">
            <button
              onClick={() => setIsAdminPanelOpen(true)}
              title="Aura Parametre Yönetimi"
              className="p-2 rounded-xl text-amber-400 hover:text-amber-300 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Sliders className="w-4 h-4" />
            </button>
            <button
              onClick={handleLogout}
              title="Çıkış Yap"
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Canlı Arama Kutusu */}
        <div className="p-3 border-b border-grupo-dark-border">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === "contacts"
                  ? "Kişilerde ara..."
                  : activeTab === "starred"
                  ? "Yıldızlılarda ara..."
                  : "Sohbet veya kişi ara..."
              }
              className="w-full bg-slate-900/80 border border-grupo-dark-border rounded-xl py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-grupo-accent transition-colors"
            />
          </div>
        </div>

        {/* 24 Saatlik Hikayeler / Durumlar Barı (WhatsApp & Instagram Modu) */}
        {!searchQuery.trim() && activeTab === "chats" && (
          <StoriesBar />
        )}

        {/* Arama Sonuçları Varsa */}
        {searchQuery.trim().length >= 2 ? (
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <div className="px-3 py-1.5 text-[11px] font-bold uppercase text-slate-400 tracking-wider">
              Arama Sonuçları ({searchResults.length})
            </div>
            {searchResults.map((u) => {
              const uStory = storyGroups.find((g) => g.user.id === u.id && g.stories.length > 0);
              const uHasStory = !!uStory;
              const uUnviewed = !!uStory?.has_unviewed;
              const uCloseFriends = !!uStory?.has_close_friends;

              return (
                <button
                  key={u.id}
                  onClick={() => handleStartChat(u.id)}
                  className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 flex items-center justify-between text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div
                      onClick={
                        uHasStory
                          ? (e) => {
                              e.stopPropagation();
                              openViewer(uStory, 0);
                            }
                          : undefined
                      }
                      title={uHasStory ? `${u.display_name} hikayesini izle` : undefined}
                      className={`relative flex-shrink-0 ${uHasStory ? "cursor-pointer group/search-story" : ""}`}
                    >
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                          uHasStory
                            ? `p-[2px] group-hover/search-story:scale-105 ${
                                uUnviewed
                                  ? uCloseFriends
                                    ? "bg-gradient-to-tr from-emerald-500 via-green-400 to-teal-400 ring-2 ring-emerald-500/30"
                                    : "bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-400 ring-2 ring-pink-500/20"
                                  : uCloseFriends
                                  ? "border-2 border-emerald-500/70"
                                  : "border-2 border-slate-700"
                              }`
                            : "border border-slate-700 bg-slate-800"
                        }`}
                      >
                        <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-grupo-accent overflow-hidden border border-grupo-dark-card">
                          {u.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolveMediaUrl(u.avatar_url)}
                              alt={u.display_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            u.display_name.charAt(0).toUpperCase()
                          )}
                        </div>
                      </div>
                      {uHasStory && uCloseFriends && uUnviewed && (
                        <span
                          title="Yakın Arkadaşlar Hikayesi"
                          className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[7px] font-black border border-slate-950 shadow-sm z-10"
                        >
                          ★
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{u.display_name}</div>
                      <div className="text-xs text-slate-400">@{u.username}</div>
                    </div>
                  </div>
                  <UserPlus className="w-4 h-4 text-grupo-accent" />
                </button>
              );
            })}
          </div>
        ) : activeTab === "contacts" ? (
          /* TAB 2: Kişiler / Rehber Listesi */
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <div className="px-3 py-1.5 text-[11px] font-bold uppercase text-slate-400 tracking-wider">
              Kayıtlı Kişiler ({contactsList.length})
            </div>
            {isLoadingContacts ? (
              <div className="p-8 text-center text-xs text-slate-500">Kişiler yükleniyor...</div>
            ) : contactsList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Sistemde henüz başka kayıtlı kullanıcı yok.
              </div>
            ) : (
              contactsList.map((contact) => {
                const contactStory = storyGroups.find((g) => g.user.id === contact.id && g.stories.length > 0);
                const contactHasStory = !!contactStory;
                const contactUnviewed = !!contactStory?.has_unviewed;
                const contactCloseFriends = !!contactStory?.has_close_friends;

                return (
                  <button
                    key={contact.id}
                    onClick={() => handleStartChat(contact.id)}
                    className="w-full p-3 rounded-2xl hover:bg-slate-800/60 flex items-center gap-3 text-left transition-all cursor-pointer"
                  >
                    <div
                      onClick={
                        contactHasStory
                          ? (e) => {
                              e.stopPropagation();
                              openViewer(contactStory, 0);
                            }
                          : undefined
                      }
                      title={contactHasStory ? `${contact.display_name} hikayesini izle` : undefined}
                      className={`relative flex-shrink-0 ${contactHasStory ? "cursor-pointer group/contact-story" : ""}`}
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                          contactHasStory
                            ? `p-[2px] group-hover/contact-story:scale-105 ${
                                contactUnviewed
                                  ? contactCloseFriends
                                    ? "bg-gradient-to-tr from-emerald-500 via-green-400 to-teal-400 ring-2 ring-emerald-500/30"
                                    : "bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-400 ring-2 ring-pink-500/20"
                                  : contactCloseFriends
                                  ? "border-2 border-emerald-500/70"
                                  : "border-2 border-slate-700"
                              }`
                            : "border border-slate-700 bg-slate-800"
                        }`}
                      >
                        <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center font-bold text-sm text-grupo-accent overflow-hidden border border-grupo-dark-card">
                          {contact.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolveMediaUrl(contact.avatar_url)}
                              alt={contact.display_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            contact.display_name.charAt(0).toUpperCase()
                          )}
                        </div>
                      </div>
                      {contact.online_status === 1 && (
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-grupo-dark-card z-10"></span>
                      )}
                      {contactHasStory && contactCloseFriends && contactUnviewed && (
                        <span
                          title="Yakın Arkadaşlar Hikayesi"
                          className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[8px] font-black border border-slate-950 shadow-sm z-10"
                        >
                          ★
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-white truncate">{contact.display_name}</div>
                        {contact.online_status === 1 ? (
                          <span className="text-[10px] text-emerald-400 font-medium">Çevrimiçi</span>
                        ) : (
                          <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                            {formatLastSeen(contact.last_seen_at, contact.privacy_settings?.last_seen)}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 truncate">@{contact.username}</div>
                    </div>
                    <UserPlus className="w-4 h-4 text-grupo-accent flex-shrink-0" />
                  </button>
                );
              })
            )}
          </div>
        ) : activeTab === "starred" ? (
          /* TAB 3: Yıldızlı Mesajlar Listesi */
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            <div className="px-3 py-1.5 text-[11px] font-bold uppercase text-amber-400 tracking-wider flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>Yıldızlı Mesajlar ({combinedStarredMessages.length})</span>
            </div>
            {combinedStarredMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <Star className="w-10 h-10 mb-2 opacity-30 text-amber-400" />
                <p className="text-xs font-medium">Yıldızlı mesajınız bulunmuyor.</p>
                <p className="text-[11px] text-slate-600 mt-1">
                  Önemli mesajların menüsünden &quot;Yıldızla&quot; seçeneğini kullanabilirsiniz.
                </p>
              </div>
            ) : (
              combinedStarredMessages.map((msg) => (
                <div
                  key={msg.id}
                  onClick={() => handleJumpToMessage(msg.conversation_id, msg.id)}
                  className="group relative w-full p-3 rounded-2xl bg-slate-900/70 border border-slate-800 hover:bg-slate-850 hover:border-amber-500/50 text-left transition-all cursor-pointer shadow-xs"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-xs text-amber-400 font-semibold flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span>{msg.is_mine ? "Sen" : "Karşı Taraf"}</span>
                      {msg.sent_at && (
                        <span className="text-[10px] text-slate-500 font-normal">
                          • {new Date(msg.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                    {/* Yıldızı Kaldır Butonu */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStar(msg.id);
                      }}
                      title="Yıldızı Kaldır"
                      className="p-1.5 rounded-xl text-amber-400/80 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <StarOff className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-200 line-clamp-2 leading-relaxed">
                    {msg.message_type === "voice"
                      ? "🎤 Sesli Mesaj"
                      : msg.message_type === "image"
                      ? "📷 Fotoğraf"
                      : msg.message_type === "video"
                      ? "🎬 Video"
                      : msg.message_type === "file"
                      ? "📄 Belge"
                      : msg.content}
                  </p>
                </div>
              ))
            )}
          </div>
        ) : (
          /* TAB 1: Sohbetler Listesi */
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {conversations.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <MessageSquare className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-xs">Henüz bir sohbet yok.</p>
                <p className="text-[11px] text-slate-600 mt-1">
                  &quot;Kişiler&quot; sekmesine geçerek bir kullanıcıyla sohbete başlayabilirsiniz.
                </p>
              </div>
            ) : (
              conversations.map((conv) => (
                <ConversationListItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeConversationId}
                  isTyping={!!typingMap[conv.id]}
                  onSelect={() => selectConversation(conv.id)}
                  onDelete={() => deleteConversation(conv.id)}
                  onClearHistory={() => clearConversation(conv.id)}
                />
              ))
            )}
          </div>
        )}

        {/* Mobilde Alt Navigasyon Barı (Sohbet açık değilken) */}
        {!activeConversationId && (
          <MobileNavigation
            activeTab={activeTab}
            onTabChange={(tab) => {
              setActiveTab(tab);
              if (tab === "settings") setIsSettingsOpen(true);
            }}
            unreadCount={totalUnreadCount}
            starredCount={combinedStarredMessages.length}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenAdmin={() => setIsAdminPanelOpen(true)}
          />
        )}
      </aside>

      {/* 3. SÜTUN: Merkez Sohbet Penceresi (Flex-1) */}
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
            <header className="h-16 border-b border-grupo-dark-border px-2.5 sm:px-6 flex items-center justify-between bg-grupo-dark-card/60 backdrop-blur-md z-10 flex-shrink-0">
              <div
                onClick={() => setShowContactDrawer(!showContactDrawer)}
                className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-2 cursor-pointer"
              >
                {/* Mobilde Geri Butonu (<-- Geri) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBackToChatList();
                  }}
                  title="Geri Dön"
                  className="md:hidden p-1.5 sm:p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer -ml-1 flex-shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <div
                  onClick={
                    hasOtherStory
                      ? (e) => {
                          e.stopPropagation();
                          openViewer(otherUserStoryGroup, 0);
                        }
                      : undefined
                  }
                  title={
                    hasOtherStory
                      ? `${activeConv.other_user.display_name} hikayesini izle`
                      : undefined
                  }
                  className={`relative flex-shrink-0 ${
                    hasOtherStory ? "group/story-header cursor-pointer" : ""
                  }`}
                >
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all ${
                      hasOtherStory
                        ? `p-[2px] group-hover/story-header:scale-105 ${
                            hasOtherUnviewed
                              ? isOtherCloseFriends
                                ? "bg-gradient-to-tr from-emerald-500 via-green-400 to-teal-400 ring-2 ring-emerald-500/30 animate-in fade-in"
                                : "bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-400 ring-2 ring-pink-500/20 animate-in fade-in"
                              : isOtherCloseFriends
                              ? "border-2 border-emerald-500/70"
                              : "border-2 border-slate-700"
                          }`
                        : "border border-slate-700 bg-slate-800"
                    }`}
                  >
                    <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs sm:text-sm text-grupo-accent overflow-hidden border border-grupo-dark-card">
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
                  {activeConv.is_online && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-grupo-dark-card z-10"></span>
                  )}
                  {hasOtherStory && isOtherCloseFriends && hasOtherUnviewed && (
                    <span
                      title="Yakın Arkadaşlar Hikayesi"
                      className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[8px] font-black border border-slate-950 shadow-sm z-10"
                    >
                      ★
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-white truncate leading-tight">
                    {activeConv.other_user.display_name}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-400 truncate leading-tight mt-0.5">
                    {isOtherTyping ? (
                      <span
                        style={{ color: "var(--accent, #6366F1)" }}
                        className="font-semibold animate-pulse"
                      >
                        yazıyor...
                      </span>
                    ) : activeConv.is_online ? (
                      <span className="text-emerald-400 font-medium">Çevrimiçi</span>
                    ) : (
                      formatLastSeen(
                        activeConv.other_user.last_seen_at,
                        activeConv.other_user.privacy_settings?.last_seen
                      ) || "Çevrimdışı"
                    )}
                  </p>
                </div>
              </div>

              {/* Sesli / Görüntülü Arama & Profil Butonları */}
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                {settings?.call_settings?.enable_audio_calls !== false && (
                  <button
                    onClick={() => setConfirmCallType("audio")}
                    title="Sesli Arama Başlat"
                    className="p-2 sm:p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                )}
                {settings?.call_settings?.enable_video_calls !== false && (
                  <button
                    onClick={() => setConfirmCallType("video")}
                    title="Görüntülü Arama Başlat"
                    className="p-2 sm:p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-grupo-accent transition-colors cursor-pointer"
                  >
                    <Video className="w-4 h-4" />
                  </button>
                )}
                {/* Sohbet İçi Arama Butonu (Masaüstünde doğrudan görünür, mobilde 3 nokta menüsünde) */}
                <button
                  onClick={() => {
                    setIsChatSearchOpen(!isChatSearchOpen);
                    if (isChatSearchOpen) {
                      setChatSearchQuery("");
                      setCurrentMatchIndex(0);
                    }
                  }}
                  title="Sohbette Ara"
                  className={`hidden sm:flex p-2 sm:p-2.5 rounded-xl transition-colors cursor-pointer ${
                    isChatSearchOpen
                      ? "text-white shadow-md"
                      : "bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white"
                  }`}
                  style={
                    isChatSearchOpen
                      ? {
                          backgroundColor: "var(--accent, #6366F1)",
                          color: "var(--accent-text, #ffffff)",
                          boxShadow: "0 4px 12px var(--accent-shadow, rgba(99, 102, 241, 0.3))",
                        }
                      : undefined
                  }
                >
                  <Search className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setShowContactDrawer(!showContactDrawer)}
                  title="Kişi Bilgisi"
                  className="hidden sm:flex p-2 sm:p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <Info className="w-4 h-4" />
                </button>

                {/* Sohbet İşlemleri Menüsü (Web & Mobil) */}
                <div className="relative">
                  <button
                    onClick={() => setShowActiveChatMenu(!showActiveChatMenu)}
                    title="Sohbet Seçenekleri"
                    className="p-2 sm:p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {showActiveChatMenu && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-11 w-44 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl py-1.5 z-50 text-xs animate-in fade-in zoom-in-95"
                    >
                      <button
                        onClick={() => {
                          setShowActiveChatMenu(false);
                          setShowContactDrawer(true);
                        }}
                        className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer sm:hidden"
                      >
                        <Info className="w-3.5 h-3.5 text-sky-400" />
                        <span>Kişi Bilgisi</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowActiveChatMenu(false);
                          setIsChatSearchOpen(true);
                        }}
                        className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <Search className="w-3.5 h-3.5" style={{ color: "var(--accent, #6366F1)" }} />
                        <span>Sohbette Ara</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowActiveChatMenu(false);
                          startSelectionMode();
                        }}
                        className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Mesajları Seç</span>
                      </button>
                      <div className="h-px bg-slate-800 my-1" />
                      <button
                        onClick={() => {
                          setShowActiveChatMenu(false);
                          setShowActiveDeleteConfirm("clear");
                        }}
                        className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <Eraser className="w-3.5 h-3.5 text-amber-400" />
                        <span>Geçmişi Temizle</span>
                      </button>
                      <div className="h-px bg-slate-800 my-1" />
                      <button
                        onClick={() => {
                          setShowActiveChatMenu(false);
                          setShowActiveDeleteConfirm("delete");
                        }}
                        className="w-full px-3 py-2 text-left text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 transition-colors font-medium cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                        <span>Sohbeti Sil</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/* ÇOKLU MESAJ SEÇİM EYLEM BARI */}
            {isSelectionMode && (
              <div className="bg-indigo-950/95 border-b border-indigo-700/60 px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 sm:gap-3 shadow-xl z-20 animate-in slide-in-from-top-2 duration-150 flex-shrink-0 backdrop-blur-md">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <button
                    onClick={clearSelection}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-indigo-200 hover:text-white transition-colors cursor-pointer flex-shrink-0"
                    title="Seçimi İptal Et"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <span className="text-xs sm:text-sm font-semibold text-white truncate">
                    {selectedMessageIds.length} mesaj seçildi
                  </span>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                  <button
                    onClick={() => selectAllMessages(activeConv.id)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    Tümünü Seç
                  </button>

                  {/* Benden Sil */}
                  <button
                    onClick={async () => {
                      if (selectedMessageIds.length === 0) return;
                      if (!confirm(`${selectedMessageIds.length} adet mesajı kendinizden silmek istediğinize emin misiniz?`)) return;
                      try {
                        await deleteSelectedMessages(false);
                      } catch (err: any) {
                        alert(err.response?.data?.error || "Mesajlar silinemedi.");
                      }
                    }}
                    disabled={selectedMessageIds.length === 0}
                    className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 disabled:opacity-50 text-rose-200 hover:text-white text-xs font-medium border border-rose-500/30 transition-colors cursor-pointer"
                    title="Seçili mesajları benden sil"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-300" />
                    <span className="hidden sm:inline">Benden Sil</span>
                  </button>

                  {/* Herkesten Sil (Sadece seçili tüm mesajlar bana aitse görünür) */}
                  {canDeleteSelectedForAll && (
                    <button
                      onClick={async () => {
                        if (selectedMessageIds.length === 0) return;
                        if (!confirm(`${selectedMessageIds.length} adet mesajı herkesten silmek istediğinize emin misiniz?`)) return;
                        try {
                          await deleteSelectedMessages(true);
                        } catch (err: any) {
                          alert(err.response?.data?.error || "Mesajlar silinemedi.");
                        }
                      }}
                      disabled={selectedMessageIds.length === 0}
                      className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold shadow transition-colors cursor-pointer"
                      title="Seçili mesajları herkesten sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Herkesten Sil</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* WHATSAPP TARZI SOHBET İÇİ ARAMA BARI */}
            {isChatSearchOpen && (
              <div className="bg-slate-900/95 border-b border-grupo-dark-border px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 sm:gap-3 shadow-lg z-10 animate-in slide-in-from-top-2 duration-150 flex-shrink-0">
                <div className="flex-1 flex items-center gap-2 bg-slate-950/80 border border-slate-700/80 rounded-xl px-3 py-1.5 focus-within:border-grupo-accent transition-colors">
                  <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={chatSearchQuery}
                    onChange={(e) => {
                      setChatSearchQuery(e.target.value);
                      setCurrentMatchIndex(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (e.shiftKey) handlePrevMatch();
                        else handleNextMatch();
                      } else if (e.key === "Escape") {
                        setIsChatSearchOpen(false);
                        setChatSearchQuery("");
                        setCurrentMatchIndex(0);
                      }
                    }}
                    placeholder="Sohbette ara (Enter: sonraki, Shift+Enter: önceki)..."
                    className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
                    autoFocus
                  />
                  {chatSearchQuery && (
                    <button
                      onClick={() => {
                        setChatSearchQuery("");
                        setCurrentMatchIndex(0);
                      }}
                      className="p-0.5 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Sonuç Sayacı ve Gezinme Okları (WhatsApp Web Style) */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {chatSearchQuery.trim() && (
                    <span className="text-[11px] font-semibold text-slate-400 px-2 py-1 rounded-lg bg-slate-800">
                      {searchFilteredMessages.length > 0
                        ? `${currentMatchIndex + 1} / ${searchFilteredMessages.length}`
                        : "Sonuç yok"}
                    </span>
                  )}

                  <button
                    onClick={handlePrevMatch}
                    disabled={searchFilteredMessages.length === 0}
                    title="Önceki Eşleşme (Yukarı)"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 disabled:opacity-30 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handleNextMatch}
                    disabled={searchFilteredMessages.length === 0}
                    title="Sonraki Eşleşme (Aşağı)"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 disabled:opacity-30 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => {
                      setIsChatSearchOpen(false);
                      setChatSearchQuery("");
                      setCurrentMatchIndex(0);
                    }}
                    title="Aramayı Kapat (Esc)"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer ml-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Mesaj Akışı ve Dinamik Ada Alanı */}
            <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
              {/* BİRLİKTE DİNLE DİNAMİK ADA (DYNAMIC ISLAND) */}
              <ListenTogetherIsland
                conversationId={activeConv.id}
                otherUserName={activeConv.other_user?.display_name || activeConv.other_user?.username}
                onOpenChooser={() => setIsListenTogetherOpen(true)}
              />

              {/* Mesaj Akışı */}
              <div
                ref={messagesContainerRef}
              onScroll={async (e) => {
                const el = e.currentTarget;
                if (!activeConversationId) return;

                // Konuşma henüz ilk kez tabana kaydırılmadıysa ASLA yukarı kaydırma sayfalama tetikleme
                if (!initialScrolledConvsRef.current[activeConversationId]) {
                  return;
                }

                if (
                  el.scrollTop < 60 &&
                  !loadingOlderMessages &&
                  hasMoreMessages[activeConversationId] !== false &&
                  el.scrollHeight > el.clientHeight
                ) {
                  const prevScrollHeight = el.scrollHeight;
                  const prevScrollTop = el.scrollTop;
                  isPrependingOlderRef.current = true;
                  const loaded = await loadOlderMessages(activeConversationId);
                  if (loaded) {
                    requestAnimationFrame(() => {
                      if (messagesContainerRef.current) {
                        const diff = messagesContainerRef.current.scrollHeight - prevScrollHeight;
                        messagesContainerRef.current.scrollTop = prevScrollTop + diff;
                      }
                    });
                  }
                }
              }}
              className="flex-1 min-h-0 p-3 sm:p-6 overflow-y-auto overflow-x-hidden overscroll-contain"
              style={{ scrollBehavior: "auto", overflowAnchor: "none" }}
            >
              {loadingOlderMessages && (
                <div className="flex justify-center py-2">
                  <div className="w-5 h-5 border-2 border-grupo-accent border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {activeMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
                  <Sparkles className="w-8 h-8 text-grupo-accent/50 mb-2" />
                  <p className="text-sm font-medium">Bu sohbette henüz mesaj yok.</p>
                  <p className="text-xs text-slate-600 mt-1">İlk mesajı göndererek başlayın!</p>
                </div>
              ) : (
                activeMessages.map((m, index) => {
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
                      <div id={`msg-${m.id}`} className="transition-all duration-300">
                        <MessageBubble
                          message={m}
                          searchQuery={chatSearchQuery}
                          isHighlightedMatch={m.id === activeMatchedMessageId}
                          onJumpToMessage={(targetId) => handleJumpToMessage(activeConv.id, targetId)}
                          otherUserName={activeConv.other_user.display_name}
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
                })
              )}
              <div ref={messagesEndRef} className="h-1 flex-shrink-0" style={{ overflowAnchor: "auto" }} />
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
                      onOpenListenTogether={() => setIsListenTogetherOpen(true)}
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
                            setTimeout(() => {
                              updateViewportMetrics();
                              scrollToBottom("auto");
                            }, 100);
                            setTimeout(() => {
                              updateViewportMetrics();
                              scrollToBottom("auto");
                            }, 300);
                          }}
                          onBlur={() => {
                            setIsInputFocused(false);
                            setTimeout(() => {
                              updateViewportMetrics();
                              scrollToBottom("auto");
                            }, 60);
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
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
            <div className="w-16 h-16 rounded-3xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-grupo-accent mb-4 shadow-xl">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Aura</h3>
            <p className="text-sm text-slate-400 max-w-sm mb-6">
              Sol taraftan bir sohbet seçin veya &quot;Kişiler&quot; menüsünden birini bularak mesajlaşmaya başlayın.
            </p>
          </div>
        )}

        {/* 4. SÜTUN: Grupo Sağ Çekmece (SlideOverDrawer - 340px) */}
        {showContactDrawer && activeConv && (
          <aside className="absolute right-0 top-0 bottom-0 w-full sm:w-[340px] bg-grupo-dark-card border-l border-grupo-dark-border z-30 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-grupo-dark-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Kişi Bilgisi</h3>
              <button
                onClick={() => setShowContactDrawer(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex flex-col items-center text-center border-b border-grupo-dark-border">
              <div
                onClick={() => {
                  if (hasOtherStory) {
                    openViewer(otherUserStoryGroup, 0);
                  } else if (activeConv.other_user.avatar_url) {
                    setPreviewMedia({
                      url: resolveMediaUrl(activeConv.other_user.avatar_url),
                      type: "image",
                      name: activeConv.other_user.display_name,
                    });
                  }
                }}
                className={`relative mb-3 flex flex-col items-center ${
                  hasOtherStory || activeConv.other_user.avatar_url
                    ? "cursor-pointer group/drawer-avatar"
                    : ""
                }`}
                title={
                  hasOtherStory
                    ? `${activeConv.other_user.display_name} hikayesini izle`
                    : activeConv.other_user.avatar_url
                    ? "Büyük fotoğrafı gör"
                    : undefined
                }
              >
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center transition-transform group-hover/drawer-avatar:scale-105 shadow-xl ${
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
                      : "border-2 border-grupo-accent/40"
                  }`}
                >
                  <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center font-bold text-2xl text-grupo-accent overflow-hidden border-2 border-grupo-dark-card">
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

                {/* WhatsApp tarzı Hikaye Rozeti / Butonu */}
                {hasOtherStory ? (
                  <div
                    className={`mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all group-hover/drawer-avatar:scale-105 shadow-md ${
                      hasOtherUnviewed
                        ? isOtherCloseFriends
                          ? "bg-emerald-500 text-slate-950 font-bold"
                          : "bg-gradient-to-r from-pink-500 via-rose-500 to-amber-400 text-white font-bold"
                        : isOtherCloseFriends
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-slate-800 text-slate-300 border border-slate-700"
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{hasOtherUnviewed ? "Hikayeyi İzle" : "Hikayeyi Gör"}</span>
                  </div>
                ) : null}
              </div>
              <h4 className="text-base font-bold text-white">{activeConv.other_user.display_name}</h4>
              <p className="text-xs text-slate-400">@{activeConv.other_user.username}</p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-slate-800/80">
                <span
                  className={`w-2 h-2 rounded-full ${
                    activeConv.is_online ? "bg-emerald-500" : "bg-slate-500"
                  }`}
                />
                <span className={activeConv.is_online ? "text-emerald-400" : "text-slate-400"}>
                  {activeConv.is_online
                    ? "Çevrimiçi"
                    : formatLastSeen(
                        activeConv.other_user.last_seen_at,
                        activeConv.other_user.privacy_settings?.last_seen
                      ) || "Çevrimdışı"}
                </span>
              </div>
            </div>

            <div className="p-4 space-y-4 flex-1 overflow-y-auto text-xs">
              {/* Öne Çıkanlar (Story Highlights) */}
              <div className="border-b border-grupo-dark-border pb-3">
                <span className="text-slate-400 font-semibold block mb-2">Öne Çıkanlar</span>
                <HighlightsBar
                  userId={activeConv.other_user.id}
                  isOwnProfile={activeConv.other_user.id === user?.id}
                />
              </div>

              <div>
                <span className="text-slate-400 font-semibold block mb-1">Hakkında</span>
                <p className="text-slate-200 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                  {activeConv.other_user.bio || "Henüz bir durum mesajı eklenmemiş."}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 font-semibold">Paylaşılan Medya</span>
                  {(() => {
                    const count = activeMessages.filter(
                      (m) =>
                        m.media_url &&
                        !m.is_deleted_for_all &&
                        (m.message_type === "image" ||
                          m.message_type === "video" ||
                          /\.(mp4|mov|webm|m4v|mkv|avi|3gp|png|jpg|jpeg|webp|gif)($|\?)/i.test(m.media_url || ""))
                    ).length;
                    return count > 0 ? (
                      <span className="text-[10px] text-slate-500 font-medium">{count} medya</span>
                    ) : null;
                  })()}
                </div>

                {(() => {
                  const mediaList = activeMessages.filter(
                    (m) =>
                      m.media_url &&
                      !m.is_deleted_for_all &&
                      (m.message_type === "image" ||
                        m.message_type === "video" ||
                        /\.(mp4|mov|webm|m4v|mkv|avi|3gp|png|jpg|jpeg|webp|gif)($|\?)/i.test(m.media_url || ""))
                  );

                  if (mediaList.length === 0) {
                    return (
                      <p className="text-slate-500 italic text-[11px] py-2">
                        Henüz paylaşılan fotoğraf veya video bulunmuyor.
                      </p>
                    );
                  }

                  return (
                    <div className="grid grid-cols-3 gap-2">
                      {mediaList.slice(0, 9).map((m) => {
                        const isVid =
                          m.message_type === "video" ||
                          /\.(mp4|mov|webm|m4v|mkv|avi|3gp)($|\?)/i.test(m.media_url || "");
                        const finalUrl = resolveMediaUrl(m.media_url);
                        return (
                          <div
                            key={m.id}
                            onClick={() => {
                              const idx = galleryItems.findIndex((it) => it.id === m.id);
                              setGalleryInitialIndex(idx >= 0 ? idx : 0);
                              setIsGalleryOpen(true);
                            }}
                            className="aspect-square rounded-xl overflow-hidden bg-slate-800 relative cursor-pointer group hover:scale-[1.03] hover:ring-2 hover:ring-grupo-accent/60 transition-all duration-150 shadow-sm"
                            title="Büyütmek için tıkla"
                          >
                            {isVid ? (
                              <div className="w-full h-full relative bg-black flex items-center justify-center">
                                <video
                                  src={finalUrl}
                                  className="w-full h-full object-cover pointer-events-none opacity-80"
                                  preload="metadata"
                                />
                                <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/10 transition-colors">
                                  <div className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-xs flex items-center justify-center text-white">
                                    <Play className="w-3 h-3 fill-white ml-0.5" />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={finalUrl}
                                alt="medya"
                                className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                                loading="lazy"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Sohbet Temizleme, Silme ve Engelleme Butonları */}
              <div className="pt-4 border-t border-slate-800 space-y-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (activeConv.is_blocked) {
                        await unblockConversation(activeConv.id);
                      } else {
                        await blockConversation(activeConv.id);
                      }
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                  className={`w-full py-2.5 px-3 rounded-xl ${
                    activeConv.is_blocked
                      ? "bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-400"
                      : "bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/30 text-amber-400"
                  } text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{activeConv.is_blocked ? "Engeli Kaldır" : "Kullanıcıyı Engelle"}</span>
                </button>
                <button
                  onClick={() => setShowActiveDeleteConfirm("clear")}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Eraser className="w-3.5 h-3.5 text-amber-400" />
                  <span>Sohbet Geçmişini Temizle</span>
                </button>
                <button
                  onClick={() => setShowActiveDeleteConfirm("delete")}
                  className="w-full py-2.5 px-3 rounded-xl bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/30 text-rose-400 hover:text-rose-300 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  <span>Sohbeti Sil</span>
                </button>
              </div>
            </div>
          </aside>
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
      </main>
      </div>

      {/* Global Modallar (Mobilde sohbet açık değilken <main> hidden olsa dahi her zaman erişilebilir) */}
      {/* WhatsApp Mesaj Bilgisi Modalı */}
      <MessageInfoModal />

      {/* Ayarlar ve Profil Modalı */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false);
          if (activeTab === "settings") {
            setActiveTab("chats");
          }
        }}
        onOpenAdmin={() => setIsAdminPanelOpen(true)}
      />

      {/* Yönetim Paneli Modalı (Aura Admin) */}
      <AdminPanelModal
        isOpen={isAdminPanelOpen}
        onClose={() => setIsAdminPanelOpen(false)}
      />

      {/* 24 Saatlik Hikaye / Durum Modalları (WhatsApp & Instagram Tarzı) */}
      <StoryViewerModal />
      <StoryCreatorModal />

      {/* Canlı Sesli & Görüntülü Arama Modalları (LiveKit WebRTC) */}
      <IncomingCallModal />
      <ActiveCallModal />

      {/* GELİŞMİŞ ÇOKLU MEDYA GALERİSİ (LIGHTBOX GALLERY) */}
      <MediaGalleryModal
        isOpen={isGalleryOpen}
        initialIndex={galleryInitialIndex}
        items={galleryItems}
        onClose={() => setIsGalleryOpen(false)}
      />

      {/* GÜVENLİ PDF ÖNİZLEME MODALI */}
      <PdfPreviewModal
        pdfUrl={previewPdf?.url || null}
        fileName={previewPdf?.name}
        onClose={() => setPreviewPdf(null)}
      />

      {/* MEDYA HAZIRLAMA / STAGING MODALI (PANO, SÜRÜKLE-BIRAK, AÇIKLAMA & İLERLEME) */}
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

      {/* 1-E-1 SENKRON MÜZİK DİNLEME (LISTEN TOGETHER) MODALI & ARKA PLAN KONTROLCÜSÜ */}
      <ListenTogetherModal
        isOpen={isListenTogetherOpen}
        conversationId={activeConversationId}
        onClose={() => setIsListenTogetherOpen(false)}
      />
      <ListenTogetherController />

      {/* Ana Ekran Geri Tuşu Çift Dokunma Bilgilendirme Kartı */}
      {showExitToast && (
        <div className="fixed bottom-16 sm:bottom-6 inset-x-0 mx-auto w-fit z-50 px-4 py-2 bg-slate-900/95 border border-slate-700 text-white text-xs font-medium rounded-full shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150 pointer-events-none select-none">
          Çıkmak için tekrar dokunun
        </div>
      )}

      {/* Gerçek Zamanlı Hikaye Bildirim Banner'ı */}
      <StoryNotificationBanner />

      {/* Öne Çıkanlar (Story Highlights) Tam Ekran Oynatıcı */}
      {activeHighlight && <StoryHighlightViewerModal />}
    </div>
    </>
  );
}
