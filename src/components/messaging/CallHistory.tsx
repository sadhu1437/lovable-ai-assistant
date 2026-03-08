import { useState, useEffect, useCallback } from "react";
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfilesByUserIds, type UserProfile } from "@/lib/messaging";

interface CallRecord {
  id: string;
  room_id: string;
  caller_id: string;
  callee_id: string | null;
  call_type: string;
  status: string;
  is_group_call: boolean;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

interface CallHistoryProps {
  currentUserId: string;
  open: boolean;
  onClose: () => void;
  onJumpToRoom?: (roomId: string) => void;
}

function formatDuration(startedAt: string | null, endedAt: string | null): string {
  if (!startedAt || !endedAt) return "—";
  const seconds = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getStatusInfo(status: string, callerId: string, currentUserId: string) {
  switch (status) {
    case "missed":
      return { icon: PhoneMissed, label: "Missed", color: "text-destructive" };
    case "rejected":
      return { icon: PhoneMissed, label: "Rejected", color: "text-destructive" };
    case "ended":
      return {
        icon: callerId === currentUserId ? PhoneOutgoing : PhoneIncoming,
        label: callerId === currentUserId ? "Outgoing" : "Incoming",
        color: "text-primary",
      };
    case "active":
      return { icon: Phone, label: "Active", color: "text-green-500" };
    default:
      return { icon: Phone, label: status, color: "text-muted-foreground" };
  }
}

export function CallHistory({ currentUserId, open, onClose, onJumpToRoom }: CallHistoryProps) {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);

  const loadCalls = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("calls")
      .select("*")
      .or(`caller_id.eq.${currentUserId},callee_id.eq.${currentUserId}`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) {
      setCalls(data as unknown as CallRecord[]);

      // Collect user IDs to fetch profiles
      const userIds = new Set<string>();
      for (const call of data as any[]) {
        if (call.caller_id) userIds.add(call.caller_id);
        if (call.callee_id) userIds.add(call.callee_id);
      }
      userIds.delete(currentUserId);

      if (userIds.size > 0) {
        const fetchedProfiles = await fetchProfilesByUserIds(Array.from(userIds));
        const profileMap: Record<string, UserProfile> = {};
        for (const p of fetchedProfiles) {
          profileMap[p.user_id] = p;
        }
        setProfiles(profileMap);
      }
    }
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => {
    if (open) loadCalls();
  }, [open, loadCalls]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold font-mono text-foreground">Call History</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Call list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : calls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Phone className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-xs font-mono">No call history yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {calls.map((call) => {
                const otherUserId = call.caller_id === currentUserId ? call.callee_id : call.caller_id;
                const otherProfile = otherUserId ? profiles[otherUserId] : null;
                const statusInfo = getStatusInfo(call.status, call.caller_id, currentUserId);
                const StatusIcon = statusInfo.icon;
                const isVideo = call.call_type === "video";
                const duration = formatDuration(call.started_at, call.ended_at);

                return (
                  <button
                    key={call.id}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
                    onClick={() => {
                      onJumpToRoom?.(call.room_id);
                      onClose();
                    }}
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 overflow-hidden">
                      {call.is_group_call ? (
                        <Users className="w-4 h-4 text-foreground" />
                      ) : otherProfile?.avatar_url ? (
                        <img src={otherProfile.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-mono text-foreground">
                          {(otherProfile?.display_name || otherProfile?.username || "?")[0].toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium font-mono text-foreground truncate">
                        {call.is_group_call
                          ? "Group Call"
                          : otherProfile?.display_name || otherProfile?.username || "Unknown"}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <StatusIcon className={`w-3 h-3 ${statusInfo.color}`} />
                        <span className={`text-[10px] font-mono ${statusInfo.color}`}>{statusInfo.label}</span>
                        {duration !== "—" && (
                          <span className="text-[10px] font-mono text-muted-foreground">• {duration}</span>
                        )}
                      </div>
                    </div>

                    {/* Type & time */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {formatTime(call.created_at)}
                      </span>
                      {isVideo ? (
                        <Video className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : (
                        <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
