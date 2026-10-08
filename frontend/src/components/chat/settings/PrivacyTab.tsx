"use client";

import React, { useState } from "react";
import { User, useAuthStore } from "@/store/useAuthStore";

interface PrivacyTabProps {
  user: User | null;
  showToast: (msg?: string) => void;
}

export const PrivacyTab: React.FC<PrivacyTabProps> = ({ user, showToast }) => {
  const { updatePrivacy } = useAuthStore();
  const [readReceipts, setReadReceipts] = useState(
    user?.privacy_settings?.read_receipts ?? true
  );
  const [lastSeen, setLastSeen] = useState(
    user?.privacy_settings?.last_seen ?? true
  );
  const [allowCalls, setAllowCalls] = useState(
    user?.privacy_settings?.allow_calls ?? true
  );

  const handlePrivacyToggle = async (
    key: "read_receipts" | "last_seen" | "allow_calls",
    val: boolean
  ) => {
    if (key === "read_receipts") setReadReceipts(val);
    if (key === "last_seen") setLastSeen(val);
    if (key === "allow_calls") setAllowCalls(val);

    try {
      await updatePrivacy({ [key]: val });
      showToast("Gizlilik tercihleri kaydedildi!");
    } catch (err) {
      console.error("Gizlilik güncellenemedi:", err);
    }
  };

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h3 className="text-base font-bold text-white">Gizlilik & Tikler</h3>
        <p className="text-xs text-slate-400">
          WhatsApp mikro durumlarınızı ve görünürlük tercihlerinizi yönetin.
        </p>
      </div>

      <div className="space-y-3">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-white">Okundu Bilgisi (Mavi Tik)</div>
            <div className="text-xs text-slate-400">
              Kapatılırsa mesajları okuduğunuzda karşı tarafa çift mavi tik gitmez.
            </div>
          </div>
          <button
            type="button"
            onClick={() => handlePrivacyToggle("read_receipts", !readReceipts)}
            className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer ${
              readReceipts ? "bg-emerald-500" : "bg-slate-700"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                readReceipts ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-white">Son Görülme Zamanı</div>
            <div className="text-xs text-slate-400">
              Diğer kullanıcıların son görülme zamanınızı görmesine izin verin.
            </div>
          </div>
          <button
            type="button"
            onClick={() => handlePrivacyToggle("last_seen", !lastSeen)}
            className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer ${
              lastSeen ? "bg-emerald-500" : "bg-slate-700"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                lastSeen ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-white">Gelen Sesli & Görüntülü Aramalar</div>
            <div className="text-xs text-slate-400">
              Kişilerinizin size LiveKit üzerinden 1-e-1 arama başlatabilmesine izin verin.
            </div>
          </div>
          <button
            type="button"
            onClick={() => handlePrivacyToggle("allow_calls", !allowCalls)}
            className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer ${
              allowCalls ? "bg-emerald-500" : "bg-slate-700"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                allowCalls ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
};
