import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, User, Cpu, Sliders, Upload, Database, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { getAllCacheStats, clearAllCaches } from "@/lib/audioCache";

const AI_MODELS = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash", desc: "Fast & balanced" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", desc: "Top-tier reasoning" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", desc: "Cost-effective" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", desc: "Fastest" },
  { value: "openai/gpt-5", label: "GPT-5", desc: "Powerful all-rounder" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini", desc: "Balanced cost & quality" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano", desc: "Speed optimized" },
];

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
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
        }
        setLoading(false);
      });
  }, [user, navigate]);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName, avatar_url: avatarUrl, username: username || null } as any)
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
            <p className="text-xs text-muted-foreground">Customize your NexusAI experience</p>
          </div>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="bg-secondary border border-border">
            <TabsTrigger value="profile" className="gap-1.5 font-mono text-xs">
              <User className="w-3.5 h-3.5" /> Profile
            </TabsTrigger>
            <TabsTrigger value="model" className="gap-1.5 font-mono text-xs">
              <Cpu className="w-3.5 h-3.5" /> AI Model
            </TabsTrigger>
            <TabsTrigger value="preferences" className="gap-1.5 font-mono text-xs">
              <Sliders className="w-3.5 h-3.5" /> Preferences
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

          {/* Cache Tab */}
          <TabsContent value="cache">
            <CacheStatsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
