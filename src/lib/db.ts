import { supabase } from "@/integrations/supabase/client";
import type { Message, Conversation } from "@/lib/chat";

export async function loadConversations(userId: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((c) => ({
    id: c.id,
    title: c.title,
    messages: [],
    category: c.category,
    createdAt: new Date(c.created_at),
  }));
}

export async function loadMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data || []).map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    timestamp: new Date(m.created_at),
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
    .update({ content })
    .eq("id", messageId);

  if (error) throw error;
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
