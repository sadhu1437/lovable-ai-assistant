import { useState, useRef } from "react";
import { Play, Pause } from "lucide-react";

interface VoicePlayerProps {
  url: string;
  label?: string;
}

export function VoicePlayer({ url, label }: VoicePlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = () => {
    if (!audioRef.current) {
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
      audio.addEventListener("timeupdate", () => {
        setProgress(audio.currentTime / (audio.duration || 1));
      });
      audio.addEventListener("ended", () => {
        setPlaying(false);
        setProgress(0);
      });
    }
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <button
        onClick={toggle}
        className="w-7 h-7 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0 hover:bg-primary-foreground/30 transition-colors"
      >
        {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
      </button>
      <div className="flex-1 flex flex-col gap-0.5">
        <div className="h-1 rounded-full bg-primary-foreground/20 overflow-hidden">
          <div
            className="h-full bg-current rounded-full transition-all duration-200"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="text-[9px] opacity-70 font-mono">
          {duration > 0 ? formatTime(playing ? progress * duration : duration) : label || "Voice"}
        </span>
      </div>
    </div>
  );
}
