ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS income_receipt_code TEXT,
ADD COLUMN IF NOT EXISTS income_recorded_at TIMESTAMP WITH TIME ZONE;

CREATE SEQUENCE IF NOT EXISTS income_receipt_seq START 1;

CREATE UNIQUE INDEX IF NOT EXISTS orders_income_receipt_code_uidx
ON public.orders (income_receipt_code)
WHERE income_receipt_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_income_receipt_on_order_paid()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status = 'cancelled' THEN
    RAISE EXCEPTION 'Paid orders cannot be cancelled';
  END IF;

  IF NEW.status = 'completed' THEN
    IF NEW.income_receipt_code IS NULL OR NEW.income_receipt_code = '' THEN
      NEW.income_receipt_code :=
        'IC' || TO_CHAR(NOW(), 'DDMMYY') || LPAD(nextval('income_receipt_seq')::TEXT, 6, '0');
    END IF;

    IF NEW.income_recorded_at IS NULL THEN
      NEW.income_recorded_at := NOW();
    END IF;
  ELSE
    NEW.income_receipt_code := NULL;
    NEW.income_recorded_at := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS orders_apply_income_receipt_on_paid ON public.orders;
CREATE TRIGGER orders_apply_income_receipt_on_paid
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.apply_income_receipt_on_order_paid();
