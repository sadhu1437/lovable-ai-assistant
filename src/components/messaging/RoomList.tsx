import { useState, useRef, useCallback } from "react";
import { Search, Users, MessageCircle, Bot, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { OnlineIndicator } from "./OnlineIndicator";
import type { ChatRoom, UserProfile } from "@/lib/messaging";
import { BOT_USERNAME } from "@/lib/messaging";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RoomListProps {
  rooms: ChatRoom[];
  activeRoomId: string | null;
  onSelectRoom: (id: string) => void;
  onNewDM: () => void;
  onNewGroup: () => void;
  onChatWithBot: () => void;
  onDeleteRoom?: (roomId: string) => void;
  roomProfiles: Record<string, UserProfile>;
  currentUserId: string;
  onlineUsers: Set<string>;
}

export function RoomList({ rooms, activeRoomId, onSelectRoom, onNewDM, onNewGroup, onChatWithBot, onDeleteRoom, roomProfiles, currentUserId, onlineUsers }: RoomListProps) {
  const [search, setSearch] = useState("");
  const [deleteRoom, setDeleteRoom] = useState<ChatRoom | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggered = useRef(false);

  const filtered = rooms.filter((r) => {
    const name = r.type === "group" ? r.name : roomProfiles[r.id]?.display_name || roomProfiles[r.id]?.username;
    return !search || (name || "").toLowerCase().includes(search.toLowerCase());
  });

  const getRoomDisplayName = (room: ChatRoom) => {
    if (room.type === "group") return room.name || "Unnamed Group";
    const profile = roomProfiles[room.id];
    return profile?.display_name || profile?.username || "User";
  };

  const getRoomAvatar = (room: ChatRoom) => {
    if (room.type === "group") return room.avatar_url;
    return roomProfiles[room.id]?.avatar_url;
  };

  const isRoomUserOnline = (room: ChatRoom) => {
    if (room.type !== "dm") return false;
    const profile = roomProfiles[room.id];
    if (profile?.username === BOT_USERNAME) return true;
    return profile ? onlineUsers.has(profile.user_id) : false;
  };

  const isRoomBot = (room: ChatRoom) => {
    if (room.type !== "dm") return false;
    return roomProfiles[room.id]?.username === BOT_USERNAME;
  };

  const startLongPress = useCallback((room: ChatRoom) => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setDeleteRoom(room);
    }, 600);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleClick = useCallback((roomId: string) => {
    if (!longPressTriggered.current) {
      onSelectRoom(roomId);
    }
  }, [onSelectRoom]);

  return (
    <div className="w-72 h-full bg-card border-r border-border flex flex-col">
      <div className="p-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground font-mono mb-3">Messages</h2>
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats..."
            className="pl-8 h-8 text-xs font-mono"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={onChatWithBot}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-primary/10 border border-primary/30 hover:bg-primary/20 text-xs text-primary transition-all font-mono font-medium"
          >
            <Bot className="w-3.5 h-3.5" /> Chat with NexusAI
          </button>
          <div className="flex gap-1.5">
            <button
              onClick={onNewDM}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-border hover:border-primary/50 hover:bg-secondary text-xs text-foreground transition-all font-mono"
            >
              <MessageCircle className="w-3.5 h-3.5" /> New Chat
            </button>
            <button
              onClick={onNewGroup}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-border hover:border-primary/50 hover:bg-secondary text-xs text-foreground transition-all font-mono"
            >
              <Users className="w-3.5 h-3.5" /> New Group
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8 font-mono">No conversations yet</p>
        ) : (
          filtered.map((room) => {
            const name = getRoomDisplayName(room);
            const avatar = getRoomAvatar(room);
            const isOnline = isRoomUserOnline(room);
            return (
              <button
                key={room.id}
                onClick={() => handleClick(room.id)}
                onTouchStart={() => startLongPress(room)}
                onTouchEnd={cancelLongPress}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setDeleteRoom(room);
                }}
                className={`group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm mb-1 transition-all select-none ${
                  activeRoomId === room.id
                    ? "bg-secondary text-foreground border border-primary/30"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center text-xs font-mono text-foreground overflow-hidden">
                    {isRoomBot(room) ? (
                      <Bot className="w-4 h-4 text-primary" />
                    ) : avatar ? (
                      <img src={avatar} alt="" className="w-full h-full object-cover" />
                    ) : room.type === "group" ? (
                      <Users className="w-4 h-4" />
                    ) : (
                      (name || "U")[0].toUpperCase()
                    )}
                  </div>
                  {room.type === "dm" && <OnlineIndicator isOnline={isOnline} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{name}</p>
                  <p className={`text-[10px] truncate ${isOnline ? "text-primary" : "text-muted-foreground"}`}>
                    {isRoomBot(room) ? "AI Assistant" : room.type === "group" ? "Group" : isOnline ? "Online" : "Offline"}
                  </p>
                </div>
                {/* Delete button visible on hover (desktop) */}
                <div
                  className="hidden group-hover:flex shrink-0 p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteRoom(room);
                  }}
                  role="button"
                  title="Delete conversation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteRoom} onOpenChange={(o) => !o && setDeleteRoom(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-sm flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-destructive" />
              Delete Conversation
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This will permanently delete the entire conversation including all messages for both sides. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono text-xs"
              onClick={() => {
                if (deleteRoom && onDeleteRoom) {
                  onDeleteRoom(deleteRoom.id);
                }
                setDeleteRoom(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
