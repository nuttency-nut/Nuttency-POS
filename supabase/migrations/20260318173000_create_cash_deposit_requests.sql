-- Cash deposit requests for staff to deposit cash to bank
CREATE TABLE IF NOT EXISTS public.cash_deposit_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by_id UUID NOT NULL,
  created_by_name TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  matched_at TIMESTAMP WITH TIME ZONE,
  matched_transaction_id TEXT,
  payment_payload JSONB
);

CREATE INDEX IF NOT EXISTS cash_deposit_requests_creator_idx
ON public.cash_deposit_requests(created_by_id);

CREATE INDEX IF NOT EXISTS cash_deposit_requests_pending_idx
ON public.cash_deposit_requests(status, amount, created_at DESC);

ALTER TABLE public.cash_deposit_requests ENABLE ROW LEVEL SECURITY;

-- RLS: user can see/create own deposit requests
DROP POLICY IF EXISTS "Users can view own cash deposits" ON public.cash_deposit_requests;
CREATE POLICY "Users can view own cash deposits"
  ON public.cash_deposit_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by_id);

DROP POLICY IF EXISTS "Users can insert own cash deposits" ON public.cash_deposit_requests;
CREATE POLICY "Users can insert own cash deposits"
  ON public.cash_deposit_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by_id);

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_cash_deposit_requests_updated_at ON public.cash_deposit_requests;
CREATE TRIGGER update_cash_deposit_requests_updated_at
  BEFORE UPDATE ON public.cash_deposit_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
