import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Camera, Check, CheckCircle2, Clock, Loader2, Wifi, WifiOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import CameraCaptureDialog from "@/components/common/CameraCaptureDialog";
import { toast } from "@/components/ui/sonner";

interface WorkSession {
  id: string;
  session_date: string;
  earliest_checkin_at: string | null;
  latest_checkout_at: string | null;
  total_records: number;
}

interface StoreAssignment {
  store_id: string;
}

interface StoreDefinition {
  id: string;
  display_name: string | null;
  wifi_ip_pattern: string | null;
}

type CheckInState = "loading" | "not_checked_in" | "checked_in" | "checked_out";
type WifiStatus = boolean | null; // true=allowed, false=blocked, null=no restriction

function formatTime(isoString: string | null): string {
  if (!isoString) return "--:--";
  return new Date(isoString).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

function getTodayDateStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

function ipMatchesPattern(clientIp: string, pattern: string): boolean {
  if (!pattern.includes("/")) return clientIp === pattern;
  const [subnet, bitsStr] = pattern.split("/");
  const bits = parseInt(bitsStr, 10);
  if (bits < 0 || bits > 32) return false;
  const mask = ~((2 ** (32 - bits)) - 1) >>> 0;
  const ipToNum = (ip: string) =>
    ip.split(".").reduce((acc, oct) => ((acc << 8) + parseInt(oct, 10)) >>> 0, 0) >>> 0;
  try {
    return (ipToNum(clientIp) & mask) === (ipToNum(subnet) & mask);
  } catch {
    return false;
  }
}

interface CheckInCheckOutCardProps {
  compact?: boolean;
  onSessionUpdate?: () => void;
}

export default function CheckInCheckOutCard({ compact = false, onSessionUpdate }: CheckInCheckOutCardProps) {
  const { user } = useAuth();

  const [state, setState] = useState<CheckInState>("loading");
  const [session, setSession] = useState<WorkSession | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  // WiFi / store info
  const [assignedStore, setAssignedStore] = useState<StoreDefinition | null>(null);
  const [clientIp, setClientIp] = useState<string | null>(null);
  const [wifiAllowed, setWifiAllowed] = useState<WifiStatus>(null);

  // WiFi not configured (store assigned but no wifi_ip_pattern set)
  const [wifiNotConfigured, setWifiNotConfigured] = useState(false);

  const loadRef = useRef(0);

  const loadSession = useCallback(
    async (silent = false) => {
      if (!user?.id) return;
      const currentSeq = ++loadRef.current;
      if (!silent) setLoading(true);

      try {
        const today = getTodayDateStr();
        const { data, error } = await supabase
          .from("work_sessions")
          .select("id, session_date, earliest_checkin_at, latest_checkout_at, total_records")
          .eq("user_id", user.id)
          .eq("session_date", today)
          .maybeSingle();

        if (loadRef.current !== currentSeq) return;
        if (error) throw error;

        const hasSession = data != null;
        const hasCheckout = data?.latest_checkout_at != null;
        setSession(data ?? undefined);
        setState(hasSession ? (hasCheckout ? "checked_out" : "checked_in") : "not_checked_in");
      } catch {
        if (loadRef.current === currentSeq) setState("not_checked_in");
      } finally {
        if (loadRef.current === currentSeq && !silent) setLoading(false);
      }
    },
    [user?.id]
  );

  const loadStoreAndIp = useCallback(async () => {
    if (!user?.id) return;

    let storeId: string | null = null;
    let storeName: string | null = null;
    let storePattern: string | null = null;
    let notConfigured = false;
    try {
      const { data: assignData } = await supabase
        .from("user_store_assignments")
        .select("store_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (assignData) {
        storeId = (assignData as StoreAssignment).store_id;

        const { data: storeData } = await supabase
          .from("store_definitions")
          .select("id, display_name, wifi_ip_pattern")
          .eq("id", storeId)
          .maybeSingle();

        if (storeData) {
          const store = storeData as StoreDefinition;
          storeName = store.display_name;
          storePattern = store.wifi_ip_pattern;
          // If store is assigned but has no WiFi IP configured — treat as "not configured"
          notConfigured = storeId !== null && (!storePattern || !storePattern.trim());
          setAssignedStore(store);
        }
      }
    } catch { /* ignore */ }

    // Get client public IP
    let ip = "unknown";
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      if (res.ok) {
        const json = (await res.json()) as { ip?: string };
        ip = json.ip ?? "unknown";
      }
    } catch { /* ignore */ }

    setClientIp(ip);
    setWifiNotConfigured(notConfigured);

    // Evaluate WiFi access
    if (notConfigured) {
      // Store assigned but no WiFi configured — BLOCK
      setWifiAllowed(false);
    } else if (!storePattern || !storePattern.trim()) {
      // No store assigned, no restriction — ALLOW
      setWifiAllowed(null);
    } else {
      // Has pattern — verify IP
      const allowed = ipMatchesPattern(ip, storePattern.trim());
      setWifiAllowed(allowed);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void loadStoreAndIp();
    void loadSession(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleCapture = async (photoBase64: string) => {
    if (!user?.id) return;
    setCameraOpen(false);
    setLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("No auth token");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/checkin-checkout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            photo_base64: photoBase64,
            device_info: {
              userAgent: navigator.userAgent,
              platform: navigator.platform,
            },
          }),
        }
      );

      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        action_type?: string;
        ip_allowed?: boolean;
      };

      if (!res.ok || !json.ok) {
        const detail = (json as { detail?: string }).detail ?? json.error ?? "Server error";
        toast.error(detail);
        return;
      }

      const action = json.action_type === "checkout" ? "Check-out" : "Check-in";
      toast.success(`${action} thành công!`, {
        description: formatTime(new Date().toISOString()),
      });

      void loadSession(true);
      void loadStoreAndIp();
      onSessionUpdate?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Có lỗi xảy ra";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const today = getTodayDateStr();

  const statusText: Record<CheckInState, string> = {
    loading: "",
    not_checked_in: "Chưa check-in",
    checked_in: "Đang làm việc",
    checked_out: "Đã kết thúc",
  };

  const statusColor: Record<CheckInState, string> = {
    loading: "",
    not_checked_in: "text-muted-foreground",
    checked_in: "text-emerald-600 dark:text-emerald-400",
    checked_out: "text-amber-600 dark:text-amber-400",
  };

  const statusBg: Record<CheckInState, string> = {
    loading: "",
    not_checked_in: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    checked_in: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
    checked_out: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  };

  const StatusIcon: Record<CheckInState, typeof Clock> = {
    loading: Loader2,
    not_checked_in: Clock,
    checked_in: CheckCircle2,
    checked_out: Check,
  };

  const currentStatusIcon = StatusIcon[state];
  const currentStatusText = statusText[state];
  const currentStatusColor = statusColor[state];
  const currentStatusBg = statusBg[state];

  // Determine button disabled reason
  const buttonDisabled = wifiAllowed === false || wifiNotConfigured;

  return (
    <>
      <Card className="border-0 shadow-sm overflow-hidden">
        {/* Header strip with WiFi status */}
        <div className="bg-gradient-to-r from-primary/5 to-transparent px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Clock className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-foreground">
                  {compact ? "Check-in / Check-out hôm nay" : "Check-in / Check-out"}
                </p>
                {state !== "loading" && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${currentStatusBg}`}>
                    <currentStatusIcon className={`w-3 h-3 ${currentStatusColor}`} />
                    {currentStatusText}
                  </span>
                )}
              </div>
              {!compact && (
                <p className="text-xs text-muted-foreground mt-0.5">{formatDate(today)}</p>
              )}
            </div>
          </div>
        </div>

        <CardContent className="p-4 space-y-3">
          {/* Assigned store + WiFi info */}
          {assignedStore && state !== "loading" && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/60 border border-border/50">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium truncate flex-1 min-w-0">
                {assignedStore.display_name ?? "Không rõ"}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {assignedStore.wifi_ip_pattern ? (
                  <>
                    <Wifi
                      className={`h-3.5 w-3.5 ${
                        wifiAllowed === true
                          ? "text-emerald-500"
                          : wifiAllowed === false
                          ? "text-red-500"
                          : "text-muted-foreground"
                      }`}
                    />
                    <code
                      className={`text-xs font-mono px-1.5 py-0.5 rounded-full ${
                        wifiAllowed === true
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : wifiAllowed === false
                          ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {assignedStore.wifi_ip_pattern}
                    </code>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground italic">Tự do</span>
                )}
              </div>
            </div>
          )}

          {/* Times + your IP */}
          {state !== "loading" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/50 rounded-lg px-3 py-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="text-emerald-500 font-bold">↑</span> Check-in sớm
                  </p>
                  <p className="text-sm font-bold font-mono mt-0.5">
                    {session?.earliest_checkin_at
                      ? formatTime(session?.earliest_checkin_at)
                      : "--:--"}
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg px-3 py-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="text-amber-500 font-bold">↓</span> Check-out muộn
                  </p>
                  <p className="text-sm font-bold font-mono mt-0.5">
                    {session?.latest_checkout_at
                      ? formatTime(session?.latest_checkout_at)
                      : "--:--"}
                  </p>
                </div>
              </div>

              {/* Your IP */}
              {clientIp && assignedStore?.wifi_ip_pattern && (
                <p className="text-xs text-muted-foreground text-center">
                  IP của bạn:{" "}
                  <span className={`font-mono font-medium ${wifiAllowed === false ? "text-red-500" : "text-foreground"}`}>
                    {clientIp}
                  </span>
                </p>
              )}
            </>
          )}

          {/* Main action button */}
          {state !== "loading" && (
            <>
              {/* Warning banners */}
              {wifiNotConfigured && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-900">
                  <WifiOff className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-red-700 dark:text-red-400">
                      Cửa hàng chưa cấu hình WiFi
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">
                      Vui lòng liên hệ quản lý để được cấu hình WiFi cho cửa hàng{" "}
                      <strong>{assignedStore?.display_name}</strong> trước khi check-in/out.
                    </p>
                  </div>
                </div>
              )}

              {wifiAllowed === false && !wifiNotConfigured && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-900">
                  <WifiOff className="h-4 w-4 text-red-500 shrink-0" />
                  <p className="text-xs text-red-600 dark:text-red-400">
                    Không đúng WiFi cửa hàng — vui lòng kết nối WiFi:{" "}
                    <strong>{assignedStore?.wifi_ip_pattern}</strong>
                  </p>
                </div>
              )}

              <Button
                className="w-full gap-2 h-11 text-base font-semibold"
                variant={
                  state === "not_checked_in" || state === "checked_out"
                    ? "default"
                    : "destructive"
                }
                disabled={loading || buttonDisabled}
                onClick={() => setCameraOpen(true)}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : buttonDisabled ? (
                  <>
                    <WifiOff className="w-4 h-4" />
                    {wifiNotConfigured ? "Chưa cấu hình WiFi" : "Không đúng WiFi"}
                  </>
                ) : state === "not_checked_in" || state === "checked_out" ? (
                  <>
                    <Camera className="w-4 h-4" />
                    Check-in
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    Check-out
                  </>
                )}
              </Button>
            </>
          )}

          {state === "loading" && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </CardContent>
      </Card>

      <CameraCaptureDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={handleCapture}
        title={
          state === "not_checked_in" || state === "checked_out"
            ? "Chụp ảnh Check-in"
            : "Chụp ảnh Check-out"
        }
        description="Đưa khuôn mặt vào khung để hệ thống xác nhận."
      />
    </>
  );
}
