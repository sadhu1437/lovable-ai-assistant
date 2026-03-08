import { supabase } from "@/integrations/supabase/client";

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
}

export interface UserProfile {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export async function searchUsers(query: string): Promise<UserProfile[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, user_id, username, display_name, avatar_url")
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(10);
  return (data as UserProfile[]) || [];
}

export async function createDM(currentUserId: string, otherUserId: string): Promise<string | null> {
  // Check if DM already exists between these users
  const { data: existingRooms } = await supabase
    .from("chat_room_members")
    .select("room_id")
    .eq("user_id", currentUserId);

  if (existingRooms) {
    for (const room of existingRooms) {
      const { data: roomData } = await supabase
        .from("chat_rooms")
        .select("*")
        .eq("id", room.room_id)
        .eq("type", "dm")
        .maybeSingle();
      if (roomData) {
        const { data: otherMember } = await supabase
          .from("chat_room_members")
          .select("id")
          .eq("room_id", room.room_id)
          .eq("user_id", otherUserId)
          .maybeSingle();
        if (otherMember) return room.room_id;
      }
    }
  }

  // Create new DM room
  const { data: room, error } = await supabase
    .from("chat_rooms")
    .insert({ type: "dm", created_by: currentUserId })
    .select()
    .single();
  if (error || !room) return null;

  // Add both members (creator is admin, can insert)
  await supabase.from("chat_room_members").insert([
    { room_id: room.id, user_id: currentUserId, role: "admin" },
    { room_id: room.id, user_id: otherUserId, role: "member" },
  ]);

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

  return room.id;
}

export async function sendMessage(
  roomId: string,
  senderId: string,
  content: string,
  messageType: "text" | "image" | "file" | "voice" = "text",
  mediaUrl?: string
) {
  return supabase.from("chat_messages").insert({
    room_id: roomId,
    sender_id: senderId,
    content,
    message_type: messageType,
    media_url: mediaUrl || null,
  });
}

export async function fetchRoomMessages(roomId: string) {
  const { data } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(200);
  return (data as ChatMessage[]) || [];
}

export async function fetchUserRooms() {
  const { data } = await supabase.from("chat_rooms").select("*").order("updated_at", { ascending: false });
  return (data as ChatRoom[]) || [];
}

export async function fetchRoomMembers(roomId: string) {
  const { data } = await supabase.from("chat_room_members").select("*").eq("room_id", roomId);
  return (data as ChatRoomMember[]) || [];
}
