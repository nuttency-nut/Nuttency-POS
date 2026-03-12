CREATE TABLE IF NOT EXISTS public.catte_hand_state (
  room_key TEXT PRIMARY KEY,
  hand_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  player_order UUID[] NOT NULL,
  current_turn UUID,
  lead_suit TEXT,
  trick_index INTEGER NOT NULL DEFAULT 1,
  middle_card TEXT,
  pot_value BIGINT,
  started_by UUID,
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.catte_hand_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_key TEXT NOT NULL,
  hand_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_played BOOLEAN NOT NULL DEFAULT FALSE,
  played_trick INTEGER,
  played_order INTEGER,
  played_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS catte_hand_cards_room_key_idx
ON public.catte_hand_cards (room_key);

CREATE INDEX IF NOT EXISTS catte_hand_cards_hand_id_idx
ON public.catte_hand_cards (hand_id);

ALTER TABLE public.catte_hand_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catte_hand_cards ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catte_hand_state FROM anon, authenticated;
REVOKE ALL ON TABLE public.catte_hand_cards FROM anon, authenticated;

CREATE POLICY "Authenticated can manage catte hand state"
  ON public.catte_hand_state FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can manage catte hand cards"
  ON public.catte_hand_cards FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catte_hand_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catte_hand_cards TO authenticated;

CREATE TRIGGER update_catte_hand_state_updated_at
  BEFORE UPDATE ON public.catte_hand_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.catte_hand_state;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
    WHEN undefined_object THEN
      NULL;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.catte_hand_cards;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
    WHEN undefined_object THEN
      NULL;
  END;
END $$;
