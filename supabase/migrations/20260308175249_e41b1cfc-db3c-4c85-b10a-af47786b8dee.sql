
-- Fix permissive INSERT policy - only allow system (trigger) inserts where user_id matches
DROP POLICY "System can insert notifications" ON public.notifications;
CREATE POLICY "Users receive notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
