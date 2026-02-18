import { Product } from "@/hooks/useProducts";
import { Badge } from "@/components/ui/badge";
import { Package, ChevronRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductListProps {
  products: Product[];
  isLoading: boolean;
  onSelect: (product: Product) => void;
  onDelete?: (product: Product) => void;
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(price);
}

export default function ProductList({ products, isLoading, onSelect, onDelete }: ProductListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Package className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-foreground mb-1">Chưa có sản phẩm</h3>
        <p className="text-sm text-muted-foreground max-w-[240px]">
          Nhấn "Thêm" để khai báo sản phẩm đầu tiên
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-4">
      {products.map((product) => (
        <div
          key={product.id}
          className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/50 active:scale-[0.98] transition-all"
        >
          {/* Clickable area */}
          <div
            className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
            onClick={() => onSelect(product)}
          >
            {/* Image placeholder */}
            <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <Package className="w-6 h-6 text-muted-foreground" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-sm text-foreground truncate">{product.name}</h4>
                {!product.is_active && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    Ngừng KD
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {product.categories?.name || "Chưa phân loại"}
                {product.barcode && ` · ${product.barcode}`}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-semibold text-primary">{formatPrice(product.selling_price)}</span>
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </div>

          {/* Delete button */}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(product);
              }}
              className="w-8 h-8 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center flex-shrink-0 hover:bg-destructive/20 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
