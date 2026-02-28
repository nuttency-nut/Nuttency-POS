ALTER TABLE public.financial_vouchers
ADD COLUMN IF NOT EXISTS id_income TEXT,
ADD COLUMN IF NOT EXISTS income_type TEXT,
ADD COLUMN IF NOT EXISTS transaction_id TEXT;

UPDATE public.financial_vouchers
SET
  id_income = COALESCE(id_income, voucher_code),
  income_type = COALESCE(
    income_type,
    CASE WHEN payment_method = 'transfer' THEN 'transfer' ELSE 'cash' END
  )
WHERE id_income IS NULL OR income_type IS NULL;

ALTER TABLE public.financial_vouchers
ALTER COLUMN id_income SET NOT NULL,
ALTER COLUMN income_type SET NOT NULL;

ALTER TABLE public.financial_vouchers
DROP CONSTRAINT IF EXISTS financial_vouchers_income_type_check;

ALTER TABLE public.financial_vouchers
ADD CONSTRAINT financial_vouchers_income_type_check
CHECK (income_type IN ('cash', 'transfer', 'other'));

CREATE UNIQUE INDEX IF NOT EXISTS financial_vouchers_id_income_uidx
ON public.financial_vouchers (id_income);

CREATE UNIQUE INDEX IF NOT EXISTS financial_vouchers_transaction_id_uidx
ON public.financial_vouchers (transaction_id)
WHERE transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_income_receipt_code()
RETURNS TEXT AS $$
BEGIN
  RETURN 'IC' || TO_CHAR(NOW(), 'DDMMYY') || LPAD(nextval('income_receipt_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.create_income_voucher(
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_content TEXT DEFAULT NULL,
  p_order_id UUID DEFAULT NULL,
  p_order_number TEXT DEFAULT NULL,
  p_income_type TEXT DEFAULT NULL,
  p_created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  p_transaction_id TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_existing_code TEXT;
  v_income_type TEXT;
  v_code TEXT;
BEGIN
  v_income_type := COALESCE(
    NULLIF(p_income_type, ''),
    CASE WHEN p_payment_method = 'transfer' THEN 'transfer' ELSE 'cash' END
  );

  IF p_transaction_id IS NOT NULL AND p_transaction_id <> '' THEN
    SELECT id_income INTO v_existing_code
    FROM public.financial_vouchers
    WHERE transaction_id = p_transaction_id
    LIMIT 1;

    IF v_existing_code IS NOT NULL THEN
      UPDATE public.financial_vouchers
      SET
        amount = COALESCE(p_amount, amount),
        payment_method = COALESCE(NULLIF(p_payment_method, ''), payment_method),
        payment_content = COALESCE(p_payment_content, payment_content),
        order_id = COALESCE(p_order_id, order_id),
        order_number = COALESCE(p_order_number, order_number),
        income_type = COALESCE(v_income_type, income_type),
        updated_at = NOW()
      WHERE id_income = v_existing_code;

      RETURN v_existing_code;
    END IF;
  END IF;

  IF p_order_id IS NOT NULL THEN
    SELECT id_income INTO v_existing_code
    FROM public.financial_vouchers
    WHERE order_id = p_order_id AND voucher_type = 'income'
    LIMIT 1;

    IF v_existing_code IS NOT NULL THEN
      UPDATE public.financial_vouchers
      SET
        amount = COALESCE(p_amount, amount),
        payment_method = COALESCE(NULLIF(p_payment_method, ''), payment_method),
        payment_content = COALESCE(p_payment_content, payment_content),
        order_number = COALESCE(p_order_number, order_number),
        income_type = COALESCE(v_income_type, income_type),
        transaction_id = COALESCE(NULLIF(p_transaction_id, ''), transaction_id),
        updated_at = NOW()
      WHERE id_income = v_existing_code;

      RETURN v_existing_code;
    END IF;
  END IF;

  v_code := public.generate_income_receipt_code();

  INSERT INTO public.financial_vouchers (
    voucher_type,
    voucher_code,
    id_income,
    amount,
    payment_method,
    payment_content,
    order_id,
    order_number,
    income_type,
    transaction_id,
    created_at,
    updated_at
  )
  VALUES (
    'income',
    v_code,
    v_code,
    COALESCE(p_amount, 0),
    COALESCE(NULLIF(p_payment_method, ''), 'cash'),
    p_payment_content,
    p_order_id,
    p_order_number,
    COALESCE(v_income_type, 'other'),
    NULLIF(p_transaction_id, ''),
    COALESCE(p_created_at, NOW()),
    NOW()
  );

  RETURN v_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.prevent_cancel_paid_order()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status = 'cancelled' THEN
    RAISE EXCEPTION 'Paid orders cannot be cancelled';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS orders_apply_income_receipt_on_paid ON public.orders;
DROP FUNCTION IF EXISTS public.apply_income_receipt_on_order_paid();

DROP TRIGGER IF EXISTS orders_prevent_cancel_paid ON public.orders;
CREATE TRIGGER orders_prevent_cancel_paid
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_cancel_paid_order();
