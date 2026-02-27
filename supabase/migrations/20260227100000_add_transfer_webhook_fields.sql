ALTER TABLE public.orders
ADD COLUMN transfer_content TEXT,
ADD COLUMN paid_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN payment_payload JSONB,
ADD COLUMN payment_transaction_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_transaction_id_uidx
ON public.orders (payment_transaction_id)
WHERE payment_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_transfer_pending_lookup_idx
ON public.orders (status, payment_method, transfer_content, total_amount, created_at DESC);
