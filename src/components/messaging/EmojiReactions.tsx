import { useState, useRef } from "react";
import { SmilePlus } from "lucide-react";
import { cn } from "@/lib/utils";

const QUICK_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥", "👏", "🎉"];

interface ReactionDisplayProps {
  reactions: { emoji: string; count: number; reacted: boolean }[];
  onToggle: (emoji: string) => void;
}

export function ReactionDisplay({ reactions, onToggle }: ReactionDisplayProps) {
  if (reactions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => onToggle(r.emoji)}
          className={cn(
            "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] border transition-all",
            r.reacted
              ? "border-primary/50 bg-primary/10 text-foreground"
              : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/30"
          )}
        >
          <span>{r.emoji}</span>
          <span className="font-mono">{r.count}</span>
        </button>
      ))}
    </div>
  );
}

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  align?: "left" | "right";
}

export function ReactionPicker({ onSelect, align = "left" }: ReactionPickerProps) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 300);
  };

  return (
    <div className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button
        onClick={() => setOpen(!open)}
        className="p-1 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
        aria-label="Add reaction"
      >
        <SmilePlus className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          className={cn(
            "absolute bottom-full mb-1 z-50 bg-card border border-border rounded-xl shadow-lg p-1.5 flex gap-0.5",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onSelect(emoji);
                setOpen(false);
              }}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-base"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
