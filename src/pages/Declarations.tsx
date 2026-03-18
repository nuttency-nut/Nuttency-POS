import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { PERMISSION_TREE, PermissionNode, getDefaultPermissions, permissionIndex } from "@/lib/permissions";

type RoleDeclaration = {
  id: string;
  name: string;
  description: string;
  parentRoleId: string | null;
  permissions: Record<string, boolean>;
};

type StoreDeclaration = {
  id: string;
  storeName: string;
  warehouseCode: string;
  displayName: string;
  status: "active" | "inactive";
};

const mapRoleRow = (row: any): RoleDeclaration => ({
  id: String(row?.id ?? ""),
  name: String(row?.name ?? ""),
  description: String(row?.description ?? ""),
  parentRoleId: row?.parent_role_id ? String(row.parent_role_id) : null,
  permissions: {
    ...getDefaultPermissions(),
    ...((row?.permissions as Record<string, boolean>) ?? {}),
  },
});

const mapStoreRow = (row: any): StoreDeclaration => ({
  id: String(row?.id ?? ""),
  storeName: String(row?.store_name ?? ""),
  warehouseCode: String(row?.warehouse_code ?? ""),
  displayName: String(row?.display_name ?? ""),
  status: row?.status === "inactive" ? "inactive" : "active",
});

export default function Declarations() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const db = supabase as any;

  const section = searchParams.get("section");
  const showRole = section !== "store";
  const showStore = section !== "role";
  const pageTitle = section === "role" ? "Khai báo role" : section === "store" ? "Khai báo cửa hàng" : "Khai báo";

  const [roleDeclarations, setRoleDeclarations] = useState<RoleDeclaration[]>([]);
  const [storeDeclarations, setStoreDeclarations] = useState<StoreDeclaration[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [loadingStores, setLoadingStores] = useState(false);

  const [roleForm, setRoleForm] = useState(() => ({
    name: "",
    description: "",
    parentRoleId: "",
    permissions: getDefaultPermissions(),
  }));
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);

  const [storeForm, setStoreForm] = useState(() => ({
    storeName: "",
    warehouseCode: "",
    status: "active" as StoreDeclaration["status"],
  }));
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const roleFormRef = useRef<HTMLDivElement | null>(null);
  const storeFormRef = useRef<HTMLDivElement | null>(null);

  const storeDisplayName = useMemo(() => {
    const store = storeForm.storeName.trim();
    const code = storeForm.warehouseCode.trim();
    if (!store || !code) return "";
    return `${code} - ${store}`;
  }, [storeForm.storeName, storeForm.warehouseCode]);

  /* const parentRoleOptionsLegacy = useMemo(() => {
    const options = roleDeclarations.filter((role) => role.id !== editingRoleId);
    if (roleForm.parentRoleId && !options.some((role) => role.id === roleForm.parentRoleId)) {
      return [
        ...options,
        {
          id: roleForm.parentRoleId,
          name: "Role cha không tồn tại",
          description: "",
          parentRoleId: null,
          permissions: {},
        } as RoleDeclaration,
      ];
    }
    return options;
  }, [roleDeclarations, editingRoleId, roleForm.parentRoleId]); */

  const roleById = useMemo(() => {
    return new Map(roleDeclarations.map((role) => [role.id, role]));
  }, [roleDeclarations]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, RoleDeclaration[]>();
    roleDeclarations.forEach((role) => {
      const parentId = role.parentRoleId && roleById.has(role.parentRoleId) ? role.parentRoleId : null;
      const list = map.get(parentId) ?? [];
      list.push(role);
      map.set(parentId, list);
    });
    map.forEach((list) => {
      list.sort((a, b) => a.name.localeCompare(b.name));
    });
    return map;
  }, [roleDeclarations, roleById]);

  const descendantsById = useMemo(() => {
    const memo = new Map<string, Set<string>>();
    const walk = (id: string, stack: Set<string>) => {
      if (memo.has(id)) return memo.get(id)!;
      if (stack.has(id)) return new Set<string>();
      const nextStack = new Set(stack);
      nextStack.add(id);
      const children = childrenByParent.get(id) ?? [];
      const result = new Set<string>();
      children.forEach((child) => {
        result.add(child.id);
        walk(child.id, nextStack).forEach((desc) => result.add(desc));
      });
      memo.set(id, result);
      return result;
    };
    roleDeclarations.forEach((role) => {
      walk(role.id, new Set());
    });
    return memo;
  }, [roleDeclarations, childrenByParent]);

  const parentRoleOptions = useMemo(() => {
    const disallowed = new Set<string>();
    if (editingRoleId) {
      disallowed.add(editingRoleId);
      const descendants = descendantsById.get(editingRoleId);
      if (descendants) {
        descendants.forEach((id) => disallowed.add(id));
      }
    }

    const options: Array<{ id: string; label: string; level: number }> = [];
    const buildOptions = (parentId: string | null, level: number) => {
      const children = childrenByParent.get(parentId) ?? [];
      children.forEach((role) => {
        if (disallowed.has(role.id)) return;
        options.push({ id: role.id, label: role.name, level });
        buildOptions(role.id, level + 1);
      });
    };
    buildOptions(null, 0);

    if (roleForm.parentRoleId && !options.some((option) => option.id === roleForm.parentRoleId)) {
      options.push({ id: roleForm.parentRoleId, label: "Role cha không tồn tại", level: 0 });
    }

    return options;
  }, [childrenByParent, descendantsById, editingRoleId, roleForm.parentRoleId]);

  const rolePathById = useMemo(() => {
    const memo = new Map<string, string>();
    const visiting = new Set<string>();
    const resolve = (id: string): string => {
      if (memo.has(id)) return memo.get(id)!;
      if (visiting.has(id)) return roleById.get(id)?.name ?? "Không xác định";
      const role = roleById.get(id);
      if (!role) return "Không xác định";
      visiting.add(id);
      if (!role.parentRoleId || !roleById.has(role.parentRoleId)) {
        memo.set(id, role.name);
        visiting.delete(id);
        return role.name;
      }
      const parentPath = resolve(role.parentRoleId);
      const path = `${parentPath} > ${role.name}`;
      memo.set(id, path);
      visiting.delete(id);
      return path;
    };
    roleDeclarations.forEach((role) => {
      resolve(role.id);
    });
    return memo;
  }, [roleDeclarations, roleById]);

  const roleDisplayOrder = useMemo(() => {
    const ordered: Array<{ role: RoleDeclaration; level: number }> = [];
    const visited = new Set<string>();
    const build = (parentId: string | null, level: number) => {
      const children = childrenByParent.get(parentId) ?? [];
      children.forEach((role) => {
        if (visited.has(role.id)) return;
        visited.add(role.id);
        ordered.push({ role, level });
        build(role.id, level + 1);
      });
    };
    build(null, 0);
    return ordered;
  }, [childrenByParent]);

  const loadRoles = async () => {
    setLoadingRoles(true);
    try {
      const { data, error } = await db
        .from("role_definitions")
        .select("id,name,description,parent_role_id,permissions,created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      setRoleDeclarations((data ?? []).map(mapRoleRow));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không tải được danh sách role";
      toast.error(message);
    } finally {
      setLoadingRoles(false);
    }
  };

  const loadStores = async () => {
    setLoadingStores(true);
    try {
      const { data, error } = await db
        .from("store_definitions")
        .select("id,store_name,warehouse_code,display_name,status,created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      setStoreDeclarations((data ?? []).map(mapStoreRow));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không tải được danh sách cửa hàng";
      toast.error(message);
    } finally {
      setLoadingStores(false);
    }
  };

  useEffect(() => {
    void loadRoles();
    void loadStores();
  }, []);

  const resetRoleForm = () => {
    setRoleForm({
      name: "",
      description: "",
      parentRoleId: "",
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

  const handleSaveRole = async () => {
    const name = roleForm.name.trim();
    if (!name) {
      toast.error("Vui lòng nhập tên role");
      return;
    }
    const hasAnyPermission = Object.values(roleForm.permissions ?? {}).some(Boolean);
    if (!hasAnyPermission) {
      toast.error("Vui lòng chọn ít nhất 1 quyền");
      return;
    }
    try {
      if (editingRoleId) {
        const payload = {
          name,
          description: roleForm.description.trim(),
          parent_role_id: roleForm.parentRoleId || null,
          permissions: roleForm.permissions,
        };
        const { data, error } = await db
          .from("role_definitions")
          .update(payload)
          .eq("id", editingRoleId)
          .select("id,name,description,parent_role_id,permissions")
          .single();
        if (error) throw error;
        setRoleDeclarations((prev) =>
          prev.map((role) => (role.id === editingRoleId ? mapRoleRow(data ?? payload) : role)),
        );
        toast.success("Đã cập nhật role");
        resetRoleForm();
        return;
      }

      const payload = {
        name,
        description: roleForm.description.trim(),
        parent_role_id: roleForm.parentRoleId || null,
        permissions: roleForm.permissions,
      };
      const { data, error } = await db
        .from("role_definitions")
        .insert(payload)
        .select("id,name,description,parent_role_id,permissions")
        .single();
      if (error) throw error;
      setRoleDeclarations((prev) => [...prev, mapRoleRow(data ?? payload)]);
      toast.success("Đã thêm role mới");
      resetRoleForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể lưu role";
      toast.error(message);
    }
  };

  const handleTogglePermission = (key: string, checked: boolean) => {
    setRoleForm((prev) => {
      const nextPermissions = { ...prev.permissions, [key]: checked };

      if (checked) {
        const parentKeys = permissionIndex.ancestors.get(key) ?? [];
        parentKeys.forEach((parentKey) => {
          nextPermissions[parentKey] = true;
        });
      } else {
        const childKeys = permissionIndex.descendants.get(key) ?? [];
        childKeys.forEach((childKey) => {
          nextPermissions[childKey] = false;
        });
      }

      return { ...prev, permissions: nextPermissions };
    });
  };

  const scrollToForm = (ref: RefObject<HTMLDivElement>) => {
    if (typeof window === "undefined") return;
    if (!ref.current) return;
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleEditRole = (role: RoleDeclaration) => {
    setEditingRoleId(role.id);
    setRoleForm({
      name: role.name,
      description: role.description ?? "",
      parentRoleId: role.parentRoleId ?? "",
      permissions: { ...getDefaultPermissions(), ...role.permissions },
    });
    scrollToForm(roleFormRef);
  };

  const handleDeleteRole = async (role: RoleDeclaration) => {
    if (!window.confirm(`Xóa role "${role.name}"?`)) return;
    try {
      const { error } = await db.from("role_definitions").delete().eq("id", role.id);
      if (error) throw error;
      setRoleDeclarations((prev) => prev.filter((item) => item.id !== role.id));
      if (editingRoleId === role.id) {
        resetRoleForm();
      }
      toast.success("Đã xóa role");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể xóa role";
      toast.error(message);
    }
  };

  const handleSaveStore = async () => {
    const storeName = storeForm.storeName.trim();
    const warehouseCode = storeForm.warehouseCode.trim();
    if (!storeName || !warehouseCode) {
      toast.error("Vui lòng nhập đủ Cửa hàng và Mã kho");
      return;
    }

    const displayName = `${warehouseCode} - ${storeName}`;
    try {
      if (editingStoreId) {
        const payload = {
          store_name: storeName,
          warehouse_code: warehouseCode,
          display_name: displayName,
          status: storeForm.status,
        };
        const { data, error } = await db
          .from("store_definitions")
          .update(payload)
          .eq("id", editingStoreId)
          .select("id,store_name,warehouse_code,display_name,status")
          .single();
        if (error) throw error;
        setStoreDeclarations((prev) =>
          prev.map((store) => (store.id === editingStoreId ? mapStoreRow(data ?? payload) : store)),
        );
        toast.success("Đã cập nhật cửa hàng");
        resetStoreForm();
        return;
      }

      const payload = {
        store_name: storeName,
        warehouse_code: warehouseCode,
        display_name: displayName,
        status: storeForm.status,
      };
      const { data, error } = await db
        .from("store_definitions")
        .insert(payload)
        .select("id,store_name,warehouse_code,display_name,status")
        .single();
      if (error) throw error;
      setStoreDeclarations((prev) => [...prev, mapStoreRow(data ?? payload)]);
      toast.success("Đã thêm cửa hàng mới");
      resetStoreForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể lưu cửa hàng";
      toast.error(message);
    }
  };

  const handleEditStore = (store: StoreDeclaration) => {
    setEditingStoreId(store.id);
    setStoreForm({
      storeName: store.storeName,
      warehouseCode: store.warehouseCode,
      status: store.status,
    });
    scrollToForm(storeFormRef);
  };

  const handleDeleteStore = async (store: StoreDeclaration) => {
    if (!window.confirm(`Xóa cửa hàng "${store.displayName}"?`)) return;
    try {
      const { error } = await db.from("store_definitions").delete().eq("id", store.id);
      if (error) throw error;
      setStoreDeclarations((prev) => prev.filter((item) => item.id !== store.id));
      if (editingStoreId === store.id) {
        resetStoreForm();
      }
      toast.success("Đã xóa cửa hàng");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể xóa cửa hàng";
      toast.error(message);
    }
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

              {loadingRoles ? (
                <div className="rounded-xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground">
                  Đang tải danh sách role...
                </div>
              ) : roleDisplayOrder.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground">
                  Chưa có role nào được khai báo.
                </div>
              ) : (
                <div className="space-y-2">
                  {roleDisplayOrder.map(({ role, level }) => {
                    const enabledCount = permissionIndex.allKeys.filter((key) => role.permissions?.[key]).length;
                    const hierarchyLabel = rolePathById.get(role.id) ?? role.name;
                    const indent = level * 12;
                    return (
                      <div
                        key={role.id}
                        className="rounded-xl border border-border bg-card p-3 space-y-2"
                        style={{ marginLeft: indent }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{role.name}</p>
                            <p className="text-xs text-muted-foreground">{role.description || "Chưa có mô tả"}</p>
                            <p className="text-xs text-muted-foreground">Cấp bậc: {hierarchyLabel}</p>
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

              <div ref={roleFormRef} className="grid gap-3 pt-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Tên role <span className="text-destructive">*</span>
                  </label>
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
                  <label className="text-xs text-muted-foreground">Role cha</label>
                  <Select
                    value={roleForm.parentRoleId || "__none__"}
                    onValueChange={(value) =>
                      setRoleForm((prev) => ({
                        ...prev,
                        parentRoleId: value === "__none__" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Không có (cấp cao nhất)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Không có (cấp cao nhất)</SelectItem>
                      {parentRoleOptions.length === 0 ? (
                        <SelectItem value="__empty__" disabled>
                          Chưa có role để làm cha
                        </SelectItem>
                      ) : (
                        parentRoleOptions.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {`${role.level > 0 ? "- ".repeat(role.level) : ""}${role.label}`}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Chọn role cha để tạo nhiều cấp bậc. Để trống nếu là cấp cao nhất.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    Cấp quyền <span className="text-destructive">*</span>
                  </label>
                  <div className="grid gap-2">
                    {PERMISSION_TREE.map((node) => {
                      const renderNode = (item: PermissionNode, level: number) => {
                        const isChecked = !!roleForm.permissions[item.key];
                        const isChild = level > 0;
                        return (
                          <div key={item.key} className="space-y-2">
                            <div
                              className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                                isChild ? "border-border/60 bg-muted/30" : "border-border bg-card"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {isChild && <span className="h-2 w-2 rounded-full bg-muted-foreground/60" />}
                                <span className={`text-sm ${isChild ? "text-foreground" : "text-foreground font-medium"}`}>
                                  {item.label}
                                </span>
                              </div>
                              <Switch
                                checked={isChecked}
                                onCheckedChange={(checked) => handleTogglePermission(item.key, checked)}
                              />
                            </div>
                            {item.children && item.children.length > 0 && (
                              <div className="ml-4 border-l border-border/50 pl-4 space-y-2">
                                {item.children.map((child) => renderNode(child, level + 1))}
                              </div>
                            )}
                          </div>
                        );
                      };
                      return renderNode(node, 0);
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Bật quyền con sẽ tự bật quyền cha tương ứng.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleSaveRole}
                  className={`h-10 rounded-xl gap-2 ${
                    editingRoleId ? "bg-emerald-500 hover:bg-emerald-600 text-white" : ""
                  }`}
                  disabled={loadingRoles}
                >
                  <Plus className="h-4 w-4" />
                  {editingRoleId ? "Cập nhật role" : "Thêm role"}
                </Button>
                {editingRoleId && (
                  <Button variant="outline" onClick={resetRoleForm} className="h-10 rounded-xl">
                    Hủy chỉnh sửa
                  </Button>
                )}
              </div>
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

              {loadingStores ? (
                <div className="rounded-xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground">
                  Đang tải danh sách cửa hàng...
                </div>
              ) : storeDeclarations.length === 0 ? (
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
                          <p className="text-xs text-muted-foreground">Mã kho: {store.warehouseCode || "-"}</p>
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

              <div ref={storeFormRef} className="grid gap-3 pt-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Cửa hàng <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={storeForm.storeName}
                    onChange={(e) => setStoreForm((prev) => ({ ...prev, storeName: e.target.value }))}
                    placeholder="Nhập tên cửa hàng"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Mã kho <span className="text-destructive">*</span>
                  </label>
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
                <Button
                  onClick={handleSaveStore}
                  className={`h-10 rounded-xl gap-2 ${
                    editingStoreId ? "bg-emerald-500 hover:bg-emerald-600 text-white" : ""
                  }`}
                  disabled={loadingStores}
                >
                  <Plus className="h-4 w-4" />
                  {editingStoreId ? "Cập nhật cửa hàng" : "Thêm cửa hàng"}
                </Button>
                {editingStoreId && (
                  <Button variant="outline" onClick={resetStoreForm} className="h-10 rounded-xl">
                    Hủy chỉnh sửa
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
