import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export interface ClassificationOption {
  id: string;
  group_id: string;
  name: string;
  sort_order: number;
  extra_price: number;
}

export interface ClassificationGroup {
  id: string;
  product_id: string;
  name: string;
  allow_multiple: boolean;
  sort_order: number;
  product_classification_options?: ClassificationOption[];
}

export interface Product {
  id: string;
  name: string;
  category_id: string | null;
  barcode: string | null;
  cost_price: number;
  selling_price: number;
  image_url: string | null;
  unit: string;
  is_active: boolean;
  min_stock: number;
  description: string | null;
  created_at: string;
  updated_at: string;
  product_classification_groups?: ClassificationGroup[];
  categories?: { id: string; name: string } | null;
}

export interface ClassificationOptionForm {
  name: string;
  extra_price: number;
}

export interface ClassificationGroupForm {
  name: string;
  allow_multiple: boolean;
  options: ClassificationOptionForm[];
}

export interface ProductFormValues {
  name: string;
  category_id: string | null;
  barcode: string;
  cost_price: number;
  selling_price: number;
  unit: string;
  is_active: boolean;
  min_stock: number;
  description: string;
  image_url: string | null;
  classification_groups: ClassificationGroupForm[];
}

export function useProducts(categoryId?: string | null) {
  return useQuery({
    queryKey: ["products", categoryId],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select(
          "*, product_classification_groups(*, product_classification_options(*)), categories(id, name)"
        )
        .order("created_at", { ascending: false });

      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Product[];
    },
  });
}

export function useProduct(id: string | null) {
  return useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("products")
        .select(
          "*, product_classification_groups(*, product_classification_options(*)), categories(id, name)"
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Product | null;
    },
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: ProductFormValues) => {
      const { classification_groups, ...productData } = values;
      const { data: product, error } = await supabase
        .from("products")
        .insert({
          name: productData.name,
          category_id: productData.category_id || null,
          barcode: productData.barcode || null,
          cost_price: productData.cost_price,
          selling_price: productData.selling_price,
          unit: productData.unit,
          is_active: productData.is_active,
          min_stock: productData.min_stock,
          description: productData.description || null,
          image_url: productData.image_url || null,
        })
        .select()
        .single();
      if (error) throw error;

      for (let i = 0; i < classification_groups.length; i++) {
        const group = classification_groups[i];
        if (!group.name.trim() || group.options.filter((o) => o.name.trim()).length === 0) continue;

        const { data: groupData, error: groupError } = await supabase
          .from("product_classification_groups")
          .insert({
            product_id: product.id,
            name: group.name.trim(),
            allow_multiple: group.allow_multiple,
            sort_order: i,
          })
          .select()
          .single();
        if (groupError) throw groupError;

        const optionRows = group.options
          .filter((o) => o.name.trim())
          .map((option, index) => ({
            group_id: groupData.id,
            name: option.name.trim(),
            extra_price: option.extra_price || 0,
            sort_order: index,
          }));

        if (optionRows.length > 0) {
          const { error: optionError } = await supabase
            .from("product_classification_options")
            .insert(optionRows);
          if (optionError) throw optionError;
        }
      }

      return product;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["classification-group-names"] });
      toast.success("Đã thêm sản phẩm");
    },
    onError: (error) => {
      toast.error(`Lỗi: ${error.message}`);
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: ProductFormValues }) => {
      const { classification_groups, ...productData } = values;
      const { error } = await supabase
        .from("products")
        .update({
          name: productData.name,
          category_id: productData.category_id || null,
          barcode: productData.barcode || null,
          cost_price: productData.cost_price,
          selling_price: productData.selling_price,
          unit: productData.unit,
          is_active: productData.is_active,
          min_stock: productData.min_stock,
          description: productData.description || null,
          image_url: productData.image_url || null,
        })
        .eq("id", id);
      if (error) throw error;

      await supabase.from("product_classification_groups").delete().eq("product_id", id);

      for (let i = 0; i < classification_groups.length; i++) {
        const group = classification_groups[i];
        if (!group.name.trim() || group.options.filter((o) => o.name.trim()).length === 0) continue;

        const { data: groupData, error: groupError } = await supabase
          .from("product_classification_groups")
          .insert({
            product_id: id,
            name: group.name.trim(),
            allow_multiple: group.allow_multiple,
            sort_order: i,
          })
          .select()
          .single();
        if (groupError) throw groupError;

        const optionRows = group.options
          .filter((o) => o.name.trim())
          .map((option, index) => ({
            group_id: groupData.id,
            name: option.name.trim(),
            extra_price: option.extra_price || 0,
            sort_order: index,
          }));

        if (optionRows.length > 0) {
          const { error: optionError } = await supabase
            .from("product_classification_options")
            .insert(optionRows);
          if (optionError) throw optionError;
        }
      }

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
      queryClient.invalidateQueries({ queryKey: ["classification-group-names"] });
      toast.success("Đã cập nhật sản phẩm");
    },
    onError: (error) => {
      toast.error(`Lỗi: ${error.message}`);
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Đã xóa sản phẩm");
    },
    onError: (error) => {
      toast.error(`Lỗi: ${error.message}`);
    },
  });
}
