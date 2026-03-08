CREATE OR REPLACE FUNCTION public.approve_registration_qr(p_payload TEXT)
RETURNS TABLE (
  approved BOOLEAN,
  expires_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload TEXT;
  v_slot BIGINT;
  v_now_slot BIGINT;
  v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'Only admin can approve registration QR';
  END IF;

  v_payload := TRIM(COALESCE(p_payload, ''));
  v_slot := public.registration_qr_extract_slot(v_payload);
  IF v_slot IS NULL THEN
    RAISE EXCEPTION 'Invalid registration QR payload';
  END IF;

  v_now_slot := FLOOR(EXTRACT(EPOCH FROM NOW()) / 60)::BIGINT;
  IF v_slot < v_now_slot - 1 OR v_slot > v_now_slot + 1 THEN
    RAISE EXCEPTION 'Registration QR expired';
  END IF;

  v_expires_at := to_timestamp((v_slot + 1) * 60 + 5);

  DELETE FROM public.registration_qr_approvals r
  WHERE r.expires_at <= NOW();

  INSERT INTO public.registration_qr_approvals (payload, approved_by, approved_at, expires_at)
  VALUES (v_payload, auth.uid(), NOW(), v_expires_at)
  ON CONFLICT (payload) DO UPDATE
  SET
    approved_by = EXCLUDED.approved_by,
    approved_at = EXCLUDED.approved_at,
    expires_at = EXCLUDED.expires_at;

  RETURN QUERY SELECT TRUE, v_expires_at;
END;
$$;
