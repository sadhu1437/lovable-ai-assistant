import { useState } from "react";
import { Forward, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { ChatRoom, ChatMessage, UserProfile } from "@/lib/messaging";
import { sendMessage } from "@/lib/messaging";

interface ForwardMessageDialogProps {
  open: boolean;
  onClose: () => void;
  message: ChatMessage | null;
  rooms: ChatRoom[];
  roomProfiles: Record<string, UserProfile>;
  currentRoomId: string;
  currentUserId: string;
}

export function ForwardMessageDialog({
  open,
  onClose,
  message,
  rooms,
  roomProfiles,
  currentRoomId,
  currentUserId,
}: ForwardMessageDialogProps) {
  const [search, setSearch] = useState("");
  const [forwarding, setForwarding] = useState<string | null>(null);

  const filtered = rooms
    .filter((r) => r.id !== currentRoomId)
    .filter((r) => {
      const name =
        r.type === "group"
          ? r.name
          : roomProfiles[r.id]?.display_name || roomProfiles[r.id]?.username;
      return !search || (name || "").toLowerCase().includes(search.toLowerCase());
    });

  const getRoomName = (room: ChatRoom) => {
    if (room.type === "group") return room.name || "Unnamed Group";
    const p = roomProfiles[room.id];
    return p?.display_name || p?.username || "Chat";
  };

  const handleForward = async (targetRoomId: string) => {
    if (!message) return;
    setForwarding(targetRoomId);

    const content = message.content
      ? `↪ Forwarded: ${message.content}`
      : "↪ Forwarded message";

    const { error } = await sendMessage(
      targetRoomId,
      currentUserId,
      content,
      message.message_type as "text" | "image" | "file" | "voice",
      message.media_url || undefined
    );

    setForwarding(null);
    if (error) {
      toast.error("Failed to forward message");
    } else {
      toast.success(`Forwarded to ${getRoomName(rooms.find((r) => r.id === targetRoomId)!)}`);
      handleClose();
    }
  };

  const handleClose = () => {
    setSearch("");
    setForwarding(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm flex items-center gap-2">
            <Forward className="w-4 h-4" /> Forward Message
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats..."
            className="pl-8 h-8 text-xs font-mono"
            autoFocus
          />
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1 mt-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6 font-mono">
              No other chats available
            </p>
          ) : (
            filtered.map((room) => {
              const name = getRoomName(room);
              const avatar = room.type === "group" ? null : roomProfiles[room.id]?.avatar_url;
              return (
                <button
                  key={room.id}
                  onClick={() => handleForward(room.id)}
                  disabled={forwarding !== null}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-secondary transition-all text-left disabled:opacity-50"
                >
                  <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden shrink-0 text-xs font-mono text-foreground">
                    {avatar ? (
                      <img src={avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (name || "U")[0].toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {room.type === "group" ? "Group" : "Direct"}
                    </p>
                  </div>
                  {forwarding === room.id && (
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
