-- 1. Re-create the trigger for auto-creating profiles on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2. Fix call_participants INSERT policy to prevent unauthorized joining
DROP POLICY IF EXISTS "Users can join calls" ON public.call_participants;

CREATE POLICY "Users can join calls they are invited to"
ON public.call_participants
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    EXISTS (
      SELECT 1 FROM calls c
      WHERE c.id = call_id
      AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM chat_room_members crm
      JOIN calls c ON c.room_id = crm.room_id AND c.id = call_id
      WHERE crm.user_id = auth.uid() AND c.is_group_call = true
    )
  )
);