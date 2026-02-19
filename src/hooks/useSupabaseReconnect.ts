import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSupabaseReconnect(onResume?: () => Promise<void> | void) {
  useEffect(() => {
    let inFlight = false;

    const handleResume = async () => {
      if (document.visibilityState !== "visible") return;
      if (inFlight) return;
      inFlight = true;

      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session ?? null;

        if (session) {
          supabase.realtime.connect();
        }
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
