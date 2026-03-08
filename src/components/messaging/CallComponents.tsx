import { useEffect, useRef, useCallback, useState } from "react";
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  SwitchCamera,
  MonitorUp,
  MonitorOff,
  Minimize2,
  Maximize2,
  Signal,
  SignalLow,
  SignalMedium,
  SignalZero,
} from "lucide-react";
import type { CallStatus, CallType } from "@/hooks/useWebRTC";
import type { UserProfile } from "@/lib/messaging";
import { playRingtone, playDialTone, playCallEnd, stopAllSounds } from "@/lib/callSounds";

/* ─── Call Quality Indicator ─── */
type QualityLevel = "excellent" | "good" | "fair" | "poor" | "unknown";

function CallQualityBadge({ quality }: { quality: QualityLevel }) {
  const config: Record<QualityLevel, { icon: typeof Signal; color: string; label: string }> = {
    excellent: { icon: Signal, color: "text-green-500", label: "Excellent" },
    good: { icon: SignalMedium, color: "text-green-400", label: "Good" },
    fair: { icon: SignalLow, color: "text-yellow-500", label: "Fair" },
    poor: { icon: SignalZero, color: "text-destructive", label: "Poor" },
    unknown: { icon: SignalLow, color: "text-muted-foreground", label: "" },
  };
  const { icon: Icon, color, label } = config[quality];
  if (quality === "unknown") return null;
  return (
    <div className="flex items-center gap-1" title={`Connection: ${label}`}>
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      <span className={`text-[10px] font-mono ${color}`}>{label}</span>
    </div>
  );
}

/* ─── Incoming Call Ring ─── */
interface IncomingCallDialogProps {
  callerProfile: UserProfile | null;
  callType: CallType;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallDialog({ callerProfile, callType, onAccept, onReject }: IncomingCallDialogProps) {
  const name = callerProfile?.display_name || callerProfile?.username || "Unknown";
  const avatar = callerProfile?.avatar_url;

  useEffect(() => {
    playRingtone();
    return () => stopAllSounds();
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center gap-6 shadow-2xl w-[320px] animate-in fade-in zoom-in-95">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-secondary border-2 border-primary/30 flex items-center justify-center overflow-hidden animate-pulse">
            {avatar ? (
              <img src={avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold font-mono text-foreground">
                {name[0].toUpperCase()}
              </span>
            )}
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            {callType === "video" ? (
              <Video className="w-4 h-4 text-primary-foreground" />
            ) : (
              <Phone className="w-4 h-4 text-primary-foreground" />
            )}
          </div>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold font-mono text-foreground">{name}</p>
          <p className="text-xs text-muted-foreground mt-1">Incoming {callType} call...</p>
        </div>
        <div className="flex items-center gap-6">
          <button
            onClick={() => { stopAllSounds(); onReject(); }}
            className="w-14 h-14 rounded-full bg-destructive flex items-center justify-center text-destructive-foreground hover:bg-destructive/90 transition-colors shadow-lg"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
          <button
            onClick={() => { stopAllSounds(); onAccept(); }}
            className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center text-white hover:bg-green-600 transition-colors shadow-lg animate-bounce"
          >
            <Phone className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Active Call Screen (supports PiP mode) ─── */
interface CallScreenProps {
  callStatus: CallStatus;
  callType: CallType;
  remoteProfile: UserProfile | null;
  isMuted: boolean;
  isVideoOff: boolean;
  callDuration: number;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  remoteStream: MediaStream;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onEndCall: () => void;
  onFlipCamera?: () => void;
  onToggleScreenShare?: () => void;
  isScreenSharing?: boolean;
  connectionQuality?: QualityLevel;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function CallScreen({
  callStatus,
  callType,
  remoteProfile,
  isMuted,
  isVideoOff,
  callDuration,
  localVideoRef,
  remoteVideoRef,
  remoteStream,
  onToggleMute,
  onToggleVideo,
  onEndCall,
  onFlipCamera,
  onToggleScreenShare,
  isScreenSharing = false,
  connectionQuality = "unknown",
}: CallScreenProps) {
  const [isPiP, setIsPiP] = useState(false);
  const name = remoteProfile?.display_name || remoteProfile?.username || "Unknown";
  const avatar = remoteProfile?.avatar_url;

  useEffect(() => {
    if (callStatus === "calling") {
      playDialTone();
    } else {
      stopAllSounds();
    }
    if (callStatus === "ended") {
      playCallEnd();
    }
    return () => stopAllSounds();
  }, [callStatus]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, remoteVideoRef]);

  const statusLabel = callStatus === "calling" ? "Calling..." : callStatus === "ringing" ? "Ringing..." : callStatus === "active" ? formatDuration(callDuration) : "Call ended";

  /* ─── PiP (minimized) mode ─── */
  if (isPiP) {
    return (
      <div className="fixed bottom-4 right-4 z-[100] w-72 sm:w-80 rounded-2xl overflow-hidden shadow-2xl border border-border bg-card animate-in slide-in-from-bottom-4 fade-in">
        {/* Mini video or avatar */}
        <div className="relative h-40 bg-muted/30 flex items-center justify-center">
          {callType === "video" && callStatus === "active" ? (
            <>
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <div className="absolute bottom-2 right-2 w-16 h-12 rounded-lg overflow-hidden border border-border bg-background">
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className={`w-14 h-14 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden ${callStatus === "calling" ? "animate-pulse" : ""}`}>
                {avatar ? (
                  <img src={avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl font-bold font-mono text-foreground">{name[0].toUpperCase()}</span>
                )}
              </div>
              <p className="text-xs font-mono text-foreground">{name}</p>
              <audio ref={remoteVideoRef as any} autoPlay playsInline className="hidden" />
            </div>
          )}
          {/* Status overlay */}
          <div className="absolute top-2 left-2 flex items-center gap-2">
            <span className="text-[10px] font-mono text-foreground bg-background/70 backdrop-blur-sm px-2 py-0.5 rounded-full">
              {statusLabel}
            </span>
            <CallQualityBadge quality={connectionQuality} />
          </div>
          {/* Expand button */}
          <button
            onClick={() => setIsPiP(false)}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/70 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background/90 transition-colors"
            title="Expand"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* Mini controls */}
        <div className="flex items-center justify-center gap-3 px-3 py-2.5 bg-card">
          <button
            onClick={onToggleMute}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
              isMuted ? "bg-destructive/20 text-destructive" : "bg-secondary text-foreground"
            }`}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          {callType === "video" && (
            <button
              onClick={onToggleVideo}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                isVideoOff ? "bg-destructive/20 text-destructive" : "bg-secondary text-foreground"
              }`}
            >
              {isVideoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={() => { stopAllSounds(); onEndCall(); }}
            className="w-10 h-10 rounded-full bg-destructive flex items-center justify-center text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  /* ─── Full-screen mode ─── */
  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Main area */}
      <div className="flex-1 relative flex items-center justify-center bg-muted/30">
        {callType === "video" && callStatus === "active" ? (
          <>
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute bottom-4 right-4 w-32 h-24 sm:w-40 sm:h-30 rounded-xl overflow-hidden border-2 border-border shadow-lg bg-background">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" style={{ transform: "scaleX(-1)" }} />
              {isVideoOff && (
                <div className="absolute inset-0 bg-background flex items-center justify-center">
                  <VideoOff className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className={`w-28 h-28 rounded-full bg-secondary border-2 border-border flex items-center justify-center overflow-hidden ${callStatus === "calling" ? "animate-pulse" : ""}`}>
              {avatar ? (
                <img src={avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl font-bold font-mono text-foreground">{name[0].toUpperCase()}</span>
              )}
            </div>
            <p className="text-lg font-semibold font-mono text-foreground">{name}</p>
            <p className="text-sm text-muted-foreground font-mono">{statusLabel}</p>
            <audio ref={remoteVideoRef as any} autoPlay playsInline className="hidden" />
          </div>
        )}

        {/* Top bar: PiP button + quality */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
          <CallQualityBadge quality={connectionQuality} />
          <button
            onClick={() => setIsPiP(true)}
            className="w-9 h-9 rounded-full bg-background/50 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background/70 transition-colors"
            title="Minimize"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Controls bar */}
      <div className="bg-card border-t border-border px-6 py-4 flex items-center justify-center gap-4">
        <button
          onClick={onToggleMute}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            isMuted ? "bg-destructive/20 text-destructive" : "bg-secondary text-foreground hover:bg-secondary/80"
          }`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {callType === "video" && (
          <>
            <button
              onClick={onToggleVideo}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                isVideoOff ? "bg-destructive/20 text-destructive" : "bg-secondary text-foreground hover:bg-secondary/80"
              }`}
              title={isVideoOff ? "Turn on camera" : "Turn off camera"}
            >
              {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>
            {onFlipCamera && (
              <button
                onClick={onFlipCamera}
                className="w-12 h-12 rounded-full flex items-center justify-center bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                title="Switch camera"
              >
                <SwitchCamera className="w-5 h-5" />
              </button>
            )}
          </>
        )}

        {callType === "video" && onToggleScreenShare && (
          <button
            onClick={onToggleScreenShare}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              isScreenSharing ? "bg-primary/20 text-primary" : "bg-secondary text-foreground hover:bg-secondary/80"
            }`}
            title={isScreenSharing ? "Stop sharing" : "Share screen"}
          >
            {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <MonitorUp className="w-5 h-5" />}
          </button>
        )}

        <button
          onClick={() => { stopAllSounds(); onEndCall(); }}
          className="w-14 h-14 rounded-full bg-destructive flex items-center justify-center text-destructive-foreground hover:bg-destructive/90 transition-colors shadow-lg"
          title="End call"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
