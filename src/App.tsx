import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useEffect, useRef } from "react";
import { reconnectSupabaseRealtime } from "@/integrations/supabase/client";
import Auth from "./pages/Auth";
import POS from "./pages/POS";
import Orders from "./pages/Orders";
import Products from "./pages/Products";
import Reports from "./pages/Reports";
import AppSettings from "./pages/AppSettings";
import NotFound from "./pages/NotFound";
import AppErrorBoundary from "@/components/common/AppErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (failureCount >= 3) return false;
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        if (message.includes("permission denied")) return false;
        return true;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: (failureCount, error) => {
        if (failureCount >= 2) return false;
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        if (message.includes("permission denied")) return false;
        return true;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    },
  },
});
type AppRole = "admin" | "manager" | "staff" | "no_role";

function ResumeSync() {
  const queryClient = useQueryClient();
  const inFlightRef = useRef(false);

  useEffect(() => {
    const runResume = async () => {
      if (document.visibilityState !== "visible") return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        reconnectSupabaseRealtime();
        await queryClient.refetchQueries({ type: "active" });
      } catch (error) {
        console.error("[APP_RESUME_SYNC_ERROR]", error);
      } finally {
        inFlightRef.current = false;
      }
    };

    document.addEventListener("visibilitychange", runResume);
    window.addEventListener("focus", runResume);
    window.addEventListener("online", runResume);
    return () => {
      document.removeEventListener("visibilitychange", runResume);
      window.removeEventListener("focus", runResume);
      window.removeEventListener("online", runResume);
    };
  }, [queryClient]);

  return null;
}

function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}) {
  const { session, role, loading } = useAuth();

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

  const effectiveRole = role ?? "no_role";
  if (allowedRoles && !allowedRoles.includes(effectiveRole)) {
    return <Navigate to={effectiveRole === "no_role" ? "/settings" : "/pos"} replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { session, role, loading } = useAuth();

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
            <ResumeSync />
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
