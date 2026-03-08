import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { RoomList } from "@/components/messaging/RoomList";
import { MessageSearch } from "@/components/messaging/MessageSearch";
import { ChatView } from "@/components/messaging/ChatView";
import { NewChatDialog } from "@/components/messaging/NewChatDialog";
import { usePresence, useReadReceipts } from "@/hooks/usePresence";
import {
  fetchUserRooms,
  fetchRoomMessages,
  fetchRoomMembers,
  fetchProfilesByUserIds,
  fetchProfileByUserId,
  createBotDM,
  deleteChatRoom,
  type ChatRoom,
  type ChatMessage,
  type UserProfile,
} from "@/lib/messaging";

export default function Messages() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [roomProfiles, setRoomProfiles] = useState<Record<string, UserProfile>>({});
  const [dialogMode, setDialogMode] = useState<"dm" | "group" | null>(null);
  const [loading, setLoading] = useState(true);
  const [botLoading, setBotLoading] = useState(false);
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  const { onlineUsers, typingUsers, setTyping } = usePresence(user?.id, activeRoomId);
  const { readBy } = useReadReceipts(activeRoomId, user?.id, messages);

  // Load rooms — batch profile fetching with cache
  const loadRooms = useCallback(async () => {
    if (!user) return;
    const data = await fetchUserRooms(user.id);
    setRooms(data);

    const dmRooms = data.filter((r) => r.type === "dm");
    if (dmRooms.length === 0) { setLoading(false); return; }

    // Batch: get all members for all DM rooms at once
    const { data: allMembers } = await supabase
      .from("chat_room_members")
      .select("room_id, user_id")
      .in("room_id", dmRooms.map((r) => r.id));

    if (!allMembers) { setLoading(false); return; }

    const otherUserIds = new Set<string>();
    const roomToOtherUser: Record<string, string> = {};
    for (const member of allMembers) {
      if (member.user_id !== user.id) {
        otherUserIds.add(member.user_id);
        roomToOtherUser[member.room_id] = member.user_id;
      }
    }

    if (otherUserIds.size === 0) { setLoading(false); return; }

    // Cached batch profile fetch
    const profilesList = await fetchProfilesByUserIds(Array.from(otherUserIds));

    const profileMap: Record<string, UserProfile> = {};
    const profileByUserId: Record<string, UserProfile> = {};
    for (const p of profilesList) {
      profileByUserId[p.user_id] = p;
    }
    for (const [roomId, userId] of Object.entries(roomToOtherUser)) {
      if (profileByUserId[userId]) {
        profileMap[roomId] = profileByUserId[userId];
      }
    }

    setRoomProfiles(profileMap);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    loadRooms();
  }, [user, navigate, loadRooms]);

  // Load messages for active room
  useEffect(() => {
    if (!activeRoomId || !user) return;
    let cancelled = false;

    const loadMessages = async () => {
      const msgs = await fetchRoomMessages(activeRoomId);
      if (cancelled) return;
      setMessages(msgs);

      // Cached batch fetch for missing profiles
      const existingUserIds = new Set(Object.values(profilesRef.current).map((p) => p.user_id));
      const missingSenderIds = [...new Set(msgs.map((m) => m.sender_id))].filter((id) => !existingUserIds.has(id));

      if (missingSenderIds.length > 0) {
        const fetched = await fetchProfilesByUserIds(missingSenderIds);
        if (!cancelled && fetched.length > 0) {
          setProfiles((prev) => {
            const next = { ...prev };
            for (const p of fetched) next[p.id] = p;
            return next;
          });
        }
      }
    };
    loadMessages();

    return () => { cancelled = true; };
  }, [activeRoomId, user]);

  // Realtime subscription for messages — uses ref to avoid stale closure
  useEffect(() => {
    if (!activeRoomId) return;
    const channel = supabase
      .channel(`room-${activeRoomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${activeRoomId}` },
        async (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => {
            // Prevent duplicates
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });

          // Fetch profile if missing — cached
          const existingUserIds = new Set(Object.values(profilesRef.current).map((p) => p.user_id));
          if (!existingUserIds.has(newMsg.sender_id)) {
            const profile = await fetchProfileByUserId(newMsg.sender_id);
            if (profile) setProfiles((prev) => ({ ...prev, [profile.id]: profile }));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `room_id=eq.${activeRoomId}` },
        (payload) => {
          const updated = payload.new as ChatMessage;
          setMessages((prev) => prev.map((m) => m.id === updated.id ? updated : m));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages", filter: `room_id=eq.${activeRoomId}` },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) setMessages((prev) => prev.filter((m) => m.id !== deletedId));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeRoomId]);

  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  if (!user) return null;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-background">
      <div className={`${activeRoomId ? "hidden md:flex" : "flex"} flex-col`}>
        <div className="p-3 border-b border-border bg-card flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold text-foreground font-mono flex-1">Messages</span>
          <MessageSearch
            rooms={rooms}
            roomProfiles={roomProfiles}
            onJumpToMessage={(roomId) => setActiveRoomId(roomId)}
          />
        </div>
        <RoomList
          rooms={rooms}
          activeRoomId={activeRoomId}
          onSelectRoom={setActiveRoomId}
          onNewDM={() => setDialogMode("dm")}
          onNewGroup={() => setDialogMode("group")}
          onChatWithBot={async () => {
            if (botLoading) return;
            setBotLoading(true);
            toast.info("Starting chat with NexusAI Bot...");
            const roomId = await createBotDM(user.id);
            if (roomId) {
              await loadRooms();
              setActiveRoomId(roomId);
            } else {
              toast.error("Failed to start bot chat");
            }
            setBotLoading(false);
          }}
          onDeleteRoom={async (roomId) => {
            const { success, error } = await deleteChatRoom(roomId);
            if (error || !success) {
              toast.error("Failed to delete conversation");
            } else {
              toast.success("Conversation deleted");
              if (activeRoomId === roomId) setActiveRoomId(null);
              setRooms((prev) => prev.filter((r) => r.id !== roomId));
            }
          }}
          roomProfiles={roomProfiles}
          currentUserId={user.id}
          onlineUsers={onlineUsers}
        />
      </div>

      {activeRoom ? (
        <ChatView
          room={activeRoom}
          messages={messages}
          currentUserId={user.id}
          profiles={profiles}
          onBack={() => setActiveRoomId(null)}
          onlineUsers={onlineUsers}
          typingUsers={typingUsers}
          setTyping={setTyping}
          readBy={readBy}
          allRooms={rooms}
          roomProfiles={roomProfiles}
          onDeleteMessage={(msgId) => setMessages((prev) => prev.filter((m) => m.id !== msgId))}
          onStartDM={async (userId) => {
            const { createDM } = await import("@/lib/messaging");
            const roomId = await createDM(user.id, userId);
            if (roomId) {
              await loadRooms();
              setActiveRoomId(roomId);
            } else {
              toast.error("Failed to start conversation");
            }
          }}
        />
      ) : (
        <div className="flex-1 hidden md:flex items-center justify-center bg-background">
          <div className="text-center">
            <p className="text-sm text-muted-foreground font-mono">Select a conversation or start a new one</p>
          </div>
        </div>
      )}

      <NewChatDialog
        open={dialogMode !== null}
        onClose={() => setDialogMode(null)}
        mode={dialogMode || "dm"}
        currentUserId={user.id}
        onCreated={(roomId) => {
          loadRooms();
          setActiveRoomId(roomId);
        }}
      />
    </div>
  );
}
