
-- Customers table for loyalty
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view customers" ON public.customers FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert customers" ON public.customers FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update customers" ON public.customers FOR UPDATE USING (true);

CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add columns to orders
ALTER TABLE public.orders ADD COLUMN customer_name TEXT NOT NULL DEFAULT 'Khách lẻ';
ALTER TABLE public.orders ADD COLUMN customer_phone TEXT;
ALTER TABLE public.orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash';
ALTER TABLE public.orders ADD COLUMN loyalty_points_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN customer_id UUID REFERENCES public.customers(id);

-- Add note to order_items
ALTER TABLE public.order_items ADD COLUMN note TEXT;
