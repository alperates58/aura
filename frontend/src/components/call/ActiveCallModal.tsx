"use client";

import { useEffect, useState, useRef } from "react";
import { useCallStore, resolveLivekitUrl } from "@/store/useCallStore";
import { soundEffects } from "@/lib/sounds";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  useRoomContext,
  VideoTrack,
  isTrackReference,
} from "@livekit/components-react";
import { Track, RoomEvent } from "livekit-client";
import {
  PhoneOff,
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  Phone,
  Clock,
  Sparkles,
  Monitor,
  MonitorOff,
  Minimize2,
  Maximize2,
} from "lucide-react";

export default function ActiveCallModal() {
  const {
    callState,
    callType,
    token,
    livekitUrl,
    caller,
    endCall,
    isPiPMinimized,
    setPiPMinimized,
  } = useCallStore();

  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Arama ekranı açıldığında zili kesin olarak durdur
  useEffect(() => {
    soundEffects.stopRingtone();
  }, []);

  useEffect(() => {
    if (callState === "connected") {
      soundEffects.stopRingtone();
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => {
          const next = prev + 1;
          useCallStore.setState({ duration: next });
          return next;
        });
      }, 1000);
    } else {
      setCallDuration(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  if (callState !== "outgoing" && callState !== "connected") {
    return null;
  }

  const formatDuration = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handleEndCall = async () => {
    soundEffects.stopRingtone();
    await endCall();
  };

  const activeLivekitUrl = resolveLivekitUrl(livekitUrl);

  // Aranıyor Ekranı (Outgoing Call)
  if (callState === "outgoing") {
    return (
      <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in select-none">
        <div className="w-full max-w-sm bg-grupo-dark-card border border-grupo-dark-border rounded-3xl p-8 flex flex-col items-center text-center shadow-2xl relative">
          <div className="relative mb-6">
            <div className="w-24 h-24 rounded-full bg-slate-800 border-2 border-pink-500/60 flex items-center justify-center font-bold text-3xl text-pink-400 overflow-hidden shadow-2xl relative z-10">
              {caller?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={caller.avatar_url}
                  alt={caller.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Phone className="w-10 h-10 animate-pulse text-pink-400" />
              )}
            </div>
            <span className="absolute inset-0 rounded-full bg-pink-500/30 animate-ping" />
          </div>

          <h3 className="text-xl font-bold text-white mb-1">
            {caller?.display_name || "Arama Yapılıyor..."}
          </h3>
          <p className="text-xs text-slate-400 mb-8">
            {callType === "video" ? "Görüntülü Görüşme" : "Sesli Görüşme"}
          </p>

          <button
            onClick={handleEndCall}
            className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/30 transition-transform hover:scale-110 cursor-pointer"
            title="Aramayı İptal Et"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    );
  }

  // Bağlandı Ekranı (Connected Call)
  if (!token || !activeLivekitUrl) {
    return (
      <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center text-center text-slate-400 gap-3 select-none">
        <Sparkles className="w-8 h-8 text-pink-500 animate-spin" />
        <p className="text-sm">Görüşme odasına bağlanılıyor...</p>
      </div>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={activeLivekitUrl}
      token={token}
      connect={true}
      video={callType === "video"}
      audio={{
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }}
      onError={(err) => {
        console.error("[LiveKit Error]", err);
      }}
      onConnected={() => {
        console.log("[LiveKit Connected] Görüşme odasına bağlanıldı.");
        soundEffects.stopRingtone();
      }}
      onDisconnected={() => {
        console.log("[LiveKit Disconnected] Oda bağlantısı koptu.");
      }}
      className="contents"
    >
      <RoomAudioRenderer />
      <ActiveCallConnectedInterface
        callType={callType}
        caller={caller}
        callDuration={callDuration}
        formatDuration={formatDuration}
        isPiPMinimized={isPiPMinimized}
        setPiPMinimized={setPiPMinimized}
        onEndCall={handleEndCall}
      />
    </LiveKitRoom>
  );
}

interface ActiveCallConnectedInterfaceProps {
  callType: string;
  caller: any;
  callDuration: number;
  formatDuration: (sec: number) => string;
  isPiPMinimized: boolean;
  setPiPMinimized: (val: boolean) => void;
  onEndCall: () => Promise<void>;
}

function ActiveCallConnectedInterface({
  callType,
  caller,
  callDuration,
  formatDuration,
  isPiPMinimized,
  setPiPMinimized,
  onEndCall,
}: ActiveCallConnectedInterfaceProps) {
  const {
    localParticipant,
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
  } = useLocalParticipant();

  const room = useRoomContext();

  // 3.4 Düzeltmesi: Karşı taraf görüşmeden ayrıldığında veya bağlantı koptuğunda aramayı anında sonlandır
  useEffect(() => {
    if (!room) return;

    const handleDisconnect = () => {
      console.log("[LiveKit] Room disconnected, ending call cleanly...");
      onEndCall();
    };

    const handleParticipantDisconnect = (p: any) => {
      console.log("[LiveKit] Participant disconnected:", p.identity);
      onEndCall();
    };

    room.on(RoomEvent.Disconnected, handleDisconnect);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnect);

    return () => {
      room.off(RoomEvent.Disconnected, handleDisconnect);
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnect);
    };
  }, [room, onEndCall]);

  const toggleMic = async () => {
    try {
      if (localParticipant) {
        await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
      }
    } catch (err) {
      console.error("Mikrofon değiştirme hatası:", err);
    }
  };

  const toggleCamera = async () => {
    try {
      if (localParticipant) {
        await localParticipant.setCameraEnabled(!isCameraEnabled);
      }
    } catch (err) {
      console.error("Kamera değiştirme hatası:", err);
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (localParticipant) {
        await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
      }
    } catch (err) {
      console.error("Ekran paylaşımı hatası:", err);
    }
  };

  // PiP (Picture-in-Picture) Minimized Mode
  if (isPiPMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 w-72 sm:w-80 rounded-2xl bg-slate-900/95 border border-slate-700 shadow-2xl p-3 backdrop-blur-xl flex flex-col gap-2.5 animate-in slide-in-from-bottom-5 select-none">
        {/* Header: Title, Duration, Expand */}
        <div className="flex items-center justify-between text-xs text-white">
          <div className="flex items-center gap-1.5 font-medium truncate">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="truncate">{caller?.display_name || "Görüşme"}</span>
            <span className="text-slate-400 font-mono text-[11px] shrink-0">
              ({formatDuration(callDuration)})
            </span>
          </div>
          <button
            onClick={() => setPiPMinimized(false)}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            title="Tam Ekrana Genişlet"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Mini Preview Box */}
        <div className="h-32 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center relative">
          <MiniParticipantView callType={callType} caller={caller} />
        </div>

        {/* Mini Controls */}
        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            onClick={toggleMic}
            className={`p-2 rounded-xl transition cursor-pointer ${
              !isMicrophoneEnabled
                ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
            title={isMicrophoneEnabled ? "Sessize Al" : "Mikrofonu Aç"}
          >
            {isMicrophoneEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>

          {callType === "video" && (
            <button
              onClick={toggleCamera}
              className={`p-2 rounded-xl transition cursor-pointer ${
                !isCameraEnabled
                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                  : "bg-slate-800 text-slate-200 hover:bg-slate-700"
              }`}
              title={isCameraEnabled ? "Kamerayı Kapat" : "Kamerayı Aç"}
            >
              {isCameraEnabled ? (
                <VideoIcon className="w-4 h-4" />
              ) : (
                <VideoOff className="w-4 h-4" />
              )}
            </button>
          )}

          <button
            onClick={toggleScreenShare}
            className={`p-2 rounded-xl transition cursor-pointer ${
              isScreenShareEnabled
                ? "bg-pink-500/20 text-pink-400 border border-pink-500/40"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
            title={isScreenShareEnabled ? "Ekran Paylaşımını Durdur" : "Ekran Paylaş"}
          >
            {isScreenShareEnabled ? (
              <MonitorOff className="w-4 h-4" />
            ) : (
              <Monitor className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={onEndCall}
            className="p-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer ml-1"
            title="Görüşmeyi Bitir"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Tam Ekran Görünümü
  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-between p-4 sm:p-6 select-none animate-in fade-in">
      {/* Üst Bar: Süre, Durum ve Küçült Butonu */}
      <div className="w-full max-w-2xl flex items-center justify-between px-4 py-2 rounded-2xl bg-grupo-dark-card/60 border border-grupo-dark-border backdrop-blur-md z-20">
        <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Canlı Görüşme</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-300 font-mono font-medium">
          <Clock className="w-3.5 h-3.5 text-pink-400" />
          <span>{formatDuration(callDuration)}</span>
        </div>

        <button
          onClick={() => setPiPMinimized(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-300 hover:text-white transition cursor-pointer"
          title="Pencereyi Küçült (PiP)"
        >
          <Minimize2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Küçült</span>
        </button>
      </div>

      {/* Merkez Video / Ses Alanı */}
      <div className="flex-1 w-full max-w-4xl flex items-center justify-center my-4 relative overflow-hidden">
        <CallParticipantView callType={callType} caller={caller} />
      </div>

      {/* Alt Kontrol Barı */}
      <div className="w-full max-w-md flex items-center justify-center gap-3 sm:gap-4 p-4 rounded-3xl bg-grupo-dark-card/80 border border-grupo-dark-border backdrop-blur-md z-20">
        {/* Mikrofon */}
        <button
          onClick={toggleMic}
          title={isMicrophoneEnabled ? "Mikrofonu Kapat" : "Mikrofonu Aç"}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
            !isMicrophoneEnabled
              ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
              : "bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700"
          }`}
        >
          {isMicrophoneEnabled ? (
            <Mic className="w-5 h-5" />
          ) : (
            <MicOff className="w-5 h-5" />
          )}
        </button>

        {/* Kamera */}
        {callType === "video" && (
          <button
            onClick={toggleCamera}
            title={isCameraEnabled ? "Kamerayı Kapat" : "Kamerayı Aç"}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
              !isCameraEnabled
                ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                : "bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700"
            }`}
          >
            {isCameraEnabled ? (
              <VideoIcon className="w-5 h-5" />
            ) : (
              <VideoOff className="w-5 h-5" />
            )}
          </button>
        )}

        {/* Ekran Paylaşımı */}
        <button
          onClick={toggleScreenShare}
          title={isScreenShareEnabled ? "Ekran Paylaşımını Durdur" : "Ekran Paylaş"}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
            isScreenShareEnabled
              ? "bg-pink-500/20 text-pink-400 border border-pink-500/40"
              : "bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700"
          }`}
        >
          {isScreenShareEnabled ? (
            <MonitorOff className="w-5 h-5" />
          ) : (
            <Monitor className="w-5 h-5" />
          )}
        </button>

        {/* Aramayı Bitir Butonu */}
        <button
          onClick={onEndCall}
          title="Görüşmeyi Sonlandır"
          className="w-14 h-12 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/30 transition-all hover:scale-105 cursor-pointer ml-1"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

function CallParticipantView({
  callType,
  caller,
}: {
  callType: string;
  caller: any;
}) {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);

  if (callType === "video" || tracks.some((t) => t.source === Track.Source.ScreenShare)) {
    if (tracks.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center text-center p-8 gap-3">
          <div className="w-24 h-24 rounded-full bg-slate-800 border-2 border-pink-500/50 flex items-center justify-center shadow-xl animate-pulse">
            <VideoIcon className="w-10 h-10 text-pink-400" />
          </div>
          <h3 className="text-lg font-bold text-white">Görüntü Başlatılıyor...</h3>
          <p className="text-xs text-slate-400">Kamera ve medya akışı bağlanıyor</p>
        </div>
      );
    }

    return (
      <div
        className={`grid gap-4 w-full h-full max-h-[70vh] ${
          tracks.length === 1
            ? "grid-cols-1"
            : tracks.length === 2
            ? "grid-cols-1 md:grid-cols-2"
            : "grid-cols-2"
        }`}
      >
        {tracks.map((track) => {
          const isLocal = track.participant.isLocal;
          const isScreen = track.source === Track.Source.ScreenShare;
          const trackKey = `${track.participant.identity}_${track.source}`;
          const hasVideo = isTrackReference(track) && track.publication?.track;

          return (
            <div
              key={trackKey}
              className="relative rounded-2xl overflow-hidden bg-slate-900 border border-grupo-dark-border flex items-center justify-center"
            >
              {hasVideo ? (
                <VideoTrack
                  trackRef={track}
                  className={`w-full h-full object-cover ${
                    isLocal && !isScreen ? "scale-x-[-1]" : ""
                  }`}
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center font-bold text-2xl text-pink-400">
                  {track.participant.name?.charAt(0).toUpperCase() || "U"}
                </div>
              )}
              <div className="absolute bottom-3 left-3 px-3 py-1 rounded-lg bg-black/60 backdrop-blur-md text-xs text-white font-medium flex items-center gap-1.5">
                {isLocal && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                <span>
                  {isScreen
                    ? `Ekran (${isLocal ? "Sen" : track.participant.name || track.participant.identity})`
                    : isLocal
                    ? "Sen"
                    : track.participant.name || track.participant.identity}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Sesli Arama Arayüzü
  return (
    <div className="flex flex-col items-center justify-center text-center p-8">
      <div className="w-32 h-32 rounded-full bg-slate-800 border-4 border-pink-500/50 flex items-center justify-center font-bold text-4xl text-pink-400 overflow-hidden mb-4 shadow-2xl">
        {caller?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={caller.avatar_url}
            alt={caller.display_name}
            className="w-full h-full object-cover"
          />
        ) : (
          caller?.display_name?.charAt(0).toUpperCase() || "U"
        )}
      </div>
      <h3 className="text-xl font-bold text-white mb-1">
        {caller?.display_name || "Görüşme Odası"}
      </h3>
      <p className="text-xs text-emerald-400 font-medium animate-pulse">
        Ses aktarımı aktif
      </p>
    </div>
  );
}

function MiniParticipantView({
  callType,
  caller,
}: {
  callType: string;
  caller: any;
}) {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: false },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);

  // Öncelik: Karşı tarafın ekran paylaşımı veya kamerası, yoksa yerel kamera
  const remoteTrack = tracks.find((t) => !t.participant.isLocal);
  const displayTrack = remoteTrack || tracks[0];

  if (displayTrack && isTrackReference(displayTrack) && displayTrack.publication?.track) {
    const isLocal = displayTrack.participant.isLocal;
    const isScreen = displayTrack.source === Track.Source.ScreenShare;
    return (
      <VideoTrack
        trackRef={displayTrack}
        className={`w-full h-full object-cover ${
          isLocal && !isScreen ? "scale-x-[-1]" : ""
        }`}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center text-center p-2">
      <div className="w-12 h-12 rounded-full bg-slate-800 border-2 border-pink-500/50 flex items-center justify-center font-bold text-lg text-pink-400 overflow-hidden shadow-lg">
        {caller?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={caller.avatar_url}
            alt={caller.display_name}
            className="w-full h-full object-cover"
          />
        ) : (
          caller?.display_name?.charAt(0).toUpperCase() || "U"
        )}
      </div>
      <span className="text-[11px] text-slate-300 font-medium truncate max-w-[150px] mt-1">
        {caller?.display_name || "Görüşme"}
      </span>
    </div>
  );
}
