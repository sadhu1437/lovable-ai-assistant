import { useState, useCallback, useRef } from "react";
import { Search, X, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { ChatRoom, UserProfile } from "@/lib/messaging";

interface SearchResult {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  message_type: string;
}

interface MessageSearchProps {
  rooms: ChatRoom[];
  roomProfiles: Record<string, UserProfile>;
  onJumpToMessage: (roomId: string) => void;
}

export function MessageSearch({ rooms, roomProfiles, onJumpToMessage }: MessageSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const getRoomName = (roomId: string) => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return "Unknown";
    if (room.type === "group") return room.name || "Group";
    return roomProfiles[roomId]?.display_name || roomProfiles[roomId]?.username || "Chat";
  };

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      const { data } = await supabase
        .from("chat_messages")
        .select("id, room_id, sender_id, content, created_at, message_type")
        .ilike("content", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(30);
      setResults((data as SearchResult[]) || []);
      setSearching(false);
    },
    []
  );

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 350);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setActive(false);
  };

  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Search messages"
      >
        <Search className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search messages..."
          className="pl-8 pr-8 h-8 text-xs font-mono"
          autoFocus
        />
        <button
          onClick={handleClear}
          className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {(query.trim() || results.length > 0) && (
        <div className="mt-1 max-h-64 overflow-y-auto border border-border rounded-lg bg-card">
          {searching ? (
            <p className="text-[10px] text-muted-foreground font-mono text-center py-4">Searching...</p>
          ) : results.length === 0 && query.trim() ? (
            <p className="text-[10px] text-muted-foreground font-mono text-center py-4">No results found</p>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  onJumpToMessage(r.room_id);
                  handleClear();
                }}
                className="w-full text-left px-3 py-2 hover:bg-secondary border-b border-border last:border-b-0 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-primary font-mono font-medium truncate">
                    {getRoomName(r.room_id)}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[9px] text-muted-foreground font-mono">
                      {format(new Date(r.created_at), "MMM d, HH:mm")}
                    </span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  </div>
                </div>
                <p className="text-xs text-foreground truncate mt-0.5">
                  {r.message_type === "voice" ? "🎤 Voice message" : r.content}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
