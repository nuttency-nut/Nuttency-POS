import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  barcode: string | null;
  cost_price: number;
  selling_price: number;
  sku: string | null;
  is_active: boolean;
  sort_order: number;
}

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
  product_variants?: ProductVariant[];
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
  variants: {
    id?: string;
    name: string;
    barcode: string;
    cost_price: number;
    selling_price: number;
    sku: string;
  }[];
}

export function useProducts(categoryId?: string | null) {
  return useQuery({
    queryKey: ["products", categoryId],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("*, product_variants(*), product_classification_groups(*, product_classification_options(*)), categories(id, name)")
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
        .select("*, product_variants(*), product_classification_groups(*, product_classification_options(*)), categories(id, name)")
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
      const { variants, classification_groups, ...productData } = values;
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

      // Insert classification groups and options
      for (let i = 0; i < classification_groups.length; i++) {
        const group = classification_groups[i];
        if (!group.name.trim() || group.options.filter(o => o.name.trim()).length === 0) continue;

        const { data: groupData, error: gError } = await supabase
          .from("product_classification_groups")
          .insert({
            product_id: product.id,
            name: group.name.trim(),
            allow_multiple: group.allow_multiple,
            sort_order: i,
          })
          .select()
          .single();
        if (gError) throw gError;

        const optionRows = group.options
          .filter(o => o.name.trim())
          .map((o, j) => ({
            group_id: groupData.id,
            name: o.name.trim(),
            extra_price: o.extra_price || 0,
            sort_order: j,
          }));

        if (optionRows.length > 0) {
          const { error: oError } = await supabase
            .from("product_classification_options")
            .insert(optionRows);
          if (oError) throw oError;
        }
      }

      // Insert legacy variants if any
      if (variants.length > 0) {
        const variantRows = variants.map((v, i) => ({
          product_id: product.id,
          name: v.name,
          barcode: v.barcode || null,
          cost_price: v.cost_price,
          selling_price: v.selling_price,
          sku: v.sku || null,
          sort_order: i,
        }));
        const { error: vError } = await supabase.from("product_variants").insert(variantRows);
        if (vError) throw vError;
      }

      return product;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["classification-group-names"] });
      toast.success("ÄÃ£ thÃªm sáº£n pháº©m");
    },
    onError: (error) => {
      toast.error("Lá»—i: " + error.message);
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: ProductFormValues }) => {
      const { variants, classification_groups, ...productData } = values;
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

      // Delete old classification groups (cascade deletes options)
      await supabase.from("product_classification_groups").delete().eq("product_id", id);

      // Insert new classification groups
      for (let i = 0; i < classification_groups.length; i++) {
        const group = classification_groups[i];
        if (!group.name.trim() || group.options.filter(o => o.name.trim()).length === 0) continue;

        const { data: groupData, error: gError } = await supabase
          .from("product_classification_groups")
          .insert({
            product_id: id,
            name: group.name.trim(),
            allow_multiple: group.allow_multiple,
            sort_order: i,
          })
          .select()
          .single();
        if (gError) throw gError;

        const optionRows = group.options
          .filter(o => o.name.trim())
          .map((o, j) => ({
            group_id: groupData.id,
            name: o.name.trim(),
            extra_price: o.extra_price || 0,
            sort_order: j,
          }));

        if (optionRows.length > 0) {
          const { error: oError } = await supabase
            .from("product_classification_options")
            .insert(optionRows);
          if (oError) throw oError;
        }
      }

      // Delete old variants and insert new ones
      await supabase.from("product_variants").delete().eq("product_id", id);
      if (variants.length > 0) {
        const variantRows = variants.map((v, i) => ({
          product_id: id,
          name: v.name,
          barcode: v.barcode || null,
          cost_price: v.cost_price,
          selling_price: v.selling_price,
          sku: v.sku || null,
          sort_order: i,
        }));
        const { error: vError } = await supabase.from("product_variants").insert(variantRows);
        if (vError) throw vError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
      queryClient.invalidateQueries({ queryKey: ["classification-group-names"] });
      toast.success("ÄÃ£ cáº­p nháº­t sáº£n pháº©m");
    },
    onError: (error) => {
      toast.error("Lá»—i: " + error.message);
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
      toast.success("ÄÃ£ xÃ³a sáº£n pháº©m");
    },
    onError: (error) => {
      toast.error("Lá»—i: " + error.message);
    },
  });
}

