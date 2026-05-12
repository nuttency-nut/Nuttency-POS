-- Add WiFi IP pattern column to store_definitions (each store has its own WiFi IP)
ALTER TABLE public.store_definitions
  ADD COLUMN IF NOT EXISTS wifi_ip_pattern TEXT;

COMMENT ON COLUMN public.store_definitions.wifi_ip_pattern IS
  'WiFi IP pattern for check-in/out verification. Supports CIDR (e.g. 192.168.1.0/24) or exact IP (e.g. 192.168.1.100). Null = no WiFi restriction.';

-- Drop the standalone allowed_wifi_ips table (replaced by store-level WiFi IP)
DROP TABLE IF EXISTS public.allowed_wifi_ips;
