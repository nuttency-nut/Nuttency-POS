import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Building2, ChevronLeft, Pencil, Plus, Shield, Trash2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";

type PermissionTemplate = { key: string; label: string };
type RoleDeclaration = {
  id: string;
  name: string;
  description: string;
  permissions: Record<string, boolean>;
};
type StoreDeclaration = {
  id: string;
  storeName: string;
  warehouseCode: string;
  displayName: string;
  status: "active" | "inactive";
};

const ROLE_STORAGE_KEY = "nut_pos_role_declarations";
const STORE_STORAGE_KEY = "nut_pos_store_declarations";

const PERMISSION_TEMPLATES: PermissionTemplate[] = [
  { key: "pos", label: "Bán hàng" },
  { key: "orders", label: "Đơn hàng" },
  { key: "products", label: "Sản phẩm" },
  { key: "reports", label: "Báo cáo" },
];

const getDefaultPermissions = () =>
  PERMISSION_TEMPLATES.reduce<Record<string, boolean>>((acc, item) => {
    acc[item.key] = false;
    return acc;
  }, {});

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const readStorage = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const writeStorage = (key: string, value: unknown) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

export default function Declarations() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const section = searchParams.get("section");
  const showRole = section !== "store";
  const showStore = section !== "role";
  const pageTitle = section === "role" ? "Khai báo role" : section === "store" ? "Khai báo cửa hàng" : "Khai báo";

  const [roleDeclarations, setRoleDeclarations] = useState<RoleDeclaration[]>(() =>
    readStorage<RoleDeclaration[]>(ROLE_STORAGE_KEY, []),
  );
  const [storeDeclarations, setStoreDeclarations] = useState<StoreDeclaration[]>(() =>
    readStorage<StoreDeclaration[]>(STORE_STORAGE_KEY, []),
  );

  const [roleForm, setRoleForm] = useState(() => ({
    name: "",
    description: "",
    permissions: getDefaultPermissions(),
  }));
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);

  const [storeForm, setStoreForm] = useState(() => ({
    storeName: "",
    warehouseCode: "",
    status: "active" as StoreDeclaration["status"],
  }));
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);

  const storeDisplayName = useMemo(() => {
    const store = storeForm.storeName.trim();
    const code = storeForm.warehouseCode.trim();
    if (!store || !code) return "";
    return `${code} - ${store}`;
  }, [storeForm.storeName, storeForm.warehouseCode]);

  useEffect(() => {
    writeStorage(ROLE_STORAGE_KEY, roleDeclarations);
  }, [roleDeclarations]);

  useEffect(() => {
    writeStorage(STORE_STORAGE_KEY, storeDeclarations);
  }, [storeDeclarations]);

  const resetRoleForm = () => {
    setRoleForm({
      name: "",
      description: "",
      permissions: getDefaultPermissions(),
    });
    setEditingRoleId(null);
  };

  const resetStoreForm = () => {
    setStoreForm({
      storeName: "",
      warehouseCode: "",
      status: "active",
    });
    setEditingStoreId(null);
  };

  const handleSaveRole = () => {
    const name = roleForm.name.trim();
    if (!name) {
      toast.error("Vui lòng nhập tên role");
      return;
    }

    if (editingRoleId) {
      setRoleDeclarations((prev) =>
        prev.map((role) =>
          role.id === editingRoleId
            ? {
                ...role,
                name,
                description: roleForm.description.trim(),
                permissions: { ...roleForm.permissions },
              }
            : role,
        ),
      );
      toast.success("Đã cập nhật role");
      resetRoleForm();
      return;
    }

    setRoleDeclarations((prev) => [
      ...prev,
      {
        id: createId(),
        name,
        description: roleForm.description.trim(),
        permissions: { ...roleForm.permissions },
      },
    ]);
    toast.success("Đã thêm role mới");
    resetRoleForm();
  };

  const handleEditRole = (role: RoleDeclaration) => {
    setEditingRoleId(role.id);
    setRoleForm({
      name: role.name,
      description: role.description ?? "",
      permissions: { ...getDefaultPermissions(), ...role.permissions },
    });
  };

  const handleDeleteRole = (role: RoleDeclaration) => {
    if (!window.confirm(`Xóa role "${role.name}"?`)) return;
    setRoleDeclarations((prev) => prev.filter((item) => item.id !== role.id));
    if (editingRoleId === role.id) {
      resetRoleForm();
    }
    toast.success("Đã xóa role");
  };

  const handleSaveStore = () => {
    const storeName = storeForm.storeName.trim();
    const warehouseCode = storeForm.warehouseCode.trim();
    if (!storeName || !warehouseCode) {
      toast.error("Vui lòng nhập đủ Cửa hàng và Mã kho");
      return;
    }

    const displayName = `${warehouseCode} - ${storeName}`;
    if (editingStoreId) {
      setStoreDeclarations((prev) =>
        prev.map((store) =>
          store.id === editingStoreId
            ? {
                ...store,
                storeName,
                warehouseCode,
                displayName,
                status: storeForm.status,
              }
            : store,
        ),
      );
      toast.success("Đã cập nhật cửa hàng");
      resetStoreForm();
      return;
    }

    setStoreDeclarations((prev) => [
      ...prev,
      {
        id: createId(),
        storeName,
        warehouseCode,
        displayName,
        status: storeForm.status,
      },
    ]);
    toast.success("Đã thêm cửa hàng mới");
    resetStoreForm();
  };

  const handleEditStore = (store: StoreDeclaration) => {
    setEditingStoreId(store.id);
    setStoreForm({
      storeName: store.storeName,
      warehouseCode: store.warehouseCode,
      status: store.status,
    });
  };

  const handleDeleteStore = (store: StoreDeclaration) => {
    if (!window.confirm(`Xóa cửa hàng "${store.displayName}"?`)) return;
    setStoreDeclarations((prev) => prev.filter((item) => item.id !== store.id));
    if (editingStoreId === store.id) {
      resetStoreForm();
    }
    toast.success("Đã xóa cửa hàng");
  };

  return (
    <AppLayout
      title={pageTitle}
      headerRight={
        <Button variant="outline" size="sm" className="h-9 rounded-xl gap-1.5" onClick={() => navigate("/settings")}>
          <ChevronLeft className="h-4 w-4" />
          Quay lại
        </Button>
      }
    >
      <div className="h-full overflow-y-auto no-scrollbar p-4 space-y-4">
        {showRole && (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Shield className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">Khai báo role</p>
                    <p className="text-xs text-muted-foreground">Thêm mới, chỉnh sửa hoặc xóa role.</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {editingRoleId ? "Đang chỉnh sửa" : "Tạo mới"}
                </span>
              </div>

              <div className="grid gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Tên role</label>
                  <Input
                    value={roleForm.name}
                    onChange={(e) => setRoleForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Nhập tên role"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Mô tả</label>
                  <Textarea
                    value={roleForm.description}
                    onChange={(e) => setRoleForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Mô tả ngắn về role"
                    className="min-h-[72px]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Cấp quyền</label>
                  <div className="grid gap-2">
                    {PERMISSION_TEMPLATES.map((permission) => (
                      <div
                        key={permission.key}
                        className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                      >
                        <span className="text-sm text-foreground">{permission.label}</span>
                        <Switch
                          checked={!!roleForm.permissions[permission.key]}
                          onCheckedChange={(checked) =>
                            setRoleForm((prev) => ({
                              ...prev,
                              permissions: { ...prev.permissions, [permission.key]: checked },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Danh sách quyền sẽ được cấu hình chi tiết sau.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSaveRole} className="h-10 rounded-xl gap-2">
                  <Plus className="h-4 w-4" />
                  {editingRoleId ? "Cập nhật role" : "Thêm role"}
                </Button>
                {editingRoleId && (
                  <Button variant="outline" onClick={resetRoleForm} className="h-10 rounded-xl">
                    Hủy chỉnh sửa
                  </Button>
                )}
              </div>

              {roleDeclarations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground">
                  Chưa có role nào được khai báo.
                </div>
              ) : (
                <div className="space-y-2">
                  {roleDeclarations.map((role) => {
                    const enabledCount = Object.values(role.permissions || {}).filter(Boolean).length;
                    return (
                      <div key={role.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{role.name}</p>
                            <p className="text-xs text-muted-foreground">{role.description || "Chưa có mô tả"}</p>
                          </div>
                          <span className="text-xs text-muted-foreground">{enabledCount} quyền bật</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => handleEditRole(role)}>
                            <Pencil className="h-3.5 w-3.5" />
                            Sửa
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteRole(role)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Xóa
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {showStore && (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">Khai báo cửa hàng làm việc</p>
                    <p className="text-xs text-muted-foreground">Quản lý danh sách cửa hàng và mã kho.</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {editingStoreId ? "Đang chỉnh sửa" : "Tạo mới"}
                </span>
              </div>

              <div className="grid gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Cửa hàng</label>
                  <Input
                    value={storeForm.storeName}
                    onChange={(e) => setStoreForm((prev) => ({ ...prev, storeName: e.target.value }))}
                    placeholder="Nhập tên cửa hàng"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Mã kho</label>
                  <Input
                    value={storeForm.warehouseCode}
                    onChange={(e) => setStoreForm((prev) => ({ ...prev, warehouseCode: e.target.value }))}
                    placeholder="Nhập mã kho"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Tên cửa hàng</label>
                  <Input
                    value={storeDisplayName}
                    readOnly
                    placeholder="Tên cửa hàng sẽ tự động ghép"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Trạng thái</label>
                  <Select
                    value={storeForm.status}
                    onValueChange={(value) =>
                      setStoreForm((prev) => ({ ...prev, status: value as StoreDeclaration["status"] }))
                    }
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Đang hoạt động</SelectItem>
                      <SelectItem value="inactive">Tạm dừng</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSaveStore} className="h-10 rounded-xl gap-2">
                  <Plus className="h-4 w-4" />
                  {editingStoreId ? "Cập nhật cửa hàng" : "Thêm cửa hàng"}
                </Button>
                {editingStoreId && (
                  <Button variant="outline" onClick={resetStoreForm} className="h-10 rounded-xl">
                    Hủy chỉnh sửa
                  </Button>
                )}
              </div>

              {storeDeclarations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground">
                  Chưa có cửa hàng nào được khai báo.
                </div>
              ) : (
                <div className="space-y-2">
                  {storeDeclarations.map((store) => (
                    <div key={store.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{store.displayName}</p>
                          <p className="text-xs text-muted-foreground">
                            Mã kho: {store.warehouseCode || "-"}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {store.status === "active" ? "Đang hoạt động" : "Tạm dừng"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => handleEditStore(store)}>
                          <Pencil className="h-3.5 w-3.5" />
                          Sửa
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteStore(store)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Xóa
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
