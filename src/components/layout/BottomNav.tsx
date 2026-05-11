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

function NavButton({ item, isActive, onClick }: { item: NavItem; isActive: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all duration-200 w-full",
        isActive ? "bg-primary/10 text-primary" : "text-muted-foreground active:scale-95 hover:bg-muted",
      )}
    >
      <div className={cn("p-1.5 rounded-xl transition-all duration-200 shrink-0", isActive && "bg-primary/10")}>
        <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
      </div>
      <span className={cn("text-sm font-medium", isActive ? "font-semibold" : "font-medium")}>
        {item.label}
      </span>
    </button>
  );
}

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const visibleItems = navItems.filter((item) => !item.permission || hasPermission(item.permission));

  const isActive = (itemPath: string) => {
    if (itemPath === "/settings") {
      return (
        location.pathname === "/settings" ||
        location.pathname === "/payment-lookup" ||
        location.pathname === "/declarations" ||
        location.pathname === "/cash-deposit" ||
        location.pathname.startsWith("/customer-display/")
      );
    }
    return location.pathname === itemPath;
  };

  return (
    <>
      {/* Bottom nav - mobile only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-strong safe-bottom">
        <div className="flex items-center justify-around h-16 px-2">
          {visibleItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-xl transition-all duration-200 min-w-[56px]",
                isActive(item.path) ? "text-primary" : "text-muted-foreground active:scale-95",
              )}
            >
              <div className={cn("p-1.5 rounded-xl transition-all duration-200", isActive(item.path) && "bg-primary/10")}>
                <item.icon className={cn("w-5 h-5", isActive(item.path) && "stroke-[2.5]")} />
              </div>
              <span className={cn("text-[10px] leading-tight", isActive(item.path) ? "font-semibold" : "font-medium")}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </nav>

      {/* Sidebar - tablet/desktop (md+) */}
      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 z-50 w-56 flex-col glass-strong safe-top safe-bottom border-r border-border/60">
        <div className="flex flex-col h-full">
          {/* Logo area */}
          <div className="flex items-center h-14 px-4 border-b border-border/40 shrink-0">
            <span className="text-base font-bold text-primary tracking-tight">NUT POS</span>
          </div>

          {/* Nav items */}
          <div className="flex-1 overflow-y-auto no-scrollbar py-3 px-3 space-y-1">
            {visibleItems.map((item) => (
              <NavButton
                key={item.path}
                item={item}
                isActive={isActive(item.path)}
                onClick={() => navigate(item.path)}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="shrink-0 px-3 py-3 border-t border-border/40">
            <p className="text-[10px] text-muted-foreground text-center">NUT POS v1.0</p>
          </div>
        </div>
      </nav>
    </>
  );
}
