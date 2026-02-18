-- Extend role enum for new permission model
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'no_role';

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

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'no_role');

  RETURN NEW;
END;
$$;

-- Helper for manager/admin checks in RLS
CREATE OR REPLACE FUNCTION public.can_manage(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'manager'::public.app_role)
$$;

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
