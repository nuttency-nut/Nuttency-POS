-- Drop legacy duplicated classification tables
-- Run this only after 20260223130000_normalize_product_classifications.sql has been applied successfully.

DROP TABLE IF EXISTS public.product_classification_options;
DROP TABLE IF EXISTS public.product_classification_groups;
