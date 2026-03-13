CREATE OR REPLACE FUNCTION public.catte_join_room_v2(p_room_id UUID)
RETURNS TABLE (
  player_id UUID,
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
    RETURN QUERY SELECT v_existing.id, v_existing.seat_index, v_existing.is_host;
    RETURN;
  END IF;

  IF v_room.status <> 'WAITING' THEN
    RAISE EXCEPTION 'Game already started';
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
    UPDATE public.room_players AS rp
    SET seat_index = v_seat,
        is_alive = TRUE,
        is_host = v_is_host,
        joined_at = NOW(),
        last_seen = NOW()
    WHERE id = v_existing.id
    RETURNING rp.* INTO v_existing;
  ELSE
    INSERT INTO public.room_players AS rp (room_id, user_id, seat_index, is_alive, is_host)
    VALUES (p_room_id, auth.uid(), v_seat, TRUE, v_is_host)
    RETURNING rp.* INTO v_existing;
  END IF;

  IF v_is_host THEN
    UPDATE public.rooms
    SET host_id = auth.uid()
    WHERE id = p_room_id;
  END IF;

  RETURN QUERY SELECT v_existing.id, v_existing.seat_index, v_existing.is_host;
END;
$$;

GRANT EXECUTE ON FUNCTION public.catte_join_room_v2(UUID) TO authenticated;
