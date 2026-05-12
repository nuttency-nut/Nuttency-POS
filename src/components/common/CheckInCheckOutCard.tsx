import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, CheckCircle2, Clock, Loader2, LogOut, Wifi, WifiOff } from "lucide-react";
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

interface AllowedWifiIp {
  ip_pattern: string;
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

export default function CheckInCheckOutCard() {
  const { user } = useAuth();
  const db = supabase as unknown as ReturnType<typeof import("@supabase/supabase-js").createClient>;

  const [state, setState] = useState<CheckInState>("loading");
  const [session, setSession] = useState<WorkSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [wifiAllowed, setWifiAllowed] = useState<boolean | null>(null);
  const [allowedIps, setAllowedIps] = useState<AllowedWifiIp[]>([]);

  const loadRef = useRef(0);
  const [precheckDone, setPrecheckDone] = useState(false);

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
        // On error, assume not checked in
        if (loadRef.current === currentSeq) {
          setState("not_checked_in");
        }
      } finally {
        if (loadRef.current === currentSeq && !silent) {
          setLoading(false);
        }
      }
    },
    [user?.id]
  );

  // Pre-check WiFi IP before camera opens
  const precheckWifi = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from("allowed_wifi_ips")
        .select("ip_pattern")
        .eq("is_active", true);

      const ips = (data as AllowedWifiIp[]) ?? [];
      setAllowedIps(ips);

      if (ips.length === 0) {
        setWifiAllowed(null); // No restriction configured
        return;
      }

      // Get client IP via public endpoint
      let clientIp = "unknown";
      try {
        const res = await fetch("https://api.ipify.org?format=json");
        if (res.ok) {
          const json = await res.json() as { ip?: string };
          clientIp = json.ip ?? "unknown";
        }
      } catch {
        // Can't reach public IP service
      }

      const allowed = ips.some((row) => {
        const pattern = row.ip_pattern;
        if (!pattern.includes("/")) return clientIp === pattern;
        const [subnet, bitsStr] = pattern.split("/");
        const bits = parseInt(bitsStr, 10);
        const mask = ~(2 ** (32 - bits) - 1);
        const ipToNum = (ip: string) =>
          ip.split(".").reduce((acc, oct) => ((acc << 8) + parseInt(oct, 10)) >>> 0, 0) >>> 0;
        try {
          return (ipToNum(clientIp) & mask) === (ipToNum(subnet) & mask);
        } catch {
          return false;
        }
      });
      setWifiAllowed(allowed);
    } catch {
      setWifiAllowed(null);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void loadSession(true);
    void precheckWifi().then(() => setPrecheckDone(true));
  }, [user?.id, loadSession, precheckWifi]);

  const handleButtonClick = () => {
    if (!user?.id) return;
    void precheckWifi().then(() => setCameraOpen(true));
  };

  const handleCapture = async (photoBase64: string) => {
    if (!user?.id) return;
    setPendingPhoto(photoBase64);
    setCameraOpen(false);

    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
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

      const json = await res.json() as {
        ok?: boolean;
        error?: string;
        action_type?: string;
        ip_allowed?: boolean;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Server error");
      }

      const action = json.action_type === "checkout" ? "Check-out" : "Check-in";
      const ipWarn = json.ip_allowed === false ? " (WiFi không đúng)" : "";
      toast.success(`${action} thành công${ipWarn}`, {
        description: `${formatTime(new Date().toISOString())}`,
      });

      void loadSession(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Có lỗi xảy ra";
      toast.error(msg);
    } finally {
      setLoading(false);
      setPendingPhoto(null);
    }
  };

  const today = getTodayDateStr();
  const statusText = {
    loading: "",
    not_checked_in: "Chưa check-in hôm nay",
    checked_in: "Đang làm việc",
    checked_out: "Đã kết thúc",
  }[state];

  const statusColor = {
    loading: "",
    not_checked_in: "text-muted-foreground",
    checked_in: "text-emerald-600 dark:text-emerald-400",
    checked_out: "text-amber-600 dark:text-amber-400",
  }[state];

  const StatusIcon = {
    loading: Loader2,
    not_checked_in: Clock,
    checked_in: CheckCircle2,
    checked_out: Check,
  }[state] ?? Clock;

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
              <p className="text-xs text-muted-foreground">
                {formatDate(today)}
              </p>
            </div>

            {/* WiFi status badge */}
            {precheckDone && allowedIps.length > 0 && wifiAllowed !== null && (
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                  wifiAllowed
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                }`}
                title={
                  wifiAllowed
                    ? "WiFi hợp lệ"
                    : "WiFi không nằm trong danh sách cho phép"
                }
              >
                {wifiAllowed ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                WiFi
              </div>
            )}
            {precheckDone && allowedIps.length === 0 && (
              <div
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                title="Chưa cấu hình giới hạn WiFi"
              >
                <Wifi className="w-3 h-3" />
                Tự do
              </div>
            )}
          </div>

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
              <StatusIcon className={`w-4 h-4 ${statusColor} ${state !== "loading" && state === "checked_in" ? "animate-pulse" : ""}`} />
              <span className={`text-sm font-medium ${statusColor}`}>{statusText}</span>
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
              disabled={loading}
              onClick={handleButtonClick}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : state === "not_checked_in" ? (
                <>
                  <Camera className="w-4 h-4" />
                  Check-in
                </>
              ) : state === "checked_in" ? (
                <>
                  <Camera className="w-4 h-4" />
                  Check-out
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  Check-in lại
                </>
              )}
            </Button>
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
