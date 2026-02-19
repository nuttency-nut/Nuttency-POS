import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSupabaseReconnect(onResume?: () => Promise<void> | void) {
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;

      try {
        await supabase.auth.getSession();
        supabase.realtime.connect();
        if (onResume) {
          await onResume();
        }
      } catch (error) {
        console.error("[SUPABASE_RECONNECT_ERROR]", error);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [onResume]);
}

