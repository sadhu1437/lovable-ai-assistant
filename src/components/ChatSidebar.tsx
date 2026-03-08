import { Plus, MessageSquare, Trash2, LogOut } from "lucide-react";
import type { Conversation } from "@/lib/chat";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  userEmail?: string;
  onSignOut?: () => void;
}

export function ChatSidebar({ conversations, activeId, onSelect, onNew, onDelete, userEmail, onSignOut }: ChatSidebarProps) {
  return (
    <div className="w-64 h-full bg-card border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center glow-primary">
            <span className="text-sm font-bold font-mono">N</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground font-mono">NexusAI</h1>
            <p className="text-[10px] text-muted-foreground">Ultra-fast AI</p>
          </div>
        </div>
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-primary/50 hover:bg-secondary text-sm text-foreground transition-all"
        >
          <Plus className="w-4 h-4" />
          <span className="font-mono text-xs">New Chat</span>
        </button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8 font-mono">No conversations yet</p>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`w-full group flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm mb-1 transition-all ${
                activeId === conv.id
                  ? "bg-secondary text-foreground border border-primary/30"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="truncate flex-1 text-xs">{conv.title}</span>
              <Trash2
                className="w-3 h-3 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all shrink-0"
                onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
              />
            </button>
          ))
        )}
      </div>

      {/* User section */}
      {userEmail && (
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-mono text-secondary-foreground">
              {userEmail[0].toUpperCase()}
            </div>
            <span className="flex-1 text-xs text-muted-foreground truncate">{userEmail}</span>
            {onSignOut && (
              <button onClick={onSignOut} className="text-muted-foreground hover:text-destructive transition-colors" title="Sign out">
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
