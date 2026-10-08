"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, Radio, Trash2, ShieldAlert } from "lucide-react";

interface EmergencyTabProps {
  emergencyAlert: { type: "success" | "error"; message: string } | null;
  onOpenTerminateModal: () => void;
  onOpenPurgeModal: () => void;
}

export const EmergencyTab: React.FC<EmergencyTabProps> = ({
  emergencyAlert,
  onOpenTerminateModal,
  onOpenPurgeModal,
}) => {
  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Bilgilendirme Kartı */}
      <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center flex-shrink-0 mt-0.5">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-xs font-bold text-white mb-1">Kritik Acil Durum & Veri Güvenliği Bölgesi</h3>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Bu alandaki işlemler geri döndürülemez güvenlik önlemleridir. Olası bir sızıntı, cihaz çalınması veya tehdit anında sistemi anında dondurmak veya sıfır iz bırakacak şekilde temizlemek için tasarlanmıştır.
          </p>
        </div>
      </div>

      {emergencyAlert && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            emergencyAlert.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/30 text-rose-400"
          }`}
        >
          {emergencyAlert.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{emergencyAlert.message}</span>
        </div>
      )}

      {/* KART 1: TÜM OTURUMLARI DÜŞÜR (HERKESİ AT) */}
      <div className="p-5 bg-[#12151D] border border-[#222631] rounded-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Tüm Kullanıcıları Siteden At (Oturumları Düşür)</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Hiçbir mesaj veya veriyi silmez; tüm aktif WebSocket bağlantılarını anında koparır, tüm token versiyonlarını artırır ve tüm cihazları (telefon, tablet, bilgisayar) login ekranına düşürür.
            </p>
          </div>
        </div>

        <div className="pt-2 border-t border-[#222631] flex justify-end">
          <button
            onClick={onOpenTerminateModal}
            className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all shadow-md hover:shadow-amber-500/20 flex items-center gap-2 cursor-pointer"
          >
            <Radio className="w-4 h-4" />
            <span>Herkesi Siteden At (Tüm Cihazları Düşür)</span>
          </button>
        </div>
      </div>

      {/* KART 2: NÜKLEER VERİ İMHASI (FABRİKA AYARLARINA SIFIRLA) */}
      <div className="p-5 bg-[#12151D] border border-rose-500/30 rounded-2xl space-y-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-600/20 text-rose-400 flex items-center justify-center border border-rose-500/40">
            <Trash2 className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Nükleer Veri İmhası (Fabrika Ayarlarına Sıfırla)</span>
              <span className="px-2 py-0.5 rounded-full bg-rose-600/30 border border-rose-500/40 text-rose-300 text-[10px] font-bold">
                Geri Alınamaz
              </span>
            </h4>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Sistemdeki <b>3 ana kullanıcı (2 Admin ve 1 Güvenlik kullanıcısı)</b> ve şifreleri korunur. Ancak veritabanındaki <b>tüm mesajlar, sohbetler, medyalar (fotoğraf, video, ses), arama kayıtları ve giriş logları</b> MinIO ve PostgreSQL üzerinden kalıcı olarak imha edilir.
            </p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-900/40 text-rose-300 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>Bu işlem çalıştırıldığında sistem 0 bayt konuşma geçmişiyle ilk kurulduğu günkü haline döner.</span>
        </div>

        <div className="pt-2 border-t border-[#222631] flex justify-end">
          <button
            onClick={onOpenPurgeModal}
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-lg shadow-rose-600/30 flex items-center gap-2 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Nükleer Temizliği Başlat (Tüm Mesaj ve Medyaları Sil)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
