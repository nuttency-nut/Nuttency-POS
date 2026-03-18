-- Track cashier cash balance per user
CREATE TABLE IF NOT EXISTS public.cash_till_balance (
  user_id UUID PRIMARY KEY,
  balance NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_till_balance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own cash till balance" ON public.cash_till_balance;
CREATE POLICY "Users can view own cash till balance"
  ON public.cash_till_balance FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Helper to add to balance
CREATE OR REPLACE FUNCTION public.adjust_cash_till_balance(p_user_id UUID, p_delta NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.cash_till_balance (user_id, balance)
  VALUES (p_user_id, COALESCE(p_delta, 0))
  ON CONFLICT (user_id) DO UPDATE
  SET
    balance = public.cash_till_balance.balance + COALESCE(p_delta, 0),
    updated_at = NOW();
END;
$$;

-- Trigger: when order becomes completed with cash
CREATE OR REPLACE FUNCTION public.apply_cash_till_on_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount NUMERIC;
  v_cashier UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'completed' AND NEW.payment_method = 'cash' AND NEW.cashier_id IS NOT NULL THEN
      v_amount := COALESCE(NEW.total_amount, 0);
      v_cashier := NEW.cashier_id;
      PERFORM public.adjust_cash_till_balance(v_cashier, v_amount);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Only react when status changes to completed or payment switches to cash
    IF NEW.status = 'completed' AND NEW.payment_method = 'cash' AND NEW.cashier_id IS NOT NULL THEN
      IF (OLD.status IS DISTINCT FROM NEW.status)
        OR (OLD.payment_method IS DISTINCT FROM NEW.payment_method)
        OR (OLD.cashier_id IS DISTINCT FROM NEW.cashier_id)
      THEN
        v_amount := COALESCE(NEW.total_amount, 0);
        v_cashier := NEW.cashier_id;
        PERFORM public.adjust_cash_till_balance(v_cashier, v_amount);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_apply_cash_till_balance ON public.orders;
CREATE TRIGGER orders_apply_cash_till_balance
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_cash_till_on_orders();

-- Trigger: when cash deposit request becomes completed -> subtract
CREATE OR REPLACE FUNCTION public.apply_cash_till_on_deposits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount NUMERIC;
  v_user UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_amount := COALESCE(NEW.amount, 0);
      v_user := NEW.created_by_id;
      PERFORM public.adjust_cash_till_balance(v_user, 0 - v_amount);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cash_deposits_apply_cash_till_balance ON public.cash_deposit_requests;
CREATE TRIGGER cash_deposits_apply_cash_till_balance
  AFTER UPDATE ON public.cash_deposit_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_cash_till_on_deposits();

-- One-time backfill for existing data
DO $$
BEGIN
  -- Reset table first
  DELETE FROM public.cash_till_balance;

  INSERT INTO public.cash_till_balance (user_id, balance)
  SELECT
    cashier_id,
    COALESCE(SUM(total_amount), 0)
  FROM public.orders
  WHERE status = 'completed'
    AND payment_method = 'cash'
    AND cashier_id IS NOT NULL
  GROUP BY cashier_id;

  UPDATE public.cash_till_balance b
  SET balance = b.balance - COALESCE(d.total_amount, 0),
      updated_at = NOW()
  FROM (
    SELECT created_by_id, SUM(amount) AS total_amount
    FROM public.cash_deposit_requests
    WHERE status = 'completed'
    GROUP BY created_by_id
  ) d
  WHERE b.user_id = d.created_by_id;
END;
$$;
