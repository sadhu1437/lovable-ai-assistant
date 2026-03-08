
-- Add last_seen to profiles for online status tracking
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen timestamptz DEFAULT now();

-- Create read receipts table
CREATE TABLE public.message_read_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

ALTER TABLE public.message_read_receipts ENABLE ROW LEVEL SECURITY;

-- Members can view read receipts for messages in their rooms
CREATE POLICY "Members can view read receipts"
ON public.message_read_receipts FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chat_messages cm
    WHERE cm.id = message_read_receipts.message_id
    AND public.is_room_member(auth.uid(), cm.room_id)
  )
);

-- Users can insert their own read receipts
CREATE POLICY "Users can insert own read receipts"
ON public.message_read_receipts FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Enable realtime for read receipts
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_read_receipts;
