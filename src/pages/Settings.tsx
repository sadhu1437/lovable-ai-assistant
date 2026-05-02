import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, User, Cpu, Sliders, Upload, Database, Trash2, HardDrive, Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getAllCacheStats, clearAllCaches, audioCache, dataCache, getPersistedStats } from "@/lib/audioCache";

const AI_MODELS = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash", desc: "Fast & balanced" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", desc: "Top-tier reasoning" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", desc: "Cost-effective" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", desc: "Fastest" },
  { value: "openai/gpt-5", label: "GPT-5", desc: "Powerful all-rounder" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini", desc: "Balanced cost & quality" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano", desc: "Speed optimized" },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

const TTL_OPTIONS = [
  { label: "30s", ms: 30 * 1000 },
  { label: "1 min", ms: 60 * 1000 },
  { label: "2 min", ms: 2 * 60 * 1000 },
  { label: "5 min", ms: 5 * 60 * 1000 },
  { label: "15 min", ms: 15 * 60 * 1000 },
  { label: "30 min", ms: 30 * 60 * 1000 },
  { label: "1 hr", ms: 60 * 60 * 1000 },
];

const AUDIO_SIZE_OPTIONS = [
  { label: "10 MB", bytes: 10 * 1024 * 1024 },
  { label: "25 MB", bytes: 25 * 1024 * 1024 },
  { label: "50 MB", bytes: 50 * 1024 * 1024 },
  { label: "100 MB", bytes: 100 * 1024 * 1024 },
  { label: "200 MB", bytes: 200 * 1024 * 1024 },
];

const DATA_SIZE_OPTIONS = [
  { label: "1 MB", bytes: 1 * 1024 * 1024 },
  { label: "5 MB", bytes: 5 * 1024 * 1024 },
  { label: "10 MB", bytes: 10 * 1024 * 1024 },
  { label: "25 MB", bytes: 25 * 1024 * 1024 },
];

function formatTTL(ms: number): string {
  if (ms >= 3600000) return `${Math.round(ms / 3600000)} hr`;
  if (ms >= 60000) return `${Math.round(ms / 60000)} min`;
  return `${Math.round(ms / 1000)}s`;
}

function CacheStatsPanel() {
  const [stats, setStats] = useState(getAllCacheStats());
  const [diskStats, setDiskStats] = useState<{ audioEntries: number; dataEntries: number } | null>(null);
  const [audioTTL, setAudioTTL] = useState(() => {
    const saved = localStorage.getItem("nexus-cache-ttl-audio");
    return saved ? Number(saved) : audioCache.stats.defaultTTL;
  });
  const [dataTTL, setDataTTL] = useState(() => {
    const saved = localStorage.getItem("nexus-cache-ttl-data");
    return saved ? Number(saved) : dataCache.stats.defaultTTL;
  });
  const [audioMaxBytes, setAudioMaxBytes] = useState(() => audioCache.stats.maxBytes);
  const [dataMaxBytes, setDataMaxBytes] = useState(() => dataCache.stats.maxBytes);

  const refresh = () => {
    setStats(getAllCacheStats());
    setAudioMaxBytes(audioCache.stats.maxBytes);
    setDataMaxBytes(dataCache.stats.maxBytes);
    getPersistedStats().then(setDiskStats).catch(() => {});
  };

  useEffect(() => {
    getPersistedStats().then(setDiskStats).catch(() => {});
  }, []);

  const handleClear = () => {
    clearAllCaches();
    refresh();
    toast.success("All caches cleared (memory + disk)");
  };

  const updateAudioTTL = (ms: string) => {
    const val = Number(ms);
    setAudioTTL(val);
    audioCache.setDefaultTTL(val);
    localStorage.setItem("nexus-cache-ttl-audio", String(val));
    toast.success(`Audio TTL set to ${formatTTL(val)}`);
  };

  const updateDataTTL = (ms: string) => {
    const val = Number(ms);
    setDataTTL(val);
    dataCache.setDefaultTTL(val);
    localStorage.setItem("nexus-cache-ttl-data", String(val));
    toast.success(`Data TTL set to ${formatTTL(val)}`);
  };

  const updateAudioSize = (bytes: string) => {
    const val = Number(bytes);
    setAudioMaxBytes(val);
    audioCache.setMaxBytes(val);
    localStorage.setItem("nexus-cache-size-audio", String(val));
    refresh();
    toast.success(`Audio cache limit set to ${formatBytes(val)}`);
  };

  const updateDataSize = (bytes: string) => {
    const val = Number(bytes);
    setDataMaxBytes(val);
    dataCache.setMaxBytes(val);
    localStorage.setItem("nexus-cache-size-data", String(val));
    refresh();
    toast.success(`Data cache limit set to ${formatBytes(val)}`);
  };

  useEffect(() => {
    const savedAudio = localStorage.getItem("nexus-cache-ttl-audio");
    if (savedAudio) audioCache.setDefaultTTL(Number(savedAudio));
    const savedData = localStorage.getItem("nexus-cache-ttl-data");
    if (savedData) dataCache.setDefaultTTL(Number(savedData));
  }, []);

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base font-mono">Cache Management</CardTitle>
        <CardDescription>View memory usage, configure TTL, and clear cached data. Entries persist to disk via IndexedDB.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {stats.map((s) => {
          const pct = s.maxBytes > 0 ? (s.bytesUsed / s.maxBytes) * 100 : 0;
          const isAudio = s.label.includes("Audio");
          const currentTTL = isAudio ? audioTTL : dataTTL;
          const onChangeTTL = isAudio ? updateAudioTTL : updateDataTTL;
          const currentMaxBytes = isAudio ? audioMaxBytes : dataMaxBytes;
          const onChangeSize = isAudio ? updateAudioSize : updateDataSize;
          const sizeOptions = isAudio ? AUDIO_SIZE_OPTIONS : DATA_SIZE_OPTIONS;
          const diskCount = diskStats
            ? isAudio ? diskStats.audioEntries : diskStats.dataEntries
            : null;
          return (
            <div key={s.label} className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5">
                <p className="text-sm font-medium text-foreground font-mono truncate">{s.label}</p>
                <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                  {s.entries} items • {formatBytes(s.bytesUsed)} / {formatBytes(s.maxBytes)}
                </span>
              </div>
              <Progress value={pct} className="h-2" />
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground font-mono">TTL:</span>
                  <Select value={String(currentTTL)} onValueChange={onChangeTTL}>
                    <SelectTrigger className="h-7 w-24 text-xs font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TTL_OPTIONS.map((opt) => (
                        <SelectItem key={opt.ms} value={String(opt.ms)} className="text-xs font-mono">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground font-mono">Max:</span>
                  <Select value={String(currentMaxBytes)} onValueChange={onChangeSize}>
                    <SelectTrigger className="h-7 w-24 text-xs font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sizeOptions.map((opt) => (
                        <SelectItem key={opt.bytes} value={String(opt.bytes)} className="text-xs font-mono">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {diskCount !== null && (
                  <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1 ml-auto">
                    <HardDrive className="w-3 h-3" />
                    {diskCount} on disk
                  </span>
                )}
              </div>
            </div>
          );
        })}

        <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground">
              Total: {formatBytes(stats.reduce((a, s) => a + s.bytesUsed, 0))} in memory
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh} className="font-mono text-xs">
              Refresh
            </Button>
            <Button variant="destructive" size="sm" onClick={handleClear} className="gap-1.5 font-mono text-xs">
              <Trash2 className="w-3 h-3" />
              Clear All
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface BlockedUser {
  id: string;
  blocked_id: string;
  created_at: string;
  profile?: { display_name: string | null; username: string | null; avatar_url: string | null };
}

function BlockedUsersPanel({ userId }: { userId?: string }) {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchBlocked = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from("blocked_users")
      .select("id, blocked_id, created_at")
      .eq("blocker_id", userId)
      .order("created_at", { ascending: false });

    if (data && data.length > 0) {
      // Fetch profiles for blocked users
      const blockedIds = data.map((b) => b.blocked_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username, avatar_url")
        .in("user_id", blockedIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);
      setBlockedUsers(
        data.map((b) => ({
          ...b,
          profile: profileMap.get(b.blocked_id) || undefined,
        }))
      );
    } else {
      setBlockedUsers([]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchBlocked();
  }, [fetchBlocked]);

  const handleUnblock = async (blockedId: string) => {
    if (!userId) return;
    setUnblocking(blockedId);
    await supabase.from("blocked_users").delete().eq("blocker_id", userId).eq("blocked_id", blockedId);
    setBlockedUsers((prev) => prev.filter((b) => b.blocked_id !== blockedId));
    setUnblocking(null);
    toast.success("User unblocked");
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base font-mono">Blocked Users</CardTitle>
        <CardDescription>Manage users you've blocked. Blocked users cannot message you.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : blockedUsers.length === 0 ? (
          <div className="text-center py-8">
            <Ban className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground font-mono">No blocked users</p>
          </div>
        ) : (
          <div className="space-y-2">
            {blockedUsers.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border"
              >
                <div
                  className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => navigate(`/profile/${b.blocked_id}`)}
                >
                  <div className="w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden">
                    {b.profile?.avatar_url ? (
                      <img src={b.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-mono font-medium text-foreground">
                      {b.profile?.display_name || b.profile?.username || "Unknown User"}
                    </p>
                    {b.profile?.username && (
                      <p className="text-xs text-muted-foreground font-mono">@{b.profile.username}</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUnblock(b.blocked_id)}
                  disabled={unblocking === b.blocked_id}
                  className="font-mono text-xs"
                >
                  {unblocking === b.blocked_id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    "Unblock"
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [gender, setGender] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [defaultModel, setDefaultModel] = useState(() =>
    localStorage.getItem("nexus-default-model") || "google/gemini-3-flash-preview"
  );
  const [sendOnEnter, setSendOnEnter] = useState(() =>
    localStorage.getItem("nexus-send-enter") !== "false"
  );
  const [streamResponses, setStreamResponses] = useState(() =>
    localStorage.getItem("nexus-stream") !== "false"
  );
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    supabase
      .from("profiles")
      .select("display_name, avatar_url, username")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setDisplayName(data.display_name || "");
          setAvatarUrl(data.avatar_url || "");
          setUsername((data as any).username || "");
          setBio((data as any).bio || "");
          setGender((data as any).gender || "");
          setStatusMessage((data as any).status_message || "");
        }
        setLoading(false);
      });
  }, [user, navigate]);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName, avatar_url: avatarUrl, username: username || null, bio: bio || null, gender: gender || null, status_message: statusMessage || null } as any)
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Failed to save profile");
    } else {
      toast.success("Profile saved");
    }
  };

  const savePreferences = () => {
    localStorage.setItem("nexus-default-model", defaultModel);
    localStorage.setItem("nexus-send-enter", String(sendOnEnter));
    localStorage.setItem("nexus-stream", String(streamResponses));
    toast.success("Preferences saved");
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2MB");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) {
      toast.error("Upload failed");
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    setAvatarUrl(publicUrl);
    await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("user_id", user.id);
    toast.success("Avatar uploaded");
    setUploading(false);
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-foreground font-mono">Settings</h1>
            <p className="text-xs text-muted-foreground">Customize your SmartAI experience</p>
          </div>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="bg-secondary border border-border w-full overflow-x-auto flex-nowrap justify-start sm:justify-center">
            <TabsTrigger value="profile" className="gap-1.5 font-mono text-xs">
              <User className="w-3.5 h-3.5" /> Profile
            </TabsTrigger>
            <TabsTrigger value="model" className="gap-1.5 font-mono text-xs">
              <Cpu className="w-3.5 h-3.5" /> AI Model
            </TabsTrigger>
            <TabsTrigger value="preferences" className="gap-1.5 font-mono text-xs">
              <Sliders className="w-3.5 h-3.5" /> Preferences
            </TabsTrigger>
            <TabsTrigger value="blocked" className="gap-1.5 font-mono text-xs">
              <Ban className="w-3.5 h-3.5" /> Blocked
            </TabsTrigger>
            <TabsTrigger value="cache" className="gap-1.5 font-mono text-xs">
              <Database className="w-3.5 h-3.5" /> Cache
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base font-mono">Profile</CardTitle>
                <CardDescription>Manage your display name and avatar.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 mb-2">
                  <div
                    className="w-14 h-14 rounded-full bg-secondary border border-border flex items-center justify-center text-xl font-mono text-foreground overflow-hidden relative group cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      (displayName || user?.email || "U")[0].toUpperCase()
                    )}
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                      <Upload className="w-4 h-4 text-white" />
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">{user?.email}</div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="text-xs text-primary hover:underline mt-0.5"
                    >
                      {uploading ? "Uploading…" : "Upload photo"}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="displayName" className="font-mono text-xs">Display Name</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username" className="font-mono text-xs">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    placeholder="your_username"
                    className="font-mono text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">Others can find you by this username in Messages.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="avatarUrl" className="font-mono text-xs">Avatar URL</Label>
                  <Input
                    id="avatarUrl"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://example.com/avatar.png"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio" className="font-mono text-xs">Bio</Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell others a little about yourself…"
                    className="font-mono text-sm resize-none"
                    rows={3}
                    maxLength={200}
                  />
                  <p className="text-[10px] text-muted-foreground">{bio.length}/200 characters</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gender" className="font-mono text-xs">Gender</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger className="font-mono text-sm">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="non-binary">Non-binary</SelectItem>
                      <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="statusMessage" className="font-mono text-xs">Status Message</Label>
                  <Input
                    id="statusMessage"
                    value={statusMessage}
                    onChange={(e) => setStatusMessage(e.target.value)}
                    placeholder="e.g. In a meeting, Available, On vacation..."
                    className="font-mono text-sm"
                    maxLength={80}
                  />
                  <p className="text-[10px] text-muted-foreground">{statusMessage.length}/80 characters</p>
                </div>
                <Button onClick={saveProfile} disabled={saving} className="gap-2 font-mono text-xs">
                  <Save className="w-3.5 h-3.5" />
                  {saving ? "Saving…" : "Save Profile"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Model Tab */}
          <TabsContent value="model">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base font-mono">Default AI Model</CardTitle>
                <CardDescription>Choose which model new conversations start with.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={defaultModel} onValueChange={setDefaultModel}>
                  <SelectTrigger className="font-mono text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value} className="font-mono text-sm">
                        <span>{m.label}</span>
                        <span className="ml-2 text-muted-foreground text-xs">— {m.desc}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={savePreferences} className="gap-2 font-mono text-xs">
                  <Save className="w-3.5 h-3.5" />
                  Save Model
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base font-mono">Preferences</CardTitle>
                <CardDescription>Customize your chat experience.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground font-mono">Theme</p>
                    <p className="text-xs text-muted-foreground">{theme === "dark" ? "Dark mode" : "Light mode"}</p>
                  </div>
                  <Switch checked={theme === "light"} onCheckedChange={toggleTheme} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground font-mono">Send on Enter</p>
                    <p className="text-xs text-muted-foreground">Press Enter to send messages</p>
                  </div>
                  <Switch checked={sendOnEnter} onCheckedChange={setSendOnEnter} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground font-mono">Stream Responses</p>
                    <p className="text-xs text-muted-foreground">Show AI responses as they generate</p>
                  </div>
                  <Switch checked={streamResponses} onCheckedChange={setStreamResponses} />
                </div>
                <Button onClick={savePreferences} className="gap-2 font-mono text-xs">
                  <Save className="w-3.5 h-3.5" />
                  Save Preferences
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Blocked Users Tab */}
          <TabsContent value="blocked">
            <BlockedUsersPanel userId={user?.id} />
          </TabsContent>

          {/* Cache Tab */}
          <TabsContent value="cache">
            <CacheStatsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
