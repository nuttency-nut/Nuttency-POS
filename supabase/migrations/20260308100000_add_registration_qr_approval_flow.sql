CREATE TABLE IF NOT EXISTS public.registration_qr_approvals (
  payload TEXT PRIMARY KEY,
  approved_by UUID NOT NULL REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS registration_qr_approvals_expires_at_idx
ON public.registration_qr_approvals (expires_at DESC);

ALTER TABLE public.registration_qr_approvals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.registration_qr_approvals FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.registration_qr_extract_slot(p_payload TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_match TEXT[];
BEGIN
  IF p_payload IS NULL THEN
    RETURN NULL;
  END IF;

  v_match := regexp_match(TRIM(p_payload), '^NUTPOS-REG\|v1\|([0-9]{1,20})$');
  IF v_match IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_match[1]::BIGINT;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

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

  IF NOT public.has_role('admin'::public.app_role, auth.uid()) THEN
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

  DELETE FROM public.registration_qr_approvals
  WHERE expires_at <= NOW();

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

GRANT EXECUTE ON FUNCTION public.approve_registration_qr(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_registration_qr_approved(p_payload TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_payload TEXT;
  v_slot BIGINT;
BEGIN
  v_payload := TRIM(COALESCE(p_payload, ''));
  v_slot := public.registration_qr_extract_slot(v_payload);
  IF v_slot IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.registration_qr_approvals r
    WHERE r.payload = v_payload
      AND r.expires_at > NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_registration_qr_approved(TEXT) TO anon, authenticated;
