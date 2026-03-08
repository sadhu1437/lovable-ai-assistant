interface TypingBubbleProps {
  names: string[];
  avatars?: (string | null)[];
}

export function TypingBubble({ names, avatars = [] }: TypingBubbleProps) {
  if (names.length === 0) return null;
  const label = names.length === 1
    ? `${names[0]} is typing`
    : names.length === 2
    ? `${names[0]} and ${names[1]} are typing`
    : `${names[0]} and ${names.length - 1} others are typing`;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5">
      {/* Stacked avatars */}
      <div className="flex -space-x-2">
        {names.slice(0, 3).map((name, i) => (
          <div
            key={i}
            className="w-5 h-5 rounded-full bg-secondary border border-border flex items-center justify-center overflow-hidden shrink-0"
          >
            {avatars[i] ? (
              <img src={avatars[i]!} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[8px] font-mono text-foreground font-semibold">
                {name[0]?.toUpperCase()}
              </span>
            )}
          </div>
        ))}
      </div>
      {/* Animated dots */}
      <div className="flex gap-0.5 items-center bg-secondary/60 rounded-full px-2.5 py-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
      </div>
      <span className="text-[10px] text-muted-foreground font-mono">{label}</span>
    </div>
  );
}
