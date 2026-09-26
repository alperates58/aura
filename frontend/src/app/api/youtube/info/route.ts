import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const inputUrl = searchParams.get("url") || "";
  const playlistIdParam = searchParams.get("playlistId") || "";

  let playlistId = playlistIdParam;
  if (!playlistId && inputUrl) {
    const match = inputUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
    if (match) playlistId = match[1];
  }

  if (!playlistId) {
    return NextResponse.json({ error: "Geçerli bir playlistId bulunamadı" }, { status: 400 });
  }

  try {
    const fetchUrl = `https://www.youtube.com/playlist?list=${playlistId}&hl=tr`;
    const res = await fetch(fetchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8",
      },
      next: { revalidate: 300 }, // 5 dakika önbellek
    });

    if (!res.ok) {
      return NextResponse.json({ error: "YouTube'dan playlist alınamadı" }, { status: 502 });
    }

    const html = await res.text();
    const match = html.match(/var ytInitialData = ({.*?});<\/script>/);

    if (!match || !match[1]) {
      return NextResponse.json({ error: "Playlist verisi çözümlenemedi" }, { status: 500 });
    }

    const json = JSON.parse(match[1]);

    // Başlık ve Sanatçı
    const title =
      json.metadata?.playlistMetadataRenderer?.title ||
      json.header?.playlistHeaderRenderer?.title?.simpleText ||
      json.header?.playlistHeaderRenderer?.title?.runs?.[0]?.text ||
      "YouTube Çalma Listesi";

    const artist =
      json.sidebar?.playlistSidebarRenderer?.items?.[1]
        ?.playlistSidebarSecondaryInfoRenderer?.videoOwner?.videoOwnerRenderer
        ?.title?.runs?.[0]?.text || "YouTube Music Playlist";

    // Şarkıları Ayıkla (lockupViewModel veya playlistVideoRenderer)
    const tracks: Array<{
      id: string;
      title: string;
      artist: string;
      duration?: string;
      thumbnail: string;
      url: string;
    }> = [];

    const visited = new Set<string>();

    function walk(o: any) {
      if (!o || typeof o !== "object") return;

      if (o.lockupViewModel && o.lockupViewModel.contentId) {
        const id = o.lockupViewModel.contentId;
        if (!visited.has(id)) {
          visited.add(id);
          const meta = o.lockupViewModel.metadata?.lockupMetadataViewModel;
          const trackTitle = meta?.title?.content || "Müzik Parçası";
          const a11y = meta?.image?.decoratedAvatarViewModel?.a11yLabel || "";
          const trackArtist = a11y.replace(/^Kanala git:\s*/i, "") || artist;
          tracks.push({
            id,
            title: trackTitle,
            artist: trackArtist,
            thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
            url: `https://music.youtube.com/watch?v=${id}`,
          });
        }
      }

      if (o.playlistVideoRenderer && o.playlistVideoRenderer.videoId) {
        const v = o.playlistVideoRenderer;
        if (!visited.has(v.videoId)) {
          visited.add(v.videoId);
          tracks.push({
            id: v.videoId,
            title: v.title?.runs?.[0]?.text || v.title?.simpleText || "Müzik Parçası",
            artist: v.shortBylineText?.runs?.[0]?.text || artist,
            duration: v.lengthText?.simpleText || "",
            thumbnail: `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`,
            url: `https://music.youtube.com/watch?v=${v.videoId}`,
          });
        }
      }

      for (const k of Object.keys(o)) {
        walk(o[k]);
      }
    }

    walk(json);

    const thumbnail =
      tracks.length > 0
        ? tracks[0].thumbnail
        : `https://img.youtube.com/vi/default/hqdefault.jpg`;

    return NextResponse.json({
      mediaType: "youtube_playlist",
      playlistId,
      title,
      artist,
      thumbnail,
      trackCount: tracks.length,
      tracks: tracks.slice(0, 100), // İlk 100 parça
    });
  } catch (err: any) {
    console.error("Playlist ayrıştırma hatası:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
