
-- Drop existing delete policy on chat_room_members
DROP POLICY IF EXISTS "Admins can remove members" ON public.chat_room_members;

-- Recreate with bot-removal allowance: any room member can remove the bot user
CREATE POLICY "Admins can remove members or anyone can remove bot"
ON public.chat_room_members
FOR DELETE
TO authenticated
USING (
  (user_id = auth.uid())
  OR (EXISTS (
    SELECT 1 FROM chat_room_members crm
    WHERE crm.room_id = chat_room_members.room_id
      AND crm.user_id = auth.uid()
      AND crm.role = 'admin'
  ))
  OR (
    -- Any room member can remove the bot
    EXISTS (
      SELECT 1 FROM chat_room_members crm
      WHERE crm.room_id = chat_room_members.room_id
        AND crm.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = chat_room_members.user_id
        AND p.username = 'nexusai-bot'
    )
  )
);
