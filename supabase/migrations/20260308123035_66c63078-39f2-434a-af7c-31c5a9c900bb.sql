
-- Fix chat_rooms policies to be PERMISSIVE
DROP POLICY IF EXISTS "Members can view their rooms" ON public.chat_rooms;
DROP POLICY IF EXISTS "Authenticated users can create rooms" ON public.chat_rooms;
DROP POLICY IF EXISTS "Room creator can delete" ON public.chat_rooms;
DROP POLICY IF EXISTS "Room creator can update" ON public.chat_rooms;

CREATE POLICY "Members can view their rooms"
ON public.chat_rooms FOR SELECT TO authenticated
USING (is_room_member(auth.uid(), id) OR auth.uid() = created_by);

CREATE POLICY "Authenticated users can create rooms"
ON public.chat_rooms FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Room creator can delete"
ON public.chat_rooms FOR DELETE TO authenticated
USING (auth.uid() = created_by);

CREATE POLICY "Room creator can update"
ON public.chat_rooms FOR UPDATE TO authenticated
USING (auth.uid() = created_by);

-- Fix chat_room_members policies
DROP POLICY IF EXISTS "Room creator or admin can add members" ON public.chat_room_members;
DROP POLICY IF EXISTS "Members can view room members" ON public.chat_room_members;
DROP POLICY IF EXISTS "Admins can remove members" ON public.chat_room_members;

CREATE POLICY "Room creator or admin can add members"
ON public.chat_room_members FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM chat_rooms cr WHERE cr.id = room_id AND cr.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM chat_room_members crm WHERE crm.room_id = chat_room_members.room_id AND crm.user_id = auth.uid() AND crm.role = 'admin')
);

CREATE POLICY "Members can view room members"
ON public.chat_room_members FOR SELECT TO authenticated
USING (is_room_member(auth.uid(), room_id));

CREATE POLICY "Admins can remove members"
ON public.chat_room_members FOR DELETE TO authenticated
USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM chat_room_members crm WHERE crm.room_id = chat_room_members.room_id AND crm.user_id = auth.uid() AND crm.role = 'admin'));

-- Fix chat_messages policies
DROP POLICY IF EXISTS "Members can send messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Members can view room messages" ON public.chat_messages;

CREATE POLICY "Members can send messages"
ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (auth.uid() = sender_id AND is_room_member(auth.uid(), room_id));

CREATE POLICY "Members can view room messages"
ON public.chat_messages FOR SELECT TO authenticated
USING (is_room_member(auth.uid(), room_id));

-- Fix read receipts policies
DROP POLICY IF EXISTS "Users can insert own read receipts" ON public.message_read_receipts;
DROP POLICY IF EXISTS "Members can view read receipts" ON public.message_read_receipts;

CREATE POLICY "Users can insert own read receipts"
ON public.message_read_receipts FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members can view read receipts"
ON public.message_read_receipts FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.id = message_read_receipts.message_id AND is_room_member(auth.uid(), cm.room_id)));

-- Clean up the test room created via service role
DELETE FROM public.chat_rooms WHERE id = 'db20e35c-ec1e-4719-b3c0-d3a67ba88b0b';
