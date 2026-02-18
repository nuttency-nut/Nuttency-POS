-- Speed up role-management list query
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

CREATE OR REPLACE FUNCTION public.role_level(_role_text TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _role_text
    WHEN 'admin' THEN 4
    WHEN 'manager' THEN 3
    WHEN 'staff' THEN 2
    WHEN 'no_role' THEN 1
    ELSE 0
  END
$$;

CREATE OR REPLACE FUNCTION public.user_level(_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(public.role_level(ur.role::text)), 0)
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
$$;

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
  WHERE public.user_level(auth.uid()) >= 3
    AND (
      u.id = auth.uid()
      OR public.user_level(auth.uid()) > public.user_level(u.id)
    )
  ORDER BY COALESCE(p.full_name, u.email, u.id::text)
$$;

GRANT EXECUTE ON FUNCTION public.list_users_for_role_management() TO authenticated;
