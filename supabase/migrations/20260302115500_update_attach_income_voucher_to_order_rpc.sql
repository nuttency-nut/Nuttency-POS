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

