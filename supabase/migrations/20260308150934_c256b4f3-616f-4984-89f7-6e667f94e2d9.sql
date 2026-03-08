-- Add edited_at column to chat_messages for messaging
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz DEFAULT NULL;

-- Add edited_at column to messages (AI chat)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at timestamptz DEFAULT NULL;

-- Add pinned_at column to chat_messages for message pinning
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS pinned_at timestamptz DEFAULT NULL;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS pinned_by uuid DEFAULT NULL;

-- Create bookmarks table for AI chat
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, message_id)
);
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookmarks" ON public.bookmarks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own bookmarks" ON public.bookmarks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own bookmarks" ON public.bookmarks FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- UPDATE policy for chat_messages: sender can edit within 24 hours
CREATE POLICY "Sender can edit own messages within 24h" ON public.chat_messages FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id AND created_at > now() - interval '24 hours')
  WITH CHECK (auth.uid() = sender_id AND created_at > now() - interval '24 hours');

-- UPDATE policy for messages (AI chat): user can edit within 24 hours
CREATE POLICY "Users can update messages in their conversations within 24h" ON public.messages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id AND conversations.user_id = auth.uid()) AND created_at > now() - interval '24 hours')
  WITH CHECK (EXISTS (SELECT 1 FROM conversations WHERE conversations.id = messages.conversation_id AND conversations.user_id = auth.uid()) AND created_at > now() - interval '24 hours');