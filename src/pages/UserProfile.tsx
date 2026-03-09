import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, User, Clock, MessageSquare, Camera, Loader2, Pencil, Check, X, Calendar, AtSign, Shield, Ban, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { OnlineIndicator } from "@/components/messaging/OnlineIndicator";
import { usePresence } from "@/hooks/usePresence";
import { createDM } from "@/lib/messaging";

interface FullProfile {
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  gender: string | null;
  status_message: string | null;
  last_seen: string | null;
  created_at: string;
  user_id: string;
}

export default function UserProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [statusDraft, setStatusDraft] = useState("");
  const [bioDraft, setBioDraft] = useState("");
  const [startingDM, setStartingDM] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportReason, setReportReason] = useState("inappropriate");
  const [reportDescription, setReportDescription] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const presence = usePresence(user?.id, null);

  const isMe = user?.id === userId;
  const isOnline = userId ? presence.onlineUsers.has(userId) : false;

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    supabase
      .from("profiles")
      .select("display_name, username, avatar_url, bio, gender, status_message, last_seen, created_at, user_id")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile(data as FullProfile);
        setLoading(false);
      });
  }, [userId]);

  // Check if user is blocked
  useEffect(() => {
    if (!user?.id || !userId || isMe) return;
    supabase
      .from("blocked_users")
      .select("id")
      .eq("blocker_id", user.id)
      .eq("blocked_id", userId)
      .maybeSingle()
      .then(({ data }) => setIsBlocked(!!data));
  }, [user?.id, userId, isMe]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isMe || !userId) return;
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
    if (!isMe || !userId) return;
    const val = statusDraft.trim() || null;
    await supabase.from("profiles").update({ status_message: val } as any).eq("user_id", userId);
    setProfile((prev) => prev ? { ...prev, status_message: val } : prev);
    setEditingStatus(false);
    toast.success("Status updated");
  };

  const saveBio = async () => {
    if (!isMe || !userId) return;
    const val = bioDraft.trim() || null;
    await supabase.from("profiles").update({ bio: val }).eq("user_id", userId);
    setProfile((prev) => prev ? { ...prev, bio: val } : prev);
    setEditingBio(false);
    toast.success("Bio updated");
  };

  const handleStartDM = async () => {
    if (!user?.id || !userId || isMe) return;
    setStartingDM(true);
    const roomId = await createDM(user.id, userId);
    setStartingDM(false);
    if (roomId) {
      navigate("/messages");
    }
  };

  const handleBlockToggle = async () => {
    if (!user?.id || !userId || isMe) return;
    setBlocking(true);
    if (isBlocked) {
      await supabase.from("blocked_users").delete().eq("blocker_id", user.id).eq("blocked_id", userId);
      setIsBlocked(false);
      toast.success("User unblocked");
    } else {
      await supabase.from("blocked_users").insert({ blocker_id: user.id, blocked_id: userId });
      setIsBlocked(true);
      toast.success("User blocked");
    }
    setBlocking(false);
  };

  const handleReport = async () => {
    if (!user?.id || !userId || isMe) return;
    setSubmittingReport(true);
    const { error } = await supabase.from("user_reports").insert({
      reporter_id: user.id,
      reported_id: userId,
      reason: reportReason,
      description: reportDescription.trim() || null
    });
    setSubmittingReport(false);
    if (error) {
      toast.error("Failed to submit report");
    } else {
      toast.success("Report submitted");
      setShowReportDialog(false);
      setReportDescription("");
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center gap-4">
        <User className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground font-mono">User not found</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Go back
        </Button>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background overflow-auto">
      {/* Banner */}
      <div className="h-40 md:h-56 bg-gradient-to-br from-primary/30 via-accent/20 to-secondary relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 left-4 bg-background/50 backdrop-blur-sm hover:bg-background/70 z-10"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
      </div>

      {/* Profile content */}
      <div className="max-w-2xl mx-auto px-4 md:px-8 -mt-16 relative z-10 pb-12">
        {/* Avatar */}
        <div className="relative group/avatar w-28 h-28 md:w-32 md:h-32">
          <div className="w-full h-full rounded-full border-4 border-background bg-secondary flex items-center justify-center overflow-hidden shadow-lg">
            {uploading ? (
              <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
            ) : profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="w-12 h-12 text-muted-foreground" />
            )}
          </div>
          {isMe && !uploading && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 rounded-full bg-background/60 opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
              title="Change photo"
            >
              <Camera className="w-6 h-6 text-foreground" />
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          <div className="absolute bottom-1 right-1">
            <span className={`block w-4 h-4 rounded-full border-2 border-background ${isOnline ? "bg-green-500" : "bg-muted-foreground/40"}`} />
          </div>
        </div>

        {/* Name & username */}
        <div className="mt-4">
          <h1 className="text-2xl font-bold font-mono text-foreground">
            {profile.display_name || profile.username || "Unknown User"}
          </h1>
          {profile.username && (
            <p className="text-sm text-muted-foreground font-mono flex items-center gap-1.5 mt-0.5">
              <AtSign className="w-3.5 h-3.5" />
              {profile.username}
            </p>
          )}
        </div>

        {/* Status message */}
        <div className="mt-4 p-3 rounded-lg bg-card border border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Status</span>
            {isMe && !editingStatus && (
              <button
                onClick={() => { setStatusDraft(profile.status_message || ""); setEditingStatus(true); }}
                className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {editingStatus ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveStatus(); if (e.key === "Escape") setEditingStatus(false); }}
                placeholder="Set a status..."
                maxLength={80}
                className="flex-1 text-sm font-mono bg-secondary/50 border border-border rounded px-3 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <Button size="sm" onClick={saveStatus}><Check className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="secondary" onClick={() => setEditingStatus(false)}><X className="w-3.5 h-3.5" /></Button>
            </div>
          ) : (
            <p className="text-sm font-mono text-foreground">
              {profile.status_message ? `💬 ${profile.status_message}` : <span className="text-muted-foreground italic">No status set</span>}
            </p>
          )}
        </div>

        {/* Bio */}
        <div className="mt-3 p-3 rounded-lg bg-card border border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Bio</span>
            {isMe && !editingBio && (
              <button
                onClick={() => { setBioDraft(profile.bio || ""); setEditingBio(true); }}
                className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {editingBio ? (
            <div className="space-y-2">
              <textarea
                autoFocus
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setEditingBio(false); }}
                placeholder="Write something about yourself..."
                maxLength={300}
                rows={3}
                className="w-full text-sm font-mono bg-secondary/50 border border-border rounded px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveBio}><Check className="w-3.5 h-3.5 mr-1" /> Save</Button>
                <Button size="sm" variant="secondary" onClick={() => setEditingBio(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm font-mono text-foreground leading-relaxed">
              {profile.bio || <span className="text-muted-foreground italic">No bio yet</span>}
            </p>
          )}
        </div>

        {/* Details grid */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {profile.gender && (
            <div className="p-3 rounded-lg bg-card border border-border flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground">Gender</p>
                <p className="text-sm font-mono text-foreground capitalize">{profile.gender}</p>
              </div>
            </div>
          )}
          <div className="p-3 rounded-lg bg-card border border-border flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-mono text-muted-foreground">Status</p>
              <p className="text-sm font-mono text-foreground">
                {isOnline
                  ? "Online now"
                  : profile.last_seen
                    ? `Last seen ${format(new Date(profile.last_seen), "MMM d, h:mm a")}`
                    : "Offline"}
              </p>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-card border border-border flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-mono text-muted-foreground">Joined</p>
              <p className="text-sm font-mono text-foreground">{format(new Date(profile.created_at), "MMMM d, yyyy")}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        {!isMe && user && (
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              onClick={handleStartDM}
              disabled={startingDM || isBlocked}
            >
              {startingDM ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <MessageSquare className="w-4 h-4 mr-2" />
              )}
              Send Message
            </Button>
            <Button
              variant={isBlocked ? "secondary" : "destructive"}
              onClick={handleBlockToggle}
              disabled={blocking}
            >
              {blocking ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Ban className="w-4 h-4 mr-2" />
              )}
              {isBlocked ? "Unblock" : "Block"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowReportDialog(true)}
            >
              <Flag className="w-4 h-4 mr-2" />
              Report
            </Button>
          </div>
        )}

        {/* Report Dialog */}
        {showReportDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="w-full max-w-md mx-4 p-6 rounded-lg bg-card border border-border shadow-xl">
              <h3 className="text-lg font-semibold font-mono text-foreground mb-4">Report User</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-mono text-muted-foreground mb-1.5 block">Reason</label>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="inappropriate">Inappropriate behavior</option>
                    <option value="spam">Spam</option>
                    <option value="harassment">Harassment</option>
                    <option value="impersonation">Impersonation</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-mono text-muted-foreground mb-1.5 block">Description (optional)</label>
                  <textarea
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    placeholder="Provide additional details..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button onClick={handleReport} disabled={submittingReport} className="flex-1">
                    {submittingReport ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Submit Report
                  </Button>
                  <Button variant="secondary" onClick={() => setShowReportDialog(false)} className="flex-1">
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
