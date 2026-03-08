import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PresenceState {
  user_id: string;
  online_at: string;
  typing_in?: string | null;
}

export function usePresence(userId: string | undefined, roomId: string | null) {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Track presence
  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel("global-presence", {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceState>();
        const online = new Set<string>();
        const typing = new Set<string>();
        Object.values(state).forEach((presences) => {
          presences.forEach((p) => {
            online.add(p.user_id);
            if (p.typing_in && p.typing_in === roomId) {
              typing.add(p.user_id);
            }
          });
        });
        // Remove self from typing
        typing.delete(userId);
        setOnlineUsers(online);
        setTypingUsers(typing);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: userId, online_at: new Date().toISOString(), typing_in: null });
        }
      });

    channelRef.current = channel;

    // Update last_seen periodically
    const updateLastSeen = () => {
      supabase.from("profiles").update({ last_seen: new Date().toISOString() } as any).eq("user_id", userId).then(() => {});
    };
    updateLastSeen();
    heartbeatRef.current = setInterval(updateLastSeen, 60000);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId, roomId]);

  const setTyping = useCallback(
    (isTyping: boolean) => {
      if (!channelRef.current || !userId) return;
      channelRef.current.track({
        user_id: userId,
        online_at: new Date().toISOString(),
        typing_in: isTyping ? roomId : null,
      });
    },
    [userId, roomId]
  );

  return { onlineUsers, typingUsers, setTyping };
}

export function useReadReceipts(roomId: string | null, userId: string | undefined, messages: { id: string; sender_id: string }[]) {
  const [readBy, setReadBy] = useState<Record<string, string[]>>({});

  // Mark messages as read
  useEffect(() => {
    if (!roomId || !userId || messages.length === 0) return;
    const unreadFromOthers = messages.filter((m) => m.sender_id !== userId);
    if (unreadFromOthers.length === 0) return;

    const markRead = async () => {
      const receipts = unreadFromOthers.map((m) => ({
        message_id: m.id,
        user_id: userId,
      }));
      // Upsert - ignore conflicts
      await supabase.from("message_read_receipts").upsert(receipts, { onConflict: "message_id,user_id", ignoreDuplicates: true });
    };
    markRead();
  }, [roomId, userId, messages]);

  // Load read receipts for messages I sent
  useEffect(() => {
    if (!roomId || !userId || messages.length === 0) return;
    const myMsgIds = messages.filter((m) => m.sender_id === userId).map((m) => m.id);
    if (myMsgIds.length === 0) return;

    const loadReceipts = async () => {
      const { data } = await supabase
        .from("message_read_receipts")
        .select("message_id, user_id")
        .in("message_id", myMsgIds);
      if (data) {
        const map: Record<string, string[]> = {};
        data.forEach((r: any) => {
          if (!map[r.message_id]) map[r.message_id] = [];
          map[r.message_id].push(r.user_id);
        });
        setReadBy(map);
      }
    };
    loadReceipts();
  }, [roomId, userId, messages]);

  // Realtime updates for read receipts
  useEffect(() => {
    if (!roomId || !userId) return;
    const channel = supabase
      .channel(`receipts-${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_read_receipts" },
        (payload) => {
          const r = payload.new as { message_id: string; user_id: string };
          setReadBy((prev) => ({
            ...prev,
            [r.message_id]: [...(prev[r.message_id] || []), r.user_id],
          }));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId, userId]);

  return { readBy };
}
