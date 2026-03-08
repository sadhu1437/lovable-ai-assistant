
-- Add ON DELETE CASCADE to chat_messages and chat_room_members foreign keys if not already set
-- First drop and recreate the foreign keys with CASCADE

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_room_id_fkey;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_room_id_fkey 
  FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.chat_room_members DROP CONSTRAINT IF EXISTS chat_room_members_room_id_fkey;
ALTER TABLE public.chat_room_members ADD CONSTRAINT chat_room_members_room_id_fkey 
  FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;

ALTER TABLE public.message_reactions DROP CONSTRAINT IF EXISTS message_reactions_message_id_fkey;
ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_message_id_fkey 
  FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;

ALTER TABLE public.message_read_receipts DROP CONSTRAINT IF EXISTS message_read_receipts_message_id_fkey;
ALTER TABLE public.message_read_receipts ADD CONSTRAINT message_read_receipts_message_id_fkey 
  FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;

-- Create a security definer function so any room member can delete the room
-- This bypasses RLS to allow full conversation deletion
CREATE OR REPLACE FUNCTION public.delete_chat_room(_room_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the caller is a member of the room
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_room_members 
    WHERE room_id = _room_id AND user_id = auth.uid()
  ) THEN
    RETURN false;
  END IF;
  
  -- Delete the room (cascades to messages, members, reactions, receipts)
  DELETE FROM public.chat_rooms WHERE id = _room_id;
  RETURN true;
END;
$$;
