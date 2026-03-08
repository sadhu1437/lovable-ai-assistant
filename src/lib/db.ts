import { supabase } from "@/integrations/supabase/client";
import type { Message, Conversation } from "@/lib/chat";

export async function loadConversations(userId: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((c: any) => ({
    id: c.id,
    title: c.title,
    messages: [],
    category: c.category,
    createdAt: new Date(c.created_at),
    pinned: c.pinned ?? false,
  }));
}

export async function loadMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  // Load bookmarks for user
  const { data: { user } } = await supabase.auth.getUser();
  const bookmarkedIds = new Set<string>();
  if (user) {
    const { data: bmarks } = await supabase
      .from("bookmarks")
      .select("message_id")
      .eq("user_id", user.id);
    if (bmarks) bmarks.forEach((b: any) => bookmarkedIds.add(b.message_id));
  }

  return (data || []).map((m: any) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    timestamp: new Date(m.created_at),
    editedAt: m.edited_at ? new Date(m.edited_at) : null,
    bookmarked: bookmarkedIds.has(m.id),
  }));
}

export async function createConversation(userId: string, title: string, category: string): Promise<string> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title, category })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function saveMessage(conversationId: string, role: string, content: string): Promise<string> {
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role, content })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function updateMessageContent(messageId: string, content: string): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({ content, edited_at: new Date().toISOString() } as any)
    .eq("id", messageId);

  if (error) throw error;
}

export async function toggleBookmark(messageId: string, userId: string, bookmarked: boolean): Promise<void> {
  if (bookmarked) {
    const { error } = await supabase.from("bookmarks").insert({ user_id: userId, message_id: messageId } as any);
    if (error && !error.message.includes("duplicate")) throw error;
  } else {
    const { error } = await supabase.from("bookmarks").delete().eq("user_id", userId).eq("message_id", messageId);
    if (error) throw error;
  }
}

export async function updateConversationTitle(conversationId: string, title: string): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ title })
    .eq("id", conversationId);

  if (error) throw error;
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId);

  if (error) throw error;
}

export async function togglePinConversation(conversationId: string, pinned: boolean): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ pinned })
    .eq("id", conversationId);

  if (error) throw error;
}
