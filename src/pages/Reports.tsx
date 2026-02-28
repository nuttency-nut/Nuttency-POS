import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3,
  Download,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ReportOrderItem = {
  product_name: string;
  qty: number;
  subtotal: number;
  product_id?: string | null;
  products?: {
    categories?: {
      name?: string | null;
    } | null;
  } | null;
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

type WeeklyDataPoint = {
  label: string;
  currentRevenue: number;
  previousRevenue: number;
  currentOrders: number;
  previousOrders: number;
};

type MonthlyDataPoint = {
  label: string;
  revenue: number;
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

function formatYAxisRevenue(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toString();
}

function toLocalDate(dateString: string) {
  const date = new Date(dateString);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000);
}

function toLocalDateKey(dateString: string) {
  return toLocalDate(dateString).toISOString().slice(0, 10);
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

function getMonday(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
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
    <div className="rounded-xl border border-border bg-card px-3 py-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-muted-foreground truncate">{title}</p>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">{icon}</span>
      </div>

      <p className="text-2xl leading-none font-extrabold tracking-tight text-foreground">{value}</p>

      <div className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${isUp ? "text-emerald-600" : "text-rose-500"}`}>
        <TrendIcon className="h-3.5 w-3.5" />
        <span>{isUp ? "+" : ""}{trend.toFixed(1)}%</span>
        <span className="font-medium text-muted-foreground ml-1 truncate">so với hôm qua</span>
      </div>
    </div>
  );
}

export default function Reports() {
  const [chartTab, setChartTab] = useState<"revenue-week" | "orders-week" | "revenue-12m">("revenue-week");
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading, isFetching } = useQuery({
    queryKey: ["reports-data"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,total_amount,status,payment_method,created_at,customer_name,customer_phone,order_items(product_name,qty,subtotal,product_id,products(category_id,categories(name)))")
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

    const now = new Date();
    const weekStart = getMonday(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const monthBase = new Date(now.getFullYear(), now.getMonth(), 1);
    const range12MonthStart = new Date(monthBase);
    range12MonthStart.setMonth(range12MonthStart.getMonth() - 11);
    range12MonthStart.setHours(0, 0, 0, 0);
    const range12MonthEnd = new Date(monthBase);
    range12MonthEnd.setMonth(range12MonthEnd.getMonth() + 1);
    range12MonthEnd.setMilliseconds(-1);

    const chartScopedCompletedOrders = completedOrders.filter((order) => {
      const dt = toLocalDate(order.created_at);
      if (chartTab === "revenue-12m") {
        return dt >= range12MonthStart && dt <= range12MonthEnd;
      }
      return dt >= weekStart && dt <= weekEnd;
    });

    const productMap = new Map<string, { qty: number; amount: number }>();
    const categoryMap = new Map<string, number>();
    chartScopedCompletedOrders.forEach((order) => {
      (order.order_items || []).forEach((item) => {
        const key = item.product_name || "Sản phẩm";
        const prev = productMap.get(key) || { qty: 0, amount: 0 };
        const categoryName = item.products?.categories?.name?.trim() || "Khác";
        productMap.set(key, {
          qty: prev.qty + Number(item.qty || 0),
          amount: prev.amount + Number(item.subtotal || 0),
        });
        categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + Number(item.subtotal || 0));
      });
    });

    const topProducts = Array.from(productMap.entries())
      .map(([name, stat]) => ({ name, ...stat }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    const totalRevenue = completedOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const totalCategoryRevenue = Array.from(categoryMap.values()).reduce((sum, v) => sum + v, 0);
    const categoryBreakdown = Array.from(categoryMap.entries())
      .map(([name, amount]) => ({
        name,
        amount,
        percent: totalCategoryRevenue > 0 ? (amount / totalCategoryRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const previousWeekStart = new Date(weekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);

    const weekLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
    const weeklyData: WeeklyDataPoint[] = weekLabels.map((label, idx) => {
      const currentDate = new Date(weekStart);
      currentDate.setDate(currentDate.getDate() + idx);
      const currentKey = toLocalDateKey(currentDate.toISOString());

      const prevDate = new Date(previousWeekStart);
      prevDate.setDate(prevDate.getDate() + idx);
      const previousKey = toLocalDateKey(prevDate.toISOString());

      const currentRevenue = completedOrders
        .filter((o) => toLocalDateKey(o.created_at) === currentKey)
        .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
      const previousRevenue = completedOrders
        .filter((o) => toLocalDateKey(o.created_at) === previousKey)
        .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

      const currentOrders = orders.filter((o) => toLocalDateKey(o.created_at) === currentKey).length;
      const previousOrders = orders.filter((o) => toLocalDateKey(o.created_at) === previousKey).length;

      return {
        label,
        currentRevenue,
        previousRevenue,
        currentOrders,
        previousOrders,
      };
    });

    const monthlyData: MonthlyDataPoint[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(monthBase);
      d.setMonth(d.getMonth() - i);
      const y = d.getFullYear();
      const m = d.getMonth();

      const revenue = completedOrders
        .filter((o) => {
          const dt = toLocalDate(o.created_at);
          return dt.getFullYear() === y && dt.getMonth() === m;
        })
        .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

      monthlyData.push({ label: `T${m + 1}`, revenue });
    }

    const thisMonth = monthlyData[monthlyData.length - 1]?.revenue || 0;
    const lastMonth = monthlyData[monthlyData.length - 2]?.revenue || 0;

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
      topProducts,
      categoryBreakdown,
      totalOrders: orders.length,
      weeklyData,
      monthlyData,
      monthlyTrend: getTrendPercent(thisMonth, lastMonth),
      chartScope: chartTab === "revenue-12m" ? "12m" : "week",
    };
  }, [orders, chartTab]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["reports-data"] });
  };

  const handleExport = () => {
    const lines = [
      ["Báo cáo tổng quan"],
      ["Tổng đơn", report.totalOrders.toString()],
      ["Doanh thu", report.totalRevenue.toString()],
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
            <div className="grid grid-cols-2 gap-2.5">
              <KpiCard title="Doanh thu" value={formatCompact(report.kpi.revenue)} trend={report.kpi.revenueTrend} icon={<Wallet className="h-5 w-5" />} />
              <KpiCard title="Đơn hàng" value={report.kpi.orders.toString()} trend={report.kpi.ordersTrend} icon={<ShoppingCart className="h-5 w-5" />} />
              <KpiCard title="Khách hàng" value={report.kpi.customers.toString()} trend={report.kpi.customersTrend} icon={<Users className="h-5 w-5" />} />
              <KpiCard title="Giá trị TB" value={formatCompact(report.kpi.avgValue)} trend={report.kpi.avgValueTrend} icon={<Package className="h-5 w-5" />} />
            </div>

            <Tabs value={chartTab} onValueChange={(v) => setChartTab(v as typeof chartTab)} className="w-full">
              <TabsList className="h-10 p-1 bg-muted/70 rounded-lg">
                <TabsTrigger value="revenue-week" className="text-xs px-3">Doanh thu Tuần</TabsTrigger>
                <TabsTrigger value="orders-week" className="text-xs px-3">Đơn hàng Tuần</TabsTrigger>
                <TabsTrigger value="revenue-12m" className="text-xs px-3">12 Tháng</TabsTrigger>
              </TabsList>

              <TabsContent value="revenue-week" className="mt-3">
                <div className="rounded-xl border border-border bg-card p-3">
                  <h3 className="text-base font-semibold text-foreground">Doanh thu theo ngày trong tuần</h3>
                  <p className="text-sm text-muted-foreground mb-3">Phân bố doanh thu đơn hàng theo từng ngày</p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={report.weeklyData} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={formatYAxisRevenue} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                        <Tooltip
                          formatter={(value: number, name: string) => [formatPrice(Number(value)), name === "currentRevenue" ? "Tuần này" : "Tuần trước"]}
                          labelFormatter={(l) => `Ngày ${l}`}
                        />
                        <Bar dataKey="previousRevenue" fill="#AAB9C9" radius={[6, 6, 0, 0]} />
                        <Bar
                          dataKey="currentRevenue"
                          fill="#0B1736"
                          radius={[6, 6, 0, 0]}
                          label={({ x, y, width, payload }) => {
                            if (!payload || typeof payload.currentRevenue !== "number" || typeof payload.previousRevenue !== "number") {
                              return null;
                            }
                            const trend = getTrendPercent(payload.currentRevenue, payload.previousRevenue);
                            const color = trend >= 0 ? "#16a34a" : "#ef4444";
                            return (
                              <text x={(x as number) + (width as number) / 2} y={(y as number) - 8} textAnchor="middle" fontSize={10} fill={color}>
                                {trend >= 0 ? "+" : ""}{trend.toFixed(1)}%
                              </text>
                            );
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="orders-week" className="mt-3">
                <div className="rounded-xl border border-border bg-card p-3">
                  <h3 className="text-base font-semibold text-foreground">Đơn hàng theo ngày trong tuần</h3>
                  <p className="text-sm text-muted-foreground mb-3">Phân bố đơn hàng theo từng ngày</p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={report.weeklyData} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip
                          formatter={(value: number, name: string) => [Number(value), name === "currentOrders" ? "Tuần này" : "Tuần trước"]}
                          labelFormatter={(l) => `Ngày ${l}`}
                        />
                        <Bar dataKey="previousOrders" fill="#AAB9C9" radius={[6, 6, 0, 0]} />
                        <Bar
                          dataKey="currentOrders"
                          fill="#0B1736"
                          radius={[6, 6, 0, 0]}
                          label={({ x, y, width, payload }) => {
                            if (!payload || typeof payload.currentOrders !== "number" || typeof payload.previousOrders !== "number") {
                              return null;
                            }
                            const trend = getTrendPercent(payload.currentOrders, payload.previousOrders);
                            const color = trend >= 0 ? "#16a34a" : "#ef4444";
                            return (
                              <text x={(x as number) + (width as number) / 2} y={(y as number) - 8} textAnchor="middle" fontSize={10} fill={color}>
                                {trend >= 0 ? "+" : ""}{trend.toFixed(1)}%
                              </text>
                            );
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="revenue-12m" className="mt-3">
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-foreground">Doanh thu 12 tháng gần nhất</h3>
                    <span className={`inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-semibold ${report.monthlyTrend >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                      {report.monthlyTrend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {report.monthlyTrend >= 0 ? "+" : ""}{report.monthlyTrend.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">Biểu đồ xu hướng doanh thu theo tháng</p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={report.monthlyData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={formatYAxisRevenue} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(value: number) => [formatPrice(Number(value)), "Doanh thu"]} />
                        <Line type="monotone" dataKey="revenue" stroke="#0B1736" strokeWidth={2.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="rounded-xl border border-border bg-card p-3">
              <h3 className="text-base font-semibold text-foreground">Doanh thu theo danh mục</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {report.chartScope === "12m"
                  ? "Phân bổ doanh thu 12 tháng theo nhóm sản phẩm"
                  : "Phân bổ doanh thu tuần theo nhóm sản phẩm"}
              </p>

              {report.categoryBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có dữ liệu danh mục.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[220px_1fr] items-center overflow-hidden">
                  <div className="h-44 mx-auto w-full max-w-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={report.categoryBreakdown}
                          dataKey="amount"
                          nameKey="name"
                          innerRadius={52}
                          outerRadius={80}
                          paddingAngle={2}
                          stroke="none"
                        >
                          {report.categoryBreakdown.map((_, idx) => {
                            const colors = ["#0B1736", "#5F7391", "#90A4C0", "#B7C7DA", "#DCE3ED"];
                            return <Cell key={`cell-${idx}`} fill={colors[idx % colors.length]} />;
                          })}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatPrice(Number(value))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-2 min-w-0">
                    {report.categoryBreakdown.map((item, idx) => {
                      const colors = ["#0B1736", "#5F7391", "#90A4C0", "#B7C7DA", "#DCE3ED"];
                      return (
                        <div key={`${item.name}-${idx}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
                          <div className="inline-flex min-w-0 items-center gap-2 overflow-hidden">
                            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colors[idx % colors.length] }} />
                            <span className="truncate text-[clamp(11px,2.8vw,14px)] font-medium text-foreground">{item.name}</span>
                          </div>
                          <span className="text-[clamp(11px,2.8vw,14px)] font-semibold text-foreground">{item.percent.toFixed(0)}%</span>
                          <span className="text-[clamp(11px,2.6vw,13px)] text-muted-foreground text-right">{formatCompact(item.amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-3 space-y-3">
              <h3 className="text-base font-semibold text-foreground">Sản phẩm bán chạy</h3>
              <p className="text-sm text-muted-foreground -mt-2">
                {report.chartScope === "12m" ? "Top 5 sản phẩm 12 tháng gần nhất" : "Top 5 sản phẩm tuần hiện tại"}
              </p>
              {report.topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có dữ liệu sản phẩm.</p>
              ) : (
                <div className="space-y-3">
                  {report.topProducts.map((product, idx) => (
                    <div key={`${product.name}-${idx}`} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="inline-flex min-w-0 items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                            {idx + 1}
                          </span>
                          <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-foreground">{formatCompact(product.amount)}</p>
                          <p className="text-xs text-muted-foreground">({product.qty} SP)</p>
                        </div>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#0B1736]"
                          style={{
                            width: `${Math.max(
                              8,
                              (product.amount / Math.max(...report.topProducts.map((p) => p.amount), 1)) * 100
                            )}%`,
                          }}
                        />
                      </div>
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

