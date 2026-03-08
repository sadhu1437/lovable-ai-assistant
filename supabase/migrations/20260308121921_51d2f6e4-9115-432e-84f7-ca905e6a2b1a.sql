
-- Add 'voice' to the message_type check constraint on chat_messages
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_message_type_check;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_message_type_check CHECK (message_type IN ('text', 'image', 'file', 'voice'));
