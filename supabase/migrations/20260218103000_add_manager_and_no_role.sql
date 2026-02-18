-- Extend role enum for new permission model
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'no_role';

-- Recreate auth tables if they were removed manually
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Backfill for existing auth users when tables were recreated
INSERT INTO public.profiles (user_id, full_name)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL;

DO $$
BEGIN
  EXECUTE 'INSERT INTO public.user_roles (user_id, role)
  SELECT u.id, ''no_role''
  FROM auth.users u
  LEFT JOIN public.user_roles r ON r.user_id = u.id
  WHERE r.user_id IS NULL';
END $$;

-- New accounts should always start without permission
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  -- Use dynamic SQL so new enum value is resolved at runtime (after migration commit)
  EXECUTE 'INSERT INTO public.user_roles (user_id, role) VALUES ($1, ''no_role'')'
  USING NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper for manager/admin checks in RLS
CREATE OR REPLACE FUNCTION public.can_manage(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role::text IN ('admin', 'manager')
  )
$$;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- user_roles
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Managers can manage all roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.can_manage(auth.uid()))
  WITH CHECK (public.can_manage(auth.uid()));

-- profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Managers can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.can_manage(auth.uid()));

-- categories
DROP POLICY IF EXISTS "Admins can insert categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can update categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can delete categories" ON public.categories;
CREATE POLICY "Managers can insert categories"
  ON public.categories FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage(auth.uid()));
CREATE POLICY "Managers can update categories"
  ON public.categories FOR UPDATE
  TO authenticated
  USING (public.can_manage(auth.uid()));
CREATE POLICY "Managers can delete categories"
  ON public.categories FOR DELETE
  TO authenticated
  USING (public.can_manage(auth.uid()));

-- products
DROP POLICY IF EXISTS "Admins can insert products" ON public.products;
DROP POLICY IF EXISTS "Admins can update products" ON public.products;
DROP POLICY IF EXISTS "Admins can delete products" ON public.products;
CREATE POLICY "Managers can insert products"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage(auth.uid()));
CREATE POLICY "Managers can update products"
  ON public.products FOR UPDATE
  TO authenticated
  USING (public.can_manage(auth.uid()));
CREATE POLICY "Managers can delete products"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.can_manage(auth.uid()));

-- product_variants
DROP POLICY IF EXISTS "Admins can insert variants" ON public.product_variants;
DROP POLICY IF EXISTS "Admins can update variants" ON public.product_variants;
DROP POLICY IF EXISTS "Admins can delete variants" ON public.product_variants;
CREATE POLICY "Managers can insert variants"
  ON public.product_variants FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage(auth.uid()));
CREATE POLICY "Managers can update variants"
  ON public.product_variants FOR UPDATE
  TO authenticated
  USING (public.can_manage(auth.uid()));
CREATE POLICY "Managers can delete variants"
  ON public.product_variants FOR DELETE
  TO authenticated
  USING (public.can_manage(auth.uid()));

-- product classification groups
DROP POLICY IF EXISTS "Admins can insert classification groups" ON public.product_classification_groups;
DROP POLICY IF EXISTS "Admins can update classification groups" ON public.product_classification_groups;
DROP POLICY IF EXISTS "Admins can delete classification groups" ON public.product_classification_groups;
CREATE POLICY "Managers can insert classification groups"
  ON public.product_classification_groups FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage(auth.uid()));
CREATE POLICY "Managers can update classification groups"
  ON public.product_classification_groups FOR UPDATE
  TO authenticated
  USING (public.can_manage(auth.uid()));
CREATE POLICY "Managers can delete classification groups"
  ON public.product_classification_groups FOR DELETE
  TO authenticated
  USING (public.can_manage(auth.uid()));

-- product classification options
DROP POLICY IF EXISTS "Admins can insert classification options" ON public.product_classification_options;
DROP POLICY IF EXISTS "Admins can update classification options" ON public.product_classification_options;
DROP POLICY IF EXISTS "Admins can delete classification options" ON public.product_classification_options;
CREATE POLICY "Managers can insert classification options"
  ON public.product_classification_options FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage(auth.uid()));
CREATE POLICY "Managers can update classification options"
  ON public.product_classification_options FOR UPDATE
  TO authenticated
  USING (public.can_manage(auth.uid()));
CREATE POLICY "Managers can delete classification options"
  ON public.product_classification_options FOR DELETE
  TO authenticated
  USING (public.can_manage(auth.uid()));

-- orders
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can delete orders" ON public.orders;
CREATE POLICY "Managers can update orders" ON public.orders FOR UPDATE
USING (public.can_manage(auth.uid()));
CREATE POLICY "Managers can delete orders" ON public.orders FOR DELETE
USING (public.can_manage(auth.uid()));
