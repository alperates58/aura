/**
 * YouTube & YouTube Music URL yardımcıları ve Meta Veri Çıkarıcı
 */

export interface PlaylistTrack {
  id: string;
  title: string;
  artist: string;
  duration?: string;
  thumbnail: string;
  url: string;
}

export interface MediaMeta {
  mediaType: "youtube" | "youtube_music" | "youtube_playlist" | "audio";
  url: string;
  youtubeId?: string;
  playlistId?: string;
  title: string;
  artist: string;
  thumbnail: string;
  trackCount?: number;
  tracks?: PlaylistTrack[];
}

/**
 * YouTube / YouTube Music URL'sinden 11 karakterlik video ID'sini ayıklar.
 */
export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const cleanUrl = url.trim();

  // 1. YouTube Music
  const musicMatch = cleanUrl.match(/music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/i);
  if (musicMatch) return musicMatch[1];

  // 2. Standart YouTube, Shorts, Embed ve youtu.be
  const ytMatch = cleanUrl.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/i
  );
  if (ytMatch) return ytMatch[1];

  return null;
}

/**
 * YouTube / YouTube Music Çalma Listesi (Playlist) ID'sini ayıklar (list=...).
 */
export function extractYouTubePlaylistId(url: string): string | null {
  if (!url) return null;
  const match = url.trim().match(/[?&]list=([a-zA-Z0-9_-]+)/i);
  return match ? match[1] : null;
}

/**
 * URL'nin YouTube veya YouTube Music olup olmadığını kontrol eder.
 */
export function isYouTubeUrl(url: string): boolean {
  return extractYouTubeId(url) !== null || extractYouTubePlaylistId(url) !== null;
}

/**
 * YouTube Music olup olmadığını kontrol eder.
 */
export function isYouTubeMusicUrl(url: string): boolean {
  return /music\.youtube\.com/i.test(url);
}

/**
 * YouTube Çalma Listesi linki olup olmadığını kontrol eder.
 */
export function isYouTubePlaylistUrl(url: string): boolean {
  return extractYouTubePlaylistId(url) !== null;
}

/**
 * Verilen URL için başlık, kapak ve sanatçı bilgilerini çeker.
 */
export async function fetchMediaMetadata(inputUrl: string): Promise<MediaMeta> {
  const url = inputUrl.trim();
  const playlistId = extractYouTubePlaylistId(url);
  const ytId = extractYouTubeId(url);
  const isMusic = isYouTubeMusicUrl(url);

  // 1. Çalma Listesi Kontrolü
  if (playlistId && (url.includes("playlist?list=") || !ytId)) {
    try {
      const res = await fetch(`/api/youtube/info?playlistId=${encodeURIComponent(playlistId)}`);
      if (res.ok) {
        const info = await res.json();
        if (info && info.title) {
          return {
            mediaType: "youtube_playlist",
            url,
            playlistId,
            youtubeId: ytId || (info.tracks?.[0]?.id ?? undefined),
            title: info.title,
            artist: info.artist || (isMusic ? "YouTube Music" : "YouTube"),
            thumbnail: info.thumbnail || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : ""),
            trackCount: info.trackCount,
            tracks: info.tracks || [],
          };
        }
      }
    } catch {}

    return {
      mediaType: "youtube_playlist",
      url,
      playlistId,
      youtubeId: ytId || undefined,
      title: isMusic ? "YouTube Music Çalma Listesi" : "YouTube Çalma Listesi",
      artist: isMusic ? "YouTube Music Playlist" : "YouTube Playlist",
      thumbnail: ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : "",
    };
  }

  // 2. Tekil Video / Şarkı Kontrolü
  if (ytId) {
    const mediaType = isMusic ? "youtube_music" : "youtube";
    const thumbnail = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;

    // oEmbed üzerinden başlık ve kanal/sanatçı bilgisini çekmeyi dene
    try {
      const oembedUrl = `https://noembed.com/embed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${ytId}`
      )}`;
      const res = await fetch(oembedUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data.title) {
          return {
            mediaType,
            url,
            youtubeId: ytId,
            playlistId: playlistId || undefined,
            title: data.title,
            artist: data.author_name || (isMusic ? "YouTube Music" : "YouTube"),
            thumbnail: data.thumbnail_url || thumbnail,
          };
        }
      }
    } catch {}

    return {
      mediaType,
      url,
      youtubeId: ytId,
      playlistId: playlistId || undefined,
      title: isMusic ? "YouTube Music Parçası" : "YouTube Videosu",
      artist: isMusic ? "YouTube Music" : "YouTube",
      thumbnail,
    };
  }

  // 3. Doğrudan ses dosyası (MP3/WAV/AAC/Radyo)
  let fileName = "Canlı Ses Akışı";
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length > 0) {
      const last = parts[parts.length - 1];
      if (last.includes(".")) {
        fileName = decodeURIComponent(last.replace(/\.[^/.]+$/, ""));
      } else {
        fileName = decodeURIComponent(last);
      }
    }
  } catch {}

  return {
    mediaType: "audio",
    url,
    title: fileName,
    artist: "Doğrudan Akış",
    thumbnail: "",
  };
}
