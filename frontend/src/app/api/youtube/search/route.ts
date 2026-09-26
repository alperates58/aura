import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      query
    )}&hl=tr`;

    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json({ results: [] });
    }

    const html = await res.text();
    const match = html.match(/var ytInitialData = ({.*?});<\/script>/);

    if (!match || !match[1]) {
      return NextResponse.json({ results: [] });
    }

    const json = JSON.parse(match[1]);
    const contents =
      json.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents;

    const results: Array<{
      id: string;
      title: string;
      artist: string;
      thumbnail: string;
      duration: string;
      url: string;
    }> = [];

    if (Array.isArray(contents)) {
      for (const section of contents) {
        const items = section.itemSectionRenderer?.contents;
        if (!Array.isArray(items)) continue;

        for (const item of items) {
          const v = item.videoRenderer;
          if (v && v.videoId) {
            const title =
              v.title?.runs?.[0]?.text ||
              v.title?.simpleText ||
              "Bilinmeyen Parça";
            const artist =
              v.ownerText?.runs?.[0]?.text ||
              v.shortBylineText?.runs?.[0]?.text ||
              "YouTube Sanatçısı";
            const duration = v.lengthText?.simpleText || "";
            const thumbnail =
              v.thumbnail?.thumbnails?.[0]?.url ||
              `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;

            results.push({
              id: v.videoId,
              title,
              artist,
              thumbnail,
              duration,
              url: `https://music.youtube.com/watch?v=${v.videoId}`,
            });

            if (results.length >= 8) break;
          }
        }
        if (results.length >= 8) break;
      }
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    console.error("YouTube arama hatası:", err);
    return NextResponse.json({ results: [], error: err.message });
  }
}
