import { create } from "zustand";
import { api } from "@/lib/api";

export interface Story {
  id: string;
  user_id: string;
  media_type: "image" | "video" | "text" | "audio";
  media_url: string;
  caption: string;
  background_color: string;
  music_title: string;
  music_artist: string;
  music_url: string;
  duration_seconds?: number;
  music_start?: number;
  music_end?: number;
  stickers: any[];
  audience?: "everyone" | "close_friends";
  reactions?: Record<string, string[]>;
  views: string[];
  views_count: number;
  has_viewed: boolean;
  expires_at: string;
  created_at: string;
}

export interface StoryAuthor {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  viewed_at?: string;
  reactions?: string[];
}

export interface StoryReactionItem {
  id: string;
  story_id: string;
  user_id: string;
  reaction: string;
  username: string;
  display_name: string;
  avatar_url: string;
  created_at: string;
}

export interface UserStoriesGroup {
  user: StoryAuthor;
  stories: Story[];
  has_unviewed: boolean;
  has_close_friends?: boolean;
  latest_story: string;
}

export interface InAppStoryNotification {
  userId: string;
  authorName: string;
  authorAvatar: string;
  caption?: string;
  audience?: string;
  timestamp: number;
}

interface StoryStoreState {
  storyGroups: UserStoriesGroup[];
  isLoading: boolean;
  activeViewerGroup: UserStoriesGroup | null;
  activeViewerStoryIndex: number;
  isCreatorOpen: boolean;
  inAppNotification: InAppStoryNotification | null;

  showStoryNotification: (notif: InAppStoryNotification) => void;
  dismissStoryNotification: () => void;
  loadStories: () => Promise<void>;
  createStory: (storyData: {
    media_type: "image" | "video" | "text" | "audio";
    media_url: string;
    caption?: string;
    background_color?: string;
    music_title?: string;
    music_artist?: string;
    music_url?: string;
    duration_seconds?: number;
    music_start?: number;
    music_end?: number;
    stickers?: any[];
    audience?: "everyone" | "close_friends";
  }) => Promise<void>;
  markStoryViewed: (storyId: string) => Promise<void>;
  deleteStory: (storyId: string) => Promise<void>;
  removeStoryById: (storyId: string, authorId?: string) => void;
  getStoryViewers: (storyId: string) => Promise<StoryAuthor[]>;
  getStoryReactions: (storyId: string) => Promise<StoryReactionItem[]>;
  sendReaction: (storyId: string, reaction: string) => Promise<void>;
  getCloseFriends: () => Promise<StoryAuthor[]>;
  addCloseFriend: (friendId: string) => Promise<void>;
  removeCloseFriend: (friendId: string) => Promise<void>;

  openViewer: (group: UserStoriesGroup, initialIndex?: number) => void;
  closeViewer: () => void;
  setViewerStoryIndex: (index: number) => void;
  editingStory: Story | null;
  openCreator: (storyToEdit?: Story) => void;
  closeCreator: () => void;
  updateStory: (
    storyId: string,
    storyData: {
      caption?: string;
      background_color?: string;
      music_title?: string;
      music_artist?: string;
      music_url?: string;
      duration_seconds?: number;
      music_start?: number;
      music_end?: number;
      stickers?: any[];
      audience?: "everyone" | "close_friends";
    }
  ) => Promise<void>;

  // Story Highlights (Öne Çıkanlar)
  userHighlights: Record<string, StoryHighlight[]>;
  activeHighlight: StoryHighlight | null;
  activeHighlightStoryIndex: number;
  loadUserHighlights: (userId: string) => Promise<StoryHighlight[]>;
  loadHighlightDetails: (highlightId: string) => Promise<StoryHighlight>;
  createHighlight: (title: string, coverUrl: string, storyIds: string[]) => Promise<StoryHighlight>;
  updateHighlight: (id: string, title: string, coverUrl: string) => Promise<void>;
  deleteHighlight: (id: string, userId: string) => Promise<void>;
  addStoriesToHighlight: (highlightId: string, storyIds: string[]) => Promise<void>;
  removeStoryFromHighlight: (highlightId: string, storyId: string) => Promise<void>;
  openHighlightViewer: (highlight: StoryHighlight, initialIndex?: number) => void;
  closeHighlightViewer: () => void;
  setHighlightStoryIndex: (index: number) => void;
}

export interface StoryHighlight {
  id: string;
  user_id: string;
  title: string;
  cover_url: string;
  story_count?: number;
  stories?: Story[];
  created_at: string;
  updated_at: string;
}

export const useStoryStore = create<StoryStoreState>((set, get) => ({
  storyGroups: [],
  isLoading: false,
  activeViewerGroup: null,
  activeViewerStoryIndex: 0,
  isCreatorOpen: false,
  inAppNotification: null,

  showStoryNotification: (notif) => set({ inAppNotification: notif }),
  dismissStoryNotification: () => set({ inAppNotification: null }),

  loadStories: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get<{ story_groups: UserStoriesGroup[] }>("/stories");
      set({ storyGroups: res.data.story_groups || [] });
    } catch (err) {
      console.error("Hikayeler yüklenemedi:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  createStory: async (storyData) => {
    try {
      await api.post("/stories", storyData);
      await get().loadStories();
    } catch (err) {
      console.error("Hikaye oluşturulamadı:", err);
      throw err;
    }
  },

  markStoryViewed: async (storyId: string) => {
    try {
      await api.post(`/stories/${storyId}/view`);
      // Lokal durumu anında güncelle
      set((state) => {
        const updated = state.storyGroups.map((g) => ({
          ...g,
          stories: g.stories.map((s) =>
            s.id === storyId ? { ...s, has_viewed: true, views_count: s.views_count + 1 } : s
          ),
          has_unviewed: g.stories.some((s) => s.id !== storyId && !s.has_viewed),
        }));
        return { storyGroups: updated };
      });
    } catch (err) {
      console.error("Görüldü işaretlenemedi:", err);
    }
  },

  deleteStory: async (storyId: string) => {
    try {
      await api.delete(`/stories/${storyId}`);
      await get().loadStories();
      const currentGroup = get().activeViewerGroup;
      if (currentGroup) {
        const remaining = currentGroup.stories.filter((s) => s.id !== storyId);
        if (remaining.length === 0) {
          get().closeViewer();
        } else {
          set({
            activeViewerGroup: { ...currentGroup, stories: remaining },
            activeViewerStoryIndex: 0,
          });
        }
      }
    } catch (err) {
      console.error("Hikaye silinemedi:", err);
    }
  },

  removeStoryById: (storyId: string, authorId?: string) => {
    set((state) => {
      const updatedGroups = state.storyGroups
        .map((group) => {
          if (authorId && group.user.id !== authorId) return group;
          const remaining = group.stories.filter((s) => s.id !== storyId);
          return {
            ...group,
            stories: remaining,
            has_unviewed: remaining.some((s) => !s.has_viewed),
          };
        })
        .filter((group) => group.stories.length > 0);

      let activeViewerGroup = state.activeViewerGroup;
      let activeViewerStoryIndex = state.activeViewerStoryIndex;

      if (activeViewerGroup && activeViewerGroup.stories.some((s) => s.id === storyId)) {
        const remaining = activeViewerGroup.stories.filter((s) => s.id !== storyId);
        if (remaining.length === 0) {
          activeViewerGroup = null;
          activeViewerStoryIndex = 0;
        } else {
          activeViewerGroup = { ...activeViewerGroup, stories: remaining };
          if (activeViewerStoryIndex >= remaining.length) {
            activeViewerStoryIndex = Math.max(0, remaining.length - 1);
          }
        }
      }

      return {
        storyGroups: updatedGroups,
        activeViewerGroup,
        activeViewerStoryIndex,
      };
    });
  },

  getStoryViewers: async (storyId: string) => {
    try {
      const res = await api.get<{ viewers: StoryAuthor[] }>(`/stories/${storyId}/viewers`);
      return res.data.viewers || [];
    } catch (err) {
      console.error("Görüntüleyenler alınamadı:", err);
      return [];
    }
  },

  getStoryReactions: async (storyId: string) => {
    try {
      const res = await api.get<{ reactions: StoryReactionItem[] }>(`/stories/${storyId}/reactions`);
      return res.data.reactions || [];
    } catch (err) {
      console.error("Hikaye tepkileri alınamadı:", err);
      return [];
    }
  },

  sendReaction: async (storyId: string, reaction: string) => {
    try {
      await api.post(`/stories/${storyId}/reactions`, { reaction });
    } catch (err) {
      console.error("Hikaye tepkisi gönderilemedi:", err);
      throw err;
    }
  },

  getCloseFriends: async () => {
    try {
      const res = await api.get<{ close_friends: StoryAuthor[] }>("/users/me/close-friends");
      return res.data.close_friends || [];
    } catch (err) {
      console.error("Yakın arkadaşlar alınamadı:", err);
      return [];
    }
  },

  addCloseFriend: async (friendId: string) => {
    try {
      await api.post(`/users/me/close-friends/${friendId}`);
    } catch (err) {
      console.error("Yakın arkadaş eklenemedi:", err);
      throw err;
    }
  },

  removeCloseFriend: async (friendId: string) => {
    try {
      await api.delete(`/users/me/close-friends/${friendId}`);
    } catch (err) {
      console.error("Yakın arkadaş çıkarılamadı:", err);
      throw err;
    }
  },

  openViewer: (group, initialIndex = 0) => {
    set({
      activeViewerGroup: group,
      activeViewerStoryIndex: initialIndex,
    });
  },

  closeViewer: () => {
    set({
      activeViewerGroup: null,
      activeViewerStoryIndex: 0,
    });
  },

  setViewerStoryIndex: (index) => {
    set({ activeViewerStoryIndex: index });
  },

  editingStory: null,

  openCreator: (storyToEdit?: Story) => {
    set({ isCreatorOpen: true, editingStory: storyToEdit || null });
  },

  closeCreator: () => {
    set({ isCreatorOpen: false, editingStory: null });
  },

  updateStory: async (storyId, storyData) => {
    try {
      await api.patch(`/stories/${storyId}`, storyData);
      await get().loadStories();
    } catch (err) {
      console.error("Hikaye güncellenemedi:", err);
      throw err;
    }
  },

  // Highlight State & Metodları
  userHighlights: {},
  activeHighlight: null,
  activeHighlightStoryIndex: 0,

  loadUserHighlights: async (userId: string) => {
    try {
      const res = await api.get<{ highlights: StoryHighlight[] }>(`/stories/highlights/user/${userId}`);
      const list = res.data.highlights || [];
      set((state) => ({
        userHighlights: { ...state.userHighlights, [userId]: list },
      }));
      return list;
    } catch (err) {
      console.error("Öne çıkanlar yüklenemedi:", err);
      return [];
    }
  },

  loadHighlightDetails: async (highlightId: string) => {
    try {
      const res = await api.get<StoryHighlight>(`/stories/highlights/${highlightId}`);
      return res.data;
    } catch (err) {
      console.error("Öne çıkan detayı yüklenemedi:", err);
      throw err;
    }
  },

  createHighlight: async (title: string, coverUrl: string, storyIds: string[]) => {
    try {
      const res = await api.post<StoryHighlight>("/stories/highlights", {
        title,
        cover_url: coverUrl,
        story_ids: storyIds,
      });
      const newHL = res.data;
      const currentUserId = newHL.user_id;
      if (currentUserId) {
        set((state) => {
          const existing = state.userHighlights[currentUserId] || [];
          return {
            userHighlights: {
              ...state.userHighlights,
              [currentUserId]: [newHL, ...existing],
            },
          };
        });
      }
      return newHL;
    } catch (err) {
      console.error("Öne çıkan oluşturulamadı:", err);
      throw err;
    }
  },

  updateHighlight: async (id: string, title: string, coverUrl: string) => {
    try {
      await api.put(`/stories/highlights/${id}`, { title, cover_url: coverUrl });
    } catch (err) {
      console.error("Öne çıkan güncellenemedi:", err);
      throw err;
    }
  },

  deleteHighlight: async (id: string, userId: string) => {
    try {
      await api.delete(`/stories/highlights/${id}`);
      set((state) => {
        const existing = state.userHighlights[userId] || [];
        return {
          userHighlights: {
            ...state.userHighlights,
            [userId]: existing.filter((h) => h.id !== id),
          },
        };
      });
    } catch (err) {
      console.error("Öne çıkan silinemedi:", err);
      throw err;
    }
  },

  addStoriesToHighlight: async (highlightId: string, storyIds: string[]) => {
    try {
      await api.post(`/stories/highlights/${highlightId}/stories`, { story_ids: storyIds });
    } catch (err) {
      console.error("Hikayeler öne çıkarılamadı:", err);
      throw err;
    }
  },

  removeStoryFromHighlight: async (highlightId: string, storyId: string) => {
    try {
      await api.delete(`/stories/highlights/${highlightId}/stories/${storyId}`);
      set((state) => {
        if (!state.activeHighlight || state.activeHighlight.id !== highlightId) return state;
        const filtered = (state.activeHighlight.stories || []).filter((s) => s.id !== storyId);
        return {
          activeHighlight: {
            ...state.activeHighlight,
            stories: filtered,
            story_count: filtered.length,
          },
        };
      });
    } catch (err) {
      console.error("Hikaye öne çıkanlardan çıkarılamadı:", err);
      throw err;
    }
  },

  openHighlightViewer: (highlight: StoryHighlight, initialIndex = 0) => {
    set({
      activeHighlight: highlight,
      activeHighlightStoryIndex: initialIndex,
    });
  },

  closeHighlightViewer: () => {
    set({
      activeHighlight: null,
      activeHighlightStoryIndex: 0,
    });
  },

  setHighlightStoryIndex: (index: number) => {
    set({ activeHighlightStoryIndex: index });
  },
}));
