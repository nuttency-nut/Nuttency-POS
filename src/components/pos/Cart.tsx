import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  qty: number;
  image_url: string | null;
  classificationLabels: string[];
  note?: string;
}

interface CartProps {
  items: CartItem[];
  onUpdateQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onCheckout: () => void;
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(price);
}

export default function Cart({ items, onUpdateQty, onRemove, onCheckout }: CartProps) {
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const totalPrice = items.reduce((s, i) => s + i.price * i.qty, 0);

  if (totalQty === 0) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="fixed left-1/2 -translate-x-1/2 z-30 w-[calc(100%-24px)] max-w-sm h-12 rounded-2xl bg-primary text-primary-foreground flex items-center px-3 shadow-lg active:scale-[0.98] transition-transform bottom-[calc(env(safe-area-inset-bottom,0px)+84px)]">
          <span className="w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center text-sm font-bold shrink-0">
            {totalQty}
          </span>
          <span className="ml-3 text-sm font-bold">Giỏ hàng</span>
          <span className="ml-auto text-sm font-bold">{formatPrice(totalPrice)}</span>
        </button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="inset-x-0 mx-auto w-full max-w-lg rounded-t-3xl max-h-[80vh] flex flex-col p-0"
      >
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-base font-bold text-foreground">
            Giỏ hàng ({totalQty})
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4">
          <div className="space-y-3 pb-4">
            {items.map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border/50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground leading-tight">{item.name}</p>
                   {item.classificationLabels.length > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                      {item.classificationLabels.join(" · ")}
                    </p>
                  )}
                  {item.note && (
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-tight italic">
                      📝 {item.note}
                    </p>
                  )}
                  <p className="text-sm font-bold text-primary mt-1">
                    {formatPrice(item.price * item.qty)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {item.qty === 1 ? (
                    <button
                      onClick={() => onRemove(item.id)}
                      className="w-7 h-7 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => onUpdateQty(item.id, item.qty - 1)}
                      className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-foreground"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <span className="text-sm font-bold w-5 text-center text-foreground">{item.qty}</span>
                  <button
                    onClick={() => onUpdateQty(item.id, item.qty + 1)}
                    className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-foreground"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="border-t border-border p-4 safe-bottom">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Tổng cộng</span>
            <span className="text-lg font-bold text-foreground">{formatPrice(totalPrice)}</span>
          </div>
          <Button
            onClick={onCheckout}
            className="w-full h-12 rounded-xl text-base font-bold"
          >
            Thanh toán
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
