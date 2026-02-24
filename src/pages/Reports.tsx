import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  CreditCard,
  Download,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
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
  customer_name: string | null;
  customer_phone: string | null;
  order_items: ReportOrderItem[];
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompact(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toString();
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

function toLocalDateKey(dateString: string) {
  const date = new Date(dateString);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function shiftDateKey(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function getTrendPercent(today: number, yesterday: number) {
  if (yesterday <= 0) return today > 0 ? 100 : 0;
  return ((today - yesterday) / yesterday) * 100;
}

function KpiCard({
  title,
  value,
  trend,
  icon,
}: {
  title: string;
  value: string;
  trend: number;
  icon: React.ReactNode;
}) {
  const isUp = trend >= 0;
  const TrendIcon = isUp ? TrendingUp : TrendingDown;

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">{title}</p>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">{icon}</span>
      </div>

      <p className="text-3xl leading-none font-extrabold tracking-tight text-foreground">{value}</p>

      <div className={`mt-3 inline-flex items-center gap-1.5 text-sm font-semibold ${isUp ? "text-emerald-600" : "text-rose-500"}`}>
        <TrendIcon className="h-4 w-4" />
        <span>{isUp ? "+" : ""}{trend.toFixed(1)}%</span>
        <span className="font-medium text-muted-foreground ml-1">so với hôm qua</span>
      </div>
    </div>
  );
}

export default function Reports() {
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading, isFetching } = useQuery({
    queryKey: ["reports-data"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,total_amount,status,payment_method,created_at,customer_name,customer_phone,order_items(product_name,qty,subtotal)")
        .order("created_at", { ascending: false })
        .limit(2000);

      if (error) throw error;
      return (data || []) as unknown as ReportOrder[];
    },
  });

  const report = useMemo(() => {
    const todayKey = toLocalDateKey(new Date().toISOString());
    const yesterdayKey = shiftDateKey(todayKey, -1);

    const completedOrders = orders.filter((o) => o.status === "completed");

    const ordersToday = orders.filter((o) => toLocalDateKey(o.created_at) === todayKey);
    const ordersYesterday = orders.filter((o) => toLocalDateKey(o.created_at) === yesterdayKey);

    const completedToday = completedOrders.filter((o) => toLocalDateKey(o.created_at) === todayKey);
    const completedYesterday = completedOrders.filter((o) => toLocalDateKey(o.created_at) === yesterdayKey);

    const revenueToday = completedToday.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const revenueYesterday = completedYesterday.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

    const uniqueCustomerToday = new Set(
      ordersToday.map((o) => o.customer_phone || (o.customer_name || "Khách lẻ").toLowerCase())
    ).size;
    const uniqueCustomerYesterday = new Set(
      ordersYesterday.map((o) => o.customer_phone || (o.customer_name || "Khách lẻ").toLowerCase())
    ).size;

    const avgToday = completedToday.length > 0 ? revenueToday / completedToday.length : 0;
    const avgYesterday = completedYesterday.length > 0
      ? completedYesterday.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) / completedYesterday.length
      : 0;

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

    const totalRevenue = completedOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

    return {
      kpi: {
        revenue: revenueToday,
        revenueTrend: getTrendPercent(revenueToday, revenueYesterday),
        orders: ordersToday.length,
        ordersTrend: getTrendPercent(ordersToday.length, ordersYesterday.length),
        customers: uniqueCustomerToday,
        customersTrend: getTrendPercent(uniqueCustomerToday, uniqueCustomerYesterday),
        avgValue: avgToday,
        avgValueTrend: getTrendPercent(avgToday, avgYesterday),
      },
      totalRevenue,
      paymentStats: Array.from(paymentMap.entries()).map(([method, stat]) => ({ method, ...stat })),
      topProducts,
      totalOrders: orders.length,
    };
  }, [orders]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["reports-data"] });
  };

  const handleExport = () => {
    const lines = [
      ["Báo cáo tổng quan"],
      ["Tổng đơn", report.totalOrders.toString()],
      ["Doanh thu", report.totalRevenue.toString()],
      [],
      ["Phương thức", "Số đơn", "Doanh thu"],
      ...report.paymentStats.map((p) => [getPaymentLabel(p.method), p.count.toString(), p.amount.toString()]),
      [],
      ["Top sản phẩm", "Số lượng", "Doanh thu"],
      ...report.topProducts.map((p) => [p.name, p.qty.toString(), p.amount.toString()]),
    ];

    const csv = lines.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bao-cao-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout
      title="Báo cáo"
      headerRight={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 rounded-xl gap-1.5" onClick={handleExport}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Xuất báo cáo</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={handleRefresh}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      }
    >
      <div className="h-full overflow-y-auto no-scrollbar p-4 space-y-4">
        <div className="px-0.5">
          <p className="text-sm text-muted-foreground">Tổng quan hoạt động kinh doanh</p>
        </div>

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
            <p className="text-sm text-muted-foreground max-w-[240px]">Báo cáo sẽ hiển thị sau khi có đơn hàng.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
              <KpiCard title="Doanh thu" value={formatCompact(report.kpi.revenue)} trend={report.kpi.revenueTrend} icon={<Wallet className="h-5 w-5" />} />
              <KpiCard title="Đơn hàng" value={report.kpi.orders.toString()} trend={report.kpi.ordersTrend} icon={<ShoppingCart className="h-5 w-5" />} />
              <KpiCard title="Khách hàng" value={report.kpi.customers.toString()} trend={report.kpi.customersTrend} icon={<Users className="h-5 w-5" />} />
              <KpiCard title="Giá trị TB" value={formatCompact(report.kpi.avgValue)} trend={report.kpi.avgValueTrend} icon={<Package className="h-5 w-5" />} />
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
