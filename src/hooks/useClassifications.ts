import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ClassificationOption {
  id: string;
  group_id: string;
  name: string;
  sort_order: number;
}

export interface ClassificationGroup {
  id: string;
  product_id: string;
  name: string;
  allow_multiple: boolean;
  sort_order: number;
  product_classification_options?: ClassificationOption[];
}

// Get distinct classification group names for autocomplete
export function useClassificationGroupNames() {
  return useQuery({
    queryKey: ["classification-group-names"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classification_group_catalog" as any)
        .select("name");
      if (error) throw error;
      const unique = [...new Set((data || []).map((d) => d.name))];
      return unique.sort();
    },
  });
}
