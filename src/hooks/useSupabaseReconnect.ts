import { useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export function useSupabaseReconnect() {
  const queryClient = useQueryClient();

  const handleResume = useCallback(async () => {
    if (document.visibilityState !== "visible") return;

    try {
      const { data, error } = await supabase.auth.refreshSession();

      if (error) {
        return;
      }

      if (data.session) {
        supabase.realtime.connect();
        queryClient.invalidateQueries();
      }
    } catch {}
  }, [queryClient]);

  useEffect(() => {
    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("online", handleResume);

    return () => {
      document.removeEventListener("visibilitychange", handleResume);
      window.removeEventListener("online", handleResume);
    };
  }, [handleResume]);
}
