import { create } from "zustand";
import { api } from "@/lib/api";
import { useSocketStore } from "./useSocketStore";
import { User } from "./useAuthStore";
import { notificationManager } from "@/lib/notifications";
import { triggerReactionConfetti } from "@/lib/confetti";

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
  created_at: string;
}

export interface Conversation {
  id: string;
  other_user: User;
  last_message?: Message;
  unread_count: number;
  is_online: boolean;
  is_blocked: boolean;
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

  deleteConversation: (convId: string) => Promise<void>;
  clearConversation: (convId: string) => Promise<void>;
  startNewConversation: (recipientId: string) => Promise<string>;
  reset: () => void;
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

    // Açılan sohbetteki okunmamış mesajlar için read_ack gönder
    useSocketStore.getState().sendAction("read_ack", {
      conversation_id: convId,
    });

    // Unread count'u sıfırla
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === convId ? { ...c, unread_count: 0 } : c
      ),
    }));
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
      const fetchedList = res.data || [];
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
      const olderMsgs = res.data || [];
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
      const res = await api.get<Message[]>(
        `/conversations/${convId}/search?q=${encodeURIComponent(query)}`
      );
      return res.data || [];
    } catch (err) {
      console.error("Mesaj araması yapılamadı:", err);
      return [];
    }
  },

  sendMessage: (convId: string, content: string, replyToId?: string) => {
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
      message_type: "text",
      content,
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

    // WebSocket üzerinden ilet
    useSocketStore.getState().sendAction("send_message", {
      conversation_id: convId,
      message_type: "text",
      content,
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
    try {
      if (["❤️", "🎉", "🔥", "🚀", "😍", "👏"].includes(emoji)) {
        triggerReactionConfetti(emoji);
      }
      const res = await api.post(`/messages/${messageId}/reactions`, { emoji });
      get().onMessageReaction(messageId, res.data.reactions);
    } catch (err) {
      console.error("Reaksiyon gönderilemedi:", err);
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
        updated = list.map((m) => (m.id === tempId ? confirmedWithTick : m));
      } else {
        const hasConfirmed = list.some((m) => m.id === confirmed.id);
        if (hasConfirmed) {
          updated = list.map((m) => (m.id === confirmed.id ? confirmedWithTick : m));
        } else {
          updated = [...list, confirmedWithTick];
        }
      }

      const updatedConvs = state.conversations.map((c) =>
        c.id === convId ? { ...c, last_message: confirmedWithTick } : c
      );

      return {
        messages: { ...state.messages, [convId]: updated },
        conversations: updatedConvs,
      };
    });
  },

  onNewMessage: (msg: Message) => {
    const convExists = get().conversations.some((c) => c.id === msg.conversation_id);
    if (!convExists) {
      get().loadConversations();
    }

    set((state) => {
      const convId = msg.conversation_id;
      const list = state.messages[convId] || [];
      const isCurrentActive = state.activeConversationId === convId;

      const alreadyExists = list.some((m) => m.id === msg.id);
      const updatedList = alreadyExists
        ? list.map((m) => (m.id === msg.id ? { ...m, ...msg } : m))
        : [...list, msg];

      const updatedConvs = state.conversations.map((c) => {
        if (c.id === convId) {
          return {
            ...c,
            last_message: msg,
            unread_count: isCurrentActive
              ? 0
              : alreadyExists
              ? c.unread_count
              : c.unread_count + 1,
          };
        }
        return c;
      });

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
      return { messages: newMessages };
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
