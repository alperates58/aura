"use client";

import { useChatStore } from "@/store/useChatStore";
import { CornerUpLeft, X, Mic, Image, Video, FileText, MapPin } from "lucide-react";
import { focusChatInput } from "@/lib/utils";

export default function ReplyBar() {
  const { replyingTo, setReplyingTo, conversations, activeConversationId } = useChatStore();

  if (!replyingTo) return null;

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const otherUserName = activeConv?.other_user.display_name || "Karşı Taraf";

  const renderContentPreview = () => {
    if (replyingTo.is_deleted_for_all) {
      return <span className="italic opacity-80">🚫 Bu mesaj silindi</span>;
    }
    if (replyingTo.message_type === "voice") {
      return (
        <span className="flex items-center gap-1.5" style={{ color: "var(--accent, #E91E63)" }}>
          <Mic className="w-3.5 h-3.5" />
          <span>Sesli Mesaj</span>
        </span>
      );
    }
    if (replyingTo.message_type === "image") {
      return (
        <span className="flex items-center gap-1.5" style={{ color: "var(--accent, #E91E63)" }}>
          <Image className="w-3.5 h-3.5" />
          <span>Fotoğraf</span>
        </span>
      );
    }
    if (replyingTo.message_type === "video") {
      return (
        <span className="flex items-center gap-1.5" style={{ color: "var(--accent, #E91E63)" }}>
          <Video className="w-3.5 h-3.5" />
          <span>Video</span>
        </span>
      );
    }
    if (replyingTo.message_type === "file") {
      return (
        <span className="flex items-center gap-1.5" style={{ color: "var(--accent, #E91E63)" }}>
          <FileText className="w-3.5 h-3.5" />
          <span>Belge / Dosya</span>
        </span>
      );
    }
    if (replyingTo.message_type === "location") {
      return (
        <span className="flex items-center gap-1.5" style={{ color: "var(--accent, #E91E63)" }}>
          <MapPin className="w-3.5 h-3.5" />
          <span>Konum</span>
        </span>
      );
    }
    return <span className="truncate">{replyingTo.content}</span>;
  };

  return (
    <div
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        focusChatInput();
      }}
      className="mb-2 rounded-2xl bg-slate-900/95 border border-slate-700/80 overflow-hidden flex items-center justify-between shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-150 cursor-pointer"
    >
      <div className="w-1.5 self-stretch flex-shrink-0" style={{ backgroundColor: "var(--accent, #E91E63)" }} />
      <div className="flex items-center gap-2.5 min-w-0 flex-1 p-2.5 pl-3">
        <CornerUpLeft className="w-4 h-4 flex-shrink-0" style={{ color: "var(--accent, #E91E63)" }} />
        <div className="min-w-0 flex-1 text-xs">
          <div className="font-bold truncate" style={{ color: "var(--accent, #E91E63)" }}>
            {replyingTo.is_mine ? "Kendine Yanıt Veriyorsun" : `${otherUserName}'a Yanıt Veriyorsun`}
          </div>
          <div className="text-slate-300 truncate mt-0.5">{renderContentPreview()}</div>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setReplyingTo(null);
        }}
        title="Yanıtlamayı İptal Et"
        className="w-7 h-7 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer mr-2 flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
