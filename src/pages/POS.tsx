import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AppLayout from "@/components/layout/AppLayout";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useProducts, Product } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import { useAuth } from "@/hooks/useAuth";

import ProductGrid from "@/components/pos/ProductGrid";
import Cart, { CartItem } from "@/components/pos/Cart";
import ClassificationDialog, { SelectedClassifications } from "@/components/pos/ClassificationDialog";
import CheckoutSheet from "@/components/pos/CheckoutSheet";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

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
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const lastTapRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const { data: products = [], isLoading } = useProducts();
  const { data: categories = [] } = useCategories();
  const { user } = useAuth();

  const filtered = products.filter((p) => {
    if (!p.is_active) return false;
    if (selectedCategory && p.category_id !== selectedCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const triggerFlyAnimation = useCallback((product: Product) => {
    const id = `fly-${Date.now()}`;
    const anim: FlyAnimation = {
      id,
      x: lastTapRef.current.x,
      y: lastTapRef.current.y,
      image_url: product.image_url,
      name: product.name,
    };
    setFlyAnimations((prev) => [...prev, anim]);
    setTimeout(() => {
      setFlyAnimations((prev) => prev.filter((a) => a.id !== id));
    }, 600);
  }, []);

  const handleSelectProduct = useCallback((product: Product, event?: React.MouseEvent | React.TouchEvent) => {
    if (event) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      lastTapRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    // Always open dialog so users can add notes
    setDialogProduct(product);
  }, []);

  const addToCart = useCallback(
    (product: Product, qty: number, selections: SelectedClassifications, note?: string) => {
      const groups = product.product_classification_groups || [];

      let extraPrice = 0;
      const labels: string[] = [];
      let selectionKey = "";
      groups.forEach((g) => {
        const selectedIds = selections[g.id] || [];
        if (selectedIds.length > 0) {
          const selectedOptions = (g.product_classification_options || [])
            .filter((o) => selectedIds.includes(o.id));
          const optionNames = selectedOptions.map((o) => o.name);
          extraPrice += selectedOptions.reduce((sum, o) => sum + (o.extra_price || 0), 0);
          labels.push(`${g.name}: ${optionNames.join(", ")}`);
          selectionKey += `|${g.id}:${selectedIds.sort().join(",")}`;
        }
      });

      const lineId = `${product.id}${selectionKey}`;
      const unitPrice = product.selling_price + extraPrice;

      setCartItems((prev) => {
        const existing = prev.find((i) => i.id === lineId);
        if (existing) {
          return prev.map((i) =>
            i.id === lineId ? { ...i, qty: i.qty + qty } : i
          );
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
      toast.success(`ÄÃ£ thÃªm ${product.name}`);
    },
    []
  );

  const handleUpdateQty = useCallback((id: string, qty: number) => {
    if (qty <= 0) {
      setCartItems((prev) => prev.filter((i) => i.id !== id));
    } else {
      setCartItems((prev) => prev.map((i) => (i.id === id ? { ...i, qty } : i)));
    }
  }, []);

  const handleRemove = useCallback((id: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const handleCheckout = useCallback(() => {
    setShowCheckout(true);
  }, []);

  const handleCheckoutSuccess = useCallback((orderNumber: string) => {
    setCartItems([]);
    setShowCheckout(false);
    toast.success(`ÄÆ¡n hÃ ng ${orderNumber} Ä‘Ã£ táº¡o thÃ nh cÃ´ng!`);
  }, []);

  const activeCategories = categories.filter((c) => c.is_active);

  return (
    <AppLayout title="BÃ¡n hÃ ng">
      <div className="flex flex-col h-full">
        {/* Search */}
        <div className="p-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="TÃ¬m sáº£n pháº©m, mÃ£ váº¡ch..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-11 rounded-xl bg-card"
            />
          </div>
        </div>

        {/* Category tabs */}
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
                Táº¥t cáº£
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
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}

        {/* Product grid */}
        <ProductGrid
          products={filtered}
          isLoading={isLoading}
          onSelect={handleSelectProduct}
        />
      </div>

      {/* Fly-to-cart animations */}
      <AnimatePresence>
        {flyAnimations.map((anim) => {
          // Target: cart bar at bottom center
          const targetX = window.innerWidth / 2;
          const targetY = window.innerHeight - 100;
          return (
            <motion.div
              key={anim.id}
              className="fixed z-[100] pointer-events-none"
              initial={{
                left: anim.x - 24,
                top: anim.y - 24,
                scale: 1,
                opacity: 1,
              }}
              animate={{
                left: targetX - 24,
                top: targetY - 24,
                scale: 0.3,
                opacity: 0,
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.5,
                ease: [0.32, 0, 0.24, 1],
              }}
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

      {/* Cart horizontal bar + Sheet */}
      <Cart
        items={cartItems}
        onUpdateQty={handleUpdateQty}
        onRemove={handleRemove}
        onCheckout={handleCheckout}
      />

      {/* Checkout sheet */}
      {user && (
        <CheckoutSheet
          open={showCheckout}
          onClose={() => setShowCheckout(false)}
          items={cartItems}
          onSuccess={handleCheckoutSuccess}
          userId={user.id}
        />
      )}

      {/* Classification selection dialog */}
      <ClassificationDialog
        product={dialogProduct}
        open={!!dialogProduct}
        onClose={() => setDialogProduct(null)}
        onConfirm={addToCart}
      />
    </AppLayout>
  );
}

