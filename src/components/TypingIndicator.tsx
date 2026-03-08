import { Zap } from "lucide-react";

export function TypingIndicator() {
  return (
    <div className="animate-fade-in py-6">
      <div className="max-w-3xl mx-auto px-4 flex gap-4">
        <div className="shrink-0 w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center animate-pulse-glow">
          <Zap className="w-4 h-4" />
        </div>
        <div className="flex items-center gap-1.5 pt-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "0s" }} />
          <span className="w-2 h-2 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "0.2s" }} />
          <span className="w-2 h-2 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: "0.4s" }} />
        </div>
      </div>
    </div>
  );
}
