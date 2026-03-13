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
    AND last_seen < NOW() - INTERVAL '120 seconds';

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
