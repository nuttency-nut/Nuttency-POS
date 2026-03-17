-- Role and store declarations
CREATE TABLE IF NOT EXISTS public.role_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS role_definitions_name_key ON public.role_definitions (name);

CREATE TABLE IF NOT EXISTS public.store_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name TEXT NOT NULL,
  warehouse_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT store_definitions_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE IF NOT EXISTS public.user_role_assignments (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.role_definitions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_store_assignments (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.store_definitions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.role_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_store_assignments ENABLE ROW LEVEL SECURITY;

-- role_definitions policies
DROP POLICY IF EXISTS "Role definitions are viewable by authenticated" ON public.role_definitions;
CREATE POLICY "Role definitions are viewable by authenticated"
  ON public.role_definitions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Managers can manage role definitions" ON public.role_definitions;
CREATE POLICY "Managers can manage role definitions"
  ON public.role_definitions FOR ALL
  TO authenticated
  USING (public.can_manage(auth.uid()))
  WITH CHECK (public.can_manage(auth.uid()));

-- store_definitions policies
DROP POLICY IF EXISTS "Store definitions are viewable by authenticated" ON public.store_definitions;
CREATE POLICY "Store definitions are viewable by authenticated"
  ON public.store_definitions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Managers can manage store definitions" ON public.store_definitions;
CREATE POLICY "Managers can manage store definitions"
  ON public.store_definitions FOR ALL
  TO authenticated
  USING (public.can_manage(auth.uid()))
  WITH CHECK (public.can_manage(auth.uid()));

-- user_role_assignments policies
DROP POLICY IF EXISTS "Users can view their role assignments" ON public.user_role_assignments;
CREATE POLICY "Users can view their role assignments"
  ON public.user_role_assignments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.can_manage(auth.uid()));

DROP POLICY IF EXISTS "Managers can manage role assignments" ON public.user_role_assignments;
CREATE POLICY "Managers can manage role assignments"
  ON public.user_role_assignments FOR ALL
  TO authenticated
  USING (public.can_manage(auth.uid()))
  WITH CHECK (public.can_manage(auth.uid()));

-- user_store_assignments policies
DROP POLICY IF EXISTS "Users can view their store assignments" ON public.user_store_assignments;
CREATE POLICY "Users can view their store assignments"
  ON public.user_store_assignments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.can_manage(auth.uid()));

DROP POLICY IF EXISTS "Managers can manage store assignments" ON public.user_store_assignments;
CREATE POLICY "Managers can manage store assignments"
  ON public.user_store_assignments FOR ALL
  TO authenticated
  USING (public.can_manage(auth.uid()))
  WITH CHECK (public.can_manage(auth.uid()));

-- update triggers
DROP TRIGGER IF EXISTS update_role_definitions_updated_at ON public.role_definitions;
CREATE TRIGGER update_role_definitions_updated_at
  BEFORE UPDATE ON public.role_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_store_definitions_updated_at ON public.store_definitions;
CREATE TRIGGER update_store_definitions_updated_at
  BEFORE UPDATE ON public.store_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_role_assignments_updated_at ON public.user_role_assignments;
CREATE TRIGGER update_user_role_assignments_updated_at
  BEFORE UPDATE ON public.user_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_store_assignments_updated_at ON public.user_store_assignments;
CREATE TRIGGER update_user_store_assignments_updated_at
  BEFORE UPDATE ON public.user_store_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
