import { supabase as typedSupabase } from "@/integrations/supabase/client";

export const supabase = typedSupabase as any;
