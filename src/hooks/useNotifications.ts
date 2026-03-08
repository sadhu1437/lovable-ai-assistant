import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AppNotification {
  id: string;
  user_id: string;
  type: string; // 'new_message' | 'mention' | 'bot_reply'
  title: string;
  body: string | null;
  room_id: string | null;
  message_id: string | null;
  sender_id: string | null;
  read: boolean;
  created_at: string;
}

const NOTIFICATION_SOUND_URL = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVggoqGdV5TY4GUmYx2X1RngpCOg3JkWm+ChIJ4bmRnfISDfHRtZ3WEhYF5cWlre4OGgXpxamx8g4WAfHFqbXyDhIB8cmpsfIOFgHxya2x8g4SAfHJrbHyDhIB8cmtsfIOEgHxya2x8g4SAfHJrbHyDhIB8cmtsfIOEgHxyaw==";

let audioInstance: HTMLAudioElement | null = null;

function playNotificationSound() {
  try {
    if (!audioInstance) {
      audioInstance = new Audio(NOTIFICATION_SOUND_URL);
      audioInstance.volume = 0.3;
    }
    audioInstance.currentTime = 0;
    audioInstance.play().catch(() => {});
  } catch {}
}

function requestBrowserPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function showBrowserNotification(title: string, body?: string, onClick?: () => void) {
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const n = new Notification(title, {
        body: body || undefined,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "nexusai-notification",
        renotify: true,
      });
      if (onClick) {
        n.onclick = () => {
          window.focus();
          onClick();
          n.close();
        };
      }
      setTimeout(() => n.close(), 5000);
    } catch {}
  }
}

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const initialLoadDone = useRef(false);

  // Request browser notification permission on mount
  useEffect(() => {
    requestBrowserPermission();
  }, []);

  // Load recent notifications
  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    const notifs = (data as AppNotification[]) || [];
    setNotifications(notifs);
    setUnreadCount(notifs.filter((n) => !n.read).length);
    setLoading(false);
    initialLoadDone.current = true;
  }, [userId]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("user-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const notif = payload.new as AppNotification;
          setNotifications((prev) => {
            if (prev.some((n) => n.id === notif.id)) return prev;
            return [notif, ...prev].slice(0, 50);
          });
          setUnreadCount((prev) => prev + 1);

          // In-app toast
          const icon = notif.type === "mention" ? "📢" : notif.type === "bot_reply" ? "🤖" : "💬";
          toast(`${icon} ${notif.title}`, {
            description: notif.body?.slice(0, 80) || undefined,
            duration: 4000,
          });

          // Sound
          playNotificationSound();

          // Browser notification (if tab not focused)
          if (document.hidden) {
            showBrowserNotification(notif.title, notif.body || undefined);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Mark single as read
  const markAsRead = useCallback(async (notifId: string) => {
    await supabase
      .from("notifications")
      .update({ read: true } as any)
      .eq("id", notifId);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    await supabase
      .from("notifications")
      .update({ read: true } as any)
      .eq("user_id", userId)
      .eq("read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, [userId]);

  // Clear all
  const clearAll = useCallback(async () => {
    if (!userId) return;
    await supabase.from("notifications").delete().eq("user_id", userId);
    setNotifications([]);
    setUnreadCount(0);
  }, [userId]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    clearAll,
    refresh: loadNotifications,
  };
}
