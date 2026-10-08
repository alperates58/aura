"use client";

import React from "react";
import { Users, X, AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

interface TerminateSessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  emergencyPassword: string;
  setEmergencyPassword: (val: string) => void;
  onTerminate: () => void;
  isLoading: boolean;
}

export const TerminateSessionsModal: React.FC<TerminateSessionsModalProps> = ({
  isOpen,
  onClose,
  emergencyPassword,
  setEmergencyPassword,
  onTerminate,
  isLoading,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in select-none">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#0F1219] border border-amber-500/40 rounded-3xl shadow-2xl p-5 sm:p-6 flex flex-col gap-4 text-slate-200 animate-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#222736]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                Tüm Oturumları Kapat
              </h3>
              <p className="text-[11px] text-slate-400">
                Bütün kullanıcıları sistemden anında düşürün
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-900/40 text-amber-300 text-xs leading-relaxed flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Bu işlem sistemdeki tüm kullanıcıların ve yöneticilerin aktif tokenlarını geçersiz kılar ve tüm WebSocket bağlantılarını anında keser.
          </span>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-300">
            Yönetici Şifreniz
          </label>
          <input
            type="password"
            placeholder="İşlemi onaylamak için şifrenizi girin"
            value={emergencyPassword}
            onChange={(e) => setEmergencyPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onTerminate();
            }}
            className="w-full bg-[#151922] border border-[#272D3D] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
            autoFocus
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#222736]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={onTerminate}
            disabled={isLoading || !emergencyPassword}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-amber-600/30 transition cursor-pointer"
          >
            {isLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Users className="w-3.5 h-3.5" />
            )}
            <span>{isLoading ? "Düşürülüyor..." : "Herkesi Düşür"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface NuclearPurgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  purgeConfirmationText: string;
  setPurgeConfirmationText: (val: string) => void;
  emergencyPassword: string;
  setEmergencyPassword: (val: string) => void;
  onPurge: () => void;
  isLoading: boolean;
}

export const NuclearPurgeModal: React.FC<NuclearPurgeModalProps> = ({
  isOpen,
  onClose,
  purgeConfirmationText,
  setPurgeConfirmationText,
  emergencyPassword,
  setEmergencyPassword,
  onPurge,
  isLoading,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[140] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in select-none">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[#0F1219] border border-rose-600/50 rounded-3xl shadow-2xl p-5 sm:p-6 flex flex-col gap-4 text-slate-200 animate-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#222736]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Nükleer Veri İmhası</span>
                <span className="px-2 py-0.5 rounded-full bg-rose-600/30 border border-rose-500/40 text-rose-300 text-[10px] font-bold">
                  GERİ ALINAMAZ
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Fabrika ayarlarına sıfırlama ve sıfır kalıntı
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-900/50 text-rose-200 text-xs leading-relaxed space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-rose-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>DİKKAT: Kalıcı ve Geri Alınamaz İşlem!</span>
          </div>
          <p className="text-slate-300 text-[11px]">
            Sistemdeki <b>3 ana kullanıcı (2 Admin, 1 Güvenlik)</b> haricindeki tüm mesajlar, konuşmalar, MinIO medya dosyaları (fotoğraf, video, ses), arama kayıtları ve sistem logları kalıcı olarak silinecektir.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              1. Onay Cümlesi: Tam olarak <span className="text-rose-400 font-mono font-bold select-all">&quot;HER ŞEYİ SİL&quot;</span> yazın
            </label>
            <input
              type="text"
              placeholder="HER ŞEYİ SİL"
              value={purgeConfirmationText}
              onChange={(e) => setPurgeConfirmationText(e.target.value)}
              className="w-full bg-[#151922] border border-rose-500/30 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white font-mono focus:outline-none focus:border-rose-500 transition-colors uppercase tracking-wider"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              2. Yönetici Şifreniz
            </label>
            <input
              type="password"
              placeholder="İşlemi yetkilendirmek için şifrenizi girin"
              value={emergencyPassword}
              onChange={(e) => setEmergencyPassword(e.target.value)}
              className="w-full bg-[#151922] border border-[#272D3D] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-rose-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#222736]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={onPurge}
            disabled={
              isLoading ||
              purgeConfirmationText.trim() !== "HER ŞEYİ SİL" ||
              !emergencyPassword
            }
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-lg shadow-rose-600/40 transition cursor-pointer"
          >
            {isLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            <span>{isLoading ? "Veriler İmha Ediliyor..." : "HER ŞEYİ KALICI OLARAK İMHA ET"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
