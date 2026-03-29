import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { BadgeCheck, Info, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BANK_ACCOUNT_NUMBER, BANK_BIN, BANK_NAME } from "@/lib/bank";

type DisplayItem = {
  id: string;
  name: string;
  detail?: string;
  qty: number;
  price: number;
  lineTotal: number;
  image?: string | null;
};

type PromotionMediaType = "image" | "video";

type DisplayPayload = {
  store?: {
    warehouseCode?: string;
    displayName?: string;
  };
  cashierName?: string;
  status?: string;
  items?: DisplayItem[];
  customer?: {
    name?: string;
    phone?: string | null;
    loyaltyPoints?: number;
    loyaltyPointsUsed?: number;
  };
  discount?: {
    code?: string | null;
    amount?: number;
  };
  loyalty?: {
    pointsUsed?: number;
    discountAmount?: number;
  };
  payment?: {
    method?: "cash" | "transfer" | null;
    cashReceived?: number | null;
    change?: number | null;
    transferContent?: string | null;
  };
  totals?: {
    subtotal?: number;
    discount?: number;
    total?: number;
  };
  updatedAt?: string;
};

const PROMOTIONS = [
  {
    id: "promo-1",
    tag: "Ưu đãi hôm nay",
    title: "Giảm bình giữ nhiệt",
    description: "Giảm 50% cho các bình giữ nhiệt trong BST MITMATCHES.",
    mediaType: "image" as PromotionMediaType,
    mediaUrl:
      "https://bizweb.dktcdn.net/thumb/1024x1024/100/487/455/products/19.png?v=1759752198957",
    image:
      "https://bizweb.dktcdn.net/thumb/1024x1024/100/487/455/products/19.png?v=1759752198957",
  },
  {
    id: "promo-2",
    tag: "Giá mới",
    title: "PHIN DI",
    description: "Ưu đãi giá tốt cho cà phê việt.",
    mediaType: "image" as PromotionMediaType,
    mediaUrl:
      "https://bizweb.dktcdn.net/thumb/grande/100/487/455/products/hco-7821-espresso-launch-dc-banner-latte-thumbnail-1-1772698527772.jpg?v=1772698530773",
    image:
      "https://bizweb.dktcdn.net/thumb/grande/100/487/455/products/hco-7821-espresso-launch-dc-banner-latte-thumbnail-1-1772698527772.jpg?v=1772698530773",
  },
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);

export default function CustomerDisplay() {
  const { warehouseCode } = useParams();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string>("");
  const [displayPayload, setDisplayPayload] = useState<DisplayPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!warehouseCode) return;
    let mounted = true;

    const loadStore = async () => {
      setLoading(true);
      const { data: storeRow } = await supabase
        .from("store_definitions")
        .select("id,display_name,warehouse_code")
        .eq("warehouse_code", warehouseCode)
        .maybeSingle();

      if (!mounted) return;

      if (!storeRow?.id) {
        setStoreId(null);
        setStoreName("");
        setDisplayPayload(null);
        setLoading(false);
        return;
      }

      setStoreId(String(storeRow.id));
      setStoreName(String(storeRow.display_name ?? ""));

      const { data: stateRow } = await supabase
        .from("customer_display_states")
        .select("payload")
        .eq("store_id", storeRow.id)
        .maybeSingle();

      if (!mounted) return;
      setDisplayPayload((stateRow?.payload as DisplayPayload) ?? null);
      setLoading(false);
    };

    void loadStore();

    return () => {
      mounted = false;
    };
  }, [warehouseCode]);

  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`customer-display-state-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customer_display_states", filter: `store_id=eq.${storeId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setDisplayPayload(null);
            return;
          }
          const row = payload.new as { payload?: DisplayPayload } | null;
          setDisplayPayload(row?.payload ?? null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [storeId]);

  const displayItems = displayPayload?.items ?? [];
  const subtotal = useMemo(
    () => displayItems.reduce((acc, item) => acc + item.price * item.qty, 0),
    [displayItems]
  );
  const discount = displayPayload?.totals?.discount ?? 0;
  const total = Math.max(
    displayPayload?.totals?.total ?? subtotal - discount,
    0
  );
  const customerName = displayPayload?.customer?.name?.trim() || "Khách lẻ";
  const customerPhone = displayPayload?.customer?.phone ?? null;
  const loyaltyPoints = displayPayload?.customer?.loyaltyPoints ?? 0;
  const loyaltyPointsUsed = displayPayload?.loyalty?.pointsUsed ?? displayPayload?.customer?.loyaltyPointsUsed ?? 0;
  const loyaltyDiscount = displayPayload?.loyalty?.discountAmount ?? 0;
  const discountCode = displayPayload?.discount?.code?.trim() || null;
  const discountAmount = displayPayload?.discount?.amount ?? 0;
  const paymentMethod = displayPayload?.payment?.method ?? null;
  const transferContent = displayPayload?.payment?.transferContent ?? "";
  const cashReceived = displayPayload?.payment?.cashReceived ?? null;
  const changeAmount = displayPayload?.payment?.change ?? null;
  const cashReceivedLabel = cashReceived === null ? "—" : formatCurrency(cashReceived);
  const changeLabel = changeAmount === null ? "—" : formatCurrency(changeAmount);
  const hasDiscountCode = !!discountCode && discountAmount > 0;
  const hasLoyaltyDiscount = loyaltyDiscount > 0 || loyaltyPointsUsed > 0;
  const paymentLabel =
    paymentMethod === "transfer" ? "Chuyển khoản" : paymentMethod === "cash" ? "Tiền mặt" : "Chờ thanh toán";
  const showPaymentDetails = paymentMethod === "cash" || paymentMethod === "transfer";
  const marketingPromo = PROMOTIONS[0];
  const transferQrUrl =
    paymentMethod === "transfer" && transferContent
      ? `https://img.vietqr.io/image/${BANK_BIN}-${BANK_ACCOUNT_NUMBER}-compact2.png?amount=${total}&addInfo=${encodeURIComponent(
          transferContent
        )}`
      : null;
  const statusLabel = loading
    ? "Đang đồng bộ..."
    : displayPayload?.status === "processing"
      ? "Đang xử lý..."
      : "Chờ đơn hàng";

  return (
    <div className="relative h-[100dvh] min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 text-slate-900 overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-amber-200/50 blur-3xl" />

      <div className="relative h-full w-full p-[clamp(12px,2vw,24px)]">
        <div className="grid h-full w-full gap-[clamp(12px,2vw,20px)] overflow-hidden lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_minmax(0,1.1fr)]">
          <motion.aside
            className="flex min-h-0 flex-col gap-4"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="rounded-3xl bg-slate-900 text-white p-6 shadow-lg">
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-amber-300" />
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-300">Ưu đãi nổi bật</p>
                  <h2 className="text-2xl font-semibold">Featured Offers</h2>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-300">Dành riêng cho khách hàng hôm nay</p>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 no-scrollbar">
              {PROMOTIONS.map((promo, index) => (
                <motion.div
                  key={promo.id}
                  className="relative flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-md"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 + index * 0.1 }}
                >
                  {promo.mediaType === "video" && promo.mediaUrl ? (
                    <video
                      className="h-full w-full object-cover"
                      src={promo.mediaUrl}
                      autoPlay
                      muted
                      loop
                      playsInline
                    />
                  ) : (
                    <img src={promo.mediaUrl ?? promo.image} alt={promo.title} className="h-full w-full object-cover" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6 text-white space-y-2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs uppercase tracking-[0.2em]">
                      <BadgeCheck className="h-3.5 w-3.5 text-emerald-300" />
                      {promo.tag}
                    </span>
                    <p className="text-xl font-semibold">{promo.title}</p>
                    <p className="text-sm text-white/80">{promo.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.aside>

          <motion.main
            className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-5">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Đơn hàng của bạn</h1>
                <p className="text-sm text-slate-500">
                  {storeName ? `Cửa hàng: ${storeName}` : "Cửa hàng đang cập nhật"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-sky-100 px-4 py-2 text-xs font-semibold text-sky-700 animate-pulse">
                  {statusLabel}
                </span>
                {warehouseCode && (
                  <span className="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
                    Kho {warehouseCode}
                  </span>
                )}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 no-scrollbar">
              {loading && displayItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-400">
                  Đang đồng bộ dữ liệu đơn hàng...
                </div>
              ) : displayItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-400">
                  Chưa có sản phẩm trong đơn hàng.
                </div>
              ) : (
                displayItems.map((item, index) => {
                  const lineTotal = item.lineTotal ?? item.price * item.qty;
                  return (
                    <motion.div
                      key={item.id}
                      className="flex items-center gap-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.1 + index * 0.1 }}
                    >
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="h-20 w-20 rounded-2xl object-cover shadow"
                        />
                      ) : (
                        <div className="h-20 w-20 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center text-xs font-semibold">
                          NUT POS
                        </div>
                      )}
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-slate-800">{item.name}</h3>
                        {item.detail && <p className="text-sm text-slate-400">{item.detail}</p>}
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className="text-xs font-semibold uppercase text-slate-400">Qty</p>
                          <span className="text-xl font-semibold text-slate-800">{item.qty}</span>
                        </div>
                        <div className="w-28 text-right text-xl font-semibold text-slate-800">
                          {formatCurrency(lineTotal)}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>

            <footer className="border-t border-slate-100 bg-slate-50 px-6 py-4">
              <div className="flex items-center justify-center gap-2 text-slate-400">
                <Info className="h-4 w-4" />
                <p className="text-sm">Vui lòng kiểm tra lại sản phẩm trước khi thanh toán.</p>
              </div>
            </footer>
          </motion.main>

          <motion.aside
            className="grid min-h-0 grid-rows-[auto_minmax(220px,1fr)_auto] gap-[clamp(12px,1.2vw,16px)]"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-md h-[clamp(110px,16vh,170px)] overflow-hidden">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Khách hàng</p>
              <div className="mt-4 flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-2xl font-semibold text-sky-700">
                  KH
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-semibold text-slate-800 truncate">{customerName}</h3>
                  <p className="text-sm text-slate-500 truncate">{customerPhone ? customerPhone : "Khách lẻ"}</p>
                  {loyaltyPoints > 0 && (
                    <p className="text-xs text-emerald-600 font-semibold mt-1 truncate">
                      Điểm loyalty: {loyaltyPoints}
                    </p>                   
                  )}
                  {displayPayload?.cashierName && (
                    <p className="text-xs text-slate-400 truncate">Thu ngân: {displayPayload.cashierName}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-white p-[clamp(16px,1.4vw,20px)] shadow-md overflow-hidden">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Khuyến mãi áp dụng</p>
              <div className="mt-3 flex min-h-0 flex-col gap-3">
                <div className="grid gap-2">
                {hasDiscountCode ? (
                  <div className="flex items-center justify-between rounded-xl border border-sky-100 bg-sky-50 px-3 py-2">
                    <span className="font-mono text-xs font-semibold text-sky-700 truncate">{discountCode}</span>
                    <span className="rounded-full bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white">
                      -{formatCurrency(discountAmount)}
                    </span>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-400">
                    Chưa áp dụng mã giảm giá
                  </div>
                )}

                {hasLoyaltyDiscount && (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                    <span className="text-[11px] font-semibold text-emerald-700 truncate">
                      Dùng {loyaltyPointsUsed} điểm
                    </span>
                    <span className="rounded-full bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white">
                      -{formatCurrency(loyaltyDiscount)}
                    </span>
                  </div>
                )}
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-3 text-sm">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Tạm tính</span>
                  <span className="font-semibold text-slate-800">{formatCurrency(subtotal)}</span>
                </div>
                {discount > 0 ? (
                  <div className="flex items-center justify-between text-sm text-red-500">
                    <span>Giảm giá</span>
                    <span className="font-semibold">-{formatCurrency(discount)}</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-sm text-slate-400">
                    <span>Giảm giá</span>
                    <span>0 đ</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm text-emerald-600">
                  <span>Điểm thưởng</span>
                  <span className="font-semibold">{formatCurrency(0)}</span>
                </div>

                <div className="rounded-2xl border border-dashed border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase text-slate-400">Cần thanh toán</p>
                  <p className="mt-1 text-3xl font-semibold text-slate-900 font-serif">
                    {formatCurrency(total)}
                  </p>
                </div>
                </div>
              </div>

            </div>

            {showPaymentDetails && (
              <div className="relative flex h-[clamp(260px,38vh,440px)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-[clamp(16px,1.6vw,24px)] py-[clamp(14px,1.4vw,20px)] text-white shadow-xl">
                <div className="pointer-events-none absolute -top-24 right-0 h-40 w-40 rounded-full bg-sky-500/20 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 left-0 h-40 w-40 rounded-full bg-indigo-500/20 blur-3xl" />
                <div className="relative flex h-full flex-col gap-4">
                  <div className="flex items-start justify-between gap-3 text-left">
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Phương thức</p>
                      <p className="text-2xl font-semibold">{paymentLabel}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-200">
                    {paymentMethod === "cash" && (
                      <>
                        <span className="rounded-full bg-white/10 px-3 py-1">
                          Khách đưa: {cashReceivedLabel}
                        </span>
                        <span
                          className={`rounded-full bg-white/10 px-3 py-1 ${
                            changeAmount !== null && changeAmount < 0 ? "text-rose-200" : "text-emerald-200"
                          }`}
                        >
                          Thối lại: {changeLabel}
                        </span>
                      </>
                    )}
                  </div>

                  {paymentMethod === "transfer" && transferQrUrl && (
                    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-xs font-semibold text-slate-200 mb-3">
                        Quét QR chuyển khoản · {BANK_NAME}
                      </div>
                      <div className="flex min-h-0 flex-1 gap-4">
                        <div className="flex w-[clamp(160px,18vw,220px)] flex-shrink-0 items-center justify-center rounded-2xl bg-white p-3 shadow-md">
                          <img
                            src={transferQrUrl}
                            alt="QR chuyển khoản"
                            className="h-full w-full max-h-[clamp(160px,22vh,240px)] object-contain"
                          />
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 text-left">
                          <div className="rounded-2xl bg-white/10 px-3 py-2 text-xs text-slate-200">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Nội dung</p>
                            <p className="mt-1 text-sm font-semibold">{transferContent || "—"}</p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-slate-200">
                            <span className="rounded-full bg-white/10 px-3 py-1">{BANK_ACCOUNT_NUMBER}</span>
                            <span className="rounded-full bg-white/10 px-3 py-1">{formatCurrency(total)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {paymentMethod === "cash" && (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-300">Cần thanh toán</p>
                      <p className="mt-2 text-4xl font-semibold text-white">{formatCurrency(total)}</p>
                      <p className="mt-2 text-xs text-slate-300">Vui lòng thanh toán tại quầy</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {false && showPaymentDetails && (
            <div className="flex h-[clamp(260px,38vh,440px)] flex-col rounded-3xl bg-slate-900 px-[clamp(16px,1.6vw,24px)] py-[clamp(14px,1.4vw,20px)] text-center text-white shadow-lg break-words overflow-hidden">
                  <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Phương thức</p>
                  <p className="mt-2 text-lg font-semibold">{paymentLabel}</p>
                  {showPaymentDetails && paymentMethod === "cash" && cashReceived !== null && (
                    <p className="mt-1 text-xs text-slate-300 break-words max-h-10 overflow-hidden">
                      Khách đưa: {formatCurrency(cashReceived)} · Thối lại: {formatCurrency(changeAmount ?? 0)}
                    </p>
                  )}
                  {showPaymentDetails && paymentMethod === "transfer" && transferContent && (
                    <p className="mt-1 text-xs text-slate-300 break-words max-h-10 overflow-hidden">Nội dung: {transferContent}</p>
                  )}
                  </div>
                  {showPaymentDetails && transferQrUrl && (
                    <div className="mt-3 flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl bg-white/10 p-3 text-center text-white">
                      <div className="text-xs font-semibold text-slate-200 mb-2">
                        Quét QR chuyển khoản · {BANK_NAME}
                      </div>
                      <img
                        src={transferQrUrl}
                        alt="QR chuyển khoản"
                        className="mx-auto w-full max-w-[clamp(220px,28vw,360px)] max-h-full aspect-square object-contain"
                      />
                      <p className="mt-2 text-xs text-slate-200">
                        {BANK_ACCOUNT_NUMBER} · {formatCurrency(total)}
                      </p>
                    </div>
                  )}
                </div>
            )}

            {!showPaymentDetails && marketingPromo && (
              <div className="relative h-[clamp(260px,38vh,440px)] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-md">
                {marketingPromo.mediaType === "video" && marketingPromo.mediaUrl ? (
                  <video
                    className="h-full w-full object-cover"
                    src={marketingPromo.mediaUrl}
                    autoPlay
                    muted
                    loop
                    playsInline
                  />
                ) : (
                  <img
                    src={marketingPromo.mediaUrl ?? marketingPromo.image}
                    alt={marketingPromo.title}
                    className="h-full w-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/30 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-[clamp(16px,1.6vw,22px)] text-white space-y-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs uppercase tracking-[0.2em]">
                    <BadgeCheck className="h-3.5 w-3.5 text-emerald-300" />
                    {marketingPromo.tag}
                  </span>
                  <p className="text-xl font-semibold">{marketingPromo.title}</p>
                  <p className="text-sm text-white/80">{marketingPromo.description}</p>
                </div>
              </div>
            )}
          </motion.aside>
        </div>
      </div>
    </div>
  );
}
