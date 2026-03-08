import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";

export const ELEVENLABS_VOICES = [
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", gender: "Male" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", gender: "Female" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", gender: "Female" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", gender: "Male" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", gender: "Male" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", gender: "Male" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", gender: "Female" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", gender: "Female" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", gender: "Female" },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric", gender: "Male" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", gender: "Male" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", gender: "Male" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", gender: "Female" },
] as const;

function cleanText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/---/g, "")
    .trim();
}

async function fetchTTSAudio(text: string, voiceId: string): Promise<Blob> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ text, voiceId }),
    }
  );
  if (!response.ok) throw new Error("TTS request failed");
  return response.blob();
}

export function useElevenLabsTTS() {
  const [voiceId, setVoiceId] = useState(ELEVENLABS_VOICES[0].id);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPlayingId(null);
  }, []);

  const play = useCallback(async (text: string, msgId: string) => {
    if (playingId === msgId) { stop(); return; }
    stop();

    const clean = cleanText(text);
    if (!clean) { toast.error("Nothing to convert"); return; }

    setLoadingId(msgId);
    try {
      const blob = await fetchTTSAudio(clean, voiceId);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { stop(); };
      audio.onerror = () => { stop(); toast.error("Audio playback failed"); };
      setPlayingId(msgId);
      await audio.play();
    } catch {
      toast.error("Failed to generate audio");
    } finally {
      setLoadingId(null);
    }
  }, [voiceId, playingId, stop]);

  const download = useCallback(async (text: string, msgId: string) => {
    const clean = cleanText(text);
    if (!clean) { toast.error("Nothing to convert"); return; }

    setLoadingId(msgId);
    try {
      const blob = await fetchTTSAudio(clean, voiceId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `message-${msgId.slice(0, 8)}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Audio downloaded!");
    } catch {
      toast.error("Failed to generate audio");
    } finally {
      setLoadingId(null);
    }
  }, [voiceId]);

  return { voiceId, setVoiceId, play, download, stop, loadingId, playingId };
}
