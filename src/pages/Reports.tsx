import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart3,
  CreditCard,
  Package,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";

type ReportOrderItem = {
  product_name: string;
  qty: number;
  subtotal: number;
};

type ReportOrder = {
  id: string;
  total_amount: number;
  status: string;
  payment_method: string;
  created_at: string;
  order_items: ReportOrderItem[];
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function getPaymentLabel(method: string) {
  switch (method) {
    case "cash":
      return "Tiền mặt";
    case "transfer":
      return "Chuyển khoản";
    case "momo":
      return "MoMo";
    default:
      return method;
  }
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">{icon}</span>
      </div>
      <p className="text-lg font-bold leading-none text-foreground">{value}</p>
    </div>
  );
}

export default function Reports() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["reports-data"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,total_amount,status,payment_method,created_at,order_items(product_name,qty,subtotal)")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error) throw error;
      return (data || []) as unknown as ReportOrder[];
    },
  });

  const report = useMemo(() => {
    const completedOrders = orders.filter((o) => o.status === "completed");
    const cancelledOrders = orders.filter((o) => o.status === "cancelled");
    const pendingOrders = orders.filter((o) => o.status === "pending");

    const totalRevenue = completedOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const avgOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;

    const paymentMap = new Map<string, { count: number; amount: number }>();
    completedOrders.forEach((order) => {
      const key = order.payment_method || "other";
      const prev = paymentMap.get(key) || { count: 0, amount: 0 };
      paymentMap.set(key, {
        count: prev.count + 1,
        amount: prev.amount + Number(order.total_amount || 0),
      });
    });

    const productMap = new Map<string, { qty: number; amount: number }>();
    completedOrders.forEach((order) => {
      (order.order_items || []).forEach((item) => {
        const key = item.product_name || "Sản phẩm";
        const prev = productMap.get(key) || { qty: 0, amount: 0 };
        productMap.set(key, {
          qty: prev.qty + Number(item.qty || 0),
          amount: prev.amount + Number(item.subtotal || 0),
        });
      });
    });

    const topProducts = Array.from(productMap.entries())
      .map(([name, stat]) => ({ name, ...stat }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return {
      totalOrders: orders.length,
      completedOrders: completedOrders.length,
      pendingOrders: pendingOrders.length,
      cancelledOrders: cancelledOrders.length,
      totalRevenue,
      avgOrderValue,
      paymentStats: Array.from(paymentMap.entries()).map(([method, stat]) => ({ method, ...stat })),
      topProducts,
    };
  }, [orders]);

  return (
    <AppLayout title="Báo cáo">
      <div className="h-full overflow-y-auto no-scrollbar p-4 space-y-3">
        {isLoading ? (
          <div className="py-16 flex flex-col items-center text-muted-foreground">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-sm">Đang tải báo cáo...</p>
          </div>
        ) : report.totalOrders === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <BarChart3 className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">Chưa có dữ liệu</h3>
            <p className="text-sm text-muted-foreground max-w-[240px]">
              Báo cáo sẽ hiển thị sau khi có đơn hàng.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard label="Tổng đơn" value={report.totalOrders.toString()} icon={<Receipt className="h-4 w-4 text-primary" />} />
              <StatCard label="Hoàn thành" value={report.completedOrders.toString()} icon={<TrendingUp className="h-4 w-4 text-emerald-500" />} />
              <StatCard label="Chờ xử lý" value={report.pendingOrders.toString()} icon={<Package className="h-4 w-4 text-amber-500" />} />
              <StatCard label="Đã hủy" value={report.cancelledOrders.toString()} icon={<BarChart3 className="h-4 w-4 text-rose-500" />} />
            </div>

            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Doanh thu</span>
                <Wallet className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-bold text-foreground">{formatPrice(report.totalRevenue)}</p>
              <p className="text-xs text-muted-foreground">
                Trung bình đơn hoàn thành: <span className="font-semibold text-foreground">{formatPrice(report.avgOrderValue)}</span>
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Phương thức thanh toán</h3>
              {report.paymentStats.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có đơn hoàn thành.</p>
              ) : (
                <div className="space-y-2">
                  {report.paymentStats.map((payment) => (
                    <div key={payment.method} className="rounded-lg border border-border bg-background px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                          {getPaymentLabel(payment.method)}
                        </span>
                        <span className="text-sm font-semibold text-foreground">{formatPrice(payment.amount)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{payment.count} đơn</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Top sản phẩm</h3>
              {report.topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có dữ liệu sản phẩm.</p>
              ) : (
                <div className="space-y-2">
                  {report.topProducts.map((product, idx) => (
                    <div key={`${product.name}-${idx}`} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.qty} lượt bán</p>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{formatPrice(product.amount)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
