"use client";

import { useState, useRef, useEffect } from "react";
import { Conversation } from "@/store/useChatStore";
import { useStoryStore } from "@/store/useStoryStore";
import { resolveMediaUrl } from "@/lib/api";
import { formatLastSeen } from "@/lib/utils";
import { Trash2, Eraser, AlertCircle, MoreHorizontal } from "lucide-react";

interface Props {
  conversation: Conversation;
  isActive: boolean;
  isTyping: boolean;
  onSelect: () => void;
  onDelete: () => Promise<void>;
  onClearHistory: () => Promise<void>;
}

export default function ConversationListItem({
  conversation,
  isActive,
  isTyping,
  onSelect,
  onDelete,
  onClearHistory,
}: Props) {
  const storyGroups = useStoryStore((state) => state.storyGroups);
  const openViewer = useStoryStore((state) => state.openViewer);
  const userStoryGroup = storyGroups.find(
    (g) => g.user.id === conversation.other_user.id && g.stories.length > 0
  );
  const hasStory = !!userStoryGroup;
  const hasUnviewed = !!userStoryGroup?.has_unviewed;
  const isCloseFriends = !!userStoryGroup?.has_close_friends;

  const [translateX, setTranslateX] = useState(0);
  const [isSwiped, setIsSwiped] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<"delete" | "clear" | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isSwiping = useRef<boolean>(false);

  // Mobil Dokunma ve Kaydırma Hareketleri (Swipe Gestures)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartX.current;
    const diffY = currentY - touchStartY.current;

    // Dikey sayfa kaydırması yapılıyorsa yatay hareketi engelle
    if (Math.abs(diffY) > Math.abs(diffX) && !isSwiping.current) {
      return;
    }

    isSwiping.current = true;

    // Sola veya sağa kaydırma sınırları (-85px ile +85px arası)
    if (diffX < 0) {
      setTranslateX(Math.max(diffX, -85));
    } else if (diffX > 0) {
      setTranslateX(Math.min(diffX, 85));
    }
  };

  const handleTouchEnd = () => {
    touchStartX.current = null;
    touchStartY.current = null;
    isSwiping.current = false;

    if (translateX < -40) {
      setTranslateX(-80);
      setIsSwiped(true);
    } else if (translateX > 40) {
      setTranslateX(80);
      setIsSwiped(true);
    } else {
      setTranslateX(0);
      setIsSwiped(false);
    }
  };

  const resetSwipe = () => {
    setTranslateX(0);
    setIsSwiped(false);
  };

  const handleCardClick = () => {
    if (isSwiped || translateX !== 0) {
      resetSwipe();
      return;
    }
    onSelect();
  };

  const confirmAction = async () => {
    setIsDeleting(true);
    try {
      if (showConfirmModal === "delete") {
        await onDelete();
      } else if (showConfirmModal === "clear") {
        await onClearHistory();
      }
    } catch (err) {
      alert("İşlem gerçekleştirilemedi.");
    } finally {
      setIsDeleting(false);
      setShowConfirmModal(null);
      resetSwipe();
    }
  };

  return (
    <>
      <div
        className={`relative rounded-2xl group select-none ${
          translateX !== 0 ? "overflow-hidden" : ""
        } ${contextMenuPos ? "z-30" : "z-0"}`}
      >
        {/* ARKA PLAN MOBİL SİLME BUTONLARI (Sadece mobilde ve kart sürüklenirken DOM'da görünür) */}
        {translateX !== 0 && (
          <div className="md:hidden">
            {translateX < 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowConfirmModal("delete");
                }}
                className="absolute inset-y-0 right-0 w-20 bg-rose-600 hover:bg-rose-700 text-white flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer z-0"
              >
                <Trash2 className="w-5 h-5 animate-pulse" />
                <span className="text-[11px] font-bold">Sil</span>
              </button>
            )}

            {translateX > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowConfirmModal("delete");
                }}
                className="absolute inset-y-0 left-0 w-20 bg-rose-600 hover:bg-rose-700 text-white flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer z-0"
              >
                <Trash2 className="w-5 h-5 animate-pulse" />
                <span className="text-[11px] font-bold">Sil</span>
              </button>
            )}
          </div>
        )}

        {/* ASIL SOHBET KARTI (Opak, temiz Grupo temalı) */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleCardClick}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const menuWidth = 180;
            const menuHeight = 110;
            const x = Math.max(10, Math.min(e.clientX, window.innerWidth - menuWidth - 10));
            const y = Math.max(10, Math.min(e.clientY, window.innerHeight - menuHeight - 10));
            setContextMenuPos({ x, y });
          }}
          style={{
            transform: translateX !== 0 ? `translateX(${translateX}px)` : undefined,
            transition: isSwiping.current
              ? "none"
              : "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          className={`relative ${contextMenuPos ? "z-30" : "z-10"} w-full p-3 rounded-2xl flex items-center gap-3 text-left transition-colors cursor-pointer border ${
            isActive
              ? "bg-[#1E232B] border-slate-700/80 shadow-md"
              : "bg-[#16191E] hover:bg-[#1D2128] border-transparent hover:border-slate-800/80"
          }`}
        >
          {/* Avatar & Canlı Durum & WhatsApp Hikaye Halkası */}
          <div
            onClick={
              hasStory
                ? (e) => {
                    e.stopPropagation();
                    openViewer(userStoryGroup, 0);
                  }
                : undefined
            }
            title={hasStory ? `${conversation.other_user.display_name} hikayesini izle` : undefined}
            className={`relative flex-shrink-0 ${hasStory ? "cursor-pointer group/story-item" : ""}`}
          >
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                hasStory
                  ? `p-[2px] group-hover/story-item:scale-105 ${
                      hasUnviewed
                        ? isCloseFriends
                          ? "bg-gradient-to-tr from-emerald-500 via-green-400 to-teal-400 ring-2 ring-emerald-500/30 animate-in fade-in"
                          : "bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-400 ring-2 ring-pink-500/20 animate-in fade-in"
                        : isCloseFriends
                        ? "border-2 border-emerald-500/70"
                        : "border-2 border-slate-700"
                    }`
                  : "border border-slate-700/80 bg-slate-800"
              }`}
            >
              <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center font-bold text-sm text-pink-400 overflow-hidden border border-[#16191E]">
                {conversation.other_user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveMediaUrl(conversation.other_user.avatar_url)}
                    alt={conversation.other_user.display_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  conversation.other_user.display_name.charAt(0).toUpperCase()
                )}
              </div>
            </div>

            {conversation.is_online && (
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#16191E] shadow-sm z-10" />
            )}

            {hasStory && isCloseFriends && hasUnviewed && (
              <span
                title="Yakın Arkadaşlar Hikayesi"
                className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[8px] font-black border border-slate-950 shadow-sm z-10"
              >
                ★
              </span>
            )}
          </div>

          {/* Sohbet Bilgileri */}
          <div className="flex-1 min-w-0">
            {/* Üst Satır: İsim + (Hover'da Sil Butonu / Son Görülme) */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 truncate">
                <span className="text-sm font-semibold text-white truncate">
                  {conversation.other_user.display_name}
                </span>
                {(conversation.other_user.username === "security" ||
                  conversation.other_user.id === "00000000-0000-0000-0000-000000000001") && (
                  <span
                    title="Resmi Aura Güvenlik Sistemi"
                    className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0"
                  >
                    🛡️ BOT
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                {/* Masaüstünde kartın üzerine gelince beliren zarif Sil butonu */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowConfirmModal("delete");
                  }}
                  title="Sohbeti Sil"
                  className="hidden md:flex p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {/* Masaüstü Ek Menü Butonu (3 Nokta) */}
                <div className="relative hidden md:block">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const menuWidth = 180;
                      const menuHeight = 110;
                      const x = Math.max(10, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 10));
                      const y = Math.max(10, Math.min(rect.bottom + 6, window.innerHeight - menuHeight - 10));
                      setContextMenuPos({ x, y });
                    }}
                    title="Seçenekler"
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Durum / Saat */}
                <span className="text-[10px] text-slate-400">
                  {conversation.is_online ? (
                    <span className="text-emerald-400 font-medium">Çevrimiçi</span>
                  ) : (
                    formatLastSeen(
                      conversation.other_user.last_seen_at,
                      conversation.other_user.privacy_settings?.last_seen
                    ) || "Çevrimdışı"
                  )}
                </span>
              </div>
            </div>

            {/* Alt Satır: Son Mesaj İçeriği + Okunmamış Rozet */}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="truncate max-w-[210px] sm:max-w-[230px]">
                {isTyping ? (
                  <span className="text-pink-400 font-medium animate-pulse">yazıyor...</span>
                ) : conversation.last_message ? (
                  conversation.last_message.is_deleted_for_all ? (
                    <span className="italic opacity-80">🚫 Bu mesaj silindi</span>
                  ) : conversation.last_message.message_type === "voice" ? (
                    "🎤 Sesli Mesaj"
                  ) : conversation.last_message.message_type === "image" ? (
                    conversation.last_message.content ? `📷 ${conversation.last_message.content}` : "📷 Fotoğraf"
                  ) : conversation.last_message.message_type === "video" ? (
                    conversation.last_message.content ? `🎥 ${conversation.last_message.content}` : "🎥 Video"
                  ) : conversation.last_message.message_type === "file" ? (
                    conversation.last_message.content ? `📄 ${conversation.last_message.content}` : "📄 Belge"
                  ) : conversation.last_message.message_type === "location" ? (
                    "📍 Konum"
                  ) : (
                    conversation.last_message.content
                  )
                ) : (
                  <span className="italic text-slate-600">Sohbeti başlatın</span>
                )}
              </span>

              {conversation.unread_count > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-grupo-accent text-white text-[10px] font-bold shadow-sm shadow-pink-500/50 flex-shrink-0">
                  {conversation.unread_count}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SABİT KOORDİNATLI CONTEXT MENU (Ekran sınırlarına duyarlı, asla kesilmez) */}
      {contextMenuPos && (
        <>
          {/* Sayfa tıklandığında menüyü kapatan görünmez katman */}
          <div
            className="fixed inset-0 z-50 bg-black/10 cursor-default"
            onClick={(e) => {
              e.stopPropagation();
              setContextMenuPos(null);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenuPos(null);
            }}
          />

          {/* Sabit Açılır Menü */}
          <div
            style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-50 w-44 bg-[#141722]/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-1.5 text-xs animate-in fade-in zoom-in-95 duration-100 select-none space-y-0.5"
          >
            <button
              onClick={() => {
                setContextMenuPos(null);
                setShowConfirmModal("clear");
              }}
              className="w-full px-3 py-2 text-left text-slate-200 hover:text-white hover:bg-slate-800/80 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
            >
              <Eraser className="w-4 h-4 text-amber-400" />
              <span className="font-medium">Geçmişi Temizle</span>
            </button>

            <div className="h-px bg-slate-800 my-1" />

            <button
              onClick={() => {
                setContextMenuPos(null);
                setShowConfirmModal("delete");
              }}
              className="w-full px-3 py-2 text-left text-rose-400 hover:text-rose-300 hover:bg-rose-500/15 rounded-xl flex items-center gap-2.5 transition-colors font-medium cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-rose-500" />
              <span className="font-medium">Sohbeti Sil</span>
            </button>
          </div>
        </>
      )}

      {/* SİLME / TEMİZLEME ONAY MODALI */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-500 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {showConfirmModal === "delete" ? "Sohbeti Sil" : "Geçmişi Temizle"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  @{conversation.other_user.username} ile olan sohbet
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {showConfirmModal === "delete"
                ? "Bu sohbeti listenizden silmek istediğinize emin misiniz? Sohbet ve mesajlar sizin için kaldırılacaktır."
                : "Bu sohbetteki tüm mesajları temizlemek istediğinize emin misiniz? Mesajlar sizin için görünmez olacaktır."}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={confirmAction}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-md shadow-rose-600/30"
              >
                {isDeleting ? (
                  <span>Siliniyor...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{showConfirmModal === "delete" ? "Sohbeti Sil" : "Temizle"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
