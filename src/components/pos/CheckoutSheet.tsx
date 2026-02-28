import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Banknote,
  CreditCard,
  Star,
  UserPlus,
  ArrowLeft,
  Check,
  QrCode,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CartItem } from "./Cart";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import QrScannerDialog from "@/components/common/QrScannerDialog";

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

function generateTransferContent() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `TTDH${y}${m}${d}${hh}${mm}${ss}`;
}

function sanitizeTransferContent(raw: string) {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function toBase36Chars(input: number, length: number) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let n = Math.abs(input);
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result = alphabet[n % 36] + result;
    n = Math.floor(n / 36);
  }
  return result;
}

function generateCheckoutOrderNumber(seedTimeMs: number) {
  const date = new Date(seedTimeMs);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  // Deterministic "random-like" suffix based on click time.
  const salt = (seedTimeMs ^ (seedTimeMs >>> 7) ^ (seedTimeMs >>> 13)) >>> 0;
  const suffix = toBase36Chars(salt, 3);
  return `000OD${dd}${mm}${yy}${suffix}`;
}

function buildTransferContentFromOrderNumber(orderNumber: string) {
  const afterOD = orderNumber.toUpperCase().split("OD")[1] || "";
  return sanitizeTransferContent(`DH${afterOD}`);
}

type PaymentMethod = "cash" | "transfer";

interface CheckoutSheetProps {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  onSuccess: (orderNumber: string) => void;
  userId: string;
  embedded?: boolean;
}

interface CustomerInfo {
  id: string;
  name: string;
  phone: string;
  loyalty_points: number;
}

interface DraftOrderState {
  id: string;
  orderNumber: string;
  status: string;
  incomeReceiptCode: string | null;
}

type PromoRule = {
  type: "percent" | "fixed";
  value: number;
  maxDiscount?: number;
};

const PROMO_RULES: Record<string, PromoRule> = {
  GIAM10: { type: "percent", value: 10, maxDiscount: 100000 },
  GIAM20: { type: "percent", value: 20, maxDiscount: 150000 },
  GIAM30K: { type: "fixed", value: 30000 },
  GIAM50K: { type: "fixed", value: 50000 },
};

export default function CheckoutSheet({
  open,
  onClose,
  items,
  onSuccess,
  userId,
  embedded = false,
}: CheckoutSheetProps) {
  const VCB_BANK_BIN = "970436";
  const VCB_ACCOUNT_NUMBER = "1036448212";

  const [useLoyalty, setUseLoyalty] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [foundCustomer, setFoundCustomer] = useState<CustomerInfo | null>(null);
  const [searchingCustomer, setSearchingCustomer] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(false);
  const [loyaltyPointsInput, setLoyaltyPointsInput] = useState("0");
  const [ssoCodeInput, setSsoCodeInput] = useState("");

  const [useDiscountCode, setUseDiscountCode] = useState(false);
  const [discountCodeInput, setDiscountCodeInput] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

  const [orderNote, setOrderNote] = useState("");
  const [transferContent, setTransferContent] = useState("");
  const [checkoutSeedTimeMs, setCheckoutSeedTimeMs] = useState<number | null>(null);
  const [draftOrder, setDraftOrder] = useState<DraftOrderState | null>(null);
  const [isPreparingOrder, setIsPreparingOrder] = useState(false);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const latestDraftRef = useRef<DraftOrderState | null>(null);

  const totalPrice = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  // 1 point = 1000 VND
  const pointValue = 1000;

  const normalizedDiscountCode = discountCodeInput.trim().toUpperCase();
  const selectedPromoRule = useDiscountCode ? PROMO_RULES[normalizedDiscountCode] : undefined;
  const discountCodeError =
    useDiscountCode
      ? normalizedDiscountCode === ""
        ? "Bắt buộc"
        : !selectedPromoRule
          ? "Mã không hợp lệ"
          : null
      : null;

  const discountCodeAmount = (() => {
    if (!useDiscountCode || discountCodeError || !selectedPromoRule) return 0;

    if (selectedPromoRule.type === "fixed") {
      return Math.min(totalPrice, selectedPromoRule.value);
    }

    const calculated = Math.floor((totalPrice * selectedPromoRule.value) / 100);
    const capped = selectedPromoRule.maxDiscount
      ? Math.min(calculated, selectedPromoRule.maxDiscount)
      : calculated;

    return Math.min(totalPrice, capped);
  })();

  // Priority: discount code first, then loyalty points.
  const amountAfterDiscountCode = Math.max(0, totalPrice - discountCodeAmount);

  const maxPointsUsable = foundCustomer
    ? Math.min(foundCustomer.loyalty_points, Math.floor(amountAfterDiscountCode / pointValue))
    : 0;

  const loyaltyInputDigits = loyaltyPointsInput.replace(/\D/g, "");
  const loyaltyInputParsed = loyaltyInputDigits ? parseInt(loyaltyInputDigits, 10) : 0;
  const loyaltyPointsError = null;

  const loyaltyPointsToUse = 0;
  const loyaltyDiscount = loyaltyPointsToUse * pointValue;

  const finalAmount = Math.max(0, amountAfterDiscountCode - loyaltyDiscount);
  const normalizedTransferContent = sanitizeTransferContent(transferContent);
  const transferQrUrl = `https://img.vietqr.io/image/${VCB_BANK_BIN}-${VCB_ACCOUNT_NUMBER}-compact2.png?amount=${finalAmount}&addInfo=${encodeURIComponent(normalizedTransferContent)}`;

  const cashReceivedNum = parseInt(cashReceived.replace(/\D/g, ""), 10) || 0;
  const changeAmount = paymentMethod === "cash" ? cashReceivedNum - finalAmount : 0;

  // Points earned: 1 point per 10,000 VND spent
  const pointsEarned = useLoyalty ? Math.floor(finalAmount / 10000) : 0;

  const normalizeLoyaltyInput = (raw: string) => {
    if (raw === "") {
      setLoyaltyPointsInput("");
      return;
    }

    const parsed = parseInt(raw.replace(/\D/g, ""), 10);
    const next = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
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
      setLoyaltyPointsInput("0");
      setSsoCodeInput("");

      setUseDiscountCode(false);
      setDiscountCodeInput("");
      setScannerOpen(false);

      setOrderNote("");
      setTransferContent("");
      setCheckoutSeedTimeMs(null);
      setDraftOrder(null);
      setIsPreparingOrder(false);
      setIsDeletingDraft(false);
    }
  }, [open]);

  useEffect(() => {
    if (open && !checkoutSeedTimeMs) {
      setCheckoutSeedTimeMs(Date.now());
    }
  }, [open, checkoutSeedTimeMs]);

  useEffect(() => {
    setUseLoyaltyPoints(false);
    setLoyaltyPointsInput("0");
  }, [foundCustomer]);

  useEffect(() => {
    if (useLoyalty) return;
    setUseLoyaltyPoints(false);
    setLoyaltyPointsInput("0");
  }, [useLoyalty]);

  const createDraftOrder = async () => {
    if (items.length === 0 || isPreparingOrder || draftOrder) return;

    setIsPreparingOrder(true);
    try {
      const seed = checkoutSeedTimeMs || Date.now();
      const customOrderNumber = generateCheckoutOrderNumber(seed);
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: userId,
          total_amount: finalAmount,
          order_number: "",
          customer_name: "Khách lẻ",
          customer_phone: null,
          payment_method: paymentMethod,
          status: "pending",
          transfer_content: null,
          loyalty_points_used: 0,
          customer_id: null,
          note: null,
        })
        .select("id, order_number, status")
        .single();

      if (orderError) throw orderError;

      const { data: updatedOrder, error: updateOrderError } = await supabase
        .from("orders")
        .update({ order_number: customOrderNumber })
        .eq("id", order.id)
        .eq("status", "pending")
        .select("id, order_number, status, income_receipt_code")
        .single();

      if (updateOrderError) throw updateOrderError;

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

      const transferContentDefault = buildTransferContentFromOrderNumber(updatedOrder.order_number || customOrderNumber);
      setDraftOrder({
        id: updatedOrder.id,
        orderNumber: updatedOrder.order_number,
        status: updatedOrder.status || "pending",
        incomeReceiptCode: updatedOrder.income_receipt_code ?? null,
      });
      setTransferContent(transferContentDefault);
    } catch (error: any) {
      toast.error("Không tạo được đơn tạm: " + (error.message || ""));
    } finally {
      setIsPreparingOrder(false);
    }
  };

  const handleBackToCart = async () => {
    if (!draftOrder || draftOrder.status !== "pending") {
      onClose();
      return;
    }

    setIsDeletingDraft(true);
    try {
      const { error } = await supabase.from("orders").delete().eq("id", draftOrder.id).eq("status", "pending");
      if (error) throw error;
      setDraftOrder(null);
      onClose();
    } catch (error: any) {
      toast.error("Không thể hủy đơn tạm: " + (error.message || ""));
    } finally {
      setIsDeletingDraft(false);
    }
  };

  useEffect(() => {
    if (!open || items.length === 0 || draftOrder || isPreparingOrder) return;
    void createDraftOrder();
  }, [open, items.length, draftOrder, isPreparingOrder]);

  useEffect(() => {
    if (!draftOrder?.id) return;

    const channel = supabase
      .channel(`checkout-order-${draftOrder.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${draftOrder.id}` },
        (payload: any) => {
          const row = payload.new as { status?: string; income_receipt_code?: string | null };
          setDraftOrder((prev) =>
            prev
              ? {
                  ...prev,
                  status: row?.status || prev.status,
                  incomeReceiptCode: row?.income_receipt_code ?? prev.incomeReceiptCode,
                }
              : prev
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [draftOrder?.id]);

  useEffect(() => {
    latestDraftRef.current = draftOrder;
    if (draftOrder?.orderNumber) {
      setTransferContent(buildTransferContentFromOrderNumber(draftOrder.orderNumber));
    }
  }, [draftOrder]);

  useEffect(() => {
    return () => {
      const latest = latestDraftRef.current;
      if (latest?.id && latest.status === "pending") {
        void supabase.from("orders").delete().eq("id", latest.id).eq("status", "pending");
      }
    };
  }, []);

  useEffect(() => {
    if (!draftOrder?.id || !open) return;

    const timer = setTimeout(async () => {
      const payload = {
        total_amount: finalAmount,
        payment_method: paymentMethod,
        transfer_content: paymentMethod === "transfer" ? normalizedTransferContent : null,
        note: orderNote || null,
        customer_name: useLoyalty && customerName.trim() ? customerName.trim() : "Khách lẻ",
        customer_phone: useLoyalty ? customerPhone.trim() || null : null,
        loyalty_points_used: useLoyaltyPoints ? loyaltyPointsToUse : 0,
      };

      await supabase.from("orders").update(payload).eq("id", draftOrder.id).eq("status", "pending");
    }, 350);

    return () => clearTimeout(timer);
  }, [
    open,
    draftOrder?.id,
    finalAmount,
    paymentMethod,
    normalizedTransferContent,
    orderNote,
    useLoyalty,
    customerName,
    customerPhone,
    useLoyaltyPoints,
    loyaltyPointsToUse,
  ]);

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
    if (items.length === 0 || !draftOrder) return;

    if (useLoyalty && (!customerName.trim() || !customerPhone.trim())) {
      toast.error("Vui lòng nhập tên và SĐT khách hàng");
      return;
    }

    if (paymentMethod === "transfer" && !draftOrder.incomeReceiptCode) {
      toast.error("Đơn chưa nhận được phiếu thu từ giao dịch ngân hàng");
      return;
    }

    if (paymentMethod === "cash" && cashReceivedNum < finalAmount) {
      toast.error("Số tiền nhận chưa đủ");
      return;
    }

    if (useDiscountCode && discountCodeError) {
      toast.error("Mã giảm giá không hợp lệ");
      return;
    }

    if (useLoyaltyPoints && loyaltyPointsError) {
      toast.error("Số điểm dùng không hợp lệ");
      return;
    }

    setIsSubmitting(true);
    try {
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
          const { data: newCustomer, error: customerError } = await supabase
            .from("customers")
            .insert({
              name: customerName,
              phone: customerPhone,
              loyalty_points: pointsEarned,
            })
            .select("id")
            .single();

          if (customerError) throw customerError;
          customerId = newCustomer.id;
        }
      }

      let incomeReceiptCode = draftOrder.incomeReceiptCode;

      if (paymentMethod === "cash" && !incomeReceiptCode) {
        const { data: createdIncomeCode, error: incomeError } = await (supabase as any).rpc("create_income_voucher", {
          p_amount: finalAmount,
          p_payment_method: "cash",
          p_payment_content: null,
          p_order_id: draftOrder.id,
          p_order_number: draftOrder.orderNumber,
          p_income_type: "cash",
          p_created_at: new Date().toISOString(),
          p_transaction_id: null,
        });

        if (incomeError) throw incomeError;
        incomeReceiptCode = String(createdIncomeCode || "");
      }

      if (!incomeReceiptCode) {
        toast.error("Chưa tạo được phiếu thu");
        return;
      }

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .update({
          total_amount: finalAmount,
          customer_name: useLoyalty ? customerName : "Khách lẻ",
          customer_phone: useLoyalty ? customerPhone : null,
          payment_method: paymentMethod,
          status: "completed",
          income_receipt_code: incomeReceiptCode,
          income_recorded_at: new Date().toISOString(),
          transfer_content: paymentMethod === "transfer" ? normalizedTransferContent : null,
          loyalty_points_used: useLoyaltyPoints ? loyaltyPointsToUse : 0,
          customer_id: customerId,
          note: orderNote || null,
        })
        .eq("id", draftOrder.id)
        .select("id, order_number, status")
        .single();

      if (orderError) throw orderError;

      onSuccess(order.order_number);
    } catch (error: any) {
      toast.error("Lỗi khi xác nhận đơn hàng: " + (error.message || ""));
    } finally {
      setIsSubmitting(false);
    }
  };

  const paymentMethods: Array<{ key: PaymentMethod; label: string; icon: React.ReactNode }> = [
    { key: "cash", label: "Tiền mặt", icon: <Banknote className="w-4 h-4" /> },
    { key: "transfer", label: "Chuyển khoản", icon: <CreditCard className="w-4 h-4" /> },
  ];

  const transferReceiptReady = paymentMethod === "transfer" && !!draftOrder?.incomeReceiptCode;

  const canSubmit =
    !!draftOrder &&
    !isPreparingOrder &&
    !isDeletingDraft &&
    !isSubmitting &&
    (transferReceiptReady
      ? true
      : (paymentMethod !== "cash" || cashReceivedNum >= finalAmount) &&
        (!useDiscountCode || !discountCodeError) &&
        (!useLoyaltyPoints || !loyaltyPointsError));

  const panelContent = (
    <>
        <SheetHeader className="px-4 pt-4 pb-2">
          <div className="grid grid-cols-[32px_1fr_32px] items-center">
          <button
            onClick={() => void handleBackToCart()}
            disabled={isDeletingDraft || isSubmitting}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <SheetTitle className="text-base font-bold h-8 flex items-center justify-center leading-none">
            Thanh toán
          </SheetTitle>
            <div className="w-8 h-8" aria-hidden />
          </div>
        </SheetHeader>

        {draftOrder?.orderNumber && (
          <div className="px-4 pb-2 text-xs text-muted-foreground">Mã đơn tạm: {draftOrder.orderNumber}</div>
        )}

        {isPreparingOrder && (
          <div className="px-4 pb-2 text-xs text-muted-foreground">Đang tạo đơn tạm...</div>
        )}

        <div className="flex-1 px-4 overflow-y-auto no-scrollbar">
          <div className="space-y-4 pb-4 pt-1">
            {/* 1. Loyalty account */}
            <div className="space-y-2">
              <button
                onClick={() => setUseLoyalty((prev) => !prev)}
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
                    {searchingCustomer && <span className="text-xs text-muted-foreground self-center">Đang tìm...</span>}
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

            {/* 2. Discount and points */}
            <div className="space-y-2">
              <div className={cn("grid gap-2", useLoyalty ? "grid-cols-2" : "grid-cols-1")}>
                <button
                  onClick={() => {
                    const next = !useDiscountCode;
                    setUseDiscountCode(next);
                    if (!next) setDiscountCodeInput("");
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-colors text-sm font-medium",
                    useDiscountCode
                      ? "bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400"
                      : "bg-card border-border text-muted-foreground"
                  )}
                >
                  <CreditCard className="w-4 h-4" />
                  Dùng mã giảm giá
                  {useDiscountCode && <Check className="w-4 h-4 ml-auto" />}
                </button>

                {useLoyalty && (
                  <button
                    onClick={() => {
                      if (!foundCustomer || foundCustomer.loyalty_points <= 0) return;
                      const next = !useLoyaltyPoints;
                      setUseLoyaltyPoints(next);
                      if (next) {
                        setLoyaltyPointsInput(String(maxPointsUsable));
                      } else {
                        setLoyaltyPointsInput("0");
                      }
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-colors text-sm font-medium",
                      useLoyaltyPoints
                        ? "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-400"
                        : "bg-card border-border text-muted-foreground",
                      (!foundCustomer || foundCustomer.loyalty_points <= 0) && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    <Star className="w-4 h-4" />
                    Dùng điểm
                    {useLoyaltyPoints && <Check className="w-4 h-4 ml-auto" />}
                  </button>
                )}
              </div>

              {(useDiscountCode || useLoyaltyPoints) && (
                <div
                  className={cn(
                    "pl-2 grid gap-2",
                    useDiscountCode && useLoyaltyPoints ? "grid-cols-2" : "grid-cols-1"
                  )}
                >
                  {useDiscountCode && (
                    <div className="space-y-1">
                      <div className="relative">
                        <Input
                          value={discountCodeInput}
                          onChange={(e) => setDiscountCodeInput(e.target.value.toUpperCase())}
                          placeholder="Nhập mã giảm giá"
                          className={cn(
                            "h-9 rounded-lg text-sm w-full uppercase pr-10",
                            discountCodeError && "border-destructive focus-visible:ring-destructive"
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => setScannerOpen(true)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground p-1"
                          aria-label="Quét QR hoặc barcode mã giảm giá"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                      </div>

                      {discountCodeError ? (
                        <span className="text-xs text-destructive">{discountCodeError}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">= giảm {formatPrice(discountCodeAmount)}</span>
                      )}
                    </div>
                  )}

                  {useLoyaltyPoints && (
                    <div className="space-y-1">
                      <Input
                        value={ssoCodeInput}
                        onChange={(e) => setSsoCodeInput(e.target.value.toUpperCase())}
                        placeholder="Nhập mã SSO"
                        className="h-9 rounded-lg text-sm w-full border-border bg-background focus-visible:ring-1 focus-visible:ring-primary/40"
                      />

                      {loyaltyPointsError ? (
                        <span className="text-xs text-destructive">{loyaltyPointsError}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">= giảm {formatPrice(loyaltyDiscount)}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. Order note (moved above payment method) */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground">Ghi chú đơn hàng</p>
              <Textarea
                placeholder="Ghi chú cho đơn hàng..."
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                className="min-h-[60px] rounded-lg text-sm resize-none"
              />
            </div>

            {/* 4. Payment method */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Phương thức thanh toán</p>
              <div className="grid grid-cols-2 gap-2">
                {paymentMethods.map((payment) => (
                  (() => {
                    const lockCashAfterTransferCompleted =
                      payment.key === "cash" &&
                      paymentMethod === "transfer" &&
                      !!draftOrder?.incomeReceiptCode;

                    return (
                  <button
                    key={payment.key}
                    onClick={() => {
                      if (lockCashAfterTransferCompleted) return;
                      setPaymentMethod(payment.key);
                    }}
                    disabled={lockCashAfterTransferCompleted}
                    className={cn(
                      "flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-colors",
                      paymentMethod === payment.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border",
                      lockCashAfterTransferCompleted && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {payment.icon}
                    {payment.label}
                  </button>
                    );
                  })()
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
                      <span
                        className={cn(
                          "font-extrabold",
                          changeAmount >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"
                        )}
                      >
                        {changeAmount >= 0 ? formatPrice(changeAmount) : "Chưa đủ"}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === "transfer" && (
                <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                  <div className="space-y-0.5 text-xs">
                    <p className="text-muted-foreground">Ngân hàng</p>
                    <p className="font-semibold text-foreground">Vietcombank (VCB) - STK {VCB_ACCOUNT_NUMBER}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Nội dung chuyển khoản</p>
                    <Input
                      value={transferContent}
                      readOnly
                      className="h-9 rounded-lg text-sm"
                    />
                  </div>

                  <div className="rounded-lg border border-border bg-background p-2">
                    <img
                      src={transferQrUrl}
                      alt="QR chuyển khoản Vietcombank"
                      className="mx-auto h-52 w-52 rounded-md object-contain"
                      loading="lazy"
                    />
                  </div>

                  <div
                    className={cn(
                      "rounded-lg border px-2.5 py-2 text-xs",
                      draftOrder?.incomeReceiptCode
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                        : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                    )}
                  >
                    {draftOrder?.incomeReceiptCode
                      ? "Đã nhận tiền từ ngân hàng. Có thể xác nhận thanh toán."
                      : "Hệ thống chờ thanh toán"}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="border-t border-border p-4 safe-bottom space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Tổng cộng</span>
            <span className="text-foreground font-semibold">{formatPrice(totalPrice)}</span>
          </div>

          {discountCodeAmount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Mã giảm giá</span>
              <span className="text-orange-600 dark:text-orange-400 font-semibold">-{formatPrice(discountCodeAmount)}</span>
            </div>
          )}

          {loyaltyDiscount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Giảm điểm</span>
              <span className="inline-flex items-center gap-1 text-yellow-600 dark:text-yellow-400 font-semibold">
                <Star className="w-4 h-4 fill-yellow-600 text-yellow-600 dark:fill-yellow-400 dark:text-yellow-400" />
                -{formatPrice(loyaltyDiscount)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-base font-bold text-foreground">Thanh toán</span>
            <span className="text-base font-bold text-foreground">{formatPrice(finalAmount)}</span>
          </div>

          {(paymentMethod !== "transfer" || draftOrder?.incomeReceiptCode) && (
            <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full h-12 rounded-xl text-base font-bold">
              {isSubmitting ? "Đang xử lý..." : "Xác nhận thanh toán"}
            </Button>
          )}

          {paymentMethod === "transfer" && !draftOrder?.incomeReceiptCode && (
            <div className="h-12 rounded-xl border border-border bg-muted/40 flex items-center justify-center text-sm text-muted-foreground font-medium">
              Chờ thanh toán
            </div>
          )}
        </div>
    </>
  );

  if (embedded) {
    return (
      <>
        <div className="h-full flex flex-col">{panelContent}</div>
        <QrScannerDialog
          open={scannerOpen}
          onOpenChange={setScannerOpen}
          onDetected={(code) => {
            setDiscountCodeInput(code.toUpperCase());
            setUseDiscountCode(true);
          }}
          title="Quét mã giảm giá"
        />
      </>
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          void handleBackToCart();
        }
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="inset-x-0 mx-auto w-full max-w-lg rounded-t-3xl h-[75vh] max-h-[75vh] flex flex-col p-0"
      >
        {panelContent}
      </SheetContent>

      <QrScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={(code) => {
          setDiscountCodeInput(code.toUpperCase());
          setUseDiscountCode(true);
        }}
        title="Quét mã giảm giá"
      />
    </Sheet>
  );
}
