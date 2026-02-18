import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, LogOut, Moon, RefreshCw, Shield, Sun, User } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";

type AppRole = "admin" | "manager" | "staff" | "no_role";

interface RoleUser {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
}

const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Quản trị viên",
  manager: "Quản lý",
  staff: "Nhân viên",
  no_role: "Chưa phân quyền",
};

const ROLE_LEVEL: Record<AppRole, number> = {
  admin: 4,
  manager: 3,
  staff: 2,
  no_role: 1,
};

const ASSIGNABLE_ROLES: Record<AppRole, AppRole[]> = {
  admin: ["manager", "staff", "no_role"],
  manager: ["staff", "no_role"],
  staff: [],
  no_role: [],
};

export default function AppSettings() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(false);
  const [roleUsers, setRoleUsers] = useState<RoleUser[]>([]);
  const [loadingRoleUsers, setLoadingRoleUsers] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const currentRole: AppRole = role ?? "no_role";
  const canManageRoles = currentRole === "admin" || currentRole === "manager";
  const roleLabel = ROLE_LABEL[currentRole];

  useEffect(() => {
    const dark = document.documentElement.classList.contains("dark");
    setIsDark(dark);
  }, []);

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    document.documentElement.classList.toggle("dark", newDark);
    localStorage.setItem("theme", newDark ? "dark" : "light");
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("Đã đăng xuất");
    navigate("/auth");
  };

  const loadRoleUsers = async () => {
    if (!canManageRoles) return;
    setLoadingRoleUsers(true);

    const rpcRes = await supabase.rpc("list_users_for_role_management");

    if (!rpcRes.error && rpcRes.data) {
      const rows = rpcRes.data as Array<{
        user_id: string;
        email: string | null;
        full_name: string | null;
        role: AppRole;
      }>;

      const users = rows.map((u) => ({
        user_id: u.user_id,
        email: u.email,
        full_name: u.full_name,
        role: u.role ?? "no_role",
      }));

      users.sort((a, b) => {
        if (a.user_id === user?.id) return -1;
        if (b.user_id === user?.id) return 1;
        return (a.full_name ?? a.email ?? a.user_id).localeCompare(
          b.full_name ?? b.email ?? b.user_id
        );
      });

      setRoleUsers(users);
      setLoadingRoleUsers(false);
      return;
    }

    const [profilesRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);

    if (profilesRes.error || rolesRes.error) {
      toast.error("Không tải được danh sách tài khoản");
      setLoadingRoleUsers(false);
      return;
    }

    const roleMap = new Map<string, AppRole>();
    (rolesRes.data ?? []).forEach((r) => {
      roleMap.set(r.user_id, (r.role as AppRole) ?? "no_role");
    });

    const profileMap = new Map<string, string | null>();
    (profilesRes.data ?? []).forEach((p) => {
      profileMap.set(p.user_id, p.full_name);
      if (!roleMap.has(p.user_id)) roleMap.set(p.user_id, "no_role");
    });

    const merged: RoleUser[] = Array.from(roleMap.entries()).map(([userId, userRole]) => ({
      user_id: userId,
      email: userId === user?.id ? user.email ?? null : null,
      full_name: profileMap.get(userId) ?? null,
      role: userRole,
    }));

    merged.sort((a, b) => {
      if (a.user_id === user?.id) return -1;
      if (b.user_id === user?.id) return 1;
      return (a.full_name ?? a.email ?? a.user_id).localeCompare(
        b.full_name ?? b.email ?? b.user_id
      );
    });

    setRoleUsers(merged);
    setLoadingRoleUsers(false);
  };

  useEffect(() => {
    void loadRoleUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageRoles]);

  const canEditTarget = (targetUserId: string, targetRole: AppRole) => {
    if (!canManageRoles) return false;
    if (!user?.id) return false;
    if (targetUserId === user.id) return false;
    return ROLE_LEVEL[currentRole] > ROLE_LEVEL[targetRole];
  };

  const optionsForTarget = useMemo(() => ASSIGNABLE_ROLES[currentRole], [currentRole]);

  const handleChangeRole = async (targetUser: RoleUser, nextRole: AppRole) => {
    if (!user?.id || !canManageRoles) return;

    if (!canEditTarget(targetUser.user_id, targetUser.role)) {
      toast.error("Bạn chỉ có thể phân quyền cho tài khoản thấp hơn");
      return;
    }

    if (ROLE_LEVEL[currentRole] <= ROLE_LEVEL[nextRole]) {
      toast.error("Không thể gán quyền ngang hoặc cao hơn quyền của bạn");
      return;
    }

    setSavingUserId(targetUser.user_id);

    const { data: existingRole, error: existingRoleError } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", targetUser.user_id)
      .maybeSingle();

    if (existingRoleError) {
      toast.error(existingRoleError.message || "Không kiểm tra được quyền hiện tại");
      setSavingUserId(null);
      return;
    }

    const { error } = existingRole
      ? await supabase.from("user_roles").update({ role: nextRole }).eq("id", existingRole.id)
      : await supabase.from("user_roles").insert({ user_id: targetUser.user_id, role: nextRole });

    if (error) {
      toast.error(error.message || "Cập nhật quyền thất bại");
      setSavingUserId(null);
      return;
    }

    setRoleUsers((prev) =>
      prev.map((u) => (u.user_id === targetUser.user_id ? { ...u, role: nextRole } : u))
    );
    toast.success("Đã cập nhật quyền");
    setSavingUserId(null);
  };

  const generalContent = (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
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
          <button onClick={toggleTheme} className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              {isDark ? (
                <Moon className="w-5 h-5 text-muted-foreground" />
              ) : (
                <Sun className="w-5 h-5 text-muted-foreground" />
              )}
              <span className="font-medium text-foreground">{isDark ? "Chế độ tối" : "Chế độ sáng"}</span>
            </div>
            <div
              className={`w-11 h-6 rounded-full transition-colors ${
                isDark ? "bg-primary" : "bg-muted"
              } relative`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-card shadow-sm transition-transform ${
                  isDark ? "translate-x-5.5 left-0.5" : "left-0.5"
                }`}
              />
            </div>
          </button>
        </CardContent>
      </Card>

      <Button
        variant="outline"
        onClick={handleSignOut}
        className="w-full h-12 rounded-xl gap-2 text-destructive hover:text-destructive border-destructive/20 hover:bg-destructive/5"
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
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="general">Chung</TabsTrigger>
              <TabsTrigger value="roles">Phân quyền</TabsTrigger>
            </TabsList>

            <TabsContent value="general">{generalContent}</TabsContent>

            <TabsContent value="roles" className="space-y-3">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">Quản lý quyền tài khoản</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Nguyên tắc: chỉ phân quyền cho tài khoản thấp hơn quyền của bạn.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => void loadRoleUsers()}
                    disabled={loadingRoleUsers}
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingRoleUsers ? "animate-spin" : ""}`} />
                  </Button>
                </CardContent>
              </Card>

              <div className="space-y-2">
                {loadingRoleUsers ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang tải danh sách tài khoản...
                    </CardContent>
                  </Card>
                ) : (
                  roleUsers.map((u) => {
                    const editable = canEditTarget(u.user_id, u.role);
                    const isSaving = savingUserId === u.user_id;
                    const roleOptions = editable ? optionsForTarget : [u.role];
                    return (
                      <Card key={u.user_id} className="border-0 shadow-sm">
                        <CardContent className="p-4 space-y-3">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold truncate">{u.full_name?.trim() || "Chưa có tên"}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.email || "Chưa có email"}</p>
                          </div>

                          <div className="flex items-center gap-2">
                            <Select
                              value={u.role}
                              onValueChange={(v) => void handleChangeRole(u, v as AppRole)}
                              disabled={!editable || isSaving}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {roleOptions.map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {ROLE_LABEL[r]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {isSaving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                          </div>

                          {!editable && (
                            <p className="text-xs text-muted-foreground">Không thể chỉnh quyền tài khoản này.</p>
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

        <p className="text-center text-xs text-muted-foreground pt-2">SalesPro v1.0 • Quản lý bán hàng thông minh</p>
      </div>
    </AppLayout>
  );
}
