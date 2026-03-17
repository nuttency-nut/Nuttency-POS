-- Allow staff to cancel pending orders (status -> cancelled).
DROP POLICY IF EXISTS "Staff can cancel pending orders" ON public.orders;
CREATE POLICY "Staff can cancel pending orders"
  ON public.orders
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'staff'::public.app_role) AND status = 'pending')
  WITH CHECK (status = 'cancelled');
