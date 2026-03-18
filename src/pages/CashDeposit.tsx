import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banknote, ChevronLeft, Loader2, RefreshCw } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { BANK_ACCOUNT_NUMBER, BANK_NAME } from "@/lib/bank";

type CashDepositRow = {
  id: string;
  created_at: string;
  amount: number;
  status: string;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(price || 0));
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

export default function CashDeposit() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [amountInput, setAmountInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingDeposits, setPendingDeposits] = useState<CashDepositRow[]>([]);

  const canCreate = useMemo(() => {
    const value = Number(amountInput);
    return Number.isFinite(value) && value > 0;
  }, [amountInput]);

  const loadPending = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("cash_deposit_requests")
        .select("id,created_at,amount,status")
        .eq("created_by_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPendingDeposits((data ?? []) as CashDepositRow[]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không tải được danh sách nộp tiền";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.id) return;

    const parsedAmount = Number(amountInput);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Số tiền không hợp lệ");
      return;
    }

    const creatorName =
      (user.user_metadata as { full_name?: string } | undefined)?.full_name ||
      user.email ||
      "Không rõ";

    setIsCreating(true);
    try {
      const { error } = await supabase.from("cash_deposit_requests").insert({
        created_by_id: user.id,
        created_by_name: creatorName,
        amount: parsedAmount,
        status: "pending",
      });

      if (error) throw error;

      toast.success("Đã tạo yêu cầu nộp tiền mặt");
      setAmountInput("");
      void loadPending();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không thể tạo yêu cầu nộp tiền";
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <AppLayout
      title="Nộp tiền mặt"
      headerRight={
        <Button variant="outline" size="sm" className="h-9 rounded-xl gap-1.5" onClick={() => navigate("/settings")}>
          <ChevronLeft className="h-4 w-4" />
          Quay lại
        </Button>
      }
    >
      <div className="h-full overflow-y-auto no-scrollbar p-4 space-y-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Banknote className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-foreground">Tạo yêu cầu nộp tiền mặt</p>
                  <p className="text-xs text-muted-foreground">
                    Nộp tiền vào {BANK_NAME} - STK {BANK_ACCOUNT_NUMBER}.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Số tiền cần nộp</label>
                <Input
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="Nhập số tiền"
                  inputMode="numeric"
                  className="h-10"
                />
              </div>
              <Button type="submit" className="w-full h-10 rounded-lg" disabled={!canCreate || isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang tạo...
                  </>
                ) : (
                  "Tạo yêu cầu nộp tiền"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Giao dịch đang chờ nộp tiền</p>
          <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => void loadPending()}>
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Làm mới
          </Button>
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground">
            Đang tải danh sách nộp tiền...
          </div>
        ) : pendingDeposits.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground">
            Chưa có giao dịch nào đang chờ nộp tiền.
          </div>
        ) : (
          <div className="space-y-2">
            {pendingDeposits.map((row) => (
              <div key={row.id} className="rounded-xl border border-border bg-card p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{formatPrice(row.amount)}</p>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300 px-2 py-1 rounded-md border border-amber-200 dark:border-amber-800">
                    Chờ nộp
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Tạo lúc: {formatDateTime(row.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
