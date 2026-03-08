import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CallStatus = "idle" | "calling" | "ringing" | "active" | "ended";
export type CallType = "audio" | "video";

interface UseWebRTCOptions {
  currentUserId: string;
  onCallEnded?: () => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export function useWebRTC({ currentUserId, onCallEnded }: UseWebRTCOptions) {
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [callType, setCallType] = useState<CallType>("audio");
  const [callId, setCallId] = useState<string | null>(null);
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream>(new MediaStream());
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  const cleanup = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current = null;
    }
    remoteStreamRef.current = new MediaStream();
    setCallDuration(0);
    setIsMuted(false);
    setIsVideoOff(false);
  }, []);

  const setupSignalingChannel = useCallback(
    (cId: string) => {
      const channel = supabase.channel(`call:${cId}`, {
        config: { broadcast: { self: false } },
      });

      channel
        .on("broadcast", { event: "offer" }, async ({ payload }) => {
          if (!pcRef.current) return;
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          channel.send({ type: "broadcast", event: "answer", payload: { sdp: answer } });
        })
        .on("broadcast", { event: "answer" }, async ({ payload }) => {
          if (!pcRef.current) return;
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        })
        .on("broadcast", { event: "ice-candidate" }, async ({ payload }) => {
          if (!pcRef.current) return;
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch {}
        })
        .on("broadcast", { event: "hang-up" }, () => {
          endCall();
        })
        .subscribe();

      channelRef.current = channel;
      return channel;
    },
    []
  );

  const getMediaStream = useCallback(async (type: CallType) => {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: type === "video" ? { width: 640, height: 480, facingMode: "user" } : false,
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  }, []);

  const createPeerConnection = useCallback((channel: ReturnType<typeof supabase.channel>) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        channel.send({
          type: "broadcast",
          event: "ice-candidate",
          payload: { candidate: event.candidate.toJSON() },
        });
      }
    };

    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        remoteStreamRef.current.addTrack(track);
      });
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCallStatus("active");
        // Start duration timer
        durationTimerRef.current = setInterval(() => {
          setCallDuration((d) => d + 1);
        }, 1000);
        // Update DB
        if (callId) {
          supabase
            .from("calls")
            .update({ status: "active", started_at: new Date().toISOString() } as any)
            .eq("id", callId)
            .then(() => {});
        }
      }
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        endCall();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [callId]);

  // Start an outgoing call
  const startCall = useCallback(
    async (roomId: string, targetUserId: string, type: CallType) => {
      try {
        setCallType(type);
        setRemoteUserId(targetUserId);
        setCallStatus("calling");

        // Create call record
        const { data: callData, error } = await supabase
          .from("calls")
          .insert({
            room_id: roomId,
            caller_id: currentUserId,
            callee_id: targetUserId,
            call_type: type,
            status: "ringing",
          } as any)
          .select()
          .single();

        if (error || !callData) throw new Error("Failed to create call");
        const cId = (callData as any).id;
        setCallId(cId);

        // Get media
        const stream = await getMediaStream(type);
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        // Setup signaling
        const channel = setupSignalingChannel(cId);

        // Create peer connection
        const pc = createPeerConnection(channel);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        channel.send({ type: "broadcast", event: "offer", payload: { sdp: offer } });

        // Auto-end if no answer in 30s
        setTimeout(() => {
          if (pcRef.current?.connectionState !== "connected") {
            if (callStatus === "calling") {
              endCall("missed");
            }
          }
        }, 30000);
      } catch (err) {
        console.error("startCall error:", err);
        cleanup();
        setCallStatus("idle");
        throw err;
      }
    },
    [currentUserId, getMediaStream, setupSignalingChannel, createPeerConnection, cleanup]
  );

  // Answer an incoming call
  const answerCall = useCallback(
    async (cId: string, type: CallType) => {
      try {
        setCallId(cId);
        setCallType(type);
        setCallStatus("active");

        // Get media
        const stream = await getMediaStream(type);
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        // Setup signaling
        const channel = setupSignalingChannel(cId);

        // Create peer connection
        const pc = createPeerConnection(channel);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // Update call status
        await supabase
          .from("calls")
          .update({ status: "active", started_at: new Date().toISOString() } as any)
          .eq("id", cId);
      } catch (err) {
        console.error("answerCall error:", err);
        cleanup();
        setCallStatus("idle");
        throw err;
      }
    },
    [getMediaStream, setupSignalingChannel, createPeerConnection, cleanup]
  );

  // End the call
  const endCall = useCallback(
    async (reason: string = "ended") => {
      if (callId) {
        await supabase
          .from("calls")
          .update({ status: reason, ended_at: new Date().toISOString() } as any)
          .eq("id", callId);
      }
      if (channelRef.current) {
        channelRef.current.send({ type: "broadcast", event: "hang-up", payload: {} });
      }
      cleanup();
      setCallStatus("ended");
      setCallId(null);
      setRemoteUserId(null);
      onCallEnded?.();
      // Reset to idle after brief delay
      setTimeout(() => setCallStatus("idle"), 1500);
    },
    [callId, cleanup, onCallEnded]
  );

  // Reject incoming call
  const rejectCall = useCallback(
    async (cId: string) => {
      await supabase
        .from("calls")
        .update({ status: "rejected", ended_at: new Date().toISOString() } as any)
        .eq("id", cId);
      const channel = supabase.channel(`call:${cId}`);
      channel.send({ type: "broadcast", event: "hang-up", payload: {} });
      supabase.removeChannel(channel);
      setCallStatus("idle");
    },
    []
  );

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    callStatus,
    callType,
    callId,
    remoteUserId,
    isMuted,
    isVideoOff,
    callDuration,
    localVideoRef,
    remoteVideoRef,
    remoteStream: remoteStreamRef.current,
    startCall,
    answerCall,
    endCall,
    rejectCall,
    toggleMute,
    toggleVideo,
  };
}
