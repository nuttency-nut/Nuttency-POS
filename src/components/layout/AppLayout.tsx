import { ReactNode } from "react";
import BottomNav from "./BottomNav";
import { useLocation } from "react-router-dom";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  headerRight?: ReactNode;
}

const CUSTOMER_DISPLAY_PREFIX = "/customer-display/";

export default function AppLayout({ children, title, headerRight }: AppLayoutProps) {
  const location = useLocation();
  const isCustomerDisplay = location.pathname.startsWith(CUSTOMER_DISPLAY_PREFIX);

  if (isCustomerDisplay) {
    return <>{children}</>;
  }

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      {/* Header */}
      {title && (
        <header className="sticky top-0 z-40 glass-strong safe-top shrink-0">
          <div className="flex items-center justify-between h-14 px-4">
            <h1 className="text-lg font-bold text-foreground">{title}</h1>
            {headerRight && <div className="flex items-center gap-2">{headerRight}</div>}
          </div>
        </header>
      )}

      {/* Content */}
      <main className="flex-1 min-h-0 w-full overflow-hidden md:pl-56">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
