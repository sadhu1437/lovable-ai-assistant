import { createContext, useContext, type ReactNode } from "react";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearAll: () => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  loading: false,
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  clearAll: async () => {},
  refresh: async () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const notifs = useNotifications(user?.id);

  return (
    <NotificationContext.Provider value={notifs}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  return useContext(NotificationContext);
}
