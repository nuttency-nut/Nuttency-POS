import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AppLayout from "@/components/layout/AppLayout";
import { useProducts, Product } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import ProductGrid from "@/components/pos/ProductGrid";
import Cart, { CartItem } from "@/components/pos/Cart";
import ClassificationDialog, { SelectedClassifications } from "@/components/pos/ClassificationDialog";
import ProductSearch from "@/components/products/ProductSearch";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

interface FlyAnimation {
  id: string;
  x: number;
  y: number;
  image_url: string | null;
  name: string;
}

const cashHeldCache = new Map<string, number>();
const readCachedCashHeld = (userId?: string | null) => {
  if (!userId) return null;
  if (cashHeldCache.has(userId)) {
    return cashHeldCache.get(userId) ?? null;
  }
  if (typeof window === "undefined") return null;
  const stored = window.sessionStorage.getItem(`cashHeld:${userId}`);
  if (stored === null) return null;
  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) return null;
  cashHeldCache.set(userId, parsed);
  return parsed;
};

const writeCachedCashHeld = (userId: string, value: number) => {
  cashHeldCache.set(userId, value);
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(`cashHeld:${userId}`, String(value));
  }
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function POS() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [dialogProduct, setDialogProduct] = useState<Product | null>(null);
  const [flyAnimations, setFlyAnimations] = useState<FlyAnimation[]>([]);
  const [cashHeld, setCashHeld] = useState<number | null>(null);
  const [storeContext, setStoreContext] = useState<{
    id: string;
    warehouseCode: string;
    displayName: string;
  } | null>(null);
  const [displayActiveByMe, setDisplayActiveByMe] = useState(false);
  const lastTapRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const displayPublishTimerRef = useRef<number | null>(null);

  const { data: products = [], isLoading } = useProducts();
  const { data: categories = [] } = useCategories();
  const { user } = useAuth();
  const operatorName =
    (user?.user_metadata as { full_name?: string } | undefined)?.full_name ||
    user?.email ||
    "Không rõ";
  const storeId = storeContext?.id ?? null;
  const storeWarehouseCode = storeContext?.warehouseCode ?? "";
  const storeDisplayName = storeContext?.displayName ?? "";

  const filtered = products.filter((product) => {
    if (!product.is_active) return false;
    if (selectedCategory && product.category_id !== selectedCategory) return false;
    if (!search) return true;

    const q = search.toLowerCase();
    return product.name.toLowerCase().includes(q) || (product.barcode && product.barcode.toLowerCase().includes(q));
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
      toast.success(`Đã thêm ${product.name}`, { compactTitle: true });
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

  const cachedCashHeld = useMemo(() => readCachedCashHeld(user?.id), [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setStoreContext(null);
      setDisplayActiveByMe(false);
      return;
    }
    let mounted = true;
    const loadStore = async () => {
      const { data: assignment } = await supabase
        .from("user_store_assignments")
        .select("store_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!mounted) return;

      if (!assignment?.store_id) {
        setStoreContext(null);
        setDisplayActiveByMe(false);
        return;
      }

      const { data: storeRow } = await supabase
        .from("store_definitions")
        .select("id,warehouse_code,display_name")
        .eq("id", assignment.store_id)
        .maybeSingle();

      if (!mounted) return;

      setStoreContext(
        storeRow
          ? {
              id: String(storeRow.id),
              warehouseCode: String(storeRow.warehouse_code ?? ""),
              displayName: String(storeRow.display_name ?? ""),
            }
          : {
              id: String(assignment.store_id),
              warehouseCode: "",
              displayName: "",
            }
      );
    };

    void loadStore();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !storeId) {
      setDisplayActiveByMe(false);
      return;
    }

    let mounted = true;

    const refreshSession = async () => {
      const { data } = await supabase
        .from("customer_display_sessions")
        .select("active_by_id")
        .eq("store_id", storeId)
        .maybeSingle();

      if (!mounted) return;
      setDisplayActiveByMe(data?.active_by_id === user.id);
    };

    void refreshSession();

    const channel = supabase
      .channel(`customer-display-session-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customer_display_sessions", filter: `store_id=eq.${storeId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setDisplayActiveByMe(false);
            return;
          }
          const row = payload.new as { active_by_id?: string } | null;
          setDisplayActiveByMe(row?.active_by_id === user.id);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [storeId, user?.id]);

  const publishCustomerDisplay = useCallback(
    async (items: CartItem[]) => {
      if (!displayActiveByMe || !storeId || !user?.id) return;

      const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
      const mappedItems = items.map((item) => {
        const detailParts = [];
        if (item.classificationLabels?.length) {
          detailParts.push(item.classificationLabels.join(" · "));
        }
        if (item.note) {
          detailParts.push(`Ghi chú: ${item.note}`);
        }
        return {
          id: item.id,
          name: item.name,
          detail: detailParts.join(" • "),
          qty: item.qty,
          price: item.price,
          lineTotal: item.price * item.qty,
          image: item.image_url,
        };
      });

      const payload = {
        store: {
          warehouseCode: storeWarehouseCode,
          displayName: storeDisplayName,
        },
        cashierName: operatorName,
        status: items.length > 0 ? "processing" : "idle",
        items: mappedItems,
        customer: {
          name: "Khách lẻ",
          phone: null,
          loyaltyPoints: 0,
          loyaltyPointsUsed: 0,
        },
        discount: {
          code: null,
          amount: 0,
        },
        loyalty: {
          pointsUsed: 0,
          discountAmount: 0,
        },
        payment: {
          method: null,
          cashReceived: null,
          change: null,
          transferContent: null,
        },
        totals: {
          subtotal,
          discount: 0,
          total: subtotal,
        },
        updatedAt: new Date().toISOString(),
      };

      const { error } = await supabase.from("customer_display_states").upsert(
        {
          store_id: storeId,
          payload,
          updated_by_id: user.id,
          updated_by_name: operatorName,
        },
        { onConflict: "store_id" }
      );
      if (error) {
        console.error("Không thể cập nhật màn hình khách hàng:", error.message);
      }
    },
    [displayActiveByMe, operatorName, storeDisplayName, storeId, storeWarehouseCode, user?.id]
  );

  useEffect(() => {
    if (!displayActiveByMe || !storeId) return;
    if (displayPublishTimerRef.current) {
      window.clearTimeout(displayPublishTimerRef.current);
    }
    displayPublishTimerRef.current = window.setTimeout(() => {
      void publishCustomerDisplay(cartItems);
    }, 200);

    return () => {
      if (displayPublishTimerRef.current) {
        window.clearTimeout(displayPublishTimerRef.current);
      }
    };
  }, [cartItems, displayActiveByMe, publishCustomerDisplay, storeId]);

  const loadCashHeld = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from("cash_till_balance")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      const nextBalance = Number(data?.balance || 0);
      setCashHeld(nextBalance);
      writeCachedCashHeld(user.id, nextBalance);
    } catch {
      // Keep the last known value to avoid UI flicker.
    }
  }, [user?.id]);

  useEffect(() => {
    void loadCashHeld();
  }, [loadCashHeld]);

  const handleCheckoutSuccess = useCallback((orderNumber: string) => {
    setCartItems([]);
    toast.success(`Đơn hàng ${orderNumber} đã tạo thành công!`);
    void loadCashHeld();
  }, [loadCashHeld]);

  const handleSavePending = useCallback(() => {
    setCartItems([]);
  }, []);

  const activeCategories = categories.filter((category) => category.is_active);

  const displayedCashHeld = cashHeld ?? cachedCashHeld;
  const cashHeldLabel = displayedCashHeld === null ? "--" : formatCurrency(displayedCashHeld);

  return (
    <AppLayout
      title="Bán hàng"
      headerRight={
        <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
          Tiền mặt đang giữ: {cashHeldLabel}
        </div>
      }
    >
      <div className="flex flex-col h-full overflow-hidden">
        <div className="shrink-0 bg-background border-b border-border/50">
          <div className="p-4 pb-2">
            <ProductSearch value={search} onChange={setSearch} />
          </div>

          {activeCategories.length > 0 && (
            <div className="w-full overflow-x-auto no-scrollbar">
              <div className="flex gap-2 px-4 pb-2 min-w-max">
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
                {activeCategories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={cn(
                      "px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                      selectedCategory === category.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground border border-border"
                    )}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
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

      {user && (
        <Cart
          items={cartItems}
          onUpdateQty={handleUpdateQty}
          onRemove={handleRemove}
          onCheckoutSuccess={handleCheckoutSuccess}
          onSavePending={handleSavePending}
          userId={user.id}
          userName={operatorName}
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
