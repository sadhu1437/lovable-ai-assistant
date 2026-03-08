
-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'message',
  title text NOT NULL,
  body text,
  room_id uuid REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  sender_id uuid,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
-- System/trigger inserts via security definer function
CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Trigger function: create notifications for room members on new message
CREATE OR REPLACE FUNCTION public.notify_room_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _member RECORD;
  _sender_name text;
  _room_name text;
  _room_type text;
  _notif_type text;
  _title text;
  _body text;
BEGIN
  -- Get sender display name
  SELECT COALESCE(display_name, username, 'Someone') INTO _sender_name
  FROM public.profiles WHERE user_id = NEW.sender_id LIMIT 1;

  -- Get room info
  SELECT name, type INTO _room_name, _room_type
  FROM public.chat_rooms WHERE id = NEW.room_id LIMIT 1;

  -- Determine notification type
  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = NEW.sender_id AND username = 'nexusai-bot') THEN
    _notif_type := 'bot_reply';
    _title := 'NexusAI Bot replied';
  ELSIF _room_type = 'dm' THEN
    _notif_type := 'new_message';
    _title := _sender_name;
  ELSE
    _notif_type := 'new_message';
    _title := COALESCE(_room_name, 'Group Chat');
  END IF;

  -- Body preview
  _body := CASE
    WHEN NEW.message_type = 'voice' THEN '🎤 Voice message'
    WHEN NEW.message_type = 'image' THEN '📷 Image'
    WHEN NEW.message_type = 'file' THEN '📎 File'
    ELSE LEFT(COALESCE(NEW.content, ''), 100)
  END;

  -- Add sender prefix for groups
  IF _room_type = 'group' AND _notif_type != 'bot_reply' THEN
    _body := _sender_name || ': ' || _body;
  END IF;

  -- Insert notification for each member except sender
  FOR _member IN
    SELECT user_id FROM public.chat_room_members WHERE room_id = NEW.room_id AND user_id != NEW.sender_id
  LOOP
    -- Check for @mention
    IF NEW.content IS NOT NULL AND _room_type = 'group' THEN
      DECLARE
        _member_username text;
      BEGIN
        SELECT username INTO _member_username FROM public.profiles WHERE user_id = _member.user_id LIMIT 1;
        IF _member_username IS NOT NULL AND NEW.content ILIKE '%@' || _member_username || '%' THEN
          _notif_type := 'mention';
          _title := '📢 Mentioned in ' || COALESCE(_room_name, 'Group Chat');
        END IF;
      END;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, body, room_id, message_id, sender_id)
    VALUES (_member.user_id, _notif_type, _title, _body, NEW.room_id, NEW.id, NEW.sender_id);
    
    -- Reset type for next iteration
    IF _notif_type = 'mention' THEN
      _notif_type := 'new_message';
      _title := COALESCE(_room_name, 'Group Chat');
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Attach trigger
CREATE TRIGGER on_new_chat_message
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_room_members();
