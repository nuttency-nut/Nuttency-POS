-- Auto-cancel cash deposit requests older than 1 hour
CREATE OR REPLACE FUNCTION public.cancel_expired_cash_deposit_requests()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.cash_deposit_requests
  SET status = 'cancelled'
  WHERE status = 'pending'
    AND created_at < NOW() - INTERVAL '1 hour';
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron not available: %', SQLERRM;
    END;

    IF to_regclass('cron.job') IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cancel_expired_cash_deposits') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cancel_expired_cash_deposits';
      END IF;

      PERFORM cron.schedule(
        'cancel_expired_cash_deposits',
        '0 * * * *',
        $cron$SELECT public.cancel_expired_cash_deposit_requests();$cron$
      );
    END IF;
  END IF;
END $$;
