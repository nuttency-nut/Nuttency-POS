CREATE POLICY "Users can update own orders during checkout"
ON public.orders
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own pending orders during checkout"
ON public.orders
FOR DELETE
USING (auth.uid() = user_id AND status = 'pending');
