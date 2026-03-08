import { supabase } from "@/integrations/supabase/client";
import { cachedFetch, dataCache } from "@/lib/audioCache";

export interface ChatRoom {
  id: string;
  type: "dm" | "group";
  name: string | null;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ChatRoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: "admin" | "member";
  joined_at: string;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string | null;
  message_type: "text" | "image" | "file" | "voice";
  media_url: string | null;
  created_at: string;
  edited_at: string | null;
  pinned_at: string | null;
  pinned_by: string | null;
  reply_to: string | null;
}

export interface UserProfile {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export async function searchUsers(query: string): Promise<UserProfile[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, user_id, username, display_name, avatar_url")
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(10);
  return (data as UserProfile[]) || [];
}

/** Fetch a single profile by user_id, cached */
export async function fetchProfileByUserId(userId: string): Promise<UserProfile | null> {
  return cachedFetch<UserProfile | null>(
    `profile:${userId}`,
    async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, user_id, username, display_name, avatar_url")
        .eq("user_id", userId)
        .maybeSingle();
      return (data as UserProfile) || null;
    },
    dataCache as any
  );
}

/** Fetch multiple profiles by user_ids, cached individually */
export async function fetchProfilesByUserIds(userIds: string[]): Promise<UserProfile[]> {
  const results: UserProfile[] = [];
  const uncachedIds: string[] = [];

  for (const id of userIds) {
    const cached = dataCache.get(`profile:${id}`) as UserProfile | undefined;
    if (cached) {
      results.push(cached);
    } else {
      uncachedIds.push(id);
    }
  }

  if (uncachedIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, user_id, username, display_name, avatar_url")
      .in("user_id", uncachedIds);
    if (data) {
      for (const p of data) {
        const profile = p as UserProfile;
        dataCache.set(`profile:${profile.user_id}`, profile);
        results.push(profile);
      }
    }
  }

  return results;
}

export async function createDM(currentUserId: string, otherUserId: string): Promise<string | null> {
  const { data: myRooms } = await supabase
    .from("chat_room_members")
    .select("room_id")
    .eq("user_id", currentUserId);

  if (myRooms && myRooms.length > 0) {
    const roomIds = myRooms.map((r) => r.room_id);

    const { data: sharedMembers } = await supabase
      .from("chat_room_members")
      .select("room_id")
      .eq("user_id", otherUserId)
      .in("room_id", roomIds);

    if (sharedMembers && sharedMembers.length > 0) {
      const { data: dmRooms } = await supabase
        .from("chat_rooms")
        .select("id")
        .in("id", sharedMembers.map((m) => m.room_id))
        .eq("type", "dm")
        .limit(1);

      if (dmRooms && dmRooms.length > 0) {
        return dmRooms[0].id;
      }
    }
  }

  const { data: room, error } = await supabase
    .from("chat_rooms")
    .insert({ type: "dm", created_by: currentUserId })
    .select()
    .single();
  if (error || !room) return null;

  await supabase.from("chat_room_members").insert([
    { room_id: room.id, user_id: currentUserId, role: "admin" },
    { room_id: room.id, user_id: otherUserId, role: "member" },
  ]);

  // Invalidate rooms cache
  dataCache.delete(`rooms:${currentUserId}`);

  return room.id;
}

export async function createGroup(
  currentUserId: string,
  name: string,
  memberIds: string[]
): Promise<string | null> {
  const { data: room, error } = await supabase
    .from("chat_rooms")
    .insert({ type: "group", name, created_by: currentUserId })
    .select()
    .single();
  if (error || !room) return null;

  const members = [
    { room_id: room.id, user_id: currentUserId, role: "admin" as const },
    ...memberIds.map((id) => ({ room_id: room.id, user_id: id, role: "member" as const })),
  ];
  await supabase.from("chat_room_members").insert(members);

  dataCache.delete(`rooms:${currentUserId}`);

  return room.id;
}

export async function sendMessage(
  roomId: string,
  senderId: string,
  content: string,
  messageType: "text" | "image" | "file" | "voice" = "text",
  mediaUrl?: string,
  replyTo?: string
) {
  return supabase.from("chat_messages").insert({
    room_id: roomId,
    sender_id: senderId,
    content,
    message_type: messageType,
    media_url: mediaUrl || null,
    reply_to: replyTo || null,
  } as any);
}

export async function fetchRoomMessages(roomId: string) {
  // Messages are real-time, don't cache them
  const { data } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(200);
  return (data as ChatMessage[]) || [];
}

/** Fetch user rooms, cached for 30s worth of data */
export async function fetchUserRooms(userId?: string): Promise<ChatRoom[]> {
  const key = userId ? `rooms:${userId}` : "rooms:anon";
  return cachedFetch<ChatRoom[]>(
    key,
    async () => {
      const { data } = await supabase.from("chat_rooms").select("*").order("updated_at", { ascending: false });
      return (data as ChatRoom[]) || [];
    },
    dataCache as any
  );
}

export async function fetchRoomMembers(roomId: string) {
  return cachedFetch<ChatRoomMember[]>(
    `members:${roomId}`,
    async () => {
      const { data } = await supabase.from("chat_room_members").select("*").eq("room_id", roomId);
      return (data as ChatRoomMember[]) || [];
    },
    dataCache as any
  );
}

export const BOT_USERNAME = "nexusai-bot";

export async function getBotUserId(): Promise<string | null> {
  return cachedFetch<string | null>(
    "bot-user-id",
    async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("username", BOT_USERNAME)
        .maybeSingle();
      return data?.user_id || null;
    },
    dataCache as any
  );
}

export async function createBotDM(currentUserId: string): Promise<string | null> {
  const { data: initData } = await supabase.functions.invoke("chat-bot-reply", {
    body: { room_id: "init", message: "hello" },
  });

  const botUserId = initData?.bot_user_id;
  if (!botUserId) return null;

  return createDM(currentUserId, botUserId);
}

export async function triggerBotReply(roomId: string, message: string) {
  return supabase.functions.invoke("chat-bot-reply", {
    body: { room_id: roomId, message },
  });
}

/** Edit a chat message (within 24h enforced by RLS) */
export async function editChatMessage(messageId: string, newContent: string) {
  return supabase
    .from("chat_messages")
    .update({ content: newContent, edited_at: new Date().toISOString() } as any)
    .eq("id", messageId);
}

/** Pin/unpin a message */
export async function pinChatMessage(messageId: string, userId: string, pin: boolean) {
  return supabase
    .from("chat_messages")
    .update(pin
      ? { pinned_at: new Date().toISOString(), pinned_by: userId } as any
      : { pinned_at: null, pinned_by: null } as any
    )
    .eq("id", messageId);
}

/** Delete an entire chat room and all its messages (any member can call) */
export async function deleteChatRoom(roomId: string) {
  const { data, error } = await supabase.rpc("delete_chat_room", { _room_id: roomId });
  return { success: !!data, error };
}
