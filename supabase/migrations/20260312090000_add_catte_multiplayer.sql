
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'catte_phase') THEN
    CREATE TYPE public.catte_phase AS ENUM (
      'WAITING',
      'DEALING',
      'ROUND_1',
      'ROUND_2',
      'ROUND_3',
      'ROUND_4',
      'SHOWDOWN',
      'FINISHED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'catte_move_type') THEN
    CREATE TYPE public.catte_move_type AS ENUM (
      'PLAY',
      'FOLD',
      'SHOW_FIRST',
      'SHOW_SECOND'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'catte_card_suit') THEN
    CREATE TYPE public.catte_card_suit AS ENUM (
      'S',
      'C',
      'D',
      'H'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'catte_card_rank') THEN
    CREATE TYPE public.catte_card_rank AS ENUM (
      '2','3','4','5','6','7','8','9','10','J','Q','K','A'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'catte_show_stage') THEN
    CREATE TYPE public.catte_show_stage AS ENUM (
      'SHOW_FIRST',
      'OTHERS_FIRST',
      'CUP_SECOND',
      'ALL_SECOND'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'WAITING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.room_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seat_index INT NOT NULL,
  is_alive BOOLEAN NOT NULL DEFAULT TRUE,
  is_host BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS room_players_room_user_idx
ON public.room_players (room_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS room_players_room_seat_idx
ON public.room_players (room_id, seat_index)
WHERE is_alive = TRUE;

CREATE TABLE IF NOT EXISTS public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  phase public.catte_phase NOT NULL DEFAULT 'WAITING',
  current_turn UUID REFERENCES public.room_players(id),
  lead_player UUID REFERENCES public.room_players(id),
  round_number INT NOT NULL DEFAULT 0,
  show_player UUID REFERENCES public.room_players(id),
  cup_player UUID REFERENCES public.room_players(id),
  show_stage public.catte_show_stage,
  show_card_rank public.catte_card_rank,
  show_card_suit public.catte_card_suit,
  winner_player UUID REFERENCES public.room_players(id),
  turn_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS games_room_idx ON public.games (room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.player_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.room_players(id) ON DELETE CASCADE,
  card_rank public.catte_card_rank NOT NULL,
  card_suit public.catte_card_suit NOT NULL,
  is_played BOOLEAN NOT NULL DEFAULT FALSE,
  is_folded BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS player_cards_game_player_idx
ON public.player_cards (game_id, player_id);

CREATE TABLE IF NOT EXISTS public.moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.room_players(id) ON DELETE CASCADE,
  move_type public.catte_move_type NOT NULL,
  card_rank public.catte_card_rank,
  card_suit public.catte_card_suit,
  round_number INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS moves_game_round_idx
ON public.moves (game_id, round_number, created_at);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moves ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.rooms FROM anon, authenticated;
REVOKE ALL ON TABLE public.room_players FROM anon, authenticated;
REVOKE ALL ON TABLE public.games FROM anon, authenticated;
REVOKE ALL ON TABLE public.player_cards FROM anon, authenticated;
REVOKE ALL ON TABLE public.moves FROM anon, authenticated;

GRANT SELECT ON TABLE public.rooms TO authenticated;
GRANT SELECT ON TABLE public.room_players TO authenticated;
GRANT SELECT ON TABLE public.games TO authenticated;
GRANT SELECT ON TABLE public.moves TO authenticated;
GRANT SELECT ON TABLE public.player_cards TO authenticated;

CREATE POLICY "rooms_read" ON public.rooms
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "room_players_read" ON public.room_players
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "games_read" ON public.games
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "moves_read" ON public.moves
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "player_cards_read_own" ON public.player_cards
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.room_players rp
      WHERE rp.id = player_cards.player_id
        AND rp.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.catte_rank_value(p_rank public.catte_card_rank)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_rank
    WHEN '2' THEN 2
    WHEN '3' THEN 3
    WHEN '4' THEN 4
    WHEN '5' THEN 5
    WHEN '6' THEN 6
    WHEN '7' THEN 7
    WHEN '8' THEN 8
    WHEN '9' THEN 9
    WHEN '10' THEN 10
    WHEN 'J' THEN 11
    WHEN 'Q' THEN 12
    WHEN 'K' THEN 13
    WHEN 'A' THEN 14
  END;
$$;

CREATE OR REPLACE FUNCTION public.catte_suit_value(p_suit public.catte_card_suit)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_suit
    WHEN 'S' THEN 1
    WHEN 'C' THEN 2
    WHEN 'D' THEN 3
    WHEN 'H' THEN 4
  END;
$$;

CREATE OR REPLACE FUNCTION public.catte_compare_cards(
  p_rank_a public.catte_card_rank,
  p_suit_a public.catte_card_suit,
  p_rank_b public.catte_card_rank,
  p_suit_b public.catte_card_suit
)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN public.catte_rank_value(p_rank_a) > public.catte_rank_value(p_rank_b) THEN 1
    WHEN public.catte_rank_value(p_rank_a) < public.catte_rank_value(p_rank_b) THEN -1
    WHEN public.catte_suit_value(p_suit_a) > public.catte_suit_value(p_suit_b) THEN 1
    WHEN public.catte_suit_value(p_suit_a) < public.catte_suit_value(p_suit_b) THEN -1
    ELSE 0
  END;
$$;
CREATE OR REPLACE FUNCTION public.catte_next_player_id(
  p_room_id UUID,
  p_after_seat INT,
  p_exclude UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT rp.id
  FROM public.room_players rp
  WHERE rp.room_id = p_room_id
    AND rp.is_alive = TRUE
    AND (p_exclude IS NULL OR rp.id <> p_exclude)
  ORDER BY CASE WHEN rp.seat_index > p_after_seat THEN 0 ELSE 1 END,
           rp.seat_index
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.catte_next_player_without_second(
  p_game_id UUID,
  p_room_id UUID,
  p_after_seat INT
)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT rp.id
  FROM public.room_players rp
  WHERE rp.room_id = p_room_id
    AND rp.is_alive = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM public.moves m
      WHERE m.game_id = p_game_id
        AND m.player_id = rp.id
        AND m.move_type = 'SHOW_SECOND'
    )
  ORDER BY CASE WHEN rp.seat_index > p_after_seat THEN 0 ELSE 1 END,
           rp.seat_index
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.catte_determine_trick_winner(
  p_game_id UUID,
  p_round INT
)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  WITH lead AS (
    SELECT m.card_suit AS suit
    FROM public.moves m
    WHERE m.game_id = p_game_id
      AND m.round_number = p_round
      AND m.move_type = 'PLAY'
    ORDER BY m.created_at ASC
    LIMIT 1
  )
  SELECT m.player_id
  FROM public.moves m
  JOIN lead l ON l.suit = m.card_suit
  WHERE m.game_id = p_game_id
    AND m.round_number = p_round
    AND m.move_type = 'PLAY'
  ORDER BY public.catte_rank_value(m.card_rank) DESC,
           public.catte_suit_value(m.card_suit) DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.catte_determine_showdown_winner(
  p_game_id UUID
)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT m.player_id
  FROM public.moves m
  WHERE m.game_id = p_game_id
    AND m.move_type = 'SHOW_SECOND'
  ORDER BY public.catte_rank_value(m.card_rank) DESC,
           public.catte_suit_value(m.card_suit) DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.catte_maybe_finish_round(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_alive_count INT;
  v_moves_count INT;
  v_winner UUID;
  v_next_phase public.catte_phase;
BEGIN
  SELECT * INTO v_game
  FROM public.games
  WHERE id = p_game_id
  FOR UPDATE;

  IF v_game.id IS NULL THEN
    RETURN;
  END IF;

  IF v_game.phase NOT IN ('ROUND_1','ROUND_2','ROUND_3','ROUND_4') THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_alive_count
  FROM public.room_players
  WHERE room_id = v_game.room_id
    AND is_alive = TRUE;

  IF v_alive_count <= 1 THEN
    SELECT id INTO v_winner
    FROM public.room_players
    WHERE room_id = v_game.room_id
      AND is_alive = TRUE
    LIMIT 1;

    UPDATE public.games
    SET phase = 'FINISHED',
        winner_player = v_winner,
        current_turn = NULL,
        turn_deadline = NULL
    WHERE id = v_game.id;

    UPDATE public.rooms
    SET status = 'FINISHED'
    WHERE id = v_game.room_id;

    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_moves_count
  FROM public.moves m
  JOIN public.room_players rp ON rp.id = m.player_id
  WHERE m.game_id = v_game.id
    AND m.round_number = v_game.round_number
    AND m.move_type IN ('PLAY','FOLD')
    AND rp.is_alive = TRUE;

  IF v_moves_count < v_alive_count THEN
    RETURN;
  END IF;

  v_winner := public.catte_determine_trick_winner(v_game.id, v_game.round_number);

  IF v_game.round_number < 4 THEN
    v_next_phase := CASE v_game.round_number
      WHEN 1 THEN 'ROUND_2'
      WHEN 2 THEN 'ROUND_3'
      WHEN 3 THEN 'ROUND_4'
    END;

    UPDATE public.games
    SET round_number = v_game.round_number + 1,
        phase = v_next_phase,
        lead_player = v_winner,
        current_turn = v_winner,
        turn_deadline = NOW() + INTERVAL '20 seconds'
    WHERE id = v_game.id;
  ELSE
    UPDATE public.games
    SET round_number = 5,
        phase = 'SHOWDOWN',
        lead_player = v_winner,
        show_player = v_winner,
        show_stage = 'SHOW_FIRST',
        current_turn = v_winner,
        turn_deadline = NOW() + INTERVAL '20 seconds',
        show_card_rank = NULL,
        show_card_suit = NULL,
        cup_player = NULL
    WHERE id = v_game.id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.catte_get_or_create_room()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT id INTO v_room_id
  FROM public.rooms
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_room_id IS NULL THEN
    INSERT INTO public.rooms (host_id, status)
    VALUES (auth.uid(), 'WAITING')
    RETURNING id INTO v_room_id;
  END IF;

  RETURN v_room_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.catte_get_or_create_room() TO authenticated;
CREATE OR REPLACE FUNCTION public.catte_join_room(p_room_id UUID)
RETURNS TABLE (
  player_id UUID,
  room_id UUID,
  seat_index INT,
  is_host BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_existing public.room_players%ROWTYPE;
  v_seat INT;
  v_is_host BOOLEAN := FALSE;
  v_count INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  IF v_room.status <> 'WAITING' THEN
    RAISE EXCEPTION 'Game already started';
  END IF;

  SELECT * INTO v_existing
  FROM public.room_players
  WHERE room_id = p_room_id
    AND user_id = auth.uid()
  LIMIT 1;

  SELECT COUNT(*) INTO v_count
  FROM public.room_players
  WHERE room_id = p_room_id
    AND is_alive = TRUE;

  IF v_existing.id IS NOT NULL AND v_existing.is_alive THEN
    RETURN QUERY SELECT v_existing.id, v_existing.room_id, v_existing.seat_index, v_existing.is_host;
    RETURN;
  END IF;

  IF v_count >= 6 THEN
    RAISE EXCEPTION 'Room full';
  END IF;

  SELECT s INTO v_seat
  FROM generate_series(0,5) s
  LEFT JOIN public.room_players rp
    ON rp.room_id = p_room_id
   AND rp.seat_index = s
   AND rp.is_alive = TRUE
  WHERE rp.id IS NULL
  ORDER BY s
  LIMIT 1;

  v_is_host := v_count = 0;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.room_players
    SET seat_index = v_seat,
        is_alive = TRUE,
        is_host = v_is_host,
        joined_at = NOW(),
        last_seen = NOW()
    WHERE id = v_existing.id
    RETURNING id, room_id, seat_index, is_host
    INTO v_existing;
  ELSE
    INSERT INTO public.room_players (room_id, user_id, seat_index, is_alive, is_host)
    VALUES (p_room_id, auth.uid(), v_seat, TRUE, v_is_host)
    RETURNING id, room_id, seat_index, is_host
    INTO v_existing;
  END IF;

  IF v_is_host THEN
    UPDATE public.rooms
    SET host_id = auth.uid()
    WHERE id = p_room_id;
  END IF;

  RETURN QUERY SELECT v_existing.id, v_existing.room_id, v_existing.seat_index, v_existing.is_host;
END;
$$;

GRANT EXECUTE ON FUNCTION public.catte_join_room(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.catte_leave_room(p_room_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player public.room_players%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_next public.room_players%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_player
  FROM public.room_players
  WHERE room_id = p_room_id
    AND user_id = auth.uid()
    AND is_alive = TRUE
  FOR UPDATE;

  IF v_player.id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.room_players
  SET is_alive = FALSE,
      is_host = FALSE
  WHERE id = v_player.id;

  SELECT * INTO v_game
  FROM public.games
  WHERE room_id = p_room_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_game.id IS NOT NULL AND v_game.phase NOT IN ('WAITING','FINISHED') THEN
    UPDATE public.player_cards
    SET is_played = TRUE,
        is_folded = TRUE
    WHERE game_id = v_game.id
      AND player_id = v_player.id
      AND is_played = FALSE;

    IF v_game.current_turn = v_player.id THEN
      UPDATE public.games
      SET current_turn = public.catte_next_player_id(p_room_id, v_player.seat_index),
          turn_deadline = NOW() + INTERVAL '20 seconds'
      WHERE id = v_game.id;
    END IF;

    PERFORM public.catte_maybe_finish_round(v_game.id);
  END IF;

  IF v_player.is_host THEN
    SELECT * INTO v_next
    FROM public.room_players
    WHERE room_id = p_room_id
      AND is_alive = TRUE
    ORDER BY seat_index
    LIMIT 1;

    IF v_next.id IS NOT NULL THEN
      UPDATE public.room_players
      SET is_host = FALSE
      WHERE room_id = p_room_id;

      UPDATE public.room_players
      SET is_host = TRUE
      WHERE id = v_next.id;

      UPDATE public.rooms
      SET host_id = v_next.user_id
      WHERE id = p_room_id;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.catte_leave_room(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.catte_start_game(p_room_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_player public.room_players%ROWTYPE;
  v_game_id UUID;
  v_player_count INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF v_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  SELECT * INTO v_player
  FROM public.room_players
  WHERE room_id = p_room_id
    AND user_id = auth.uid()
    AND is_alive = TRUE
  LIMIT 1;

  IF v_player.id IS NULL OR NOT v_player.is_host THEN
    RAISE EXCEPTION 'Only host can start game';
  END IF;

  SELECT COUNT(*) INTO v_player_count
  FROM public.room_players
  WHERE room_id = p_room_id
    AND is_alive = TRUE;

  IF v_player_count < 2 THEN
    RAISE EXCEPTION 'Need at least 2 players';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.games
    WHERE room_id = p_room_id
      AND phase NOT IN ('FINISHED','WAITING')
  ) THEN
    RAISE EXCEPTION 'Game already in progress';
  END IF;

  INSERT INTO public.games (
    room_id,
    phase,
    current_turn,
    lead_player,
    round_number,
    show_player,
    show_stage,
    turn_deadline
  )
  VALUES (
    p_room_id,
    'DEALING',
    v_player.id,
    v_player.id,
    1,
    NULL,
    NULL,
    NOW() + INTERVAL '20 seconds'
  )
  RETURNING id INTO v_game_id;

  WITH ranks AS (
    SELECT UNNEST(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']::public.catte_card_rank[]) AS rank
  ),
  suits AS (
    SELECT UNNEST(ARRAY['S','C','D','H']::public.catte_card_suit[]) AS suit
  ),
  deck AS (
    SELECT rank, suit FROM ranks CROSS JOIN suits
  ),
  shuffled AS (
    SELECT row_number() OVER (ORDER BY gen_random_uuid()) AS idx,
           rank,
           suit
    FROM deck
  ),
  players AS (
    SELECT id, seat_index,
           ROW_NUMBER() OVER (ORDER BY seat_index) - 1 AS seat_pos
    FROM public.room_players
    WHERE room_id = p_room_id
      AND is_alive = TRUE
  )
  INSERT INTO public.player_cards (game_id, player_id, card_rank, card_suit)
  SELECT v_game_id, p.id, s.rank, s.suit
  FROM players p
  JOIN shuffled s
    ON s.idx BETWEEN (p.seat_pos * 6 + 1) AND (p.seat_pos * 6 + 6);

  UPDATE public.games
  SET phase = 'ROUND_1',
      current_turn = v_player.id,
      lead_player = v_player.id,
      round_number = 1,
      turn_deadline = NOW() + INTERVAL '20 seconds'
  WHERE id = v_game_id;

  UPDATE public.rooms
  SET status = 'IN_PROGRESS'
  WHERE id = p_room_id;

  RETURN v_game_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.catte_start_game(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.catte_restart_game(p_room_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player public.room_players%ROWTYPE;
  v_game public.games%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_player
  FROM public.room_players
  WHERE room_id = p_room_id
    AND user_id = auth.uid()
    AND is_alive = TRUE
  LIMIT 1;

  IF v_player.id IS NULL OR NOT v_player.is_host THEN
    RAISE EXCEPTION 'Only host can restart game';
  END IF;

  SELECT * INTO v_game
  FROM public.games
  WHERE room_id = p_room_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_game.id IS NOT NULL THEN
    DELETE FROM public.moves WHERE game_id = v_game.id;
    DELETE FROM public.player_cards WHERE game_id = v_game.id;
    DELETE FROM public.games WHERE id = v_game.id;
  END IF;

  UPDATE public.room_players
  SET is_alive = TRUE
  WHERE room_id = p_room_id
    AND last_seen > NOW() - INTERVAL '20 seconds';

  UPDATE public.rooms
  SET status = 'WAITING'
  WHERE id = p_room_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.catte_restart_game(UUID) TO authenticated;
CREATE OR REPLACE FUNCTION public.catte_ping(p_room_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.room_players
  SET last_seen = NOW()
  WHERE room_id = p_room_id
    AND user_id = auth.uid()
    AND is_alive = TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.catte_ping(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.catte_cleanup_inactive(p_room_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_removed INT := 0;
BEGIN
  UPDATE public.room_players
  SET is_alive = FALSE,
      is_host = FALSE
  WHERE room_id = p_room_id
    AND is_alive = TRUE
    AND last_seen < NOW() - INTERVAL '15 seconds';

  GET DIAGNOSTICS v_removed = ROW_COUNT;

  IF v_removed > 0 THEN
    UPDATE public.rooms
    SET host_id = (
      SELECT user_id
      FROM public.room_players
      WHERE room_id = p_room_id
        AND is_alive = TRUE
      ORDER BY seat_index
      LIMIT 1
    )
    WHERE id = p_room_id;

    UPDATE public.room_players
    SET is_host = (id IN (
      SELECT id
      FROM public.room_players
      WHERE room_id = p_room_id
        AND is_alive = TRUE
      ORDER BY seat_index
      LIMIT 1
    ))
    WHERE room_id = p_room_id;
  END IF;

  RETURN v_removed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.catte_cleanup_inactive(UUID) TO authenticated;
CREATE OR REPLACE FUNCTION public.catte_play_move(
  p_room_id UUID,
  p_move_type public.catte_move_type,
  p_rank public.catte_card_rank,
  p_suit public.catte_card_suit
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player public.room_players%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_lead_suit public.catte_card_suit;
  v_high_rank public.catte_card_rank;
  v_fold_count INT;
  v_alive_count INT;
  v_first_reveals INT;
  v_cup UUID;
  v_next UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_player
  FROM public.room_players
  WHERE room_id = p_room_id
    AND user_id = auth.uid()
    AND is_alive = TRUE
  FOR UPDATE;

  IF v_player.id IS NULL THEN
    RAISE EXCEPTION 'Not seated';
  END IF;

  SELECT * INTO v_game
  FROM public.games
  WHERE room_id = p_room_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_game.id IS NULL OR v_game.phase IN ('WAITING','FINISHED') THEN
    RAISE EXCEPTION 'Game not active';
  END IF;

  IF v_game.current_turn IS NOT NULL AND v_game.current_turn <> v_player.id THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;

  IF v_game.turn_deadline IS NOT NULL AND v_game.turn_deadline < NOW() THEN
    RAISE EXCEPTION 'Turn expired';
  END IF;

  IF v_game.phase IN ('ROUND_1','ROUND_2','ROUND_3','ROUND_4') THEN
    PERFORM 1
    FROM public.player_cards pc
    WHERE pc.game_id = v_game.id
      AND pc.player_id = v_player.id
      AND pc.card_rank = p_rank
      AND pc.card_suit = p_suit
      AND pc.is_played = FALSE
      AND pc.is_folded = FALSE
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Card not available';
    END IF;

    SELECT m.card_suit INTO v_lead_suit
    FROM public.moves m
    WHERE m.game_id = v_game.id
      AND m.round_number = v_game.round_number
      AND m.move_type = 'PLAY'
    ORDER BY m.created_at ASC
    LIMIT 1;

    IF v_lead_suit IS NULL THEN
      IF p_move_type <> 'PLAY' THEN
        RAISE EXCEPTION 'Lead must play';
      END IF;
    ELSE
      IF p_move_type = 'PLAY' THEN
        IF p_suit <> v_lead_suit AND EXISTS (
          SELECT 1 FROM public.player_cards pc
          WHERE pc.game_id = v_game.id
            AND pc.player_id = v_player.id
            AND pc.card_suit = v_lead_suit
            AND pc.is_played = FALSE
            AND pc.is_folded = FALSE
        ) THEN
          RAISE EXCEPTION 'Must follow suit';
        END IF;
      ELSIF p_move_type = 'FOLD' THEN
        SELECT m.card_rank INTO v_high_rank
        FROM public.moves m
        WHERE m.game_id = v_game.id
          AND m.round_number = v_game.round_number
          AND m.move_type = 'PLAY'
          AND m.card_suit = v_lead_suit
        ORDER BY public.catte_rank_value(m.card_rank) DESC,
                 public.catte_suit_value(m.card_suit) DESC
        LIMIT 1;

        IF EXISTS (
          SELECT 1 FROM public.player_cards pc
          WHERE pc.game_id = v_game.id
            AND pc.player_id = v_player.id
            AND pc.card_suit = v_lead_suit
            AND pc.is_played = FALSE
            AND pc.is_folded = FALSE
            AND public.catte_rank_value(pc.card_rank) > public.catte_rank_value(v_high_rank)
        ) THEN
          RAISE EXCEPTION 'Must play a beating card';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid move';
      END IF;
    END IF;

    UPDATE public.player_cards
    SET is_played = TRUE,
        is_folded = (p_move_type = 'FOLD')
    WHERE game_id = v_game.id
      AND player_id = v_player.id
      AND card_rank = p_rank
      AND card_suit = p_suit;

    INSERT INTO public.moves (game_id, player_id, move_type, card_rank, card_suit, round_number)
    VALUES (
      v_game.id,
      v_player.id,
      p_move_type,
      CASE WHEN p_move_type = 'FOLD' THEN NULL ELSE p_rank END,
      CASE WHEN p_move_type = 'FOLD' THEN NULL ELSE p_suit END,
      v_game.round_number
    );

    IF p_move_type = 'FOLD' THEN
      SELECT COUNT(*) INTO v_fold_count
      FROM public.moves
      WHERE game_id = v_game.id
        AND player_id = v_player.id
        AND move_type = 'FOLD';

      IF v_fold_count >= 4 THEN
        UPDATE public.room_players
        SET is_alive = FALSE
        WHERE id = v_player.id;
      END IF;
    END IF;

    UPDATE public.games
    SET current_turn = public.catte_next_player_id(p_room_id, v_player.seat_index),
        turn_deadline = NOW() + INTERVAL '20 seconds'
    WHERE id = v_game.id;

    PERFORM public.catte_maybe_finish_round(v_game.id);
    RETURN v_game.id;
  END IF;

  IF v_game.phase = 'SHOWDOWN' THEN
    PERFORM 1
    FROM public.player_cards pc
    WHERE pc.game_id = v_game.id
      AND pc.player_id = v_player.id
      AND pc.card_rank = p_rank
      AND pc.card_suit = p_suit
      AND pc.is_played = FALSE
      AND pc.is_folded = FALSE
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Card not available';
    END IF;

    IF v_game.show_stage = 'SHOW_FIRST' THEN
      IF v_player.id <> v_game.show_player OR p_move_type <> 'SHOW_FIRST' THEN
        RAISE EXCEPTION 'Show player must reveal first';
      END IF;

      UPDATE public.player_cards
      SET is_played = TRUE
      WHERE game_id = v_game.id
        AND player_id = v_player.id
        AND card_rank = p_rank
        AND card_suit = p_suit;

      INSERT INTO public.moves (game_id, player_id, move_type, card_rank, card_suit, round_number)
      VALUES (v_game.id, v_player.id, 'SHOW_FIRST', p_rank, p_suit, 5);

      UPDATE public.games
      SET show_card_rank = p_rank,
          show_card_suit = p_suit,
          show_stage = 'OTHERS_FIRST',
          current_turn = public.catte_next_player_id(p_room_id, v_player.seat_index, v_game.show_player),
          turn_deadline = NOW() + INTERVAL '20 seconds'
      WHERE id = v_game.id;

      RETURN v_game.id;
    END IF;

    IF v_game.show_stage = 'OTHERS_FIRST' THEN
      IF v_game.current_turn <> v_player.id OR p_move_type <> 'SHOW_FIRST' THEN
        RAISE EXCEPTION 'Waiting for other reveal';
      END IF;

      UPDATE public.player_cards
      SET is_played = TRUE
      WHERE game_id = v_game.id
        AND player_id = v_player.id
        AND card_rank = p_rank
        AND card_suit = p_suit;

      INSERT INTO public.moves (game_id, player_id, move_type, card_rank, card_suit, round_number)
      VALUES (v_game.id, v_player.id, 'SHOW_FIRST', p_rank, p_suit, 5);

      SELECT COUNT(*) INTO v_alive_count
      FROM public.room_players
      WHERE room_id = p_room_id
        AND is_alive = TRUE;

      SELECT COUNT(*) INTO v_first_reveals
      FROM public.moves
      WHERE game_id = v_game.id
        AND move_type = 'SHOW_FIRST';

      IF v_first_reveals >= v_alive_count THEN
        SELECT m.player_id INTO v_cup
        FROM public.moves m
        WHERE m.game_id = v_game.id
          AND m.move_type = 'SHOW_FIRST'
          AND m.player_id <> v_game.show_player
          AND public.catte_compare_cards(m.card_rank, m.card_suit, v_game.show_card_rank, v_game.show_card_suit) > 0
        ORDER BY public.catte_rank_value(m.card_rank) DESC,
                 public.catte_suit_value(m.card_suit) DESC
        LIMIT 1;

        IF v_cup IS NOT NULL THEN
          UPDATE public.games
          SET cup_player = v_cup,
              show_stage = 'CUP_SECOND',
              current_turn = v_cup,
              turn_deadline = NOW() + INTERVAL '20 seconds'
          WHERE id = v_game.id;
        ELSE
          v_next := public.catte_next_player_without_second(v_game.id, p_room_id, v_player.seat_index);
          UPDATE public.games
          SET cup_player = NULL,
              show_stage = 'ALL_SECOND',
              current_turn = v_next,
              turn_deadline = NOW() + INTERVAL '20 seconds'
          WHERE id = v_game.id;
        END IF;
      ELSE
        UPDATE public.games
        SET current_turn = public.catte_next_player_id(p_room_id, v_player.seat_index, v_game.show_player),
            turn_deadline = NOW() + INTERVAL '20 seconds'
        WHERE id = v_game.id;
      END IF;

      RETURN v_game.id;
    END IF;

    IF v_game.show_stage = 'CUP_SECOND' THEN
      IF v_player.id <> v_game.cup_player OR p_move_type <> 'SHOW_SECOND' THEN
        RAISE EXCEPTION 'Cup player must reveal second';
      END IF;

      UPDATE public.player_cards
      SET is_played = TRUE
      WHERE game_id = v_game.id
        AND player_id = v_player.id
        AND card_rank = p_rank
        AND card_suit = p_suit;

      INSERT INTO public.moves (game_id, player_id, move_type, card_rank, card_suit, round_number)
      VALUES (v_game.id, v_player.id, 'SHOW_SECOND', p_rank, p_suit, 5);

      v_next := public.catte_next_player_without_second(v_game.id, p_room_id, v_player.seat_index);
      UPDATE public.games
      SET show_stage = 'ALL_SECOND',
          current_turn = v_next,
          turn_deadline = NOW() + INTERVAL '20 seconds'
      WHERE id = v_game.id;

      RETURN v_game.id;
    END IF;

    IF v_game.show_stage = 'ALL_SECOND' THEN
      IF v_game.current_turn <> v_player.id OR p_move_type <> 'SHOW_SECOND' THEN
        RAISE EXCEPTION 'Waiting for second reveal';
      END IF;

      UPDATE public.player_cards
      SET is_played = TRUE
      WHERE game_id = v_game.id
        AND player_id = v_player.id
        AND card_rank = p_rank
        AND card_suit = p_suit;

      INSERT INTO public.moves (game_id, player_id, move_type, card_rank, card_suit, round_number)
      VALUES (v_game.id, v_player.id, 'SHOW_SECOND', p_rank, p_suit, 5);

      SELECT COUNT(*) INTO v_alive_count
      FROM public.room_players
      WHERE room_id = p_room_id
        AND is_alive = TRUE;

      IF (
        SELECT COUNT(*) FROM public.moves
        WHERE game_id = v_game.id
          AND move_type = 'SHOW_SECOND'
      ) >= v_alive_count THEN
        v_next := public.catte_determine_showdown_winner(v_game.id);
        UPDATE public.games
        SET phase = 'FINISHED',
            winner_player = v_next,
            current_turn = NULL,
            turn_deadline = NULL
        WHERE id = v_game.id;

        UPDATE public.rooms
        SET status = 'FINISHED'
        WHERE id = p_room_id;
      ELSE
        v_next := public.catte_next_player_without_second(v_game.id, p_room_id, v_player.seat_index);
        UPDATE public.games
        SET current_turn = v_next,
            turn_deadline = NOW() + INTERVAL '20 seconds'
        WHERE id = v_game.id;
      END IF;

      RETURN v_game.id;
    END IF;
  END IF;

  RETURN v_game.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.catte_play_move(UUID, public.catte_move_type, public.catte_card_rank, public.catte_card_suit) TO authenticated;

ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.room_players REPLICA IDENTITY FULL;
ALTER TABLE public.games REPLICA IDENTITY FULL;
ALTER TABLE public.player_cards REPLICA IDENTITY FULL;
ALTER TABLE public.moves REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'rooms'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'room_players'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'games'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.games';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'player_cards'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.player_cards';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'moves'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.moves';
  END IF;
END $$;
