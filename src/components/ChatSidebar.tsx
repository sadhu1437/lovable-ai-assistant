import { Plus, MessageSquare, Trash2, LogOut, LogIn, Image as ImageIcon, Sun, Moon, Pin, PinOff, Settings, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Conversation } from "@/lib/chat";
import type { User } from "@supabase/supabase-js";
import { useTheme } from "@/hooks/useTheme";
import { prefetchRoute } from "@/lib/routePrefetch";
import { NotificationCenter } from "@/components/NotificationCenter";
import { useNotificationContext } from "@/hooks/useNotificationContext";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onGallery: () => void;
  showGallery: boolean;
  user?: User | null;
  onSignOut?: () => void;
}

export function ChatSidebar({ conversations, activeId, onSelect, onNew, onDelete, onPin, onGallery, showGallery, user, onSignOut }: ChatSidebarProps) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { notifications, unreadCount, loading: notifLoading, markAsRead, markAllAsRead, clearAll } = useNotificationContext();

  return (
    <div className="w-64 h-full bg-card border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center glow-primary">
            <span className="text-sm font-bold font-mono">N</span>
          </div>
          <div className="flex-1">
            <h1 className="text-sm font-semibold text-foreground font-mono">NexusAI</h1>
            <p className="text-[10px] text-muted-foreground">Ultra-fast AI</p>
          </div>
          {user && (
            <NotificationCenter
              notifications={notifications}
              unreadCount={unreadCount}
              loading={notifLoading}
              onMarkAsRead={markAsRead}
              onMarkAllAsRead={markAllAsRead}
              onClearAll={clearAll}
              onNotificationClick={(notif) => {
                if (notif.room_id) navigate("/messages");
              }}
            />
          )}
        </div>
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-primary/50 hover:bg-secondary text-sm text-foreground transition-all"
        >
          <Plus className="w-4 h-4" />
          <span className="font-mono text-xs">New Chat</span>
        </button>
        <button
          onClick={onGallery}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all mt-2 ${
            showGallery
              ? "border-primary/50 bg-secondary text-foreground"
              : "border-border hover:border-primary/50 hover:bg-secondary text-foreground"
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span className="font-mono text-xs">Image Gallery</span>
        </button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8 font-mono">No conversations yet</p>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(conv.id)}
              onKeyDown={(e) => e.key === "Enter" && onSelect(conv.id)}
              className={`w-full group flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm mb-1 transition-all cursor-pointer ${
                activeId === conv.id
                  ? "bg-secondary text-foreground border border-primary/30"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {conv.pinned && <Pin className="w-3 h-3 shrink-0 text-primary" />}
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="truncate flex-1 text-xs">{conv.title}</span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                <button
                  onClick={(e) => { e.stopPropagation(); onPin(conv.id, !conv.pinned); }}
                  className="p-1 hover:text-primary transition-colors"
                  title={conv.pinned ? "Unpin" : "Pin"}
                >
                  {conv.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                  className="p-1 hover:text-destructive transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3 shrink-0" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Theme toggle + User section */}
      <div className="p-3 border-t border-border space-y-2">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-primary/50 hover:bg-secondary text-sm text-foreground transition-all"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span className="font-mono text-xs">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
        </button>
        {user && (
          <button
            onClick={() => navigate("/messages")}
            onMouseEnter={() => prefetchRoute("/messages")}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-primary/50 hover:bg-secondary text-sm text-foreground transition-all"
          >
            <MessageCircle className="w-4 h-4" />
            <span className="font-mono text-xs">Messages</span>
          </button>
        )}
        {user && (
          <button
            onClick={() => navigate("/settings")}
            onMouseEnter={() => prefetchRoute("/settings")}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-primary/50 hover:bg-secondary text-sm text-foreground transition-all"
          >
            <Settings className="w-4 h-4" />
            <span className="font-mono text-xs">Settings</span>
          </button>
        )}
        {user ? (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-mono text-secondary-foreground">
              {(user.email || "U")[0].toUpperCase()}
            </div>
            <span className="flex-1 text-xs text-muted-foreground truncate">{user.email}</span>
            {onSignOut && (
              <button onClick={onSignOut} className="text-muted-foreground hover:text-destructive transition-colors" title="Sign out">
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={() => navigate("/auth")}
            onMouseEnter={() => prefetchRoute("/auth")}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-muted text-sm text-foreground transition-all"
          >
            <LogIn className="w-4 h-4" />
            <span className="font-mono text-xs">Sign in to save chats</span>
          </button>
        )}
      </div>
    </div>
  );
}
