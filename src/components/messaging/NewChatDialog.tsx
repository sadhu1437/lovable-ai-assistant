import { useState } from "react";
import { Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchUsers, createDM, createGroup, type UserProfile } from "@/lib/messaging";

interface NewChatDialogProps {
  open: boolean;
  onClose: () => void;
  mode: "dm" | "group";
  currentUserId: string;
  onCreated: (roomId: string) => void;
}

export function NewChatDialog({ open, onClose, mode, currentUserId, onCreated }: NewChatDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [selected, setSelected] = useState<UserProfile[]>([]);
  const [groupName, setGroupName] = useState("");
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    const users = await searchUsers(q);
    setResults(users.filter((u) => u.user_id !== currentUserId));
    setSearching(false);
  };

  const handleSelectUser = async (user: UserProfile) => {
    if (mode === "dm") {
      setCreating(true);
      const roomId = await createDM(currentUserId, user.user_id);
      setCreating(false);
      if (roomId) { onCreated(roomId); onClose(); }
    } else {
      if (!selected.find((s) => s.user_id === user.user_id)) {
        setSelected([...selected, user]);
      }
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selected.length === 0) return;
    setCreating(true);
    const roomId = await createGroup(currentUserId, groupName.trim(), selected.map((s) => s.user_id));
    setCreating(false);
    if (roomId) { onCreated(roomId); onClose(); }
  };

  const handleClose = () => {
    setQuery("");
    setResults([]);
    setSelected([]);
    setGroupName("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">
            {mode === "dm" ? "New Direct Message" : "Create Group"}
          </DialogTitle>
        </DialogHeader>

        {mode === "group" && (
          <Input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name"
            className="font-mono text-sm mb-2"
          />
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by username..."
            className="pl-8 font-mono text-sm"
          />
        </div>

        {mode === "group" && selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {selected.map((u) => (
              <span key={u.user_id} className="flex items-center gap-1 px-2 py-1 rounded-full bg-secondary text-xs font-mono text-foreground border border-border">
                {u.display_name || u.username}
                <X className="w-3 h-3 cursor-pointer hover:text-destructive" onClick={() => setSelected(selected.filter((s) => s.user_id !== u.user_id))} />
              </span>
            ))}
          </div>
        )}

        <div className="max-h-60 overflow-y-auto space-y-1 mt-2">
          {searching && <p className="text-xs text-muted-foreground text-center py-4 font-mono">Searching...</p>}
          {!searching && query.length >= 2 && results.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4 font-mono">No users found</p>
          )}
          {results.map((user) => (
            <button
              key={user.user_id}
              onClick={() => handleSelectUser(user)}
              disabled={creating}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-secondary transition-all text-left"
            >
              <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden shrink-0">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-mono text-foreground">
                    {(user.display_name || user.username || "U")[0].toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">{user.display_name || user.username || "User"}</p>
                {user.username && <p className="text-[10px] text-muted-foreground">@{user.username}</p>}
              </div>
            </button>
          ))}
        </div>

        {mode === "group" && (
          <Button
            onClick={handleCreateGroup}
            disabled={!groupName.trim() || selected.length === 0 || creating}
            className="w-full font-mono text-xs mt-2"
          >
            {creating ? "Creating..." : `Create Group (${selected.length} members)`}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
