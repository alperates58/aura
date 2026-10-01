"use client";

import { useState, useEffect } from "react";
import { useChatStore } from "@/store/useChatStore";
import { api } from "@/lib/api";
import { X, Check, CheckCheck, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

export default function MessageInfoModal() {
  const selectedMessage = useChatStore((state) => state.selectedMessageInfo);
  const setSelectedMessageInfo = useChatStore((state) => state.setSelectedMessageInfo);
  const [liveInfo, setLiveInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedMessage?.id || selectedMessage.id.startsWith("temp_")) {
      setLiveInfo(null);
      return;
    }
    setLoading(true);
    api
      .get(`/messages/${selectedMessage.id}/info`)
      .then((res) => {
        if (res.data) {
          setLiveInfo(res.data);
        }
      })
      .catch((err) => {
        console.error("Güncel mesaj bilgisi alınamadı:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedMessage?.id]);

  if (!selectedMessage) return null;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      return format(new Date(dateStr), "d MMMM yyyy, HH:mm:ss", { locale: tr });
    } catch {
      return dateStr;
    }
  };

  const display = liveInfo ? { ...selectedMessage, ...liveInfo } : selectedMessage;
  const sentTime = formatDate(display.sent_at || display.created_at);
  const deliveredTime = formatDate(display.delivered_at);
  const readTime = formatDate(display.read_at);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in select-none">
      <div className="w-full max-w-md bg-grupo-dark-card border border-grupo-dark-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Başlık */}
        <div className="p-4 border-b border-grupo-dark-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-grupo-accent" />
            <h3 className="font-bold text-white text-base">Mesaj Bilgisi</h3>
          </div>
          <button
            onClick={() => setSelectedMessageInfo(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mesaj Önizlemesi */}
        <div className="p-4 bg-slate-950/40 border-b border-grupo-dark-border">
          <div
            className="p-3 rounded-2xl border text-sm shadow-sm"
            style={{
              backgroundColor: selectedMessage.is_mine
                ? "var(--outgoing-bubble, #4F46E5)"
                : "var(--incoming-bubble, #181C28)",
              borderColor: selectedMessage.is_mine ? "transparent" : "var(--border, #1E2333)",
              color: selectedMessage.is_mine
                ? "var(--outgoing-text, #FFFFFF)"
                : "var(--incoming-text, #F8FAFC)",
            }}
          >
            <p className="break-words line-clamp-3 leading-relaxed">{selectedMessage.content}</p>
          </div>
        </div>

        {/* WhatsApp Durum Zaman Çizelgesi */}
        <div className="p-5 space-y-4">
          {/* 1. Okundu (Çift Mavi Tik) */}
          <div className="flex items-start gap-4 p-3 rounded-xl bg-slate-900/40 border border-slate-800/80">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 flex-shrink-0">
              <CheckCheck className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase font-bold text-sky-400 tracking-wider">Okundu</div>
              <div className="text-sm font-medium text-slate-200 mt-0.5">
                {readTime || <span className="text-slate-500 italic">Henüz okunmadı</span>}
              </div>
            </div>
          </div>

          {/* 2. İletildi (Çift Gri Tik) */}
          <div className="flex items-start gap-4 p-3 rounded-xl bg-slate-900/40 border border-slate-800/80">
            <div className="p-2 rounded-lg bg-slate-500/10 text-slate-400 border border-slate-500/20 flex-shrink-0">
              <CheckCheck className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase font-bold text-slate-400 tracking-wider">İletildi</div>
              <div className="text-sm font-medium text-slate-200 mt-0.5">
                {deliveredTime || <span className="text-slate-500 italic">Henüz iletilmedi</span>}
              </div>
            </div>
          </div>

          {/* 3. Gönderildi (Tek Gri Tik) */}
          <div className="flex items-start gap-4 p-3 rounded-xl bg-slate-900/40 border border-slate-800/80">
            <div className="p-2 rounded-lg bg-slate-500/10 text-slate-400 border border-slate-500/20 flex-shrink-0">
              <Check className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase font-bold text-slate-400 tracking-wider">Gönderildi</div>
              <div className="text-sm font-medium text-slate-200 mt-0.5">
                {sentTime || <span className="text-slate-500 italic">-</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Kapat Butonu */}
        <div className="p-4 border-t border-grupo-dark-border bg-slate-900/20 flex justify-end">
          <button
            onClick={() => setSelectedMessageInfo(null)}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-sm transition-colors cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
