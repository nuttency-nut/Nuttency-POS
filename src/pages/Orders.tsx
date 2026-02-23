import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  Clock3,
  CircleCheckBig,
  CircleX,
  Search,
  Phone,
  ReceiptText,
  Package,
  TrendingUp,
  Calendar,
  CreditCard,
  StickyNote,
  ChevronRight,
  Star,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    variant: "default" | "secondary" | "destructive" | "outline";
    dotColor: string;
    icon: React.ReactNode;
  }
> = {
  pending: {
    label: "Cho xu ly",
    variant: "outline",
    dotColor: "bg-amber-500",
    icon: <Clock3 className="w-3.5 h-3.5" />,
  },
  completed: {
    label: "Hoan thanh",
    variant: "default",
    dotColor: "bg-emerald-500",
    icon: <CircleCheckBig className="w-3.5 h-3.5" />,
  },
  cancelled: {
    label: "Da huy",
    variant: "destructive",
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
      label: status || "Khong xac dinh",
      variant: "secondary" as const,
      dotColor: "bg-muted-foreground",
      icon: <Clock3 className="w-3.5 h-3.5" />,
    }
  );
}

function getPaymentLabel(method: string) {
  switch (method) {
    case "cash":
      return "Tien mat";
    case "transfer":
      return "Chuyen khoan";
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
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 min-w-[140px]">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-base sm:text-lg font-bold text-foreground leading-tight">{value}</p>
      </div>
    </div>
  );
}

export default function Orders() {
  const queryClient = useQueryClient();
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
      toast.success("Da cap nhat trang thai don hang");
    },
    onError: (error: Error) => {
      toast.error(`Cap nhat trang thai that bai: ${error.message}`);
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
    { key: "all" as const, label: "Tat ca", count: counts.all },
    { key: "pending" as const, label: "Cho xu ly", count: counts.pending },
    { key: "completed" as const, label: "Hoan thanh", count: counts.completed },
    { key: "cancelled" as const, label: "Da huy", count: counts.cancelled },
  ];

  return (
    <AppLayout title="Don hang">
      <div className="h-full overflow-y-auto no-scrollbar p-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            label="Tong don"
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
            label="Cho xu ly"
            value={counts.pending.toString()}
            icon={<Clock3 className="h-5 w-5 text-amber-700" />}
            accent="bg-amber-100"
          />
          <SummaryCard
            label="Da huy"
            value={counts.cancelled.toString()}
            icon={<CircleX className="h-5 w-5 text-rose-700" />}
            accent="bg-rose-100"
          />
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Tim ma don, ten khach, SDT..."
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
            <p className="text-sm">Dang tai don hang...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <ClipboardList className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">Chua co don hang</h3>
            <p className="text-sm text-muted-foreground max-w-[280px] mx-auto">
              Don hang se hien thi o day sau khi ban ban hang
            </p>
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-0 sm:rounded-xl sm:border sm:border-border sm:bg-card sm:shadow-sm sm:overflow-hidden">
            <div className="hidden sm:grid sm:grid-cols-[1fr_120px_120px_120px_100px_32px] sm:gap-3 sm:px-4 sm:py-3 sm:border-b sm:border-border sm:bg-muted/50 sm:text-xs sm:font-medium sm:text-muted-foreground sm:uppercase sm:tracking-wider">
              <span>Don hang</span>
              <span>Thoi gian</span>
              <span>Thanh toan</span>
              <span className="text-right">Tong tien</span>
              <span className="text-center">Trang thai</span>
              <span />
            </div>

            {filteredOrders.map((order) => {
              const meta = getStatusMeta(order.status);
              return (
                <button
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="w-full text-left transition-colors hover:bg-accent/50 active:scale-[0.995] rounded-xl border border-border bg-card p-4 shadow-sm sm:rounded-none sm:border-0 sm:border-b sm:border-border sm:shadow-none sm:last:border-b-0 sm:grid sm:grid-cols-[1fr_120px_120px_120px_100px_32px] sm:items-center sm:gap-3 sm:px-4 sm:py-3.5"
                >
                  <div className="flex items-start justify-between sm:block">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{order.order_number}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        {order.customer_name}
                        {order.customer_phone && (
                          <>
                            <span className="text-border">.</span>
                            {order.customer_phone}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="sm:hidden">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border ${
                          order.status === "pending"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : order.status === "completed"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dotColor}`} />
                        {meta.label}
                      </span>
                    </div>
                  </div>

                  <div className="hidden sm:block">
                    <p className="text-sm text-foreground">{formatTime(order.created_at)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString("vi-VN")}</p>
                  </div>

                  <div className="hidden sm:block">
                    <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                      <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                      {getPaymentLabel(order.payment_method)}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between sm:mt-0 sm:block sm:text-right">
                    <span className="text-xs text-muted-foreground sm:hidden">{formatDateTime(order.created_at)}</span>
                    <span className="text-sm font-bold text-foreground">{formatPrice(order.total_amount)}</span>
                  </div>

                  <div className="hidden sm:flex sm:justify-center">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border ${
                        order.status === "pending"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : order.status === "completed"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotColor}`} />
                      {meta.label}
                    </span>
                  </div>

                  <div className="hidden sm:flex sm:justify-end">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Sheet open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <SheetContent side="left" className="w-[92vw] sm:max-w-md p-0 flex flex-col">
          {selectedOrder && (() => {
            const meta = getStatusMeta(selectedOrder.status);
            return (
              <>
                <SheetHeader className="px-5 pt-5 pb-4 border-b border-border space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <SheetTitle className="text-lg font-bold text-foreground">{selectedOrder.order_number}</SheetTitle>
                      <p className="text-sm text-muted-foreground mt-0.5 inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDateTime(selectedOrder.created_at)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold border ${
                        selectedOrder.status === "pending"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : selectedOrder.status === "completed"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                      }`}
                    >
                      {meta.icon}
                      {meta.label}
                    </span>
                  </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-4 space-y-4">
                  <div className="rounded-xl border border-border p-4 bg-card space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Khach hang</h4>
                    <p className="text-sm font-semibold text-foreground">{selectedOrder.customer_name}</p>
                    {selectedOrder.customer_phone && (
                      <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" />
                        {selectedOrder.customer_phone}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-border p-4 bg-card space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Thanh toan</h4>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
                        <CreditCard className="h-3.5 w-3.5" />
                        Phuong thuc
                      </span>
                      <span className="text-sm font-medium text-foreground">{getPaymentLabel(selectedOrder.payment_method)}</span>
                    </div>
                    {selectedOrder.loyalty_points_used > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
                          <Star className="h-3.5 w-3.5" />
                          Diem da dung
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
                            Ghi chu
                          </span>
                          <p className="text-sm text-foreground bg-muted/50 rounded-lg px-3 py-2">{selectedOrder.note}</p>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-4 py-3 border-b border-border bg-muted/30 inline-flex items-center gap-2">
                      <ReceiptText className="w-4 h-4 text-muted-foreground" />
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        San pham ({selectedOrder.order_items.length})
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
                              {item.note && <p className="text-xs text-muted-foreground italic mt-1">Note: {item.note}</p>}
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
                    <span className="text-sm font-medium text-muted-foreground">Tong thanh toan</span>
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
                        Danh dau huy
                      </Button>
                      <Button
                        className="h-11 rounded-xl"
                        disabled={updateStatus.isPending}
                        onClick={() => updateStatus.mutate({ orderId: selectedOrder.id, status: "completed" })}
                      >
                        Hoan thanh
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
          Dang cap nhat...
        </div>
      )}
    </AppLayout>
  );
}
