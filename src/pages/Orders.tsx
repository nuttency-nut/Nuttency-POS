import AppLayout from "@/components/layout/AppLayout";
import { ClipboardList } from "lucide-react";

export default function Orders() {
  return (
    <AppLayout title="Đơn hàng">
      <div className="p-4">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <ClipboardList className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground mb-1">Chưa có đơn hàng</h3>
          <p className="text-sm text-muted-foreground max-w-[240px]">
            Đơn hàng sẽ hiển thị ở đây sau khi bạn bán hàng
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
