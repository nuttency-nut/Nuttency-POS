import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useSupabaseReconnect } from "@/hooks/useSupabaseReconnect";
import Auth from "./pages/Auth";
import POS from "./pages/POS";
import Orders from "./pages/Orders";
import Products from "./pages/Products";
import Reports from "./pages/Reports";
import AppSettings from "./pages/AppSettings";
import PaymentLookup from "./pages/PaymentLookup";
import Declarations from "./pages/Declarations";
import NotFound from "./pages/NotFound";
import AppErrorBoundary from "@/components/common/AppErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60,
      refetchOnWindowFocus: true,
    },
  },
});
function isAuthRecoveryFlow() {
  if (typeof window === "undefined") return false;
  const search = new URLSearchParams(window.location.search);
  const hashRaw = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hash = new URLSearchParams(hashRaw);
  return hash.get("type") === "recovery" || search.get("mode") === "reset-password";
}

function AppResumeSync() {
  useSupabaseReconnect();

  return null;
}

function ProtectedRoute({
  children,
  requiredPermissions,
}: {
  children: React.ReactNode;
  requiredPermissions?: string[];
}) {
  const { session, loading, hasPermission } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs">Đang khôi phục phiên đăng nhập...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  if (requiredPermissions && requiredPermissions.length > 0) {
    const hasAccess = requiredPermissions.some((permission) => hasPermission(permission));
    if (!hasAccess) {
      return <Navigate to="/settings" replace />;
    }
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { session, loading, hasPermission } = useAuth();
  const allowAuthForRecovery = isAuthRecoveryFlow();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  const defaultRoute = hasPermission("pos")
    ? "/pos"
    : hasPermission("orders")
      ? "/orders"
      : hasPermission("products")
        ? "/products"
        : hasPermission("reports")
          ? "/reports"
          : "/settings";

  return (
    <Routes>
      <Route
        path="/auth"
        element={session && !allowAuthForRecovery ? <Navigate to="/pos" replace /> : <Auth />}
      />
      <Route
        path="/"
        element={
          session ? (
            <Navigate to={defaultRoute} replace />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
      <Route
        path="/pos"
        element={
          <ProtectedRoute requiredPermissions={["pos"]}>
            <POS />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders"
        element={
          <ProtectedRoute requiredPermissions={["orders"]}>
            <Orders />
          </ProtectedRoute>
        }
      />
      <Route
        path="/products"
        element={
          <ProtectedRoute requiredPermissions={["products"]}>
            <Products />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute requiredPermissions={["reports"]}>
            <Reports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <AppSettings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payment-lookup"
        element={
          <ProtectedRoute requiredPermissions={["settings.transfer_lookup"]}>
            <PaymentLookup />
          </ProtectedRoute>
        }
      />
      <Route
        path="/declarations"
        element={
          <ProtectedRoute requiredPermissions={["settings.role_declaration", "settings.store_declaration"]}>
            <Declarations />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppResumeSync />
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
