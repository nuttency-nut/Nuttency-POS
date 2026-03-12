GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catte_room_players TO authenticated;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.catte_room_players;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
    WHEN undefined_object THEN
      NULL;
  END;
END $$;
