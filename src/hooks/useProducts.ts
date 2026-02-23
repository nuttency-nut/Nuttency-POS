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

type GroupLinkRow = {
  id: string;
  product_id: string;
  sort_order: number;
  classification_group_catalog: {
    id: string;
    name: string;
    allow_multiple: boolean;
  } | null;
  product_classification_option_links: Array<{
    id: string;
    sort_order: number;
    classification_option_catalog: {
      id: string;
      name: string;
      extra_price: number;
    } | null;
  }>;
};

async function fetchGroupLinksByProductIds(productIds: string[]) {
  if (productIds.length === 0) {
    return [] as GroupLinkRow[];
  }

  const { data, error } = await supabase
    .from("product_classification_group_links" as any)
    .select(
      "id,product_id,sort_order,classification_group_catalog(id,name,allow_multiple),product_classification_option_links(id,sort_order,classification_option_catalog(id,name,extra_price))"
    )
    .in("product_id", productIds);

  if (error) throw error;
  return (data || []) as GroupLinkRow[];
}

function mapLinksToGroups(productId: string, links: GroupLinkRow[]): ClassificationGroup[] {
  return links
    .filter((link) => link.product_id === productId && link.classification_group_catalog)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((link) => ({
      id: link.id,
      product_id: link.product_id,
      name: link.classification_group_catalog!.name,
      allow_multiple: link.classification_group_catalog!.allow_multiple,
      sort_order: link.sort_order,
      product_classification_options: (link.product_classification_option_links || [])
        .filter((optLink) => !!optLink.classification_option_catalog)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((optLink) => ({
          id: optLink.id,
          group_id: link.id,
          name: optLink.classification_option_catalog!.name,
          extra_price: optLink.classification_option_catalog!.extra_price || 0,
          sort_order: optLink.sort_order,
        })),
    }));
}

async function upsertClassificationForProduct(productId: string, groups: ClassificationGroupForm[]) {
  // Delete existing links first; catalog stays shared.
  const { data: oldLinks, error: oldLinksError } = await supabase
    .from("product_classification_group_links" as any)
    .select("id")
    .eq("product_id", productId);
  if (oldLinksError) throw oldLinksError;

  const oldLinkIds = (oldLinks || []).map((l: { id: string }) => l.id);
  if (oldLinkIds.length > 0) {
    const { error: deleteOptionLinksError } = await supabase
      .from("product_classification_option_links" as any)
      .delete()
      .in("group_link_id", oldLinkIds);
    if (deleteOptionLinksError) throw deleteOptionLinksError;
  }

  const { error: deleteGroupLinksError } = await supabase
    .from("product_classification_group_links" as any)
    .delete()
    .eq("product_id", productId);
  if (deleteGroupLinksError) throw deleteGroupLinksError;

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const validOptions = group.options.filter((o) => o.name.trim());
    if (!group.name.trim() || validOptions.length === 0) continue;

    // 1) upsert/find group catalog
    const { data: existingGroupCatalog, error: findGroupCatalogError } = await supabase
      .from("classification_group_catalog" as any)
      .select("id")
      .eq("name", group.name.trim())
      .eq("allow_multiple", group.allow_multiple)
      .maybeSingle();
    if (findGroupCatalogError) throw findGroupCatalogError;

    let groupCatalogId = existingGroupCatalog?.id as string | undefined;
    if (!groupCatalogId) {
      const { data: createdGroupCatalog, error: createGroupCatalogError } = await supabase
        .from("classification_group_catalog" as any)
        .insert({
          name: group.name.trim(),
          allow_multiple: group.allow_multiple,
        })
        .select("id")
        .single();
      if (createGroupCatalogError) throw createGroupCatalogError;
      groupCatalogId = createdGroupCatalog.id;
    }

    // 2) create product-group link
    const { data: groupLink, error: createGroupLinkError } = await supabase
      .from("product_classification_group_links" as any)
      .insert({
        product_id: productId,
        group_catalog_id: groupCatalogId,
        sort_order: i,
      })
      .select("id")
      .single();
    if (createGroupLinkError) throw createGroupLinkError;

    // 3) upsert/find option catalog + create link
    for (let j = 0; j < validOptions.length; j++) {
      const option = validOptions[j];
      const optionName = option.name.trim();
      const optionPrice = option.extra_price || 0;

      const { data: existingOptionCatalog, error: findOptionCatalogError } = await supabase
        .from("classification_option_catalog" as any)
        .select("id")
        .eq("group_catalog_id", groupCatalogId)
        .eq("name", optionName)
        .eq("extra_price", optionPrice)
        .maybeSingle();
      if (findOptionCatalogError) throw findOptionCatalogError;

      let optionCatalogId = existingOptionCatalog?.id as string | undefined;
      if (!optionCatalogId) {
        const { data: createdOptionCatalog, error: createOptionCatalogError } = await supabase
          .from("classification_option_catalog" as any)
          .insert({
            group_catalog_id: groupCatalogId,
            name: optionName,
            extra_price: optionPrice,
          })
          .select("id")
          .single();
        if (createOptionCatalogError) throw createOptionCatalogError;
        optionCatalogId = createdOptionCatalog.id;
      }

      const { error: createOptionLinkError } = await supabase
        .from("product_classification_option_links" as any)
        .insert({
          group_link_id: groupLink.id,
          option_catalog_id: optionCatalogId,
          sort_order: j,
        });
      if (createOptionLinkError) throw createOptionLinkError;
    }
  }
}

export function useProducts(categoryId?: string | null) {
  return useQuery({
    queryKey: ["products", categoryId],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("*, categories(id, name)")
        .order("created_at", { ascending: false });

      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }

      const { data: products, error } = await query;
      if (error) throw error;

      const productRows = (products || []) as Product[];
      const links = await fetchGroupLinksByProductIds(productRows.map((p) => p.id));

      return productRows.map((product) => ({
        ...product,
        product_classification_groups: mapLinksToGroups(product.id, links),
      }));
    },
  });
}

export function useProduct(id: string | null) {
  return useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      if (!id) return null;

      const { data: product, error } = await supabase
        .from("products")
        .select("*, categories(id, name)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!product) return null;

      const links = await fetchGroupLinksByProductIds([id]);
      return {
        ...(product as Product),
        product_classification_groups: mapLinksToGroups(id, links),
      } as Product;
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

      await upsertClassificationForProduct(product.id, classification_groups);
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

      await upsertClassificationForProduct(id, classification_groups);
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
