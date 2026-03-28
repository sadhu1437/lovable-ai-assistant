-- Remove the insecure INSERT policy that lets users inject fake notifications
DROP POLICY IF EXISTS "Users receive notifications" ON public.notifications;

-- Only allow service_role (server-side triggers/functions) to insert notifications
CREATE POLICY "Only server can insert notifications"
ON public.notifications
FOR INSERT
TO service_role
WITH CHECK (true);