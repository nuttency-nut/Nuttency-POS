export type PermissionNode = {
  key: string;
  label: string;
  children?: PermissionNode[];
};

export const PERMISSION_TREE: PermissionNode[] = [
  { key: "pos", label: "Bán hàng" },
  { key: "orders", label: "Đơn hàng", children: [{ key: "orders.update", label: "Cập nhật đơn hàng" }] },
  { key: "products", label: "Sản phẩm" },
  { key: "reports", label: "Báo cáo", children: [{ key: "reports.export", label: "Xuất báo cáo" }] },
  {
    key: "settings",
    label: "Cài đặt",
    children: [
      {
        key: "settings.roles",
        label: "Phân quyền",
        children: [{ key: "settings.roles.qr", label: "Xác thực (QRcode)" }],
      },
      { key: "settings.transfer_lookup", label: "Tra cứu giao dịch chuyển khoản" },
      { key: "settings.cash_deposit", label: "Nộp tiền mặt" },
      { key: "settings.role_declaration", label: "Khai báo role" },
      { key: "settings.store_declaration", label: "Khai báo cửa hàng làm việc" },
    ],
  },
];

const buildPermissionIndex = (nodes: PermissionNode[], parents: string[] = []) => {
  const ancestors = new Map<string, string[]>();
  const descendants = new Map<string, string[]>();
  const allKeys: string[] = [];

  const walk = (items: PermissionNode[], parentChain: string[]) => {
    items.forEach((node) => {
      allKeys.push(node.key);
      ancestors.set(node.key, parentChain);

      if (node.children && node.children.length > 0) {
        const childKeys: string[] = [];
        const collectDescendants = (children: PermissionNode[]) => {
          children.forEach((child) => {
            childKeys.push(child.key);
            if (child.children) collectDescendants(child.children);
          });
        };
        collectDescendants(node.children);
        descendants.set(node.key, childKeys);
        walk(node.children, [...parentChain, node.key]);
      }
    });
  };

  walk(nodes, parents);
  return { ancestors, descendants, allKeys };
};

export const permissionIndex = buildPermissionIndex(PERMISSION_TREE);

export const getDefaultPermissions = () =>
  permissionIndex.allKeys.reduce<Record<string, boolean>>((acc, key) => {
    acc[key] = false;
    return acc;
  }, {});

export const getAllPermissions = () =>
  permissionIndex.allKeys.reduce<Record<string, boolean>>((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});
