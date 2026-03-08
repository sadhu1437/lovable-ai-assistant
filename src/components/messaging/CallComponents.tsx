import { useEffect, useRef, useCallback, useState } from "react";
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  SwitchCamera,
} from "lucide-react";
import type { CallStatus, CallType } from "@/hooks/useWebRTC";
import type { UserProfile } from "@/lib/messaging";
import { playRingtone, playDialTone, playCallEnd, stopAllSounds } from "@/lib/callSounds";

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

  // Play ringtone on mount
  useEffect(() => {
    playRingtone();
    return () => stopAllSounds();
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center gap-6 shadow-2xl w-[320px] animate-in fade-in zoom-in-95">
        {/* Avatar */}
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

        {/* Info */}
        <div className="text-center">
          <p className="text-base font-semibold font-mono text-foreground">{name}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Incoming {callType} call...
          </p>
        </div>

        {/* Actions */}
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

/* ─── Active Call Screen ─── */
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
}: CallScreenProps) {
  const name = remoteProfile?.display_name || remoteProfile?.username || "Unknown";
  const avatar = remoteProfile?.avatar_url;

  // Play dial tone when calling, stop when connected or ended
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

  // Attach remote stream to video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, remoteVideoRef]);

  const statusLabel = callStatus === "calling" ? "Calling..." : callStatus === "ringing" ? "Ringing..." : callStatus === "active" ? formatDuration(callDuration) : "Call ended";

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Main area */}
      <div className="flex-1 relative flex items-center justify-center bg-muted/30">
        {callType === "video" && callStatus === "active" ? (
          <>
            {/* Remote video (full screen) */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            {/* Local video (picture-in-picture) */}
            <div className="absolute bottom-4 right-4 w-32 h-24 sm:w-40 sm:h-30 rounded-xl overflow-hidden border-2 border-border shadow-lg bg-background">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover mirror"
                style={{ transform: "scaleX(-1)" }}
              />
              {isVideoOff && (
                <div className="absolute inset-0 bg-background flex items-center justify-center">
                  <VideoOff className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
            </div>
          </>
        ) : (
          /* Audio-only or calling state */
          <div className="flex flex-col items-center gap-4">
            <div className={`w-28 h-28 rounded-full bg-secondary border-2 border-border flex items-center justify-center overflow-hidden ${callStatus === "calling" ? "animate-pulse" : ""}`}>
              {avatar ? (
                <img src={avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl font-bold font-mono text-foreground">
                  {name[0].toUpperCase()}
                </span>
              )}
            </div>
            <p className="text-lg font-semibold font-mono text-foreground">{name}</p>
            <p className="text-sm text-muted-foreground font-mono">{statusLabel}</p>
            {/* Hidden audio elements */}
            <audio ref={remoteVideoRef as any} autoPlay playsInline className="hidden" />
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="bg-card border-t border-border px-6 py-4 flex items-center justify-center gap-4">
        {/* Mute */}
        <button
          onClick={onToggleMute}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            isMuted
              ? "bg-destructive/20 text-destructive"
              : "bg-secondary text-foreground hover:bg-secondary/80"
          }`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Toggle video (only for video calls) */}
        {callType === "video" && (
          <>
            <button
              onClick={onToggleVideo}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                isVideoOff
                  ? "bg-destructive/20 text-destructive"
                  : "bg-secondary text-foreground hover:bg-secondary/80"
              }`}
              title={isVideoOff ? "Turn on camera" : "Turn off camera"}
            >
              {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>

            {/* Flip camera (front/back) */}
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

        {/* End call */}
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
