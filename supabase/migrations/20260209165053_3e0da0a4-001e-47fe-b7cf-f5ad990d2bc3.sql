
-- Storage bucket for product images
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);

-- Allow authenticated users to upload product images
CREATE POLICY "Authenticated users can upload product images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');

CREATE POLICY "Public can view product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can update product images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete product images"
ON storage.objects FOR DELETE
USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- Classification groups table
CREATE TABLE public.product_classification_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  allow_multiple BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Classification options table
CREATE TABLE public.product_classification_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.product_classification_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_classification_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_classification_options ENABLE ROW LEVEL SECURITY;

-- RLS: classification groups
CREATE POLICY "Authenticated users can view classification groups"
ON public.product_classification_groups FOR SELECT
USING (true);

CREATE POLICY "Admins can insert classification groups"
ON public.product_classification_groups FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update classification groups"
ON public.product_classification_groups FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete classification groups"
ON public.product_classification_groups FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS: classification options
CREATE POLICY "Authenticated users can view classification options"
ON public.product_classification_options FOR SELECT
USING (true);

CREATE POLICY "Admins can insert classification options"
ON public.product_classification_options FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update classification options"
ON public.product_classification_options FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete classification options"
ON public.product_classification_options FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Indexes
CREATE INDEX idx_classification_groups_product ON public.product_classification_groups(product_id);
CREATE INDEX idx_classification_options_group ON public.product_classification_options(group_id);

-- Trigger for updated_at
CREATE TRIGGER update_classification_groups_updated_at
BEFORE UPDATE ON public.product_classification_groups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
