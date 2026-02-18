import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Category[];
    },
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string; parent_id?: string | null }) => {
      const { data, error } = await supabase
        .from("categories")
        .insert({ name: values.name, parent_id: values.parent_id || null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("ÄÃ£ thÃªm danh má»¥c");
    },
    onError: (error) => {
      toast.error("Lá»—i: " + error.message);
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string; name: string; parent_id?: string | null }) => {
      const { data, error } = await supabase
        .from("categories")
        .update({ name: values.name, parent_id: values.parent_id || null })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("ÄÃ£ cáº­p nháº­t danh má»¥c");
    },
    onError: (error) => {
      toast.error("Lá»—i: " + error.message);
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("ÄÃ£ xÃ³a danh má»¥c");
    },
    onError: (error) => {
      toast.error("Lá»—i: " + error.message);
    },
  });
}

