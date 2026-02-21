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
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  { label: string; className: string; icon: React.ReactNode }
> = {
  pending: {
    label: "Cho xu ly",
    className: "bg-amber-100 text-amber-700 border-amber-200",
    icon: <Clock3 className="w-3.5 h-3.5" />,
  },
  completed: {
    label: "Hoan thanh",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: <CircleCheckBig className="w-3.5 h-3.5" />,
  },
  cancelled: {
    label: "Da huy",
    className: "bg-rose-100 text-rose-700 border-rose-200",
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

function getStatusMeta(status: string) {
  return (
    STATUS_META[status] || {
      label: status || "Khong xac dinh",
      className: "bg-muted text-muted-foreground border-border",
      icon: <Clock3 className="w-3.5 h-3.5" />,
    }
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

  const counts = useMemo(() => {
    return {
      all: orders.length,
      pending: orders.filter((o) => o.status === "pending").length,
      completed: orders.filter((o) => o.status === "completed").length,
      cancelled: orders.filter((o) => o.status === "cancelled").length,
    };
  }, [orders]);

  return (
    <AppLayout title="Don hang">
      <div className="h-full flex flex-col overflow-hidden">
        <div className="shrink-0 p-4 pb-2 border-b border-border/50 bg-background">
          <div className="relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Tim ma don, ten khach, SDT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl"
            />
          </div>

          <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
            {[
              { key: "all", label: `Tat ca (${counts.all})` },
              { key: "pending", label: `Cho xu ly (${counts.pending})` },
              { key: "completed", label: `Hoan thanh (${counts.completed})` },
              { key: "cancelled", label: `Da huy (${counts.cancelled})` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key as typeof statusFilter)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                  statusFilter === tab.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-4">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center text-muted-foreground">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-sm">Dang tai don hang...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <ClipboardList className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">Chua co don hang</h3>
              <p className="text-sm text-muted-foreground max-w-[260px] mx-auto">
                Don hang se hien thi o day sau khi ban ban hang
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => {
                const meta = getStatusMeta(order.status);
                return (
                  <button
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className="w-full text-left rounded-2xl border border-border bg-card p-3 active:scale-[0.99] transition-transform"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{order.order_number}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {order.customer_name}
                          {order.customer_phone ? ` • ${order.customer_phone}` : ""}
                        </p>
                      </div>
                      <Badge className={`border ${meta.className}`}>
                        <span className="inline-flex items-center gap-1">
                          {meta.icon}
                          {meta.label}
                        </span>
                      </Badge>
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{formatDateTime(order.created_at)}</span>
                      <span className="text-sm font-bold text-primary">{formatPrice(order.total_amount)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Sheet open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <SheetContent
          side="bottom"
          className="inset-x-0 mx-auto w-full max-w-lg rounded-t-3xl h-[80vh] max-h-[80vh] flex flex-col p-0"
        >
          {selectedOrder && (
            <>
              <SheetHeader className="px-4 pt-4 pb-2 border-b border-border/50">
                <SheetTitle className="text-base font-bold text-foreground">Chi tiet don hang</SheetTitle>
                <div className="text-left">
                  <p className="text-sm font-semibold">{selectedOrder.order_number}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(selectedOrder.created_at)}</p>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 space-y-3">
                <div className="rounded-xl border border-border/60 p-3 bg-card space-y-1.5">
                  <p className="text-xs text-muted-foreground">Khach hang</p>
                  <p className="text-sm font-semibold">{selectedOrder.customer_name}</p>
                  {selectedOrder.customer_phone && (
                    <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" />
                      {selectedOrder.customer_phone}
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-border/60 p-3 bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Phuong thuc</span>
                    <span className="text-sm font-medium uppercase">{selectedOrder.payment_method}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Diem da dung</span>
                    <span className="text-sm font-medium">{selectedOrder.loyalty_points_used || 0}</span>
                  </div>
                  {selectedOrder.note && (
                    <div className="pt-1">
                      <p className="text-sm text-muted-foreground">Ghi chu</p>
                      <p className="text-sm">{selectedOrder.note}</p>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border/60 bg-card">
                  <div className="px-3 pt-3 pb-2 text-sm font-semibold inline-flex items-center gap-1.5">
                    <ReceiptText className="w-4 h-4" />
                    San pham
                  </div>
                  <div className="px-3 pb-3 space-y-2">
                    {selectedOrder.order_items.map((item) => (
                      <div key={item.id} className="rounded-lg border border-border/50 px-2.5 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-tight">{item.product_name}</p>
                            {item.classification_labels && item.classification_labels.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {item.classification_labels.join(" · ")}
                              </p>
                            )}
                            {item.note && <p className="text-xs text-muted-foreground italic mt-0.5">?? {item.note}</p>}
                          </div>
                          <p className="text-xs text-muted-foreground whitespace-nowrap">
                            {item.qty} x {formatPrice(item.unit_price)}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-primary mt-1">{formatPrice(item.subtotal)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-border p-4 safe-bottom">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">Tong thanh toan</span>
                  <span className="text-lg font-bold text-foreground">{formatPrice(selectedOrder.total_amount)}</span>
                </div>

                {selectedOrder.status !== "completed" && (
                  <div className="grid grid-cols-2 gap-2">
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
                      Danh dau xong
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
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
