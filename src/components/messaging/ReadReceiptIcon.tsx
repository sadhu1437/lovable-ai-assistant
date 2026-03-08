import { Check, CheckCheck } from "lucide-react";

interface ReadReceiptIconProps {
  isRead: boolean;
}

export function ReadReceiptIcon({ isRead }: ReadReceiptIconProps) {
  return isRead ? (
    <CheckCheck className="w-3 h-3 text-primary inline-block ml-1" />
  ) : (
    <Check className="w-3 h-3 text-muted-foreground inline-block ml-1" />
  );
}
