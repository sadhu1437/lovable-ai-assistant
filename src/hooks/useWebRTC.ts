import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CallStatus = "idle" | "calling" | "ringing" | "active" | "ended";
export type CallType = "audio" | "video";
export type ConnectionQuality = "excellent" | "good" | "fair" | "poor" | "unknown";

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
  const [isGroupCall, setIsGroupCall] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>("unknown");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // For 1:1 calls
  const pcRef = useRef<RTCPeerConnection | null>(null);
  // For group calls — one peer connection per remote user
  const groupPcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream>(new MediaStream());
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const callRowChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const callIdRef = useRef<string | null>(null);
  const hasActivatedRef = useRef(false);
  const isEndingRef = useRef(false);

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
    // Cleanup group peer connections
    groupPcsRef.current.forEach((pc) => pc.close());
    groupPcsRef.current.clear();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (callRowChannelRef.current) {
      supabase.removeChannel(callRowChannelRef.current);
      callRowChannelRef.current = null;
    }

    remoteStreamRef.current = new MediaStream();
    setCallDuration(0);
    setIsMuted(false);
    setIsVideoOff(false);
    setParticipantCount(0);
    callIdRef.current = null;
    pendingOfferRef.current = null;
    channelReadyRef.current = false;
    hasActivatedRef.current = false;
    isEndingRef.current = false;
  }, []);

  const getMediaStream = useCallback(async (type: CallType) => {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: type === "video" ? { width: 640, height: 480, facingMode: "user" } : false,
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  }, []);

  // ───── 1:1 CALL LOGIC ─────

  // Store the latest offer so we can re-send when callee signals ready
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const channelReadyRef = useRef(false);

  const setupSignalingChannel = useCallback(
    (cId: string): Promise<ReturnType<typeof supabase.channel>> => {
      return new Promise((resolve) => {
        const channel = supabase.channel(`call:${cId}`, {
          config: { broadcast: { self: false } },
        });

        channel
          .on("broadcast", { event: "offer" }, async ({ payload }) => {
            if (!pcRef.current) return;
            try {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
              const answer = await pcRef.current.createAnswer();
              await pcRef.current.setLocalDescription(answer);
              channel.send({ type: "broadcast", event: "answer", payload: { sdp: answer } });
            } catch (err) {
              console.error("Error handling offer:", err);
            }
          })
          .on("broadcast", { event: "answer" }, async ({ payload }) => {
            if (!pcRef.current) return;
            try {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            } catch (err) {
              console.error("Error handling answer:", err);
            }
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
          .on("broadcast", { event: "ready" }, () => {
            // Callee is ready — re-send the offer
            if (pendingOfferRef.current) {
              channel.send({ type: "broadcast", event: "offer", payload: { sdp: pendingOfferRef.current } });
            }
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              channelReadyRef.current = true;
              resolve(channel);
            }
          });

        channelRef.current = channel;
      });
    },
    []
  );

  const activateCall = useCallback(() => {
    if (hasActivatedRef.current) return;
    hasActivatedRef.current = true;

    setCallStatus("active");

    if (!durationTimerRef.current) {
      durationTimerRef.current = setInterval(() => {
        setCallDuration((d) => d + 1);
      }, 1000);
    }

    const cId = callIdRef.current;
    if (cId) {
      supabase
        .from("calls")
        .update({ status: "active", started_at: new Date().toISOString() } as any)
        .eq("id", cId)
        .then(() => {});
    }
  }, []);

  const endCallLocalOnly = useCallback(() => {
    cleanup();
    setCallStatus("ended");
    setCallId(null);
    setRemoteUserId(null);
    setIsGroupCall(false);
    onCallEnded?.();
    setTimeout(() => setCallStatus("idle"), 1500);
  }, [cleanup, onCallEnded]);

  const createPeerConnection = useCallback(
    (channel: ReturnType<typeof supabase.channel>) => {
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
          // Avoid duplicates (Safari can re-fire tracks)
          if (!remoteStreamRef.current.getTracks().find((t) => t.id === track.id)) {
            remoteStreamRef.current.addTrack(track);
          }
        });
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStreamRef.current;
        }
        // If media is flowing, we can safely start the timer
        activateCall();
      };

      pc.oniceconnectionstatechange = () => {
        if (["connected", "completed"].includes(pc.iceConnectionState)) {
          activateCall();
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          activateCall();
        }
        if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
          endCall();
        }
      };

      pcRef.current = pc;
      return pc;
    },
    [activateCall]
  );

  // ───── GROUP CALL LOGIC (mesh) ─────

  const setupGroupSignaling = useCallback(
    (cId: string) => {
      const channel = supabase.channel(`group-call:${cId}`, {
        config: { broadcast: { self: false } },
      });

      channel
        .on("broadcast", { event: "join" }, async ({ payload }) => {
          if (payload.userId === currentUserId) return;
          // New participant joined — create peer connection to them
          await createGroupPeer(channel, payload.userId, true);
          setParticipantCount((c) => c + 1);
        })
        .on("broadcast", { event: "offer" }, async ({ payload }) => {
          if (payload.targetUserId !== currentUserId) return;
          await handleGroupOffer(channel, payload);
        })
        .on("broadcast", { event: "answer" }, async ({ payload }) => {
          if (payload.targetUserId !== currentUserId) return;
          const pc = groupPcsRef.current.get(payload.fromUserId);
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          }
        })
        .on("broadcast", { event: "ice-candidate" }, async ({ payload }) => {
          if (payload.targetUserId !== currentUserId) return;
          const pc = groupPcsRef.current.get(payload.fromUserId);
          if (pc) {
            try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch {}
          }
        })
        .on("broadcast", { event: "leave" }, ({ payload }) => {
          const pc = groupPcsRef.current.get(payload.userId);
          if (pc) {
            pc.close();
            groupPcsRef.current.delete(payload.userId);
          }
          setParticipantCount((c) => Math.max(0, c - 1));
        })
        .on("broadcast", { event: "hang-up-all" }, () => {
          endCall();
        })
        .subscribe();

      channelRef.current = channel;
      return channel;
    },
    [currentUserId]
  );

  const createGroupPeer = useCallback(
    async (channel: ReturnType<typeof supabase.channel>, remoteId: string, isInitiator: boolean) => {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          channel.send({
            type: "broadcast",
            event: "ice-candidate",
            payload: { candidate: event.candidate.toJSON(), fromUserId: currentUserId, targetUserId: remoteId },
          });
        }
      };

      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((track) => {
          // Avoid duplicates
          if (!remoteStreamRef.current.getTracks().find(t => t.id === track.id)) {
            remoteStreamRef.current.addTrack(track);
          }
        });
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStreamRef.current;
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setCallStatus("active");
          if (!durationTimerRef.current) {
            durationTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
            if (callIdRef.current) {
              supabase.from("calls").update({ status: "active", started_at: new Date().toISOString() } as any).eq("id", callIdRef.current).then(() => {});
            }
          }
        }
      };

      // Add local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!));
      }

      groupPcsRef.current.set(remoteId, pc);

      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        channel.send({
          type: "broadcast",
          event: "offer",
          payload: { sdp: offer, fromUserId: currentUserId, targetUserId: remoteId },
        });
      }

      return pc;
    },
    [currentUserId]
  );

  const handleGroupOffer = useCallback(
    async (channel: ReturnType<typeof supabase.channel>, payload: any) => {
      const pc = await createGroupPeer(channel, payload.fromUserId, false);
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      channel.send({
        type: "broadcast",
        event: "answer",
        payload: { sdp: answer, fromUserId: currentUserId, targetUserId: payload.fromUserId },
      });
    },
    [createGroupPeer, currentUserId]
  );

  // ───── PUBLIC API ─────

  const subscribeToCallRow = useCallback(
    (cId: string) => {
      if (callRowChannelRef.current) {
        supabase.removeChannel(callRowChannelRef.current);
        callRowChannelRef.current = null;
      }

      const ch = supabase
        .channel(`call-row:${cId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${cId}` },
          (payload) => {
            if (isEndingRef.current) return;
            const call = payload.new as any;
            const status = call?.status as string | undefined;
            if (!status) return;

            if (status === "active") {
              activateCall();
            }
            if (["ended", "missed", "rejected"].includes(status)) {
              endCallLocalOnly();
            }
          }
        )
        .subscribe();

      callRowChannelRef.current = ch;
    },
    [activateCall, endCallLocalOnly]
  );

  // Start a 1:1 call
  const startCall = useCallback(
    async (roomId: string, targetUserId: string, type: CallType) => {
      try {
        setCallType(type);
        setRemoteUserId(targetUserId);
        setCallStatus("calling");
        setIsGroupCall(false);

        const { data: callData, error } = await supabase
          .from("calls")
          .insert({
            room_id: roomId,
            caller_id: currentUserId,
            callee_id: targetUserId,
            call_type: type,
            status: "ringing",
            is_group_call: false,
          } as any)
          .select()
          .single();

        if (error || !callData) throw new Error("Failed to create call");
        const cId = (callData as any).id;
        setCallId(cId);
        callIdRef.current = cId;
        subscribeToCallRow(cId);
        setCallStatus("ringing");

        const stream = await getMediaStream(type);
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const channel = await setupSignalingChannel(cId);
        const pc = createPeerConnection(channel);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        // Store the offer so it can be re-sent when callee signals ready
        pendingOfferRef.current = offer;
        channel.send({ type: "broadcast", event: "offer", payload: { sdp: offer } });

        setTimeout(() => {
          if (!hasActivatedRef.current && callIdRef.current === cId) {
            endCall("missed");
          }
        }, 30000);
      } catch (err) {
        console.error("startCall error:", err);
        cleanup();
        setCallStatus("idle");
        throw err;
      }
    },
    [currentUserId, getMediaStream, setupSignalingChannel, createPeerConnection, subscribeToCallRow, cleanup]
  );

  // Start a group call
  const startGroupCall = useCallback(
    async (roomId: string, type: CallType) => {
      try {
        setCallType(type);
        setCallStatus("calling");
        setIsGroupCall(true);

        const { data: callData, error } = await supabase
          .from("calls")
          .insert({
            room_id: roomId,
            caller_id: currentUserId,
            callee_id: null,
            call_type: type,
            status: "ringing",
            is_group_call: true,
          } as any)
          .select()
          .single();

        if (error || !callData) throw new Error("Failed to create group call");
        const cId = (callData as any).id;
        setCallId(cId);
        callIdRef.current = cId;

        // Add self as participant
        await supabase.from("call_participants").insert({ call_id: cId, user_id: currentUserId } as any);

        const stream = await getMediaStream(type);
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const channel = setupGroupSignaling(cId);

        // Announce join
        setTimeout(() => {
          channel.send({ type: "broadcast", event: "join", payload: { userId: currentUserId } });
        }, 500);

        setCallStatus("active");
        durationTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);

        // Update call to active
        await supabase.from("calls").update({ status: "active", started_at: new Date().toISOString() } as any).eq("id", cId);
      } catch (err) {
        console.error("startGroupCall error:", err);
        cleanup();
        setCallStatus("idle");
        throw err;
      }
    },
    [currentUserId, getMediaStream, setupGroupSignaling, cleanup]
  );

  // Join an existing group call
  const joinGroupCall = useCallback(
    async (cId: string, type: CallType) => {
      try {
        setCallId(cId);
        callIdRef.current = cId;
        setCallType(type);
        setCallStatus("active");
        setIsGroupCall(true);

        await supabase.from("call_participants").insert({ call_id: cId, user_id: currentUserId } as any);

        const stream = await getMediaStream(type);
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const channel = setupGroupSignaling(cId);

        // Announce join
        setTimeout(() => {
          channel.send({ type: "broadcast", event: "join", payload: { userId: currentUserId } });
        }, 500);

        durationTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
      } catch (err) {
        console.error("joinGroupCall error:", err);
        cleanup();
        setCallStatus("idle");
        throw err;
      }
    },
    [currentUserId, getMediaStream, setupGroupSignaling, cleanup]
  );

  // Answer a 1:1 call
  const answerCall = useCallback(
    async (cId: string, type: CallType) => {
      try {
        setCallId(cId);
        callIdRef.current = cId;
        setCallType(type);
        setCallStatus("ringing");
        setIsGroupCall(false);
        subscribeToCallRow(cId);

        const stream = await getMediaStream(type);
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const channel = await setupSignalingChannel(cId);
        const pc = createPeerConnection(channel);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // Mark call as accepted (timer starts when media/ICE connects)
        await supabase.from("calls").update({ status: "active" } as any).eq("id", cId);

        // Signal the caller that we're ready to receive the offer (channel is confirmed subscribed)
        channel.send({ type: "broadcast", event: "ready", payload: {} });
      } catch (err) {
        console.error("answerCall error:", err);
        cleanup();
        setCallStatus("idle");
        throw err;
      }
    },
    [getMediaStream, setupSignalingChannel, createPeerConnection, subscribeToCallRow, cleanup]
  );

  // End the call
  const endCall = useCallback(
    async (reason: string = "ended") => {
      isEndingRef.current = true;
      try {
        const cId = callIdRef.current;
        if (cId) {
          await supabase
            .from("calls")
            .update({ status: reason, ended_at: new Date().toISOString() } as any)
            .eq("id", cId);

          // Update participant left_at
          await supabase
            .from("call_participants")
            .update({ left_at: new Date().toISOString() } as any)
            .eq("call_id", cId)
            .eq("user_id", currentUserId);
        }
        if (channelRef.current) {
          if (isGroupCall) {
            channelRef.current.send({ type: "broadcast", event: "leave", payload: { userId: currentUserId } });
          } else {
            channelRef.current.send({ type: "broadcast", event: "hang-up", payload: {} });
          }
        }
        cleanup();
        setCallStatus("ended");
        setCallId(null);
        setRemoteUserId(null);
        setIsGroupCall(false);
        onCallEnded?.();
        setTimeout(() => setCallStatus("idle"), 1500);
      } finally {
        isEndingRef.current = false;
      }
    },
    [currentUserId, cleanup, onCallEnded, isGroupCall]
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

  // Flip camera (front/back)
  const flipCamera = useCallback(async () => {
    if (!localStreamRef.current) return;
    const newFacing = facingMode === "user" ? "environment" : "user";
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: { exact: newFacing }, width: 640, height: 480 },
      });
      // Replace video track in all peer connections
      const newVideoTrack = newStream.getVideoTracks()[0];
      const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
      
      // Replace in 1:1 peer connection
      if (pcRef.current) {
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(newVideoTrack);
      }
      // Replace in group peer connections
      groupPcsRef.current.forEach(async (pc) => {
        const sender = pc.getSenders().find(s => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(newVideoTrack);
      });

      // Stop old track and update local stream
      if (oldVideoTrack) oldVideoTrack.stop();
      localStreamRef.current.removeTrack(oldVideoTrack);
      localStreamRef.current.addTrack(newVideoTrack);
      
      // Also keep audio from new stream
      const newAudioTrack = newStream.getAudioTracks()[0];
      if (newAudioTrack) newAudioTrack.stop(); // we don't need a second audio

      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      setFacingMode(newFacing);
    } catch (err) {
      console.error("flipCamera error:", err);
      // Fallback: device may not support exact facingMode, try without exact
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: newFacing, width: 640, height: 480 },
        });
        const newVideoTrack = newStream.getVideoTracks()[0];
        const oldVideoTrack = localStreamRef.current!.getVideoTracks()[0];
        if (pcRef.current) {
          const sender = pcRef.current.getSenders().find(s => s.track?.kind === "video");
          if (sender) await sender.replaceTrack(newVideoTrack);
        }
        groupPcsRef.current.forEach(async (pc) => {
          const sender = pc.getSenders().find(s => s.track?.kind === "video");
          if (sender) await sender.replaceTrack(newVideoTrack);
        });
        if (oldVideoTrack) oldVideoTrack.stop();
        localStreamRef.current!.removeTrack(oldVideoTrack);
        localStreamRef.current!.addTrack(newVideoTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        setFacingMode(newFacing);
      } catch {
        // Device doesn't have multiple cameras
      }
    }
  }, [facingMode]);

  // Screen sharing
  const screenStreamRef = useRef<MediaStream | null>(null);

  const toggleScreenShare = useCallback(async () => {
    if (!localStreamRef.current) return;

    if (isScreenSharing) {
      // Stop screen share, revert to camera
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode, width: 640, height: 480 },
      });
      const camTrack = camStream.getVideoTracks()[0];
      const screenTrack = localStreamRef.current.getVideoTracks()[0];

      // Replace in all peer connections
      const replacers: Promise<void>[] = [];
      if (pcRef.current) {
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === "video");
        if (sender) replacers.push(sender.replaceTrack(camTrack));
      }
      groupPcsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track?.kind === "video");
        if (sender) replacers.push(sender.replaceTrack(camTrack));
      });
      await Promise.all(replacers);

      if (screenTrack) screenTrack.stop();
      localStreamRef.current.removeTrack(screenTrack);
      localStreamRef.current.addTrack(camTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      setIsScreenSharing(false);
      setIsVideoOff(false);
    } else {
      // Start screen share
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];

        // Replace in all peer connections
        const replacers: Promise<void>[] = [];
        if (pcRef.current) {
          const sender = pcRef.current.getSenders().find(s => s.track?.kind === "video");
          if (sender) replacers.push(sender.replaceTrack(screenTrack));
        }
        groupPcsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find(s => s.track?.kind === "video");
          if (sender) replacers.push(sender.replaceTrack(screenTrack));
        });
        await Promise.all(replacers);

        if (oldVideoTrack) oldVideoTrack.stop();
        localStreamRef.current.removeTrack(oldVideoTrack);
        localStreamRef.current.addTrack(screenTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;

        // When user stops sharing via browser UI
        screenTrack.onended = () => {
          toggleScreenShare();
        };

        setIsScreenSharing(true);
      } catch {
        // User cancelled the screen share picker
      }
    }
  }, [isScreenSharing, facingMode]);

  // Monitor connection quality via RTCPeerConnection stats
  useEffect(() => {
    if (callStatus !== "active") {
      setConnectionQuality("unknown");
      return;
    }
    const interval = setInterval(async () => {
      const pc = pcRef.current || groupPcsRef.current.values().next().value;
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        let rtt: number | null = null;
        let packetsLost = 0;
        let packetsReceived = 0;
        stats.forEach((report) => {
          if (report.type === "candidate-pair" && report.state === "succeeded") {
            rtt = report.currentRoundTripTime;
          }
          if (report.type === "inbound-rtp" && report.kind === "audio") {
            packetsLost = report.packetsLost || 0;
            packetsReceived = report.packetsReceived || 0;
          }
        });
        const lossRate = packetsReceived > 0 ? packetsLost / (packetsLost + packetsReceived) : 0;
        if (rtt !== null) {
          if (rtt < 0.1 && lossRate < 0.01) setConnectionQuality("excellent");
          else if (rtt < 0.2 && lossRate < 0.03) setConnectionQuality("good");
          else if (rtt < 0.4 && lossRate < 0.08) setConnectionQuality("fair");
          else setConnectionQuality("poor");
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [callStatus]);

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
    isGroupCall,
    participantCount,
    isScreenSharing,
    connectionQuality,
    localVideoRef,
    remoteVideoRef,
    remoteStream: remoteStreamRef.current,
    startCall,
    startGroupCall,
    joinGroupCall,
    answerCall,
    endCall,
    rejectCall,
    toggleMute,
    toggleVideo,
    flipCamera,
    toggleScreenShare,
  };
}
