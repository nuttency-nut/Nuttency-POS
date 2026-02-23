-- product_variants is unused in the current app flow:
-- ProductForm always sends no variants and POS does not read product_variants.
-- Drop table to simplify schema and avoid dead data paths.

DROP TABLE IF EXISTS public.product_variants;
