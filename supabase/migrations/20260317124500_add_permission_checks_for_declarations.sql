-- Permission checks for declared roles/stores
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = _user_id
          AND ur.role::text IN ('admin', 'manager')
      )
      THEN true
      ELSE COALESCE(
        (
          SELECT (rd.permissions ->> _permission_key)::boolean
          FROM public.user_role_assignments ura
          JOIN public.role_definitions rd ON rd.id = ura.role_id
          WHERE ura.user_id = _user_id
          LIMIT 1
        ),
        false
      )
    END
$$;

-- role_definitions policies
DROP POLICY IF EXISTS "Managers can manage role definitions" ON public.role_definitions;
CREATE POLICY "Roles can manage role definitions"
  ON public.role_definitions FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), 'settings.role_declaration'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.role_declaration'));

-- store_definitions policies
DROP POLICY IF EXISTS "Managers can manage store definitions" ON public.store_definitions;
CREATE POLICY "Roles can manage store definitions"
  ON public.store_definitions FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), 'settings.store_declaration'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.store_declaration'));

-- user_role_assignments policies
DROP POLICY IF EXISTS "Users can view their role assignments" ON public.user_role_assignments;
CREATE POLICY "Users can view their role assignments"
  ON public.user_role_assignments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_permission(auth.uid(), 'settings.roles'));

DROP POLICY IF EXISTS "Managers can manage role assignments" ON public.user_role_assignments;
CREATE POLICY "Roles can manage role assignments"
  ON public.user_role_assignments FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), 'settings.roles'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.roles'));

-- user_store_assignments policies
DROP POLICY IF EXISTS "Users can view their store assignments" ON public.user_store_assignments;
CREATE POLICY "Users can view their store assignments"
  ON public.user_store_assignments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_permission(auth.uid(), 'settings.roles'));

DROP POLICY IF EXISTS "Managers can manage store assignments" ON public.user_store_assignments;
CREATE POLICY "Roles can manage store assignments"
  ON public.user_store_assignments FOR ALL
  TO authenticated
  USING (public.has_permission(auth.uid(), 'settings.roles'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.roles'));

-- role management RPC now respects declared permissions
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
    COALESCE(ur.role, 'no_role'::public.app_role) AS role
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  WHERE public.has_permission(auth.uid(), 'settings.roles')
$$;

GRANT EXECUTE ON FUNCTION public.list_users_for_role_management() TO authenticated;
