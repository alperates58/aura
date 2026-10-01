"use client";

import { useChatStore } from "@/store/useChatStore";
import { useAuthStore } from "@/store/useAuthStore";

const EMOJIS = [
  "👍",
  "❤️",
  "😘",
  "🥰",
  "😍",
  "🔥",
  "🎉",
  "🥳",
  "🚀",
  "👏",
  "⭐",
  "💯",
  "💎",
  "😂",
  "😮",
  "😢",
  "🙏",
];

interface ReactionPickerProps {
  messageId: string;
  onSelect?: () => void;
  className?: string;
}

export function ReactionPicker({ messageId, onSelect, className = "" }: ReactionPickerProps) {
  const toggleReaction = useChatStore((state) => state.toggleReaction);

  const handleEmojiClick = (emoji: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleReaction(messageId, emoji);
    if (onSelect) onSelect();
  };

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={`flex items-center gap-1.5 p-1.5 bg-slate-900/95 border border-slate-700/80 rounded-full shadow-2xl backdrop-blur-md z-40 select-none max-w-[92vw] overflow-x-auto scrollbar-none animate-in fade-in zoom-in-95 duration-100 ${className}`}
    >
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={(e) => handleEmojiClick(emoji, e)}
          className="w-8 h-8 rounded-full hover:bg-slate-800 flex items-center justify-center text-base hover:scale-125 active:scale-95 transition-transform cursor-pointer"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

interface ReactionBadgesProps {
  reactions?: Record<string, string[]>;
  messageId: string;
  isMine: boolean;
}

export function ReactionBadges({ reactions, messageId, isMine }: ReactionBadgesProps) {
  const toggleReaction = useChatStore((state) => state.toggleReaction);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const uidStr = currentUserId ? String(currentUserId) : "";

  let parsedReactions = reactions;
  if (typeof parsedReactions === "string") {
    try {
      parsedReactions = JSON.parse(parsedReactions);
    } catch {
      return null;
    }
  }

  if (!parsedReactions || typeof parsedReactions !== "object" || Object.keys(parsedReactions).length === 0) {
    return null;
  }

  const entries = Object.entries(parsedReactions).filter(([_, users]) => users && Array.isArray(users) && users.length > 0);
  if (entries.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-1 mt-1 z-10 ${
        isMine ? "justify-end" : "justify-start"
      }`}
    >
      {entries.map(([emoji, users]) => {
        const hasMyReaction = uidStr ? users.includes(uidStr) : false;
        return (
          <button
            key={emoji}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleReaction(messageId, emoji);
            }}
            title={`${users.length} kişi`}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] transition-all cursor-pointer shadow-xs ${
              hasMyReaction
                ? "bg-pink-500/20 border border-pink-500/60 text-pink-200 shadow-pink-500/10"
                : "bg-slate-900/80 border border-slate-700/80 text-slate-200 hover:border-pink-500/50 hover:bg-slate-800"
            }`}
          >
            <span>{emoji}</span>
            {users.length > 1 && <span className="font-semibold text-[10px]">{users.length}</span>}
          </button>
        );
      })}
    </div>
  );
}
