import { create } from "zustand";
import { useChatStore } from "./useChatStore";
import { useAuthStore } from "./useAuthStore";
import { soundEffects } from "@/lib/sounds";
import { notificationManager } from "@/lib/notifications";
import { triggerReactionConfetti } from "@/lib/confetti";

interface QueuedAction {
  id: string;
  action: string;
  payload: any;
  timestamp: number;
}

interface SocketState {
  socket: WebSocket | null;
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  isManualDisconnect: boolean;
  pendingQueueCount: number;
  connect: (token?: string) => void;
  disconnect: () => void;
  sendAction: (action: string, payload: any) => void;
  flushOutbox: () => void;
  removeFromOutbox: (tempId: string) => void;
}

let activeWs: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
let isListenersRegistered = false;

const OUTBOX_STORAGE_KEY = "aura_outbox";

function loadOutbox(): QueuedAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOutbox(queue: QueuedAction[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error("Outbox kaydedilemedi:", e);
  }
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  isConnecting: false,
  isReconnecting: false,
  isManualDisconnect: false,
  pendingQueueCount: typeof window !== "undefined" ? loadOutbox().length : 0,

  connect: (token?: string) => {
    // Oturum açık değilse soket açma
    const isAuthed = useAuthStore.getState().isAuthenticated;
    if (!isAuthed && !token) {
      return;
    }

    // Zaten bağlı veya bağlanma sürecindeyse mükerrer soket oluşturma
    const currentSocket = activeWs || get().socket;
    if (
      currentSocket &&
      (currentSocket.readyState === WebSocket.OPEN || currentSocket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    set({ isManualDisconnect: false, isConnecting: true });

    // Tarayıcı çevrimiçi / çevrimdışı dinleyicilerini ilk seferde bağla
    if (typeof window !== "undefined" && !isListenersRegistered) {
      isListenersRegistered = true;
      window.addEventListener("online", () => {
        console.log("🌐 [Aura Network] İnternet bağlantısı sağlandı. Anında sokete bağlanılıyor...");
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        reconnectAttempts = 0;
        get().connect();
      });

      window.addEventListener("offline", () => {
        console.log("⚠️ [Aura Network] İnternet bağlantısı koptu.");
        set({ isConnected: false });
      });
    }

    let wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (typeof window !== "undefined") {
      const isHttps = window.location.protocol === "https:";
      const proto = isHttps ? "wss:" : "ws:";
      const host = window.location.hostname;
      const isLocalhost = host === "localhost" || host === "127.0.0.1";

      if (isLocalhost) {
        if (!wsUrl) wsUrl = "ws://localhost:8080/ws";
      } else {
        if (wsUrl && !wsUrl.includes("localhost") && !wsUrl.includes("127.0.0.1")) {
          // Var olan geçerli wsUrl'i kullan
        } else {
          let basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
          if (!basePath) {
            const match = window.location.pathname.match(/^(\/[a-zA-Z0-9_-]+)/);
            if (match && !["/login", "/register", "/chat", "/settings", "/api"].includes(match[1])) {
              basePath = match[1];
            }
          }
          basePath = basePath.replace(/\/+$/, "");
          if (basePath && !basePath.startsWith("/")) {
            basePath = "/" + basePath;
          }

          const port = window.location.port ? `:${window.location.port}` : "";
          wsUrl = `${proto}//${host}${port}${basePath}/ws`;
        }
      }
    }
    if (!wsUrl) {
      wsUrl = "ws://localhost:8080/ws";
    }
    const url = token ? `${wsUrl}?token=${encodeURIComponent(token)}` : wsUrl;

    if (activeWs) {
      try {
        activeWs.onopen = null;
        activeWs.onclose = null;
        activeWs.onerror = null;
        activeWs.onmessage = null;
        activeWs.close();
      } catch (e) {}
      activeWs = null;
    }

    try {
      const ws = new WebSocket(url);
      activeWs = ws;
      set({ socket: ws, isConnecting: true });

      ws.onopen = () => {
        if (activeWs !== ws) return;
        console.log("⚡ [WS] WebSocket bağlantısı kuruldu.");
        reconnectAttempts = 0;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }

        set({
          socket: ws,
          isConnected: true,
          isConnecting: false,
          isReconnecting: false,
        });

        // Bağlantı kurulduğunda bekleyen çevrimdışı kuyruğu (Outbox) gönder
        get().flushOutbox();
      };

      ws.onclose = () => {
        if (activeWs === ws) {
          console.log("🔌 [WS] WebSocket bağlantısı kapandı.");
          activeWs = null;
          set({
            socket: null,
            isConnected: false,
            isConnecting: false,
          });

          // Oturum açıksa ve kullanıcı bilerek çıkış yapmadıysa Exponential Backoff ile yeniden bağlan
          if (!get().isManualDisconnect && useAuthStore.getState().isAuthenticated) {
            reconnectAttempts++;
            // 1s, 2s, 4s, maks 8s + 0-500ms rastgele jitter
            const baseDelay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 8000);
            const jitter = Math.floor(Math.random() * 500);
            const delay = baseDelay + jitter;

            set({ isReconnecting: true });
            console.log(`🔄 [WS] ${delay}ms sonra yeniden bağlanılıyor (Deneme: ${reconnectAttempts})...`);

            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
              if (!activeWs && !get().isManualDisconnect && useAuthStore.getState().isAuthenticated) {
                get().connect(token);
              }
            }, delay);
          }
        }
      };

      ws.onerror = (err) => {
        console.error("❌ [WS] Hata:", err);
      };

      ws.onmessage = (event) => {
        if (!useAuthStore.getState().isAuthenticated) {
          return;
        }
        try {
          const data = JSON.parse(event.data);
          const chatStore = useChatStore.getState();

          switch (data.action) {
            case "message_sent":
              soundEffects.playSent();
              if (data.payload?.temp_id) {
                get().removeFromOutbox(data.payload.temp_id);
              }
              chatStore.onMessageSent(data.payload.temp_id, data.payload.message);
              break;

            case "new_message": {
              const currentList = chatStore.messages[data.payload.conversation_id] || [];
              const isDuplicate = currentList.some((m) => m.id === data.payload.id);

              chatStore.onNewMessage(data.payload);

              // Sadece ilk kez alındığında ses çal
              if (!isDuplicate) {
                soundEffects.playReceived();
              }

              // Mesajın ulaştığını onayla
              get().sendAction("delivered_ack", { message_ids: [data.payload.id] });

              // Kullanıcı şu an bu sohbette mi ve ekran açık/odaklanmış mı?
              const isVisibleAndFocused =
                typeof document !== "undefined" &&
                !document.hidden &&
                document.visibilityState === "visible" &&
                document.hasFocus();

              const isCurrentChatActive =
                isVisibleAndFocused && chatStore.activeConversationId === data.payload.conversation_id;

              if (isCurrentChatActive) {
                notificationManager.stopFlash();
                get().sendAction("read_ack", {
                  conversation_id: data.payload.conversation_id,
                  message_ids: [data.payload.id],
                });
              } else if (!isDuplicate) {
                notificationManager.notify("Aura - Yeni Mesaj", data.payload.content || "Yeni bir mesaj aldınız.");
                notificationManager.flashTitle(1);
              }
              break;
            }

            case "message_delivered":
              chatStore.onMessageDelivered(data.payload.message_ids, data.payload.delivered_at);
              break;

            case "message_read":
              chatStore.onMessageRead(
                data.payload.conversation_id,
                data.payload.message_ids,
                data.payload.read_at
              );
              break;

            case "user_typing":
              chatStore.onUserTyping(
                data.payload.conversation_id,
                data.payload.user_id,
                data.payload.is_typing
              );
              break;

            case "presence_update":
              chatStore.onPresenceUpdate(
                data.payload.user_id,
                data.payload.status,
                data.payload.last_seen_at
              );
              break;

            case "message_edited":
              chatStore.onMessageEdited(data.payload.message_id, data.payload.content);
              break;

            case "message_deleted":
              chatStore.onMessageDeleted(data.payload.message_id, data.payload.is_deleted_for_all);
              break;

            case "messages_batch_deleted":
              chatStore.onMessagesBatchDeleted(
                data.payload.conversation_id,
                data.payload.message_ids || [],
                data.payload.is_deleted_for_all
              );
              break;

            case "message_reaction": {
              chatStore.onMessageReaction(data.payload.message_id, data.payload.reactions);
              // Reaksiyon neşeli bir emoji ise hafif konfeti efekti tetikle
              if (data.payload?.reactions) {
                const emojis = Object.keys(data.payload.reactions);
                const lastEmoji = emojis[emojis.length - 1];
                if (lastEmoji && ["❤️", "🎉", "🔥", "🚀", "😍", "👏"].includes(lastEmoji)) {
                  triggerReactionConfetti(lastEmoji);
                }
              }
              break;
            }

            case "conversation_blocked":
              chatStore.onConversationBlocked(data.payload.conversation_id);
              break;

            case "conversation_unblocked":
              chatStore.onConversationUnblocked(data.payload.conversation_id);
              break;

            case "system_settings_updated":
              import("./useSettingsStore").then(({ useSettingsStore }) => {
                useSettingsStore.getState().updateSettingLocally(data.payload.key, data.payload.value);
              });
              break;

            case "new_story": {
              const currentUserId = useAuthStore.getState().user?.id;
              if (data.payload?.user_id && data.payload.user_id !== currentUserId) {
                soundEffects.playReceived();
                const authorName = data.payload?.author_name || "Bir kullanıcı";
                const authorAvatar = data.payload?.author_avatar || "";
                const caption = data.payload?.caption || "";

                import("./useStoryStore").then(({ useStoryStore }) => {
                  useStoryStore.getState().showStoryNotification({
                    userId: data.payload.user_id,
                    authorName,
                    authorAvatar,
                    caption,
                    audience: data.payload?.audience,
                    timestamp: Date.now(),
                  });
                  useStoryStore.getState().loadStories();
                });

                notificationManager.notify(
                  `${authorName} yeni bir hikaye paylaştı! 📸`,
                  caption ? `"${caption}"` : "Hikayeyi görmek için dokunun",
                  authorAvatar
                );
                notificationManager.flashTitle(1);
              }
              break;
            }

            case "story_deleted": {
              import("./useStoryStore").then(({ useStoryStore }) => {
                useStoryStore.getState().removeStoryById(data.payload?.story_id, data.payload?.author_id);
              });
              break;
            }

            case "story_reaction": {
              const currentUserId = useAuthStore.getState().user?.id;
              if (data.payload?.sender_id !== currentUserId) {
                soundEffects.playReceived();
                notificationManager.notify(
                  `${data.payload?.sender_name || "Biri"} hikayene tepki verdi! ${data.payload?.reaction || "❤️"}`,
                  "Hikaye Tepkisi"
                );
              }
              break;
            }

            case "security_alert": {
              soundEffects.playReceived();
              const payload = data.payload;
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("aura:security_alert", { detail: payload })
                );
              }
              notificationManager.notify(
                `🚨 Güvenlik Uyarısı: ${payload?.username || "Bilinmeyen"}`,
                `Yetkisiz/şüpheli giriş denemesi (${payload?.ip_address || "Bilinmeyen IP"})`
              );
              notificationManager.flashTitle(1);
              // Güvenlik botu hikaye paylaştıysa hikayeleri hemen güncelle
              import("./useStoryStore").then(({ useStoryStore }) => {
                useStoryStore.getState().loadStories();
              });
              break;
            }

            case "incoming_call":
              soundEffects.startRingtone();
              import("./useCallStore").then(({ useCallStore }) => {
                useCallStore.getState().onIncomingCall(data.payload);
              });
              break;

            case "call_answered":
              soundEffects.stopRingtone();
              import("./useCallStore").then(({ useCallStore }) => {
                useCallStore.getState().onCallAnswered(data.payload);
              });
              break;

            case "call_rejected":
              soundEffects.stopRingtone();
              import("./useCallStore").then(({ useCallStore }) => {
                useCallStore.getState().onCallRejected(data.payload);
              });
              break;

            case "call_ended":
              soundEffects.stopRingtone();
              import("./useCallStore").then(({ useCallStore }) => {
                useCallStore.getState().onCallEnded(data.payload);
              });
              break;

            case "listen_together_sync":
              import("./useListenTogetherStore").then(({ useListenTogetherStore }) => {
                useListenTogetherStore.getState().handleRemoteSync(data.payload);
              });
              break;
          }
        } catch (e) {
          console.error("Mesaj parse edilemedi:", e);
        }
      };
    } catch (err) {
      console.error("WebSocket bağlantısı oluşturulurken hata:", err);
      set({ isConnecting: false });
    }
  },

  disconnect: () => {
    set({ isManualDisconnect: true, socket: null, isConnected: false, isConnecting: false, isReconnecting: false });
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectAttempts = 0;
    if (activeWs) {
      try {
        activeWs.onopen = null;
        activeWs.onclose = null;
        activeWs.onerror = null;
        activeWs.onmessage = null;
        activeWs.close(1000, "User logged out");
      } catch (e) {
        console.error("Soket kapatılırken hata:", e);
      }
      activeWs = null;
    }
  },

  sendAction: (action: string, payload: any) => {
    const isOnline = typeof navigator === "undefined" || navigator.onLine;
    const ws = get().socket;
    const isOpen = ws && ws.readyState === WebSocket.OPEN && isOnline;

    // send_message için her halükarda Outbox kuyruğuna güvenle al (sunucu onaylayana kadar)
    if (action === "send_message") {
      const queue = loadOutbox();
      const item: QueuedAction = {
        id: payload.temp_id || `outbox_${Date.now()}`,
        action,
        payload,
        timestamp: Date.now(),
      };
      if (!queue.some((q) => q.payload?.temp_id === payload.temp_id)) {
        queue.push(item);
        saveOutbox(queue);
        set({ pendingQueueCount: queue.length });
        console.log(`📦 [Outbox] Mesaj kuyruğa alındı (${queue.length} bekleyen).`);
      }
    }

    if (isOpen) {
      try {
        ws.send(JSON.stringify({ action, payload }));
        return;
      } catch (e) {
        console.error("Mesaj gönderilemedi, outbox'ta bekleyecek:", e);
      }
    }
  },

  flushOutbox: () => {
    const isOnline = typeof navigator === "undefined" || navigator.onLine;
    const ws = get().socket;
    if (!ws || ws.readyState !== WebSocket.OPEN || !isOnline) return;

    const queue = loadOutbox();
    if (queue.length === 0) return;

    console.log(`🚀 [Outbox] Çevrimdışı biriken ${queue.length} mesaj sunucuya iletiliyor...`);
    for (const item of queue) {
      try {
        ws.send(JSON.stringify({ action: item.action, payload: item.payload }));
      } catch (e) {
        console.error("Outbox öğesi gönderilemedi:", e);
      }
    }
  },

  removeFromOutbox: (tempId: string) => {
    if (!tempId) return;
    const queue = loadOutbox();
    const updated = queue.filter(
      (item) => item.payload?.temp_id !== tempId && item.id !== tempId
    );
    if (updated.length !== queue.length) {
      saveOutbox(updated);
      set({ pendingQueueCount: updated.length });
      console.log(`✅ [Outbox] Mesaj onaylandı ve kuyruktan çıkarıldı (${tempId}).`);
    }
  },
}));
