-- Enable realtime for customer display states
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_display_states;
    EXCEPTION
      WHEN duplicate_object THEN
        -- Already added
        NULL;
    END;
  END IF;
END $$;
