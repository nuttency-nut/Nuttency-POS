import { ReactNode } from "react";
import BottomNav from "./BottomNav";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  headerRight?: ReactNode;
}

export default function AppLayout({ children, title, headerRight }: AppLayoutProps) {
  return (
    <div className="h-dvh bg-background flex flex-col overflow-hidden">
      {/* Header */}
      {title && (
        <header className="sticky top-0 z-40 glass-strong safe-top">
          <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
            <h1 className="text-lg font-bold text-foreground">{title}</h1>
            {headerRight && <div className="flex items-center gap-2">{headerRight}</div>}
          </div>
        </header>
      )}

      {/* Content */}
      <main className="flex-1 min-h-0 pb-20 max-w-lg mx-auto w-full overflow-hidden">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
