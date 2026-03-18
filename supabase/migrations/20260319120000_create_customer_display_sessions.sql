-- Customer display sessions (one active per store)
CREATE TABLE IF NOT EXISTS public.customer_display_sessions (
  store_id UUID PRIMARY KEY REFERENCES public.store_definitions(id) ON DELETE CASCADE,
  active_by_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  active_by_name TEXT,
  active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_display_sessions_active_by_id_idx
ON public.customer_display_sessions(active_by_id);

ALTER TABLE public.customer_display_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view customer display for their store" ON public.customer_display_sessions;
CREATE POLICY "Users can view customer display for their store"
  ON public.customer_display_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_store_assignments usa
      WHERE usa.user_id = auth.uid()
        AND usa.store_id = customer_display_sessions.store_id
    )
  );

DROP POLICY IF EXISTS "Users can insert customer display for their store" ON public.customer_display_sessions;
CREATE POLICY "Users can insert customer display for their store"
  ON public.customer_display_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    active_by_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_store_assignments usa
      WHERE usa.user_id = auth.uid()
        AND usa.store_id = customer_display_sessions.store_id
    )
  );

DROP POLICY IF EXISTS "Users can update own customer display for their store" ON public.customer_display_sessions;
CREATE POLICY "Users can update own customer display for their store"
  ON public.customer_display_sessions FOR UPDATE
  TO authenticated
  USING (
    active_by_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_store_assignments usa
      WHERE usa.user_id = auth.uid()
        AND usa.store_id = customer_display_sessions.store_id
    )
  )
  WITH CHECK (
    active_by_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_store_assignments usa
      WHERE usa.user_id = auth.uid()
        AND usa.store_id = customer_display_sessions.store_id
    )
  );

DROP POLICY IF EXISTS "Users can delete own customer display for their store" ON public.customer_display_sessions;
CREATE POLICY "Users can delete own customer display for their store"
  ON public.customer_display_sessions FOR DELETE
  TO authenticated
  USING (
    active_by_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_store_assignments usa
      WHERE usa.user_id = auth.uid()
        AND usa.store_id = customer_display_sessions.store_id
    )
  );

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_customer_display_sessions_updated_at ON public.customer_display_sessions;
CREATE TRIGGER update_customer_display_sessions_updated_at
  BEFORE UPDATE ON public.customer_display_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
