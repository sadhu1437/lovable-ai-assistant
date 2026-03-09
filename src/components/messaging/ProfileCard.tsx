import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { User, Clock, MessageSquare, Camera, Loader2, Pencil, Check, X, ExternalLink, Ban, Flag } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OnlineIndicator } from "./OnlineIndicator";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

interface ProfileCardProps {
  userId: string;
  children: React.ReactNode;
  onlineUsers?: Set<string>;
  onStartDM?: (userId: string) => void;
  currentUserId?: string;
}

interface FullProfile {
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  gender: string | null;
  status_message: string | null;
  last_seen: string | null;
  created_at: string;
}

export function ProfileCard({ userId, children, onlineUsers, onStartDM, currentUserId }: ProfileCardProps) {
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusDraft, setStatusDraft] = useState("");
  const [isBlocked, setIsBlocked] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open || !userId) return;
    supabase
      .from("profiles")
      .select("display_name, username, avatar_url, bio, gender, status_message, last_seen, created_at")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile(data as any);
      });
    // Check block status
    if (currentUserId && currentUserId !== userId) {
      supabase
        .from("blocked_users")
        .select("id")
        .eq("blocker_id", currentUserId)
        .eq("blocked_id", userId)
        .maybeSingle()
        .then(({ data }) => setIsBlocked(!!data));
    }
  }, [open, userId, currentUserId]);

  const isOnline = onlineUsers?.has(userId);
  const isMe = currentUserId === userId;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isMe) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${userId}/avatar.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) {
      toast.error("Upload failed");
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("user_id", userId);
    setProfile((prev) => prev ? { ...prev, avatar_url: publicUrl } : prev);
    toast.success("Avatar updated!");
    setUploading(false);
  };

  const saveStatus = async () => {
    if (!isMe) return;
    const val = statusDraft.trim() || null;
    await supabase.from("profiles").update({ status_message: val } as any).eq("user_id", userId);
    setProfile((prev) => prev ? { ...prev, status_message: val } : prev);
    setEditingStatus(false);
    toast.success("Status updated");
  };

  const handleBlockToggle = async () => {
    if (!currentUserId || isMe) return;
    setBlocking(true);
    if (isBlocked) {
      await supabase.from("blocked_users").delete().eq("blocker_id", currentUserId).eq("blocked_id", userId);
      setIsBlocked(false);
      toast.success("User unblocked");
    } else {
      await supabase.from("blocked_users").insert({ blocker_id: currentUserId, blocked_id: userId });
      setIsBlocked(true);
      toast.success("User blocked");
    }
    setBlocking(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="focus:outline-none cursor-pointer" onClick={(e) => e.stopPropagation()}>
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 overflow-hidden border-border bg-card shadow-xl"
        align="start"
        sideOffset={8}
        onClick={(e) => e.stopPropagation()}
      >
        {!profile ? (
          <div className="p-6 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Banner + Avatar */}
            <div className="h-16 bg-gradient-to-r from-primary/30 to-accent/30 relative">
              <div className="absolute -bottom-8 left-4">
                <div className="relative group/avatar">
                  <div className="w-16 h-16 rounded-full border-4 border-card bg-secondary flex items-center justify-center overflow-hidden">
                    {uploading ? (
                      <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
                    ) : profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-7 h-7 text-muted-foreground" />
                    )}
                  </div>
                  {/* Camera overlay for own profile */}
                  {isMe && !uploading && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 rounded-full bg-background/60 opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                      title="Change photo"
                    >
                      <Camera className="w-5 h-5 text-foreground" />
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                  {isOnline !== undefined && (
                    <div className="absolute bottom-0 right-0">
                      <OnlineIndicator isOnline={!!isOnline} size="md" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="pt-10 px-4 pb-4 space-y-3">
              {/* Name */}
              <div>
                <p className="text-sm font-semibold font-mono text-foreground leading-tight">
                  {profile.display_name || profile.username || "Unknown"}
                </p>
                {profile.username && (
                  <p className="text-xs text-muted-foreground font-mono">@{profile.username}</p>
                )}
              </div>

              {/* Status message */}
              <div className="min-h-[20px]">
                {editingStatus ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={statusDraft}
                      onChange={(e) => setStatusDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveStatus(); if (e.key === "Escape") setEditingStatus(false); }}
                      placeholder="Set a status..."
                      maxLength={80}
                      className="flex-1 text-xs font-mono bg-secondary/50 border border-border rounded px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button onClick={saveStatus} className="p-1 rounded bg-primary text-primary-foreground"><Check className="w-3 h-3" /></button>
                    <button onClick={() => setEditingStatus(false)} className="p-1 rounded bg-secondary text-foreground"><X className="w-3 h-3" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    {profile.status_message ? (
                      <p className="text-xs text-primary font-mono italic">💬 {profile.status_message}</p>
                    ) : isMe ? (
                      <p className="text-xs text-muted-foreground font-mono italic">No status set</p>
                    ) : null}
                    {isMe && (
                      <button
                        onClick={() => { setStatusDraft(profile.status_message || ""); setEditingStatus(true); }}
                        className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit status"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="space-y-1.5">
                {profile.gender && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-mono capitalize">{profile.gender}</span>
                  </div>
                )}
                {profile.bio && (
                  <p className="text-xs text-foreground/80 font-mono leading-relaxed">{profile.bio}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-mono">
                    {isOnline
                      ? "Online now"
                      : profile.last_seen
                        ? `Last seen ${format(new Date(profile.last_seen), "MMM d, h:mm a")}`
                        : `Joined ${format(new Date(profile.created_at), "MMM d, yyyy")}`}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-1.5">
                {!isMe && onStartDM && (
                  <button
                    onClick={() => { onStartDM(userId); setOpen(false); }}
                    disabled={isBlocked}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-mono font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Send Message
                  </button>
                )}
                {!isMe && currentUserId && (
                  <button
                    onClick={handleBlockToggle}
                    disabled={blocking}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-mono font-medium transition-colors ${
                      isBlocked 
                        ? "bg-secondary text-foreground hover:bg-secondary/80" 
                        : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    }`}
                  >
                    {blocking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                    {isBlocked ? "Unblock" : "Block"}
                  </button>
                )}
                <button
                  onClick={() => { setOpen(false); navigate(`/profile/${userId}`); }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-mono font-medium hover:bg-secondary/80 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View Full Profile
                </button>
              </div>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
