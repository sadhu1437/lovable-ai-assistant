
-- Add username to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text UNIQUE;

-- Create chat_rooms table (supports both DM and group)
CREATE TABLE public.chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'dm' CHECK (type IN ('dm', 'group')),
  name text,
  avatar_url text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create chat_room_members table
CREATE TABLE public.chat_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- Create chat_messages table
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file')),
  media_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable realtime for chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Security definer function to check room membership
CREATE OR REPLACE FUNCTION public.is_room_member(_user_id uuid, _room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_room_members
    WHERE user_id = _user_id AND room_id = _room_id
  )
$$;

-- RLS for chat_rooms
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their rooms"
ON public.chat_rooms FOR SELECT TO authenticated
USING (public.is_room_member(auth.uid(), id));

CREATE POLICY "Authenticated users can create rooms"
ON public.chat_rooms FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Room creator can update"
ON public.chat_rooms FOR UPDATE TO authenticated
USING (auth.uid() = created_by);

CREATE POLICY "Room creator can delete"
ON public.chat_rooms FOR DELETE TO authenticated
USING (auth.uid() = created_by);

-- RLS for chat_room_members
ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view room members"
ON public.chat_room_members FOR SELECT TO authenticated
USING (public.is_room_member(auth.uid(), room_id));

CREATE POLICY "Room creator or admin can add members"
ON public.chat_room_members FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_room_members crm
    WHERE crm.room_id = chat_room_members.room_id
    AND crm.user_id = auth.uid()
    AND crm.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.chat_rooms cr
    WHERE cr.id = chat_room_members.room_id
    AND cr.created_by = auth.uid()
  )
);

CREATE POLICY "Admins can remove members"
ON public.chat_room_members FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.chat_room_members crm
    WHERE crm.room_id = chat_room_members.room_id
    AND crm.user_id = auth.uid()
    AND crm.role = 'admin'
  )
);

-- RLS for chat_messages
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view room messages"
ON public.chat_messages FOR SELECT TO authenticated
USING (public.is_room_member(auth.uid(), room_id));

CREATE POLICY "Members can send messages"
ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND public.is_room_member(auth.uid(), room_id)
);

-- RLS for profiles: allow authenticated users to search by username
CREATE POLICY "Authenticated users can search profiles"
ON public.profiles FOR SELECT TO authenticated
USING (true);

-- Drop the old restrictive select policy
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Trigger to update updated_at on chat_rooms
CREATE TRIGGER update_chat_rooms_updated_at
  BEFORE UPDATE ON public.chat_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
