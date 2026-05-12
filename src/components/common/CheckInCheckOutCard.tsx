import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, CheckCircle2, Clock, Loader2, Wifi, WifiOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import CameraCaptureDialog from "@/components/common/CameraCaptureDialog";
import { toast } from "@/components/ui/sonner";

interface WorkSession {
  id: string;
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

export default function CheckInCheckOutCard() {
  const { user } = useAuth();

  const [state, setState] = useState<CheckInState>("loading");
  const [session, setSession] = useState<WorkSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  // WiFi / store info
  const [assignedStore, setAssignedStore] = useState<StoreDefinition | null>(null);
  const [clientIp, setClientIp] = useState<string | null>(null);
  const [wifiAllowed, setWifiAllowed] = useState<boolean | null>(null);

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
          .select("id, earliest_checkin_at, latest_checkout_at, total_records")
          .eq("user_id", user.id)
          .eq("session_date", today)
          .maybeSingle();

        if (loadRef.current !== currentSeq) return;
        if (error) throw error;

        const hasSession = data !== null;
        const hasCheckout = data?.latest_checkout_at !== null;
        setSession(data as WorkSession | null);
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

    // 1. Get assigned store
    let storeId: string | null = null;
    let storeName: string | null = null;
    let storePattern: string | null = null;
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
          setAssignedStore(store);
        }
      }
    } catch { /* ignore */ }

    // 2. Get client public IP
    let ip = "unknown";
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      if (res.ok) {
        const json = (await res.json()) as { ip?: string };
        ip = json.ip ?? "unknown";
      }
    } catch { /* ignore */ }

    setClientIp(ip);

    // 3. Check if IP matches store WiFi pattern
    const allowed =
      !storePattern || !storePattern.trim()
        ? null
        : ipMatchesPattern(ip, storePattern.trim());

    setWifiAllowed(allowed);
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
      const ipWarn = json.ip_allowed === false ? " (WiFi không đúng)" : "";
      toast.success(`${action} thành công${ipWarn}`, {
        description: formatTime(new Date().toISOString()),
      });

      void loadSession(true);
      void loadStoreAndIp(); // refresh WiFi status
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
    not_checked_in: "Chưa check-in hôm nay",
    checked_in: "Đang làm việc",
    checked_out: "Đã kết thúc",
  };

  const statusColor: Record<CheckInState, string> = {
    loading: "",
    not_checked_in: "text-muted-foreground",
    checked_in: "text-emerald-600 dark:text-emerald-400",
    checked_out: "text-amber-600 dark:text-amber-400",
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

  return (
    <>
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Clock className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">Check-in / Check-out</p>
              <p className="text-xs text-muted-foreground">{formatDate(today)}</p>
            </div>

            {/* WiFi status badge */}
            {state !== "loading" && (
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                  wifiAllowed === true
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                    : wifiAllowed === false
                    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                }`}
                title={
                  wifiAllowed === true
                    ? "WiFi hợp lệ"
                    : wifiAllowed === false
                    ? `WiFi không hợp lệ. Cần: ${assignedStore?.wifi_ip_pattern ?? "?"}`
                    : "Cửa hàng chưa cấu hình WiFi — không giới hạn"
                }
              >
                {wifiAllowed === true ? (
                  <Wifi className="w-3 h-3" />
                ) : wifiAllowed === false ? (
                  <WifiOff className="w-3 h-3" />
                ) : (
                  <Wifi className="w-3 h-3" />
                )}
                WiFi
              </div>
            )}
          </div>

          {/* Assigned store info */}
          {assignedStore && state !== "loading" && (
            <div className="bg-muted/50 rounded-lg px-3 py-2">
              <p className="text-xs text-muted-foreground">Cửa hàng được gán</p>
              <p className="text-sm font-medium truncate">
                {assignedStore.display_name ?? "Không rõ"}
              </p>
              {assignedStore.wifi_ip_pattern && (
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  WiFi: {assignedStore.wifi_ip_pattern}
                  {clientIp && (
                    <span className="ml-1">
                      (IP của bạn: <span className={wifiAllowed === false ? "text-red-500 font-semibold" : ""}>{clientIp}</span>)
                    </span>
                  )}
                </p>
              )}
              {!assignedStore.wifi_ip_pattern && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Chưa cấu hình WiFi — không giới hạn check-in
                </p>
              )}
            </div>
          )}

          {/* Session info */}
          {state !== "loading" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/50 rounded-lg px-3 py-2">
                <p className="text-xs text-muted-foreground">Check-in sớm nhất</p>
                <p className="text-sm font-semibold font-mono">
                  {session?.earliest_checkin_at
                    ? formatTime(session.earliest_checkin_at)
                    : "--:--"}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg px-3 py-2">
                <p className="text-xs text-muted-foreground">Check-out muộn nhất</p>
                <p className="text-sm font-semibold font-mono">
                  {session?.latest_checkout_at
                    ? formatTime(session.latest_checkout_at)
                    : "--:--"}
                </p>
              </div>
            </div>
          )}

          {/* Status row */}
          {state !== "loading" && (
            <div className="flex items-center gap-2">
              <currentStatusIcon
                className={`w-4 h-4 ${currentStatusColor} ${
                  state === "checked_in" ? "animate-pulse" : ""
                }`}
              />
              <span className={`text-sm font-medium ${currentStatusColor}`}>
                {currentStatusText}
              </span>
            </div>
          )}

          {/* Main action button */}
          {state !== "loading" && (
            <Button
              className="w-full gap-2"
              variant={
                state === "not_checked_in" || state === "checked_out"
                  ? "default"
                  : "destructive"
              }
              disabled={loading || wifiAllowed === false}
              onClick={() => setCameraOpen(true)}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : wifiAllowed === false ? (
                <>
                  <WifiOff className="w-4 h-4" />
                  Không đúng WiFi
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
          )}

          {wifiAllowed === false && assignedStore && (
            <p className="text-xs text-destructive text-center">
              Bạn đang ở IP: {clientIp} — cần kết nối WiFi của cửa hàng{" "}
              <strong>{assignedStore.display_name ?? "?"}</strong> (WiFi:{" "}
              <strong>{assignedStore.wifi_ip_pattern}</strong>)
            </p>
          )}

          {state === "loading" && (
            <div className="flex items-center justify-center py-2">
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
