import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { Eye, EyeOff, Loader2, QrCode } from "lucide-react";
import { motion } from "framer-motion";
import RegistrationQrCode from "@/components/common/RegistrationQrCode";
import {
  buildRegistrationQrPayload,
  getRegistrationQrSecondsRemaining,
  getRegistrationQrSlot,
} from "@/lib/registration-qr";
import logo from "../../logo_4k_RB.png";

const QR_APPROVAL_POLL_MS = 3000;
const REGISTER_FORM_REVEAL_DELAY_MS = 1000;

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [qrNowMs, setQrNowMs] = useState(() => Date.now());
  const [isQrApproved, setIsQrApproved] = useState(false);
  const [isCheckingQrApproval, setIsCheckingQrApproval] = useState(false);
  const [qrApprovalError, setQrApprovalError] = useState<string | null>(null);
  const [showRegisterFields, setShowRegisterFields] = useState(false);
  const [isWaitingRevealDelay, setIsWaitingRevealDelay] = useState(false);

  const revealTimerRef = useRef<number | null>(null);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const qrSlot = useMemo(() => getRegistrationQrSlot(qrNowMs), [qrNowMs]);
  const qrPayload = useMemo(() => buildRegistrationQrPayload(qrSlot), [qrSlot]);
  const qrSecondsRemaining = useMemo(() => getRegistrationQrSecondsRemaining(qrNowMs), [qrNowMs]);

  useEffect(() => {
    if (isLogin) {
      setIsQrApproved(false);
      setIsCheckingQrApproval(false);
      setQrApprovalError(null);
      setShowRegisterFields(false);
      setIsWaitingRevealDelay(false);
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      return;
    }

    if (isQrApproved) return;

    setQrNowMs(Date.now());
    const timerId = window.setInterval(() => {
      setQrNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [isLogin, isQrApproved]);

  useEffect(() => {
    if (isLogin || isQrApproved) return;

    let disposed = false;
    setQrApprovalError(null);

    const checkApproval = async (silent: boolean) => {
      if (!silent) {
        setIsCheckingQrApproval(true);
      }

      const { data, error } = await supabase.rpc("is_registration_qr_approved", {
        p_payload: qrPayload,
      });

      if (disposed) return;

      if (error) {
        setIsQrApproved(false);
        setQrApprovalError("Không kiểm tra được xác thực QR. Vui lòng thử lại.");
      } else {
        const approved = Boolean(data);
        setIsQrApproved(approved);
        if (approved) {
          setQrApprovalError(null);
        }
      }

      if (!silent) {
        setIsCheckingQrApproval(false);
      }
    };

    void checkApproval(false);

    const pollId = window.setInterval(() => {
      void checkApproval(true);
    }, QR_APPROVAL_POLL_MS);

    return () => {
      disposed = true;
      window.clearInterval(pollId);
    };
  }, [isLogin, isQrApproved, qrPayload]);

  useEffect(() => {
    if (isLogin) return;

    if (!isQrApproved) {
      setShowRegisterFields(false);
      setIsWaitingRevealDelay(false);
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      return;
    }

    if (showRegisterFields || revealTimerRef.current !== null) return;

    setIsWaitingRevealDelay(true);
    revealTimerRef.current = window.setTimeout(() => {
      revealTimerRef.current = null;
      setShowRegisterFields(true);
      setIsWaitingRevealDelay(false);
    }, REGISTER_FORM_REVEAL_DELAY_MS);

    return () => {
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [isLogin, isQrApproved, showRegisterFields]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          toast.error(
            error.message === "Invalid login credentials"
              ? "Email hoặc mật khẩu không đúng"
              : error.message
          );
        } else {
          toast.success("Đăng nhập thành công!");
          navigate("/");
        }
      } else {
        if (!isQrApproved || !showRegisterFields) {
          toast.error("Cần quản trị viên quét QR xác nhận trước khi đăng ký");
          setIsSubmitting(false);
          return;
        }

        if (!fullName.trim()) {
          toast.error("Vui lòng nhập họ tên");
          setIsSubmitting(false);
          return;
        }

        const { error } = await signUp(email, password, fullName);
        if (error) {
          toast.error(error.message);
        } else {
          toast.success("Đăng ký thành công! Vui lòng kiểm tra email để xác nhận.");
          setIsLogin(true);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 safe-top safe-bottom">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm space-y-8"
      >
        <div className="text-center space-y-3">
          <img src={logo} alt="Logo" className="w-20 h-20 object-contain mx-auto" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">NUT POS</h1>
            <p className="text-muted-foreground text-sm mt-1">Quản lý bán hàng F&B</p>
          </div>
        </div>

        <Card className="border-0 shadow-xl">
          <CardContent className="p-6 space-y-5">
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
                  isLogin ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                onClick={() => setIsLogin(false)}
                className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
                  !isLogin ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                Đăng ký
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && !isQrApproved && (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <QrCode className="w-4 h-4 text-primary" />
                      <p className="text-xs font-semibold">Xác thực đăng ký bằng QR</p>
                    </div>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Đổi sau {qrSecondsRemaining}s
                    </span>
                  </div>

                  <RegistrationQrCode
                    payload={qrPayload}
                    size={210}
                    className="mx-auto w-[210px] h-[210px] rounded-lg bg-white p-2"
                  />

                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Nhờ Admin quét QR này để xác nhận đăng ký. Mỗi QR chỉ có hiệu lực trong 60 giây và chỉ được sử dụng một lần.
                  </p>

                  {qrApprovalError ? (
                    <p className="text-[11px] font-medium text-destructive">{qrApprovalError}</p>
                  ) : (
                    <p
                      className={`text-[11px] font-medium ${
                        isQrApproved ? "text-green-600" : "text-amber-600"
                      }`}
                    >
                      {isQrApproved
                        ? isWaitingRevealDelay
                          ? "Đã xác thực QR. Đang mở form đăng ký..."
                          : "Đã xác thực QR từ Admin."
                        : isCheckingQrApproval
                          ? "Đang kiểm tra xác thực QR..."
                          : "Chưa có xác thực QR từ Admin."}
                    </p>
                  )}
                </div>
              )}

              {!isLogin && isQrApproved && !showRegisterFields && (
                <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3">
                  <p className="text-xs font-medium text-green-600">
                    {isWaitingRevealDelay
                      ? "Đã xác thực QR. Đang mở form đăng ký..."
                      : "Đã xác thực QR. Chuẩn bị mở form đăng ký..."}
                  </p>
                </div>
              )}

              {(isLogin || showRegisterFields) && (
                <>
                  {!isLogin && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2"
                    >
                      <Label htmlFor="fullName" className="text-sm font-medium">
                        Họ và tên
                      </Label>
                      <Input
                        id="fullName"
                        type="text"
                        placeholder="Nguyễn Văn A"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="h-12 rounded-xl"
                      />
                    </motion.div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-12 rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">
                      Mật khẩu
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        className="h-12 rounded-xl pr-12"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting || (!isLogin && (!isQrApproved || !showRegisterFields))}
                    className="w-full h-12 rounded-xl text-base font-semibold shadow-lg"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : isLogin ? (
                      "Đăng nhập"
                    ) : (
                      "Đăng ký"
                    )}
                  </Button>
                </>
              )}
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Bằng việc tiếp tục, bạn đồng ý với điều khoản sử dụng
        </p>
      </motion.div>
    </div>
  );
}
