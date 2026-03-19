-- Live customer display state per store
CREATE TABLE IF NOT EXISTS public.customer_display_states (
  store_id UUID PRIMARY KEY REFERENCES public.store_definitions(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_by_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_display_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view customer display state for their store" ON public.customer_display_states;
CREATE POLICY "Users can view customer display state for their store"
  ON public.customer_display_states FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_store_assignments usa
      WHERE usa.user_id = auth.uid()
        AND usa.store_id = customer_display_states.store_id
    )
  );

DROP POLICY IF EXISTS "Users can upsert customer display state for active store" ON public.customer_display_states;
CREATE POLICY "Users can upsert customer display state for active store"
  ON public.customer_display_states FOR INSERT
  TO authenticated
  WITH CHECK (
    updated_by_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_store_assignments usa
      WHERE usa.user_id = auth.uid()
        AND usa.store_id = customer_display_states.store_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.customer_display_sessions cds
      WHERE cds.store_id = customer_display_states.store_id
        AND cds.active_by_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update customer display state for active store" ON public.customer_display_states;
CREATE POLICY "Users can update customer display state for active store"
  ON public.customer_display_states FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_store_assignments usa
      WHERE usa.user_id = auth.uid()
        AND usa.store_id = customer_display_states.store_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.customer_display_sessions cds
      WHERE cds.store_id = customer_display_states.store_id
        AND cds.active_by_id = auth.uid()
    )
  )
  WITH CHECK (
    updated_by_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_store_assignments usa
      WHERE usa.user_id = auth.uid()
        AND usa.store_id = customer_display_states.store_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.customer_display_sessions cds
      WHERE cds.store_id = customer_display_states.store_id
        AND cds.active_by_id = auth.uid()
    )
  );

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_customer_display_states_updated_at ON public.customer_display_states;
CREATE TRIGGER update_customer_display_states_updated_at
  BEFORE UPDATE ON public.customer_display_states
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
