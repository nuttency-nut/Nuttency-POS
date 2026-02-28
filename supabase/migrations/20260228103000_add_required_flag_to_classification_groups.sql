-- Add "required" behavior for product classification groups.
ALTER TABLE public.classification_group_catalog
ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'classification_group_catalog'
      AND constraint_name = 'uq_classification_group_catalog'
  ) THEN
    ALTER TABLE public.classification_group_catalog
      DROP CONSTRAINT uq_classification_group_catalog;
  END IF;
END $$;

ALTER TABLE public.classification_group_catalog
ADD CONSTRAINT uq_classification_group_catalog UNIQUE (name, allow_multiple, is_required);
