import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Paperclip, Users, ArrowLeft, Bot, Forward, Trash2, Volume2, VolumeX, FileDown, Download, Loader2, Play, Square, Pencil, Pin, PinOff, Check, X, MoreVertical, SmilePlus, Reply } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ChatMessage, ChatRoom, UserProfile } from "@/lib/messaging";
import { sendMessage, triggerBotReply, editChatMessage, pinChatMessage, BOT_USERNAME } from "@/lib/messaging";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { TypingBubble } from "./TypingBubble";
import { OnlineIndicator } from "./OnlineIndicator";
import { ReadReceiptIcon } from "./ReadReceiptIcon";
import { VoiceRecorder } from "./VoiceRecorder";
import { VoicePlayer } from "./VoicePlayer";
import { ReactionDisplay, ReactionPicker } from "./EmojiReactions";
import { ReplyPreview, QuotedMessage } from "./ReplyPreview";
import { GroupInfoPanel } from "./GroupInfoPanel";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useReactions } from "@/hooks/useReactions";
import { ForwardMessageDialog } from "./ForwardMessageDialog";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { useElevenLabsTTS } from "@/hooks/useElevenLabsTTS";
import { VoiceSelector } from "./VoiceSelector";
import { exportMessageAsPdf, exportMessagesToPdf } from "@/lib/exportPdf";
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
  onDeleteMessage?: (msgId: string) => void;
  onStartDM?: (userId: string) => void;
}

export function ChatView({ room, messages, currentUserId, profiles, onBack, onlineUsers, typingUsers, setTyping, readBy, allRooms = [], roomProfiles = {}, onDeleteMessage, onStartDM }: ChatViewProps) {
  const [text, setText] = useState("");
  const [showMention, setShowMention] = useState(false);
  const [sending, setSending] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<ChatMessage | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { reactions, loadReactions, toggleReaction } = useReactions(room.id, currentUserId);
  const { speaking, speak } = useTextToSpeech();
  const elevenLabs = useElevenLabsTTS();

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
    const cursorMatch = value.match(/(^|\s)@(\w{0,10})$/);
    setShowMention(!!cursorMatch);
    if (value.trim()) {
      setTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTyping(false), 2000);
    } else {
      setTyping(false);
    }
  }, [setTyping]);

  const insertMention = useCallback(() => {
    setText((prev) => prev.replace(/(^|\s)@\w{0,10}$/, "$1@nexusai "));
    setShowMention(false);
  }, []);

  const isBotRoom = useCallback(() => {
    const roomProfile = roomProfiles[room.id];
    return roomProfile?.username === BOT_USERNAME;
  }, [roomProfiles, room.id]);

  const handleReply = useCallback((msg: ChatMessage) => {
    setReplyTo(msg);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText("");
    setTyping(false);
    const replyToId = replyTo?.id;
    setReplyTo(null);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    const { error } = await sendMessage(room.id, currentUserId, trimmed, "text", undefined, replyToId);
    if (error) { toast.error("Failed to send message"); setSending(false); return; }
    setSending(false);

    const mentionsBot = /(?:^|\s)@nexusai\b/i.test(trimmed);
    const botRoom = isBotRoom();
    if (botRoom || mentionsBot) {
      setBotThinking(true);
      const cleanPrompt = botRoom ? trimmed : trimmed.replace(/@nexusai/gi, "").trim();
      if (cleanPrompt) {
        const { error: botErr } = await triggerBotReply(room.id, cleanPrompt);
        if (botErr) toast.error("Bot failed to reply");
      }
      setBotThinking(false);
    }
  };

  const handleDeleteMessage = async () => {
    if (!deleteMsg) return;
    const { error } = await supabase.from("chat_messages").delete().eq("id", deleteMsg.id);
    if (error) { toast.error("Failed to delete message"); }
    else {
      onDeleteMessage?.(deleteMsg.id);
      toast.success("Message deleted");
    }
    setDeleteMsg(null);
  };

  const canEditMsg = (msg: ChatMessage) => {
    if (msg.sender_id !== currentUserId) return false;
    const ageMs = Date.now() - new Date(msg.created_at).getTime();
    return ageMs < 24 * 60 * 60 * 1000;
  };

  const startEditMsg = (msg: ChatMessage) => {
    setEditingMsgId(msg.id);
    setEditText(msg.content || "");
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const saveEditMsg = async () => {
    if (!editingMsgId || !editText.trim()) { setEditingMsgId(null); return; }
    const { error } = await editChatMessage(editingMsgId, editText.trim());
    if (error) { toast.error("Failed to edit message"); }
    setEditingMsgId(null);
  };

  const handlePinMessage = async (msg: ChatMessage) => {
    const isPinned = !!msg.pinned_at;
    const { error } = await pinChatMessage(msg.id, currentUserId, !isPinned);
    if (error) toast.error("Failed to pin message");
    else toast.success(isPinned ? "Message unpinned" : "Message pinned");
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

  // Build a userId→profile lookup once
  const profileByUserId = useCallback(() => {
    const map: Record<string, UserProfile> = {};
    for (const p of Object.values(profiles)) {
      map[p.user_id] = p;
    }
    return map;
  }, [profiles])();

  const getDisplayName = useCallback((userId: string) => {
    const p = profileByUserId[userId];
    return p?.display_name || p?.username || "User";
  }, [profileByUserId]);

  const isBotMessage = useCallback((userId: string) => {
    return profileByUserId[userId]?.username === BOT_USERNAME;
  }, [profileByUserId]);

  const getAvatar = useCallback((userId: string) => {
    return profileByUserId[userId]?.avatar_url;
  }, [profileByUserId]);

  // Message lookup for reply_to
  const messageById = useMemo(() => {
    const map: Record<string, ChatMessage> = {};
    for (const m of messages) map[m.id] = m;
    return map;
  }, [messages]);

  const otherUser = roomProfiles[room.id] || Object.values(profileByUserId).find((p) => p.user_id !== currentUserId) || null;
  const isBot = roomProfiles[room.id]?.username === BOT_USERNAME;
  const roomName = room.type === "group" ? room.name || "Unnamed Group" : otherUser?.display_name || "Chat";
  const otherUserId = otherUser?.user_id;
  const isOtherOnline = isBot ? true : (otherUserId ? onlineUsers.has(otherUserId) : false);

  const typingNames = Array.from(typingUsers).map((uid) => getDisplayName(uid));
  const typingAvatars = Array.from(typingUsers).map((uid) => getAvatar(uid) || null);

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

  const scrollToMessage = (msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary/40");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary/40"), 2000);
    }
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
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground font-mono">{roomName}</h3>
          <p className={`text-[10px] font-mono ${isOtherOnline || room.type === "group" ? "text-primary" : "text-muted-foreground"}`}>
            {getStatusText()}
          </p>
        </div>
        <VoiceSelector value={elevenLabs.voiceId} onChange={elevenLabs.setVoiceId} />
        <GroupInfoPanel room={room} currentUserId={currentUserId} onlineUsers={onlineUsers} onStartDM={onStartDM} />
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            title="Export conversation as PDF"
            onClick={() => exportMessagesToPdf(
              messages.filter(m => m.message_type === "text" && m.content).map(m => ({
                content: m.content || "",
                sender: getDisplayName(m.sender_id),
                timestamp: format(new Date(m.created_at), "HH:mm"),
                role: m.sender_id === currentUserId ? "user" as const : "assistant" as const,
              })),
              roomName
            )}
          >
            <FileDown className="w-4 h-4" />
          </Button>
        )}
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
          const isMsgBot = isBotMessage(msg.sender_id);
          const repliedMsg = msg.reply_to ? messageById[msg.reply_to] : null;
          return (
            <div key={msg.id} id={`msg-${msg.id}`} className={`group flex gap-2 ${isMe ? "flex-row-reverse" : ""} transition-all rounded-lg`} tabIndex={0}>
              <div className={`w-7 h-7 rounded-full ${isMsgBot ? "bg-primary/20 border-primary/40" : "bg-secondary border-border"} border flex items-center justify-center overflow-hidden shrink-0 mt-1`}>
                {isMsgBot ? (
                  <Bot className="w-3.5 h-3.5 text-primary" />
                ) : avatar ? (
                  <img src={avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] font-mono text-foreground">
                    {getDisplayName(msg.sender_id)[0].toUpperCase()}
                  </span>
                )}
              </div>
              <div className={`max-w-[70%] ${isMe ? "items-end" : "items-start"}`}>
                {!isMe && (room.type === "group" || isMsgBot) && (
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-[10px] text-muted-foreground font-mono">{getDisplayName(msg.sender_id)}</p>
                    {isMsgBot && (
                      <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/25">
                        Bot
                      </span>
                    )}
                  </div>
                )}
                <div className="relative">
                  {editingMsgId === msg.id ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        ref={editInputRef}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEditMsg(); if (e.key === "Escape") setEditingMsgId(null); }}
                        className="text-sm font-mono h-8"
                      />
                      <button onClick={saveEditMsg} className="p-1 rounded bg-primary text-primary-foreground"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setEditingMsgId(null)} className="p-1 rounded bg-secondary text-foreground"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <div
                      className={`rounded-2xl px-3 py-2 text-sm ${
                        isMe
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-secondary text-foreground rounded-bl-sm"
                      } ${msg.pinned_at ? "ring-1 ring-primary/40" : ""}`}
                    >
                      {/* Quoted reply */}
                      {repliedMsg && (
                        <QuotedMessage
                          content={repliedMsg.content}
                          senderName={getDisplayName(repliedMsg.sender_id)}
                          messageType={repliedMsg.message_type}
                          onClick={() => scrollToMessage(repliedMsg.id)}
                        />
                      )}
                      {msg.pinned_at && (
                        <p className="text-[9px] opacity-60 mb-0.5 flex items-center gap-0.5"><Pin className="w-2.5 h-2.5" /> Pinned</p>
                      )}
                      {msg.message_type === "voice" && msg.media_url ? (
                        <VoicePlayer url={msg.media_url} label={msg.content || undefined} />
                      ) : msg.message_type === "image" && msg.media_url ? (
                        <img src={msg.media_url} alt={msg.content || ""} className="rounded-lg max-w-full max-h-60" />
                      ) : msg.message_type === "file" && msg.media_url ? (
                        <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="underline flex items-center gap-1">
                          <Paperclip className="w-3 h-3" /> {msg.content}
                        </a>
                      ) : isMsgBot ? (
                        <div className={`prose prose-sm max-w-none ${isMe ? "prose-invert" : "dark:prose-invert"} [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_pre]:my-1 [&_code]:text-xs [&_code]:bg-background/20 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_blockquote]:border-primary/40 [&_a]:text-primary`}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content || ""}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      )}
                      {msg.edited_at && (
                        <span className="text-[9px] opacity-50 italic ml-1">(edited)</span>
                      )}
                    </div>
                  )}
                  {/* Actions - appears on hover */}
                  {editingMsgId !== msg.id && (
                    <div className={`absolute top-0 ${isMe ? "left-0 -translate-x-full" : "right-0 translate-x-full"} px-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity`}>
                      <button
                        onClick={() => handleReply(msg)}
                        className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        title="Reply"
                      >
                        <Reply className="w-3.5 h-3.5" />
                      </button>
                      <ReactionPicker
                        onSelect={(emoji) => toggleReaction(msg.id, emoji)}
                        align={isMe ? "right" : "left"}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                            title="More actions"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align={isMe ? "end" : "start"}
                          className="min-w-[180px]"
                          onKeyDown={(e) => {
                            const key = e.key.toLowerCase();
                            if (key === "e" && isMe && canEditMsg(msg) && msg.message_type === "text") {
                              e.preventDefault(); startEditMsg(msg);
                            } else if (key === "p") {
                              e.preventDefault(); handlePinMessage(msg);
                            } else if (key === "f") {
                              e.preventDefault(); setForwardMsg(msg);
                            } else if (key === "d" && isMe) {
                              e.preventDefault(); setDeleteMsg(msg);
                            } else if (key === "r" && msg.message_type === "text" && msg.content) {
                              e.preventDefault(); speak(msg.content || "", msg.id);
                            }
                          }}
                        >
                          <DropdownMenuItem onClick={() => handleReply(msg)}>
                            <Reply className="w-3.5 h-3.5 mr-2" /> Reply
                          </DropdownMenuItem>
                          {isMe && canEditMsg(msg) && msg.message_type === "text" && (
                            <DropdownMenuItem onClick={() => startEditMsg(msg)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                              <DropdownMenuShortcut>E</DropdownMenuShortcut>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handlePinMessage(msg)}>
                            {msg.pinned_at ? <PinOff className="w-3.5 h-3.5 mr-2" /> : <Pin className="w-3.5 h-3.5 mr-2" />}
                            {msg.pinned_at ? "Unpin" : "Pin"}
                            <DropdownMenuShortcut>P</DropdownMenuShortcut>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setForwardMsg(msg)}>
                            <Forward className="w-3.5 h-3.5 mr-2" /> Forward
                            <DropdownMenuShortcut>F</DropdownMenuShortcut>
                          </DropdownMenuItem>
                          {msg.message_type === "text" && msg.content && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => elevenLabs.play(msg.content || "", msg.id)} disabled={elevenLabs.loadingId === msg.id}>
                                {elevenLabs.loadingId === msg.id ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : elevenLabs.playingId === msg.id ? <Square className="w-3.5 h-3.5 mr-2" /> : <Play className="w-3.5 h-3.5 mr-2" />}
                                {elevenLabs.playingId === msg.id ? "Stop AI Voice" : "Play AI Voice"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => speak(msg.content || "", msg.id)}>
                                {speaking === msg.id ? <VolumeX className="w-3.5 h-3.5 mr-2" /> : <Volume2 className="w-3.5 h-3.5 mr-2" />}
                                {speaking === msg.id ? "Stop Reading" : "Read Aloud"}
                                <DropdownMenuShortcut>R</DropdownMenuShortcut>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => elevenLabs.download(msg.content || "", msg.id)} disabled={elevenLabs.loadingId === msg.id}>
                                <Download className="w-3.5 h-3.5 mr-2" /> Download Audio
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => exportMessageAsPdf({
                                content: msg.content || "",
                                sender: getDisplayName(msg.sender_id),
                                timestamp: format(new Date(msg.created_at), "HH:mm"),
                                role: isMe ? "user" : "assistant",
                              })}>
                                <FileDown className="w-3.5 h-3.5 mr-2" /> Export as PDF
                              </DropdownMenuItem>
                            </>
                          )}
                          {isMe && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setDeleteMsg(msg)} className="text-destructive focus:text-destructive">
                                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                                <DropdownMenuShortcut>D</DropdownMenuShortcut>
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
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
        {botThinking && <TypingBubble names={["NexusAI Bot"]} avatars={[null]} />}
        <TypingBubble names={typingNames} avatars={typingAvatars} />
      </div>

      {/* Input */}
      <div className="relative px-4 py-3 border-t border-border bg-card">
        {/* @mention autocomplete */}
        {showMention && (
          <div className="absolute bottom-full left-4 right-4 mb-1 z-10">
            <button
              onClick={insertMention}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-card border border-border shadow-lg hover:bg-secondary transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground font-mono">@nexusai</p>
                <p className="text-[10px] text-muted-foreground">Summon NexusAI Bot into this conversation</p>
              </div>
              <span className="ml-auto text-[10px] text-muted-foreground font-mono">Tab ↹</span>
            </button>
          </div>
        )}

        {/* Reply preview */}
        {replyTo && (
          <div className="mb-2">
            <ReplyPreview
              message={replyTo}
              senderName={getDisplayName(replyTo.sender_id)}
              onCancel={() => setReplyTo(null)}
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="w-4 h-4" />
          </Button>
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => handleTyping(e.target.value)}
            onKeyDown={(e) => {
              if (showMention && (e.key === "Tab" || e.key === "Enter")) {
                e.preventDefault();
                insertMention();
                return;
              }
              if (e.key === "Escape" && replyTo) {
                setReplyTo(null);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) handleSend();
            }}
            placeholder="Type a message... (@ to mention NexusAI)"
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

      <AlertDialog open={deleteMsg !== null} onOpenChange={(open) => !open && setDeleteMsg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete message?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The message will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMessage} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
