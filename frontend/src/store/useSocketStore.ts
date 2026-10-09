import { create } from "zustand";
import { useChatStore } from "./useChatStore";
import { useAuthStore } from "./useAuthStore";
import { soundEffects } from "@/lib/sounds";
import { notificationManager } from "@/lib/notifications";
import { triggerReactionConfetti, isSpecialConfettiEmoji, getPrimaryConfettiEmoji } from "@/lib/confetti";
import { getOrCreateSessionId, getBasePath, getLoginUrl } from "@/lib/api";

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
let heartbeatInterval: NodeJS.Timeout | null = null;

const OUTBOX_STORAGE_KEY = "aura_outbox";

/**
 * Heartbeat (ping) paketinin payload'ı.
 * idle_ms: Kullanıcının son GERÇEK etkileşiminden (dokunma, tıklama, klavye, scroll) bu yana geçen süre.
 * Sunucu ping'in kendisini aktivite saymaz; "son görülme" ve inaktivite hesabını bu değerle yapar.
 * Göreli süre gönderildiği için cihaz saatinin yanlış olması sonucu etkilemez.
 */
function buildHeartbeatPayload(): { idle_ms?: number } {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("aura_last_active");
    const lastActive = raw ? parseInt(raw, 10) : 0;
    if (!lastActive || isNaN(lastActive)) return {};
    return { idle_ms: Math.max(0, Date.now() - lastActive) };
  } catch {
    return {};
  }
}

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

    // Tarayıcı çevrimiçi / çevrimdışı ve ekran uyanma (visibilitychange) dinleyicilerini ilk seferde bağla
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

      // Mobil cihaz ekran kilidinden çıktığında veya sekme öne geldiğinde anında canlılığı tazele
      const handleWakeOrFocus = () => {
        if (document.visibilityState === "visible") {
          const cur = activeWs || get().socket;
          if (!cur || cur.readyState !== WebSocket.OPEN) {
            console.log("📱 [Aura Network] Mobil ekran uyandı. Soket hızlıca bağlanıyor...");
            if (reconnectTimer) {
              clearTimeout(reconnectTimer);
              reconnectTimer = null;
            }
            reconnectAttempts = 0;
            setTimeout(() => {
              // İnaktivite kontrolü oturumu kapattıysa (manuel disconnect) tekrar bağlanma
              if (!get().isManualDisconnect) get().connect();
            }, 150);
          } else {
            // Soket açık: yeniden bağlanmaya gerek yok
            // Ön plana dönüldü → kısa gecikmeyle "görünür" bildir (kullanıcı tekrar çevrimiçi olur).
            // Gecikme: page.tsx'teki inaktivite kontrolü önce çalışsın; süresi dolmuş kullanıcı bir an bile çevrimiçi görünmesin.
            setTimeout(() => {
              const s = activeWs || get().socket;
              if (
                !get().isManualDisconnect &&
                s &&
                s.readyState === WebSocket.OPEN &&
                document.visibilityState === "visible"
              ) {
                get().sendAction("presence_state", { visible: true, ...buildHeartbeatPayload() });
              }
            }, 150);
          }
        }
      };
      document.addEventListener("visibilitychange", handleWakeOrFocus);
      window.addEventListener("focus", handleWakeOrFocus);

      // WHATSAPP TARZI ÇEVRİMİÇİ: Chrome alta alındığında / ekran kilitlendiğinde / sekme değiştirildiğinde
      // sunucuya ANINDA "görünmez" bildirilir → kullanıcı diğerlerine çevrimiçi görünmez, son görülmesi yazılır.
      // Soket kapatılmaz: mesajlar arka planda gelmeye (çift gri tik) ve inaktivite takibi çalışmaya devam eder.
      const handleGoingHidden = () => {
        const cur = activeWs || get().socket;
        if (cur && cur.readyState === WebSocket.OPEN) {
          get().sendAction("presence_state", { visible: false, ...buildHeartbeatPayload() });
        }
      };
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") handleGoingHidden();
      });
      window.addEventListener("pagehide", handleGoingHidden);
      document.addEventListener("freeze", handleGoingHidden);

      // 2.2 Düzeltmesi: Sekmeler arası outbox sayacını senkronize et
      window.addEventListener("storage", (e) => {
        if (e.key === OUTBOX_STORAGE_KEY) {
          set({ pendingQueueCount: loadOutbox().length });
        }
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
          const basePath = getBasePath();
          const port = window.location.port ? `:${window.location.port}` : "";
          wsUrl = `${proto}//${host}${port}${basePath}/ws`;
        }
      }
    }
    if (!wsUrl) {
      wsUrl = "ws://localhost:8080/ws";
    }
    const sessionId = getOrCreateSessionId();
    const queryParams: string[] = [];
    if (token) queryParams.push(`token=${encodeURIComponent(token)}`);
    if (sessionId) queryParams.push(`session_id=${encodeURIComponent(sessionId)}`);
    if (typeof document !== "undefined") {
      // Arka planda (ör. ağ kopması sonrası) yeniden bağlanan sekme kullanıcıyı çevrimiçi göstermesin
      queryParams.push(`visible=${document.visibilityState === "hidden" ? 0 : 1}`);
    }
    const queryString = queryParams.length > 0 ? (wsUrl.includes("?") ? "&" : "?") + queryParams.join("&") : "";
    const url = `${wsUrl}${queryString}`;

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

        // Mobil ağlarda (4G/5G/WiFi NAT) bağlantının sessizce kopmasını önlemek için 20sn keep-alive heartbeat.
        // Ping, kullanıcının gerçek boşta kalma süresini (idle_ms) taşır; sunucu ping'i aktivite saymaz.
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
          if (activeWs && activeWs.readyState === WebSocket.OPEN) {
            get().sendAction("ping", buildHeartbeatPayload());
          }
        }, 20000);

        set({
          socket: ws,
          isConnected: true,
          isConnecting: false,
          isReconnecting: false,
        });

        // Bağlantı kurulur kurulmaz güncel görünürlüğü ve gerçek etkileşim zamanını sunucuya bildir
        get().sendAction("presence_state", {
          visible: typeof document === "undefined" || document.visibilityState !== "hidden",
          ...buildHeartbeatPayload(),
        });

        // Bağlantı kurulduğunda bekleyen çevrimdışı kuyruğu (Outbox) gönder
        get().flushOutbox();
      };

      ws.onclose = () => {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
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
                // Gelen mesaj özel bir konfeti emojisi ise ekranda konfeti patlat
                if (
                  data.payload.message_type === "text" &&
                  data.payload.content &&
                  isSpecialConfettiEmoji(data.payload.content)
                ) {
                  triggerReactionConfetti(getPrimaryConfettiEmoji(data.payload.content));
                }
              }

              // Mesajın ulaştığını onayla
              get().sendAction("delivered_ack", { message_ids: [data.payload.id] });

              // Kullanıcı şu an bu sohbette mi ve ekran açık mı? (Mobilde hasFocus klavye/dokunmada false dönebileceğinden visibilityState ve !hidden esas alınır)
              const isVisible =
                typeof document !== "undefined" &&
                !document.hidden &&
                document.visibilityState === "visible";

              const isCurrentChatActive =
                isVisible && chatStore.activeConversationId === data.payload.conversation_id;

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

            case "message_deleted_for_me":
              chatStore.onMessageDeleted(data.payload.message_id, false);
              break;

            case "messages_batch_deleted":
              chatStore.onMessagesBatchDeleted(
                data.payload.conversation_id,
                data.payload.message_ids || [],
                data.payload.is_deleted_for_all
              );
              break;

            case "messages_batch_deleted_for_me":
              chatStore.onMessagesBatchDeleted(
                data.payload.conversation_id,
                data.payload.message_ids || [],
                false
              );
              break;

            case "conversation_cleared":
              chatStore.onConversationCleared(data.payload.conversation_id);
              break;

            case "message_reaction": {
              chatStore.onMessageReaction(data.payload.message_id, data.payload.reactions);
              // Reaksiyon neşeli bir emoji ise hafif konfeti efekti tetikle
              if (data.payload?.reactions) {
                const emojis = Object.keys(data.payload.reactions);
                const lastEmoji = emojis[emojis.length - 1];
                if (lastEmoji && isSpecialConfettiEmoji(lastEmoji)) {
                  triggerReactionConfetti(getPrimaryConfettiEmoji(lastEmoji));
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

            case "session_terminated": {
              console.warn("🛑 [Aura Security] Oturum sonlandırıldı:", data.payload);
              set({ isManualDisconnect: true, isConnected: false });
              if (activeWs) {
                try {
                  activeWs.onclose = null;
                  activeWs.close();
                } catch (e) {}
                activeWs = null;
              }
              // Sunucu kaynaklı sonlandırma: sebebi ilet ki son görülme atılma anıyla ezilmesin
              useAuthStore.getState().logout({
                reason: (typeof data.payload?.reason === "string" && data.payload.reason) || "session_terminated",
              });
              if (typeof window !== "undefined") {
                const target = data.payload?.redirect_url;
                if (target && data.payload?.reason === "inactivity_timeout") {
                  let dest = target.trim();
                  if (!dest.startsWith("http://") && !dest.startsWith("https://")) dest = "https://" + dest;
                  window.location.replace(dest);
                } else {
                  alert(data.payload?.message || "Bu cihazdaki oturumunuz başka bir cihazdan uzaktan kapatıldı.");
                  window.location.href = getLoginUrl();
                }
              }
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
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
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

    // 2.2 Düzeltmesi: Çoklu sekmelerde aynı anda mükerrer outbox flush işlemini engelle
    if (typeof window !== "undefined") {
      const lockKey = "aura_outbox_flush_lock";
      const now = Date.now();
      const currentLock = parseInt(localStorage.getItem(lockKey) || "0", 10);
      if (currentLock > now) {
        return;
      }
      localStorage.setItem(lockKey, (now + 5000).toString());
    }

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
