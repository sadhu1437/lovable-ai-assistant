import { X } from "lucide-react";
import type { ChatMessage } from "@/lib/messaging";

interface ReplyPreviewProps {
  message: ChatMessage;
  senderName: string;
  onCancel: () => void;
}

export function ReplyPreview({ message, senderName, onCancel }: ReplyPreviewProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 border-l-2 border-primary rounded-t-lg">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-primary font-mono">{senderName}</p>
        <p className="text-xs text-muted-foreground truncate font-mono">
          {message.message_type === "image" ? "📷 Photo" :
           message.message_type === "voice" ? "🎙️ Voice message" :
           message.message_type === "file" ? "📎 File" :
           message.content || ""}
        </p>
      </div>
      <button onClick={onCancel} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

interface QuotedMessageProps {
  content: string | null;
  senderName: string;
  messageType: string;
  onClick?: () => void;
}

export function QuotedMessage({ content, senderName, messageType, onClick }: QuotedMessageProps) {
  return (
    <div
      onClick={onClick}
      className="border-l-2 border-primary/50 pl-2 mb-1.5 py-0.5 cursor-pointer hover:bg-primary/5 rounded-r transition-colors"
    >
      <p className="text-[9px] font-semibold text-primary font-mono">{senderName}</p>
      <p className="text-[10px] text-muted-foreground truncate font-mono max-w-[200px]">
        {messageType === "image" ? "📷 Photo" :
         messageType === "voice" ? "🎙️ Voice message" :
         messageType === "file" ? "📎 File" :
         content || ""}
      </p>
    </div>
  );
}
