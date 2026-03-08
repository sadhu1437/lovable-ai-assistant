import { useState, useRef, useEffect } from "react";
import { Send, Image as ImageIcon, Paperclip, Users, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ChatMessage, ChatRoom, UserProfile } from "@/lib/messaging";
import { sendMessage } from "@/lib/messaging";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface ChatViewProps {
  room: ChatRoom;
  messages: ChatMessage[];
  currentUserId: string;
  profiles: Record<string, UserProfile>;
  onBack?: () => void;
}

export function ChatView({ room, messages, currentUserId, profiles, onBack }: ChatViewProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText("");
    const { error } = await sendMessage(room.id, currentUserId, trimmed);
    if (error) toast.error("Failed to send message");
    setSending(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const bucket = "avatars"; // reuse bucket for simplicity
    const path = `chat-media/${room.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) {
      toast.error("Upload failed");
      return;
    }
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    await sendMessage(room.id, currentUserId, file.name, isImage ? "image" : "file", urlData.publicUrl);
    e.target.value = "";
  };

  const getDisplayName = (userId: string) => {
    const p = Object.values(profiles).find((pr) => pr.user_id === userId);
    return p?.display_name || p?.username || "User";
  };

  const getAvatar = (userId: string) => {
    const p = Object.values(profiles).find((pr) => pr.user_id === userId);
    return p?.avatar_url;
  };

  const roomName = room.type === "group"
    ? room.name || "Unnamed Group"
    : Object.values(profiles).find((p) => p.user_id !== currentUserId)?.display_name || "Chat";

  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        {onBack && (
          <Button variant="ghost" size="icon" className="shrink-0 md:hidden" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
        )}
        <div className="w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden shrink-0">
          {room.type === "group" ? (
            <Users className="w-4 h-4 text-foreground" />
          ) : (
            (() => {
              const otherAvatar = Object.values(profiles).find((p) => p.user_id !== currentUserId)?.avatar_url;
              return otherAvatar ? (
                <img src={otherAvatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-mono text-foreground">{(roomName || "U")[0].toUpperCase()}</span>
              );
            })()
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground font-mono">{roomName}</h3>
          <p className="text-[10px] text-muted-foreground">
            {room.type === "group" ? "Group chat" : "Direct message"}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-xs text-muted-foreground font-mono py-12">
            No messages yet. Say hello! 👋
          </p>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender_id === currentUserId;
          const avatar = getAvatar(msg.sender_id);
          return (
            <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
              <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden shrink-0 mt-1">
                {avatar ? (
                  <img src={avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] font-mono text-foreground">
                    {getDisplayName(msg.sender_id)[0].toUpperCase()}
                  </span>
                )}
              </div>
              <div className={`max-w-[70%] ${isMe ? "items-end" : "items-start"}`}>
                {!isMe && room.type === "group" && (
                  <p className="text-[10px] text-muted-foreground font-mono mb-0.5">{getDisplayName(msg.sender_id)}</p>
                )}
                <div
                  className={`rounded-2xl px-3 py-2 text-sm ${
                    isMe
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-secondary text-foreground rounded-bl-sm"
                  }`}
                >
                  {msg.message_type === "image" && msg.media_url ? (
                    <img src={msg.media_url} alt={msg.content || ""} className="rounded-lg max-w-full max-h-60" />
                  ) : msg.message_type === "file" && msg.media_url ? (
                    <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="underline flex items-center gap-1">
                      <Paperclip className="w-3 h-3" /> {msg.content}
                    </a>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  )}
                </div>
                <p className={`text-[9px] text-muted-foreground mt-0.5 ${isMe ? "text-right" : ""}`}>
                  {format(new Date(msg.created_at), "HH:mm")}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border bg-card">
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            className="text-sm font-mono"
          />
          <Button size="icon" onClick={handleSend} disabled={!text.trim() || sending}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
