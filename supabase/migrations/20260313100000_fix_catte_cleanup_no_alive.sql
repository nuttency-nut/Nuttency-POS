CREATE OR REPLACE FUNCTION public.catte_cleanup_inactive(p_room_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_removed INT := 0;
  v_alive INT := 0;
  v_game_id UUID;
BEGIN
  UPDATE public.room_players
  SET is_alive = FALSE,
      is_host = FALSE
  WHERE room_id = p_room_id
    AND is_alive = TRUE
    AND last_seen < NOW() - INTERVAL '15 seconds';

  GET DIAGNOSTICS v_removed = ROW_COUNT;

  SELECT COUNT(*) INTO v_alive
  FROM public.room_players
  WHERE room_id = p_room_id
    AND is_alive = TRUE;

  IF v_alive = 0 THEN
    UPDATE public.room_players
    SET is_host = FALSE
    WHERE room_id = p_room_id;

    SELECT id INTO v_game_id
    FROM public.games
    WHERE room_id = p_room_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_game_id IS NOT NULL THEN
      UPDATE public.games
      SET phase = 'FINISHED',
          winner_player = NULL,
          current_turn = NULL,
          turn_deadline = NULL
      WHERE id = v_game_id
        AND phase <> 'FINISHED';
    END IF;

    UPDATE public.rooms
    SET status = 'WAITING',
        host_id = NULL
    WHERE id = p_room_id;

    RETURN v_removed;
  END IF;

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
