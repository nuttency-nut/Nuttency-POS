import { useRef, useState } from "react";
import { Product, ClassificationGroup } from "@/hooks/useProducts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Minus, Plus, Package, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

function formatPrice(price: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(price);
}

export interface SelectedClassifications {
  [groupId: string]: string[]; // option ids
}

interface ClassificationDialogProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (product: Product, qty: number, selections: SelectedClassifications, note: string) => void;
}

export default function ClassificationDialog({
  product,
  open,
  onClose,
  onConfirm,
}: ClassificationDialogProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [qty, setQty] = useState(1);
  const [selections, setSelections] = useState<SelectedClassifications>({});
  const [note, setNote] = useState("");

  const groups = product?.product_classification_groups || [];

  const handleOpen = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
      setQty(1);
      setSelections({});
      setNote("");
    }
  };

  const toggleOption = (group: ClassificationGroup, optionId: string) => {
    setSelections((prev) => {
      const current = prev[group.id] || [];
      if (group.allow_multiple) {
        return {
          ...prev,
          [group.id]: current.includes(optionId)
            ? current.filter((id) => id !== optionId)
            : [...current, optionId],
        };
      } else {
        return {
          ...prev,
          [group.id]: current.includes(optionId) ? [] : [optionId],
        };
      }
    });
  };

  // Calculate extra price from selections
  const extraPrice = groups.reduce((total, group) => {
    const selectedIds = selections[group.id] || [];
    const options = group.product_classification_options || [];
    return total + options
      .filter((o) => selectedIds.includes(o.id))
      .reduce((sum, o) => sum + (o.extra_price || 0), 0);
  }, 0);

  const unitPrice = (product?.selling_price || 0) + extraPrice;
  const missingRequiredGroups = groups.filter(
    (group) => group.is_required && (selections[group.id] || []).length === 0
  );
  const canConfirm = missingRequiredGroups.length === 0;

  const handleConfirm = () => {
    if (!product) return;
    if (!canConfirm) return;
    onConfirm(product, qty, selections, note);
    setQty(1);
    setSelections({});
    setNote("");
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent
        ref={contentRef}
        className="max-w-[360px] rounded-2xl p-0 gap-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
      >
        <DialogDescription className="sr-only">
          Chọn phân loại và số lượng cho sản phẩm trước khi thêm vào giỏ hàng.
        </DialogDescription>
        <DialogHeader className="p-4 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <Package className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-sm font-semibold text-foreground leading-tight">
                {product.name}
              </DialogTitle>
              <p className="text-sm font-bold text-primary mt-0.5">
                {formatPrice(product.selling_price)}
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Classification groups */}
        {groups.length > 0 && (
          <div className="px-4 py-2 space-y-3 max-h-[40vh] overflow-y-auto">
            {groups
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((group) => (
                <div key={group.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-foreground">{group.name}</span>
                    {group.allow_multiple && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        Chọn nhiều
                      </Badge>
                    )}
                    {group.is_required && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 border border-amber-200"
                      >
                        Bắt buộc
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(group.product_classification_options || [])
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((option) => {
                        const selected = (selections[group.id] || []).includes(option.id);
                        return (
                          <button
                            key={option.id}
                            onClick={() => toggleOption(group, option.id)}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                              selected
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-card text-foreground border-border hover:border-primary/50"
                            )}
                          >
                            {option.name}
                            {(option.extra_price || 0) > 0 && (
                              <span className="ml-1 opacity-75">+{formatPrice(option.extra_price)}</span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Note for product */}
        <div className="px-4 py-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <StickyNote className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">Ghi chú</span>
          </div>
          <Input
            placeholder="Ghi chú thêm cho sản phẩm này"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-8 rounded-lg text-xs"
          />
        </div>

        {/* Quantity + Confirm */}
        <DialogFooter className="p-4 pt-3 flex-row items-center gap-3">
          <div className="flex items-center gap-2 bg-muted rounded-xl p-1">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground hover:bg-card transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold w-6 text-center text-foreground">{qty}</span>
            <button
              onClick={() => setQty((q) => q + 1)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground hover:bg-card transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <Button onClick={handleConfirm} className="flex-1 h-10 rounded-xl font-semibold" disabled={!canConfirm}>
            Thêm · {formatPrice(unitPrice * qty)}
          </Button>
        </DialogFooter>
        {!canConfirm && (
          <p className="px-4 pb-3 text-xs text-destructive">
            Vui lòng chọn đầy đủ các phân loại bắt buộc trước khi thêm vào giỏ hàng.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
