import { useState, useEffect, useCallback } from "react";
import { Users, Crown, UserPlus, UserMinus, ChevronDown, Info, MessageCircle, Bot, MoreVertical, VolumeX, Volume2, ShieldAlert, Ban, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { OnlineIndicator } from "./OnlineIndicator";
import { searchUsers, fetchProfilesByUserIds, getBotUserId, BOT_USERNAME, type ChatRoom, type UserProfile, type ChatRoomMember } from "@/lib/messaging";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GroupInfoPanelProps {
  room: ChatRoom;
  currentUserId: string;
  onlineUsers: Set<string>;
  onStartDM?: (userId: string) => void;
}

interface MemberWithProfile {
  member: ChatRoomMember;
  profile: UserProfile | null;
}

type DialogAction = null | "remove" | "block" | "report";

export function GroupInfoPanel({ room, currentUserId, onlineUsers, onStartDM }: GroupInfoPanelProps) {
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [actionTarget, setActionTarget] = useState<MemberWithProfile | null>(null);
  const [dialogAction, setDialogAction] = useState<DialogAction>(null);
  const [reportReason, setReportReason] = useState("inappropriate");
  const [reportDescription, setReportDescription] = useState("");
  const [open, setOpen] = useState(false);
  const [addingBot, setAddingBot] = useState(false);
  const [mutedUserIds, setMutedUserIds] = useState<Set<string>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());

  const currentMember = members.find(m => m.member.user_id === currentUserId);
  const isAdmin = currentMember?.member.role === "admin";
  const hasBotMember = members.some(m => m.profile?.username === BOT_USERNAME);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    const { data: memberData } = await supabase
      .from("chat_room_members")
      .select("*")
      .eq("room_id", room.id);

    if (!memberData) { setLoading(false); return; }

    const userIds = memberData.map(m => m.user_id);
    const profiles = await fetchProfilesByUserIds(userIds);
    const profileMap: Record<string, UserProfile> = {};
    for (const p of profiles) profileMap[p.user_id] = p;

    const membersWithProfiles: MemberWithProfile[] = (memberData as ChatRoomMember[])
      .map(m => ({ member: m, profile: profileMap[m.user_id] || null }))
      .sort((a, b) => {
        if (a.member.role === "admin" && b.member.role !== "admin") return -1;
        if (a.member.role !== "admin" && b.member.role === "admin") return 1;
        const nameA = a.profile?.display_name || a.profile?.username || "";
        const nameB = b.profile?.display_name || b.profile?.username || "";
        return nameA.localeCompare(nameB);
      });

    setMembers(membersWithProfiles);
    setLoading(false);
  }, [room.id]);

  const loadMutesAndBlocks = useCallback(async () => {
    const [{ data: mutes }, { data: blocks }] = await Promise.all([
      supabase.from("muted_members").select("muted_id").eq("room_id", room.id).eq("muter_id", currentUserId),
      supabase.from("blocked_users").select("blocked_id").eq("blocker_id", currentUserId),
    ]);
    setMutedUserIds(new Set((mutes || []).map((m: any) => m.muted_id)));
    setBlockedUserIds(new Set((blocks || []).map((b: any) => b.blocked_id)));
  }, [room.id, currentUserId]);

  useEffect(() => {
    if (open) {
      loadMembers();
      loadMutesAndBlocks();
    }
  }, [open, loadMembers, loadMutesAndBlocks]);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const results = await searchUsers(query.trim());
    const existingIds = new Set(members.map(m => m.member.user_id));
    setSearchResults(results.filter(r => !existingIds.has(r.user_id) && r.user_id !== currentUserId));
    setSearching(false);
  }, [members, currentUserId]);

  const addMember = async (userId: string) => {
    const { error } = await supabase.from("chat_room_members").insert({
      room_id: room.id,
      user_id: userId,
      role: "member",
    } as any);
    if (error) { toast.error("Failed to add member"); return; }
    toast.success("Member added");
    setSearchQuery("");
    setSearchResults([]);
    setShowAddMember(false);
    loadMembers();
  };

  const removeMember = async () => {
    if (!actionTarget) return;
    const { error } = await supabase
      .from("chat_room_members")
      .delete()
      .eq("id", actionTarget.member.id);
    if (error) { toast.error("Failed to remove member"); return; }
    toast.success("Member removed");
    closeDialog();
    loadMembers();
  };

  const toggleRole = async (member: MemberWithProfile) => {
    const newRole = member.member.role === "admin" ? "member" : "admin";
    const { error } = await supabase
      .from("chat_room_members")
      .update({ role: newRole } as any)
      .eq("id", member.member.id);
    if (error) { toast.error("Failed to update role"); return; }
    toast.success(newRole === "admin" ? "Promoted to admin" : "Demoted to member");
    loadMembers();
  };

  const toggleMute = async (userId: string) => {
    const isMuted = mutedUserIds.has(userId);
    if (isMuted) {
      await supabase.from("muted_members").delete()
        .eq("room_id", room.id).eq("muter_id", currentUserId).eq("muted_id", userId);
      setMutedUserIds(prev => { const s = new Set(prev); s.delete(userId); return s; });
      toast.success("Member unmuted");
    } else {
      await supabase.from("muted_members").insert({
        room_id: room.id, muter_id: currentUserId, muted_id: userId,
      } as any);
      setMutedUserIds(prev => new Set(prev).add(userId));
      toast.success("Member muted in this group");
    }
  };

  const toggleBlock = async () => {
    if (!actionTarget) return;
    const userId = actionTarget.member.user_id;
    const isBlocked = blockedUserIds.has(userId);
    if (isBlocked) {
      await supabase.from("blocked_users").delete()
        .eq("blocker_id", currentUserId).eq("blocked_id", userId);
      setBlockedUserIds(prev => { const s = new Set(prev); s.delete(userId); return s; });
      toast.success("User unblocked");
    } else {
      await supabase.from("blocked_users").insert({
        blocker_id: currentUserId, blocked_id: userId,
      } as any);
      setBlockedUserIds(prev => new Set(prev).add(userId));
      toast.success("User blocked");
    }
    closeDialog();
  };

  const submitReport = async () => {
    if (!actionTarget) return;
    const { error } = await supabase.from("user_reports").insert({
      reporter_id: currentUserId,
      reported_id: actionTarget.member.user_id,
      room_id: room.id,
      reason: reportReason,
      description: reportDescription || null,
    } as any);
    if (error) { toast.error("Failed to submit report"); return; }
    toast.success("Report submitted. Thank you.");
    closeDialog();
  };

  const addBotToGroup = async () => {
    setAddingBot(true);
    try {
      let botUserId = await getBotUserId();
      if (!botUserId) {
        const { data } = await supabase.functions.invoke("chat-bot-reply", {
          body: { room_id: "init", message: "hello" },
        });
        botUserId = data?.bot_user_id;
      }
      if (!botUserId) { toast.error("Could not find NexusAI Bot"); setAddingBot(false); return; }
      await addMember(botUserId);
    } catch {
      toast.error("Failed to add bot");
    }
    setAddingBot(false);
  };

  const openDialog = (target: MemberWithProfile, action: DialogAction) => {
    setActionTarget(target);
    setDialogAction(action);
    setReportReason("inappropriate");
    setReportDescription("");
  };

  const closeDialog = () => {
    setActionTarget(null);
    setDialogAction(null);
  };

  if (room.type !== "group") return null;

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0" title="Group info">
            <Info className="w-4 h-4" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[340px] sm:w-[380px] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b border-border">
            <SheetTitle className="text-sm font-mono flex items-center gap-2">
              <Users className="w-4 h-4" />
              {room.name || "Group Chat"}
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* Member count + add */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-mono">
                  {members.length} member{members.length !== 1 ? "s" : ""}
                </p>
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 font-mono"
                    onClick={() => setShowAddMember(!showAddMember)}
                  >
                    <UserPlus className="w-3 h-3 mr-1.5" />
                    Add Member
                  </Button>
                )}
              </div>

              {/* Add member search */}
              {showAddMember && isAdmin && (
                <div className="space-y-2 p-3 rounded-lg bg-secondary/30 border border-border">
                  {/* Quick add bot */}
                  {!hasBotMember && (
                    <button
                      onClick={addBotToGroup}
                      disabled={addingBot}
                      className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-secondary transition-colors text-left border border-primary/20 bg-primary/5"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                        <Bot className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground font-mono">NexusAI Bot</p>
                        <p className="text-[10px] text-muted-foreground font-mono">AI Assistant</p>
                      </div>
                      {addingBot ? (
                        <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin ml-auto shrink-0" />
                      ) : (
                        <UserPlus className="w-3.5 h-3.5 text-primary ml-auto shrink-0" />
                      )}
                    </button>
                  )}
                  <Input
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Search by name or username..."
                    className="text-xs font-mono h-8"
                  />
                  {searching && (
                    <p className="text-[10px] text-muted-foreground font-mono">Searching...</p>
                  )}
                  {searchResults.map(user => (
                    <button
                      key={user.user_id}
                      onClick={() => addMember(user.user_id)}
                      className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-secondary transition-colors text-left"
                    >
                      <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden shrink-0">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-mono text-foreground">
                            {(user.display_name || user.username || "U")[0].toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground font-mono truncate">
                          {user.display_name || user.username}
                        </p>
                        {user.username && (
                          <p className="text-[10px] text-muted-foreground font-mono">@{user.username}</p>
                        )}
                      </div>
                      <UserPlus className="w-3.5 h-3.5 text-primary ml-auto shrink-0" />
                    </button>
                  ))}
                  {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                    <p className="text-[10px] text-muted-foreground font-mono text-center py-1">No users found</p>
                  )}
                </div>
              )}

              {/* Members list */}
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-1">
                  {members.map(({ member, profile }) => {
                    const isOnline = onlineUsers.has(member.user_id);
                    const isCurrentUser = member.user_id === currentUserId;
                    const name = profile?.display_name || profile?.username || "Unknown";
                    const avatar = profile?.avatar_url;
                    const isAdminMember = member.role === "admin";
                    const isBot = profile?.username === BOT_USERNAME;
                    const isMuted = mutedUserIds.has(member.user_id);
                    const isBlocked = blockedUserIds.has(member.user_id);

                    return (
                      <div
                        key={member.id}
                        className={`flex items-center gap-2.5 px-2 py-2.5 rounded-lg hover:bg-secondary/50 transition-colors group ${isMuted ? "opacity-60" : ""}`}
                      >
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          <div className="w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden">
                            {isBot ? (
                              <Bot className="w-4 h-4 text-primary" />
                            ) : avatar ? (
                              <img src={avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-mono text-foreground font-semibold">
                                {name[0].toUpperCase()}
                              </span>
                            )}
                          </div>
                          {!isBot && <OnlineIndicator isOnline={isOnline} />}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-semibold text-foreground font-mono truncate">
                              {name}
                              {isCurrentUser && <span className="text-muted-foreground"> (You)</span>}
                            </p>
                            {isBot && (
                              <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/25 shrink-0">
                                Bot
                              </span>
                            )}
                            {isAdminMember && !isBot && (
                              <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/25 shrink-0">
                                Admin
                              </span>
                            )}
                            {isMuted && (
                              <span className="text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                                Muted
                              </span>
                            )}
                            {isBlocked && (
                              <span className="text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded bg-destructive/15 text-destructive shrink-0">
                                Blocked
                              </span>
                            )}
                          </div>
                          {profile?.username && (
                            <p className="text-[10px] text-muted-foreground font-mono">@{profile.username}</p>
                          )}
                        </div>

                        {/* Actions dropdown */}
                        {!isCurrentUser && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 font-mono text-xs">
                              {/* Message */}
                              {!isBot && onStartDM && (
                                <DropdownMenuItem onClick={() => { onStartDM(member.user_id); setOpen(false); }}>
                                  <MessageCircle className="w-3.5 h-3.5 mr-2" />
                                  Send Message
                                </DropdownMenuItem>
                              )}

                              {/* Mute / Unmute (not for bots) */}
                              {!isBot && (
                                <DropdownMenuItem onClick={() => toggleMute(member.user_id)}>
                                  {isMuted ? <Volume2 className="w-3.5 h-3.5 mr-2" /> : <VolumeX className="w-3.5 h-3.5 mr-2" />}
                                  {isMuted ? "Unmute in Group" : "Mute in Group"}
                                </DropdownMenuItem>
                              )}

                              {/* Admin actions */}
                              {isAdmin && !isBot && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => toggleRole({ member, profile })}>
                                    {isAdminMember
                                      ? <><ChevronDown className="w-3.5 h-3.5 mr-2" /> Remove Admin</>
                                      : <><Crown className="w-3.5 h-3.5 mr-2" /> Make Admin</>
                                    }
                                  </DropdownMenuItem>
                                </>
                              )}

                              {/* Remove (admin for users, anyone for bot) */}
                              {(isAdmin || isBot) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => openDialog({ member, profile }, "remove")}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <UserMinus className="w-3.5 h-3.5 mr-2" />
                                    Remove from Group
                                  </DropdownMenuItem>
                                </>
                              )}

                              {/* Block & Report (not for bots) */}
                              {!isBot && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => {
                                      if (isBlocked) {
                                        // Quick unblock
                                        setActionTarget({ member, profile });
                                        toggleBlock();
                                      } else {
                                        openDialog({ member, profile }, "block");
                                      }
                                    }}
                                    className={isBlocked ? "" : "text-destructive focus:text-destructive"}
                                  >
                                    <Ban className="w-3.5 h-3.5 mr-2" />
                                    {isBlocked ? "Unblock User" : "Block User"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => openDialog({ member, profile }, "report")}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Flag className="w-3.5 h-3.5 mr-2" />
                                    Report User
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Remove confirmation */}
      <AlertDialog open={dialogAction === "remove"} onOpenChange={(o) => !o && closeDialog()}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-sm flex items-center gap-2">
              <UserMinus className="w-4 h-4 text-destructive" /> Remove Member
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Remove <strong>{actionTarget?.profile?.display_name || actionTarget?.profile?.username || "this user"}</strong> from the group? They can be re-added later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={removeMember} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono text-xs">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Block confirmation */}
      <AlertDialog open={dialogAction === "block"} onOpenChange={(o) => !o && closeDialog()}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-sm flex items-center gap-2">
              <Ban className="w-4 h-4 text-destructive" /> Block User
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Block <strong>{actionTarget?.profile?.display_name || actionTarget?.profile?.username || "this user"}</strong>? You can unblock them later from the group info panel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={toggleBlock} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono text-xs">
              Block
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Report dialog */}
      <AlertDialog open={dialogAction === "report"} onOpenChange={(o) => !o && closeDialog()}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-sm flex items-center gap-2">
              <Flag className="w-4 h-4 text-destructive" /> Report User
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Report <strong>{actionTarget?.profile?.display_name || actionTarget?.profile?.username || "this user"}</strong> for inappropriate behavior.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-mono text-foreground font-medium mb-1 block">Reason</label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full h-8 px-2 text-xs font-mono rounded-md border border-border bg-background text-foreground"
              >
                <option value="inappropriate">Inappropriate behavior</option>
                <option value="spam">Spam / Advertising</option>
                <option value="harassment">Harassment</option>
                <option value="hate_speech">Hate speech</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-mono text-foreground font-medium mb-1 block">Details (optional)</label>
              <Textarea
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                placeholder="Describe what happened..."
                className="text-xs font-mono min-h-[60px] resize-none"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={submitReport} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono text-xs">
              Submit Report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
