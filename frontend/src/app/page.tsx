"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuthStore } from "@/store/useAuthStore";
import { useChatStore } from "@/store/useChatStore";
import { useSocketStore } from "@/store/useSocketStore";
import { useCallStore } from "@/store/useCallStore";
import { useStoryStore } from "@/store/useStoryStore";
import { useBackNavigation } from "@/lib/useBackNavigation";
import { useSettingsStore } from "@/store/useSettingsStore";
import SideNavigation, { NavTab } from "@/components/layout/SideNavigation";
import AsideList from "@/components/layout/AsideList";
import Chatbox from "@/components/layout/Chatbox";
import StoryNotificationBanner from "@/components/story/StoryNotificationBanner";
import ListenTogetherController from "@/components/chat/ListenTogetherController";
import { performEmergencyEscape } from "@/lib/emergency";
import { getApiBaseUrl, getBasePath, getLoginUrl } from "@/lib/api";
import { notificationManager } from "@/lib/notifications";
import { subscribeUserToPush, getPushSubscription } from "@/lib/push_notifications";
import { ShieldAlert, X } from "lucide-react";

// Mobil ve web başlangıç yükleme süresini optimize etmek için ağır modalları dinamik (lazy) yükle
const IncomingCallModal = dynamic(() => import("@/components/call/IncomingCallModal"), { ssr: false });
const ActiveCallModal = dynamic(() => import("@/components/call/ActiveCallModal"), { ssr: false });
const SettingsModal = dynamic(() => import("@/components/chat/SettingsModal"), { ssr: false });
const AdminPanelModal = dynamic(() => import("@/components/admin/AdminPanelModal").then((mod) => mod.AdminPanelModal), { ssr: false });
const StoryViewerModal = dynamic(() => import("@/components/story/StoryViewerModal"), { ssr: false });
const StoryCreatorModal = dynamic(() => import("@/components/story/StoryCreatorModal"), { ssr: false });
const StoryHighlightViewerModal = dynamic(() => import("@/components/story/StoryHighlightViewerModal"), { ssr: false });
const MessageInfoModal = dynamic(() => import("@/components/chat/MessageInfoModal"), { ssr: false });
const ListenTogetherModal = dynamic(() => import("@/components/chat/ListenTogetherModal"), { ssr: false });
const SafetyNumberModal = dynamic(() => import("@/components/chat/SafetyNumberModal"), { ssr: false });

// İstemciye özel güvenlik butonu (SSR devre dışı)
const GhostPanicTouch = dynamic(() => import("@/components/security/GhostPanicTouch"), {
  ssr: false,
});

export default function HomePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, checkAuth, logout } = useAuthStore();
  const {
    conversations,
    activeConversationId,
    messages,
    loadConversations,
    deselectConversation,
    startNewConversation,
    starredMessages,
    loadStarredMessages,
    selectedMessageInfo,
    setSelectedMessageInfo,
  } = useChatStore();
  const { connect, isConnected, isReconnecting, pendingQueueCount } = useSocketStore();
  const {
    activeViewerGroup,
    closeViewer,
    isCreatorOpen,
    closeCreator,
    loadStories,
    activeHighlight,
  } = useStoryStore();

  const [activeTab, setActiveTab] = useState<NavTab>("chats");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [adminInitialTab, setAdminInitialTab] = useState<string | undefined>(undefined);

  const handleOpenAdmin = useCallback((tab?: string) => {
    setAdminInitialTab(tab);
    setIsAdminPanelOpen(true);
  }, []);

  const handleOpenSettings = useCallback((tab?: string) => {
    setSettingsInitialTab(tab);
    setIsSettingsOpen(true);
  }, []);

  // Sohbet ve Çekmece Durumları
  const [showContactDrawer, setShowContactDrawer] = useState(false);
  const [showSafetyNumberModal, setShowSafetyNumberModal] = useState(false);
  const [showActiveDeleteConfirm, setShowActiveDeleteConfirm] = useState<"delete" | "clear" | null>(null);
  const [confirmCallType, setConfirmCallType] = useState<"audio" | "video" | null>(null);
  const [isChatSearchOpen, setIsChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [isListenTogetherOpen, setIsListenTogetherOpen] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<{
    url: string;
    type: "image" | "video";
    name?: string;
  } | null>(null);

  // Arama input referansı ve metni
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Güvenlik ve Bildirim Durumları
  const [securityAlert, setSecurityAlert] = useState<{
    id?: string;
    event_type?: string;
    username?: string;
    attempted_login?: string;
    ip_address?: string;
    location?: string;
    user_agent?: string;
    message?: string;
    details?: string;
    severity?: string;
  } | null>(null);

  // Gizlilik Kalkanı
  const [isPrivacyCurtainActive, setIsPrivacyCurtainActive] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);

  // Viewport Metrikleri
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [viewportTop, setViewportTop] = useState<number>(0);

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
    },
    confirmCallType,
    onCloseConfirmCallType: () => setConfirmCallType(null),
    showActiveDeleteConfirm,
    onCloseActiveDeleteConfirm: () => setShowActiveDeleteConfirm(null),
    isSettingsOpen,
    onCloseSettings: () => {
      setIsSettingsOpen(false);
      setSettingsInitialTab(undefined);
      if (activeTab === "settings") setActiveTab("chats");
    },
    isAdminPanelOpen,
    onCloseAdminPanel: () => {
      setIsAdminPanelOpen(false);
      setAdminInitialTab(undefined);
    },
    selectedMessageInfo,
    onCloseMessageInfo: () => setSelectedMessageInfo(null),
    isStoryViewerOpen: !!activeViewerGroup,
    onCloseStoryViewer: closeViewer,
    isStoryCreatorOpen: isCreatorOpen,
    onCloseStoryCreator: closeCreator,
  });

  const updateViewportMetrics = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.visualViewport) {
      setViewportHeight(window.visualViewport.height);
    } else {
      setViewportHeight(window.innerHeight);
    }
    setViewportTop(0);
  }, []);

  useEffect(() => {
    updateViewportMetrics();

    const handleViewportChange = () => {
      updateViewportMetrics();
    };

    const handleWindowScroll = () => {
      if (typeof window !== "undefined" && (window.scrollY !== 0 || window.scrollX !== 0)) {
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
  }, [updateViewportMetrics]);

  const isKeyboardOpen =
    typeof window !== "undefined" && viewportHeight
      ? viewportHeight < window.innerHeight * 0.82
      : false;

  // 1. Oturum Kontrolü
  useEffect(() => {
    checkAuth().then((authed) => {
      if (!authed) {
        const bp = getBasePath();
        if (process.env.NEXT_PUBLIC_BASE_PATH) {
          router.replace("/login");
        } else if (bp) {
          window.location.replace(`${bp}/login`);
        } else {
          router.replace("/login");
        }
      }
    });

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
  }, [isAuthenticated, connect, loadConversations, loadStarredMessages, loadStories]);

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

  // Çevrimdışı Bildirimi
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

  // Canlı Güvenlik Alarmı Bildirimi
  useEffect(() => {
    let alertTimer: NodeJS.Timeout | null = null;
    const handleSecurityAlert = (e: any) => {
      if (e?.detail) {
        setSecurityAlert(e.detail);
        if (alertTimer) clearTimeout(alertTimer);
        alertTimer = setTimeout(() => {
          setSecurityAlert(null);
        }, 12000);
      }
    };

    window.addEventListener("aura:security_alert", handleSecurityAlert);
    return () => {
      window.removeEventListener("aura:security_alert", handleSecurityAlert);
      if (alertTimer) clearTimeout(alertTimer);
    };
  }, []);

  // ACİL KAÇIŞ GERİ DÖNÜŞ VE BFCACHE KORUMASI
  useEffect(() => {
    const checkPanicState = () => {
      try {
        if (
          typeof window !== "undefined" &&
          (localStorage.getItem("aura_panic_escaped") === "1" ||
            sessionStorage.getItem("aura_panic_escaped") === "1")
        ) {
          localStorage.removeItem("aura_panic_escaped");
          sessionStorage.removeItem("aura_panic_escaped");
          useAuthStore.setState({ user: null, isAuthenticated: false });
          window.location.replace(getLoginUrl());
          return true;
        }
      } catch (_) {}
      return false;
    };

    if (checkPanicState()) return;

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted || checkPanicState()) {
        useAuthStore.getState().checkAuth().then((isAuthed) => {
          if (!isAuthed) {
            window.location.replace(getLoginUrl());
          }
        });
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  // PC REFLEKS KAÇIŞI: ÇİFT ESC
  useEffect(() => {
    let lastEscTime = 0;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const now = Date.now();
        if (now - lastEscTime < 450 && now - lastEscTime > 0) {
          e.preventDefault();
          e.stopPropagation();

          const sec = useSettingsStore.getState().settings?.security_settings;
          let redirectUrl =
            sec?.assistive_touch_redirect_url?.trim() ||
            sec?.inactivity_redirect_url?.trim();

          if (!redirectUrl && typeof window !== "undefined") {
            try {
              const raw = localStorage.getItem("aura_security_settings");
              if (raw) {
                const parsed = JSON.parse(raw);
                redirectUrl =
                  parsed?.assistive_touch_redirect_url?.trim() ||
                  parsed?.inactivity_redirect_url?.trim();
              }
            } catch (_) {}
          }

          if (!redirectUrl) {
            redirectUrl = "https://www.google.com";
          }

          performEmergencyEscape(redirectUrl);
        }
        lastEscTime = now;
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [user]);

  // İNAKTİVİTE VE GİZLİLİK KALKANI YÖNETİMİ
  useEffect(() => {
    const showShieldSynchronously = () => {
      if (typeof document !== "undefined") {
        const curtain = document.getElementById("aura-privacy-curtain");
        const main = document.getElementById("aura-main-content");
        if (curtain) {
          curtain.style.setProperty("display", "flex", "important");
          curtain.style.setProperty("visibility", "visible", "important");
          curtain.style.setProperty("opacity", "1", "important");
          void curtain.offsetHeight;
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

    const isScheduleActiveNow = (sec: any): boolean => {
      if (!sec || sec.inactivity_schedule_enabled !== true) {
        return true;
      }

      const now = new Date();
      const day = now.getDay();
      const isWeekend = day === 0 || day === 6;

      if (isWeekend && sec.inactivity_weekend_full !== false) {
        return true;
      }

      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const parseTimeToMinutes = (t?: string, defaultMin: number = 0) => {
        if (!t || !t.includes(":")) return defaultMin;
        const parts = t.split(":");
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
      };

      const startMinutes = parseTimeToMinutes(sec.inactivity_weekday_start, 17 * 60 + 30);
      const endMinutes = parseTimeToMinutes(sec.inactivity_weekday_end, 8 * 60 + 30);

      if (startMinutes > endMinutes) {
        return currentMinutes >= startMinutes || currentMinutes < endMinutes;
      } else if (startMinutes < endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
      }

      return true;
    };

    const checkInactivityAndRedirect = (): boolean => {
      const sec = getEffectiveSecuritySettings();
      if (!sec || !sec.inactivity_logout_enabled) {
        return false;
      }

      if (useCallStore.getState().callState !== "idle") {
        registerUserActivity(true);
        return false;
      }

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

      if (!isHidden && now - lastActive < 20000 && inactiveSince > 0) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("aura_inactive_since");
        }
      }

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

      const parsedTimeout = Number(sec.inactivity_timeout_minutes);
      const timeoutMinutes = !isNaN(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 15;

      if (elapsedMinutes >= timeoutMinutes) {
        setIsRedirecting(true);
        showShieldSynchronously();
        setIsPrivacyCurtainActive(true);

        if (typeof window !== "undefined") {
          localStorage.removeItem("aura_inactive_since");
          localStorage.removeItem("aura_last_active");
        }

        try {
          useSocketStore.getState().disconnect();
          useChatStore.getState().reset();
          useCallStore.getState().resetCall();
        } catch (e) {}

        let targetUrl = sec.inactivity_redirect_url?.trim() || "https://www.google.com";
        if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
          targetUrl = "https://" + targetUrl;
        }

        try {
          const apiBase = getApiBaseUrl().replace(/\/+$/, "");
          const alertUrl = `${apiBase}/auth/inactivity-alert`;
          const logoutUrl = `${apiBase}/auth/logout?reason=inactivity_timeout`;
          const currentUsername = user?.username || useAuthStore.getState().user?.username || "";

          const alertPayload = JSON.stringify({
            username: currentUsername,
            timeout_minutes: timeoutMinutes,
            elapsed_minutes: Number(elapsedMinutes.toFixed(2)),
            redirect_url: targetUrl,
            reason: "inactivity_timeout",
          });

          if (typeof navigator !== "undefined" && navigator.sendBeacon) {
            const blob = new Blob([alertPayload], { type: "application/json" });
            navigator.sendBeacon(alertUrl, blob);
          } else if (typeof fetch !== "undefined") {
            fetch(alertUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: alertPayload,
              credentials: "include",
              keepalive: true,
            }).catch(() => {});
          }

          if (typeof fetch !== "undefined") {
            fetch(logoutUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: alertPayload,
              credentials: "include",
              keepalive: true,
            }).catch(() => {});
          }
        } catch (e) {}

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

        forceNavigate();
        setTimeout(forceNavigate, 30);
        setTimeout(forceNavigate, 100);
        setTimeout(forceNavigate, 300);

        if (typeof window !== "undefined") {
          window.addEventListener("touchstart", forceNavigate, { capture: true, once: true });
          window.addEventListener("pointerdown", forceNavigate, { capture: true, once: true });
          window.addEventListener("click", forceNavigate, { capture: true, once: true });
        }

        return true;
      }

      return false;
    };

    if (checkInactivityAndRedirect()) {
      return;
    }

    if (typeof document !== "undefined" && !document.hidden) {
      hideShieldSynchronously();
      setIsPrivacyCurtainActive(false);
      if (typeof window !== "undefined") {
        localStorage.removeItem("aura_inactive_since");
      }
    }

    const markUserActive = registerUserActivity;

    if (typeof window !== "undefined" && !localStorage.getItem("aura_last_active")) {
      markUserActive(true);
    }

    const handleGoingToBackground = () => {
      if (isRedirecting) return;
      const sec = getEffectiveSecuritySettings();
      if (sec?.inactivity_logout_enabled && isScheduleActiveNow(sec)) {
        showShieldSynchronously();
        setIsPrivacyCurtainActive(true);
        if (typeof window !== "undefined") {
          localStorage.setItem("aura_inactive_since", Date.now().toString());
        }
      }
    };

    const handleComingToForeground = () => {
      if (checkInactivityAndRedirect()) {
        return;
      }

      hideShieldSynchronously();
      setIsPrivacyCurtainActive(false);
      if (typeof window !== "undefined") {
        localStorage.removeItem("aura_inactive_since");
        markUserActive(true);
      }

      notificationManager.stopFlash();
      updateViewportMetrics();

      const dispatchBottom = () => {
        if (typeof window !== "undefined") {
          window.scrollTo(0, 0);
          document.body.scrollTop = 0;
          document.documentElement.scrollTop = 0;
          window.dispatchEvent(new CustomEvent("aura:scroll_to_bottom"));
        }
      };

      dispatchBottom();
      setTimeout(() => {
        updateViewportMetrics();
        dispatchBottom();
      }, 100);
      setTimeout(() => {
        updateViewportMetrics();
        dispatchBottom();
      }, 350);

      const socketState = useSocketStore.getState();
      if (
        !socketState.socket ||
        (socketState.socket.readyState !== WebSocket.OPEN &&
          socketState.socket.readyState !== WebSocket.CONNECTING)
      ) {
        socketState.connect();
      }

      useChatStore.getState().loadConversations();

      const curConvId = useChatStore.getState().activeConversationId;
      if (curConvId) {
        useChatStore
          .getState()
          .loadMessages(curConvId)
          .then(() => {
            dispatchBottom();
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

    const handleUserInteraction = () => {
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

    const idleCheckInterval = setInterval(() => {
      checkInactivityAndRedirect();
    }, 1000);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handleGoingToBackground);
    window.addEventListener("pageshow", handleComingToForeground);
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
      window.removeEventListener("pageshow", handleComingToForeground);
      window.removeEventListener("focus", handleComingToForeground);
      window.removeEventListener("freeze", handleGoingToBackground);
      window.removeEventListener("resume", handleComingToForeground);
      window.removeEventListener("online", handleComingToForeground);
    };
  }, [registerUserActivity, updateViewportMetrics, isRedirecting, user]);

  // Klavye Kısayolları (Ctrl+K Arama, Esc Kapatma)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (e.key === "Escape") {
        if (selectedMessageInfo) {
          setSelectedMessageInfo(null);
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
  }, [searchQuery, selectedMessageInfo, setSelectedMessageInfo]);

  // Toplam okunmamış ve yıldızlı mesaj sayıları
  const totalUnreadCount = useMemo(
    () => conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0),
    [conversations]
  );

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

  const handleStartChat = async (targetUserId: string) => {
    setSearchQuery("");
    setActiveTab("chats");
    await startNewConversation(targetUserId);
  };

  const handleLogout = async () => {
    await logout();
    const bp = getBasePath();
    if (process.env.NEXT_PUBLIC_BASE_PATH) {
      router.push("/login");
    } else if (bp) {
      window.location.href = `${bp}/login`;
    } else {
      router.push("/login");
    }
  };

  const activeConv = conversations.find((c) => c.id === activeConversationId);

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
          <div className="w-10 h-10 border-3 border-grupo-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400 font-medium">Aura yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* GİZLİLİK KALKANI */}
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
          <div className="w-10 h-10 border-3 border-grupo-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400 font-medium">Aura yükleniyor...</p>
        </div>
      </div>

      <div
        id="aura-main-content"
        className="fixed inset-x-0 flex flex-col w-full bg-grupo-dark-bg text-slate-100 select-none overflow-hidden"
        style={{
          top: 0,
          height: viewportHeight ? `${viewportHeight}px` : "100%",
          maxHeight: viewportHeight ? `${viewportHeight}px` : "100%",
          visibility: isPrivacyCurtainActive ? "hidden" : "visible",
        }}
      >
        {/* Canlı Güvenlik Alarmı / Yetkisiz Giriş Bildirim Çubuğu */}
        {securityAlert && (
          <div className="bg-gradient-to-r from-red-950/95 via-rose-900/90 to-red-950/95 border-b border-red-500/40 px-3.5 sm:px-4 py-2 flex items-center justify-between text-xs text-white backdrop-blur-md z-40 transition-all shrink-0 animate-in slide-in-from-top-2 duration-300 shadow-lg shadow-red-950/40">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
              <div className="truncate flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                <span className="font-bold text-red-300 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                  Güvenlik Uyarısı:
                </span>
                <span className="text-slate-200 truncate">
                  {securityAlert.message || (
                    securityAlert.event_type === "failed_password_attempt"
                      ? "Şüpheli Giriş Engellendi (Hatalı Şifre)"
                      : securityAlert.event_type === "unknown_user_attempt" || securityAlert.event_type === "unknown_user_login"
                      ? "Yetkisiz Giriş Teşebbüsü (Kayıtsız Kullanıcı)"
                      : securityAlert.event_type === "concurrent_session_login"
                      ? "Eşzamanlı Çoklu Oturum (İkinci Cihaz)"
                      : securityAlert.event_type === "panic_mode_triggered"
                      ? "Panik / Zorlama Kodu Tetiklendi (Acil Durum)"
                      : "Şüpheli Giriş Denemesi Engellendi"
                  )}{" "}
                  (Kullanıcı: <b className="text-white font-mono">@{securityAlert.username || securityAlert.attempted_login || "bilinmeyen"}</b> • IP: <span className="font-mono text-red-200">{securityAlert.ip_address}</span>{securityAlert.location ? ` • 📍 ${securityAlert.location}` : ""})
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <button
                onClick={() => handleOpenAdmin("security_logs")}
                className="px-2.5 py-1 rounded-lg bg-red-500/25 hover:bg-red-500/40 text-red-100 font-bold border border-red-500/40 transition cursor-pointer text-[11px] whitespace-nowrap"
              >
                Kayıtları Gör
              </button>
              <button
                onClick={() => setSecurityAlert(null)}
                className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
                title="Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Çevrimdışı / Yeniden Bağlanma Bildirim Çubuğu */}
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
          {/* 1. SÜTUN: SideNavigation (64px/ikon dikey menü) */}
          <SideNavigation
            activeTab={activeTab}
            onTabChange={(tab) => {
              setActiveTab(tab);
              if (tab === "settings") {
                handleOpenSettings();
              }
            }}
            unreadCount={totalUnreadCount}
            starredCount={combinedStarredMessages.length}
            isConnected={isConnected}
            user={user}
            onOpenSettings={() => handleOpenSettings()}
            onOpenAdmin={(tab?: string) => handleOpenAdmin(tab)}
            onLogout={handleLogout}
          />

          {/* 2. SÜTUN: AsideList (280px-340px sohbetler / kişiler / hikayeler) */}
          <AsideList
            activeTab={activeTab}
            onTabChange={(tab) => {
              setActiveTab(tab);
              if (tab === "settings") {
                handleOpenSettings();
              }
            }}
            totalUnreadCount={totalUnreadCount}
            starredCount={combinedStarredMessages.length}
            onOpenSettings={() => handleOpenSettings()}
            onOpenAdmin={(tab?: string) => handleOpenAdmin(tab)}
            onLogout={handleLogout}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchInputRef={searchInputRef}
            onStartChat={handleStartChat}
          />

          {/* 3. SÜTUN: Chatbox (Merkez Sohbet Penceresi) */}
          <Chatbox
            onBackToChatList={handleBackToChatList}
            onOpenSafetyNumber={() => setShowSafetyNumberModal(true)}
            onOpenListenTogether={() => setIsListenTogetherOpen(true)}
            isKeyboardOpen={isKeyboardOpen}
            onUserActivity={registerUserActivity}
            showContactDrawer={showContactDrawer}
            setShowContactDrawer={setShowContactDrawer}
            isChatSearchOpen={isChatSearchOpen}
            setIsChatSearchOpen={setIsChatSearchOpen}
            chatSearchQuery={chatSearchQuery}
            setChatSearchQuery={setChatSearchQuery}
            confirmCallType={confirmCallType}
            setConfirmCallType={setConfirmCallType}
            showActiveDeleteConfirm={showActiveDeleteConfirm}
            setShowActiveDeleteConfirm={setShowActiveDeleteConfirm}
            previewMedia={previewMedia}
            setPreviewMedia={setPreviewMedia}
          />
        </div>

        {/* Global Modallar */}
        <MessageInfoModal />

        <SettingsModal
          isOpen={isSettingsOpen}
          initialTab={settingsInitialTab}
          onOpenAdmin={handleOpenAdmin}
          onClose={() => {
            setIsSettingsOpen(false);
            setSettingsInitialTab(undefined);
            if (activeTab === "settings") {
              setActiveTab("chats");
            }
          }}
        />

        <AdminPanelModal
          isOpen={isAdminPanelOpen}
          initialTab={adminInitialTab as any}
          onClose={() => {
            setIsAdminPanelOpen(false);
            setAdminInitialTab(undefined);
          }}
        />

        {showSafetyNumberModal && activeConv && (
          <SafetyNumberModal
            isOpen={showSafetyNumberModal}
            onClose={() => setShowSafetyNumberModal(false)}
            currentUser={user}
            otherUser={activeConv.other_user}
            conversation={activeConv}
            onRegenerateCode={async () => {
              const { regenerateSecurityCode } = useAuthStore.getState();
              await regenerateSecurityCode();
            }}
          />
        )}

        <StoryViewerModal />
        <StoryCreatorModal />
        <IncomingCallModal />
        <ActiveCallModal />

        <ListenTogetherModal
          isOpen={isListenTogetherOpen}
          conversationId={activeConversationId}
          onClose={() => setIsListenTogetherOpen(false)}
        />
        <ListenTogetherController />

        {showExitToast && !activeConversationId && (
          <div className="fixed bottom-16 sm:bottom-6 inset-x-0 mx-auto w-fit z-50 px-4 py-2 bg-slate-900/95 border border-slate-700 text-white text-xs font-medium rounded-full shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150 pointer-events-none select-none">
            Çıkmak için tekrar dokunun
          </div>
        )}

        <StoryNotificationBanner />
        {activeHighlight && <StoryHighlightViewerModal />}
        <GhostPanicTouch />
      </div>
    </>
  );
}
