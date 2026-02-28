CREATE TABLE IF NOT EXISTS public.financial_vouchers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  voucher_type TEXT NOT NULL CHECK (voucher_type IN ('income', 'expense')),
  voucher_code TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0),
  payment_method TEXT NOT NULL DEFAULT 'cash',
  payment_content TEXT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  order_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_vouchers_voucher_code_uidx
ON public.financial_vouchers (voucher_code);

CREATE UNIQUE INDEX IF NOT EXISTS financial_vouchers_order_income_uidx
ON public.financial_vouchers (order_id, voucher_type)
WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS financial_vouchers_created_at_idx
ON public.financial_vouchers (created_at DESC);

ALTER TABLE public.financial_vouchers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view financial vouchers" ON public.financial_vouchers;
CREATE POLICY "Authenticated users can view financial vouchers"
ON public.financial_vouchers
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert financial vouchers" ON public.financial_vouchers;
CREATE POLICY "Authenticated users can insert financial vouchers"
ON public.financial_vouchers
FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update financial vouchers" ON public.financial_vouchers;
CREATE POLICY "Authenticated users can update financial vouchers"
ON public.financial_vouchers
FOR UPDATE
USING (true)
WITH CHECK (true);

DROP TRIGGER IF EXISTS update_financial_vouchers_updated_at ON public.financial_vouchers;
CREATE TRIGGER update_financial_vouchers_updated_at
BEFORE UPDATE ON public.financial_vouchers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

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

    INSERT INTO public.financial_vouchers (
      voucher_type,
      voucher_code,
      amount,
      payment_method,
      payment_content,
      order_id,
      order_number
    )
    VALUES (
      'income',
      NEW.income_receipt_code,
      COALESCE(NEW.total_amount, 0),
      COALESCE(NEW.payment_method, 'cash'),
      CASE WHEN NEW.payment_method = 'transfer' THEN NEW.transfer_content ELSE NULL END,
      NEW.id,
      NEW.order_number
    )
    ON CONFLICT (order_id, voucher_type)
    DO UPDATE SET
      voucher_code = EXCLUDED.voucher_code,
      amount = EXCLUDED.amount,
      payment_method = EXCLUDED.payment_method,
      payment_content = EXCLUDED.payment_content,
      order_number = EXCLUDED.order_number,
      updated_at = NOW();
  ELSE
    NEW.income_receipt_code := NULL;
    NEW.income_recorded_at := NULL;

    DELETE FROM public.financial_vouchers
    WHERE order_id = NEW.id AND voucher_type = 'income';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
