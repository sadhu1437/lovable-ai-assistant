import { useState, useEffect } from "react";
import { User, MapPin, Clock, MessageSquare } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OnlineIndicator } from "./OnlineIndicator";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

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
  last_seen: string | null;
  created_at: string;
}

export function ProfileCard({ userId, children, onlineUsers, onStartDM, currentUserId }: ProfileCardProps) {
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    supabase
      .from("profiles")
      .select("display_name, username, avatar_url, bio, gender, last_seen, created_at")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile(data as any);
      });
  }, [open, userId]);

  const isOnline = onlineUsers?.has(userId);
  const isMe = currentUserId === userId;

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
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-card bg-secondary flex items-center justify-center overflow-hidden">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-7 h-7 text-muted-foreground" />
                    )}
                  </div>
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

              {/* Action */}
              {!isMe && onStartDM && (
                <button
                  onClick={() => {
                    onStartDM(userId);
                    setOpen(false);
                  }}
                  className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-mono font-medium hover:bg-primary/90 transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Send Message
                </button>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
