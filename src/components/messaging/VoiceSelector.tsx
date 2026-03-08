import { ELEVENLABS_VOICES } from "@/hooks/useElevenLabsTTS";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface VoiceSelectorProps {
  value: string;
  onChange: (voiceId: string) => void;
}

export function VoiceSelector({ value, onChange }: VoiceSelectorProps) {
  const selected = ELEVENLABS_VOICES.find((v) => v.id === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 w-[120px] text-[11px] font-mono border-border bg-secondary">
        <SelectValue>{selected ? `🎙 ${selected.name}` : "Voice"}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {ELEVENLABS_VOICES.map((voice) => (
          <SelectItem key={voice.id} value={voice.id} className="text-xs font-mono">
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{voice.gender === "Female" ? "♀" : "♂"}</span>
              {voice.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
