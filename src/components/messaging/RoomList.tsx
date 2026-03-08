import { useState } from "react";
import { Plus, Search, Users, MessageCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { ChatRoom, UserProfile } from "@/lib/messaging";

interface RoomListProps {
  rooms: ChatRoom[];
  activeRoomId: string | null;
  onSelectRoom: (id: string) => void;
  onNewDM: () => void;
  onNewGroup: () => void;
  roomProfiles: Record<string, UserProfile>;
  currentUserId: string;
}

export function RoomList({ rooms, activeRoomId, onSelectRoom, onNewDM, onNewGroup, roomProfiles, currentUserId }: RoomListProps) {
  const [search, setSearch] = useState("");

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

      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8 font-mono">No conversations yet</p>
        ) : (
          filtered.map((room) => {
            const name = getRoomDisplayName(room);
            const avatar = getRoomAvatar(room);
            return (
              <button
                key={room.id}
                onClick={() => onSelectRoom(room.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm mb-1 transition-all ${
                  activeRoomId === room.id
                    ? "bg-secondary text-foreground border border-primary/30"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center text-xs font-mono text-foreground overflow-hidden shrink-0">
                  {avatar ? (
                    <img src={avatar} alt="" className="w-full h-full object-cover" />
                  ) : room.type === "group" ? (
                    <Users className="w-4 h-4" />
                  ) : (
                    (name || "U")[0].toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {room.type === "group" ? "Group" : "Direct message"}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
