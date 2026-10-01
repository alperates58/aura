"use client";

import { MessageSquare, ShieldCheck } from "lucide-react";

export default function EmptyChatState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 select-none animate-in fade-in duration-300">
      <div className="relative mb-4">
        <div className="w-16 h-16 rounded-3xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-grupo-accent shadow-xl shadow-slate-950/40">
          <MessageSquare className="w-8 h-8" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
          <ShieldCheck className="w-3.5 h-3.5" />
        </div>
      </div>
      <h3 className="text-lg font-bold text-white mb-1">Aura</h3>
      <p className="text-sm text-slate-400 max-w-sm mb-4 leading-relaxed">
        Sol taraftan bir sohbet seçin veya &quot;Kişiler&quot; menüsünden birini bularak mesajlaşmaya başlayın.
      </p>
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/60 border border-slate-700/60 text-xs text-slate-400">
        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
        <span>Uçtan Uca Şifreli & Güvenli İletişim</span>
      </div>
    </div>
  );
}
