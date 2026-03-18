import { useParams } from "react-router-dom";

export default function CustomerDisplay() {
  const { warehouseCode } = useParams();

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
      <div className="text-center space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Màn hình hiển thị khách hàng</p>
        <p className="text-3xl font-semibold">{warehouseCode ? `Kho ${warehouseCode}` : "Kho chưa xác định"}</p>
        <p className="text-sm text-slate-500">UI sẽ cập nhật sau.</p>
      </div>
    </div>
  );
}
