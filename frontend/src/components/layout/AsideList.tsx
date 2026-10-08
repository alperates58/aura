"use client";

import React, { useEffect, useState } from "react";
import {
  Search,
  UserPlus,
  Sliders,
  LogOut,
  MessageSquare,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useChatStore } from "@/store/useChatStore";
import { useStoryStore } from "@/store/useStoryStore";
import { useSocketStore } from "@/store/useSocketStore";
import { NavTab } from "@/components/layout/SideNavigation";
import MobileNavigation from "@/components/layout/MobileNavigation";
import StoriesBar from "@/components/story/StoriesBar";
import ConversationListItem from "@/components/chat/ConversationListItem";
import { api, resolveMediaUrl } from "@/lib/api";
import { formatLastSeen } from "@/lib/utils";

export interface AsideListProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  totalUnreadCount: number;
  starredCount: number;
  onOpenSettings: (tab?: string) => void;
  onOpenAdmin: (tab?: string) => void;
  onLogout: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onStartChat: (userId: string) => void;
}

export default function AsideList({
  activeTab,
  onTabChange,
  totalUnreadCount,
  starredCount,
  onOpenSettings,
  onOpenAdmin,
  onLogout,
  searchQuery,
  setSearchQuery,
  searchInputRef,
  onStartChat,
}: AsideListProps) {
  const { user, isAuthenticated } = useAuthStore();
  const {
    conversations,
    activeConversationId,
    typingMap,
    selectConversation,
    deleteConversation,
    clearConversation,
  } = useChatStore();
  const { storyGroups, openViewer } = useStoryStore();
  const isConnected = useSocketStore((state) => state.isConnected);

  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [contactsList, setContactsList] = useState<any[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);

  // Kişiler sekmesine geçildiğinde tüm kullanıcıları yükle
  useEffect(() => {
    if (activeTab === "contacts" && isAuthenticated) {
      setIsLoadingContacts(true);
      api
        .get("/users/search?q=")
        .then((res) => {
          setContactsList(res.data);
        })
        .catch((err) => console.error("Kişiler yüklenemedi:", err))
        .finally(() => setIsLoadingContacts(false));
    }
  }, [activeTab, isAuthenticated]);

  // Kullanıcı Arama
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      const delay = setTimeout(async () => {
        try {
          const res = await api.get(`/users/search?q=${encodeURIComponent(searchQuery)}`);
          setSearchResults(res.data);
        } catch (e) {
          console.error("Arama hatası:", e);
        }
      }, 300);
      return () => clearTimeout(delay);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  return (
    <aside
      className={`${
        activeConversationId ? "hidden md:flex" : "flex w-full"
      } md:w-[280px] lg:w-[320px] xl:w-[340px] bg-grupo-dark-card border-r border-grupo-dark-border flex-col z-10 flex-shrink-0 h-full`}
    >
      {/* Kullanıcı Profili Üst Barı (Mobilde ve dar görünümde görünür) */}
      <div className="p-3.5 sm:p-4 border-b border-grupo-dark-border flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => onOpenSettings()}
            className="relative flex-shrink-0 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-sm text-grupo-accent overflow-hidden">
              {user?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveMediaUrl(user.avatar_url) || user.avatar_url}
                  alt={user.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                user?.display_name?.charAt(0).toUpperCase() || "U"
              )}
            </div>
            <span
              className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-grupo-dark-card ${
                isConnected ? "bg-emerald-500" : "bg-rose-500"
              }`}
            />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white truncate">{user?.display_name}</h2>
            <p className="text-xs text-slate-400 truncate">@{user?.username}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <button
            onClick={() => onOpenAdmin(undefined)}
            title="Aura Parametre Yönetimi"
            className="p-2 rounded-xl text-amber-400 hover:text-amber-300 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Sliders className="w-4 h-4" />
          </button>
          <button
            onClick={onLogout}
            title="Çıkış Yap"
            className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Canlı Arama Kutusu */}
      <div className="p-3 border-b border-grupo-dark-border">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === "contacts"
                ? "Kişilerde ara..."
                : "Sohbet veya kişi ara..."
            }
            className="w-full bg-slate-900/80 border border-grupo-dark-border rounded-xl py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-grupo-accent transition-colors"
          />
        </div>
      </div>

      {/* 24 Saatlik Hikayeler / Durumlar Barı (WhatsApp & Instagram Modu) */}
      {!searchQuery.trim() && activeTab === "chats" && <StoriesBar />}

      {/* Arama Sonuçları Varsa */}
      {searchQuery.trim().length >= 2 ? (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="px-3 py-1.5 text-[11px] font-bold uppercase text-slate-400 tracking-wider">
            Arama Sonuçları ({searchResults.length})
          </div>
          {searchResults.map((u) => {
            const uStory = storyGroups.find((g) => g.user.id === u.id && g.stories.length > 0);
            const uHasStory = !!uStory;
            const uUnviewed = !!uStory?.has_unviewed;
            const uCloseFriends = !!uStory?.has_close_friends;

            return (
              <button
                key={u.id}
                onClick={() => onStartChat(u.id)}
                className="w-full p-2.5 rounded-xl hover:bg-slate-800/60 flex items-center justify-between text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div
                    onClick={
                      uHasStory
                        ? (e) => {
                            e.stopPropagation();
                            openViewer(uStory, 0);
                          }
                        : undefined
                    }
                    title={uHasStory ? `${u.display_name} hikayesini izle` : undefined}
                    className={`relative flex-shrink-0 ${uHasStory ? "cursor-pointer group/search-story" : ""}`}
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                        uHasStory
                          ? `p-[2px] group-hover/search-story:scale-105 ${
                              uUnviewed
                                ? uCloseFriends
                                  ? "bg-gradient-to-tr from-emerald-500 via-green-400 to-teal-400 ring-2 ring-emerald-500/30"
                                  : "bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-400 ring-2 ring-pink-500/20"
                                : uCloseFriends
                                ? "border-2 border-emerald-500/70"
                                : "border-2 border-slate-700"
                            }`
                          : "border border-slate-700 bg-slate-800"
                      }`}
                    >
                      <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-grupo-accent overflow-hidden border border-grupo-dark-card">
                        {u.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={resolveMediaUrl(u.avatar_url)}
                            alt={u.display_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          u.display_name.charAt(0).toUpperCase()
                        )}
                      </div>
                    </div>
                    {uHasStory && uCloseFriends && uUnviewed && (
                      <span
                        title="Yakın Arkadaşlar Hikayesi"
                        className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[7px] font-black border border-slate-950 shadow-sm z-10"
                      >
                        ★
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{u.display_name}</div>
                    <div className="text-xs text-slate-400">@{u.username}</div>
                  </div>
                </div>
                <UserPlus className="w-4 h-4 text-grupo-accent" />
              </button>
            );
          })}
        </div>
      ) : activeTab === "contacts" ? (
        /* TAB 2: Kişiler / Rehber Listesi */
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="px-3 py-1.5 text-[11px] font-bold uppercase text-slate-400 tracking-wider">
            Kayıtlı Kişiler ({contactsList.length})
          </div>
          {isLoadingContacts ? (
            <div className="p-8 text-center text-xs text-slate-500">Kişiler yükleniyor...</div>
          ) : contactsList.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Sistemde henüz başka kayıtlı kullanıcı yok.
            </div>
          ) : (
            contactsList.map((contact) => {
              const contactStory = storyGroups.find((g) => g.user.id === contact.id && g.stories.length > 0);
              const contactHasStory = !!contactStory;
              const contactUnviewed = !!contactStory?.has_unviewed;
              const contactCloseFriends = !!contactStory?.has_close_friends;

              return (
                <button
                  key={contact.id}
                  onClick={() => onStartChat(contact.id)}
                  className="w-full p-3 rounded-2xl hover:bg-slate-800/60 flex items-center gap-3 text-left transition-all cursor-pointer"
                >
                  <div
                    onClick={
                      contactHasStory
                        ? (e) => {
                            e.stopPropagation();
                            openViewer(contactStory, 0);
                          }
                        : undefined
                    }
                    title={contactHasStory ? `${contact.display_name} hikayesini izle` : undefined}
                    className={`relative flex-shrink-0 ${contactHasStory ? "cursor-pointer group/contact-story" : ""}`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                        contactHasStory
                          ? `p-[2px] group-hover/contact-story:scale-105 ${
                              contactUnviewed
                                ? contactCloseFriends
                                  ? "bg-gradient-to-tr from-emerald-500 via-green-400 to-teal-400 ring-2 ring-emerald-500/30"
                                  : "bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-400 ring-2 ring-pink-500/20"
                                : contactCloseFriends
                                ? "border-2 border-emerald-500/70"
                                : "border-2 border-slate-700"
                            }`
                          : "border border-slate-700 bg-slate-800"
                      }`}
                    >
                      <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center font-bold text-sm text-grupo-accent overflow-hidden border border-grupo-dark-card">
                        {contact.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={resolveMediaUrl(contact.avatar_url)}
                            alt={contact.display_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          contact.display_name.charAt(0).toUpperCase()
                        )}
                      </div>
                    </div>
                    {contact.online_status === 1 && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-grupo-dark-card z-10" />
                    )}
                    {contactHasStory && contactCloseFriends && contactUnviewed && (
                      <span
                        title="Yakın Arkadaşlar Hikayesi"
                        className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[8px] font-black border border-slate-950 shadow-sm z-10"
                      >
                        ★
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-white truncate">{contact.display_name}</div>
                      {contact.online_status === 1 ? (
                        <span className="text-[10px] text-emerald-400 font-medium">Çevrimiçi</span>
                      ) : (
                        <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                          {formatLastSeen(contact.last_seen_at, contact.privacy_settings?.last_seen)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 truncate">@{contact.username}</div>
                  </div>
                  <UserPlus className="w-4 h-4 text-grupo-accent flex-shrink-0" />
                </button>
              );
            })
          )}
        </div>
      ) : (
        /* TAB 1: Sohbetler Listesi */
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <MessageSquare className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-xs">Henüz bir sohbet yok.</p>
              <p className="text-[11px] text-slate-600 mt-1">
                &quot;Kişiler&quot; sekmesine geçerek bir kullanıcıyla sohbete başlayabilirsiniz.
              </p>
            </div>
          ) : (
            conversations.map((conv) => (
              <ConversationListItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                isTyping={!!typingMap[conv.id]}
                onSelect={() => selectConversation(conv.id)}
                onDelete={() => deleteConversation(conv.id)}
                onClearHistory={() => clearConversation(conv.id)}
              />
            ))
          )}
        </div>
      )}

      {/* Mobilde Alt Navigasyon Barı (Sohbet açık değilken) */}
      {!activeConversationId && (
        <MobileNavigation
          activeTab={activeTab}
          onTabChange={onTabChange}
          unreadCount={totalUnreadCount}
          starredCount={starredCount}
          onOpenSettings={onOpenSettings}
          onOpenAdmin={onOpenAdmin}
        />
      )}
    </aside>
  );
}
