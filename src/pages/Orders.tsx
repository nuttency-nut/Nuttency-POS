import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  ChevronRight,
  CircleCheckBig,
  CircleX,
  ClipboardList,
  Clock3,
  CreditCard,
  Package,
  Phone,
  ReceiptText,
  Search,
  Star,
  StickyNote,
  TrendingUp,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";

type OrderItem = {
  id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
  classification_labels: string[] | null;
  note: string | null;
};

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string | null;
  total_amount: number;
  payment_method: string;
  status: string;
  created_at: string;
  note: string | null;
  loyalty_points_used: number;
  order_items: OrderItem[];
};

const STATUS_META: Record<
  string,
  {
    label: string;
    chipClass: string;
    dotColor: string;
    icon: React.ReactNode;
  }
> = {
  pending: {
    label: "Chờ xử lý",
    chipClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-700",
    dotColor: "bg-amber-500",
    icon: <Clock3 className="w-3.5 h-3.5" />,
  },
  completed: {
    label: "Hoàn thành",
    chipClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-700",
    dotColor: "bg-emerald-500",
    icon: <CircleCheckBig className="w-3.5 h-3.5" />,
  },
  cancelled: {
    label: "Đã hủy",
    chipClass: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-700",
    dotColor: "bg-rose-500",
    icon: <CircleX className="w-3.5 h-3.5" />,
  },
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDateTime(dateString: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(dateString));
}

function formatTime(dateString: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function getStatusMeta(status: string) {
  return (
    STATUS_META[status] || {
      label: status || "Không xác định",
      chipClass: "bg-muted text-muted-foreground border-border",
      dotColor: "bg-muted-foreground",
      icon: <Clock3 className="w-3.5 h-3.5" />,
    }
  );
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

function SummaryCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-base sm:text-lg font-bold text-foreground leading-tight truncate">{value}</p>
      </div>
    </div>
  );
}

export default function Orders() {
  const queryClient = useQueryClient();
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "completed" | "cancelled">("all");
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);

  const { data: orders = [], isLoading, isRefetching } = useQuery({
    queryKey: ["orders-management"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id,order_number,customer_name,customer_phone,total_amount,payment_method,status,created_at,note,loyalty_points_used,order_items(id,product_name,qty,unit_price,subtotal,classification_labels,note)"
        )
        .order("created_at", { ascending: false })
        .limit(300);

      if (error) throw error;
      return (data || []) as unknown as OrderRow[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: "completed" | "cancelled" }) => {
      const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders-management"] });
      toast.success("Đã cập nhật trạng thái đơn hàng");
    },
    onError: (error: Error) => {
      toast.error(`Cập nhật trạng thái đơn hàng thất bại: ${error.message}`);
    },
  });

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (!q) return true;
      return (
        order.order_number.toLowerCase().includes(q) ||
        order.customer_name.toLowerCase().includes(q) ||
        (order.customer_phone || "").toLowerCase().includes(q)
      );
    });
  }, [orders, search, statusFilter]);

  const counts = useMemo(
    () => ({
      all: orders.length,
      pending: orders.filter((o) => o.status === "pending").length,
      completed: orders.filter((o) => o.status === "completed").length,
      cancelled: orders.filter((o) => o.status === "cancelled").length,
    }),
    [orders]
  );

  const totalRevenue = useMemo(
    () => orders.filter((o) => o.status === "completed").reduce((sum, o) => sum + o.total_amount, 0),
    [orders]
  );

  const tabs = [
    { key: "all" as const, label: "Tất cả", count: counts.all },
    { key: "pending" as const, label: "Chờ xử lý", count: counts.pending },
    { key: "completed" as const, label: "Hoàn thành", count: counts.completed },
    { key: "cancelled" as const, label: "Đã hủy", count: counts.cancelled },
  ];

  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["orders-management"] });
      }, 120);
    };

    const channel = supabase
      .channel("orders-management-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <AppLayout title="Đơn hàng">
      <div className="h-full overflow-y-auto no-scrollbar p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <SummaryCard
            label="Tổng đơn"
            value={counts.all.toString()}
            icon={<Package className="h-5 w-5 text-primary-foreground" />}
            accent="bg-primary"
          />
          <SummaryCard
            label="Doanh thu"
            value={formatPrice(totalRevenue)}
            icon={<TrendingUp className="h-5 w-5 text-emerald-700" />}
            accent="bg-emerald-100"
          />
          <SummaryCard
            label="Chờ xử lý"
            value={counts.pending.toString()}
            icon={<Clock3 className="h-5 w-5 text-amber-700" />}
            accent="bg-amber-100"
          />
          <SummaryCard
            label="Đã hủy"
            value={counts.cancelled.toString()}
            icon={<CircleX className="h-5 w-5 text-rose-700" />}
            accent="bg-rose-100"
          />
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Tìm mã đơn, tên khách, SĐT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 pl-10 rounded-xl bg-card border-border shadow-sm"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  statusFilter === tab.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card text-muted-foreground border border-border hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {tab.label}
                <span
                  className={`text-xs font-semibold px-1.5 py-0.5 rounded-md ${
                    statusFilter === tab.key
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 flex flex-col items-center text-muted-foreground">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-sm">Đang tải đơn hàng...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <ClipboardList className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">Chưa có đơn hàng</h3>
            <p className="text-sm text-muted-foreground max-w-[280px] mx-auto">
              Đơn hàng sẽ hiển thị đầy đủ sau khi bạn bán hàng
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredOrders.map((order) => {
              const meta = getStatusMeta(order.status);
              return (
                <button
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="w-full text-left rounded-xl border border-border bg-card p-4 shadow-sm hover:bg-accent/50 active:scale-[0.995] transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-foreground truncate">{order.order_number}</p>
                      <p className="text-sm text-muted-foreground mt-0.5 truncate">
                        {order.customer_name}
                        {order.customer_phone ? ` – ${order.customer_phone}` : ""}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border ${meta.chipClass}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotColor}`} />
                      {meta.label}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{formatTime(order.created_at)} - {new Date(order.created_at).toLocaleDateString("vi-VN")}</p>
                    <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CreditCard className="h-3.5 w-3.5" />
                      {getPaymentLabel(order.payment_method)}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tổng tiền</span>
                    <span className="text-base font-bold text-foreground">{formatPrice(order.total_amount)}</span>
                  </div>

                  <div className="mt-2 flex justify-end">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Sheet open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <SheetContent side="left" className="w-[92vw] max-w-lg p-0 flex flex-col [&>button]:hidden">
          {selectedOrder && (() => {
            const meta = getStatusMeta(selectedOrder.status);
            return (
              <>
                <SheetHeader className="px-5 pt-5 pb-4 border-b border-border space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <SheetTitle className="text-xl font-bold text-foreground">{selectedOrder.order_number}</SheetTitle>
                      <p className="text-sm text-muted-foreground mt-0.5 inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDateTime(selectedOrder.created_at)}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold border ${meta.chipClass}`}>
                      {meta.icon}
                      {meta.label}
                    </span>
                  </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-4 space-y-4">
                  <div className="rounded-xl border border-border p-4 bg-card space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Khách hàng</h4>
                    <p className="text-sm font-semibold text-foreground">{selectedOrder.customer_name}</p>
                    {selectedOrder.customer_phone && (
                      <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" />
                        {selectedOrder.customer_phone}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-border p-4 bg-card space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Thanh toán</h4>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
                        <CreditCard className="h-3.5 w-3.5" />
                        Phương thức
                      </span>
                      <span className="text-sm font-medium text-foreground">{getPaymentLabel(selectedOrder.payment_method)}</span>
                    </div>
                    {selectedOrder.loyalty_points_used > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
                          <Star className="h-3.5 w-3.5" />
                          Điểm đã dùng
                        </span>
                        <span className="text-sm font-medium text-foreground">{selectedOrder.loyalty_points_used}</span>
                      </div>
                    )}
                    {selectedOrder.note && (
                      <>
                        <Separator />
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                            <StickyNote className="h-3.5 w-3.5" />
                            Ghi chú
                          </span>
                          <p className="text-sm text-foreground bg-muted/50 rounded-lg px-3 py-2">{selectedOrder.note}</p>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="w-full px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
                      <ReceiptText className="w-4 h-4 text-muted-foreground" />
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Sản phẩm ({selectedOrder.order_items.length})
                      </h4>
                    </div>
                    <div className="divide-y divide-border">
                      {selectedOrder.order_items.map((item) => (
                        <div key={item.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground leading-tight">{item.product_name}</p>
                              {item.classification_labels && item.classification_labels.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {item.classification_labels.map((label, i) => (
                                    <span key={i} className="inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {item.note && <p className="text-xs text-muted-foreground italic mt-1">?? {item.note}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold text-foreground">{formatPrice(item.subtotal)}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.qty} x {formatPrice(item.unit_price)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border-t border-border p-5 space-y-4 bg-card">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Tổng thanh toán</span>
                    <span className="text-xl font-bold text-foreground">{formatPrice(selectedOrder.total_amount)}</span>
                  </div>

                  {selectedOrder.status === "pending" && (
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        variant="outline"
                        className="h-11 rounded-xl"
                        disabled={updateStatus.isPending}
                        onClick={() => updateStatus.mutate({ orderId: selectedOrder.id, status: "cancelled" })}
                      >
                        Đánh dấu hủy
                      </Button>
                      <Button
                        className="h-11 rounded-xl"
                        disabled={updateStatus.isPending}
                        onClick={() => updateStatus.mutate({ orderId: selectedOrder.id, status: "completed" })}
                      >
                        Hoàn thành
                      </Button>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {isRefetching && (
        <div className="fixed right-4 bottom-24 z-40 text-xs px-2 py-1 rounded-md bg-card border border-border text-muted-foreground">
          Đang cập nhật...
        </div>
      )}
    </AppLayout>
  );
}
