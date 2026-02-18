import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AppLayout from "@/components/layout/AppLayout";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProducts, Product } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import ProductGrid from "@/components/pos/ProductGrid";
import Cart, { CartItem } from "@/components/pos/Cart";
import ClassificationDialog, { SelectedClassifications } from "@/components/pos/ClassificationDialog";
import CheckoutSheet from "@/components/pos/CheckoutSheet";
import ProductSearch from "@/components/products/ProductSearch";

interface FlyAnimation {
  id: string;
  x: number;
  y: number;
  image_url: string | null;
  name: string;
}

export default function POS() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [dialogProduct, setDialogProduct] = useState<Product | null>(null);
  const [flyAnimations, setFlyAnimations] = useState<FlyAnimation[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const lastTapRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const { data: products = [], isLoading } = useProducts();
  const { data: categories = [] } = useCategories();
  const { user } = useAuth();

  const filtered = products.filter((p) => {
    if (!p.is_active) return false;
    if (selectedCategory && p.category_id !== selectedCategory) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase().includes(q));
  });

  const triggerFlyAnimation = useCallback((product: Product) => {
    const id = `fly-${Date.now()}`;
    setFlyAnimations((prev) => [
      ...prev,
      {
        id,
        x: lastTapRef.current.x,
        y: lastTapRef.current.y,
        image_url: product.image_url,
        name: product.name,
      },
    ]);

    setTimeout(() => {
      setFlyAnimations((prev) => prev.filter((item) => item.id !== id));
    }, 600);
  }, []);

  const handleSelectProduct = useCallback((product: Product, event?: React.MouseEvent | React.TouchEvent) => {
    if (event) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      lastTapRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    setDialogProduct(product);
  }, []);

  const addToCart = useCallback(
    (product: Product, qty: number, selections: SelectedClassifications, note?: string) => {
      const groups = product.product_classification_groups || [];
      let extraPrice = 0;
      const labels: string[] = [];
      let selectionKey = "";

      groups.forEach((group) => {
        const selectedIds = selections[group.id] || [];
        if (selectedIds.length === 0) return;
        const selectedOptions = (group.product_classification_options || []).filter((opt) => selectedIds.includes(opt.id));
        const optionNames = selectedOptions.map((opt) => opt.name);
        extraPrice += selectedOptions.reduce((sum, opt) => sum + (opt.extra_price || 0), 0);
        labels.push(`${group.name}: ${optionNames.join(", ")}`);
        selectionKey += `|${group.id}:${selectedIds.sort().join(",")}`;
      });

      const lineId = `${product.id}${selectionKey}`;
      const unitPrice = product.selling_price + extraPrice;

      setCartItems((prev) => {
        const existing = prev.find((item) => item.id === lineId);
        if (existing) {
          return prev.map((item) => (item.id === lineId ? { ...item, qty: item.qty + qty } : item));
        }

        return [
          ...prev,
          {
            id: lineId,
            productId: product.id,
            name: product.name,
            price: unitPrice,
            qty,
            image_url: product.image_url,
            classificationLabels: labels,
            note: note || undefined,
          },
        ];
      });

      setDialogProduct(null);
      triggerFlyAnimation(product);
      toast.success(`Đã thêm ${product.name}`);
    },
    [triggerFlyAnimation]
  );

  const handleUpdateQty = useCallback((id: string, qty: number) => {
    if (qty <= 0) {
      setCartItems((prev) => prev.filter((item) => item.id !== id));
      return;
    }
    setCartItems((prev) => prev.map((item) => (item.id === id ? { ...item, qty } : item)));
  }, []);

  const handleRemove = useCallback((id: string) => {
    setCartItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleCheckout = useCallback(() => {
    setShowCheckout(true);
  }, []);

  const handleCheckoutSuccess = useCallback((orderNumber: string) => {
    setCartItems([]);
    setShowCheckout(false);
    toast.success(`Đơn hàng ${orderNumber} đã tạo thành công!`);
  }, []);

  const activeCategories = categories.filter((c) => c.is_active);

  return (
    <AppLayout title="Bán hàng">
      <div className="flex flex-col h-full overflow-hidden">
        <div className="shrink-0 bg-background border-b border-border/50">
          <div className="p-4 pb-2">
            <ProductSearch value={search} onChange={setSearch} />
          </div>

          {activeCategories.length > 0 && (
            <ScrollArea className="w-full">
              <div className="flex gap-2 px-4 pb-2">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                    selectedCategory === null
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground border border-border"
                  )}
                >
                  Tất cả
                </button>
                {activeCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={cn(
                      "px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                      selectedCategory === cat.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground border border-border"
                    )}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <div className="min-h-0 flex-1">
          <ProductGrid products={filtered} isLoading={isLoading} onSelect={handleSelectProduct} />
        </div>
      </div>

      <AnimatePresence>
        {flyAnimations.map((anim) => {
          const targetX = window.innerWidth / 2;
          const targetY = window.innerHeight - 100;
          return (
            <motion.div
              key={anim.id}
              className="fixed z-[100] pointer-events-none"
              initial={{ left: anim.x - 24, top: anim.y - 24, scale: 1, opacity: 1 }}
              animate={{ left: targetX - 24, top: targetY - 24, scale: 0.3, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.32, 0, 0.24, 1] }}
            >
              <div className="w-12 h-12 rounded-xl bg-primary/90 shadow-lg flex items-center justify-center overflow-hidden border-2 border-primary-foreground/30">
                {anim.image_url ? (
                  <img src={anim.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-primary-foreground text-xs font-bold">{anim.name.charAt(0)}</span>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      <Cart items={cartItems} onUpdateQty={handleUpdateQty} onRemove={handleRemove} onCheckout={handleCheckout} />

      {user && (
        <CheckoutSheet
          open={showCheckout}
          onClose={() => setShowCheckout(false)}
          items={cartItems}
          onSuccess={handleCheckoutSuccess}
          userId={user.id}
        />
      )}

      <ClassificationDialog
        product={dialogProduct}
        open={!!dialogProduct}
        onClose={() => setDialogProduct(null)}
        onConfirm={addToCart}
      />
    </AppLayout>
  );
}
