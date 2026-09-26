import { create } from "zustand";
import { useSocketStore } from "./useSocketStore";
import { useAuthStore } from "./useAuthStore";

export interface PlaylistTrackItem {
  id: string;
  title: string;
  artist: string;
  duration?: string;
  thumbnail: string;
  url?: string;
}

export interface ListenTogetherSession {
  conversationId: string;
  senderId?: string;
  mediaType: "youtube" | "youtube_music" | "youtube_playlist" | "audio";
  url: string;
  youtubeId?: string;
  playlistId?: string;
  playlistIndex?: number;
  tracks?: PlaylistTrackItem[];
  title: string;
  artist: string;
  thumbnail: string;
  startedByName: string;
  startedById: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isMuted: boolean;
  volume: number;
}

export interface SyncEvent {
  type: "start" | "play" | "pause" | "seek" | "next" | "prev" | "change" | "stop";
  time: number;
  timestamp: number;
}

interface ListenTogetherState {
  session: ListenTogetherSession | null;
  isIslandExpanded: boolean;
  isModalOpen: boolean;
  showVideo: boolean;
  syncTrigger: SyncEvent | null;

  // Eylemler
  startSession: (
    convId: string,
    meta: {
      mediaType: "youtube" | "youtube_music" | "youtube_playlist" | "audio";
      url: string;
      youtubeId?: string;
      playlistId?: string;
      playlistIndex?: number;
      tracks?: PlaylistTrackItem[];
      title: string;
      artist: string;
      thumbnail: string;
    }
  ) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekTo: (time: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  selectTrackByIndex: (index: number) => void;
  setTracks: (tracks: PlaylistTrackItem[]) => void;
  stopSession: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (dur: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  setIslandExpanded: (val: boolean) => void;
  toggleIslandExpanded: () => void;
  setModalOpen: (val: boolean) => void;
  setShowVideo: (val: boolean) => void;
  toggleShowVideo: () => void;

  // Uzaktan senkronizasyon (WebSocket)
  handleRemoteSync: (payload: any) => void;
}

export const useListenTogetherStore = create<ListenTogetherState>((set, get) => ({
  session: null,
  isIslandExpanded: false,
  isModalOpen: false,
  showVideo: false,
  syncTrigger: null,

  startSession: (convId, meta) => {
    const currentUser = useAuthStore.getState().user;
    const startedByName = currentUser?.display_name || currentUser?.username || "Siz";
    const startedById = currentUser?.id || "";

    const isPl = meta.mediaType === "youtube_playlist" || Boolean(meta.playlistId);

    const newSession: ListenTogetherSession = {
      conversationId: convId,
      mediaType: isPl ? "youtube_playlist" : meta.mediaType,
      url: meta.url,
      youtubeId: meta.youtubeId,
      playlistId: meta.playlistId,
      playlistIndex: meta.playlistIndex ?? 0,
      tracks: meta.tracks || [],
      title: meta.title,
      artist: meta.artist,
      thumbnail: meta.thumbnail,
      startedByName,
      startedById,
      isPlaying: true,
      currentTime: 0,
      duration: 0,
      isMuted: false,
      volume: 80,
    };

    set({
      session: newSession,
      isIslandExpanded: false,
      isModalOpen: false,
      syncTrigger: { type: "start", time: 0, timestamp: Date.now() },
    });

    // Karşı tarafa WebSocket yayını yap
    useSocketStore.getState().sendAction("listen_together_sync", {
      conversation_id: convId,
      action_type: "start",
      media_type: newSession.mediaType,
      url: meta.url,
      youtube_id: meta.youtubeId,
      playlist_id: meta.playlistId,
      playlist_index: meta.playlistIndex ?? 0,
      title: meta.title,
      artist: meta.artist,
      thumbnail: meta.thumbnail,
      started_by_name: startedByName,
      started_by_id: startedById,
      is_playing: true,
      current_time: 0,
    });

    // Eğer playlistId var ama tracks boşsa, arka planda parça listesini çek ve oturuma ekle
    if (meta.playlistId && (!meta.tracks || meta.tracks.length === 0)) {
      fetch(`/api/youtube/info?playlistId=${encodeURIComponent(meta.playlistId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.tracks && data.tracks.length > 0) {
            const current = get().session;
            if (current && current.playlistId === meta.playlistId) {
              set({
                session: {
                  ...current,
                  tracks: data.tracks,
                },
              });
            }
          }
        })
        .catch(() => {});
    }
  },

  play: () => {
    const s = get().session;
    if (!s) return;
    set({
      session: { ...s, isPlaying: true },
      syncTrigger: { type: "play", time: s.currentTime, timestamp: Date.now() },
    });
    useSocketStore.getState().sendAction("listen_together_sync", {
      conversation_id: s.conversationId,
      action_type: "play",
      url: s.url,
      is_playing: true,
      current_time: s.currentTime,
    });
  },

  pause: () => {
    const s = get().session;
    if (!s) return;
    set({
      session: { ...s, isPlaying: false },
      syncTrigger: { type: "pause", time: s.currentTime, timestamp: Date.now() },
    });
    useSocketStore.getState().sendAction("listen_together_sync", {
      conversation_id: s.conversationId,
      action_type: "pause",
      url: s.url,
      is_playing: false,
      current_time: s.currentTime,
    });
  },

  togglePlay: () => {
    const s = get().session;
    if (!s) return;
    if (s.isPlaying) {
      get().pause();
    } else {
      get().play();
    }
  },

  seekTo: (time: number) => {
    const s = get().session;
    if (!s) return;
    set({
      session: { ...s, currentTime: time },
      syncTrigger: { type: "seek", time, timestamp: Date.now() },
    });
    useSocketStore.getState().sendAction("listen_together_sync", {
      conversation_id: s.conversationId,
      action_type: "seek",
      url: s.url,
      is_playing: s.isPlaying,
      current_time: time,
    });
  },

  nextTrack: () => {
    const s = get().session;
    if (!s) return;

    if (s.tracks && s.tracks.length > 0) {
      const curIdx = s.playlistIndex ?? 0;
      const nextIdx = (curIdx + 1) % s.tracks.length;
      const nextTrack = s.tracks[nextIdx];

      const updated: ListenTogetherSession = {
        ...s,
        playlistIndex: nextIdx,
        youtubeId: nextTrack.id,
        title: nextTrack.title,
        artist: nextTrack.artist,
        thumbnail: nextTrack.thumbnail || s.thumbnail,
        currentTime: 0,
        isPlaying: true,
      };

      set({
        session: updated,
        syncTrigger: { type: "change", time: 0, timestamp: Date.now() },
      });

      useSocketStore.getState().sendAction("listen_together_sync", {
        conversation_id: s.conversationId,
        action_type: "change",
        media_type: s.mediaType,
        url: nextTrack.url || s.url,
        youtube_id: nextTrack.id,
        playlist_id: s.playlistId,
        playlist_index: nextIdx,
        title: nextTrack.title,
        artist: nextTrack.artist,
        thumbnail: nextTrack.thumbnail || s.thumbnail,
        started_by_name: s.startedByName,
        started_by_id: s.startedById,
        is_playing: true,
        current_time: 0,
      });
      return;
    }

    set({
      syncTrigger: { type: "next", time: 0, timestamp: Date.now() },
    });
    useSocketStore.getState().sendAction("listen_together_sync", {
      conversation_id: s.conversationId,
      action_type: "next",
      playlist_id: s.playlistId,
      is_playing: true,
      current_time: 0,
    });
  },

  previousTrack: () => {
    const s = get().session;
    if (!s) return;

    if (s.tracks && s.tracks.length > 0) {
      const curIdx = s.playlistIndex ?? 0;
      const prevIdx = (curIdx - 1 + s.tracks.length) % s.tracks.length;
      const prevTrack = s.tracks[prevIdx];

      const updated: ListenTogetherSession = {
        ...s,
        playlistIndex: prevIdx,
        youtubeId: prevTrack.id,
        title: prevTrack.title,
        artist: prevTrack.artist,
        thumbnail: prevTrack.thumbnail || s.thumbnail,
        currentTime: 0,
        isPlaying: true,
      };

      set({
        session: updated,
        syncTrigger: { type: "change", time: 0, timestamp: Date.now() },
      });

      useSocketStore.getState().sendAction("listen_together_sync", {
        conversation_id: s.conversationId,
        action_type: "change",
        media_type: s.mediaType,
        url: prevTrack.url || s.url,
        youtube_id: prevTrack.id,
        playlist_id: s.playlistId,
        playlist_index: prevIdx,
        title: prevTrack.title,
        artist: prevTrack.artist,
        thumbnail: prevTrack.thumbnail || s.thumbnail,
        started_by_name: s.startedByName,
        started_by_id: s.startedById,
        is_playing: true,
        current_time: 0,
      });
      return;
    }

    set({
      syncTrigger: { type: "prev", time: 0, timestamp: Date.now() },
    });
    useSocketStore.getState().sendAction("listen_together_sync", {
      conversation_id: s.conversationId,
      action_type: "prev",
      playlist_id: s.playlistId,
      is_playing: true,
      current_time: 0,
    });
  },

  selectTrackByIndex: (index: number) => {
    const s = get().session;
    if (!s || !s.tracks || !s.tracks[index]) return;

    const track = s.tracks[index];
    const updated: ListenTogetherSession = {
      ...s,
      playlistIndex: index,
      youtubeId: track.id,
      title: track.title,
      artist: track.artist,
      thumbnail: track.thumbnail || s.thumbnail,
      currentTime: 0,
      isPlaying: true,
    };

    set({
      session: updated,
      syncTrigger: { type: "change", time: 0, timestamp: Date.now() },
    });

    useSocketStore.getState().sendAction("listen_together_sync", {
      conversation_id: s.conversationId,
      action_type: "change",
      media_type: s.mediaType,
      url: track.url || s.url,
      youtube_id: track.id,
      playlist_id: s.playlistId,
      playlist_index: index,
      title: track.title,
      artist: track.artist,
      thumbnail: track.thumbnail || s.thumbnail,
      started_by_name: s.startedByName,
      started_by_id: s.startedById,
      is_playing: true,
      current_time: 0,
    });
  },

  setTracks: (tracks: PlaylistTrackItem[]) => {
    const s = get().session;
    if (s) {
      set({ session: { ...s, tracks } });
    }
  },

  stopSession: () => {
    const s = get().session;
    if (s) {
      useSocketStore.getState().sendAction("listen_together_sync", {
        conversation_id: s.conversationId,
        action_type: "stop",
        url: "",
        is_playing: false,
        current_time: 0,
      });
    }
    set({
      session: null,
      isIslandExpanded: false,
      syncTrigger: { type: "stop", time: 0, timestamp: Date.now() },
    });
  },

  setCurrentTime: (time) => {
    const s = get().session;
    if (s) {
      set({ session: { ...s, currentTime: time } });
    }
  },

  setDuration: (dur) => {
    const s = get().session;
    if (s) {
      set({ session: { ...s, duration: dur } });
    }
  },

  setVolume: (vol) => {
    const s = get().session;
    if (s) {
      set({ session: { ...s, volume: vol, isMuted: vol === 0 } });
    }
  },

  toggleMute: () => {
    const s = get().session;
    if (s) {
      set({ session: { ...s, isMuted: !s.isMuted } });
    }
  },

  setIslandExpanded: (val) => set({ isIslandExpanded: val }),
  toggleIslandExpanded: () => set((state) => ({ isIslandExpanded: !state.isIslandExpanded })),
  setModalOpen: (val) => set({ isModalOpen: val }),
  setShowVideo: (val) => set({ showVideo: val }),
  toggleShowVideo: () => set((state) => ({ showVideo: !state.showVideo })),

  handleRemoteSync: (payload: any) => {
    const currentUserId = useAuthStore.getState().user?.id;
    // Kendi gönderdiğimiz paketi tekrar işleme
    if (payload.sender_id && payload.sender_id === currentUserId) {
      return;
    }

    const {
      conversation_id,
      action_type,
      media_type,
      url,
      youtube_id,
      playlist_id,
      playlist_index,
      title,
      artist,
      thumbnail,
      started_by_name,
      started_by_id,
      is_playing,
      current_time,
    } = payload;

    // Oturumu durdurma olayı
    if (action_type === "stop" || (url === "" && !is_playing)) {
      set({
        session: null,
        isIslandExpanded: false,
        syncTrigger: { type: "stop", time: 0, timestamp: Date.now() },
      });
      return;
    }

    // Şarkı / Parça değişimi olayı
    if (action_type === "change") {
      const existing = get().session;
      if (existing) {
        set({
          session: {
            ...existing,
            youtubeId: youtube_id || existing.youtubeId,
            playlistIndex: playlist_index !== undefined ? playlist_index : existing.playlistIndex,
            title: title || existing.title,
            artist: artist || existing.artist,
            thumbnail: thumbnail || existing.thumbnail,
            currentTime: 0,
            isPlaying: is_playing !== undefined ? is_playing : true,
          },
          syncTrigger: {
            type: "change",
            time: 0,
            timestamp: Date.now(),
          },
        });
      }
      return;
    }

    // Playlist ileri / geri olayı
    if (action_type === "next") {
      set({ syncTrigger: { type: "next", time: 0, timestamp: Date.now() } });
      return;
    }
    if (action_type === "prev") {
      set({ syncTrigger: { type: "prev", time: 0, timestamp: Date.now() } });
      return;
    }

    const existingSession = get().session;

    // Yeni veya değişen oturum
    if (
      !existingSession ||
      existingSession.conversationId !== conversation_id ||
      (url && existingSession.url !== url && !playlist_id)
    ) {
      const isPl = media_type === "youtube_playlist" || Boolean(playlist_id);
      const newSession: ListenTogetherSession = {
        conversationId: conversation_id,
        senderId: payload.sender_id,
        mediaType: isPl ? "youtube_playlist" : (media_type || "youtube"),
        url: url || "",
        youtubeId: youtube_id,
        playlistId: playlist_id,
        playlistIndex: playlist_index || 0,
        tracks: existingSession && existingSession.playlistId === playlist_id ? existingSession.tracks : [],
        title: title || (isPl ? "Çalma Listesi" : "YouTube Parçası"),
        artist: artist || "Fısıltı Dinle",
        thumbnail: thumbnail || (youtube_id ? `https://img.youtube.com/vi/${youtube_id}/hqdefault.jpg` : ""),
        startedByName: started_by_name || "Diğer Kullanıcı",
        startedById: started_by_id || "",
        isPlaying: is_playing !== undefined ? is_playing : true,
        currentTime: current_time || 0,
        duration: 0,
        isMuted: false,
        volume: existingSession?.volume ?? 80,
      };

      set({
        session: newSession,
        syncTrigger: {
          type: "start",
          time: current_time || 0,
          timestamp: Date.now(),
        },
      });

      // Alıcı için de parçaları arka planda otomatik çek
      if (playlist_id && (!newSession.tracks || newSession.tracks.length === 0)) {
        fetch(`/api/youtube/info?playlistId=${encodeURIComponent(playlist_id)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data && data.tracks && data.tracks.length > 0) {
              const cur = get().session;
              if (cur && cur.playlistId === playlist_id) {
                set({
                  session: {
                    ...cur,
                    tracks: data.tracks,
                  },
                });
              }
            }
          })
          .catch(() => {});
      }
      return;
    }

    // Var olan oturumun durumunu güncelle (play / pause / seek)
    const updatedIsPlaying = is_playing !== undefined ? is_playing : existingSession.isPlaying;
    const updatedTime = current_time !== undefined ? current_time : existingSession.currentTime;

    const syncType =
      action_type === "pause"
        ? "pause"
        : action_type === "play"
        ? "play"
        : action_type === "seek"
        ? "seek"
        : updatedIsPlaying !== existingSession.isPlaying
        ? updatedIsPlaying
          ? "play"
          : "pause"
        : "seek";

    set({
      session: {
        ...existingSession,
        isPlaying: updatedIsPlaying,
        currentTime: updatedTime,
        startedByName: started_by_name || existingSession.startedByName,
      },
      syncTrigger: {
        type: syncType,
        time: updatedTime,
        timestamp: Date.now(),
      },
    });
  },
}));
