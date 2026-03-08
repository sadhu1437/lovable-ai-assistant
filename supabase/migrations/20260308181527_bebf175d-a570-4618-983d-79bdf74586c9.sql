
-- Create call_participants table for group call support
CREATE TABLE public.call_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamp with time zone DEFAULT now(),
  left_at timestamp with time zone,
  UNIQUE(call_id, user_id)
);

ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;

-- Allow participants to view call participants
CREATE POLICY "Call participants can view" ON public.call_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.id = call_participants.call_id
        AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.call_participants cp WHERE cp.call_id = c.id AND cp.user_id = auth.uid()))
    )
  );

-- Allow authenticated users to join calls they're invited to
CREATE POLICY "Users can join calls" ON public.call_participants
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own participation (leave)
CREATE POLICY "Users can update own participation" ON public.call_participants
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Make callee_id nullable for group calls
ALTER TABLE public.calls ALTER COLUMN callee_id DROP NOT NULL;

-- Add is_group_call column
ALTER TABLE public.calls ADD COLUMN is_group_call boolean NOT NULL DEFAULT false;

-- Enable realtime for call_participants
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_participants;
