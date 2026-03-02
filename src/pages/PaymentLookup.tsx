import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, ChevronLeft, HandCoins, Loader2, Search } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type VoucherRow = {
  id: string;
  id_income: string;
  voucher_code: string;
  voucher_type: string;
  amount: number;
  payment_method: string;
  payment_content: string | null;
  order_id: string | null;
  order_number: string | null;
  created_at: string;
};

function getTodayLocalISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatDateOnly(dateISO: string) {
  const [y, m, d] = dateISO.split("-");
  if (!y || !m || !d) return dateISO;
  return `${d}/${m}/${y}`;
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

function formatPrice(price: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(price || 0));
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/[^a-z0-9\u00c0-\u024f]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isContentMatch(content: string | null | undefined, query: string) {
  const normalizedContent = normalizeText(content);
  const normalizedQuery = normalizeText(query);
  if (!normalizedContent || !normalizedQuery) return false;

  const contentWords = normalizedContent.split(" ").filter(Boolean);
  const queryWords = normalizedQuery.split(" ").filter(Boolean);
  if (queryWords.length === 0) return false;

  if (queryWords.length === 1) {
    return contentWords.includes(queryWords[0]);
  }

  for (let i = 0; i <= contentWords.length - queryWords.length; i += 1) {
    let isMatched = true;
    for (let j = 0; j < queryWords.length; j += 1) {
      if (contentWords[i + j] !== queryWords[j]) {
        isMatched = false;
        break;
      }
    }
    if (isMatched) return true;
  }

  return false;
}

function getPaymentMethodLabel(method: string) {
  if (method === "cash") return "Tiền mặt";
  if (method === "transfer") return "Chuyển khoản";
  return method || "-";
}

function getVoucherTypeLabel(type: string) {
  if (type === "income") return "Phiếu thu";
  if (type === "expense") return "Phiếu chi";
  return type || "-";
}

function getSupabaseErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const err = error as { message?: string; details?: string; hint?: string };
    const message = [err.message, err.details, err.hint].filter(Boolean).join(" | ");
    if (message) return message;
  }
  return fallback;
}

export default function PaymentLookup() {
  const navigate = useNavigate();
  const [fromDate, setFromDate] = useState(getTodayLocalISO());
  const [toDate, setToDate] = useState(getTodayLocalISO());
  const [amountInput, setAmountInput] = useState("");
  const [contentInput, setContentInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<VoucherRow[]>([]);
  const [linkingVoucher, setLinkingVoucher] = useState<VoucherRow | null>(null);
  const [linkOrderNumberInput, setLinkOrderNumberInput] = useState("");
  const [isLinkingOrder, setIsLinkingOrder] = useState(false);

  const canSearch = useMemo(() => {
    return Boolean(fromDate && toDate && amountInput.trim() && contentInput.trim());
  }, [amountInput, contentInput, fromDate, toDate]);

  useEffect(() => {
    setHasSearched(false);
    setResults([]);
  }, [fromDate, toDate, amountInput, contentInput]);

  const handleLookup = async (e: FormEvent) => {
    e.preventDefault();

    const parsedAmount = Number(amountInput);

    if (!canSearch) {
      toast.error("Vui lòng nhập đủ từ ngày, đến ngày, số tiền và nội dung");
      setHasSearched(false);
      setResults([]);
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Số tiền không hợp lệ");
      setHasSearched(false);
      setResults([]);
      return;
    }

    if (fromDate > toDate) {
      toast.error("Ngày bắt đầu không được lớn hơn ngày kết thúc");
      setHasSearched(false);
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("financial_vouchers")
        .select(
          "id,id_income,voucher_code,voucher_type,amount,payment_method,payment_content,order_id,order_number,created_at"
        )
        .gte("created_at", `${fromDate}T00:00:00`)
        .lte("created_at", `${toDate}T23:59:59.999`)
        .eq("amount", parsedAmount)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      const filtered = ((data ?? []) as VoucherRow[]).filter((row) =>
        isContentMatch(row.payment_content, contentInput)
      );

      setResults(filtered);
      setHasSearched(true);
    } catch (error) {
      const message = getSupabaseErrorMessage(error, "Khong tra cuu duoc phieu thu/chi");
      toast.error(message);
      setHasSearched(false);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const openLinkOrderSheet = (voucher: VoucherRow) => {
    setLinkingVoucher(voucher);
    setLinkOrderNumberInput("");
  };

  const handleConfirmAttachVoucher = async () => {
    if (!linkingVoucher) return;
    if (linkingVoucher.voucher_type !== "income") {
      toast.error("Chỉ phiếu thu mới có thể gắn vào đơn hàng");
      return;
    }

    const normalizedOrderNumber = linkOrderNumberInput.trim().toUpperCase();
    if (!normalizedOrderNumber) {
      toast.error("Vui lòng nhập mã đơn hàng");
      return;
    }

    setIsLinkingOrder(true);
    try {
      const { data, error } = await (supabase as any).rpc("attach_income_voucher_to_order", {
        p_voucher_id: linkingVoucher.id,
        p_order_number: normalizedOrderNumber,
      });

      if (error) throw error;

      const linkedRow = Array.isArray(data) ? data[0] : data;
      const nextOrderId = linkedRow?.order_id ?? null;
      const nextOrderNumber = linkedRow?.order_number ?? normalizedOrderNumber;

      setResults((prev) =>
        prev.map((voucher) =>
          voucher.id === linkingVoucher.id
            ? {
                ...voucher,
                order_id: nextOrderId,
                order_number: nextOrderNumber,
              }
            : voucher
        )
      );

      toast.success(`Đã ghi nhận thanh toán cho đơn ${nextOrderNumber}`);
      setLinkingVoucher(null);
      setLinkOrderNumberInput("");
    } catch (error) {
      const message = getSupabaseErrorMessage(error, "Khong the gan phieu thu vao don hang");
      toast.error(message);
    } finally {
      setIsLinkingOrder(false);
    }
  };

  return (
    <AppLayout
      title="Quản lý phiếu thu/chi"
      headerRight={
        <Button variant="outline" size="sm" className="h-9 rounded-xl gap-1.5" onClick={() => navigate("/settings")}>
          <ChevronLeft className="h-4 w-4" />
          Quay lại
        </Button>
      }
    >
      <div className="h-full overflow-y-auto no-scrollbar p-4 space-y-3">
        <form onSubmit={handleLookup} className="rounded-xl border border-border bg-card p-3 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Tra cứu theo 3 điều kiện bắt buộc
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Từ ngày</label>
              <label className="relative block">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="h-10 rounded-lg bg-background border border-border px-2.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{formatDateOnly(fromDate)}</span>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
              </label>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Đến ngày</label>
              <label className="relative block">
                <input
                  type="date"
                  value={toDate}
                  min={fromDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="h-10 rounded-lg bg-background border border-border px-2.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{formatDateOnly(toDate)}</span>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Số tiền</label>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="Nhập số tiền chính xác"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value.replace(/[^\d]/g, ""))}
              className="h-10 rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Nội dung</label>
            <Input
              type="text"
              placeholder="Nhập nội dung thanh toán"
              value={contentInput}
              onChange={(e) => setContentInput(e.target.value)}
              className="h-10 rounded-lg"
            />
          </div>

          <Button type="submit" className="w-full h-10 rounded-lg gap-2" disabled={isLoading || !canSearch}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Tra cứu phiếu thu/chi
          </Button>
        </form>

        {!hasSearched ? (
          <div className="rounded-xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground">
            Hệ thống chỉ hiển thị dữ liệu khi bạn nhập đúng đủ 3 trường: ngày, số tiền, nội dung.
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Không tìm thấy phiếu thu/chi khớp đầy đủ điều kiện tra cứu.
          </div>
        ) : (
          <div className="space-y-2">
            {results.map((voucher) => (
              <div key={voucher.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground break-all">{voucher.id_income || voucher.voucher_code}</p>
                  <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium bg-muted text-muted-foreground">
                    {getVoucherTypeLabel(voucher.voucher_type)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  <p className="text-muted-foreground">Thời gian tạo</p>
                  <p className="text-right text-foreground">{formatDateTime(voucher.created_at)}</p>

                  <p className="text-muted-foreground">Số tiền</p>
                  <p className="text-right text-foreground font-semibold">{formatPrice(voucher.amount)}</p>

                  <p className="text-muted-foreground">Hình thức thanh toán</p>
                  <p className="text-right text-foreground">{getPaymentMethodLabel(voucher.payment_method)}</p>

                  <p className="text-muted-foreground">Nội dung</p>
                  <p className="text-right text-foreground break-words">{voucher.payment_content || "-"}</p>

                  <p className="text-muted-foreground">Đã thu vào đơn hàng</p>
                  <div className="text-right">
                    {voucher.order_number ? (
                      <p className="text-foreground break-all">{voucher.order_number}</p>
                    ) : voucher.voucher_type === "income" ? (
                      <button
                        type="button"
                        onClick={() => openLinkOrderSheet(voucher)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      >
                        <HandCoins className="h-4 w-4" />
                        Chưa gắn đơn hàng
                      </button>
                    ) : (
                      <p className="text-foreground break-all">Chưa gắn đơn hàng</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={!!linkingVoucher} onOpenChange={(open) => !open && setLinkingVoucher(null)}>
        <SheetContent side="bottom" className="max-w-lg mx-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Gắn phiếu thu vào đơn hàng</SheetTitle>
            <SheetDescription>
              Nhập mã đơn để xác nhận phiếu thu và cập nhật đơn hàng sang trạng thái đã thanh toán.
            </SheetDescription>
          </SheetHeader>

          <div className="pt-4 space-y-3">
            <div className="rounded-lg border border-border bg-card p-3 text-sm">
              <p className="text-muted-foreground">Mã phiếu thu</p>
              <p className="font-semibold text-foreground break-all">{linkingVoucher?.id_income || linkingVoucher?.voucher_code}</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Mã đơn hàng</label>
              <Input
                value={linkOrderNumberInput}
                onChange={(e) => setLinkOrderNumberInput(e.target.value.toUpperCase())}
                placeholder="VD: 000OD020326ABC"
                className="h-10"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="outline" onClick={() => setLinkingVoucher(null)} disabled={isLinkingOrder}>
                Hủy
              </Button>
              <Button onClick={() => void handleConfirmAttachVoucher()} disabled={isLinkingOrder}>
                {isLinkingOrder ? "Đang xác nhận..." : "Xác nhận thu tiền"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}

