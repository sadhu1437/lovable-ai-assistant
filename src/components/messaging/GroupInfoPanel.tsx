import { useState, useEffect, useCallback } from "react";
import { Users, Crown, Shield, UserPlus, UserMinus, ChevronUp, ChevronDown, X, Info, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { OnlineIndicator } from "./OnlineIndicator";
import { searchUsers, fetchProfilesByUserIds, type ChatRoom, type UserProfile, type ChatRoomMember } from "@/lib/messaging";
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

export function GroupInfoPanel({ room, currentUserId, onlineUsers, onStartDM }: GroupInfoPanelProps) {
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MemberWithProfile | null>(null);
  const [open, setOpen] = useState(false);

  const currentMember = members.find(m => m.member.user_id === currentUserId);
  const isAdmin = currentMember?.member.role === "admin";

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
        // Admins first, then alphabetical
        if (a.member.role === "admin" && b.member.role !== "admin") return -1;
        if (a.member.role !== "admin" && b.member.role === "admin") return 1;
        const nameA = a.profile?.display_name || a.profile?.username || "";
        const nameB = b.profile?.display_name || b.profile?.username || "";
        return nameA.localeCompare(nameB);
      });

    setMembers(membersWithProfiles);
    setLoading(false);
  }, [room.id]);

  useEffect(() => {
    if (open) loadMembers();
  }, [open, loadMembers]);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const results = await searchUsers(query.trim());
    // Filter out existing members
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
    if (!removeTarget) return;
    const { error } = await supabase
      .from("chat_room_members")
      .delete()
      .eq("id", removeTarget.member.id);
    if (error) { toast.error("Failed to remove member"); return; }
    toast.success("Member removed");
    setRemoveTarget(null);
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
              {/* Member count */}
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

                    return (
                      <div
                        key={member.id}
                        className={`flex items-start gap-2.5 px-2 py-2.5 rounded-lg hover:bg-secondary/50 transition-colors group ${!isCurrentUser && onStartDM ? "cursor-pointer" : ""}`}
                        onClick={() => {
                          if (!isCurrentUser && onStartDM) {
                            onStartDM(member.user_id);
                            setOpen(false);
                          }
                        }}
                      >
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          <div className="w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden">
                            {avatar ? (
                              <img src={avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-mono text-foreground font-semibold">
                                {name[0].toUpperCase()}
                              </span>
                            )}
                          </div>
                          <OnlineIndicator isOnline={isOnline} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-semibold text-foreground font-mono truncate">
                              {name}
                              {isCurrentUser && <span className="text-muted-foreground"> (You)</span>}
                            </p>
                            {isAdminMember && (
                              <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/25 shrink-0">
                                Admin
                              </span>
                            )}
                          </div>
                          {profile?.username && (
                            <p className="text-[10px] text-muted-foreground font-mono">@{profile.username}</p>
                          )}
                          {profile?.bio && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{profile.bio}</p>
                          )}
                        </div>

                        {/* Actions */}
                        {!isCurrentUser && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            {onStartDM && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onStartDM(member.user_id); setOpen(false); }}
                                className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                title="Send message"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isAdmin && (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleRole({ member, profile }); }}
                                  className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                                  title={isAdminMember ? "Remove admin" : "Make admin"}
                                >
                                  {isAdminMember ? (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  ) : (
                                    <Crown className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setRemoveTarget({ member, profile }); }}
                                  className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                  title="Remove from group"
                                >
                                  <UserMinus className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
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

      {/* Remove member confirmation */}
      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <strong>{removeTarget?.profile?.display_name || removeTarget?.profile?.username || "this user"}</strong>{" "}
              from the group?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={removeMember} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
