"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Globe, ExternalLink, Link2 } from "lucide-react";

interface LinkMetadata {
  url: string;
  title: string;
  description: string;
  image: string;
  site_name: string;
}

// Client-side cache to avoid refetching during re-renders
const previewCache = new Map<string, LinkMetadata>();

interface Props {
  url: string;
  isMine?: boolean;
}

export default function LinkPreviewCard({ url, isMine }: Props) {
  const [meta, setMeta] = useState<LinkMetadata | null>(() => previewCache.get(url) || null);
  const [loading, setLoading] = useState<boolean>(!previewCache.has(url));
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (!url) return;
    if (previewCache.has(url)) {
      setMeta(previewCache.get(url)!);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(false);

    api
      .post<LinkMetadata>(
        "/media/link-preview",
        { url },
        { timeout: 6000 }
      )
      .then((res) => {
        if (!isMounted) return;
        if (res.data && (res.data.title || res.data.description)) {
          previewCache.set(url, res.data);
          setMeta(res.data);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (isMounted) setError(true);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [url]);

  if (error || (!loading && !meta)) {
    return null; // Don't show broken card if no metadata found
  }

  if (loading && !meta) {
    return (
      <div className="my-1.5 p-2 rounded-xl bg-slate-900/60 border border-white/10 flex items-center gap-2 max-w-sm animate-pulse">
        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
          <Globe className="w-4 h-4 text-slate-500 animate-spin" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="h-3 w-3/4 bg-slate-800 rounded mb-1" />
          <div className="h-2 w-1/2 bg-slate-800/80 rounded" />
        </div>
      </div>
    );
  }

  if (!meta) return null;

  return (
    <a
      href={meta.url}
      target="_blank"
      rel="noopener noreferrer"
      className="my-2 block rounded-2xl overflow-hidden border border-white/10 bg-slate-900/95 hover:bg-slate-850 hover:border-pink-500/40 transition-all duration-200 shadow-lg group max-w-sm sm:max-w-md cursor-pointer"
    >
      {/* Görsel (Varsa) */}
      {meta.image && (
        <div className="relative aspect-video w-full bg-slate-950 overflow-hidden flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={meta.image}
            alt={meta.title || "Önizleme"}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = "none";
            }}
          />
        </div>
      )}

      {/* Bilgi Başlık ve Açıklaması */}
      <div className="p-3">
        {/* Site Adı / Hostname */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 text-[11px] text-pink-400 font-medium truncate">
            <Globe className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{meta.site_name || new URL(meta.url).hostname}</span>
          </div>
          <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-pink-400 transition-colors flex-shrink-0" />
        </div>

        {/* Başlık */}
        {meta.title && (
          <h4 className="text-xs font-bold text-white line-clamp-2 leading-snug group-hover:text-pink-300 transition-colors">
            {meta.title}
          </h4>
        )}

        {/* Açıklama */}
        {meta.description && (
          <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">
            {meta.description}
          </p>
        )}
      </div>
    </a>
  );
}
