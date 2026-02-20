import { Product } from "@/hooks/useProducts";
import { Package } from "lucide-react";
import { useMemo, useRef, useCallback } from "react";

interface ProductGridProps {
  products: Product[];
  isLoading: boolean;
  onSelect: (product: Product, event?: React.MouseEvent | React.TouchEvent) => void;
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(price);
}

function getFirstLetter(name: string): string {
  const normalized = name.normalize("NFD").charAt(0).toUpperCase();
  // Map Vietnamese diacritics to base letter, keep Đ separate
  if (name.charAt(0).toUpperCase() === "Đ") return "Đ";
  const base = normalized.replace(/[\u0300-\u036f]/g, "");
  if (base >= "A" && base <= "Z") return base;
  return "#";
}

const ALPHABET = [
"A", "B", "C", "D", "Đ", "E", "F", "G", "H", "I", "J", "K", "L", "M",
"N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "#"];


export default function ProductGrid({ products, isLoading, onSelect }: ProductGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const grouped = useMemo(() => {
    const active = products.filter((p) => p.is_active);
    const sorted = [...active].sort((a, b) => a.name.localeCompare(b.name, "vi"));
    const groups: Record<string, Product[]> = {};
    for (const p of sorted) {
      const letter = getFirstLetter(p.name);
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(p);
    }
    return groups;
  }, [products]);

  const activeLetters = useMemo(() => ALPHABET.filter((l) => grouped[l]), [grouped]);

  const scrollToLetter = useCallback((letter: string) => {
    const el = sectionRefs.current[letter];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2 p-3">
        {[1, 2, 3, 4, 5, 6].map((i) =>
        <div key={i} className="aspect-[3/4] rounded-xl bg-card animate-pulse" />
        )}
      </div>);

  }

  if (products.filter((p) => p.is_active).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Package className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-foreground mb-1">Chưa có sản phẩm</h3>
        <p className="text-sm text-muted-foreground max-w-[240px]">
          Thêm sản phẩm trong phần Quản lý để bắt đầu bán hàng
        </p>
      </div>);

  }

  return (
    <div className="relative flex overflow-hidden h-full">
      {/* Main scrollable content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar pb-24 pr-4 h-full">
        {activeLetters.map((letter) =>
        <div
          key={letter}
          ref={(el) => {sectionRefs.current[letter] = el;}}>

            {/* Section header */}
            <div className="sticky top-0 z-10 backdrop-blur-sm px-3 py-1 bg-background">
              <span className="text-xs font-bold text-muted-foreground">{letter}</span>
            </div>
            {/* Product grid for this letter */}
            <div className="grid grid-cols-3 gap-2 px-3 py-1">
              {grouped[letter].map((product) =>
            <button
              key={product.id}
              onClick={(e) => onSelect(product, e)}
              className="flex flex-col rounded-xl bg-card border border-border/50 overflow-hidden active:scale-[0.97] transition-transform text-left">

                  <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                    {product.image_url ?
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async" /> :


                <Package className="w-7 h-7 text-muted-foreground/40" />
                }
                  </div>
                  <div className="p-1.5">
                    <p className="text-[11px] font-medium text-foreground leading-tight line-clamp-2 mb-0.5">
                      {product.name}
                    </p>
                    <p className="text-xs font-bold text-primary">
                      {formatPrice(product.selling_price)}
                    </p>
                  </div>
                </button>
            )}
            </div>
          </div>
        )}
      </div>

      {/* Alphabet sidebar */}
      <div className="absolute right-0 top-0 bottom-0 z-30 flex items-center w-4 pointer-events-none">
        <div className="flex flex-col items-center py-1 w-4 pointer-events-auto">
        {ALPHABET.map((letter) => {
          const isActive = !!grouped[letter];
          return (
            <button
              key={letter}
              disabled={!isActive}
              onClick={() => scrollToLetter(letter)}
              className={`text-[9px] leading-[14px] w-4 text-center font-semibold transition-colors ${
              isActive ?
              "text-primary active:bg-primary/10 rounded" :
              "text-muted-foreground/30"}`
              }>

              {letter}
            </button>);

        })}
        </div>
      </div>
    </div>);

}
