CREATE TABLE IF NOT EXISTS public.catte_room_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_key TEXT NOT NULL DEFAULT 'main',
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Người chơi',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT catte_room_players_unique_user UNIQUE (room_key, user_id)
);

CREATE INDEX IF NOT EXISTS catte_room_players_room_key_idx
ON public.catte_room_players (room_key);

ALTER TABLE public.catte_room_players ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catte_room_players FROM anon, authenticated;

CREATE POLICY "Authenticated can view catte room players"
  ON public.catte_room_players FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can join their own seat"
  ON public.catte_room_players FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own seat"
  ON public.catte_room_players FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can leave their own seat"
  ON public.catte_room_players FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage catte room players"
  ON public.catte_room_players FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER update_catte_room_players_updated_at
  BEFORE UPDATE ON public.catte_room_players
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
