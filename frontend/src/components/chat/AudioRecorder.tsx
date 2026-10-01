"use client";

import { useState, useRef, useEffect } from "react";
import { Trash2, Send, Mic, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useChatStore } from "@/store/useChatStore";
import { useSettingsStore } from "@/store/useSettingsStore";

interface Props {
  conversationId: string;
  onCancel: () => void;
  onComplete: () => void;
}

export default function AudioRecorder({ conversationId, onCancel, onComplete }: Props) {
  const sendMediaMessage = useChatStore((state) => state.sendMediaMessage);
  const maxVoiceSeconds = useSettingsStore(
    (state) => state.settings?.media_limits?.max_voice_seconds || 300
  );

  const [seconds, setSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");
  const extRef = useRef<string>("webm");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const peaksRef = useRef<number[]>([]);
  const peakIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    startRecording();

    return () => {
      stopTracks();
      if (timerRef.current) clearInterval(timerRef.current);
      if (peakIntervalRef.current) clearInterval(peakIntervalRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const stopTracks = () => {
    if (peakIntervalRef.current) {
      clearInterval(peakIntervalRef.current);
      peakIntervalRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startRecording = async () => {
    setError(null);
    audioChunksRef.current = [];
    peaksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 5.2 Düzeltmesi: Web Audio API ile gerçek zamanlı mikrofon ses seviyelerini örnekle
      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          const actx = new AudioCtxClass();
          audioCtxRef.current = actx;
          const analyser = actx.createAnalyser();
          analyser.fftSize = 128;
          analyserRef.current = analyser;
          const src = actx.createMediaStreamSource(stream);
          src.connect(analyser);

          const dataArr = new Uint8Array(analyser.frequencyBinCount);
          peakIntervalRef.current = setInterval(() => {
            if (analyserRef.current) {
              analyserRef.current.getByteFrequencyData(dataArr);
              let sum = 0;
              for (let i = 0; i < dataArr.length; i++) {
                sum += dataArr[i];
              }
              const avg = sum / dataArr.length;
              const normalized = Math.min(Math.max(avg / 128, 0.08), 1.0);
              peaksRef.current.push(Number(normalized.toFixed(2)));
            }
          }, 100);
        }
      } catch (e) {
        console.warn("AudioContext dalga formu analizi başlatılamadı:", e);
      }

      let chosenMimeType = "";
      let chosenExt = "webm";

      const isIOS =
        typeof navigator !== "undefined" &&
        (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

      if (typeof MediaRecorder !== "undefined") {
        if (isIOS && MediaRecorder.isTypeSupported("audio/mp4")) {
          chosenMimeType = "audio/mp4";
          chosenExt = "mp4";
        } else if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          chosenMimeType = "audio/webm;codecs=opus";
          chosenExt = "webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          chosenMimeType = "audio/mp4";
          chosenExt = "mp4";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          chosenMimeType = "audio/webm";
          chosenExt = "webm";
        } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
          chosenMimeType = "audio/ogg;codecs=opus";
          chosenExt = "ogg";
        }
      }

      mimeTypeRef.current = chosenMimeType;
      extRef.current = chosenExt;

      const recorder = chosenMimeType
        ? new MediaRecorder(stream, { mimeType: chosenMimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(100);
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setSeconds((prev) => {
          if (prev + 1 >= maxVoiceSeconds) {
            return maxVoiceSeconds;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error("Mikrofon erişim hatası:", err);
      setError("Mikrofon izni alınamadı.");
    }
  };

  const handleCancel = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    stopTracks();
    audioChunksRef.current = [];
    peaksRef.current = [];
    setIsRecording(false);
    onCancel();
  };

  const handleSend = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;

    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    setIsUploading(true);

    mediaRecorderRef.current.onstop = async () => {
      stopTracks();
      const mime = mimeTypeRef.current || "audio/webm";
      const ext = extRef.current || "webm";
      const recordedBlob = new Blob(audioChunksRef.current, { type: mime });

      if (recordedBlob.size < 100) {
        onCancel();
        return;
      }

      // 5.2 Düzeltmesi: Gerçek zamanlı toplanan ses dalga formunu örnekle ve ekle
      const rawPeaks = peaksRef.current;
      const targetCount = 36;
      let finalWaveform: number[] = [];
      if (rawPeaks.length <= targetCount) {
        finalWaveform = rawPeaks.length > 0 ? rawPeaks : [0.2, 0.4, 0.6, 0.3, 0.5];
      } else {
        const step = rawPeaks.length / targetCount;
        for (let i = 0; i < targetCount; i++) {
          const idx = Math.min(Math.floor(i * step), rawPeaks.length - 1);
          finalWaveform.push(rawPeaks[idx]);
        }
      }

      try {
        const formData = new FormData();
        formData.append("file", recordedBlob, `voice_message.${ext}`);
        formData.append("category", "voice");
        formData.append("duration", seconds.toString());
        formData.append("waveform", JSON.stringify(finalWaveform));

        const res = await api.post("/media/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        const { media_url, metadata } = res.data;

        sendMediaMessage(conversationId, media_url, "voice", metadata);
        onComplete();
      } catch (err: any) {
        console.error("Sesli mesaj yüklenemedi:", err);
        setError(err.response?.data?.error || "Sesli mesaj gönderilemedi.");
        setIsUploading(false);
      }
    };

    mediaRecorderRef.current.stop();
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-between bg-slate-900/90 border border-rose-500/40 rounded-2xl py-2 px-4 text-xs text-rose-400">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
        <button
          onClick={handleCancel}
          className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 font-semibold cursor-pointer"
        >
          Kapat
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-between bg-slate-900/90 border border-grupo-dark-border rounded-2xl py-2 px-4 shadow-inner animate-in fade-in duration-150">
      {/* İptal Butonu */}
      <button
        type="button"
        onClick={handleCancel}
        disabled={isUploading}
        title="Kaydı İptal Et"
        className="w-9 h-9 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* Kayıt Göstergesi ve Sayaç */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center">
          <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping absolute"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 relative"></span>
        </div>
        <span className="text-sm font-mono font-medium text-white tracking-wider">
          {formatTimer(seconds)}
        </span>
        <span className="text-xs text-slate-400 hidden sm:inline">Ses kaydediliyor...</span>
      </div>

      {/* Gönder Butonu */}
      <button
        type="button"
        onClick={handleSend}
        disabled={isUploading}
        title="Sesli Mesajı Gönder"
        style={{
          backgroundColor: "var(--accent, #E91E63)",
          color: "var(--accent-text, #ffffff)",
          boxShadow: "0 4px 12px var(--accent-shadow, rgba(233, 30, 99, 0.35))",
        }}
        className="w-9 h-9 rounded-xl hover:brightness-110 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer disabled:opacity-50"
      >
        {isUploading ? (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}
