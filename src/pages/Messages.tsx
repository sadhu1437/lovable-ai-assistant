import { useState, useEffect, useCallback } from "react";
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
  createBotDM,
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

  const { onlineUsers, typingUsers, setTyping } = usePresence(user?.id, activeRoomId);
  const { readBy } = useReadReceipts(activeRoomId, user?.id, messages);

  // Load rooms
  const loadRooms = useCallback(async () => {
    const data = await fetchUserRooms();
    setRooms(data);
    const profileMap: Record<string, UserProfile> = {};
    for (const room of data) {
      if (room.type === "dm") {
        const members = await fetchRoomMembers(room.id);
        const otherMember = members.find((m) => m.user_id !== user?.id);
        if (otherMember) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, user_id, username, display_name, avatar_url")
            .eq("user_id", otherMember.user_id)
            .maybeSingle();
          if (profile) profileMap[room.id] = profile as UserProfile;
        }
      }
    }
    setRoomProfiles(profileMap);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    loadRooms();
  }, [user, navigate, loadRooms]);

  // Load messages for active room
  useEffect(() => {
    if (!activeRoomId) return;
    const loadMessages = async () => {
      const msgs = await fetchRoomMessages(activeRoomId);
      setMessages(msgs);
      const senderIds = [...new Set(msgs.map((m) => m.sender_id))];
      const profileMap: Record<string, UserProfile> = { ...profiles };
      for (const sid of senderIds) {
        if (!Object.values(profileMap).find((p) => p.user_id === sid)) {
          const { data } = await supabase
            .from("profiles")
            .select("id, user_id, username, display_name, avatar_url")
            .eq("user_id", sid)
            .maybeSingle();
          if (data) profileMap[data.id] = data as UserProfile;
        }
      }
      setProfiles(profileMap);
    };
    loadMessages();
  }, [activeRoomId]);

  // Realtime subscription for messages
  useEffect(() => {
    if (!activeRoomId) return;
    const channel = supabase
      .channel(`room-${activeRoomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${activeRoomId}` },
        async (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => [...prev, newMsg]);
          if (!Object.values(profiles).find((p) => p.user_id === newMsg.sender_id)) {
            const { data } = await supabase
              .from("profiles")
              .select("id, user_id, username, display_name, avatar_url")
              .eq("user_id", newMsg.sender_id)
              .maybeSingle();
            if (data) setProfiles((prev) => ({ ...prev, [data.id]: data as UserProfile }));
          }
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
            toast.info("Starting chat with NexusAI Bot...");
            const roomId = await createBotDM(user.id);
            if (roomId) {
              await loadRooms();
              setActiveRoomId(roomId);
            } else {
              toast.error("Failed to start bot chat");
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
