import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Banknote,
  CreditCard,
  Smartphone,
  Star,
  UserPlus,
  ArrowLeft,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CartItem } from "./Cart";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

function formatPrice(price: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatNumberWithDots(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 0,
  }).format(value);
}

type PaymentMethod = "cash" | "transfer" | "momo";

interface CheckoutSheetProps {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  onSuccess: (orderNumber: string) => void;
  userId: string;
}

interface CustomerInfo {
  id: string;
  name: string;
  phone: string;
  loyalty_points: number;
}

export default function CheckoutSheet({
  open,
  onClose,
  items,
  onSuccess,
  userId,
}: CheckoutSheetProps) {
  const [useLoyalty, setUseLoyalty] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [foundCustomer, setFoundCustomer] = useState<CustomerInfo | null>(null);
  const [searchingCustomer, setSearchingCustomer] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(false);
  const [loyaltyPointsToUse, setLoyaltyPointsToUse] = useState(0);
  const [loyaltyPointsInput, setLoyaltyPointsInput] = useState("0");
  const [orderNote, setOrderNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalPrice = items.reduce((s, i) => s + i.price * i.qty, 0);

  // 1 point = 1000 VND
  const pointValue = 1000;
  const maxPointsUsable = foundCustomer
    ? Math.min(foundCustomer.loyalty_points, Math.floor(totalPrice / pointValue))
    : 0;
  const loyaltyDiscount = useLoyaltyPoints ? loyaltyPointsToUse * pointValue : 0;
  const finalAmount = totalPrice - loyaltyDiscount;

  const cashReceivedNum = parseInt(cashReceived.replace(/\D/g, ""), 10) || 0;
  const changeAmount = paymentMethod === "cash" ? cashReceivedNum - finalAmount : 0;

  // Points earned: 1 point per 10,000 VND spent
  const pointsEarned = useLoyalty ? Math.floor(finalAmount / 10000) : 0;

  const clampLoyaltyPoints = (value: number) => Math.min(maxPointsUsable, Math.max(0, value));

  const normalizeLoyaltyInput = (raw: string) => {
    if (raw === "") {
      setLoyaltyPointsInput("");
      setLoyaltyPointsToUse(0);
      return;
    }

    const parsed = parseInt(raw.replace(/\D/g, ""), 10);
    const next = Number.isNaN(parsed) ? 0 : clampLoyaltyPoints(parsed);
    setLoyaltyPointsToUse(next);
    setLoyaltyPointsInput(String(next));
  };

  const handleCashReceivedChange = (rawValue: string) => {
    const digits = rawValue.replace(/\D/g, "");
    if (!digits) {
      setCashReceived("");
      return;
    }

    const parsed = parseInt(digits, 10);
    if (Number.isNaN(parsed)) {
      setCashReceived("");
      return;
    }

    setCashReceived(formatNumberWithDots(parsed));
  };

  useEffect(() => {
    if (!open) {
      setUseLoyalty(false);
      setCustomerName("");
      setCustomerPhone("");
      setFoundCustomer(null);
      setPaymentMethod("cash");
      setCashReceived("");
      setUseLoyaltyPoints(false);
      setLoyaltyPointsToUse(0);
      setLoyaltyPointsInput("0");
      setOrderNote("");
    }
  }, [open]);

  useEffect(() => {
    setLoyaltyPointsToUse(0);
    setUseLoyaltyPoints(false);
    setLoyaltyPointsInput("0");
  }, [foundCustomer]);

  const searchCustomer = async () => {
    if (!customerPhone || customerPhone.length < 9) return;
    setSearchingCustomer(true);
    try {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .eq("phone", customerPhone)
        .maybeSingle();

      if (data) {
        setFoundCustomer(data);
        setCustomerName(data.name);
      } else {
        setFoundCustomer(null);
      }
    } finally {
      setSearchingCustomer(false);
    }
  };

  const handleSubmit = async () => {
    if (items.length === 0) return;

    if (useLoyalty && (!customerName.trim() || !customerPhone.trim())) {
      toast.error("Vui lòng nhập tên và SĐT khách hàng");
      return;
    }

    if (paymentMethod === "cash" && cashReceivedNum < finalAmount) {
      toast.error("Số tiền nhận chưa đủ");
      return;
    }

    setIsSubmitting(true);
    try {
      // Upsert customer if loyalty
      let customerId: string | null = null;
      if (useLoyalty) {
        if (foundCustomer) {
          customerId = foundCustomer.id;
          const newPoints =
            foundCustomer.loyalty_points - (useLoyaltyPoints ? loyaltyPointsToUse : 0) + pointsEarned;

          await supabase
            .from("customers")
            .update({
              loyalty_points: newPoints,
              name: customerName,
            })
            .eq("id", foundCustomer.id);
        } else {
          const { data: newCust, error: custErr } = await supabase
            .from("customers")
            .insert({
              name: customerName,
              phone: customerPhone,
              loyalty_points: pointsEarned,
            })
            .select("id")
            .single();

          if (custErr) throw custErr;
          customerId = newCust.id;
        }
      }

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: userId,
          total_amount: finalAmount,
          order_number: "",
          customer_name: useLoyalty ? customerName : "Khách lẻ",
          customer_phone: useLoyalty ? customerPhone : null,
          payment_method: paymentMethod,
          loyalty_points_used: useLoyaltyPoints ? loyaltyPointsToUse : 0,
          customer_id: customerId,
          note: orderNote || null,
        })
        .select("id, order_number")
        .single();

      if (orderError) throw orderError;

      const orderItems = items.map((item) => ({
        order_id: order.id,
        product_id: item.productId,
        product_name: item.name,
        unit_price: item.price,
        qty: item.qty,
        subtotal: item.price * item.qty,
        classification_labels: item.classificationLabels,
        note: item.note || null,
      }));

      const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
      if (itemsError) throw itemsError;

      onSuccess(order.order_number);
    } catch (err: any) {
      toast.error("Lỗi khi tạo đơn hàng: " + (err.message || ""));
    } finally {
      setIsSubmitting(false);
    }
  };

  const paymentMethods: { key: PaymentMethod; label: string; icon: React.ReactNode }[] = [
    { key: "cash", label: "Tiền mặt", icon: <Banknote className="w-4 h-4" /> },
    { key: "transfer", label: "Chuyển khoản", icon: <CreditCard className="w-4 h-4" /> },
    { key: "momo", label: "MoMo", icon: <Smartphone className="w-4 h-4" /> },
  ];

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-2 flex-row items-center gap-2">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <SheetTitle className="text-base font-bold text-foreground flex-1">Thanh toán</SheetTitle>
          <span className="text-sm font-bold text-primary">{formatPrice(totalPrice)}</span>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4">
          <div className="space-y-4 pb-4">
            {/* 1. Loyalty / Tích điểm */}
            <div className="space-y-2">
              <button
                onClick={() => setUseLoyalty(!useLoyalty)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-colors text-sm font-medium",
                  useLoyalty
                    ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400"
                    : "bg-card border-border text-muted-foreground"
                )}
              >
                <Star className={cn("w-4 h-4", useLoyalty && "fill-amber-400 text-amber-400")} />
                Tích điểm
                {useLoyalty && <Check className="w-4 h-4 ml-auto" />}
              </button>

              {useLoyalty && (
                <div className="space-y-2 pl-2">
                  <Input
                    placeholder="Tên khách hàng"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="h-9 rounded-lg text-sm"
                  />
                  <div className="flex gap-2">
                    <Input
                      placeholder="Số điện thoại"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      onBlur={searchCustomer}
                      className="h-9 rounded-lg text-sm flex-1"
                    />
                    {searchingCustomer && (
                      <span className="text-xs text-muted-foreground self-center">Đang tìm...</span>
                    )}
                  </div>
                  {foundCustomer && (
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted text-xs">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span className="text-foreground font-medium">{foundCustomer.name}</span>
                      <Badge variant="secondary" className="text-[10px] ml-auto">
                        {foundCustomer.loyalty_points} điểm
                      </Badge>
                    </div>
                  )}
                  {!foundCustomer && customerPhone.length >= 9 && !searchingCustomer && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <UserPlus className="w-3 h-3" /> Khách hàng mới, sẽ tạo tài khoản tự động
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 2. Loyalty points usage (moved above payment method) */}
            {useLoyalty && foundCustomer && foundCustomer.loyalty_points > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => {
                    const next = !useLoyaltyPoints;
                    setUseLoyaltyPoints(next);
                    if (next) {
                      setLoyaltyPointsToUse(maxPointsUsable);
                      setLoyaltyPointsInput(String(maxPointsUsable));
                    } else {
                      setLoyaltyPointsToUse(0);
                      setLoyaltyPointsInput("0");
                    }
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-colors text-sm font-medium",
                    useLoyaltyPoints
                      ? "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400"
                      : "bg-card border-border text-muted-foreground"
                  )}
                >
                  <Star className="w-4 h-4" />
                  Dùng điểm tích lũy ({foundCustomer.loyalty_points} điểm)
                  {useLoyaltyPoints && <Check className="w-4 h-4 ml-auto" />}
                </button>

                {useLoyaltyPoints && (
                  <div className="flex items-center gap-2 pl-2">
                    <Input
                      type="number"
                      min={0}
                      max={maxPointsUsable}
                      value={loyaltyPointsInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setLoyaltyPointsInput(raw);
                        if (raw === "") {
                          setLoyaltyPointsToUse(0);
                          return;
                        }
                        const parsed = parseInt(raw.replace(/\D/g, ""), 10);
                        setLoyaltyPointsToUse(Number.isNaN(parsed) ? 0 : clampLoyaltyPoints(parsed));
                      }}
                      onBlur={() => normalizeLoyaltyInput(loyaltyPointsInput)}
                      className="h-9 rounded-lg text-sm w-24"
                    />
                    <span className="text-xs text-muted-foreground">
                      = giảm {formatPrice(loyaltyPointsToUse * pointValue)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* 3. Payment method */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Phương thức thanh toán</p>
              <div className="grid grid-cols-3 gap-2">
                {paymentMethods.map((pm) => (
                  <button
                    key={pm.key}
                    onClick={() => setPaymentMethod(pm.key)}
                    className={cn(
                      "flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-colors",
                      paymentMethod === pm.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border"
                    )}
                  >
                    {pm.icon}
                    {pm.label}
                  </button>
                ))}
              </div>

              {paymentMethod === "cash" && (
                <div className="space-y-1.5">
                  <Input
                    placeholder="Tiền nhận từ khách"
                    value={cashReceived}
                    onChange={(e) => handleCashReceivedChange(e.target.value)}
                    className="h-9 rounded-lg text-sm"
                    inputMode="numeric"
                  />
                  {cashReceivedNum > 0 && (
                    <div className="flex items-center justify-between px-2 py-1.5 rounded-lg border text-sm bg-emerald-50/80 border-emerald-200 dark:bg-emerald-950/35 dark:border-emerald-800">
                      <span className="font-medium text-foreground">Tiền thối</span>
                      <span className={cn("font-extrabold", changeAmount >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
                        {changeAmount >= 0 ? formatPrice(changeAmount) : "Chưa đủ"}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 4. Order note */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground">Ghi chú đơn hàng</p>
              <Textarea
                placeholder="Ghi chú cho đơn hàng..."
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                className="min-h-[60px] rounded-lg text-sm resize-none"
              />
            </div>
          </div>
        </ScrollArea>

        {/* Summary & Submit */}
        <div className="border-t border-border p-4 safe-bottom space-y-2">
          {loyaltyDiscount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Giảm điểm</span>
              <span className="text-green-600 font-medium">-{formatPrice(loyaltyDiscount)}</span>
            </div>
          )}
          {pointsEarned > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Điểm tích lũy</span>
              <span className="text-amber-500 font-medium">+{pointsEarned} điểm</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Thanh toán</span>
            <span className="text-lg font-bold text-foreground">{formatPrice(finalAmount)}</span>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full h-12 rounded-xl text-base font-bold"
          >
            {isSubmitting ? "Đang xử lý..." : "Xác nhận thanh toán"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
