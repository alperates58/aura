"use client";

import React, { useEffect } from "react";
import { useStoryStore, UserStoriesGroup } from "@/store/useStoryStore";
import { useAuthStore } from "@/store/useAuthStore";
import { Plus } from "lucide-react";
import { resolveMediaUrl } from "@/lib/api";

export default function StoriesBar() {
  const { user } = useAuthStore();
  const { storyGroups, loadStories, openViewer, openCreator } = useStoryStore();

  useEffect(() => {
    loadStories();
    // Her 2 dakikada bir hikayeleri arka planda tazele
    const interval = setInterval(() => {
      loadStories();
    }, 120000);
    return () => clearInterval(interval);
  }, [loadStories]);

  // Kendi hikaye grubumuz var mı?
  const ownGroup = storyGroups.find((g) => g.user.id === user?.id);
  // Aura Güvenlik hikayesini tespit et ve her zaman en başa yerleştir
  const securityGroup = storyGroups.find((g) => g.user.id === "00000000-0000-0000-0000-000000000001");
  const otherGroups = [
    ...(securityGroup && securityGroup.user.id !== user?.id ? [securityGroup] : []),
    ...storyGroups.filter(
      (g) => g.user.id !== user?.id && g.user.id !== "00000000-0000-0000-0000-000000000001"
    ),
  ];

  return (
    <div className="border-b border-grupo-dark-border bg-grupo-dark-card/50 px-3.5 py-2.5">
      <div className="flex items-center gap-3 overflow-x-auto no-scrollbar scroll-smooth">
        {/* 1. KENDİ HİKAYEN (Ekle / Gör) */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer group">
          <div className="relative">
            <button
              onClick={() => {
                if (ownGroup && ownGroup.stories.length > 0) {
                  openViewer(ownGroup);
                } else {
                  openCreator();
                }
              }}
              className={`w-14 h-14 rounded-full flex items-center justify-center p-0.5 transition-transform group-hover:scale-105 ${
                ownGroup && ownGroup.stories.length > 0
                  ? ownGroup.has_close_friends
                    ? "bg-gradient-to-tr from-emerald-500 via-green-400 to-teal-400 ring-2 ring-emerald-500/20"
                    : "bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-400"
                  : "bg-slate-800 border-2 border-dashed border-slate-600 hover:border-pink-500"
              }`}
            >
              <div className="w-full h-full rounded-full bg-slate-900 overflow-hidden flex items-center justify-center font-bold text-xs text-pink-400 border-2 border-grupo-dark-card">
                {user?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveMediaUrl(user.avatar_url)}
                    alt={user.display_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  user?.display_name?.charAt(0).toUpperCase() || "U"
                )}
              </div>
            </button>

            {/* Yeni hikaye ekleme butonu */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                openCreator();
              }}
              title="Yeni Hikaye Paylaş"
              className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-pink-600 hover:bg-pink-500 text-white flex items-center justify-center shadow-lg border-2 border-slate-950 transition-all hover:scale-115 active:scale-95 cursor-pointer z-10"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
            </button>
          </div>

          <span className="text-[11px] font-medium text-slate-300 max-w-[62px] truncate">
            {ownGroup && ownGroup.stories.length > 0 ? "Hikayen" : "Hikaye Ekle"}
          </span>
        </div>

        {/* 2. DİĞER KULLANICILARIN VE GÜVENLİK BOTUNUN HİKAYELERİ */}
        {otherGroups.map((group) => {
          const isSecurityBot = group.user.id === "00000000-0000-0000-0000-000000000001";
          const hasUnviewed = group.has_unviewed;
          const isCloseFriends = group.has_close_friends;
          return (
            <button
              key={group.user.id}
              onClick={() => openViewer(group)}
              className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer group"
            >
              <div className="relative">
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center p-0.5 transition-transform group-hover:scale-105 ${
                    isSecurityBot
                      ? hasUnviewed
                        ? "bg-gradient-to-tr from-rose-600 via-amber-500 to-red-600 ring-2 ring-rose-500/50 shadow-lg shadow-rose-950/50 animate-pulse"
                        : "border-2 border-rose-500/70"
                      : hasUnviewed
                      ? isCloseFriends
                        ? "bg-gradient-to-tr from-emerald-500 via-green-400 to-teal-400 ring-2 ring-emerald-500/30 animate-in fade-in"
                        : "bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-400 animate-in fade-in"
                      : isCloseFriends
                      ? "border-2 border-emerald-500/70"
                      : "border-2 border-slate-700"
                  }`}
                >
                  <div className="w-full h-full rounded-full bg-slate-900 overflow-hidden flex items-center justify-center font-bold text-xs text-pink-400 border-2 border-grupo-dark-card">
                    {group.user.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveMediaUrl(group.user.avatar_url)}
                        alt={group.user.display_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      group.user.display_name?.charAt(0).toUpperCase() || "U"
                    )}
                  </div>
                </div>

                {/* Güvenlik Kalkanı Rozeti */}
                {isSecurityBot && (
                  <div
                    title="Aura Güvenlik Bildirimi"
                    className="absolute -bottom-0.5 -right-0.5 w-4.5 h-4.5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] font-black border-2 border-slate-950 shadow-md animate-bounce duration-1000"
                  >
                    🛡️
                  </div>
                )}

                {/* Yakın Arkadaşlar Yeşil Yıldız Rozeti */}
                {!isSecurityBot && isCloseFriends && (
                  <div
                    title="Yakın Arkadaşlar Hikayesi"
                    className="absolute -bottom-0.5 -right-0.5 w-4.5 h-4.5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[10px] font-black border-2 border-slate-950 shadow-md"
                  >
                    ★
                  </div>
                )}
              </div>

              <span
                className={`text-[11px] max-w-[62px] truncate transition-colors ${
                  isSecurityBot
                    ? "font-bold text-rose-400"
                    : hasUnviewed
                    ? isCloseFriends
                      ? "font-semibold text-emerald-400"
                      : "font-semibold text-white"
                    : "font-normal text-slate-400"
                }`}
              >
                {isSecurityBot ? "Güvenlik" : group.user.display_name.split(" ")[0]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
