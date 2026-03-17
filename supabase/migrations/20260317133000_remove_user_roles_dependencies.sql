-- Remove dependency on user_roles table for new signup and permission checks
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Permission check now relies only on declared roles
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (rd.permissions ->> _permission_key)::boolean
      FROM public.user_role_assignments ura
      JOIN public.role_definitions rd ON rd.id = ura.role_id
      WHERE ura.user_id = _user_id
      LIMIT 1
    ),
    false
  )
$$;

-- Legacy helper now returns false without user_roles table
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT false
$$;

-- Role management RPC no longer joins user_roles
CREATE OR REPLACE FUNCTION public.list_users_for_role_management()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  role public.app_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id AS user_id,
    u.email,
    p.full_name,
    'no_role'::public.app_role AS role
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE public.has_permission(auth.uid(), 'settings.roles')
$$;

GRANT EXECUTE ON FUNCTION public.list_users_for_role_management() TO authenticated;

-- Registration QR approval now uses permission key
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

  IF NOT public.has_permission(auth.uid(), 'settings.roles.qr') THEN
    RAISE EXCEPTION 'Permission denied for registration QR';
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

-- Profiles
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers can view all profiles" ON public.profiles;
    CREATE POLICY "Roles can view all profiles"
      ON public.profiles FOR SELECT
      TO authenticated
      USING (public.has_permission(auth.uid(), 'settings.roles'));
  END IF;
END $$;

-- Categories
DO $$
BEGIN
  IF to_regclass('public.categories') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers can insert categories" ON public.categories;
    DROP POLICY IF EXISTS "Managers can update categories" ON public.categories;
    DROP POLICY IF EXISTS "Managers can delete categories" ON public.categories;
    CREATE POLICY "Roles can manage categories"
      ON public.categories FOR ALL
      TO authenticated
      USING (public.has_permission(auth.uid(), 'products'))
      WITH CHECK (public.has_permission(auth.uid(), 'products'));
  END IF;
END $$;

-- Products
DO $$
BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers can insert products" ON public.products;
    DROP POLICY IF EXISTS "Managers can update products" ON public.products;
    DROP POLICY IF EXISTS "Managers can delete products" ON public.products;
    CREATE POLICY "Roles can manage products"
      ON public.products FOR ALL
      TO authenticated
      USING (public.has_permission(auth.uid(), 'products'))
      WITH CHECK (public.has_permission(auth.uid(), 'products'));
  END IF;
END $$;

-- Product variants
DO $$
BEGIN
  IF to_regclass('public.product_variants') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers can insert variants" ON public.product_variants;
    DROP POLICY IF EXISTS "Managers can update variants" ON public.product_variants;
    DROP POLICY IF EXISTS "Managers can delete variants" ON public.product_variants;
    CREATE POLICY "Roles can manage product variants"
      ON public.product_variants FOR ALL
      TO authenticated
      USING (public.has_permission(auth.uid(), 'products'))
      WITH CHECK (public.has_permission(auth.uid(), 'products'));
  END IF;
END $$;

-- Legacy product classification tables
DO $$
BEGIN
  IF to_regclass('public.product_classification_groups') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers can insert classification groups" ON public.product_classification_groups;
    DROP POLICY IF EXISTS "Managers can update classification groups" ON public.product_classification_groups;
    DROP POLICY IF EXISTS "Managers can delete classification groups" ON public.product_classification_groups;
    CREATE POLICY "Roles can manage product classification groups"
      ON public.product_classification_groups FOR ALL
      TO authenticated
      USING (public.has_permission(auth.uid(), 'products'))
      WITH CHECK (public.has_permission(auth.uid(), 'products'));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.product_classification_options') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers can insert classification options" ON public.product_classification_options;
    DROP POLICY IF EXISTS "Managers can update classification options" ON public.product_classification_options;
    DROP POLICY IF EXISTS "Managers can delete classification options" ON public.product_classification_options;
    CREATE POLICY "Roles can manage product classification options"
      ON public.product_classification_options FOR ALL
      TO authenticated
      USING (public.has_permission(auth.uid(), 'products'))
      WITH CHECK (public.has_permission(auth.uid(), 'products'));
  END IF;
END $$;

-- Normalized classification catalogs/links
DO $$
BEGIN
  IF to_regclass('public.classification_group_catalog') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers can manage classification group catalog" ON public.classification_group_catalog;
    CREATE POLICY "Roles can manage classification group catalog"
      ON public.classification_group_catalog FOR ALL
      TO authenticated
      USING (public.has_permission(auth.uid(), 'products'))
      WITH CHECK (public.has_permission(auth.uid(), 'products'));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.classification_option_catalog') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers can manage classification option catalog" ON public.classification_option_catalog;
    CREATE POLICY "Roles can manage classification option catalog"
      ON public.classification_option_catalog FOR ALL
      TO authenticated
      USING (public.has_permission(auth.uid(), 'products'))
      WITH CHECK (public.has_permission(auth.uid(), 'products'));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.product_classification_group_links') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers can manage product classification group links" ON public.product_classification_group_links;
    CREATE POLICY "Roles can manage product classification group links"
      ON public.product_classification_group_links FOR ALL
      TO authenticated
      USING (public.has_permission(auth.uid(), 'products'))
      WITH CHECK (public.has_permission(auth.uid(), 'products'));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.product_classification_option_links') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers can manage product classification option links" ON public.product_classification_option_links;
    CREATE POLICY "Roles can manage product classification option links"
      ON public.product_classification_option_links FOR ALL
      TO authenticated
      USING (public.has_permission(auth.uid(), 'products'))
      WITH CHECK (public.has_permission(auth.uid(), 'products'));
  END IF;
END $$;

-- Orders
DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers can update orders" ON public.orders;
    DROP POLICY IF EXISTS "Managers can delete orders" ON public.orders;
    CREATE POLICY "Roles can update orders"
      ON public.orders FOR UPDATE
      TO authenticated
      USING (public.has_permission(auth.uid(), 'orders.update'))
      WITH CHECK (public.has_permission(auth.uid(), 'orders.update'));

    CREATE POLICY "Roles can delete orders"
      ON public.orders FOR DELETE
      TO authenticated
      USING (public.has_permission(auth.uid(), 'orders.update'));
  END IF;
END $$;
