/**
 * YouTube & YouTube Music URL yardımcıları ve Meta Veri Çıkarıcı
 */

export interface MediaMeta {
  mediaType: "youtube" | "youtube_music" | "audio";
  url: string;
  youtubeId?: string;
  title: string;
  artist: string;
  thumbnail: string;
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
 * URL'nin YouTube veya YouTube Music olup olmadığını kontrol eder.
 */
export function isYouTubeUrl(url: string): boolean {
  return extractYouTubeId(url) !== null;
}

/**
 * YouTube Music olup olmadığını kontrol eder.
 */
export function isYouTubeMusicUrl(url: string): boolean {
  return /music\.youtube\.com/i.test(url);
}

/**
 * Verilen URL için başlık, kapak ve sanatçı bilgilerini çeker (API anahtarsız oEmbed).
 */
export async function fetchMediaMetadata(inputUrl: string): Promise<MediaMeta> {
  const url = inputUrl.trim();
  const ytId = extractYouTubeId(url);

  if (ytId) {
    const isMusic = isYouTubeMusicUrl(url);
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
            title: data.title,
            artist: data.author_name || (isMusic ? "YouTube Music" : "YouTube"),
            thumbnail: data.thumbnail_url || thumbnail,
          };
        }
      }
    } catch {
      // oEmbed hata verirse fallback
    }

    return {
      mediaType,
      url,
      youtubeId: ytId,
      title: isMusic ? "YouTube Music Parçası" : "YouTube Videosu",
      artist: isMusic ? "YouTube Music" : "YouTube",
      thumbnail,
    };
  }

  // Doğrudan ses dosyası (MP3/WAV/AAC/Radyo)
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
