"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Message, useChatStore } from "@/store/useChatStore";
import {
  Check,
  CheckCheck,
  Info,
  CornerUpLeft,
  Smile,
  Trash2,
  Pencil,
  FileText,
  Download,
  Star,
  StarOff,
  MoreVertical,
  X,
  MapPin,
  ExternalLink,
  Phone,
  PhoneMissed,
  PhoneOff,
  Video,
  VideoOff,
  CheckSquare,
  Eye,
} from "lucide-react";
import { format } from "date-fns";
import AudioWaveform from "./AudioWaveform";
import { ReactionPicker, ReactionBadges } from "./ReactionPicker";
import SocialMediaEmbed, { extractSocialMedia, extractGeneralUrl } from "./SocialMediaEmbed";
import LinkPreviewCard from "./LinkPreviewCard";
import { resolveMediaUrl } from "@/lib/api";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useAuthStore } from "@/store/useAuthStore";
import CodeSnippetBox from "./CodeSnippetBox";
import LocationMessageCard from "./LocationMessageCard";
import { triggerReactionConfetti, isSpecialConfettiEmoji, getPrimaryConfettiEmoji } from "@/lib/confetti";
import { focusChatInput } from "@/lib/utils";

interface Props {
  message: Message;
  searchQuery?: string;
  isHighlightedMatch?: boolean;
  onJumpToMessage?: (messageId: string) => void;
  otherUserName?: string;
  onOpenMedia?: (messageId: string) => void;
  onOpenPdf?: (url: string, name?: string) => void;
}

export default function MessageBubble({
  message,
  searchQuery,
  isHighlightedMatch,
  onJumpToMessage,
  otherUserName,
  onOpenMedia,
  onOpenPdf,
}: Props) {
  const {
    setSelectedMessageInfo,
    setReplyingTo,
    deleteMessage,
    editMessage,
    toggleStar,
    messages,
    activeConversationId,
    isSelectionMode,
    selectedMessageIds,
    toggleSelectMessage,
    startSelectionMode,
    editingMessageId,
    setEditingMessageId,
  } = useChatStore();
  const { user } = useAuthStore();
  const chatSettings = useSettingsStore((state) => state.settings?.chat_settings);
  const isSelected = selectedMessageIds.includes(message.id);

  const activeMessages = activeConversationId ? messages[activeConversationId] || [] : [];
  const targetRepliedMessage =
    message.reply_to ||
    (message.reply_to_id
      ? activeMessages.find((m) => m.id === message.reply_to_id)
      : null);

  // WhatsApp Mobil Sağa Kaydırarak Yanıtla (Swipe-to-Reply)
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHorizontalSwipe = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = false;
    setIsSwiping(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    if (!isHorizontalSwipe.current) {
      if (Math.abs(deltaY) > 8) return;
      if (Math.abs(deltaX) > 8) {
        isHorizontalSwipe.current = true;
        setIsSwiping(true);
      }
    }

    if (isHorizontalSwipe.current) {
      const offset = Math.min(Math.max(deltaX, 0), 75);
      setSwipeOffset(offset);
      if (offset >= 50 && typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(10);
      }
    }
  };

  const handleTouchEnd = () => {
    if (swipeOffset >= 45) {
      setReplyingTo(message);
      focusChatInput();
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(15);
      }
    }
    setSwipeOffset(0);
    setIsSwiping(false);
    isHorizontalSwipe.current = false;
  };

  const [showReactions, setShowReactions] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const isEditing = editingMessageId === message.id;
  const setIsEditing = (val: boolean) => {
    if (val) {
      setEditingMessageId(message.id);
      setEditText(message.content);
    } else {
      if (editingMessageId === message.id) {
        setEditingMessageId(null);
      }
    }
  };
  const [editText, setEditText] = useState(message.content);

  useEffect(() => {
    if (editingMessageId === message.id) {
      setEditText(message.content);
    }
  }, [editingMessageId, message.id, message.content]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const reactionPickerRef = useRef<HTMLDivElement>(null);
  const resolvedMediaUrl = resolveMediaUrl(message.media_url);

  // Menü ve mobil eylem butonları dışına tıklanınca, kaydırılınca veya pencere boyutu değişince kapat
  useEffect(() => {
    if (!showMenu && !isMobileActionsOpen && !showReactions) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setShowMenu(false);
      }
      if (
        bubbleRef.current &&
        !bubbleRef.current.contains(target) &&
        actionsRef.current &&
        !actionsRef.current.contains(target) &&
        (!reactionPickerRef.current || !reactionPickerRef.current.contains(target))
      ) {
        setIsMobileActionsOpen(false);
        setShowReactions(false);
      }
    };

    const handleScrollOrResize = () => {
      setShowMenu(false);
      setIsMobileActionsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [showMenu, isMobileActionsOpen, showReactions]);

  const handleToggleMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (showMenu) {
      setShowMenu(false);
      return;
    }

    setShowReactions(false);
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 184;
    const menuHeight = message.is_mine ? 245 : 175;

    const spaceOnRight = window.innerWidth - rect.right;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Yatay konum: Gelen mesajlarda sağda yeterli alan varsa sağa, yoksa sola doğru aç
    let left: number;
    if (!message.is_mine && spaceOnRight >= menuWidth + 10) {
      left = rect.left;
    } else {
      left = rect.right - menuWidth;
    }
    // Ekrana taşmayı önle
    left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, left));

    // Dikey konum: Aşağıda sığmıyorsa ve yukarıda daha çok yer varsa yukarı aç
    let top: number;
    if (spaceBelow < menuHeight + 15 && spaceAbove > spaceBelow) {
      top = rect.top - menuHeight - 6;
    } else {
      top = rect.bottom + 6;
    }
    top = Math.max(8, Math.min(window.innerHeight - menuHeight - 8, top));

    setMenuPosition({ top, left });
    setShowMenu(true);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (message.is_deleted_for_all) return;
    if (isSelectionMode) {
      e.preventDefault();
      e.stopPropagation();
      toggleSelectMessage(message.id);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setShowReactions(false);

    const menuWidth = 184;
    const menuHeight = message.is_mine ? 245 : 175;

    let left = e.clientX;
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }
    left = Math.max(8, left);

    let top = e.clientY;
    if (top + menuHeight > window.innerHeight - 8) {
      top = e.clientY - menuHeight;
    }
    top = Math.max(8, top);

    setMenuPosition({ top, left });
    setShowMenu(true);
  };

  const socialMediaData =
    !message.is_deleted_for_all && message.content ? extractSocialMedia(message.content) : null;
  const generalUrl =
    !message.is_deleted_for_all && message.content && !socialMediaData
      ? extractGeneralUrl(message.content)
      : null;

  const isCallLog =
    message.message_type === "call_log" ||
    Boolean(
      message.content &&
      (message.content.startsWith("📞") || message.content.startsWith("📹")) &&
      (message.content.includes("Sesli Arama") || message.content.includes("Görüntülü Arama"))
    );

  const isVideoCall =
    isCallLog &&
    Boolean(
      message.content?.includes("Görüntülü") ||
      message.media_metadata?.call_type === "video"
    );

  const isMissedOrRejected =
    isCallLog &&
    Boolean(
      message.content?.includes("Cevapsız") ||
      message.content?.includes("Reddedilen")
    );

  const renderInlinePart = (part: string, keyPrefix: string) => {
    if (searchQuery && searchQuery.trim().length > 0) {
      const q = searchQuery.trim();
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(`(${escaped})`, "gi");
      const subParts = part.split(searchRegex);
      if (subParts.length > 1) {
        return subParts.map((sub, sIdx) => {
          if (sub.toLowerCase() === q.toLowerCase()) {
            return (
              <mark
                key={`${keyPrefix}_mark_${sIdx}`}
                className="bg-amber-300 text-slate-950 font-bold px-0.5 rounded shadow-xs"
              >
                {sub}
              </mark>
            );
          }
          return sub;
        });
      }
    }
    return part;
  };

  const renderInlineFormatting = (text: string, keyPrefix: string) => {
    // 1. Satır içi kod (`code`) ayrıştır
    const inlineCodeRegex = /`([^`\n]+)`/g;
    const partsWithCode = text.split(inlineCodeRegex);

    return partsWithCode.map((segment, cIdx) => {
      if (cIdx % 2 === 1) {
        return (
          <code
            key={`${keyPrefix}_code_${cIdx}`}
            className="px-1.5 py-0.5 mx-0.5 rounded bg-black/40 border border-white/10 font-mono text-[11px] text-pink-300 font-semibold"
          >
            {segment}
          </code>
        );
      }

      // 2. URL ayrıştırma
      const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
      const urlParts = segment.split(urlRegex);
      return urlParts.map((part, uIdx) => {
        if (part.match(urlRegex)) {
          return (
            <a
              key={`${keyPrefix}_${cIdx}_url_${uIdx}`}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className={`underline hover:opacity-80 transition-opacity break-all ${
                message.is_mine
                  ? "text-inherit opacity-95 font-medium underline"
                  : "text-grupo-accent font-medium"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }

        return renderInlinePart(part, `${keyPrefix}_${cIdx}_${uIdx}`);
      });
    });
  };

  const renderFormattedContent = (text: string) => {
    // Çok satırlı kod bloğu kontrolü (```lang\ncode\n```)
    if (text.includes("```")) {
      const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
      const elements: React.ReactNode[] = [];
      let lastIdx = 0;
      let match: RegExpExecArray | null;

      while ((match = codeBlockRegex.exec(text)) !== null) {
        if (match.index > lastIdx) {
          elements.push(
            renderInlineFormatting(text.substring(lastIdx, match.index), `pre_${lastIdx}`)
          );
        }

        const lang = match[1] || "kod";
        const code = match[2] || "";
        elements.push(
          <CodeSnippetBox
            key={`snippet_${match.index}`}
            language={lang}
            code={code}
          />
        );

        lastIdx = match.index + match[0].length;
      }

      if (lastIdx < text.length) {
        elements.push(
          renderInlineFormatting(text.substring(lastIdx), `post_${lastIdx}`)
        );
      }

      return elements;
    }

    return renderInlineFormatting(text, "root");
  };

  const formattedTime = (() => {
    try {
      return format(new Date(message.sent_at || message.created_at), "HH:mm");
    } catch {
      return "";
    }
  })();

  const renderTicks = () => {
    if (!message.is_mine) return null;

    if (message.tick_status === "pending") {
      return (
        <span
          title="Gönderiliyor..."
          className="inline-flex items-center justify-center ml-1 flex-shrink-0"
        >
          <svg
            className="animate-spin w-3 h-3 text-current opacity-75"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3.5"
            />
            <path
              className="opacity-90"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        </span>
      );
    }

    if (message.tick_status === "read") {
      return <CheckCheck className="w-4 h-4 text-sky-400 inline ml-1 flex-shrink-0" />;
    } else if (message.tick_status === "delivered") {
      return <CheckCheck className="w-4 h-4 inline ml-1 flex-shrink-0" />;
    }
    return <Check className="w-4 h-4 inline ml-1 flex-shrink-0" />;
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editText.trim() || editText === message.content) {
      setIsEditing(false);
      return;
    }
    try {
      await editMessage(message.id, editText.trim());
      setIsEditing(false);
    } catch (err: any) {
      alert(err.response?.data?.error || "Mesaj düzenlenemedi.");
    }
  };

  const handleDelete = async (forAll: boolean) => {
    setShowMenu(false);
    const confirmMsg = forAll
      ? "Bu mesajı herkesten silmek istediğinize emin misiniz?"
      : "Bu mesajı sadece sizden silmek istediğinize emin misiniz?";
    if (!confirm(confirmMsg)) return;

    try {
      await deleteMessage(message.id, forAll);
    } catch (err: any) {
      alert(err.response?.data?.error || "Mesaj silinemedi.");
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className={`group relative flex flex-col mb-3 select-none ${
        message.is_mine ? "items-end" : "items-start"
      }`}
    >
      {/* Hızlı Reaksiyon Çubuğu (Açıldığında) */}
      {showReactions && (
        <div
          ref={reactionPickerRef}
          className={`absolute -top-10 z-40 ${message.is_mine ? "right-2" : "left-2"}`}
        >
          <ReactionPicker
            messageId={message.id}
            onSelect={() => {
              setShowReactions(false);
              setIsMobileActionsOpen(false);
            }}
          />
        </div>
      )}

      {/* Mesaj Balonu ve Yan Menüsü */}
      <div
        className={`relative flex items-end gap-1.5 ${
          isEditing
            ? "w-full max-w-[96%] sm:max-w-[85%] md:max-w-[75%] min-w-[280px]"
            : "max-w-[88%] sm:max-w-[78%] md:max-w-[72%] lg:max-w-[65%] min-w-0 w-fit"
        } ${
          message.is_mine ? "flex-row-reverse" : "flex-row"
        }`}
      >
        {/* Çoklu Seçim Checkbox'ı */}
        {isSelectionMode && !message.is_deleted_for_all && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleSelectMessage(message.id);
            }}
            className={`flex-shrink-0 self-center w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer ${
              isSelected
                ? "bg-indigo-600 border-indigo-600 text-white shadow-md scale-105"
                : "border-slate-500 hover:border-indigo-400 bg-slate-900/60"
            }`}
            title={isSelected ? "Seçimi Kaldır" : "Seç"}
          >
            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
          </button>
        )}

        {/* WhatsApp Tarzı Sağa Kaydırma Yanıt İkonu */}
        {swipeOffset > 0 && (
          <div
            className="absolute left-[-38px] top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-850 border border-grupo-accent/60 flex items-center justify-center text-grupo-accent shadow-xl pointer-events-none transition-transform z-10"
            style={{
              opacity: Math.min(swipeOffset / 40, 1),
              transform: `translateY(-50%) scale(${Math.min(swipeOffset / 45, 1)})`,
            }}
          >
            <CornerUpLeft className="w-4 h-4" />
          </div>
        )}

        {/* Balon İçeriği */}
        <div
          ref={bubbleRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={(e) => {
            if (isSelectionMode && !message.is_deleted_for_all) {
              toggleSelectMessage(message.id);
              return;
            }
            // Mobilde mesaja tıklandığında hızlı eylem butonlarını aç/kapat
            setIsMobileActionsOpen((prev) => !prev);
          }}
          onDoubleClick={() => {
            setReplyingTo(message);
            focusChatInput();
          }}
          onContextMenu={handleContextMenu}
          style={{
            transform: swipeOffset > 0 ? `translateX(${swipeOffset}px)` : undefined,
            transition: isSwiping ? "none" : "transform 0.22s cubic-bezier(0.18, 0.89, 0.32, 1.28)",
            backgroundColor: message.is_mine
              ? "var(--outgoing-bubble, #4F46E5)"
              : "var(--incoming-bubble, #181C28)",
            borderColor: message.is_mine ? "transparent" : "var(--border, #1E2333)",
            color: message.is_mine
              ? "var(--outgoing-text, #ffffff)"
              : "var(--incoming-text, #f8fafc)",
          }}
          className={`relative px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl shadow-md text-sm transition-shadow duration-300 select-none ${
            isEditing ? "w-full min-w-[280px]" : "max-w-full min-w-0 w-fit"
          } overflow-hidden break-words ${
            isSelected
              ? "ring-2 ring-indigo-500 shadow-indigo-500/20 shadow-lg scale-[1.01]"
              : ""
          } ${
            isSelectionMode && !message.is_deleted_for_all ? "cursor-pointer" : ""
          } ${
            isHighlightedMatch
              ? "ring-4 ring-amber-400 ring-offset-2 ring-offset-slate-950 shadow-2xl shadow-amber-400/40 scale-[1.02]"
              : ""
          } ${
            message.is_mine
              ? "rounded-br-xs"
              : "border rounded-bl-xs"
          } ${message.is_deleted_for_all ? "opacity-60 italic" : ""}`}
        >
          {/* WhatsApp Tarzı Alıntılanan Mesaj (Reply Preview) */}
          {(targetRepliedMessage || message.reply_to_id) && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                const targetId = targetRepliedMessage?.id || message.reply_to_id;
                if (targetId && onJumpToMessage) {
                  onJumpToMessage(targetId);
                }
              }}
              style={{
                maxWidth: "min(100%, 340px)",
              }}
              className={`mb-2 rounded-xl overflow-hidden flex w-full max-w-full min-w-0 cursor-pointer transition-all hover:opacity-95 active:scale-[0.99] select-none ${
                message.is_mine
                  ? "bg-black/15 text-inherit border-l-2 border-current"
                  : "bg-slate-950/70 text-slate-200 border border-white/5"
              }`}
              title="Alıntılanan mesaja git"
            >
              {/* Dikey Düz Şerit (WhatsApp Style) */}
              <div
                className={`w-1 self-stretch flex-shrink-0 ${
                  message.is_mine ? "bg-current opacity-80" : "bg-grupo-accent"
                }`}
              />

              {/* Alıntı Metin Alanı */}
              <div className="py-1.5 px-2.5 flex-1 min-w-0 overflow-hidden">
                <div className="flex items-center justify-between gap-1 mb-0.5 min-w-0">
                  <span
                    className={`font-bold text-[11px] truncate min-w-0 flex-1 ${
                      message.is_mine ? "text-inherit opacity-90" : "text-grupo-accent"
                    }`}
                  >
                    {targetRepliedMessage
                      ? Boolean(
                          (targetRepliedMessage as any).is_mine ||
                          (user?.id && targetRepliedMessage.sender_id === user.id) ||
                          (message.is_mine && targetRepliedMessage.sender_id === message.sender_id)
                        )
                        ? "Sen"
                        : otherUserName || "Karşı Taraf"
                      : "Alıntılanan Mesaj"}
                  </span>
                  <CornerUpLeft className="w-3 h-3 opacity-60 flex-shrink-0" />
                </div>
                <div className="text-[11px] opacity-85 line-clamp-2 break-all overflow-hidden">
                  {targetRepliedMessage
                    ? (targetRepliedMessage as any)?.is_deleted_for_all
                      ? "🚫 Bu mesaj silindi"
                      : targetRepliedMessage.message_type === "voice"
                      ? "🎤 Sesli Mesaj"
                      : targetRepliedMessage.message_type === "image"
                      ? targetRepliedMessage.content ? `📷 ${targetRepliedMessage.content}` : "📷 Fotoğraf"
                      : targetRepliedMessage.message_type === "video"
                      ? targetRepliedMessage.content ? `🎬 ${targetRepliedMessage.content}` : "🎬 Video"
                      : targetRepliedMessage.message_type === "file"
                      ? targetRepliedMessage.content ? `📄 ${targetRepliedMessage.content}` : "📄 Belge"
                      : targetRepliedMessage.message_type === "location"
                      ? "📍 Konum"
                      : targetRepliedMessage.content || "Mesaj"
                    : "Orijinal mesaja git..."}
                </div>
              </div>
            </div>
          )}

          {/* 1. Sesli Mesaj (Voice Note) */}
          {message.message_type === "voice" && resolvedMediaUrl && !message.is_deleted_for_all && (
            <AudioWaveform
              audioUrl={resolvedMediaUrl}
              isMine={message.is_mine}
              initialDuration={typeof message.media_metadata?.duration === "number" ? message.media_metadata.duration : undefined}
              peaks={Array.isArray(message.media_metadata?.waveform) ? (message.media_metadata.waveform as number[]) : undefined}
            />
          )}

          {/* 2. Video (iOS & Android Evrensel Uyumluluk - Geçmişte image olarak kaydedilmiş videoları da otomatik video oynatıcı ile gösterir) */}
          {(message.message_type === "video" || /\.(mp4|mov|webm|m4v|mkv|avi|3gp)($|\?)/i.test(resolvedMediaUrl)) && resolvedMediaUrl && !message.is_deleted_for_all && (
            <div className="my-1 overflow-hidden rounded-2xl max-h-72 bg-black">
              <video
                controls
                controlsList="nodownload"
                playsInline
                preload="metadata"
                className="max-h-72 w-full rounded-2xl object-contain bg-black"
                onContextMenu={(e) => e.preventDefault()}
                src={(() => {
                  const isIOS =
                    typeof navigator !== "undefined" &&
                    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
                      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
                  if (isIOS && resolvedMediaUrl.includes(".webm") && !resolvedMediaUrl.includes("format=")) {
                    return resolvedMediaUrl.includes("?")
                      ? `${resolvedMediaUrl}&format=mp4`
                      : `${resolvedMediaUrl}?format=mp4`;
                  }
                  return resolvedMediaUrl;
                })()}
              >
                Tarayıcınız bu videoyu oynatmayı desteklemiyor.
              </video>
            </div>
          )}

          {/* 3. Fotoğraf (Image) */}
          {message.message_type === "image" && !/\.(mp4|mov|webm|m4v|mkv|avi|3gp)($|\?)/i.test(resolvedMediaUrl) && resolvedMediaUrl && !message.is_deleted_for_all && (
            <div className="my-1 cursor-pointer overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolvedMediaUrl}
                alt="Fotoğraf"
                loading="lazy"
                decoding="async"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                className="max-h-72 w-full object-cover rounded-xl hover:scale-[1.02] transition-transform duration-200 select-none"
                onClick={() => {
                  if (onOpenMedia) {
                    onOpenMedia(message.id);
                  } else {
                    setPreviewImage(resolvedMediaUrl || null);
                  }
                }}
              />
            </div>
          )}

          {/* 3b. Konum (WhatsApp Tarzı Canlı Konum) */}
          {message.message_type === "location" && !message.is_deleted_for_all && (
            <div className="my-1 rounded-2xl overflow-hidden border border-white/10 bg-slate-900/80 min-w-[220px]">
              <div className="relative h-28 w-full bg-slate-800 flex items-center justify-center overflow-hidden">
                <div
                  className="absolute inset-0 opacity-40 bg-cover bg-center"
                  style={{
                    backgroundImage: `url('https://static-maps.yandex.ru/1.x/?ll=${message.media_metadata?.longitude || 28.9784},${message.media_metadata?.latitude || 41.0082}&z=14&l=map&size=300,120&pt=${message.media_metadata?.longitude || 28.9784},${message.media_metadata?.latitude || 41.0082},pm2rdm')`,
                  }}
                />
                <div className="relative z-10 flex flex-col items-center gap-1 bg-black/60 px-3 py-1.5 rounded-xl backdrop-blur-xs">
                  <MapPin className="w-5 h-5 text-rose-500 animate-bounce" />
                  <span className="text-[11px] font-bold text-white">Canlı Konum</span>
                </div>
              </div>
              <div className="p-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">Paylaşılan Konum</div>
                  <div className="text-[10px] text-slate-400">
                    {message.media_metadata?.latitude?.toFixed(4)}°, {message.media_metadata?.longitude?.toFixed(4)}°
                  </div>
                </div>
                <a
                  href={`https://www.google.com/maps?q=${message.media_metadata?.latitude},${message.media_metadata?.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ backgroundColor: "var(--accent, #6366F1)" }}
                  className="px-2.5 py-1.5 rounded-lg hover:brightness-110 text-white text-[11px] font-semibold flex items-center gap-1 transition-all flex-shrink-0 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Aç</span>
                </a>
              </div>
            </div>
          )}

          {/* 4. Belge / Dosya */}
          {message.message_type === "file" && resolvedMediaUrl && !message.is_deleted_for_all && (
            <div
              className={`my-1 p-3 rounded-xl flex items-center gap-3 ${
                message.is_mine ? "bg-black/25" : "bg-slate-900/80"
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-grupo-accent/20 text-grupo-accent flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate text-white">
                  {message.media_metadata?.file_name || "Dosya"}
                </div>
                <div className="text-[10px] text-slate-300">
                  {formatFileSize(message.media_metadata?.file_size)}
                </div>
              </div>

              {/* Güvenli PDF Önizleme Butonu */}
              {(message.media_metadata?.mime_type === "application/pdf" ||
                message.media_metadata?.file_name?.toLowerCase().endsWith(".pdf") ||
                message.media_url?.toLowerCase().includes(".pdf")) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenPdf) {
                      onOpenPdf(resolvedMediaUrl, message.media_metadata?.file_name);
                    }
                  }}
                  className="p-2 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 hover:text-white transition-colors cursor-pointer"
                  title="PDF'i Önizle"
                >
                  <Eye className="w-4 h-4" />
                </button>
              )}

              <a
                href={resolvedMediaUrl}
                target="_blank"
                rel="noreferrer"
                download={message.media_metadata?.file_name || "file"}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="İndir"
              >
                <Download className="w-4 h-4" />
              </a>
            </div>
          )}

          {/* 4b. Sosyal Medya Gömülü Kart / Oynatıcı (YouTube, YT Music, Instagram, Facebook) */}
          {socialMediaData && (
            <SocialMediaEmbed data={socialMediaData} isMine={message.is_mine} />
          )}

          {/* 4c. Genel Web Bağlantısı Önizleme Kartı (OpenGraph) */}
          {generalUrl && (
            <LinkPreviewCard url={generalUrl} isMine={message.is_mine} />
          )}

          {/* 4d. Konum Paylaşımı Kartı */}
          {(message.message_type === "location" ||
            (message.media_metadata?.latitude !== undefined &&
              message.media_metadata?.longitude !== undefined)) && (
            <LocationMessageCard
              latitude={Number(message.media_metadata?.latitude) || 0}
              longitude={Number(message.media_metadata?.longitude) || 0}
              isLive={Boolean(message.media_metadata?.is_live)}
              durationMinutes={Number(message.media_metadata?.duration) || undefined}
              liveUntil={message.media_metadata?.live_until}
              isMine={message.is_mine}
            />
          )}

          {/* 5. Arama Kaydı Kartı veya Metin İçeriği ve Düzenleme Modu */}
          {isCallLog ? (
            <div className="flex items-center gap-3 py-1 my-0.5 min-w-[170px]">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-md ${
                  isVideoCall
                    ? isMissedOrRejected
                      ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                      : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                    : isMissedOrRejected
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                }`}
              >
                {isVideoCall ? (
                  isMissedOrRejected ? (
                    <VideoOff className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Video className="w-4 h-4 text-purple-300" />
                  )
                ) : (
                  isMissedOrRejected ? (
                    <PhoneMissed className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Phone className="w-4 h-4 text-emerald-400" />
                  )
                )}
              </div>

              <div className="min-w-0 pr-1 flex-1">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>{isVideoCall ? "Görüntülü Arama" : "Sesli Arama"}</span>
                  {isMissedOrRejected && (
                    <span className="text-[10px] text-rose-400 font-semibold">
                      ({message.content.includes("Reddedilen") ? "Reddedildi" : "Cevapsız"})
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-300 font-medium truncate">
                  {message.content.replace(/^[📞📹]\s*/, "")}
                </div>
              </div>
            </div>
          ) : isEditing ? (
            <form onSubmit={handleEditSubmit} className="mt-1 flex flex-col gap-2 w-full min-w-0">
              <div className="text-[11px] font-semibold opacity-85 flex items-center gap-1.5">
                <Pencil className="w-3.5 h-3.5 text-amber-300 flex-shrink-0" />
                <span>Mesajı Düzenle</span>
              </div>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleEditSubmit(e);
                  } else if (e.key === "Escape") {
                    setIsEditing(false);
                  }
                }}
                rows={Math.max(2, Math.min(editText.split("\n").length, 5))}
                className="w-full min-w-0 bg-black/40 text-white text-xs px-3 py-2 rounded-xl border border-white/20 focus:border-white/60 focus:outline-none resize-none leading-relaxed shadow-inner"
                autoFocus
              />
              <div className="flex items-center justify-end gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 rounded-lg bg-black/25 hover:bg-black/45 text-white/80 hover:text-white text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>İptal</span>
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md hover:shadow-lg flex items-center gap-1.5 cursor-pointer flex-shrink-0"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Kaydet</span>
                </button>
              </div>
            </form>
          ) : (
            message.content && (
              <div className="relative">
                {message.content.startsWith("📸 [Hikaye") ? (
                  (() => {
                    const lines = message.content.split("\n");
                    const headerLine = lines[0];
                    const bodyText = lines.slice(1).join("\n");
                    return (
                      <div className="w-full min-w-0">
                        <div className="mb-2 p-2 rounded-xl bg-black/20 border-l-2 border-pink-500 text-[11px] backdrop-blur-xs">
                          <span className="font-semibold text-pink-400">
                            {headerLine}
                          </span>
                        </div>
                        {bodyText && (
                          <div className="whitespace-pre-wrap break-words leading-relaxed">
                            {renderFormattedContent(bodyText)}
                            <span
                              style={{
                                color: message.is_mine
                                  ? "var(--outgoing-text-muted, rgba(255,255,255,0.75))"
                                  : "var(--incoming-text-muted, rgba(248,250,252,0.70))",
                              }}
                              className="inline-flex items-center gap-1 text-[11px] float-right ml-2.5 mt-1 select-none flex-shrink-0"
                            >
                              {message.is_starred && <Star className="w-3 h-3 text-amber-300 fill-amber-300" />}
                              {message.is_edited && !message.is_deleted_for_all && (
                                <span className="text-[9px] opacity-75 mr-0.5">(düzenlendi)</span>
                              )}
                              <span>{formattedTime}</span>
                              {renderTicks()}
                            </span>
                            <div className="clear-both" />
                          </div>
                        )}
                        {!bodyText && (
                          <div
                            style={{
                              color: message.is_mine
                                ? "var(--outgoing-text-muted, rgba(255,255,255,0.75))"
                                : "var(--incoming-text-muted, rgba(248,250,252,0.70))",
                            }}
                            className="flex items-center justify-end gap-1 mt-1 text-[11px] ml-auto select-none flex-shrink-0"
                          >
                            <span>{formattedTime}</span>
                            {renderTicks()}
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : isSpecialConfettiEmoji(message.content) ? (
                  <div className="flex flex-col items-center">
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerReactionConfetti(getPrimaryConfettiEmoji(message.content), e.clientX, e.clientY);
                      }}
                      className="text-4xl sm:text-5xl py-1 inline-block cursor-pointer hover:scale-115 active:scale-95 transition-transform duration-200 select-none"
                      title="Dokunarak efekti tekrar oynat"
                    >
                      {message.content}
                    </span>
                    <span
                      style={{
                        color: message.is_mine
                          ? "var(--outgoing-text-muted, rgba(255,255,255,0.75))"
                          : "var(--incoming-text-muted, rgba(248,250,252,0.70))",
                      }}
                      className="inline-flex items-center gap-1 text-[11px] self-end mt-0.5 select-none flex-shrink-0"
                    >
                      {message.is_starred && <Star className="w-3 h-3 text-amber-300 fill-amber-300" />}
                      {message.is_edited && !message.is_deleted_for_all && (
                        <span className="text-[9px] opacity-75 mr-0.5">(düzenlendi)</span>
                      )}
                      <span>{formattedTime}</span>
                      {renderTicks()}
                    </span>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap break-words leading-relaxed">
                    {renderFormattedContent(message.content)}
                    {/* WhatsApp Tarzı Metin Sonu / Sağ Alt Zaman Damgası */}
                    <span
                      style={{
                        color: message.is_mine
                          ? "var(--outgoing-text-muted, rgba(255,255,255,0.75))"
                          : "var(--incoming-text-muted, rgba(248,250,252,0.70))",
                      }}
                      className="inline-flex items-center gap-1 text-[11px] float-right ml-2.5 mt-1 select-none flex-shrink-0"
                    >
                      {message.is_starred && <Star className="w-3 h-3 text-amber-300 fill-amber-300" />}
                      {message.is_edited && !message.is_deleted_for_all && (
                        <span className="text-[9px] opacity-75 mr-0.5">(düzenlendi)</span>
                      )}
                      <span>{formattedTime}</span>
                      {renderTicks()}
                    </span>
                    <div className="clear-both" />
                  </div>
                )}
              </div>
            )
          )}

          {/* Medya, Ses, Dosya, Arama Kaydı gibi içerikler için alt sağ zaman damgası */}
          {(!message.content || isCallLog || isEditing) && (
            <div
              style={{
                color: message.is_mine
                  ? "var(--outgoing-text-muted, rgba(255,255,255,0.75))"
                  : "var(--incoming-text-muted, rgba(248,250,252,0.70))",
              }}
              className="flex items-center justify-end gap-1 mt-1 text-[11px] ml-auto select-none flex-shrink-0"
            >
              {message.is_starred && <Star className="w-3 h-3 text-amber-300 fill-amber-300" />}
              {message.is_edited && !message.is_deleted_for_all && (
                <span className="text-[9px] opacity-75 mr-0.5">(düzenlendi)</span>
              )}
              <span>{formattedTime}</span>
              {renderTicks()}
            </div>
          )}
        </div>

        {/* Hover / Tıklama Eylem Butonları */}
        {!message.is_deleted_for_all && !isSelectionMode && (
          <div
            ref={actionsRef}
            className={`flex items-center gap-0.5 transition-all duration-150 flex-shrink-0 ${
              showMenu || showReactions || isMobileActionsOpen
                ? "opacity-100 scale-100 pointer-events-auto"
                : "opacity-0 scale-90 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto"
            }`}
          >
            {/* Tepki Ver */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                setShowReactions(!showReactions);
              }}
              title="Tepki Ver"
              className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Smile className="w-3.5 h-3.5" />
            </button>

            {/* Yanıtla */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setReplyingTo(message);
                setIsMobileActionsOpen(false);
                focusChatInput();
              }}
              title="Yanıtla"
              className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <CornerUpLeft className="w-3.5 h-3.5" />
            </button>

            {/* Daha Fazla Seçenek Menüsü */}
            <button
              ref={buttonRef}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleMenu(e);
              }}
              title="Daha Fazla"
              className={`p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer ${
                showMenu ? "text-white bg-slate-800" : ""
              }`}
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 3 Nokta / Sağ Tık Seçenekler Menüsü (Portal ile Body'ye render edilir, overflow kesintisini %100 önler) */}
      {showMenu && menuPosition && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
              zIndex: 50,
            }}
            className="w-44 bg-slate-900/98 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-1 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-100 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Tepki Ver */}
            <button
              onClick={() => {
                setShowMenu(false);
                setShowReactions(true);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-200"
            >
              <Smile className="w-3.5 h-3.5 text-amber-400" />
              <span>Tepki Ver</span>
            </button>

            {/* Yanıtla (WhatsApp Style) */}
            <button
              onClick={() => {
                setShowMenu(false);
                setReplyingTo(message);
                focusChatInput();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-200"
            >
              <CornerUpLeft className="w-3.5 h-3.5 text-grupo-accent" />
              <span>Yanıtla</span>
            </button>

            {/* Mesaj Bilgisi (İletilme ve Okunma Zamanları) */}
            <button
              onClick={() => {
                setShowMenu(false);
                setSelectedMessageInfo(message);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-left transition-colors cursor-pointer"
            >
              <Info className="w-3.5 h-3.5 text-sky-400" />
              <span>Mesaj Bilgisi</span>
            </button>

            {/* Yıldızla / Yıldızı Kaldır */}
            <button
              onClick={() => {
                setShowMenu(false);
                toggleStar(message.id);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-left transition-colors cursor-pointer"
            >
              {message.is_starred ? (
                <>
                  <StarOff className="w-3.5 h-3.5 text-amber-400" />
                  <span>Yıldızı Kaldır</span>
                </>
              ) : (
                <>
                  <Star className="w-3.5 h-3.5 text-amber-400" />
                  <span>Yıldızla</span>
                </>
              )}
            </button>

            {/* Mesajı Seç (Toplu Seçim) */}
            <button
              onClick={() => {
                setShowMenu(false);
                startSelectionMode(message.id);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-left transition-colors cursor-pointer text-slate-200"
            >
              <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
              <span>Seç</span>
            </button>

            {/* Düzenle (Sadece benim ve metin mesajlarında) */}
            {message.is_mine && message.message_type === "text" && chatSettings?.allow_message_edit !== false && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  setIsEditing(true);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-left transition-colors cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5 text-emerald-400" />
                <span>Düzenle</span>
              </button>
            )}

            <div className="h-px bg-slate-800 my-1" />

            {/* Benden Sil */}
            <button
              onClick={() => handleDelete(false)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 text-left transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Benden Sil</span>
            </button>

            {/* Herkesten Sil (Sadece benim mesajlarımda) */}
            {message.is_mine && chatSettings?.allow_delete_for_all !== false && (
              <button
                onClick={() => handleDelete(true)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 text-left transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Herkesten Sil</span>
              </button>
            )}
          </div>,
          document.body
        )}

      {/* Mesaj Altı Reaksiyon Rozetleri */}
      <ReactionBadges
        reactions={message.reactions}
        messageId={message.id}
        isMine={message.is_mine}
      />

      {/* Görsel Büyütme Modalı */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt="Büyük Görsel"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl select-none"
            />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-white flex items-center justify-center cursor-pointer shadow-lg hover:bg-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
