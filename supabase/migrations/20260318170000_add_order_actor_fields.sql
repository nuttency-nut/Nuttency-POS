-- Add actor fields for orders (creator & cashier)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS created_by_id UUID,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS cashier_id UUID,
  ADD COLUMN IF NOT EXISTS cashier_name TEXT;

CREATE INDEX IF NOT EXISTS orders_created_by_id_idx
ON public.orders(created_by_id);

CREATE INDEX IF NOT EXISTS orders_cashier_id_idx
ON public.orders(cashier_id);

-- Backfill creator from legacy user_id
UPDATE public.orders
SET created_by_id = user_id
WHERE created_by_id IS NULL;

-- Backfill creator name from profiles when available
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    UPDATE public.orders o
    SET created_by_name = p.full_name
    FROM public.profiles p
    WHERE o.created_by_id = p.user_id
      AND (o.created_by_name IS NULL OR o.created_by_name = '');
  END IF;
END $$;

-- Backfill cashier for completed orders
UPDATE public.orders
SET
  cashier_name = 'Hệ thống',
  cashier_id = NULL
WHERE cashier_name IS NULL
  AND payment_method = 'transfer'
  AND status = 'completed';

UPDATE public.orders
SET
  cashier_id = created_by_id,
  cashier_name = COALESCE(created_by_name, cashier_name)
WHERE cashier_id IS NULL
  AND payment_method = 'cash'
  AND status = 'completed'
  AND created_by_id IS NOT NULL;

-- Ensure transfer settlements set cashier = system
CREATE OR REPLACE FUNCTION public.attach_income_voucher_to_order(
  p_voucher_id UUID,
  p_order_number TEXT
)
RETURNS TABLE (
  voucher_id UUID,
  order_id UUID,
  order_number TEXT,
  income_receipt_code TEXT
) AS $$
DECLARE
  v_voucher public.financial_vouchers%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_order_number_normalized TEXT;
  v_income_code TEXT;
  v_effective_payment_method TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_voucher_id IS NULL THEN
    RAISE EXCEPTION 'Voucher is required';
  END IF;

  v_order_number_normalized := UPPER(TRIM(COALESCE(p_order_number, '')));
  IF v_order_number_normalized = '' THEN
    RAISE EXCEPTION 'Order number is required';
  END IF;

  SELECT *
  INTO v_voucher
  FROM public.financial_vouchers
  WHERE id = p_voucher_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voucher not found';
  END IF;

  IF v_voucher.voucher_type <> 'income' THEN
    RAISE EXCEPTION 'Only income vouchers can be linked to orders';
  END IF;

  IF v_voucher.order_id IS NOT NULL THEN
    RAISE EXCEPTION 'Voucher is already linked to order %', COALESCE(v_voucher.order_number, v_voucher.order_id::TEXT);
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE UPPER(order_number) = v_order_number_normalized
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending orders can be marked as paid';
  END IF;

  IF COALESCE(v_order.total_amount, 0) <> COALESCE(v_voucher.amount, 0) THEN
    RAISE EXCEPTION 'Amount mismatch: voucher=% order=%', COALESCE(v_voucher.amount, 0), COALESCE(v_order.total_amount, 0);
  END IF;

  v_income_code := COALESCE(NULLIF(v_voucher.id_income, ''), v_voucher.voucher_code);
  v_effective_payment_method := COALESCE(NULLIF(v_voucher.payment_method, ''), v_order.payment_method, 'transfer');

  UPDATE public.financial_vouchers
  SET
    order_id = v_order.id,
    order_number = v_order.order_number,
    updated_at = NOW()
  WHERE id = v_voucher.id;

  UPDATE public.orders
  SET
    status = 'completed',
    payment_method = v_effective_payment_method,
    transfer_content = CASE
      WHEN v_effective_payment_method = 'transfer' THEN COALESCE(v_voucher.payment_content, v_order.transfer_content)
      ELSE NULL
    END,
    income_receipt_code = v_income_code,
    income_recorded_at = COALESCE(v_voucher.created_at, NOW()),
    cashier_id = CASE WHEN v_effective_payment_method = 'transfer' THEN NULL ELSE cashier_id END,
    cashier_name = CASE WHEN v_effective_payment_method = 'transfer' THEN 'Hệ thống' ELSE cashier_name END,
    updated_at = NOW()
  WHERE id = v_order.id;

  RETURN QUERY
  SELECT
    v_voucher.id,
    v_order.id,
    v_order.order_number,
    v_income_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
