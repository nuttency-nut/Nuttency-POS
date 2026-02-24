import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export interface BulkProductRow {
  name: string;
  barcode?: string;
  cost_price?: number;
  selling_price?: number;
  unit?: string;
  category_name?: string;
  min_stock?: number;
  description?: string;
  is_active?: boolean;
  image_url?: string;
  // Format: "Nhóm:Tùy chọn:Giá" phân tách bởi "|"
  classifications?: string;
  _status?: "new" | "update";
  _existingId?: string;
}

type ClassificationParsed = {
  name: string;
  allow_multiple: boolean;
  options: Array<{ name: string; extra_price: number }>;
};

function parseClassifications(raw?: string): ClassificationParsed[] {
  if (!raw?.trim()) return [];

  const groups = new Map<string, Array<{ name: string; extra_price: number }>>();
  raw.split("|").forEach((entry) => {
    const parts = entry.split(":");
    if (parts.length < 2) return;

    const groupName = parts[0].trim();
    const optionName = parts[1].trim();
    const extraPrice = Number(parts[2] ?? 0);
    if (!groupName || !optionName) return;

    const list = groups.get(groupName) || [];
    list.push({ name: optionName, extra_price: Number.isFinite(extraPrice) ? extraPrice : 0 });
    groups.set(groupName, list);
  });

  return Array.from(groups.entries()).map(([name, options]) => ({
    name,
    allow_multiple: false,
    options,
  }));
}

async function resolveCategoryId(categoryName?: string) {
  if (!categoryName?.trim()) return null;
  const name = categoryName.trim();

  const { data: existing, error: findError } = await supabase
    .from("categories")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if (findError) throw findError;
  if (existing?.id) return existing.id;

  const { data: created, error: createError } = await supabase
    .from("categories")
    .insert({ name })
    .select("id")
    .single();
  if (createError) throw createError;
  return created.id;
}

async function upsertClassificationForProduct(productId: string, groups: ClassificationParsed[]) {
  const { data: oldLinks, error: oldLinksError } = await supabase
    .from("product_classification_group_links" as never)
    .select("id")
    .eq("product_id", productId);
  if (oldLinksError) throw oldLinksError;

  const oldLinkIds = (oldLinks || []).map((link: { id: string }) => link.id);
  if (oldLinkIds.length > 0) {
    const { error: deleteOptionLinksError } = await supabase
      .from("product_classification_option_links" as never)
      .delete()
      .in("group_link_id", oldLinkIds);
    if (deleteOptionLinksError) throw deleteOptionLinksError;
  }

  const { error: deleteGroupLinksError } = await supabase
    .from("product_classification_group_links" as never)
    .delete()
    .eq("product_id", productId);
  if (deleteGroupLinksError) throw deleteGroupLinksError;

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const validOptions = group.options.filter((opt) => opt.name.trim());
    if (!group.name.trim() || validOptions.length === 0) continue;

    const { data: existingGroupCatalog, error: findGroupCatalogError } = await supabase
      .from("classification_group_catalog" as never)
      .select("id")
      .eq("name", group.name.trim())
      .eq("allow_multiple", group.allow_multiple)
      .maybeSingle();
    if (findGroupCatalogError) throw findGroupCatalogError;

    let groupCatalogId = existingGroupCatalog?.id as string | undefined;
    if (!groupCatalogId) {
      const { data: createdGroupCatalog, error: createGroupCatalogError } = await supabase
        .from("classification_group_catalog" as never)
        .insert({
          name: group.name.trim(),
          allow_multiple: group.allow_multiple,
        })
        .select("id")
        .single();
      if (createGroupCatalogError) throw createGroupCatalogError;
      groupCatalogId = createdGroupCatalog.id;
    }

    const { data: groupLink, error: createGroupLinkError } = await supabase
      .from("product_classification_group_links" as never)
      .insert({
        product_id: productId,
        group_catalog_id: groupCatalogId,
        sort_order: i,
      })
      .select("id")
      .single();
    if (createGroupLinkError) throw createGroupLinkError;

    for (let j = 0; j < validOptions.length; j++) {
      const option = validOptions[j];
      const optionName = option.name.trim();
      const optionPrice = option.extra_price || 0;

      const { data: existingOptionCatalog, error: findOptionCatalogError } = await supabase
        .from("classification_option_catalog" as never)
        .select("id")
        .eq("group_catalog_id", groupCatalogId)
        .eq("name", optionName)
        .eq("extra_price", optionPrice)
        .maybeSingle();
      if (findOptionCatalogError) throw findOptionCatalogError;

      let optionCatalogId = existingOptionCatalog?.id as string | undefined;
      if (!optionCatalogId) {
        const { data: createdOptionCatalog, error: createOptionCatalogError } = await supabase
          .from("classification_option_catalog" as never)
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
        .from("product_classification_option_links" as never)
        .insert({
          group_link_id: groupLink.id,
          option_catalog_id: optionCatalogId,
          sort_order: j,
        });
      if (createOptionLinkError) throw createOptionLinkError;
    }
  }
}

export function useBulkImportProducts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rows: BulkProductRow[]) => {
      let created = 0;
      let updated = 0;
      let errors = 0;

      for (const row of rows) {
        try {
          const categoryId = await resolveCategoryId(row.category_name);
          const productData = {
            name: row.name,
            barcode: row.barcode?.trim() ? row.barcode.trim() : null,
            cost_price: row.cost_price || 0,
            selling_price: row.selling_price || 0,
            unit: row.unit?.trim() || "cái",
            is_active: row.is_active !== false,
            min_stock: row.min_stock || 0,
            description: row.description?.trim() || null,
            image_url: row.image_url?.trim() || null,
            category_id: categoryId,
          };

          let existingId = row._existingId;
          if (!existingId && row.barcode?.trim()) {
            const { data: existing, error: findExistingError } = await supabase
              .from("products")
              .select("id")
              .eq("barcode", row.barcode.trim())
              .maybeSingle();
            if (findExistingError) throw findExistingError;
            if (existing?.id) existingId = existing.id;
          }

          if (existingId) {
            const { error: updateError } = await supabase
              .from("products")
              .update(productData)
              .eq("id", existingId);
            if (updateError) throw updateError;

            const parsed = parseClassifications(row.classifications);
            if (parsed.length > 0) {
              await upsertClassificationForProduct(existingId, parsed);
            }
            updated++;
          } else {
            const { data: createdProduct, error: insertError } = await supabase
              .from("products")
              .insert(productData)
              .select("id")
              .single();
            if (insertError) throw insertError;

            const parsed = parseClassifications(row.classifications);
            if (parsed.length > 0) {
              await upsertClassificationForProduct(createdProduct.id, parsed);
            }
            created++;
          }
        } catch (error) {
          errors++;
          console.error("[BULK_IMPORT_ROW_ERROR]", row.name, error);
        }
      }

      return { created, updated, errors };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["classification-group-names"] });

      const parts: string[] = [];
      if (result.created > 0) parts.push(`${result.created} sản phẩm mới`);
      if (result.updated > 0) parts.push(`${result.updated} sản phẩm cập nhật`);
      if (result.errors > 0) parts.push(`${result.errors} dòng lỗi`);
      toast.success(`Import hoàn tất: ${parts.join(", ")}`);
    },
    onError: (error: Error) => {
      toast.error(`Lỗi import: ${error.message}`);
    },
  });
}
