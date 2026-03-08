CREATE POLICY "Users can delete own messages"
ON public.chat_messages FOR DELETE
TO authenticated
USING (auth.uid() = sender_id);