"use client";

import React, { useState, useRef, useEffect } from "react";
import { useStoryStore } from "@/store/useStoryStore";
import { useAuthStore } from "@/store/useAuthStore";
import { compressImage } from "@/lib/compression";
import { api, resolveMediaUrl } from "@/lib/api";
import {
  X,
  Image as ImageIcon,
  Type,
  Music,
  Smile,
  Sparkles,
  Check,
  Send,
  Loader2,
  Clock,
  Sliders,
  Pencil,
  Camera,
  Video,
  RotateCw,
  Maximize2,
  Grid,
  Users,
  Star,
  FlipHorizontal,
} from "lucide-react";

export function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/)|youtu\.be\/|music\.youtube\.com\/(?:watch\?v=|.*[?&]v=))([a-zA-Z0-9_-]{11})/i
  );
  return match ? match[1] : null;
}

export function formatTimeSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export interface StoryTextSticker {
  id: string;
  type: "text";
  text: string;
  style: "classic_black" | "classic_white" | "neon_pink" | "vibrant_yellow" | "emerald" | "transparent";
  fontSize: "sm" | "base" | "lg" | "xl";
  x: number;
  y: number;
}

export interface StoryEmojiSticker {
  id: string;
  type: "emoji";
  emoji: string;
  x: number;
  y: number;
}

export function getTextStyleClasses(style: StoryTextSticker["style"]): string {
  switch (style) {
    case "classic_white":
      return "bg-white/95 text-slate-900 border border-slate-200 shadow-xl";
    case "neon_pink":
      return "bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-xl shadow-pink-500/40";
    case "vibrant_yellow":
      return "bg-amber-400 text-slate-950 font-black shadow-xl";
    case "emerald":
      return "bg-emerald-600 text-white shadow-xl";
    case "transparent":
      return "bg-transparent text-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.9)] font-extrabold";
    case "classic_black":
    default:
      return "bg-black/80 text-white border border-white/20 shadow-xl backdrop-blur-sm";
  }
}

export function getTextSizeClasses(size: StoryTextSticker["fontSize"]): string {
  switch (size) {
    case "sm":
      return "text-xs sm:text-sm";
    case "lg":
      return "text-base sm:text-lg font-bold";
    case "xl":
      return "text-lg sm:text-xl font-black";
    case "base":
    default:
      return "text-sm sm:text-base font-semibold";
  }
}

const GRADIENT_PRESETS = [
  "from-pink-900 via-purple-900 to-slate-950",
  "from-rose-600 via-pink-600 to-amber-500",
  "from-indigo-900 via-blue-900 to-slate-950",
  "from-emerald-900 via-teal-900 to-slate-950",
  "from-amber-700 via-orange-800 to-slate-950",
  "from-slate-900 via-purple-950 to-black",
];

const MUSIC_PRESETS = [
  { title: "Blinding Lights", artist: "The Weeknd", url: "https://music.youtube.com/watch?v=4NRXx6U8ABQ" },
  { title: "Starboy", artist: "The Weeknd ft. Daft Punk", url: "https://music.youtube.com/watch?v=34Na4j8AVgA" },
  { title: "Flowers", artist: "Miley Cyrus", url: "https://music.youtube.com/watch?v=G7KNmW9a75Y" },
  { title: "Aura Chill Beats", artist: "Lofi Beats Collection", url: "https://music.youtube.com/watch?v=jfKfPfyJRdk" },
  { title: "Nightcall", artist: "Kavinsky", url: "https://music.youtube.com/watch?v=MV_3Dpw-BRY" },
  { title: "As It Was", artist: "Harry Styles", url: "https://music.youtube.com/watch?v=H5v3kku4y6Q" },
];

const POPULAR_EMOJIS = [
  "❤️", "💖", "🔥", "✨", "💯", "🌟",
  "😂", "😍", "🥰", "😎", "🥳", "🥺",
  "🤩", "👏", "🤍", "💫", "🎶", "☕",
  "⚡", "🎉", "👑", "👀", "🙌", "🥂",
  "🎈", "💐", "🚀", "💪",
];

export default function StoryCreatorModal() {
  const { user } = useAuthStore();
  const { isCreatorOpen, closeCreator, createStory, editingStory, updateStory } = useStoryStore();

  const canvasRef = useRef<HTMLDivElement | null>(null);

  const [mode, setMode] = useState<"media" | "text">("media");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string>("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [caption, setCaption] = useState("");
  const [selectedGradient, setSelectedGradient] = useState(GRADIENT_PRESETS[0]);

  // Müzik seçimi ve zamanlama
  const [musicTitle, setMusicTitle] = useState("");
  const [musicArtist, setMusicArtist] = useState("");
  const [musicUrl, setMusicUrl] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<number>(10);
  const [musicStart, setMusicStart] = useState<number>(0);
  const [musicEnd, setMusicEnd] = useState<number>(10);
  const [isMusicPickerOpen, setIsMusicPickerOpen] = useState(false);
  const [isFetchingMusic, setIsFetchingMusic] = useState(false);

  // Müzik Rozeti Konumu (Sürüklenebilir)
  const [musicBadgePos, setMusicBadgePos] = useState<{ x: number; y: number }>({ x: 30, y: 15 });

  // Emoji Çıkartmaları
  const [emojiStickers, setEmojiStickers] = useState<StoryEmojiSticker[]>([]);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);

  // Metin Katmanı (Aa)
  const [textStickers, setTextStickers] = useState<StoryTextSticker[]>([]);
  const [isTextEditorOpen, setIsTextEditorOpen] = useState(false);
  const [editingStickerId, setEditingStickerId] = useState<string | null>(null);
  const [currentStickerText, setCurrentStickerText] = useState("");
  const [currentStickerStyle, setCurrentStickerStyle] = useState<StoryTextSticker["style"]>("classic_black");
  const [currentStickerSize, setCurrentStickerSize] = useState<StoryTextSticker["fontSize"]>("base");

  // Genel Sürükleme Durumu (Pointer Events)
  const [dragState, setDragState] = useState<{
    itemType: "music" | "text" | "emoji";
    id?: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    hasMoved: boolean;
  } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Hedef Kitle (Audience)
  const [audience, setAudience] = useState<"everyone" | "close_friends">("everyone");

  // Medya Düzenleme & Kırpma Araçları (Transforms)
  const [rotation, setRotation] = useState<number>(0);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [showCropGrid, setShowCropGrid] = useState<boolean>(false);

  // Uygulama İçi Kamera & Video Kaydedici
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");
  const [cameraCaptureMode, setCameraCaptureMode] = useState<"photo" | "video">("photo");
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // createObjectURL bellek sızıntısını (memory leak) önlemek için güvenli URL takipçisi
  const activeObjectUrlsRef = useRef<string[]>([]);
  const safeCreateObjectURL = (file: Blob | File): string => {
    const url = URL.createObjectURL(file);
    activeObjectUrlsRef.current.push(url);
    return url;
  };

  const revokeAllObjectUrls = () => {
    activeObjectUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
    activeObjectUrlsRef.current = [];
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsCameraActive(false);
    setIsRecordingVideo(false);
    setRecordingSeconds(0);
  };

  // Kamera aktifleştiğinde video elementine akışı garanti olarak bağla
  useEffect(() => {
    if (isCameraActive && mediaStreamRef.current && cameraVideoRef.current) {
      if (cameraVideoRef.current.srcObject !== mediaStreamRef.current) {
        cameraVideoRef.current.srcObject = mediaStreamRef.current;
      }
      cameraVideoRef.current.play().catch((err) => {
        console.warn("Kamera video oynatma uyarısı:", err);
      });
    }
  }, [isCameraActive]);

  const startCamera = async (facing: "user" | "environment" = cameraFacing) => {
    stopCamera();
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        alert("Tarayıcınız kamera erişimini desteklemiyor veya güvenli bağlantı (HTTPS) gerekebilir.");
        return;
      }

      let stream: MediaStream;
      try {
        // 1. İdeal çözünürlük ve ses (video kaydı için) dene
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: true,
        });
      } catch (audioOrIdealErr) {
        console.warn("Ses veya ideal çözünürlükle kamera açılamadı, sadece kamera ile deneniyor:", audioOrIdealErr);
        try {
          // 2. Mikrofon yoksa veya engelliyse sadece video ile dene
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facing },
            },
            audio: false,
          });
        } catch (strictVideoErr) {
          console.warn("facingMode ile açılamadı, genel video ile deneniyor:", strictVideoErr);
          // 3. En temel video constraint ile dene
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }

      mediaStreamRef.current = stream;
      setCameraFacing(facing);
      setIsCameraActive(true);

      // DOM'da video elementi zaten varsa doğrudan srcObject ata
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        cameraVideoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.error("Kamera açılamadı:", err);
      const msg =
        err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError"
          ? "Kamera erişim izni verilmedi. Lütfen tarayıcınızın adres çubuğundaki kilit/site ayarları simgesinden kameraya izin verin."
          : err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError"
          ? "Cihazınızda kullanılabilir kamera bulunamadı."
          : "Kamera açılamadı: " + (err?.message || "Bilinmeyen hata");
      alert(msg);
    }
  };

  const flipCamera = () => {
    const nextFacing = cameraFacing === "user" ? "environment" : "user";
    startCamera(nextFacing);
  };

  const takePhotoSnapshot = () => {
    if (!cameraVideoRef.current) return;
    const video = cameraVideoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      alert("Kamera görüntüsü henüz hazır değil, lütfen bir saniye bekleyin.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1080;
    canvas.height = video.videoHeight || 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (cameraFacing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], `story_camera_${Date.now()}.jpg`, { type: "image/jpeg" });
          setMediaFile(file);
          const previewUrl = safeCreateObjectURL(file);
          setMediaPreview(previewUrl);
          setMediaType("image");
          setMode("media");
          stopCamera();
        }
      },
      "image/jpeg",
      0.92
    );
  };

  const startVideoRecording = () => {
    if (!mediaStreamRef.current) return;
    recordedChunksRef.current = [];
    const hasAudio = mediaStreamRef.current.getAudioTracks().length > 0;
    const mimeTypes = hasAudio
      ? [
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/webm",
          "video/mp4",
        ]
      : [
          "video/webm;codecs=vp9",
          "video/webm;codecs=vp8",
          "video/webm",
          "video/mp4",
        ];
    let selectedMime = "";
    for (const m of mimeTypes) {
      if (MediaRecorder.isTypeSupported(m)) {
        selectedMime = m;
        break;
      }
    }

    try {
      const recorder = new MediaRecorder(mediaStreamRef.current, selectedMime ? { mimeType: selectedMime } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const mime = selectedMime || "video/webm";
        const ext = mime.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(recordedChunksRef.current, { type: mime });
        const file = new File([blob], `story_video_${Date.now()}.${ext}`, { type: mime });
        setMediaFile(file);
        const previewUrl = safeCreateObjectURL(file);
        setMediaPreview(previewUrl);
        setMediaType("video");
        setMode("media");
        const dur = Math.max(5, Math.min(60, recordingSeconds));
        setDurationSeconds(dur);
        setMusicEnd(musicStart + dur);
        stopCamera();
      };

      recorder.start(100);
      setIsRecordingVideo(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 59) {
            stopVideoRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Video kaydı başlatılamadı:", err);
    }
  };

  const stopVideoRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecordingVideo(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
      revokeAllObjectUrls();
    };
  }, []);

  const extractedVideoId = extractYouTubeVideoId(musicUrl);

  // Modal açıldığında veya editingStory değiştiğinde state doldur / temizle
  useEffect(() => {
    if (!isCreatorOpen) {
      stopCamera();
      revokeAllObjectUrls();
      setTextStickers([]);
      setEmojiStickers([]);
      setIsTextEditorOpen(false);
      setIsEmojiPickerOpen(false);
      setEditingStickerId(null);
      setCurrentStickerText("");
      setMediaFile(null);
      setMediaPreview("");
      setCaption("");
      setMusicTitle("");
      setMusicArtist("");
      setMusicUrl("");
      setMusicBadgePos({ x: 30, y: 15 });
      setDragState(null);
      setRotation(0);
      setZoomScale(1);
      setShowCropGrid(false);
      setAudience("everyone");
      return;
    }

    if (editingStory) {
      setAudience(editingStory.audience === "close_friends" ? "close_friends" : "everyone");
      // Düzenleme modundayız: mevcut hikaye bilgilerini doldur
      if (editingStory.media_type === "image" || editingStory.media_type === "video") {
        setMode("media");
        setMediaType(editingStory.media_type);
        setMediaPreview(editingStory.media_url ? resolveMediaUrl(editingStory.media_url) : "");
      } else {
        setMode("text");
        setMediaFile(null);
        setMediaPreview("");
      }

      setCaption(editingStory.caption || "");
      setSelectedGradient(editingStory.background_color || GRADIENT_PRESETS[0]);

      const dur = editingStory.duration_seconds && editingStory.duration_seconds > 0 ? editingStory.duration_seconds : 10;
      const mStart = editingStory.music_start || 0;
      const mEnd = editingStory.music_end && editingStory.music_end > mStart ? editingStory.music_end : mStart + dur;

      setDurationSeconds(dur);
      setMusicStart(mStart);
      setMusicEnd(mEnd);

      setMusicTitle(editingStory.music_title || "");
      setMusicArtist(editingStory.music_artist || "");
      setMusicUrl(editingStory.music_url || "");

      // Çıkartmaları ayrıştır
      if (Array.isArray(editingStory.stickers)) {
        const musicBadge = editingStory.stickers.find((s: any) => s.type === "music_badge");
        if (musicBadge) {
          setMusicBadgePos({ x: musicBadge.x ?? 30, y: musicBadge.y ?? 15 });
        }

        const emojis = editingStory.stickers
          .filter((s: any) => s.type === "emoji" && s.emoji)
          .map((s: any, idx: number) => ({
            id: `emoji_edit_${idx}_${Date.now()}`,
            type: "emoji" as const,
            emoji: s.emoji,
            x: s.x ?? 50,
            y: s.y ?? 50,
          }));
        setEmojiStickers(emojis);

        const texts = editingStory.stickers
          .filter((s: any) => s.type === "text" && s.text)
          .map((s: any, idx: number) => ({
            id: `text_edit_${idx}_${Date.now()}`,
            type: "text" as const,
            text: s.text,
            style: s.style || "classic_black",
            fontSize: s.fontSize || "base",
            x: s.x ?? 50,
            y: s.y ?? 50,
          }));
        setTextStickers(texts);
      }
    }
  }, [isCreatorOpen, editingStory]);

  // YouTube / YouTube Music linki değiştiğinde otomatik şarkı & sanatçı adı çekme
  const handleMusicUrlChange = async (val: string) => {
    setMusicUrl(val);
    const vid = extractYouTubeVideoId(val);
    if (!vid) {
      if (!val.trim()) {
        setMusicTitle("");
        setMusicArtist("");
      }
      return;
    }

    setIsFetchingMusic(true);
    try {
      const res = await api.get(`/stories/youtube-info?url=${encodeURIComponent(val)}`);
      if (res.data?.title) {
        setMusicTitle(res.data.title);
      }
      if (res.data?.artist) {
        setMusicArtist(res.data.artist);
      }
    } catch (err) {
      console.warn("YouTube bilgisi alınamadı:", err);
      if (!musicTitle) {
        setMusicTitle("YouTube Parçası");
      }
    } finally {
      setIsFetchingMusic(false);
    }
  };

  // Sürüklemeyi Başlat (Mouse ve Dokunmatik Ekran)
  const handleStartDrag = (
    e: React.PointerEvent,
    itemType: "music" | "text" | "emoji",
    id?: string,
    currentX?: number,
    currentY?: number
  ) => {
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {}

    setDragState({
      itemType,
      id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: currentX ?? (itemType === "music" ? musicBadgePos.x : 50),
      initialY: currentY ?? (itemType === "music" ? musicBadgePos.y : 50),
      hasMoved: false,
    });
  };

  // Sürükleme Hareketi
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const deltaX = ((e.clientX - dragState.startX) / rect.width) * 100;
    const deltaY = ((e.clientY - dragState.startY) / rect.height) * 100;

    if (Math.abs(e.clientX - dragState.startX) > 4 || Math.abs(e.clientY - dragState.startY) > 4) {
      if (!dragState.hasMoved) {
        setDragState((prev) => (prev ? { ...prev, hasMoved: true } : null));
      }
    }

    const nextX = Math.max(10, Math.min(90, Math.round(dragState.initialX + deltaX)));
    const nextY = Math.max(8, Math.min(92, Math.round(dragState.initialY + deltaY)));

    if (dragState.itemType === "music") {
      setMusicBadgePos({ x: nextX, y: nextY });
    } else if (dragState.itemType === "text" && dragState.id) {
      setTextStickers((prev) =>
        prev.map((s) => (s.id === dragState.id ? { ...s, x: nextX, y: nextY } : s))
      );
    } else if (dragState.itemType === "emoji" && dragState.id) {
      setEmojiStickers((prev) =>
        prev.map((s) => (s.id === dragState.id ? { ...s, x: nextX, y: nextY } : s))
      );
    }
  };

  // Sürükleme Bitişi
  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragState) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {}
      setDragState(null);
    }
  };

  const handleOpenTextEditor = (stickerToEdit?: StoryTextSticker) => {
    if (stickerToEdit) {
      setEditingStickerId(stickerToEdit.id);
      setCurrentStickerText(stickerToEdit.text);
      setCurrentStickerStyle(stickerToEdit.style);
      setCurrentStickerSize(stickerToEdit.fontSize);
    } else {
      setEditingStickerId(null);
      setCurrentStickerText("");
      setCurrentStickerStyle("classic_black");
      setCurrentStickerSize("base");
    }
    setIsTextEditorOpen(true);
  };

  const handleSaveTextSticker = () => {
    if (!currentStickerText.trim()) return;

    if (editingStickerId) {
      setTextStickers((prev) =>
        prev.map((s) =>
          s.id === editingStickerId
            ? {
                ...s,
                text: currentStickerText.trim(),
                style: currentStickerStyle,
                fontSize: currentStickerSize,
              }
            : s
        )
      );
    } else {
      const newSticker: StoryTextSticker = {
        id: `text_${Date.now()}`,
        type: "text",
        text: currentStickerText.trim(),
        style: currentStickerStyle,
        fontSize: currentStickerSize,
        x: 50,
        y: 50,
      };
      setTextStickers((prev) => [...prev, newSticker]);
    }

    setIsTextEditorOpen(false);
    setEditingStickerId(null);
  };

  // Hikaye Süresi Değiştiğinde Müzik Bitiş Süresi de OTOMATİK OLARAK UZAR!
  const handleDurationChange = (dur: number) => {
    setDurationSeconds(dur);
    setMusicEnd(musicStart + dur);
  };

  // Müzik Başlangıç Saniyesi Değiştiğinde Bitiş de Süre Kadar İlerler
  const handleStartChange = (startVal: number) => {
    setMusicStart(startVal);
    setMusicEnd(startVal + durationSeconds);
  };

  if (!isCreatorOpen) return null;

  // Dosya seçildiğinde
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Önceki blob URL'i varsa temizle
    if (mediaPreview && (mediaPreview.startsWith("blob:") || mediaPreview.startsWith("data:"))) {
      try {
        URL.revokeObjectURL(mediaPreview);
      } catch {}
    }

    const isVid = file.type.startsWith("video/");
    setMediaType(isVid ? "video" : "image");

    if (isVid) {
      if (file.size > 80 * 1024 * 1024) {
        alert("Video boyutu maksimum 80 MB olabilir.");
        return;
      }
      const previewUrl = safeCreateObjectURL(file);
      setMediaFile(file);
      setMediaPreview(previewUrl);

      // Gerçek video süresini oku ve hikaye süresine otomatik eşitle (maksimum 60s)
      const tempVideo = document.createElement("video");
      tempVideo.preload = "metadata";
      tempVideo.onloadedmetadata = () => {
        const dur = Math.round(tempVideo.duration);
        if (dur > 0) {
          const clamped = Math.min(60, Math.max(5, dur));
          setDurationSeconds(clamped);
          setMusicEnd(musicStart + clamped);
        }
      };
      tempVideo.src = previewUrl;
    } else {
      const compressed = await compressImage(file, 1600, 0.85);
      const previewUrl = safeCreateObjectURL(compressed);
      setMediaFile(compressed);
      setMediaPreview(previewUrl);
    }
    setMode("media");
  };

  // Hikayeyi Gönder veya Güncelle
  const handlePublish = async () => {
    setIsSubmitting(true);
    try {
      let finalMediaUrl = mediaPreview;
      let finalMediaType: "image" | "video" | "text" = mode === "media" ? mediaType : "text";

      if (mode === "media" && mediaFile) {
        finalMediaType = mediaType;
        const formData = new FormData();
        formData.append("file", mediaFile);
        formData.append("category", mediaType);

        const uploadRes = await api.post("/media/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        finalMediaUrl = uploadRes.data.media_url;
      }

      // Çıkartmalar ve metin katmanları listesi
      const stickers: any[] = [];

      // 1. YouTube Müzik Rozeti konumu
      if (musicTitle || extractedVideoId) {
        stickers.push({
          type: "music_badge",
          x: musicBadgePos.x,
          y: musicBadgePos.y,
        });
      }

      // 2. Metin katmanları
      textStickers.forEach((ts) => {
        stickers.push({
          type: "text",
          text: ts.text,
          style: ts.style,
          fontSize: ts.fontSize,
          x: ts.x,
          y: ts.y,
        });
      });

      // 3. Emoji çıkartmaları
      emojiStickers.forEach((es) => {
        stickers.push({
          type: "emoji",
          emoji: es.emoji,
          x: es.x,
          y: es.y,
        });
      });

      const storyPayload = {
        media_type: finalMediaType,
        media_url: finalMediaUrl,
        caption: caption.trim(),
        background_color: selectedGradient,
        music_title:
          (musicTitle.trim().startsWith("http") ? "" : musicTitle.trim()) ||
          (extractedVideoId ? "YouTube Music" : ""),
        music_artist:
          (musicArtist.trim().startsWith("http") ? "" : musicArtist.trim()) ||
          (extractedVideoId ? "YouTube" : ""),
        music_url: musicUrl.trim(),
        duration_seconds: durationSeconds,
        music_start: musicStart,
        music_end: musicEnd,
        stickers,
        audience,
      };

      if (editingStory) {
        // Mevcut hikayeyi güncelle
        await updateStory(editingStory.id, storyPayload);
        closeCreator();
        alert("Hikayeniz başarıyla güncellendi!");
      } else {
        // Yeni hikaye oluştur
        await createStory(storyPayload);
        closeCreator();
        alert("Hikayeniz 24 saatliğine yayınlandı!");
      }
    } catch (err) {
      console.error("Hikaye kaydedilemedi:", err);
      alert("Hikaye kaydedilirken bir hata oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 select-none animate-in fade-in duration-200">
      <div className="relative w-full max-w-md h-[100dvh] sm:h-[90vh] sm:max-h-[850px] bg-slate-950 sm:rounded-3xl overflow-hidden flex flex-col justify-between shadow-2xl border border-slate-800">
        
        {/* 1. ÜST BAR: Başlık ve Kapat */}
        <div className="p-3.5 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent z-20">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            {editingStory ? (
              <>
                <Pencil className="w-4 h-4 text-amber-400" />
                <span>Hikayeyi Düzenle</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-pink-500" />
                <span>Yeni Hikaye Oluştur</span>
              </>
            )}
          </div>

          {/* Sağ kontroller: Süre rozeti ve Kapat */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-700/80 rounded-full px-2.5 py-1 text-[11px] text-pink-400 font-semibold">
              <Clock className="w-3 h-3 text-pink-500" />
              <span>{durationSeconds}s</span>
            </div>

            <button
              onClick={() => closeCreator()}
              disabled={isSubmitting}
              className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. MERKEZ TUVAL & SÜRÜKLEME ALANI */}
        <div
          ref={canvasRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative flex-1 w-full flex items-center justify-center overflow-hidden touch-none"
        >
          {isCameraActive ? (
            /* CANLI KAMERA VİDEO VE ÇEKİM ALANI */
            <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
              <video
                ref={(el) => {
                  cameraVideoRef.current = el;
                  if (el && mediaStreamRef.current && el.srcObject !== mediaStreamRef.current) {
                    el.srcObject = mediaStreamRef.current;
                    el.play().catch((e) => console.warn("Video play hatası:", e));
                  }
                }}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={(e) => {
                  (e.target as HTMLVideoElement).play().catch(() => {});
                }}
                className={`w-full h-full object-cover ${cameraFacing === "user" ? "-scale-x-100" : ""}`}
              />

              {/* Kamera Kılavuz Çizgileri */}
              <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-25">
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-white" />
                <div className="border-r border-white" />
                <div className="" />
              </div>

              {/* Kamera Üst Butonları */}
              <div className="absolute top-3 inset-x-3 flex items-center justify-between z-30">
                <button
                  type="button"
                  onClick={stopCamera}
                  className="p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={flipCamera}
                  className="p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
                  title="Kamerayı Çevir"
                >
                  <FlipHorizontal className="w-5 h-5" />
                </button>
              </div>

              {/* Kamera Alt Çekim Alanı */}
              <div className="absolute bottom-5 inset-x-0 flex flex-col items-center gap-3 z-30">
                {/* Foto / Video Mod Seçici */}
                <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md rounded-full p-1 border border-white/20">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isRecordingVideo) setCameraCaptureMode("photo");
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      cameraCaptureMode === "photo" ? "bg-white text-black" : "text-white/70"
                    }`}
                  >
                    Fotoğraf
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isRecordingVideo) setCameraCaptureMode("video");
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      cameraCaptureMode === "video" ? "bg-rose-600 text-white" : "text-white/70"
                    }`}
                  >
                    Video
                  </button>
                </div>

                {/* Deklanşör */}
                {cameraCaptureMode === "photo" ? (
                  <button
                    type="button"
                    onClick={takePhotoSnapshot}
                    className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center p-1 bg-white/20 hover:scale-105 active:scale-95 transition-transform cursor-pointer shadow-2xl"
                    title="Fotoğraf Çek"
                  >
                    <div className="w-full h-full rounded-full bg-white" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={isRecordingVideo ? stopVideoRecording : startVideoRecording}
                    className="w-16 h-16 rounded-full border-4 border-rose-500 flex items-center justify-center p-1 bg-rose-500/20 hover:scale-105 active:scale-95 transition-transform cursor-pointer shadow-2xl"
                    title={isRecordingVideo ? "Kaydı Durdur" : "Kayda Başla"}
                  >
                    <div
                      className={`transition-all ${
                        isRecordingVideo ? "w-6 h-6 rounded-md bg-rose-500 animate-pulse" : "w-full h-full rounded-full bg-rose-600"
                      }`}
                    />
                  </button>
                )}

                {isRecordingVideo && (
                  <div className="text-xs font-mono font-bold text-rose-400 bg-black/70 px-3 py-1 rounded-full border border-rose-500/30">
                    00:{recordingSeconds.toString().padStart(2, "0")} / 01:00
                  </div>
                )}
              </div>
            </div>
          ) : mode === "media" && mediaPreview ? (
            <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
              {/* 9:16 Kılavuz Çizgileri */}
              {showCropGrid && (
                <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-30 z-20">
                  <div className="border-r border-b border-pink-400 border-dashed" />
                  <div className="border-r border-b border-pink-400 border-dashed" />
                  <div className="border-b border-pink-400 border-dashed" />
                  <div className="border-r border-b border-pink-400 border-dashed" />
                  <div className="border-r border-b border-pink-400 border-dashed" />
                  <div className="border-b border-pink-400 border-dashed" />
                  <div className="border-r border-b border-pink-400 border-dashed" />
                  <div className="border-r border-b border-pink-400 border-dashed" />
                  <div className="" />
                </div>
              )}

              {mediaType === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaPreview}
                  alt="Önizleme"
                  style={{
                    transform: `rotate(${rotation}deg) scale(${zoomScale})`,
                    transition: "transform 0.2s ease",
                  }}
                  className="w-full h-full object-contain pointer-events-none select-none"
                />
              ) : (
                <video
                  src={mediaPreview}
                  autoPlay
                  loop
                  muted
                  playsInline
                  style={{
                    transform: `rotate(${rotation}deg) scale(${zoomScale})`,
                    transition: "transform 0.2s ease",
                  }}
                  className="w-full h-full object-contain pointer-events-none select-none"
                />
              )}
            </div>
          ) : (
            /* Metin Modu veya Medya Seçilmemişse */
            <div
              className={`w-full h-full bg-gradient-to-br ${selectedGradient} flex flex-col items-center justify-center p-6 text-center select-none`}
            >
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Bir şeyler yaz..."
                maxLength={240}
                rows={4}
                className="w-full bg-transparent text-xl sm:text-2xl font-bold text-white placeholder-white/50 text-center border-none focus:outline-none resize-none drop-shadow-md"
              />
            </div>
          )}

          {/* SÜRÜKLENEBİLİR YOUTUBE MUSIC ROZETİ */}
          {(musicTitle || extractedVideoId) && (
            <div
              style={{
                left: `${musicBadgePos.x}%`,
                top: `${musicBadgePos.y}%`,
                transform: "translate(-50%, -50%)",
              }}
              onPointerDown={(e) => handleStartDrag(e, "music", undefined, musicBadgePos.x, musicBadgePos.y)}
              className="absolute z-30 flex items-center gap-2.5 bg-black/80 hover:bg-black/95 backdrop-blur-md border border-white/25 rounded-full px-3 py-1.5 shadow-2xl text-white cursor-grab active:cursor-grabbing touch-none select-none group"
            >
              <div className="w-6 h-6 rounded-full bg-rose-600 flex items-center justify-center text-white flex-shrink-0 shadow-md">
                <Music className="w-3.5 h-3.5" />
              </div>
              <div className="text-left pr-1 max-w-[180px] truncate text-[11px] font-bold">
                <div className="truncate">{musicTitle || "YouTube Music"}</div>
                <div className="text-[9px] text-slate-300 font-normal truncate">
                  {musicArtist || "Müzik"} • {formatTimeSeconds(musicStart)} - {formatTimeSeconds(musicEnd)}
                </div>
              </div>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setMusicTitle("");
                  setMusicArtist("");
                  setMusicUrl("");
                }}
                title="Şarkıyı Kaldır"
                className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* SÜRÜKLENEBİLİR EMOJİ ÇIKARTMALARI */}
          {emojiStickers.map((es) => (
            <div
              key={es.id}
              style={{
                left: `${es.x}%`,
                top: `${es.y}%`,
                transform: "translate(-50%, -50%)",
              }}
              onPointerDown={(e) => handleStartDrag(e, "emoji", es.id, es.x, es.y)}
              className="absolute z-30 cursor-grab active:cursor-grabbing touch-none select-none group flex items-center justify-center"
            >
              <span className="text-5xl sm:text-6xl drop-shadow-[0_8px_16px_rgba(0,0,0,0.8)] filter transition-transform group-hover:scale-110">
                {es.emoji}
              </span>
              {/* Silme Butonu */}
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setEmojiStickers((prev) => prev.filter((s) => s.id !== es.id))}
                title="Çıkartmayı Sil"
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg opacity-80 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 stroke-[3]" />
              </button>
            </div>
          ))}

          {/* SÜRÜKLENEBİLİR METİN YAZILARI (Aa) */}
          {textStickers.map((ts) => (
            <div
              key={ts.id}
              style={{
                left: `${ts.x}%`,
                top: `${ts.y}%`,
                transform: "translate(-50%, -50%)",
              }}
              onPointerDown={(e) => handleStartDrag(e, "text", ts.id, ts.x, ts.y)}
              onClick={() => {
                if (!dragState?.hasMoved) {
                  handleOpenTextEditor(ts);
                }
              }}
              className={`absolute z-30 max-w-[85%] text-center px-4 py-2 rounded-2xl break-words whitespace-pre-wrap cursor-grab active:cursor-grabbing touch-none select-none group hover:ring-2 hover:ring-pink-400 transition-all ${getTextStyleClasses(
                ts.style
              )} ${getTextSizeClasses(ts.fontSize)}`}
            >
              <span>{ts.text}</span>
              {/* Silme Rozeti */}
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setTextStickers((prev) => prev.filter((s) => s.id !== ts.id));
                }}
                title="Yazıyı Sil"
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-md opacity-80 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 stroke-[3]" />
              </button>
            </div>
          ))}

          {/* METİN EKLEME EDİTÖRÜ MODALI */}
          {isTextEditorOpen && (
            <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between p-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setIsTextEditorOpen(false);
                    setEditingStickerId(null);
                  }}
                  className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-xl bg-white/10"
                >
                  Vazgeç
                </button>

                <span className="text-xs font-bold text-white">Yazı Düzenle</span>

                <button
                  type="button"
                  onClick={handleSaveTextSticker}
                  disabled={!currentStickerText.trim()}
                  className="text-xs font-bold text-white px-4 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 disabled:opacity-40 transition-all cursor-pointer shadow-lg shadow-pink-600/30"
                >
                  Bitti
                </button>
              </div>

              {/* Merkez Metin Girişi */}
              <div className="flex-1 flex items-center justify-center p-4">
                <textarea
                  autoFocus
                  value={currentStickerText}
                  onChange={(e) => setCurrentStickerText(e.target.value)}
                  placeholder="Yazınızı yazın..."
                  rows={3}
                  maxLength={120}
                  className={`w-full max-w-[85%] text-center px-4 py-3 rounded-2xl resize-none border-none outline-none transition-all ${getTextStyleClasses(
                    currentStickerStyle
                  )} ${getTextSizeClasses(currentStickerSize)}`}
                />
              </div>

              {/* Alt Kontroller: Boyut ve Stil Presetleri */}
              <div className="flex flex-col gap-3 pb-2">
                <div className="flex items-center justify-center gap-1.5">
                  <span className="text-[11px] text-slate-400 font-semibold mr-1">Boyut:</span>
                  {(["sm", "base", "lg", "xl"] as const).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setCurrentStickerSize(sz)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        currentStickerSize === sz
                          ? "bg-white text-slate-900 shadow-md scale-105"
                          : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {sz === "sm" ? "Küçük" : sz === "base" ? "Normal" : sz === "lg" ? "Büyük" : "X-Büyük"}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-center gap-2 overflow-x-auto py-1">
                  {[
                    { id: "classic_black", label: "Siyah", bg: "bg-black border border-white/40 text-white" },
                    { id: "classic_white", label: "Beyaz", bg: "bg-white text-black" },
                    { id: "neon_pink", label: "Pembe", bg: "bg-gradient-to-r from-pink-600 to-rose-600 text-white" },
                    { id: "vibrant_yellow", label: "Sarı", bg: "bg-amber-400 text-black font-black" },
                    { id: "emerald", label: "Yeşil", bg: "bg-emerald-600 text-white" },
                    { id: "transparent", label: "Şeffaf", bg: "border border-white/60 text-white" },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setCurrentStickerStyle(st.id as any)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${st.bg} ${
                        currentStickerStyle === st.id ? "ring-2 ring-pink-500 scale-110 shadow-lg" : "opacity-80 hover:opacity-100"
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* INSTAGRAM EMOJİ / ÇIKARTMA SEÇİCİ POPUP */}
          {isEmojiPickerOpen && (
            <div className="absolute inset-x-2 bottom-3 z-50 bg-slate-900/98 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-4 shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Smile className="w-4 h-4 text-amber-400" />
                  <span>Çıkartma & İfade Ekle</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsEmojiPickerOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-2 max-h-48 overflow-y-auto no-scrollbar py-1">
                {POPULAR_EMOJIS.map((em, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setEmojiStickers((prev) => [
                        ...prev,
                        {
                          id: `emoji_${Date.now()}_${idx}`,
                          type: "emoji",
                          emoji: em,
                          x: 50,
                          y: 40 + (prev.length % 3) * 10,
                        },
                      ]);
                      setIsEmojiPickerOpen(false);
                    }}
                    className="w-10 h-10 rounded-2xl bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center text-2xl transition-transform hover:scale-125 active:scale-95 cursor-pointer"
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 3. ARAÇ ÇUBUĞU (Medya, Metin, Müzik, Çıkartma, Renk) */}
        <div className="p-3 bg-slate-900/95 border-t border-slate-800 flex flex-col gap-2.5 z-20">
          
          {/* Müzik Seçim Paneli (YouTube Music & Canlı Önizleme) */}
          {isMusicPickerOpen && (
            <div className="bg-slate-950 p-3 rounded-2xl border border-rose-500/40 shadow-xl flex flex-col gap-3 animate-in fade-in max-h-80 overflow-y-auto no-scrollbar">
              <div className="flex items-center justify-between text-xs text-white font-semibold border-b border-slate-800 pb-2">
                <span className="flex items-center gap-1.5 text-rose-400 font-bold">
                  <Music className="w-4 h-4 text-rose-500" />
                  YouTube Music Şarkı Ekle
                </span>
                <button
                  onClick={() => setIsMusicPickerOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* URL Girişi ve Otomatik Bilgi Çekme */}
              <div>
                <label className="text-[10px] text-slate-400 font-semibold mb-1 flex items-center justify-between">
                  <span>YouTube Music veya YouTube Şarkı Linki:</span>
                  {isFetchingMusic && (
                    <span className="flex items-center gap-1 text-rose-400 text-[10px]">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Şarkı bilgisi alınıyor...</span>
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={musicUrl}
                    onChange={(e) => handleMusicUrlChange(e.target.value)}
                    placeholder="https://music.youtube.com/watch?v=..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono pr-8"
                  />
                  {musicUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setMusicUrl("");
                        setMusicTitle("");
                        setMusicArtist("");
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* YouTube Canlı Önizleme Oynatıcısı (Telefonda ve Masaüstünde Sorunsuz Ses) */}
              {extractedVideoId && (
                <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-lg border border-slate-700 bg-black mt-1">
                  <iframe
                    key={`preview-${extractedVideoId}-${musicStart}`}
                    src={`https://www.youtube.com/embed/${extractedVideoId}?enablejsapi=1&start=${musicStart}&playsinline=1&controls=1&modestbranding=1&rel=0&origin=${
                      typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : ""
                    }`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                    title="YouTube Preview Player"
                  />
                </div>
              )}

              {/* Tespit Edilen Şarkı Bilgisi */}
              {(musicTitle || extractedVideoId) && (
                <div className="bg-slate-900 border border-rose-500/30 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-inner">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center text-white flex-shrink-0">
                      <Music className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {musicTitle || "YouTube Parçası"}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {musicArtist || "YouTube"}
                      </div>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full flex-shrink-0">
                    {formatTimeSeconds(musicStart)} - {formatTimeSeconds(musicEnd)}
                  </span>
                </div>
              )}

              {/* Hikaye Oynatma Süresi Seçici */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1">
                  <span>Hikaye Oynatma Süresi:</span>
                  <span className="text-pink-400 font-bold">{durationSeconds} saniye</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {[5, 10, 15, 30].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => handleDurationChange(sec)}
                      className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-all ${
                        durationSeconds === sec
                          ? "bg-pink-600 text-white shadow-md shadow-pink-600/30"
                          : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>

              {/* Müzik Aralığı ve Slider (Start / End) */}
              <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1.5">
                  <span className="flex items-center gap-1">
                    <Sliders className="w-3 h-3 text-rose-400" />
                    Müzik Başlangıç Saniyesi:
                  </span>
                  <span className="text-rose-400 font-mono font-bold">
                    {formatTimeSeconds(musicStart)} - {formatTimeSeconds(musicEnd)}
                  </span>
                </div>

                <input
                  type="range"
                  min={0}
                  max={300}
                  step={1}
                  value={musicStart}
                  onChange={(e) => handleStartChange(parseInt(e.target.value) || 0)}
                  className="w-full accent-rose-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                />

                <div className="flex items-center justify-between text-[9px] text-slate-400 mt-1">
                  <span>00:00 (Başı)</span>
                  <span>02:30</span>
                  <span>05:00</span>
                </div>
              </div>

              {/* Hazır Popüler Parçalar */}
              <div>
                <span className="text-[10px] text-slate-400 font-semibold block mb-1">
                  Veya Popüler Şarkılardan Seç:
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  {MUSIC_PRESETS.map((m, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setMusicTitle(m.title);
                        setMusicArtist(m.artist);
                        setMusicUrl(m.url);
                      }}
                      className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-600/20 hover:border-rose-500/40 border border-slate-700 text-[10px] text-slate-300 hover:text-white transition-all text-left"
                    >
                      🎵 {m.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Araç İkonları */}
          <div className="flex items-center justify-between px-1 gap-1 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5">
              {/* Fotoğraf / Video Dosyası Seç */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`p-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  mode === "media" && (mediaFile || mediaPreview)
                    ? "bg-pink-500/20 text-pink-400 border-pink-500/40"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:text-white"
                }`}
                title="Galeriden Seç"
              >
                <ImageIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Galeri</span>
              </button>

              {/* Kamera ile Çek */}
              <button
                type="button"
                onClick={() => startCamera("user")}
                title="Kamera ile Çek"
                className={`p-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  isCameraActive
                    ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:text-white"
                }`}
              >
                <Camera className="w-4 h-4" />
                <span className="hidden sm:inline">Kamera</span>
              </button>

              {/* Yazı Ekle Butonu */}
              <button
                type="button"
                onClick={() => handleOpenTextEditor()}
                title="Yazı Ekle"
                className={`p-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  textStickers.length > 0
                    ? "bg-pink-500/20 text-pink-400 border-pink-500/40"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:text-white"
                }`}
              >
                <Type className="w-4 h-4" />
                <span className="hidden sm:inline">Yazı</span>
              </button>

              {/* Renkli Zemin Modu */}
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setMode("text");
                  setMediaFile(null);
                  setMediaPreview("");
                }}
                className={`p-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  mode === "text"
                    ? "bg-pink-500/20 text-pink-400 border-pink-500/40"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:text-white"
                }`}
                title="Renkli Zemin"
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">Zemin</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Medya Düzenleme Araçları (Döndür, Boyutlandır, Izgara) */}
              {mode === "media" && mediaPreview && !isCameraActive && (
                <>
                  <button
                    type="button"
                    onClick={() => setRotation((prev) => (prev + 90) % 360)}
                    title="90° Döndür"
                    className="p-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white transition-all cursor-pointer"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomScale((prev) => (prev === 1 ? 1.25 : prev === 1.25 ? 1.5 : prev === 1.5 ? 2 : 1))}
                    title={`Yakınlaştır (${zoomScale}x)`}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                      zoomScale > 1
                        ? "bg-pink-500/20 text-pink-400 border-pink-500/40"
                        : "border-slate-700 bg-slate-800 text-slate-300 hover:text-white"
                    }`}
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCropGrid((prev) => !prev)}
                    title="9:16 Kılavuz Çizgileri"
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                      showCropGrid
                        ? "bg-pink-500/20 text-pink-400 border-pink-500/40"
                        : "border-slate-700 bg-slate-800 text-slate-300 hover:text-white"
                    }`}
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                </>
              )}

              {/* Müzik Ekle (YouTube Music) */}
              <button
                type="button"
                onClick={() => setIsMusicPickerOpen(!isMusicPickerOpen)}
                title="YouTube Music Ekle"
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                  musicTitle || musicUrl
                    ? "bg-rose-500/20 text-rose-400 border-rose-500/40 ring-1 ring-rose-500/50"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:text-white"
                }`}
              >
                <Music className="w-4 h-4" />
              </button>

              {/* Çıkartma & Emoji Ekle */}
              <button
                type="button"
                onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
                title="Kalp & Gülücük Çıkartması Ekle"
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                  emojiStickers.length > 0
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:text-white"
                }`}
              >
                <Smile className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Metin Modu için Renk Paleti */}
          {mode === "text" && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {GRADIENT_PRESETS.map((grad, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedGradient(grad)}
                  className={`w-7 h-7 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center flex-shrink-0 transition-transform ${
                    selectedGradient === grad ? "scale-110 ring-2 ring-white" : ""
                  }`}
                >
                  {selectedGradient === grad && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
              ))}
            </div>
          )}

          {/* Medya Modu için Altyazı Girişi */}
          {mode === "media" && (
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Hikayene bir başlık ekle..."
              maxLength={120}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-500 transition-colors"
            />
          )}

          {/* Hedef Kitle Seçimi: Herkes vs Yakın Arkadaşlar */}
          <div className="flex items-center justify-between px-1 py-0.5">
            <span className="text-[11px] text-slate-400 font-medium">Hedef Kitle:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAudience("everyone")}
                className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  audience === "everyone"
                    ? "bg-slate-700 text-white ring-1 ring-white/30"
                    : "bg-slate-900/60 text-slate-400 hover:text-white"
                }`}
              >
                <Users className="w-3.5 h-3.5 text-pink-400" />
                <span>Herkes</span>
              </button>
              <button
                type="button"
                onClick={() => setAudience("close_friends")}
                className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  audience === "close_friends"
                    ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50"
                    : "bg-slate-900/60 text-slate-400 hover:text-emerald-400"
                }`}
              >
                <Star className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                <span>Yakın Arkadaşlar</span>
              </button>
            </div>
          </div>

          {/* 4. PAYLAŞ VEYA GÜNCELLE BUTONU */}
          <button
            type="button"
            onClick={handlePublish}
            disabled={isSubmitting || (mode === "media" && !mediaFile && !mediaPreview && !caption && textStickers.length === 0 && emojiStickers.length === 0)}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 hover:opacity-95 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-pink-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{editingStory ? "Değişiklikler Kaydediliyor..." : "Hikaye Yayınlanıyor..."}</span>
              </>
            ) : (
              <>
                {editingStory ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Değişiklikleri Kaydet ({durationSeconds} sn)</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Hikayede Paylaş ({durationSeconds} sn)</span>
                  </>
                )}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
