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

  SELECT r.id INTO v_room_id
  FROM public.rooms r
  LEFT JOIN (
    SELECT room_id, COUNT(*) AS alive_count
    FROM public.room_players
    WHERE is_alive = TRUE
    GROUP BY room_id
  ) c ON c.room_id = r.id
  WHERE r.status = 'WAITING'
    AND COALESCE(c.alive_count, 0) < 6
  ORDER BY r.created_at DESC
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
