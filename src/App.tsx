import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Auth from "./pages/Auth";
import POS from "./pages/POS";
import Orders from "./pages/Orders";
import Products from "./pages/Products";
import Reports from "./pages/Reports";
import AppSettings from "./pages/AppSettings";
import NotFound from "./pages/NotFound";
import AppErrorBoundary from "@/components/common/AppErrorBoundary";

const queryClient = new QueryClient();
type AppRole = "admin" | "manager" | "staff" | "no_role";

function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}) {
  const { session, role, loading } = useAuth();

  if (loading || (session && role === null)) {
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

  const effectiveRole = role ?? "no_role";
  if (allowedRoles && !allowedRoles.includes(effectiveRole)) {
    return <Navigate to={effectiveRole === "no_role" ? "/settings" : "/pos"} replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { session, role, loading } = useAuth();

  if (loading || (session && role === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/auth"
        element={session ? <Navigate to="/pos" replace /> : <Auth />}
      />
      <Route
        path="/"
        element={
          session ? (
            <Navigate to={(role ?? "no_role") === "no_role" ? "/settings" : "/pos"} replace />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
      <Route
        path="/pos"
        element={
          <ProtectedRoute allowedRoles={["admin", "manager", "staff"]}>
            <POS />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders"
        element={
          <ProtectedRoute allowedRoles={["admin", "manager", "staff"]}>
            <Orders />
          </ProtectedRoute>
        }
      />
      <Route
        path="/products"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <Products />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute allowedRoles={["admin", "manager"]}>
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
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
