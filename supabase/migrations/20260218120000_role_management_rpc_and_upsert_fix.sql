-- RPC for role-management screen (includes email from auth.users)
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
  WHERE public.can_manage(auth.uid())
$$;

GRANT EXECUTE ON FUNCTION public.list_users_for_role_management() TO authenticated;
