import AppLayout from "@/components/layout/AppLayout";
import { BarChart3 } from "lucide-react";

export default function Reports() {
  return (
    <AppLayout title="Báo cáo">
      <div className="p-4">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <BarChart3 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground mb-1">Chưa có dữ liệu</h3>
          <p className="text-sm text-muted-foreground max-w-[240px]">
            Báo cáo sẽ hiển thị sau khi có đơn hàng
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
