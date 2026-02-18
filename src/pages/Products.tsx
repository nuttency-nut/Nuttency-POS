import { useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Plus, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import CategoryManager from "@/components/products/CategoryManager";
import ProductList from "@/components/products/ProductList";
import ProductSearch from "@/components/products/ProductSearch";
import ProductForm from "@/components/products/ProductForm";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, Product, ProductFormValues } from "@/hooks/useProducts";

export default function Products() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);

  const { data: products = [], isLoading } = useProducts(selectedCategoryId);
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q) ||
        p.product_variants?.some((v) => v.barcode?.toLowerCase().includes(q) || v.name.toLowerCase().includes(q))
    );
  }, [products, search]);

  const handleCreate = () => {
    setEditingProduct(null);
    setShowForm(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setShowForm(true);
  };

  const handleSave = async (values: ProductFormValues) => {
    if (editingProduct) {
      await updateProduct.mutateAsync({ id: editingProduct.id, values });
    } else {
      await createProduct.mutateAsync(values);
    }
    setShowForm(false);
    setEditingProduct(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingProduct) return;
    await deleteProduct.mutateAsync(deletingProduct.id);
    setDeletingProduct(null);
  };

  // Show product form full screen
  if (showForm) {
    return (
      <ProductForm
        product={editingProduct}
        onSave={handleSave}
        onCancel={() => {
          setShowForm(false);
          setEditingProduct(null);
        }}
        isSaving={createProduct.isPending || updateProduct.isPending}
      />
    );
  }

  return (
    <AppLayout
      title="Sản phẩm"
      headerRight={
        <div className="flex items-center gap-2">
          <Sheet open={categorySheetOpen} onOpenChange={setCategorySheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-9">
                <SlidersHorizontal className="w-4 h-4" />
                Danh mục
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] p-0">
              <SheetHeader className="p-4 pb-2">
                <SheetTitle>Quản lý danh mục</SheetTitle>
              </SheetHeader>
              <div className="p-4 pt-0">
                <CategoryManager
                  selectedCategoryId={selectedCategoryId}
                  onSelectCategory={(id) => {
                    setSelectedCategoryId(id);
                    setCategorySheetOpen(false);
                  }}
                />
              </div>
            </SheetContent>
          </Sheet>
          <Button size="sm" className="rounded-xl gap-1.5 h-9" onClick={handleCreate}>
            <Plus className="w-4 h-4" />
            Thêm
          </Button>
        </div>
      }
    >
      <div className="px-4 pt-3">
        <ProductSearch value={search} onChange={setSearch} />
      </div>

      <ProductList products={filteredProducts} isLoading={isLoading} onSelect={handleEdit} onDelete={setDeletingProduct} />

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingProduct} onOpenChange={(open) => !open && setDeletingProduct(null)}>
        <AlertDialogContent className="max-w-sm mx-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa sản phẩm?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa "{deletingProduct?.name}"? Thao tác này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
