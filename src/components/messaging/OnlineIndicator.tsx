import { cn } from "@/lib/utils";

interface OnlineIndicatorProps {
  isOnline: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function OnlineIndicator({ isOnline, size = "sm", className }: OnlineIndicatorProps) {
  const sizeClasses = size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3";
  return (
    <span
      className={cn(
        sizeClasses,
        "rounded-full border-2 border-card absolute bottom-0 right-0",
        isOnline ? "bg-green-500" : "bg-muted-foreground/40",
        className
      )}
    />
  );
}
