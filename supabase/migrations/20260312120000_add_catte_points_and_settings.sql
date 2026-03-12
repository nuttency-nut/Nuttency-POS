CREATE TABLE IF NOT EXISTS public.catte_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton BOOLEAN NOT NULL DEFAULT TRUE,
  base_stake BIGINT NOT NULL DEFAULT 100,
  currency TEXT NOT NULL DEFAULT 'point',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT catte_settings_singleton_check CHECK (singleton)
);

CREATE UNIQUE INDEX IF NOT EXISTS catte_settings_singleton_idx
ON public.catte_settings (singleton);

CREATE TABLE IF NOT EXISTS public.catte_player_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT catte_player_points_unique_user UNIQUE (user_id),
  CONSTRAINT catte_player_points_non_negative CHECK (points >= 0)
);

ALTER TABLE public.catte_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catte_player_points ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catte_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.catte_player_points FROM anon, authenticated;

CREATE POLICY "Authenticated can view catte settings"
  ON public.catte_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage catte settings"
  ON public.catte_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users can view own catte points"
  ON public.catte_player_points FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage catte points"
  ON public.catte_player_points FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER update_catte_settings_updated_at
  BEFORE UPDATE ON public.catte_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_catte_player_points_updated_at
  BEFORE UPDATE ON public.catte_player_points
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
