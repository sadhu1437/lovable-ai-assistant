import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Paperclip, Users, ArrowLeft, Bot, Forward } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ChatMessage, ChatRoom, UserProfile } from "@/lib/messaging";
import { sendMessage, triggerBotReply, BOT_USERNAME } from "@/lib/messaging";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { TypingBubble } from "./TypingBubble";
import { OnlineIndicator } from "./OnlineIndicator";
import { ReadReceiptIcon } from "./ReadReceiptIcon";
import { VoiceRecorder } from "./VoiceRecorder";
import { VoicePlayer } from "./VoicePlayer";
import { ReactionDisplay, ReactionPicker } from "./EmojiReactions";
import { useReactions } from "@/hooks/useReactions";
import { ForwardMessageDialog } from "./ForwardMessageDialog";

interface ChatViewProps {
  room: ChatRoom;
  messages: ChatMessage[];
  currentUserId: string;
  profiles: Record<string, UserProfile>;
  onBack?: () => void;
  onlineUsers: Set<string>;
  typingUsers: Set<string>;
  setTyping: (isTyping: boolean) => void;
  readBy: Record<string, string[]>;
  allRooms?: ChatRoom[];
  roomProfiles?: Record<string, UserProfile>;
}

export function ChatView({ room, messages, currentUserId, profiles, onBack, onlineUsers, typingUsers, setTyping, readBy, allRooms = [], roomProfiles = {} }: ChatViewProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { reactions, loadReactions, toggleReaction } = useReactions(room.id, currentUserId);

  // Load reactions when messages change
  useEffect(() => {
    if (messages.length > 0) {
      loadReactions(messages.map((m) => m.id));
    }
  }, [messages, loadReactions]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typingUsers.size]);

  const handleTyping = useCallback((value: string) => {
    setText(value);
    if (value.trim()) {
      setTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTyping(false), 2000);
    } else {
      setTyping(false);
    }
  }, [setTyping]);

  const isBotRoom = useCallback(() => {
    // Check both profiles (from messages) and roomProfiles (from room members)
    const other = Object.values(profiles).find((p) => p.user_id !== currentUserId);
    if (other?.username === BOT_USERNAME) return true;
    const roomProfile = roomProfiles[room.id];
    return roomProfile?.username === BOT_USERNAME;
  }, [profiles, roomProfiles, room.id, currentUserId]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText("");
    setTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    const { error } = await sendMessage(room.id, currentUserId, trimmed);
    if (error) { toast.error("Failed to send message"); setSending(false); return; }
    setSending(false);

    // Auto-trigger bot reply
    if (isBotRoom()) {
      setBotThinking(true);
      const { error: botErr } = await triggerBotReply(room.id, trimmed);
      if (botErr) toast.error("Bot failed to reply");
      setBotThinking(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const bucket = "avatars";
    const path = `chat-media/${room.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) { toast.error("Upload failed"); return; }
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

  const otherUser = Object.values(profiles).find((p) => p.user_id !== currentUserId) || roomProfiles[room.id] || null;
  const isBot = otherUser?.username === BOT_USERNAME;
  const roomName = room.type === "group" ? room.name || "Unnamed Group" : otherUser?.display_name || "Chat";
  const otherUserId = otherUser?.user_id;
  const isOtherOnline = isBot ? true : (otherUserId ? onlineUsers.has(otherUserId) : false);

  const typingNames = Array.from(typingUsers).map((uid) => getDisplayName(uid));

  const getReadStatus = (msgId: string) => {
    return (readBy[msgId] || []).length > 0;
  };

  const getStatusText = () => {
    if (room.type === "group") {
      const onlineCount = Array.from(onlineUsers).length;
      return `${onlineCount} online`;
    }
    if (isBot) return "AI Assistant • Always Online";
    if (isOtherOnline) return "Online";
    return "Offline";
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        {onBack && (
          <Button variant="ghost" size="icon" className="shrink-0 md:hidden" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
        )}
        <div className="relative">
          <div className="w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden shrink-0">
            {room.type === "group" ? (
              <Users className="w-4 h-4 text-foreground" />
            ) : isBot ? (
              <Bot className="w-4 h-4 text-primary" />
            ) : (
              (() => {
                const otherAvatar = otherUser?.avatar_url;
                return otherAvatar ? (
                  <img src={otherAvatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-mono text-foreground">{(roomName || "U")[0].toUpperCase()}</span>
                );
              })()
            )}
          </div>
          {room.type === "dm" && <OnlineIndicator isOnline={isOtherOnline} />}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground font-mono">{roomName}</h3>
          <p className={`text-[10px] font-mono ${isOtherOnline || room.type === "group" ? "text-primary" : "text-muted-foreground"}`}>
            {getStatusText()}
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
          const msgReactions = reactions[msg.id] || [];
          return (
            <div key={msg.id} className={`group flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
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
                <div className="relative">
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      isMe
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-secondary text-foreground rounded-bl-sm"
                    }`}
                  >
                    {msg.message_type === "voice" && msg.media_url ? (
                      <VoicePlayer url={msg.media_url} label={msg.content || undefined} />
                    ) : msg.message_type === "image" && msg.media_url ? (
                      <img src={msg.media_url} alt={msg.content || ""} className="rounded-lg max-w-full max-h-60" />
                    ) : msg.message_type === "file" && msg.media_url ? (
                      <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="underline flex items-center gap-1">
                        <Paperclip className="w-3 h-3" /> {msg.content}
                      </a>
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    )}
                  </div>
                  {/* Actions - appears on hover */}
                  <div className={`absolute top-0 ${isMe ? "left-0 -translate-x-full" : "right-0 translate-x-full"} px-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity`}>
                    <ReactionPicker
                      onSelect={(emoji) => toggleReaction(msg.id, emoji)}
                      align={isMe ? "right" : "left"}
                    />
                    <button
                      onClick={() => setForwardMsg(msg)}
                      className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Forward"
                    >
                      <Forward className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {/* Reaction display */}
                <ReactionDisplay
                  reactions={msgReactions}
                  onToggle={(emoji) => toggleReaction(msg.id, emoji)}
                />
                <p className={`text-[9px] text-muted-foreground mt-0.5 flex items-center ${isMe ? "justify-end" : ""}`}>
                  {format(new Date(msg.created_at), "HH:mm")}
                  {isMe && <ReadReceiptIcon isRead={getReadStatus(msg.id)} />}
                </p>
              </div>
            </div>
          );
        })}
        {botThinking && <TypingBubble names={["NexusAI Bot"]} />}
        <TypingBubble names={typingNames} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border bg-card">
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="w-4 h-4" />
          </Button>
          <Input
            value={text}
            onChange={(e) => handleTyping(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            className="text-sm font-mono"
          />
          {text.trim() ? (
            <Button size="icon" onClick={handleSend} disabled={sending}>
              <Send className="w-4 h-4" />
            </Button>
          ) : (
            <VoiceRecorder roomId={room.id} senderId={currentUserId} />
          )}
        </div>
      </div>

      <ForwardMessageDialog
        open={forwardMsg !== null}
        onClose={() => setForwardMsg(null)}
        message={forwardMsg}
        rooms={allRooms}
        roomProfiles={roomProfiles}
        currentRoomId={room.id}
        currentUserId={currentUserId}
      />
    </div>
  );
}
