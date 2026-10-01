import { create } from "zustand";
import { api } from "@/lib/api";
import { useSocketStore } from "./useSocketStore";
import { User, useAuthStore } from "./useAuthStore";
import { useListenTogetherStore } from "./useListenTogetherStore";
import { notificationManager } from "@/lib/notifications";
import { triggerReactionConfetti, isSpecialConfettiEmoji, getPrimaryConfettiEmoji } from "@/lib/confetti";
import {
  isE2EEEncrypted,
  encryptE2EEMessage,
  decryptE2EEMessage,
  deriveConversationKey,
  getCombinedSalt,
} from "@/lib/e2ee";

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  recipient_id: string;
  reply_to_id?: string;
  reply_to?: {
    id: string;
    sender_id: string;
    content: string;
    message_type: string;
    is_mine?: boolean;
    is_deleted_for_all?: boolean;
  };
  message_type: string; // text, voice, image, video, file, call_log
  content: string;
  media_url?: string;
  media_metadata?: {
    file_name?: string;
    file_size?: number;
    duration?: number;
    waveform?: number[];
    mime_type?: string;
    ext?: string;
    latitude?: number;
    longitude?: number;
    [key: string]: any;
  };
  reactions?: Record<string, string[]>; // { "👍": ["uuid1", "uuid2"], "❤️": ["uuid1"] }
  sent_at: string;
  delivered_at?: string;
  read_at?: string;
  tick_status: "pending" | "sent" | "delivered" | "read";
  is_mine: boolean;
  is_edited: boolean;
  is_starred: boolean;
  is_deleted_for_all: boolean;
  is_e2ee?: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  other_user: User;
  last_message?: Message;
  unread_count: number;
  is_online: boolean;
  is_blocked: boolean;
  safety_number_version?: number;
  created_at: string;
  updated_at: string;
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>; // conversation_id -> Message[]
  hasMoreMessages: Record<string, boolean>;
  loadingOlderMessages: boolean;
  typingMap: Record<string, boolean>; // conversation_id -> isTyping
  selectedMessageInfo: Message | null;
  replyingTo: Message | null;
  starredMessages: Message[];
  selectedMessageIds: string[];
  isSelectionMode: boolean;

  loadConversations: () => Promise<void>;
  loadStarredMessages: () => Promise<void>;
  selectConversation: (convId: string) => Promise<void>;
  deselectConversation: () => void;
  loadMessages: (convId: string) => Promise<void>;
  loadOlderMessages: (convId: string) => Promise<boolean>;
  blockConversation: (convId: string) => Promise<void>;
  unblockConversation: (convId: string) => Promise<void>;
  searchMessages: (convId: string, query: string) => Promise<Message[]>;
  sendMessage: (convId: string, content: string, replyToId?: string) => void;
  sendMediaMessage: (
    convId: string,
    mediaUrl: string,
    mediaType: string,
    metadata?: any,
    content?: string,
    replyToId?: string
  ) => void;
  sendTyping: (convId: string, isTyping: boolean) => void;
  setSelectedMessageInfo: (msg: Message | null) => void;
  setReplyingTo: (msg: Message | null) => void;
  editingMessageId: string | null;
  setEditingMessageId: (id: string | null) => void;

  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string, forAll: boolean) => Promise<void>;
  deleteSelectedMessages: (forAll: boolean) => Promise<void>;
  startSelectionMode: (initialMessageId?: string) => void;
  toggleSelectMessage: (messageId: string) => void;
  selectAllMessages: (convId: string) => void;
  clearSelection: () => void;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  toggleStar: (messageId: string) => Promise<void>;

  onMessageSent: (tempId: string, confirmed: Message) => void;
  onNewMessage: (msg: Message) => void;
  onMessageDelivered: (messageIds: string[], deliveredAt: string) => void;
  onMessageRead: (convId: string, messageIds: string[], readAt: string) => void;
  onUserTyping: (convId: string, userId: string, isTyping: boolean) => void;
  onPresenceUpdate: (userId: string, status: number, lastSeenAt: string) => void;
  onMessageEdited: (messageId: string, content: string) => void;
  onMessageDeleted: (messageId: string, isDeletedForAll: boolean) => void;
  onMessagesBatchDeleted: (convId: string, messageIds: string[], isDeletedForAll: boolean) => void;
  onMessageReaction: (messageId: string, reactions: Record<string, string[]>) => void;
  onConversationBlocked: (convId: string) => void;
  onConversationUnblocked: (convId: string) => void;
  onConversationCleared: (convId: string) => void;

  deleteConversation: (convId: string) => Promise<void>;
  clearConversation: (convId: string) => Promise<void>;
  startNewConversation: (recipientId: string) => Promise<string>;
  reset: () => void;
}

/**
 * Mesaj listesindeki E2EE şifreli mesajları arka planda çözerek düz metne dönüştürür.
 * Şifresiz veya sistem mesajlarına asla dokunmaz.
 */
async function decryptMessageList(convId: string, list: Message[]): Promise<Message[]> {
  if (typeof window === "undefined" || !list || list.length === 0) return list;
  const conv = useChatStore.getState().conversations.find((c) => c.id === convId);
  const currentUser = useAuthStore.getState().user;
  if (!conv || !currentUser) return list;

  const combinedSalt = getCombinedSalt(currentUser, conv.other_user);
  const key = await deriveConversationKey(currentUser.id, conv.other_user.id, combinedSalt);
  if (!key) return list;

  return Promise.all(
    list.map(async (msg) => {
      if (isE2EEEncrypted(msg.content)) {
        const plain = await decryptE2EEMessage(msg.content, key);
        return { ...msg, content: plain, is_e2ee: true };
      }
      return msg;
    })
  );
}

/**
 * Tek bir gelen mesajı E2EE şifresini çözerek döndürür.
 */
async function decryptSingleMessage(msg: Message): Promise<Message> {
  if (!isE2EEEncrypted(msg.content) || typeof window === "undefined") return msg;

  const conv = useChatStore.getState().conversations.find((c) => c.id === msg.conversation_id);
  const currentUser = useAuthStore.getState().user;
  if (!conv || !currentUser) return msg;

  const combinedSalt = getCombinedSalt(currentUser, conv.other_user);
  const key = await deriveConversationKey(currentUser.id, conv.other_user.id, combinedSalt);
  if (!key) return msg;

  const plain = await decryptE2EEMessage(msg.content, key);
  return { ...msg, content: plain, is_e2ee: true };
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  hasMoreMessages: {},
  loadingOlderMessages: false,
  typingMap: {},
  selectedMessageInfo: null,
  replyingTo: null,
  editingMessageId: null,
  starredMessages: [],
  selectedMessageIds: [],
  isSelectionMode: false,

  setEditingMessageId: (id: string | null) => set({ editingMessageId: id }),

  loadStarredMessages: async () => {
    try {
      const res = await api.get<Message[]>("/messages/starred");
      set({ starredMessages: res.data || [] });
    } catch (err) {
      console.error("Yıldızlı mesajlar yüklenemedi:", err);
    }
  },

  loadConversations: async () => {
    try {
      const res = await api.get<Conversation[]>("/conversations");
      set({ conversations: res.data });
    } catch (err) {
      console.error("Konuşmalar yüklenemedi:", err);
    }
  },

  selectConversation: async (convId: string) => {
    set({
      activeConversationId: convId,
      replyingTo: null,
      isSelectionMode: false,
      selectedMessageIds: [],
    });
    notificationManager.stopFlash();
    await get().loadMessages(convId);

    // 1.3 Düzeltmesi: Açılan sohbetteki okunmamış mesajların ID'leri ile read_ack gönder
    const unreadMsgIds = (get().messages[convId] || [])
      .filter((m) => !m.is_mine && !m.read_at && m.id && !m.id.startsWith("temp_"))
      .map((m) => m.id);

    useSocketStore.getState().sendAction("read_ack", {
      conversation_id: convId,
      message_ids: unreadMsgIds,
    });

    // Unread count'u sıfırla
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === convId ? { ...c, unread_count: 0 } : c
      ),
    }));

    // 6.4: Eğer aktif bir oturum yoksa, Redis'te devam eden bir oturum olup olmadığını kontrol et (F5 / ilk yüklemede geri getirme)
    const currentLtSession = useListenTogetherStore.getState().session;
    if (!currentLtSession) {
      api.get<{ active: boolean; session?: any }>(`/conversations/${convId}/listen-together`)
        .then((res) => {
          if (res.data?.active && res.data?.session && res.data.session.action_type !== "stop") {
            useListenTogetherStore.getState().handleRemoteSync(res.data.session);
          }
        })
        .catch(() => {});
    }
  },

  deselectConversation: () => {
    set({
      activeConversationId: null,
      replyingTo: null,
      isSelectionMode: false,
      selectedMessageIds: [],
    });
  },

  deleteConversation: async (convId: string) => {
    try {
      await api.delete(`/conversations/${convId}`);
      set((state) => {
        const nextConversations = state.conversations.filter((c) => c.id !== convId);
        const nextMessages = { ...state.messages };
        delete nextMessages[convId];
        return {
          conversations: nextConversations,
          messages: nextMessages,
          activeConversationId: state.activeConversationId === convId ? null : state.activeConversationId,
        };
      });
    } catch (err) {
      console.error("Sohbet silinemedi:", err);
      throw err;
    }
  },

  clearConversation: async (convId: string) => {
    try {
      await api.delete(`/conversations/${convId}/clear`);
      set((state) => ({
        messages: {
          ...state.messages,
          [convId]: [],
        },
        conversations: state.conversations.map((c) =>
          c.id === convId ? { ...c, last_message: undefined } : c
        ),
      }));
    } catch (err) {
      console.error("Sohbet geçmişi temizlenemedi:", err);
      throw err;
    }
  },

  loadMessages: async (convId: string) => {
    try {
      const res = await api.get<Message[]>(`/conversations/${convId}/messages?limit=50`);
      const rawFetchedList = res.data || [];
      const fetchedList = await decryptMessageList(convId, rawFetchedList);

      set((state) => {
        const currentList = state.messages[convId] || [];

        // 1. Zaten bellekte olan ve henüz onaylanmamış temp / pending mesajlar
        const memoryPending = currentList.filter(
          (m) =>
            (m.id.startsWith("temp_") || m.tick_status === "pending") &&
            !fetchedList.some((f) => f.id === m.id)
        );

        // 2. LocalStorage Outbox'ında bu konuşmaya ait bekleyen mesajlar
        let outboxPending: Message[] = [];
        try {
          if (typeof window !== "undefined") {
            const rawOutbox = localStorage.getItem("aura_outbox");
            if (rawOutbox) {
              const outboxItems = JSON.parse(rawOutbox);
              outboxPending = outboxItems
                .filter(
                  (item: any) =>
                    item.action === "send_message" &&
                    item.payload?.conversation_id === convId
                )
                .map((item: any) => {
                  const p = item.payload;
                  return {
                    id: p.temp_id || item.id,
                    conversation_id: convId,
                    sender_id: "",
                    recipient_id: "",
                    reply_to_id: p.reply_to_id,
                    message_type: p.message_type || "text",
                    content: p.content || "",
                    media_url: p.media_url,
                    media_metadata: p.media_metadata,
                    sent_at: new Date(item.timestamp || Date.now()).toISOString(),
                    tick_status: "pending" as const,
                    is_mine: true,
                    is_edited: false,
                    is_starred: false,
                    is_deleted_for_all: false,
                    created_at: new Date(item.timestamp || Date.now()).toISOString(),
                  };
                })
                .filter(
                  (om: Message) =>
                    !fetchedList.some((f) => f.id === om.id) &&
                    !memoryPending.some((mp) => mp.id === om.id)
                );
            }
          }
        } catch (e) {
          console.error("Outbox yüklenirken hata:", e);
        }

        const mergedList = [...fetchedList, ...memoryPending, ...outboxPending];

        return {
          messages: {
            ...state.messages,
            [convId]: mergedList,
          },
          hasMoreMessages: {
            ...state.hasMoreMessages,
            [convId]: fetchedList.length >= 50,
          },
        };
      });
    } catch (err) {
      console.error("Mesajlar yüklenemedi:", err);
    }
  },

  loadOlderMessages: async (convId: string) => {
    const currentMsgs = get().messages[convId] || [];
    if (currentMsgs.length === 0 || get().loadingOlderMessages) return false;
    const hasMore = get().hasMoreMessages[convId] ?? true;
    if (!hasMore) return false;

    set({ loadingOlderMessages: true });
    try {
      const oldestMsg = currentMsgs[0];
      const res = await api.get<Message[]>(
        `/conversations/${convId}/messages?limit=50&before=${encodeURIComponent(oldestMsg.created_at || oldestMsg.sent_at)}`
      );
      const rawOlderMsgs = res.data || [];
      const olderMsgs = await decryptMessageList(convId, rawOlderMsgs);

      set((state) => ({
        loadingOlderMessages: false,
        messages: {
          ...state.messages,
          [convId]: [...olderMsgs, ...(state.messages[convId] || [])],
        },
        hasMoreMessages: {
          ...state.hasMoreMessages,
          [convId]: olderMsgs.length >= 50,
        },
      }));
      return olderMsgs.length > 0;
    } catch (err) {
      console.error("Eski mesajlar yüklenemedi:", err);
      set({ loadingOlderMessages: false });
      return false;
    }
  },

  blockConversation: async (convId: string) => {
    try {
      await api.post(`/conversations/${convId}/block`);
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === convId ? { ...c, is_blocked: true } : c
        ),
      }));
    } catch (err) {
      console.error("Kullanıcı engellenemedi:", err);
      throw err;
    }
  },

  unblockConversation: async (convId: string) => {
    try {
      await api.post(`/conversations/${convId}/unblock`);
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === convId ? { ...c, is_blocked: false } : c
        ),
      }));
    } catch (err) {
      console.error("Engelleme kaldırılamadı:", err);
      throw err;
    }
  },

  searchMessages: async (convId: string, query: string) => {
    try {
      const q = query.trim().toLowerCase();
      const currentList = get().messages[convId] || [];
      const localMatches = currentList.filter(
        (m) => m.content && m.content.toLowerCase().includes(q) && !m.is_deleted_for_all
      );

      const res = await api.get<Message[]>(
        `/conversations/${convId}/search?q=${encodeURIComponent(query)}`
      );
      const rawServerMsgs = res.data || [];
      const serverMsgs = await decryptMessageList(convId, rawServerMsgs);

      const merged = [...localMatches];
      for (const sm of serverMsgs) {
        if (!merged.some((m) => m.id === sm.id)) {
          merged.push(sm);
        }
      }
      return merged;
    } catch (err) {
      console.error("Mesaj araması yapılamadı:", err);
      return [];
    }
  },

  sendMessage: async (convId: string, content: string, replyToId?: string) => {
    const tempId = `temp_${Date.now()}`;
    const replying = get().replyingTo;

    // E2EE Şifreleme Hazırlığı
    const conv = get().conversations.find((c) => c.id === convId);
    const currentUser = useAuthStore.getState().user;
    let payloadContent = content;
    let isE2EE = false;

    if (conv && currentUser) {
      const combinedSalt = getCombinedSalt(currentUser, conv.other_user);
      const key = await deriveConversationKey(currentUser.id, conv.other_user.id, combinedSalt);
      if (key) {
        payloadContent = await encryptE2EEMessage(content, key);
        isE2EE = true;
      }
    }

    const optimisticMsg: Message = {
      id: tempId,
      conversation_id: convId,
      sender_id: currentUser?.id || "",
      recipient_id: conv?.other_user?.id || "",
      reply_to_id: replyToId || (replying ? replying.id : undefined),
      reply_to: replying
        ? {
            id: replying.id,
            sender_id: replying.sender_id,
            content: replying.content,
            message_type: replying.message_type,
            is_mine: replying.is_mine,
            is_deleted_for_all: replying.is_deleted_for_all,
          }
        : undefined,
      message_type: "text",
      content,
      is_e2ee: isE2EE,
      sent_at: new Date().toISOString(),
      tick_status: "pending",
      is_mine: true,
      is_edited: false,
      is_starred: false,
      is_deleted_for_all: false,
      created_at: new Date().toISOString(),
    };

    // İyimser ekle
    set((state) => ({
      messages: {
        ...state.messages,
        [convId]: [...(state.messages[convId] || []), optimisticMsg],
      },
      replyingTo: null,
    }));

    // Mesaj tek başına veya tekrar eden özel konfeti emojisi ise ekranda konfeti patlat
    const trimmedContent = content.trim();
    if (isSpecialConfettiEmoji(trimmedContent)) {
      triggerReactionConfetti(getPrimaryConfettiEmoji(trimmedContent));
    }

    // WebSocket üzerinden ilet (Aura E2EE: Sunucuya giden metin uçtan uca şifrelidir)
    useSocketStore.getState().sendAction("send_message", {
      conversation_id: convId,
      message_type: "text",
      content: payloadContent,
      reply_to_id: replyToId || (replying ? replying.id : undefined),
      temp_id: tempId,
    });

    get().sendTyping(convId, false);
  },

  sendMediaMessage: (
    convId: string,
    mediaUrl: string,
    mediaType: string,
    metadata?: any,
    content = "",
    replyToId?: string
  ) => {
    const tempId = `temp_${Date.now()}`;
    const replying = get().replyingTo;

    const optimisticMsg: Message = {
      id: tempId,
      conversation_id: convId,
      sender_id: "",
      recipient_id: "",
      reply_to_id: replyToId || (replying ? replying.id : undefined),
      reply_to: replying
        ? {
            id: replying.id,
            sender_id: replying.sender_id,
            content: replying.content,
            message_type: replying.message_type,
          }
        : undefined,
      message_type: mediaType,
      content,
      media_url: mediaUrl,
      media_metadata: metadata,
      sent_at: new Date().toISOString(),
      tick_status: "pending",
      is_mine: true,
      is_edited: false,
      is_starred: false,
      is_deleted_for_all: false,
      created_at: new Date().toISOString(),
    };

    set((state) => ({
      messages: {
        ...state.messages,
        [convId]: [...(state.messages[convId] || []), optimisticMsg],
      },
      replyingTo: null,
    }));

    useSocketStore.getState().sendAction("send_message", {
      conversation_id: convId,
      message_type: mediaType,
      content,
      media_url: mediaUrl,
      media_metadata: metadata,
      reply_to_id: replyToId || (replying ? replying.id : undefined),
      temp_id: tempId,
    });
  },

  sendTyping: (convId: string, isTyping: boolean) => {
    const action = isTyping ? "typing_start" : "typing_stop";
    useSocketStore.getState().sendAction(action, { conversation_id: convId });
  },

  setSelectedMessageInfo: (msg: Message | null) => {
    set({ selectedMessageInfo: msg });
  },

  setReplyingTo: (msg: Message | null) => {
    set({ replyingTo: msg });
  },

  editMessage: async (messageId: string, content: string) => {
    try {
      await api.patch(`/messages/${messageId}`, { content });
      get().onMessageEdited(messageId, content);
    } catch (err) {
      console.error("Mesaj düzenlenemedi:", err);
      throw err;
    }
  },

  deleteMessage: async (messageId: string, forAll: boolean) => {
    try {
      await api.delete(`/messages/${messageId}?type=${forAll ? "for_all" : "for_me"}`);
      get().onMessageDeleted(messageId, forAll);
    } catch (err) {
      console.error("Mesaj silinemedi:", err);
      throw err;
    }
  },

  deleteSelectedMessages: async (forAll: boolean) => {
    const { selectedMessageIds, activeConversationId } = get();
    if (!activeConversationId || selectedMessageIds.length === 0) return;

    try {
      await api.delete("/messages/batch", {
        data: {
          conversation_id: activeConversationId,
          message_ids: selectedMessageIds,
          for_all: forAll,
        },
      });
      get().onMessagesBatchDeleted(activeConversationId, selectedMessageIds, forAll);
      get().clearSelection();
    } catch (err) {
      console.error("Toplu mesaj silinemedi:", err);
      throw err;
    }
  },

  startSelectionMode: (initialMessageId?: string) => {
    set({
      isSelectionMode: true,
      selectedMessageIds: initialMessageId ? [initialMessageId] : [],
    });
  },

  toggleSelectMessage: (messageId: string) => {
    set((state) => {
      const exists = state.selectedMessageIds.includes(messageId);
      const updated = exists
        ? state.selectedMessageIds.filter((id) => id !== messageId)
        : [...state.selectedMessageIds, messageId];
      return {
        selectedMessageIds: updated,
        isSelectionMode: updated.length > 0,
      };
    });
  },

  selectAllMessages: (convId: string) => {
    const msgs = get().messages[convId] || [];
    const allIds = msgs.map((m) => m.id);
    set({
      isSelectionMode: true,
      selectedMessageIds: allIds,
    });
  },

  clearSelection: () => {
    set({
      isSelectionMode: false,
      selectedMessageIds: [],
    });
  },

  toggleReaction: async (messageId: string, emoji: string) => {
    const currentUserId = useAuthStore.getState().user?.id;
    if (!currentUserId) return;

    // 1. İyimser Güncelleme (Optimistic UI)
    let previousReactions: Record<string, string[]> | undefined;
    const allMessages = get().messages;
    for (const cid in allMessages) {
      const found = allMessages[cid].find((m) => m.id === messageId);
      if (found) {
        previousReactions = found.reactions ? JSON.parse(JSON.stringify(found.reactions)) : {};
        break;
      }
    }

    if (previousReactions !== undefined) {
      const optimisticReactions: Record<string, string[]> = JSON.parse(JSON.stringify(previousReactions));
      const uidStr = String(currentUserId);

      // Kullanıcı zaten bu emojiye basmış mı?
      const alreadyHadSame = (optimisticReactions[emoji] || []).includes(uidStr);

      // Kullanıcının önceki reaksiyonlarını tüm emojilerden temizle (tek tepki)
      for (const e in optimisticReactions) {
        optimisticReactions[e] = (optimisticReactions[e] || []).filter((u) => u !== uidStr);
        if (optimisticReactions[e].length === 0) {
          delete optimisticReactions[e];
        }
      }

      // Aynı emojiye basmamışsa yeni emojiyi ekle (basmışsa kaldırılmış oldu)
      if (!alreadyHadSame) {
        if (!optimisticReactions[emoji]) {
          optimisticReactions[emoji] = [];
        }
        optimisticReactions[emoji].push(uidStr);
      }

      get().onMessageReaction(messageId, optimisticReactions);

      if (!alreadyHadSame && isSpecialConfettiEmoji(emoji)) {
        triggerReactionConfetti(getPrimaryConfettiEmoji(emoji));
      }
    }

    try {
      const res = await api.post(`/messages/${messageId}/reactions`, { emoji });
      if (res.data?.reactions) {
        get().onMessageReaction(messageId, res.data.reactions);
      }
    } catch (err) {
      console.error("Reaksiyon gönderilemedi:", err);
      // Hata durumunda eski durumuna geri al
      if (previousReactions !== undefined) {
        get().onMessageReaction(messageId, previousReactions);
      }
    }
  },

  toggleStar: async (messageId: string) => {
    try {
      const res = await api.post(`/messages/${messageId}/star`);
      const isStarred = res.data.is_starred;
      set((state) => {
        const newMessages = { ...state.messages };
        let targetMsg: Message | undefined;

        for (const cid in newMessages) {
          newMessages[cid] = newMessages[cid].map((m) => {
            if (m.id === messageId) {
              const updated = { ...m, is_starred: isStarred };
              targetMsg = updated;
              return updated;
            }
            return m;
          });
        }

        let newStarred = [...state.starredMessages];
        if (!isStarred) {
          newStarred = newStarred.filter((m) => m.id !== messageId);
        } else {
          if (!targetMsg) {
            targetMsg = newStarred.find((m) => m.id === messageId);
          }
          if (targetMsg && !newStarred.some((m) => m.id === messageId)) {
            newStarred = [targetMsg, ...newStarred];
          }
        }

        return { messages: newMessages, starredMessages: newStarred };
      });
    } catch (err) {
      console.error("Yıldızlama başarısız:", err);
    }
  },

  onMessageSent: (tempId: string, confirmed: Message) => {
    // Outbox'tan bu geçici mesajı temizle
    useSocketStore.getState().removeFromOutbox(tempId);

    const convExists = get().conversations.some((c) => c.id === confirmed.conversation_id);
    if (!convExists) {
      get().loadConversations();
    }

    set((state) => {
      const convId = confirmed.conversation_id;
      const list = state.messages[convId] || [];
      const confirmedWithTick: Message = {
        ...confirmed,
        tick_status: confirmed.tick_status || "sent",
      };

      const hasTemp = list.some((m) => m.id === tempId);
      let updated: Message[];

      if (hasTemp) {
        const tempMsg = list.find((m) => m.id === tempId);
        // E2EE: Eğer sunucudan gelen onay mesajı şifreli ise, yereldeki açık metni ve is_e2ee bayrağını koru
        if (tempMsg && isE2EEEncrypted(confirmed.content)) {
          confirmedWithTick.content = tempMsg.content;
          confirmedWithTick.is_e2ee = true;
        }
        updated = list.map((m) => (m.id === tempId ? confirmedWithTick : m));
      } else {
        const hasConfirmed = list.some((m) => m.id === confirmed.id);
        if (hasConfirmed) {
          updated = list.map((m) => (m.id === confirmed.id ? confirmedWithTick : m));
        } else {
          updated = [...list, confirmedWithTick];
        }
      }

      // 6.1 Düzeltmesi: Mesaj gönderildiğinde o konuşmayı listenin en başına (index 0) taşı
      const targetConv = state.conversations.find((c) => c.id === convId);
      const otherConvs = state.conversations.filter((c) => c.id !== convId);
      let updatedConvs = state.conversations;
      if (targetConv) {
        const updatedTarget: Conversation = {
          ...targetConv,
          last_message: confirmedWithTick,
        };
        updatedConvs = [updatedTarget, ...otherConvs];
      }

      return {
        messages: { ...state.messages, [convId]: updated },
        conversations: updatedConvs,
      };
    });
  },

  onNewMessage: async (msg: Message) => {
    let finalMsg = msg;
    if (isE2EEEncrypted(msg.content)) {
      finalMsg = await decryptSingleMessage(msg);
    }

    const convExists = get().conversations.some((c) => c.id === finalMsg.conversation_id);
    if (!convExists) {
      get().loadConversations();
    }

    // 1.3 Düzeltmesi: Aktif açık sohbete yeni mesaj düştüğünde anında okundu bilgisi gönder
    if (get().activeConversationId === finalMsg.conversation_id && !finalMsg.is_mine) {
      useSocketStore.getState().sendAction("read_ack", {
        conversation_id: finalMsg.conversation_id,
        message_ids: [finalMsg.id],
      });
    }

    set((state) => {
      const convId = finalMsg.conversation_id;
      const list = state.messages[convId] || [];
      const isCurrentActive = state.activeConversationId === convId;

      const alreadyExists = list.some((m) => m.id === finalMsg.id);
      const updatedList = alreadyExists
        ? list.map((m) => (m.id === finalMsg.id ? { ...m, ...finalMsg } : m))
        : [...list, finalMsg];

      // 6.1 Düzeltmesi: Yeni mesaj geldiğinde o konuşmayı listenin en başına (index 0) taşı
      const targetConv = state.conversations.find((c) => c.id === convId);
      const otherConvs = state.conversations.filter((c) => c.id !== convId);
      let updatedConvs = state.conversations;
      if (targetConv) {
        const updatedTarget: Conversation = {
          ...targetConv,
          last_message: finalMsg,
          unread_count: isCurrentActive
            ? 0
            : alreadyExists
            ? targetConv.unread_count
            : targetConv.unread_count + 1,
        };
        updatedConvs = [updatedTarget, ...otherConvs];
      }

      return {
        messages: { ...state.messages, [convId]: updatedList },
        conversations: updatedConvs,
      };
    });
  },

  onMessageDelivered: (messageIds: string[], deliveredAt: string) => {
    set((state) => {
      const newMessages = { ...state.messages };
      for (const convId in newMessages) {
        newMessages[convId] = newMessages[convId].map((m) => {
          if (messageIds.includes(m.id)) {
            return {
              ...m,
              delivered_at: deliveredAt,
              tick_status: m.tick_status === "read" ? "read" : "delivered",
            };
          }
          return m;
        });
      }
      return { messages: newMessages };
    });
  },

  onMessageRead: (convId: string, messageIds: string[], readAt: string) => {
    set((state) => {
      const list = state.messages[convId];
      if (!list) return state;

      const updated = list.map((m) => {
        if (messageIds.length === 0 || messageIds.includes(m.id)) {
          return {
            ...m,
            read_at: readAt,
            tick_status: "read" as const,
          };
        }
        return m;
      });

      return {
        messages: { ...state.messages, [convId]: updated },
      };
    });
  },

  onUserTyping: (convId: string, userId: string, isTyping: boolean) => {
    set((state) => ({
      typingMap: {
        ...state.typingMap,
        [convId]: isTyping,
      },
    }));
  },

  onPresenceUpdate: (userId: string, status: number, lastSeenAt: string) => {
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.other_user.id === userId) {
          return {
            ...c,
            is_online: status === 1,
            other_user: {
              ...c.other_user,
              online_status: status,
              last_seen_at: lastSeenAt,
            },
          };
        }
        return c;
      }),
    }));
  },

  onMessageEdited: (messageId: string, content: string) => {
    set((state) => {
      const newMessages = { ...state.messages };
      for (const cid in newMessages) {
        newMessages[cid] = newMessages[cid].map((m) =>
          m.id === messageId ? { ...m, content, is_edited: true } : m
        );
      }
      return { messages: newMessages };
    });
  },

  onMessageDeleted: (messageId: string, isDeletedForAll: boolean) => {
    set((state) => {
      const newMessages = { ...state.messages };
      for (const cid in newMessages) {
        if (isDeletedForAll) {
          newMessages[cid] = newMessages[cid].map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  is_deleted_for_all: true,
                  content: "🚫 Bu mesaj silindi",
                  media_url: undefined,
                }
              : m
          );
        } else {
          // Benden sil: tamamen listeden çıkar
          newMessages[cid] = newMessages[cid].filter((m) => m.id !== messageId);
        }
      }
      return { messages: newMessages };
    });
  },

  onMessagesBatchDeleted: (convId: string, messageIds: string[], isDeletedForAll: boolean) => {
    set((state) => {
      const newMessages = { ...state.messages };
      const currentList = newMessages[convId] || [];
      const idSet = new Set(messageIds);

      if (isDeletedForAll) {
        newMessages[convId] = currentList.map((m) =>
          idSet.has(m.id)
            ? {
                ...m,
                is_deleted_for_all: true,
                content: "🚫 Bu mesaj silindi",
                media_url: undefined,
              }
            : m
        );
      } else {
        newMessages[convId] = currentList.filter((m) => !idSet.has(m.id));
      }

      let newStarred = state.starredMessages;
      if (!isDeletedForAll) {
        newStarred = newStarred.filter((m) => !idSet.has(m.id));
      }

      return {
        messages: newMessages,
        starredMessages: newStarred,
        selectedMessageIds: state.selectedMessageIds.filter((id) => !idSet.has(id)),
      };
    });
  },

  onMessageReaction: (messageId: string, reactions: Record<string, string[]>) => {
    set((state) => {
      const newMessages = { ...state.messages };
      for (const cid in newMessages) {
        newMessages[cid] = newMessages[cid].map((m) =>
          m.id === messageId ? { ...m, reactions } : m
        );
      }
      const newStarred = state.starredMessages.map((m) =>
        m.id === messageId ? { ...m, reactions } : m
      );
      return { messages: newMessages, starredMessages: newStarred };
    });
  },

  onConversationBlocked: (convId: string) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === convId ? { ...c, is_blocked: true } : c
      ),
    }));
  },

  onConversationUnblocked: (convId: string) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === convId ? { ...c, is_blocked: false } : c
      ),
    }));
  },

  onConversationCleared: (convId: string) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [convId]: [],
      },
      conversations: state.conversations.map((c) =>
        c.id === convId ? { ...c, last_message: undefined } : c
      ),
    }));
  },

  startNewConversation: async (recipientId: string) => {
    const res = await api.post<Conversation>("/conversations", { recipient_id: recipientId });
    await get().loadConversations();
    set((state) => {
      const exists = state.conversations.some((c) => c.id === res.data.id);
      if (!exists) {
        return {
          conversations: [res.data, ...state.conversations],
        };
      }
      return state;
    });
    await get().selectConversation(res.data.id);
    return res.data.id;
  },

  reset: () => {
    set({
      conversations: [],
      activeConversationId: null,
      messages: {},
      typingMap: {},
      selectedMessageInfo: null,
      replyingTo: null,
      selectedMessageIds: [],
      isSelectionMode: false,
    });
  },
}));
