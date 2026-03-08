import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

interface GroupedReaction {
  emoji: string;
  count: number;
  userIds: string[];
  reacted: boolean;
}

export function useReactions(roomId: string | null, currentUserId: string | undefined) {
  const [reactions, setReactions] = useState<Record<string, GroupedReaction[]>>({});
  const loadedMsgIdsRef = useRef<string>("");

  const groupReactions = useCallback(
    (raw: Reaction[]): Record<string, GroupedReaction[]> => {
      const map: Record<string, Record<string, { count: number; userIds: string[] }>> = {};
      for (const r of raw) {
        if (!map[r.message_id]) map[r.message_id] = {};
        if (!map[r.message_id][r.emoji]) map[r.message_id][r.emoji] = { count: 0, userIds: [] };
        map[r.message_id][r.emoji].count++;
        map[r.message_id][r.emoji].userIds.push(r.user_id);
      }
      const result: Record<string, GroupedReaction[]> = {};
      for (const [msgId, emojis] of Object.entries(map)) {
        result[msgId] = Object.entries(emojis).map(([emoji, data]) => ({
          emoji,
          count: data.count,
          userIds: data.userIds,
          reacted: data.userIds.includes(currentUserId || ""),
        }));
      }
      return result;
    },
    [currentUserId]
  );

  // Load reactions — deduplicated by message IDs
  const loadReactions = useCallback(
    async (messageIds: string[]) => {
      if (!messageIds.length) return;
      const key = messageIds.join(",");
      if (key === loadedMsgIdsRef.current) return;
      loadedMsgIdsRef.current = key;

      const { data } = await supabase
        .from("message_reactions")
        .select("id, message_id, user_id, emoji")
        .in("message_id", messageIds);
      if (data) setReactions(groupReactions(data as Reaction[]));
    },
    [groupReactions]
  );

  // Realtime subscription
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`reactions-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const r = payload.new as Reaction;
            setReactions((prev) => {
              const existing = prev[r.message_id] || [];
              const found = existing.find((e) => e.emoji === r.emoji);
              if (found) {
                return {
                  ...prev,
                  [r.message_id]: existing.map((e) =>
                    e.emoji === r.emoji
                      ? { ...e, count: e.count + 1, userIds: [...e.userIds, r.user_id], reacted: e.reacted || r.user_id === currentUserId }
                      : e
                  ),
                };
              }
              return {
                ...prev,
                [r.message_id]: [
                  ...existing,
                  { emoji: r.emoji, count: 1, userIds: [r.user_id], reacted: r.user_id === currentUserId },
                ],
              };
            });
          } else if (payload.eventType === "DELETE") {
            const r = payload.old as Reaction;
            setReactions((prev) => {
              const existing = prev[r.message_id] || [];
              const updated = existing
                .map((e) =>
                  e.emoji === r.emoji
                    ? { ...e, count: e.count - 1, userIds: e.userIds.filter((id) => id !== r.user_id), reacted: e.reacted && r.user_id !== currentUserId }
                    : e
                )
                .filter((e) => e.count > 0);
              return { ...prev, [r.message_id]: updated };
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, currentUserId]);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentUserId) return;
      const existing = reactions[messageId]?.find((r) => r.emoji === emoji);
      if (existing?.reacted) {
        await supabase
          .from("message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", currentUserId)
          .eq("emoji", emoji);
      } else {
        await supabase.from("message_reactions").insert({
          message_id: messageId,
          user_id: currentUserId,
          emoji,
        });
      }
    },
    [currentUserId, reactions]
  );

  return { reactions, loadReactions, toggleReaction };
}
