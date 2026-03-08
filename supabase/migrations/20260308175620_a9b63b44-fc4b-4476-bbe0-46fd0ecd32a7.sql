
-- Calls table for tracking call state
CREATE TABLE public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  caller_id uuid NOT NULL,
  callee_id uuid NOT NULL,
  call_type text NOT NULL DEFAULT 'audio', -- 'audio' or 'video'
  status text NOT NULL DEFAULT 'ringing', -- 'ringing', 'active', 'ended', 'missed', 'rejected'
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- Both caller and callee can see and update their calls
CREATE POLICY "Users can view own calls" ON public.calls FOR SELECT TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);
CREATE POLICY "Users can create calls" ON public.calls FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = caller_id);
CREATE POLICY "Participants can update calls" ON public.calls FOR UPDATE TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);

-- Enable realtime for call signaling
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
