"use client";

import React, { useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { soundEffects } from "@/lib/sounds";
import {
  subscribeUserToPush,
  unsubscribeUserFromPush,
  sendTestPushNotification,
} from "@/lib/push_notifications";
import { Sparkles } from "lucide-react";

interface NotificationsTabProps {
  isPushSubscribed: boolean;
  setIsPushSubscribed: (val: boolean) => void;
  soundAlerts: boolean;
  setSoundAlerts: (val: boolean) => void;
  showToast: (msg?: string) => void;
}

export const NotificationsTab: React.FC<NotificationsTabProps> = ({
  isPushSubscribed,
  setIsPushSubscribed,
  soundAlerts,
  setSoundAlerts,
  showToast,
}) => {
  const { updatePrivacy } = useAuthStore();
  const [isPushLoading, setIsPushLoading] = useState(false);

  const handleTogglePush = async () => {
    setIsPushLoading(true);
    if (isPushSubscribed) {
      const res = await unsubscribeUserFromPush();
      setIsPushSubscribed(false);
      showToast(res.message);
    } else {
      const res = await subscribeUserToPush();
      setIsPushSubscribed(res.success);
      showToast(res.message);
    }
    setIsPushLoading(false);
  };

  const handleTestPush = async () => {
    setIsPushLoading(true);
    const res = await sendTestPushNotification();
    setIsPushLoading(false);
    showToast(res.message);
  };

  const handleToggleSound = async () => {
    const nextVal = !soundAlerts;
    setSoundAlerts(nextVal);
    soundEffects.setSoundEnabled(nextVal);
    if (typeof window !== "undefined") {
      localStorage.setItem("aura_sound_alerts", String(nextVal));
    }
    try {
      await updatePrivacy({ sound_alerts: nextVal });
      showToast(
        nextVal
          ? "Bildirim sesleri açıldı (Sesli mod)"
          : "Bildirim sesleri kapatıldı (Sessiz mod)"
      );
    } catch (e) {
      console.error("Ses ayarı kaydedilemedi:", e);
    }
  };

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h3 className="text-base font-bold text-white">Bildirimler & Sesler</h3>
        <p className="text-xs text-slate-400">
          Tarayıcı Web Push bildirimleri ve gelen/giden mesaj ses efektleri.
        </p>
      </div>

      <div className="space-y-3">
        {/* Web Push */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-white">Web Push Bildirimleri</div>
              <div className="text-xs text-slate-400">
                Uygulama kapalıyken bile arka planda anlık mesaj bildirimleri alın.
              </div>
            </div>
            <button
              type="button"
              onClick={handleTogglePush}
              disabled={isPushLoading}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                isPushSubscribed
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
              }`}
            >
              {isPushLoading
                ? "İşleniyor..."
                : isPushSubscribed
                ? "Aktif"
                : "Etkinleştir"}
            </button>
          </div>

          {isPushSubscribed && (
            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={handleTestPush}
                disabled={isPushLoading}
                className="text-xs text-pink-400 hover:underline cursor-pointer flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Test Bildirimi Gönder</span>
              </button>
            </div>
          )}
        </div>

        {/* Ses Efektleri */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-white">Mesaj ve Arama Sesleri</div>
            <div className="text-xs text-slate-400">
              Mesaj gönderildiğinde, alındığında ve arama geldiğinde ses efekti çal.
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleSound}
            className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer ${
              soundAlerts ? "bg-emerald-500" : "bg-slate-700"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                soundAlerts ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
};
