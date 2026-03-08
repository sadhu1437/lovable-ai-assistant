import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { audioCache } from "@/lib/audioCache";

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
];

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

async function fetchTTSAudio(text: string, voiceId: string, signal?: AbortSignal): Promise<Blob> {
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
      signal,
    }
  );
  if (!response.ok) throw new Error("TTS request failed");
  return response.blob();
}

/** Get or fetch audio blob, using the global LRU cache */
async function getCachedAudio(text: string, voiceId: string, signal?: AbortSignal): Promise<Blob> {
  const cacheKey = `tts:${voiceId}:${text}`;
  const cached = audioCache.get(cacheKey);
  if (cached) return cached;

  const blob = await fetchTTSAudio(text, voiceId, signal);
  audioCache.set(cacheKey, blob);
  return blob;
}

export function useElevenLabsTTS() {
  const [voiceId, setVoiceId] = useState<string>(ELEVENLABS_VOICES[0].id);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPlayingId(null);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const play = useCallback(async (text: string, msgId: string) => {
    if (playingId === msgId) { cleanup(); return; }
    cleanup();

    const clean = cleanText(text);
    if (!clean) { toast.error("Nothing to convert"); return; }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingId(msgId);
    try {
      const blob = await getCachedAudio(clean, voiceId, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { cleanup(); };
      audio.onerror = () => { cleanup(); toast.error("Audio playback failed"); };
      setPlayingId(msgId);
      await audio.play();
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      toast.error("Failed to generate audio");
    } finally {
      setLoadingId(null);
    }
  }, [voiceId, playingId, cleanup]);

  const download = useCallback(async (text: string, msgId: string) => {
    const clean = cleanText(text);
    if (!clean) { toast.error("Nothing to convert"); return; }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingId(msgId);
    try {
      const blob = await getCachedAudio(clean, voiceId, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `message-${msgId.slice(0, 8)}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Audio downloaded!");
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      toast.error("Failed to generate audio");
    } finally {
      setLoadingId(null);
    }
  }, [voiceId]);

  return { voiceId, setVoiceId, play, download, stop: cleanup, loadingId, playingId };
}
