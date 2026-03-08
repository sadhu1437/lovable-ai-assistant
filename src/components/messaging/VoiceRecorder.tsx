import { useState, useRef, useCallback } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { sendMessage } from "@/lib/messaging";
import { toast } from "sonner";

interface VoiceRecorderProps {
  roomId: string;
  senderId: string;
}

export function VoiceRecorder({ roomId, senderId }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 1000) {
          toast.error("Recording too short");
          setRecording(false);
          setDuration(0);
          return;
        }

        setUploading(true);
        const fileName = `voice-${Date.now()}.webm`;
        const path = `chat-media/${roomId}/${fileName}`;
        const { error } = await supabase.storage.from("avatars").upload(path, blob, {
          upsert: true,
          contentType: "audio/webm",
        });

        if (error) {
          toast.error("Failed to upload voice message");
          setUploading(false);
          setDuration(0);
          return;
        }

        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
        await sendMessage(roomId, senderId, `Voice message (${formatDuration(duration)})`, "voice", urlData.publicUrl);
        setUploading(false);
        setDuration(0);
      };

      mediaRecorder.start(250);
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {
      toast.error("Microphone access denied");
    }
  }, [roomId, senderId, duration]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }, []);

  return (
    <div className="flex items-center gap-1.5">
      {recording && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-destructive/10 border border-destructive/30">
          <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-[10px] font-mono text-destructive">{formatDuration(duration)}</span>
        </div>
      )}
      {uploading ? (
        <Button variant="ghost" size="icon" disabled className="shrink-0">
          <Loader2 className="w-4 h-4 animate-spin" />
        </Button>
      ) : recording ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={stopRecording}
          className="shrink-0 text-destructive hover:text-destructive"
        >
          <Square className="w-4 h-4" />
        </Button>
      ) : (
        <Button variant="ghost" size="icon" onClick={startRecording} className="shrink-0">
          <Mic className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
