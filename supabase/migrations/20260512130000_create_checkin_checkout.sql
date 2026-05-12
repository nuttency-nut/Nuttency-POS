-- Work sessions: groups multiple check-in/check-out records for one user on one day
CREATE TABLE IF NOT EXISTS public.work_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  earliest_checkin_at TIMESTAMPTZ,
  latest_checkout_at TIMESTAMPTZ,
  total_records INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_date)
);

CREATE INDEX IF NOT EXISTS work_sessions_user_id_idx ON public.work_sessions(user_id);
CREATE INDEX IF NOT EXISTS work_sessions_session_date_idx ON public.work_sessions(session_date);

ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;

-- Each check-in or check-out action with photo
CREATE TABLE IF NOT EXISTS public.checkin_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_session_id UUID REFERENCES public.work_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('checkin', 'checkout')),
  action_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  photo_url TEXT,
  client_ip TEXT,
  is_verified_ip BOOLEAN DEFAULT FALSE,
  device_info JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkin_records_work_session_id_idx ON public.checkin_records(work_session_id);
CREATE INDEX IF NOT EXISTS checkin_records_user_id_idx ON public.checkin_records(user_id);
CREATE INDEX IF NOT EXISTS checkin_records_action_at_idx ON public.checkin_records(action_at);

ALTER TABLE public.checkin_records ENABLE ROW LEVEL SECURITY;

-- Allowed WiFi IP ranges (whitelist) – managed by admin
CREATE TABLE IF NOT EXISTS public.allowed_wifi_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_pattern TEXT NOT NULL,         -- CIDR or exact IP, e.g. "192.168.1.0/24" or "192.168.1.100"
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS allowed_wifi_ips_pattern_idx ON public.allowed_wifi_ips(ip_pattern);

ALTER TABLE public.allowed_wifi_ips ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "Authenticated users manage own work sessions" ON public.work_sessions;
CREATE POLICY "Authenticated users manage own work sessions"
  ON public.work_sessions FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users manage own check-in records" ON public.checkin_records;
CREATE POLICY "Authenticated users manage own check-in records"
  ON public.checkin_records FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin can manage allowed WiFi IPs" ON public.allowed_wifi_ips;
CREATE POLICY "Admin can manage allowed WiFi IPs"
  ON public.allowed_wifi_ips FOR ALL
  TO authenticated
  USING (public.can_manage(auth.uid()))
  WITH CHECK (public.can_manage(auth.uid()));

DROP POLICY IF EXISTS "All authenticated can view allowed WiFi IPs" ON public.allowed_wifi_ips;
CREATE POLICY "All authenticated can view allowed WiFi IPs"
  ON public.allowed_wifi_ips FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

-- updated_at trigger
DROP TRIGGER IF EXISTS update_work_sessions_updated_at ON public.work_sessions;
CREATE TRIGGER update_work_sessions_updated_at
  BEFORE UPDATE ON public.work_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
