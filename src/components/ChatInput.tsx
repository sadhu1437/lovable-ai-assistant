import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Mic, MicOff, ChevronDown } from "lucide-react";
import { categories, aiModels } from "@/lib/chat";
import { toast } from "sonner";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  category: string;
  onCategoryChange: (cat: string) => void;
  model: string;
  onModelChange: (model: string) => void;
}

export function ChatInput({ onSend, isLoading, category, onCategoryChange, model, onModelChange }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  // Close model dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toggleVoice = useCallback(() => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      toast.error("Speech recognition is not supported in your browser");
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognitionRef.current = recognition;

    let finalTranscript = "";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
        } else {
          interim = transcript;
        }
      }
      setInput(finalTranscript + interim);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      if (event.error !== "aborted") {
        toast.error("Voice input error: " + event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
    setIsListening(true);
  }, [isListening]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const selectedModel = aiModels.find((m) => m.id === model) || aiModels[0];

  return (
    <div className="border-t border-border bg-background/80 backdrop-blur-xl">
      <div className="max-w-3xl mx-auto px-4 py-3">
        {/* Category chips + Model selector row */}
        <div className="flex items-center gap-3 mb-3">
          {/* Category chips */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none flex-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => onCategoryChange(cat.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium font-mono transition-all ${
                  category === cat.id
                    ? "bg-primary text-primary-foreground glow-primary"
                    : "bg-secondary text-secondary-foreground hover:bg-muted"
                }`}
              >
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>

          {/* Model selector */}
          <div className="relative shrink-0" ref={modelDropdownRef}>
            <button
              onClick={() => setModelOpen(!modelOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium font-mono bg-accent text-accent-foreground hover:bg-accent/80 transition-all border border-border"
            >
              <span>{selectedModel.icon}</span>
              <span className="hidden sm:inline">{selectedModel.label}</span>
              <span className="sm:hidden">{selectedModel.provider}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${modelOpen ? "rotate-180" : ""}`} />
            </button>

            {modelOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-72 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
                <div className="p-2 border-b border-border">
                  <p className="text-[10px] font-mono text-muted-foreground px-2 py-1">SELECT AI MODEL</p>
                </div>
                <div className="max-h-64 overflow-y-auto p-1">
                  {aiModels.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { onModelChange(m.id); setModelOpen(false); }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-start gap-3 ${
                        model === m.id
                          ? "bg-primary/10 text-foreground"
                          : "hover:bg-secondary text-foreground"
                      }`}
                    >
                      <span className="text-base mt-0.5">{m.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{m.label}</span>
                          <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-secondary">{m.provider}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{m.description}</p>
                      </div>
                      {model === m.id && (
                        <span className="ml-auto text-primary text-xs mt-1">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input area */}
        <div className={`relative flex items-end gap-2 bg-card border rounded-xl p-2 transition-all ${
          isListening
            ? "border-primary glow-primary"
            : "border-border focus-within:border-primary/50 focus-within:glow-primary"
        }`}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? "Listening..." : "Ask NexusAI anything..."}
            rows={1}
            className="flex-1 bg-transparent resize-none text-foreground placeholder:text-muted-foreground outline-none px-2 py-1.5 text-sm max-h-[200px]"
          />

          {/* Voice button */}
          <button
            onClick={toggleVoice}
            className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
              isListening
                ? "bg-primary text-primary-foreground animate-pulse"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
            title={isListening ? "Stop listening" : "Voice input"}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Send button */}
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className="shrink-0 w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:glow-primary-strong transition-all"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2 font-mono">
          NexusAI • {selectedModel.label} ({selectedModel.provider}) • Fast & unlimited
        </p>
      </div>
    </div>
  );
}
