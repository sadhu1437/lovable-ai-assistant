import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, MessageSquare, Plus, Image, Moon, Sun, LogOut, Command } from "lucide-react";
import type { Conversation } from "@/lib/chat";
import { useTheme } from "@/hooks/useTheme";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onOpenGallery: () => void;
  onSignOut?: () => void;
  onFocusInput: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  conversations,
  onSelectConversation,
  onNewChat,
  onOpenGallery,
  onSignOut,
  onFocusInput,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  const actions = useMemo(() => [
    { id: "new-chat", label: "New Chat", icon: Plus, shortcut: "⌘N", group: "Actions" },
    { id: "focus-input", label: "Focus Input", icon: Search, shortcut: "⌘/", group: "Actions" },
    { id: "gallery", label: "Image Gallery", icon: Image, group: "Actions" },
    { id: "toggle-theme", label: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode", icon: theme === "dark" ? Sun : Moon, group: "Actions" },
    ...(onSignOut ? [{ id: "sign-out", label: "Sign Out", icon: LogOut, group: "Actions" }] : []),
  ], [theme, onSignOut]);

  const filteredConversations = useMemo(() => {
    if (!query.trim()) return conversations.slice(0, 8);
    const q = query.toLowerCase();
    return conversations.filter((c) =>
      c.title.toLowerCase().includes(q) ||
      c.messages.some((m) => m.content.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [query, conversations]);

  const filteredActions = useMemo(() => {
    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    return actions.filter((a) => a.label.toLowerCase().includes(q));
  }, [query, actions]);

  const allItems = useMemo(() => [
    ...filteredActions.map((a) => ({ type: "action" as const, ...a })),
    ...filteredConversations.map((c) => ({ type: "conversation" as const, id: c.id, label: c.title, icon: MessageSquare, group: "Conversations" })),
  ], [filteredActions, filteredConversations]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const executeItem = useCallback((item: typeof allItems[0]) => {
    onOpenChange(false);
    if (item.type === "conversation") {
      onSelectConversation(item.id);
    } else {
      switch (item.id) {
        case "new-chat": onNewChat(); break;
        case "focus-input": setTimeout(() => onFocusInput(), 100); break;
        case "gallery": onOpenGallery(); break;
        case "toggle-theme": toggleTheme(); break;
        case "sign-out": onSignOut?.(); break;
      }
    }
  }, [onOpenChange, onSelectConversation, onNewChat, onFocusInput, onOpenGallery, toggleTheme, onSignOut]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && allItems[selectedIndex]) {
      e.preventDefault();
      executeItem(allItems[selectedIndex]);
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  }, [allItems, selectedIndex, executeItem, onOpenChange]);

  if (!open) return null;

  // Group items
  const groups: Record<string, typeof allItems> = {};
  allItems.forEach((item) => {
    const g = item.group || "Other";
    if (!groups[g]) groups[g] = [];
    groups[g].push(item);
  });

  let globalIdx = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={() => onOpenChange(false)}>
      <div className="fixed inset-0 bg-background/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Command className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search conversations, actions..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-secondary rounded border border-border">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto p-1.5">
          {allItems.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">No results found</div>
          )}
          {Object.entries(groups).map(([groupName, items]) => (
            <div key={groupName}>
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                {groupName}
              </div>
              {items.map((item) => {
                const idx = globalIdx++;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => executeItem(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      idx === selectedIndex
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {"shortcut" in item && item.shortcut && (
                      <kbd className="hidden sm:inline text-[10px] font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded border border-border">
                        {item.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border text-[10px] text-muted-foreground font-mono">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
