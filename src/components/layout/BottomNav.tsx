import { useLocation, useNavigate } from "react-router-dom";
import { ShoppingCart, ClipboardList, Package, BarChart3, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  permission?: string;
}

const navItems: NavItem[] = [
  { path: "/pos", label: "Bán hàng", icon: ShoppingCart, permission: "pos" },
  { path: "/orders", label: "Đơn hàng", icon: ClipboardList, permission: "orders" },
  { path: "/products", label: "Sản phẩm", icon: Package, permission: "products" },
  { path: "/reports", label: "Báo cáo", icon: BarChart3, permission: "reports" },
  { path: "/settings", label: "Cài đặt", icon: Settings },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const visibleItems = navItems.filter((item) => !item.permission || hasPermission(item.permission));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-strong safe-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {visibleItems.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path === "/settings" &&
              (location.pathname === "/payment-lookup" || location.pathname === "/declarations"));
          const Icon = item.icon;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-xl transition-all duration-200 min-w-[56px]",
                isActive ? "text-primary" : "text-muted-foreground active:scale-95",
              )}
            >
              <div className={cn("p-1.5 rounded-xl transition-all duration-200", isActive && "bg-primary/10")}>
                <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
              </div>
              <span className={cn("text-[10px] leading-tight", isActive ? "font-semibold" : "font-medium")}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
