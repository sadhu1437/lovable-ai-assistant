import { useState, useRef, useCallback } from "react";
import { ELEVENLABS_VOICES } from "@/hooks/useElevenLabsTTS";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Volume2, Loader2, Square } from "lucide-react";
import { toast } from "sonner";

interface VoiceSelectorProps {
  value: string;
  onChange: (voiceId: string) => void;
}

const PREVIEW_TEXT = "Hello! This is a preview of my voice. How does it sound?";

export function VoiceSelector({ value, onChange }: VoiceSelectorProps) {
  const selected = ELEVENLABS_VOICES.find((v) => v.id === value);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stopPreview = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPreviewingId(null);
  }, []);

  const previewVoice = useCallback(async (e: React.MouseEvent, voiceId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (previewingId === voiceId) {
      stopPreview();
      return;
    }
    stopPreview();

    const controller = new AbortController();
    abortRef.current = controller;
    setPreviewingId(voiceId);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: PREVIEW_TEXT, voiceId }),
          signal: controller.signal,
        }
      );
      if (!response.ok) throw new Error("Preview failed");
      if (controller.signal.aborted) return;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => stopPreview();
      audio.onerror = () => { stopPreview(); toast.error("Preview playback failed"); };
      await audio.play();
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      toast.error("Failed to preview voice");
      setPreviewingId(null);
    }
  }, [previewingId, stopPreview]);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 w-[120px] text-[11px] font-mono border-border bg-secondary">
        <SelectValue>{selected ? `🎙 ${selected.name}` : "Voice"}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {ELEVENLABS_VOICES.map((voice) => (
          <SelectItem key={voice.id} value={voice.id} className="text-xs font-mono pr-1">
            <span className="flex items-center gap-1.5 w-full">
              <span className="text-muted-foreground">{voice.gender === "Female" ? "♀" : "♂"}</span>
              <span className="flex-1">{voice.name}</span>
              <button
                onClick={(e) => previewVoice(e, voice.id)}
                className="p-0.5 rounded hover:bg-accent transition-colors ml-1 shrink-0"
                title={previewingId === voice.id ? "Stop preview" : "Preview voice"}
              >
                {previewingId === voice.id ? (
                  <Square className="w-3 h-3 text-primary fill-primary" />
                ) : (
                  <Volume2 className="w-3 h-3 text-muted-foreground" />
                )}
              </button>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
