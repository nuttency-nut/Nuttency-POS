-- Normalize product classifications to avoid duplicated group/option rows across products.

-- Catalog: unique group definitions
CREATE TABLE IF NOT EXISTS public.classification_group_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  allow_multiple BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT uq_classification_group_catalog UNIQUE (name, allow_multiple)
);

-- Catalog: unique option definitions under each group
CREATE TABLE IF NOT EXISTS public.classification_option_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_catalog_id UUID NOT NULL REFERENCES public.classification_group_catalog(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  extra_price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT uq_classification_option_catalog UNIQUE (group_catalog_id, name, extra_price)
);

-- Product-level group usage
CREATE TABLE IF NOT EXISTS public.product_classification_group_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  group_catalog_id UUID NOT NULL REFERENCES public.classification_group_catalog(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_group_link UNIQUE (product_id, group_catalog_id, sort_order)
);

-- Product-level option usage
CREATE TABLE IF NOT EXISTS public.product_classification_option_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_link_id UUID NOT NULL REFERENCES public.product_classification_group_links(id) ON DELETE CASCADE,
  option_catalog_id UUID NOT NULL REFERENCES public.classification_option_catalog(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT uq_group_option_link UNIQUE (group_link_id, option_catalog_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_class_group_catalog_name ON public.classification_group_catalog(name);
CREATE INDEX IF NOT EXISTS idx_class_option_catalog_group ON public.classification_option_catalog(group_catalog_id);
CREATE INDEX IF NOT EXISTS idx_product_class_group_links_product ON public.product_classification_group_links(product_id);
CREATE INDEX IF NOT EXISTS idx_product_class_option_links_group_link ON public.product_classification_option_links(group_link_id);

ALTER TABLE public.classification_group_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classification_option_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_classification_group_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_classification_option_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view classification group catalog" ON public.classification_group_catalog;
CREATE POLICY "Authenticated users can view classification group catalog"
ON public.classification_group_catalog FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Managers can manage classification group catalog" ON public.classification_group_catalog;
CREATE POLICY "Managers can manage classification group catalog"
ON public.classification_group_catalog FOR ALL
TO authenticated
USING (public.can_manage(auth.uid()))
WITH CHECK (public.can_manage(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view classification option catalog" ON public.classification_option_catalog;
CREATE POLICY "Authenticated users can view classification option catalog"
ON public.classification_option_catalog FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Managers can manage classification option catalog" ON public.classification_option_catalog;
CREATE POLICY "Managers can manage classification option catalog"
ON public.classification_option_catalog FOR ALL
TO authenticated
USING (public.can_manage(auth.uid()))
WITH CHECK (public.can_manage(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view product classification group links" ON public.product_classification_group_links;
CREATE POLICY "Authenticated users can view product classification group links"
ON public.product_classification_group_links FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Managers can manage product classification group links" ON public.product_classification_group_links;
CREATE POLICY "Managers can manage product classification group links"
ON public.product_classification_group_links FOR ALL
TO authenticated
USING (public.can_manage(auth.uid()))
WITH CHECK (public.can_manage(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view product classification option links" ON public.product_classification_option_links;
CREATE POLICY "Authenticated users can view product classification option links"
ON public.product_classification_option_links FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Managers can manage product classification option links" ON public.product_classification_option_links;
CREATE POLICY "Managers can manage product classification option links"
ON public.product_classification_option_links FOR ALL
TO authenticated
USING (public.can_manage(auth.uid()))
WITH CHECK (public.can_manage(auth.uid()));

DROP TRIGGER IF EXISTS update_classification_group_catalog_updated_at ON public.classification_group_catalog;
CREATE TRIGGER update_classification_group_catalog_updated_at
BEFORE UPDATE ON public.classification_group_catalog
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_classification_option_catalog_updated_at ON public.classification_option_catalog;
CREATE TRIGGER update_classification_option_catalog_updated_at
BEFORE UPDATE ON public.classification_option_catalog
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_product_classification_group_links_updated_at ON public.product_classification_group_links;
CREATE TRIGGER update_product_classification_group_links_updated_at
BEFORE UPDATE ON public.product_classification_group_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill data from legacy product_classification_groups/options into normalized model
DO $$
DECLARE
  grp RECORD;
  opt RECORD;
  v_group_catalog_id UUID;
  v_group_link_id UUID;
  v_option_catalog_id UUID;
BEGIN
  FOR grp IN
    SELECT g.id, g.product_id, g.name, g.allow_multiple, g.sort_order
    FROM public.product_classification_groups g
    ORDER BY g.created_at, g.sort_order, g.id
  LOOP
    SELECT id
    INTO v_group_catalog_id
    FROM public.classification_group_catalog
    WHERE name = grp.name
      AND allow_multiple = grp.allow_multiple
    LIMIT 1;

    IF v_group_catalog_id IS NULL THEN
      INSERT INTO public.classification_group_catalog (name, allow_multiple)
      VALUES (grp.name, grp.allow_multiple)
      RETURNING id INTO v_group_catalog_id;
    END IF;

    INSERT INTO public.product_classification_group_links (product_id, group_catalog_id, sort_order)
    VALUES (grp.product_id, v_group_catalog_id, grp.sort_order)
    ON CONFLICT (product_id, group_catalog_id, sort_order) DO UPDATE
    SET sort_order = EXCLUDED.sort_order
    RETURNING id INTO v_group_link_id;

    FOR opt IN
      SELECT o.id, o.name, o.extra_price, o.sort_order
      FROM public.product_classification_options o
      WHERE o.group_id = grp.id
      ORDER BY o.sort_order, o.id
    LOOP
      SELECT id
      INTO v_option_catalog_id
      FROM public.classification_option_catalog
      WHERE group_catalog_id = v_group_catalog_id
        AND name = opt.name
        AND extra_price = opt.extra_price
      LIMIT 1;

      IF v_option_catalog_id IS NULL THEN
        INSERT INTO public.classification_option_catalog (group_catalog_id, name, extra_price)
        VALUES (v_group_catalog_id, opt.name, opt.extra_price)
        RETURNING id INTO v_option_catalog_id;
      END IF;

      INSERT INTO public.product_classification_option_links (group_link_id, option_catalog_id, sort_order)
      VALUES (v_group_link_id, v_option_catalog_id, opt.sort_order)
      ON CONFLICT (group_link_id, option_catalog_id, sort_order) DO UPDATE
      SET sort_order = EXCLUDED.sort_order;
    END LOOP;
  END LOOP;
END $$;
