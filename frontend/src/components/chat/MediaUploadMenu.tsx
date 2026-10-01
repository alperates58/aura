"use client";

import { useState, useRef, useEffect } from "react";
import {
  Plus,
  Image,
  FileText,
  Mic,
  Loader2,
  MapPin,
  Smile,
  Sparkles,
  Headphones,
} from "lucide-react";
import { api } from "@/lib/api";
import { useChatStore } from "@/store/useChatStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { compressImage, validateVideo } from "@/lib/compression";

interface Props {
  conversationId: string;
  onStartVoice: () => void;
  onOpenEmoji?: () => void;
  onStageFile?: (file: File) => void;
  onOpenDoodle?: () => void;
  onOpenListenTogether?: () => void;
}

export default function MediaUploadMenu({
  conversationId,
  onStartVoice,
  onOpenEmoji,
  onStageFile,
  onOpenDoodle,
  onOpenListenTogether,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const sendMediaMessage = useChatStore((state) => state.sendMediaMessage);

  const menuRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaLimits = useSettingsStore((state) => state.settings?.media_limits);

  // Dışarı tıklayınca menüyü kapat
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, category: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (mediaLimits?.max_file_size_mb && file.size > mediaLimits.max_file_size_mb * 1024 * 1024) {
      alert(`Dosya boyutu sistem sınırını aşıyor (En fazla ${mediaLimits.max_file_size_mb} MB yüklenebilir).`);
      e.target.value = "";
      return;
    }

    setIsOpen(false);

    if (onStageFile) {
      e.target.value = "";
      onStageFile(file);
      return;
    }

    setIsUploading(true);

    try {
      const fileName = file.name.toLowerCase();
      const isVideo =
        file.type.startsWith("video/") ||
        /\.(mp4|mov|webm|m4v|mkv|avi|3gp)$/i.test(fileName);
      const isAudio =
        file.type.startsWith("audio/") ||
        /\.(mp3|m4a|wav|ogg|aac|weba)$/i.test(fileName);
      const isImage =
        !isVideo &&
        !isAudio &&
        (file.type.startsWith("image/") ||
          /\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(fileName));

      const effectiveCategory = isVideo
        ? "video"
        : isAudio
        ? "voice"
        : isImage
        ? "image"
        : category || "file";

      let fileToUpload = file;
      if (isImage) {
        fileToUpload = await compressImage(file);
      } else if (isVideo) {
        const val = validateVideo(file);
        if (!val.valid) {
          alert(val.error);
          setIsUploading(false);
          return;
        }
      }

      const formData = new FormData();
      formData.append("file", fileToUpload);
      formData.append("category", effectiveCategory);

      const res = await api.post("/media/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const { media_url, metadata } = res.data;
      const mediaType = isVideo ? "video" : isAudio ? "voice" : isImage ? "image" : "file";

      sendMediaMessage(conversationId, media_url, mediaType, metadata, "");
    } catch (err: any) {
      console.error("Medya yüklenemedi:", err);
      alert(err.response?.data?.error || "Dosya yüklenirken bir hata oluştu.");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleShareLocation = () => {
    if (!navigator.geolocation) {
      alert("Tarayıcınız konum servisini desteklemiyor.");
      return;
    }
    setIsOpen(false);
    setIsUploading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsUploading(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        sendMediaMessage(
          conversationId,
          "",
          "location",
          { latitude: lat, longitude: lng },
          "📍 Canlı Konum Paylaşıldı"
        );
      },
      () => {
        setIsUploading(false);
        alert("Konum alınamadı: Lütfen tarayıcınızda konum erişimine izin verildiğinden emin olun.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div ref={menuRef} className="relative">
      {/* Gizli Dosya Girişleri */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => handleFileUpload(e, "image")}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={mediaLimits?.allowed_extensions?.join(",") || "*/*"}
        className="hidden"
        onChange={(e) => handleFileUpload(e, "file")}
      />

      {/* WhatsApp iOS Stili Popover Menü */}
      {isOpen && (
        <div className="absolute bottom-14 left-0 w-56 bg-slate-900/95 border border-white/10 rounded-3xl shadow-2xl p-2 z-40 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-3 duration-200 space-y-1">
          {/* 1. Fotoğraf ve Video */}
          <button
            onClick={() => {
              setIsOpen(false);
              imageInputRef.current?.click();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-slate-800/80 active:scale-[0.98] text-slate-200 hover:text-white transition-all cursor-pointer text-left group"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-600 via-indigo-600 to-violet-500 text-white flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform">
              <Image className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-xs text-white block">Fotoğraf ve Video</span>
              <span className="text-[10px] text-slate-400 block truncate">Galeri veya kamera</span>
            </div>
          </button>

          {/* 2. Belge / Dosya */}
          <button
            onClick={() => {
              setIsOpen(false);
              fileInputRef.current?.click();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-slate-800/80 active:scale-[0.98] text-slate-200 hover:text-white transition-all cursor-pointer text-left group"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 via-sky-500 to-cyan-400 text-white flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform">
              <FileText className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-xs text-white block">Belge / Dosya</span>
              <span className="text-[10px] text-slate-400 block truncate">PDF, arşiv veya doküman</span>
            </div>
          </button>

          {/* 3. Konum Paylaş */}
          <button
            onClick={handleShareLocation}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-slate-800/80 active:scale-[0.98] text-slate-200 hover:text-white transition-all cursor-pointer text-left group"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-rose-500 via-pink-500 to-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform">
              <MapPin className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-xs text-white block">Konum Paylaş</span>
              <span className="text-[10px] text-slate-400 block truncate">Anlık GPS konumu</span>
            </div>
          </button>

          {/* 4. Canlı Çizim (Doodle) */}
          {onOpenDoodle && (
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenDoodle();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-slate-800/80 active:scale-[0.98] text-slate-200 hover:text-white transition-all cursor-pointer text-left group"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-pink-600 via-rose-500 to-fuchsia-500 text-white flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform">
                <Sparkles className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-xs text-white block">Canlı Çizim</span>
                <span className="text-[10px] text-slate-400 block truncate">Eşzamanlı tuval & doodle</span>
              </div>
            </button>
          )}

          {/* 5. Birlikte Dinle */}
          {onOpenListenTogether && (
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenListenTogether();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-slate-800/80 active:scale-[0.98] text-slate-200 hover:text-white transition-all cursor-pointer text-left group"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 via-purple-600 to-violet-600 text-white flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform">
                <Headphones className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-xs text-white block">Birlikte Dinle</span>
                <span className="text-[10px] text-slate-400 block truncate">YouTube senkron müzik</span>
              </div>
            </button>
          )}

          {/* 6. Sesli Mesaj */}
          <button
            onClick={() => {
              setIsOpen(false);
              onStartVoice();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-slate-800/80 active:scale-[0.98] text-slate-200 hover:text-white transition-all cursor-pointer text-left group"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-500 via-teal-500 to-green-400 text-white flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform">
              <Mic className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-xs text-white block">Sesli Mesaj</span>
              <span className="text-[10px] text-slate-400 block truncate">Ses kaydı oluştur</span>
            </div>
          </button>

          {/* 7. Emoji & İfadeler */}
          {onOpenEmoji && (
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenEmoji();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-slate-800/80 active:scale-[0.98] text-slate-200 hover:text-white transition-all cursor-pointer text-left group"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 via-yellow-500 to-orange-400 text-white flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform">
                <Smile className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-xs text-white block">Emoji & İfadeler</span>
                <span className="text-[10px] text-slate-400 block truncate">İfadeler ve çıkartmalar</span>
              </div>
            </button>
          )}
        </div>
      )}

      {/* WhatsApp iOS & Grupo İmzası Dönen '+' Butonu */}
      <button
        type="button"
        disabled={isUploading}
        onClick={() => setIsOpen(!isOpen)}
        title="Medya veya Eklenti Menüsü"
        style={
          isOpen
            ? {
                color: "var(--accent, #6366F1)",
                boxShadow: "0 4px 14px var(--accent-shadow, rgba(99, 102, 241, 0.3))",
              }
            : undefined
        }
        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all duration-300 cursor-pointer shadow-md flex-shrink-0 active:scale-95 ${
          isOpen
            ? "bg-slate-800 rotate-45 border border-white/20 scale-105"
            : "bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-white border border-grupo-dark-border"
        }`}
      >
        {isUploading ? (
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--accent, #6366F1)" }} />
        ) : (
          <Plus className="w-5 h-5 transition-transform duration-300" />
        )}
      </button>
    </div>
  );
}
