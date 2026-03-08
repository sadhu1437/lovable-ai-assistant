import { categories } from "@/lib/chat";
import { Zap } from "lucide-react";

interface WelcomeScreenProps {
  onPrompt: (text: string) => void;
}

const quickPrompts = [
  { text: "Solve Two Sum problem with optimal approach", category: "dsa" },
  { text: "Build a REST API with Node.js and Express", category: "coding" },
  { text: "Create a viral TikTok content strategy", category: "social" },
  { text: "Explain how neural networks learn", category: "education" },
];

export function WelcomeScreen({ onPrompt }: WelcomeScreenProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full text-center animate-fade-in">
        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-6 glow-primary-strong">
          <Zap className="w-8 h-8" />
        </div>

        <h1 className="text-3xl font-bold text-foreground mb-2 font-mono">
          Nexus<span className="text-primary text-glow">AI</span>
        </h1>
        <p className="text-muted-foreground text-sm mb-8">
          Ultra-fast AI assistant for coding, DSA, content creation & more
        </p>

        {/* Category pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {categories.map((cat) => (
            <span
              key={cat.id}
              className="px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-mono"
            >
              {cat.icon} {cat.label}
            </span>
          ))}
        </div>

        {/* Quick prompts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {quickPrompts.map((prompt, i) => (
            <button
              key={i}
              onClick={() => onPrompt(prompt.text)}
              className="p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:glow-primary text-left transition-all group"
            >
              <p className="text-sm text-foreground group-hover:text-primary transition-colors">
                {prompt.text}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 font-mono uppercase">
                {prompt.category}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
