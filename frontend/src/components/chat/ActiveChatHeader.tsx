"use client";

import {
  ArrowLeft,
  Phone,
  Video,
  Search,
  Info,
  MoreVertical,
  Key,
  CheckSquare,
  Eraser,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import { Conversation } from "@/store/useChatStore";
import { resolveMediaUrl } from "@/lib/api";
import { formatLastSeen } from "@/lib/utils";

interface Props {
  activeConv: Conversation;
  isOtherTyping: boolean;
  hasOtherStory: boolean;
  hasOtherUnviewed: boolean;
  isOtherCloseFriends: boolean;
  otherUserStoryGroup?: any;
  isChatSearchOpen: boolean;
  showContactDrawer: boolean;
  showActiveChatMenu: boolean;
  enableAudioCalls: boolean;
  enableVideoCalls: boolean;
  onBackToChatList: () => void;
  onOpenStory: (storyGroup: any) => void;
  onToggleContactDrawer: () => void;
  onToggleChatSearch: () => void;
  onStartCall: (type: "audio" | "video") => void;
  onToggleActiveChatMenu: () => void;
  onOpenSafetyNumber: () => void;
  onStartSelectionMode: () => void;
  onConfirmDelete: (type: "clear" | "delete") => void;
}

export default function ActiveChatHeader({
  activeConv,
  isOtherTyping,
  hasOtherStory,
  hasOtherUnviewed,
  isOtherCloseFriends,
  otherUserStoryGroup,
  isChatSearchOpen,
  showContactDrawer,
  showActiveChatMenu,
  enableAudioCalls,
  enableVideoCalls,
  onBackToChatList,
  onOpenStory,
  onToggleContactDrawer,
  onToggleChatSearch,
  onStartCall,
  onToggleActiveChatMenu,
  onOpenSafetyNumber,
  onStartSelectionMode,
  onConfirmDelete,
}: Props) {
  return (
    <header className="h-16 border-b border-grupo-dark-border px-2.5 sm:px-6 flex items-center justify-between bg-grupo-dark-card/60 backdrop-blur-md z-10 flex-shrink-0">
      <div
        onClick={onToggleContactDrawer}
        className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-2 cursor-pointer"
      >
        {/* Mobilde Geri Butonu (<-- Geri) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBackToChatList();
          }}
          title="Geri Dön"
          className="md:hidden p-1.5 sm:p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer -ml-1 flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div
          onClick={
            hasOtherStory
              ? (e) => {
                  e.stopPropagation();
                  onOpenStory(otherUserStoryGroup);
                }
              : undefined
          }
          title={
            hasOtherStory
              ? `${activeConv.other_user.display_name} hikayesini izle`
              : undefined
          }
          className={`relative flex-shrink-0 ${
            hasOtherStory ? "group/story-header cursor-pointer" : ""
          }`}
        >
          <div
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all ${
              hasOtherStory
                ? `p-[2px] group-hover/story-header:scale-105 ${
                    hasOtherUnviewed
                      ? isOtherCloseFriends
                        ? "bg-gradient-to-tr from-emerald-500 via-green-400 to-teal-400 ring-2 ring-emerald-500/30 animate-in fade-in"
                        : "bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-400 ring-2 ring-pink-500/20 animate-in fade-in"
                      : isOtherCloseFriends
                      ? "border-2 border-emerald-500/70"
                      : "border-2 border-slate-700"
                  }`
                : "border border-slate-700 bg-slate-800"
            }`}
          >
            <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs sm:text-sm text-grupo-accent overflow-hidden border border-grupo-dark-card">
              {activeConv.other_user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveMediaUrl(activeConv.other_user.avatar_url)}
                  alt={activeConv.other_user.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                activeConv.other_user.display_name.charAt(0).toUpperCase()
              )}
            </div>
          </div>
          {activeConv.is_online && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-grupo-dark-card z-10" />
          )}
          {hasOtherStory && isOtherCloseFriends && hasOtherUnviewed && (
            <span
              title="Yakın Arkadaşlar Hikayesi"
              className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[8px] font-black border border-slate-950 shadow-sm z-10"
            >
              ★
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white truncate leading-tight">
              {activeConv.other_user.display_name}
            </h3>
            {/* Masaüstünde E2EE Güvenlik Rozeti */}
            <span
              onClick={(e) => {
                e.stopPropagation();
                onOpenSafetyNumber();
              }}
              title="Uçtan Uca Şifreli (Güvenlik Kodunu Doğrula)"
              className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold hover:bg-emerald-500/20 transition-colors"
            >
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>E2EE</span>
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-400 truncate leading-tight mt-0.5">
            {isOtherTyping ? (
              <span
                style={{ color: "var(--accent, #6366F1)" }}
                className="font-semibold animate-pulse"
              >
                yazıyor...
              </span>
            ) : activeConv.is_online ? (
              <span className="text-emerald-400 font-medium">Çevrimiçi</span>
            ) : (
              formatLastSeen(
                activeConv.other_user.last_seen_at,
                activeConv.other_user.privacy_settings?.last_seen
              ) || "Çevrimdışı"
            )}
          </p>
        </div>
      </div>

      {/* Sesli / Görüntülü Arama & Profil Butonları */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        {enableAudioCalls && (
          <button
            onClick={() => onStartCall("audio")}
            title="Sesli Arama Başlat"
            className="p-2 sm:p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 transition-colors cursor-pointer"
          >
            <Phone className="w-4 h-4" />
          </button>
        )}
        {enableVideoCalls && (
          <button
            onClick={() => onStartCall("video")}
            title="Görüntülü Arama Başlat"
            className="p-2 sm:p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-grupo-accent transition-colors cursor-pointer"
          >
            <Video className="w-4 h-4" />
          </button>
        )}

        {/* Sohbet İçi Arama Butonu */}
        <button
          onClick={onToggleChatSearch}
          title="Sohbette Ara"
          className={`hidden sm:flex p-2 sm:p-2.5 rounded-xl transition-colors cursor-pointer ${
            isChatSearchOpen
              ? "text-white shadow-md"
              : "bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white"
          }`}
          style={
            isChatSearchOpen
              ? {
                  backgroundColor: "var(--accent, #6366F1)",
                  color: "var(--accent-text, #ffffff)",
                  boxShadow: "0 4px 12px var(--accent-shadow, rgba(99, 102, 241, 0.3))",
                }
              : undefined
          }
        >
          <Search className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleContactDrawer}
          title="Kişi Bilgisi"
          className="hidden sm:flex p-2 sm:p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <Info className="w-4 h-4" />
        </button>

        {/* Sohbet İşlemleri Menüsü (Web & Mobil) */}
        <div className="relative">
          <button
            onClick={onToggleActiveChatMenu}
            title="Sohbet Seçenekleri"
            className="p-2 sm:p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showActiveChatMenu && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-11 w-44 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl py-1.5 z-50 text-xs animate-in fade-in zoom-in-95"
            >
              <button
                onClick={() => {
                  onToggleActiveChatMenu();
                  onToggleContactDrawer();
                }}
                className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer sm:hidden"
              >
                <Info className="w-3.5 h-3.5 text-sky-400" />
                <span>Kişi Bilgisi</span>
              </button>
              <button
                onClick={() => {
                  onToggleActiveChatMenu();
                  onToggleChatSearch();
                }}
                className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" style={{ color: "var(--accent, #6366F1)" }} />
                <span>Sohbette Ara</span>
              </button>
              <button
                onClick={() => {
                  onToggleActiveChatMenu();
                  onOpenSafetyNumber();
                }}
                className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                <span>Güvenlik Kodu (E2EE)</span>
              </button>
              <button
                onClick={() => {
                  onToggleActiveChatMenu();
                  onStartSelectionMode();
                }}
                className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                <span>Mesajları Seç</span>
              </button>
              <div className="h-px bg-slate-800 my-1" />
              <button
                onClick={() => {
                  onToggleActiveChatMenu();
                  onConfirmDelete("clear");
                }}
                className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Eraser className="w-3.5 h-3.5 text-amber-400" />
                <span>Geçmişi Temizle</span>
              </button>
              <div className="h-px bg-slate-800 my-1" />
              <button
                onClick={() => {
                  onToggleActiveChatMenu();
                  onConfirmDelete("delete");
                }}
                className="w-full px-3 py-2 text-left text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 transition-colors font-medium cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>Sohbeti Sil</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
