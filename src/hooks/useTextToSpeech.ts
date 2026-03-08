import { useState, useCallback, useRef } from "react";

export function useTextToSpeech() {
  const [speaking, setSpeaking] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback((text: string, id: string) => {
    if (speaking === id) {
      window.speechSynthesis.cancel();
      setSpeaking(null);
      return;
    }

    window.speechSynthesis.cancel();

    // Strip markdown-like syntax for cleaner speech
    const clean = text
      .replace(/```[\s\S]*?```/g, "code block")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/#{1,6}\s/g, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/!\[.*?\]\(.*?\)/g, "image")
      .replace(/---/g, "")
      .trim();

    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => setSpeaking(null);
    utterance.onerror = () => setSpeaking(null);
    utteranceRef.current = utterance;
    setSpeaking(id);
    window.speechSynthesis.speak(utterance);
  }, [speaking]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeaking(null);
  }, []);

  return { speaking, speak, stop };
}
