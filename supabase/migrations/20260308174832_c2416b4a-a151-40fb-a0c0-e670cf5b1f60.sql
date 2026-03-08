
-- Table for blocked users
CREATE TABLE public.blocked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own blocks" ON public.blocked_users FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "Users can block others" ON public.blocked_users FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "Users can unblock" ON public.blocked_users FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- Table for muted members (per room)
CREATE TABLE public.muted_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  muter_id uuid NOT NULL,
  muted_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_id, muter_id, muted_id)
);
ALTER TABLE public.muted_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own mutes" ON public.muted_members FOR SELECT TO authenticated USING (auth.uid() = muter_id);
CREATE POLICY "Users can mute others" ON public.muted_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = muter_id);
CREATE POLICY "Users can unmute" ON public.muted_members FOR DELETE TO authenticated USING (auth.uid() = muter_id);

-- Table for reports
CREATE TABLE public.user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL,
  reported_id uuid NOT NULL,
  room_id uuid REFERENCES public.chat_rooms(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT 'inappropriate',
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reports" ON public.user_reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id);
CREATE POLICY "Users can create reports" ON public.user_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
