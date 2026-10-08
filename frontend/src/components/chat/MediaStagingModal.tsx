"use client";

import { useState, useEffect, useRef } from "react";
import { X, Send, Loader2, FileText, Image as ImageIcon, Video, Music, RefreshCw, Smile, Sparkles } from "lucide-react";
import EmojiPicker from "./EmojiPicker";
import { compressImage } from "@/lib/compression";

interface Props {
  file: File | null;
  isOpen: boolean;
  onClose: () => void;
  onSend: (file: File, caption: string, onProgress: (percent: number) => void, signal: AbortSignal) => Promise<void>;
}

export default function MediaStagingModal({ file, isOpen, onClose, onSend }: Props) {
  const [caption, setCaption] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [compressedFile, setCompressedFile] = useState<File | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!file || !isOpen) {
      setPreviewUrl(null);
      setCaption("");
      setIsUploading(false);
      setUploadProgress(0);
      setErrorMsg(null);
      setShowEmojiPicker(false);
      setCompressedFile(null);
      setIsCompressing(false);
      return;
    }

    const isMedia = file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/");
    if (isMedia) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setPreviewUrl(null);
    }
  }, [file, isOpen]);

  // Görseller için arka planda hızlı WhatsApp standardı sıkıştırma ön-hesaplama
  useEffect(() => {
    if (!file || !isOpen) return;
    const fileName = file.name.toLowerCase();
    const isImg = file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(fileName);
    if (isImg && file.size > 200 * 1024) {
      let isCancelled = false;
      setIsCompressing(true);
      compressImage(file)
        .then((comp) => {
          if (!isCancelled) {
            setCompressedFile(comp);
            setIsCompressing(false);
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setIsCompressing(false);
          }
        });
      return () => {
        isCancelled = true;
      };
    } else {
      setCompressedFile(null);
      setIsCompressing(false);
    }
  }, [file, isOpen]);

  if (!isOpen || !file) return null;

  const fileName = file.name.toLowerCase();
  const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif)$/i.test(fileName);
  const isVideo = file.type.startsWith("video/") || /\.(mp4|mov|webm|mkv)$/i.test(fileName);
  const isAudio = file.type.startsWith("audio/") || /\.(mp3|m4a|wav|ogg)$/i.test(fileName);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSend = async () => {
    if (isUploading) return;
    setIsUploading(true);
    setErrorMsg(null);
    setUploadProgress(0);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const finalFile = compressedFile || file;
      await onSend(finalFile, caption.trim(), (percent) => {
        setUploadProgress(percent);
      }, controller.signal);
      onClose();
    } catch (err: any) {
      if (controller.signal.aborted) {
        setErrorMsg("Yükleme iptal edildi.");
      } else {
        setErrorMsg(err?.response?.data?.error || err?.message || "Yükleme başarısız oldu. Lütfen tekrar deneyin.");
      }
    } finally {
      setIsUploading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    } else {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200 select-none"
      onClick={!isUploading ? onClose : undefined}
    >
      <div
        className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Başlığı */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            {isImage ? (
              <ImageIcon className="w-5 h-5 text-indigo-400" />
            ) : isVideo ? (
              <Video className="w-5 h-5 text-purple-400" />
            ) : isAudio ? (
              <Music className="w-5 h-5 text-emerald-400" />
            ) : (
              <FileText className="w-5 h-5 text-amber-400" />
            )}
            <div>
              <h3 className="text-sm font-bold text-white truncate max-w-[240px] sm:max-w-md">
                {file.name}
              </h3>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-[11px] text-slate-400 font-mono">
                  {formatFileSize(file.size)}
                </span>
                {isImage && (
                  compressedFile && compressedFile.size < file.size ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                      <Sparkles className="w-3 h-3 text-emerald-400" />
                      <span>WhatsApp Standardı: {formatFileSize(compressedFile.size)}</span>
                    </span>
                  ) : isCompressing ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-indigo-400">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>WhatsApp optimizasyonu...</span>
                    </span>
                  ) : file.size <= 200 * 1024 ? (
                    <span className="text-[10px] text-emerald-400 font-medium">
                      • Optimize HD Boyut
                    </span>
                  ) : null
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handleCancelUpload}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Medya Önizleme Alanı */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center min-h-[220px] max-h-[50vh] bg-slate-950/60">
          {isImage && previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Önizleme"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              className="max-h-[46vh] max-w-full rounded-2xl object-contain shadow-lg select-none"
            />
          ) : isVideo && previewUrl ? (
            <video
              src={previewUrl}
              controls
              controlsList="nodownload"
              playsInline
              className="max-h-[46vh] max-w-full rounded-2xl object-contain shadow-lg bg-black"
              onContextMenu={(e) => e.preventDefault()}
            />
          ) : isAudio && previewUrl ? (
            <div className="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-lg">
                <Music className="w-8 h-8" />
              </div>
              <audio
                src={previewUrl}
                controls
                controlsList="nodownload"
                className="w-full"
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>
          ) : (
            <div className="w-full max-w-md p-8 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col items-center text-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shadow-lg">
                <FileText className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white truncate max-w-xs">{file.name}</p>
                <p className="text-xs text-slate-400 mt-1">{formatFileSize(file.size)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Yükleme İlerleme Çubuğu */}
        {isUploading && (
          <div className="px-5 py-2.5 bg-slate-950/80 border-t border-slate-800 flex flex-col gap-1.5 animate-in fade-in">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                Yükleniyor...
              </span>
              <span className="font-bold text-indigo-400">%{uploadProgress}</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-150 rounded-full"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Hata ve Tekrar Dene Alanı */}
        {errorMsg && (
          <div className="px-5 py-2.5 bg-rose-500/10 border-t border-rose-500/30 flex items-center justify-between gap-3 text-xs text-rose-300">
            <span className="truncate">{errorMsg}</span>
            <button
              onClick={handleSend}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold flex-shrink-0 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Tekrar Dene</span>
            </button>
          </div>
        )}

        {/* Açıklama (Caption) ve Gönder Alanı */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex flex-col gap-2">
          {showEmojiPicker && (
            <div className="relative mb-2">
              <EmojiPicker
                isOpen={showEmojiPicker}
                onSelectEmoji={(emoji) => {
                  setCaption((prev) => prev + emoji);
                  setShowEmojiPicker(false);
                }}
                onClose={() => setShowEmojiPicker(false)}
                anchorPosition="bottom-left"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
              title="Emoji Ekle"
            >
              <Smile className="w-5 h-5" />
            </button>

            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isUploading}
              placeholder="Bir açıklama ekleyin (isteğe bağlı)..."
              className="flex-1 bg-slate-950/80 border border-slate-700/80 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              autoFocus
            />

            {isUploading ? (
              <button
                type="button"
                onClick={handleCancelUpload}
                className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer flex-shrink-0"
              >
                İptal Et
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                className="p-2.5 sm:px-4 sm:py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-2 cursor-pointer flex-shrink-0"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Gönder</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
