import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Camera, Check, ChevronRight, ChevronsUpDown, Loader2, LogOut, Moon, QrCode, ReceiptText, RefreshCw, Shield, Sun, User } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import QrScannerDialog from "@/components/common/QrScannerDialog";
import { isValidRegistrationQrPayload } from "@/lib/registration-qr";

type SystemRole = "admin" | "manager" | "staff" | "no_role";
type SettingsTab = "general" | "roles";

interface RoleUser {
  user_id: string;
  email: string | null;
  full_name: string | null;
  declared_role_id: string | null;
}

type DeclaredRole = {
  id: string;
  name: string;
  description: string | null;
  permissions?: Record<string, boolean>;
};

const avatarCache = new Map<string, string | null>();

const getInitialTheme = () => {
  if (typeof window === "undefined") return false;

  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") return true;
  if (savedTheme === "light") return false;

  return document.documentElement.classList.contains("dark");
};

const SYSTEM_ROLE_LABEL: Record<SystemRole, string> = {
  admin: "Quản trị viên",
  manager: "Quản lý",
  staff: "Nhân viên",
  no_role: "Chưa phân quyền",
};

const UNASSIGNED_ROLE_VALUE = "__none__";
const UNASSIGNED_STORE_VALUE = "__none__";

type WorkplaceOption = { id: string; label: string; status: "active" | "inactive" };

export default function AppSettings() {
  const { user, role: systemRole, declaredRole, hasPermission, signOut } = useAuth();
  const navigate = useNavigate();

  const [isDark, setIsDark] = useState(getInitialTheme);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [roleUsers, setRoleUsers] = useState<RoleUser[]>([]);
  const [loadingRoleUsers, setLoadingRoleUsers] = useState(false);
  const [declaredRoles, setDeclaredRoles] = useState<DeclaredRole[]>([]);
  const [loadingDeclaredRoles, setLoadingDeclaredRoles] = useState(false);
  const [loadingStores, setLoadingStores] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [savingWorkplaceUserId, setSavingWorkplaceUserId] = useState<string | null>(null);
  const [registrationScannerOpen, setRegistrationScannerOpen] = useState(false);
  const [approvingRegistrationQr, setApprovingRegistrationQr] = useState(false);
  const [workplaceOpenFor, setWorkplaceOpenFor] = useState<string | null>(null);
  const [workplaceByUser, setWorkplaceByUser] = useState<Record<string, string>>({});
  const [workplaceOptions, setWorkplaceOptions] = useState<WorkplaceOption[]>([]);

  const loadSeqRef = useRef(0);
  const loadInFlightRef = useRef(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const db = supabase as any;

  const currentSystemRole: SystemRole = systemRole ?? "no_role";
  const canManageRoles = hasPermission("settings.roles");
  const canAccessPaymentLookup = hasPermission("settings.transfer_lookup");
  const canDeclareRoles = hasPermission("settings.role_declaration");
  const canDeclareStores = hasPermission("settings.store_declaration");
  const roleLabel = declaredRole?.name ?? SYSTEM_ROLE_LABEL[currentSystemRole];

  useEffect(() => {
    const loadAvatar = async () => {
      if (!user?.id) return;

      if (avatarCache.has(user.id)) {
        setAvatarUrl(avatarCache.get(user.id) ?? null);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();

      const nextAvatarUrl = data?.avatar_url ?? null;
      avatarCache.set(user.id, nextAvatarUrl);
      setAvatarUrl(nextAvatarUrl);
    };

    void loadAvatar();
  }, [user?.id]);
  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
    localStorage.setItem("theme", nextDark ? "dark" : "light");
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("Đã đăng xuất");
    navigate("/auth");
  };


  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ảnh không được vượt quá 5MB");
      return;
    }

    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const filePath = `avatars/${user.id}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(filePath);
      const nextAvatarUrl = urlData.publicUrl;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: nextAvatarUrl })
        .eq("user_id", user.id);
      if (profileError) throw profileError;

      avatarCache.set(user.id, nextAvatarUrl);
      setAvatarUrl(nextAvatarUrl);
      toast.success("Đã cập nhật ảnh đại diện");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Có lỗi xảy ra";
      toast.error(`Lỗi tải ảnh: ${message}`);
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    }
  };
  const normalizeAndSortUsers = useCallback(
    (rows: Array<{ user_id: string; email: string | null; full_name: string | null }>) => {
      const users = rows.map((u) => ({
        user_id: u.user_id,
        email: u.email,
        full_name: u.full_name,
        declared_role_id: null,
      }));

      users.sort((a, b) => {
        if (a.user_id === user?.id) return -1;
        if (b.user_id === user?.id) return 1;
        return (a.full_name ?? a.email ?? a.user_id).localeCompare(
          b.full_name ?? b.email ?? b.user_id
        );
      });

      return users;
    },
    [user?.id]
  );

  const loadRoleUsers = useCallback(
    async (silent = false) => {
      if (!canManageRoles) return;
      if (loadInFlightRef.current) return;

      const currentSeq = ++loadSeqRef.current;
      loadInFlightRef.current = true;
      if (!silent) setLoadingRoleUsers(true);

      try {
        const rpcRes = await supabase.rpc("list_users_for_role_management");

        let baseUsers: RoleUser[] | null = null;

        if (!rpcRes.error && rpcRes.data) {
          baseUsers = normalizeAndSortUsers(
            rpcRes.data as Array<{
              user_id: string;
              email: string | null;
              full_name: string | null;
            }>
          );
        } else {
          const profilesRes = await supabase.from("profiles").select("user_id, full_name");

          if (profilesRes.error) {
            toast.error("Không tải được danh sách tài khoản");
            return;
          }

          const merged: RoleUser[] = (profilesRes.data ?? []).map((p) => ({
            user_id: p.user_id,
            email: p.user_id === user?.id ? user.email ?? null : null,
            full_name: p.full_name ?? null,
            declared_role_id: null,
          }));
          baseUsers = normalizeAndSortUsers(merged);
        }

        const [assignmentsRes, storeAssignmentsRes] = await Promise.all([
          db.from("user_role_assignments").select("user_id, role_id"),
          db.from("user_store_assignments").select("user_id, store_id"),
        ]);

        if (assignmentsRes.error || storeAssignmentsRes.error) {
          toast.error("Không tải được phân quyền chi tiết");
          return;
        }

        const roleAssignmentMap = new Map<string, string>();
        (assignmentsRes.data ?? []).forEach((item: { user_id: string; role_id: string }) => {
          roleAssignmentMap.set(item.user_id, item.role_id);
        });

        const storeAssignmentMap = new Map<string, string>();
        (storeAssignmentsRes.data ?? []).forEach((item: { user_id: string; store_id: string }) => {
          storeAssignmentMap.set(item.user_id, item.store_id);
        });

        if (loadSeqRef.current === currentSeq && baseUsers) {
          setRoleUsers(
            baseUsers.map((u) => ({
              ...u,
              declared_role_id: roleAssignmentMap.get(u.user_id) ?? null,
            }))
          );
          setWorkplaceByUser(
            Object.fromEntries(Array.from(storeAssignmentMap.entries()))
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Lỗi kết nối";
        toast.error(`Không tải được danh sách tài khoản: ${message}`);
      } finally {
        loadInFlightRef.current = false;
        if (loadSeqRef.current === currentSeq) {
          setLoadingRoleUsers(false);
        }
      }
    },
    [canManageRoles, db, normalizeAndSortUsers, user?.email, user?.id]
  );

  const loadDeclaredRoles = useCallback(
    async (silent = false) => {
      if (!canManageRoles) return;
      if (!silent) setLoadingDeclaredRoles(true);

      try {
        const { data, error } = await db
          .from("role_definitions")
          .select("id,name,description,permissions,created_at")
          .order("created_at", { ascending: true });

        if (error) throw error;
        const nextRoles = (data ?? []).map((item: any) => ({
          id: String(item.id ?? ""),
          name: String(item.name ?? ""),
          description: item.description ?? null,
          permissions: item.permissions ?? {},
        }));
        setDeclaredRoles(nextRoles);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Không tải được role khai báo";
        toast.error(message);
      } finally {
        if (!silent) setLoadingDeclaredRoles(false);
      }
    },
    [canManageRoles, db]
  );

  const loadStoreOptions = useCallback(
    async (silent = false) => {
      if (!canManageRoles) return;
      if (!silent) setLoadingStores(true);

      try {
        const { data, error } = await db
          .from("store_definitions")
          .select("id,display_name,status,created_at")
          .order("created_at", { ascending: true });

        if (error) throw error;
        const nextStores = (data ?? []).map((item: any) => ({
          id: String(item.id ?? ""),
          label: String(item.display_name ?? ""),
          status: item.status === "inactive" ? "inactive" : "active",
        }));
        setWorkplaceOptions(nextStores);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Không tải được danh sách cửa hàng";
        toast.error(message);
      } finally {
        if (!silent) setLoadingStores(false);
      }
    },
    [canManageRoles, db]
  );

  useEffect(() => {
    if (!canManageRoles || activeTab !== "roles") return;
    void loadRoleUsers();
    void loadDeclaredRoles();
    void loadStoreOptions();
  }, [activeTab, canManageRoles, loadRoleUsers, loadDeclaredRoles, loadStoreOptions]);

  useEffect(() => {
    if (!canManageRoles) return;

    const handleResume = () => {
      if (document.visibilityState !== "visible") return;
      if (activeTab !== "roles") return;
      void loadRoleUsers(true);
      void loadDeclaredRoles(true);
      void loadStoreOptions(true);
    };

    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    return () => {
      document.removeEventListener("visibilitychange", handleResume);
      window.removeEventListener("focus", handleResume);
    };
  }, [activeTab, canManageRoles, loadRoleUsers, loadDeclaredRoles, loadStoreOptions]);

  const canEditTarget = (targetUserId: string) => {
    if (!canManageRoles) return false;
    if (!user?.id) return false;
    if (targetUserId === user.id) return false;
    return true;
  };

  const handleChangeRole = async (targetUser: RoleUser, nextRoleId: string) => {
    if (!user?.id || !canManageRoles) return;

    if (!canEditTarget(targetUser.user_id)) {
      toast.error("Bạn không thể chỉnh sửa quyền tài khoản này");
      return;
    }

    setSavingUserId(targetUser.user_id);

    try {
      if (nextRoleId === UNASSIGNED_ROLE_VALUE) {
        const { error } = await db
          .from("user_role_assignments")
          .delete()
          .eq("user_id", targetUser.user_id);
        if (error) throw error;
        setRoleUsers((prev) =>
          prev.map((u) =>
            u.user_id === targetUser.user_id ? { ...u, declared_role_id: null } : u
          )
        );
        toast.success("Đã gỡ role");
        return;
      }

      const { error } = await db
        .from("user_role_assignments")
        .upsert({ user_id: targetUser.user_id, role_id: nextRoleId }, { onConflict: "user_id" });
      if (error) throw error;

      setRoleUsers((prev) =>
        prev.map((u) =>
          u.user_id === targetUser.user_id ? { ...u, declared_role_id: nextRoleId } : u
        )
      );
      toast.success("Đã cập nhật quyền");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cập nhật quyền thất bại";
      toast.error(message);
    } finally {
      setSavingUserId(null);
    }
  };

  const handleChangeWorkplace = async (targetUserId: string, nextStoreId: string) => {
    if (!user?.id || !canManageRoles) return;

    setSavingWorkplaceUserId(targetUserId);
    try {
      if (nextStoreId === UNASSIGNED_STORE_VALUE) {
        const { error } = await db
          .from("user_store_assignments")
          .delete()
          .eq("user_id", targetUserId);
        if (error) throw error;
        setWorkplaceByUser((prev) => {
          const next = { ...prev };
          delete next[targetUserId];
          return next;
        });
        toast.success("Đã bỏ chọn cửa hàng");
        return;
      }

      const { error } = await db
        .from("user_store_assignments")
        .upsert({ user_id: targetUserId, store_id: nextStoreId }, { onConflict: "user_id" });
      if (error) throw error;

      setWorkplaceByUser((prev) => ({ ...prev, [targetUserId]: nextStoreId }));
      toast.success("Đã cập nhật cửa hàng làm việc");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể cập nhật cửa hàng";
      toast.error(message);
    } finally {
      setSavingWorkplaceUserId(null);
    }
  };

  const handleApproveRegistrationQr = async (rawValue: string) => {
    if (!hasPermission("settings.roles.qr")) {
      toast.error("Bạn không có quyền xác thực QR đăng ký");
      return;
    }

    const payload = rawValue.trim();
    if (!isValidRegistrationQrPayload(payload)) {
      toast.error("Mã QR không hợp lệ cho xác thực đăng ký");
      return;
    }

    setApprovingRegistrationQr(true);
    try {
      const { data, error } = await supabase.rpc("approve_registration_qr", {
        p_payload: payload,
      });

      if (error) {
        toast.error(error.message || "Không thể xác thực mã QR đăng ký");
        return;
      }

      const expiresAtRaw =
        Array.isArray(data) && data.length > 0 && typeof data[0]?.expires_at === "string"
          ? data[0].expires_at
          : null;
      const expiresText = expiresAtRaw
        ? new Date(expiresAtRaw).toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : null;

      toast.success(
        expiresText
          ? `Đã xác thực QR đăng ký. Hết hạn lúc ${expiresText}`
          : "Đã xác thực QR đăng ký thành công"
      );
    } finally {
      setApprovingRegistrationQr(false);
    }
  };

  const generalContent = (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => !uploadingAvatar && avatarInputRef.current?.click()}
              className="relative w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-6 h-6 text-primary" />
              )}
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center">
                {uploadingAvatar ? (
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                ) : (
                  <Camera className="w-3 h-3 text-primary" />
                )}
              </span>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate">{user?.email}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Shield className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-primary">{roleLabel}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <button onClick={toggleTheme} className="flex items-center justify-between w-full group active:scale-[0.99] transition-transform">
            <div className="flex items-center gap-3">
              {isDark ? (
                <Moon className="w-5 h-5 text-muted-foreground" />
              ) : (
                <Sun className="w-5 h-5 text-muted-foreground" />
              )}
              <span className="font-medium text-foreground">{isDark ? "Chế độ tối" : "Chế độ sáng"}</span>
            </div>
            <div
              className={`relative w-14 h-8 rounded-full border transition-all duration-300 ${
                isDark
                  ? "bg-gradient-to-r from-slate-700 to-slate-900 border-slate-500/40 shadow-inner"
                  : "bg-gradient-to-r from-amber-200 to-orange-300 border-orange-400/50 shadow-inner"
              }`}
            >
              <div
                className={`absolute top-0.5 w-7 h-7 rounded-full bg-card shadow-md transition-all duration-300 flex items-center justify-center ${
                  isDark ? "translate-x-6 left-0.5" : "left-0.5"
                }`}
              >
                {isDark ? (
                  <Moon className="w-3.5 h-3.5 text-slate-600" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                )}
              </div>
            </div>
          </button>
        </CardContent>
      </Card>

      {canAccessPaymentLookup && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <button
              type="button"
              onClick={() => navigate("/payment-lookup")}
              className="flex items-center justify-between w-full group active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ReceiptText className="h-5 w-5" />
                </span>
                <div className="text-left">
                  <p className="font-semibold text-foreground">Tra cứu giao dịch chuyển khoản</p>
                  <p className="text-xs text-muted-foreground">Tra cứu thông tin phiếu thu</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </button>
          </CardContent>
        </Card>
      )}

      {canDeclareRoles && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <button
              type="button"
              onClick={() => navigate("/declarations?section=role")}
              className="flex items-center justify-between w-full group active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Shield className="h-5 w-5" />
                </span>
                <div className="text-left">
                  <p className="font-semibold text-foreground">Khai báo role</p>
                  <p className="text-xs text-muted-foreground">Thêm mới, chỉnh sửa, xóa role.</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </button>
          </CardContent>
        </Card>
      )}

      {canDeclareStores && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <button
              type="button"
              onClick={() => navigate("/declarations?section=store")}
              className="flex items-center justify-between w-full group active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </span>
                <div className="text-left">
                  <p className="font-semibold text-foreground">Khai báo cửa hàng làm việc</p>
                  <p className="text-xs text-muted-foreground">Thêm mới, chỉnh sửa, xóa cửa hàng.</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </button>
          </CardContent>
        </Card>
      )}

      <Button
        variant="outline"
        onClick={handleSignOut}
        className="w-full h-12 rounded-xl gap-2 text-destructive hover:text-destructive border-destructive/25 bg-card hover:bg-destructive/5 shadow-sm hover:shadow-md active:translate-y-[1px] active:shadow-sm transition-all"
      >
        <LogOut className="w-4 h-4" />
        Đăng xuất
      </Button>
    </div>
  );

  return (
    <AppLayout title="Cài đặt">
      <div className="p-4 space-y-4">
        {canManageRoles ? (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettingsTab)} className="w-full">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="general">Chung</TabsTrigger>
              <TabsTrigger value="roles">Phân quyền</TabsTrigger>
            </TabsList>

            <TabsContent value="general">{generalContent}</TabsContent>

            <TabsContent value="roles" className="space-y-3">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">Xác thực và quản lý phân quyền </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Nguyên tắc: Chỉ được phân quyền thấp hơn quyền của chính bạn.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasPermission("settings.roles.qr") && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setRegistrationScannerOpen(true)}
                        disabled={approvingRegistrationQr}
                        title="Quét QR xác thực"
                      >
                        {approvingRegistrationQr ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <QrCode className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        void loadRoleUsers();
                        void loadDeclaredRoles();
                        void loadStoreOptions();
                      }}
                      disabled={loadingRoleUsers}
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingRoleUsers ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                {loadingRoleUsers ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      
                    </CardContent>
                  </Card>
                ) : roleUsers.length === 0 ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4 space-y-2">
                      <p className="text-sm text-muted-foreground">Chưa lấy được danh sách tài khoản.</p>
                      <Button variant="outline" size="sm" onClick={() => void loadRoleUsers()}>
                        Tải lại
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  roleUsers.map((u) => {
                    const editable = canEditTarget(u.user_id);
                    const isSaving = savingUserId === u.user_id;
                    const selectedRole = declaredRoles.find((role) => role.id === u.declared_role_id) ?? null;
                    const missingRole = u.declared_role_id && !selectedRole
                      ? { id: u.declared_role_id, name: "Role không tồn tại", description: null }
                      : null;
                    const roleValue = u.declared_role_id ?? UNASSIGNED_ROLE_VALUE;
                    const roleOptions = editable
                      ? missingRole
                        ? [...declaredRoles, missingRole]
                        : declaredRoles
                      : selectedRole
                        ? [selectedRole]
                        : missingRole
                          ? [missingRole]
                          : [];
                    const selectedWorkplaceId = workplaceByUser[u.user_id] ?? "";
                    const selectedWorkplace = workplaceOptions.find((option) => option.id === selectedWorkplaceId);
                    const workplaceLabel = selectedWorkplace
                      ? selectedWorkplace.status === "inactive"
                        ? `${selectedWorkplace.label} (Tạm dừng)`
                        : selectedWorkplace.label
                      : workplaceOptions.length > 0
                        ? "Chọn cửa hàng làm việc"
                        : "Chưa khai báo cửa hàng";
                    const workplaceOpen = workplaceOpenFor === u.user_id;
                    const isSavingWorkplace = savingWorkplaceUserId === u.user_id;
                    const roleSelectDisabled = !editable || isSaving || loadingDeclaredRoles;

                    return (
                      <Card key={u.user_id} className="border-0 shadow-sm">
                        <CardContent className="p-4 space-y-3">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold truncate">{u.full_name?.trim() || "Chưa có tên"}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.email || "Chưa có email"}</p>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Select
                                value={roleValue}
                                onValueChange={(v) => void handleChangeRole(u, v)}
                                disabled={roleSelectDisabled}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Chọn role" />
                                </SelectTrigger>
                                <SelectContent>
                                  {editable && (
                                    <SelectItem value={UNASSIGNED_ROLE_VALUE}>Chưa phân quyền</SelectItem>
                                  )}
                                  {roleOptions.map((r) => (
                                    <SelectItem key={r.id} value={r.id}>
                                      {r.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {isSaving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                            </div>

                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">Cửa hàng làm việc</p>
                              <Popover
                                open={workplaceOpen}
                                onOpenChange={(open) => setWorkplaceOpenFor(open ? u.user_id : null)}
                              >
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={workplaceOpen}
                                    className="w-full justify-between h-9"
                                    disabled={!editable || workplaceOptions.length === 0 || loadingStores || isSavingWorkplace}
                                  >
                                    <span className="truncate">{workplaceLabel}</span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                                  <Command>
                                    <CommandInput placeholder="Tìm cửa hàng..." />
                                    <CommandList>
                                      <CommandEmpty>Không tìm thấy cửa hàng.</CommandEmpty>
                                      <CommandGroup>
                                        <CommandItem
                                          key={UNASSIGNED_STORE_VALUE}
                                          value="Chưa chọn cửa hàng"
                                          onSelect={() => {
                                            void handleChangeWorkplace(u.user_id, UNASSIGNED_STORE_VALUE);
                                            setWorkplaceOpenFor(null);
                                          }}
                                        >
                                          <Check
                                            className={`mr-2 h-4 w-4 ${
                                              !selectedWorkplaceId ? "opacity-100" : "opacity-0"
                                            }`}
                                          />
                                          Chưa chọn cửa hàng
                                        </CommandItem>
                                        {workplaceOptions.map((option) => {
                                          const isSelected = option.id === selectedWorkplaceId;
                                          const optionLabel =
                                            option.status === "inactive"
                                              ? `${option.label} (Tạm dừng)`
                                              : option.label;
                                          return (
                                            <CommandItem
                                              key={option.id}
                                              value={optionLabel}
                                              onSelect={() => {
                                                void handleChangeWorkplace(u.user_id, option.id);
                                                setWorkplaceOpenFor(null);
                                              }}
                                            >
                                              <Check className={`mr-2 h-4 w-4 ${isSelected ? "opacity-100" : "opacity-0"}`} />
                                              {optionLabel}
                                            </CommandItem>
                                          );
                                        })}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                              {isSavingWorkplace && (
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                              )}
                            </div>
                          </div>

                          {!editable && (
                            <p className="text-xs text-muted-foreground">Không thể chỉnh sửa quyền tài khoản này.</p>
                          )}
                          {declaredRoles.length === 0 && (
                            <p className="text-xs text-muted-foreground">Chưa khai báo role để phân quyền.</p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          generalContent
        )}

        <QrScannerDialog
          open={registrationScannerOpen}
          onOpenChange={setRegistrationScannerOpen}
          onDetected={(value) => void handleApproveRegistrationQr(value)}
          title={"Qu\u00e9t QR x\u00e1c th\u1ef1c \u0111\u0103ng k\u00fd"}
        />

        <p className="text-center text-xs text-muted-foreground pt-2">NUT POS v1.0</p>
      </div>
    </AppLayout>
  );
}




