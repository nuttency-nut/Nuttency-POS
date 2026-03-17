import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export default function PendingApproval() {
  const navigate = useNavigate();
  const { permissions, signOut } = useAuth();

  const hasAnyPermission = Object.values(permissions ?? {}).some(Boolean);

  useEffect(() => {
    if (hasAnyPermission) {
      navigate("/", { replace: true });
    }
  }, [hasAnyPermission, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        <p className="text-2xl font-semibold text-foreground">Tạo tài khoản thành công</p>
        <p className="text-sm text-muted-foreground">
          Vui lòng liên hệ quản lý cửa hàng để được cấp quyền.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={async () => {
            await signOut();
            navigate("/auth", { replace: true });
          }}
        >
          Đăng xuất
        </Button>
      </div>
    </div>
  );
}
