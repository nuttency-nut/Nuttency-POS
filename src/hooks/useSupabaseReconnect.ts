import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSupabaseReconnect(onResume?: () => Promise<void> | void) {
  useEffect(() => {
    let inFlight = false;
    const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number) =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`Reconnect timeout ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);

    const handleResume = async () => {
      if (document.visibilityState !== "visible") return;
      if (inFlight) return;
      inFlight = true;

      try {
        const { data } = await withTimeout(supabase.auth.getSession(), 8000);
        const session = data?.session ?? null;

        if (session?.expires_at) {
          const expiresInMs = session.expires_at * 1000 - Date.now();
          if (expiresInMs < 60_000) {
            await withTimeout(supabase.auth.refreshSession(), 8000);
          }
        }

        supabase.realtime.connect();
      } catch (error) {
        console.error("[SUPABASE_RECONNECT_ERROR]", error);
      } finally {
        if (onResume) {
          await onResume();
        }
        inFlight = false;
      }
    };

    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    window.addEventListener("online", handleResume);

    return () => {
      document.removeEventListener("visibilitychange", handleResume);
      window.removeEventListener("focus", handleResume);
      window.removeEventListener("online", handleResume);
    };
  }, [onResume]);
}
