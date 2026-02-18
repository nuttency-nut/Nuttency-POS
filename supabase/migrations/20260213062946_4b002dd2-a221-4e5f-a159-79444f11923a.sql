
-- Fix overly permissive INSERT/UPDATE policies on customers
DROP POLICY "Authenticated users can insert customers" ON public.customers;
DROP POLICY "Authenticated users can update customers" ON public.customers;

CREATE POLICY "Staff can insert customers" ON public.customers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can update customers" ON public.customers FOR UPDATE USING (auth.uid() IS NOT NULL);
