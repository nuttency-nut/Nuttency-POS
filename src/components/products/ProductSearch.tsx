import { useState } from "react";
import { Search, X, QrCode } from "lucide-react";
import { Input } from "@/components/ui/input";
import QrScannerDialog from "@/components/common/QrScannerDialog";

interface ProductSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export default function ProductSearch({ value, onChange }: ProductSearchProps) {
  const [scannerOpen, setScannerOpen] = useState(false);

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Tìm sản phẩm, mã barcode..."
          className="pl-9 pr-16 rounded-xl bg-card border-0 h-10"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value && (
            <button onClick={() => onChange("")} className="text-muted-foreground p-1" aria-label="Xóa tìm kiếm">
              <X className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setScannerOpen(true)} className="text-muted-foreground p-1" aria-label="Quét QR hoặc barcode">
            <QrCode className="w-4 h-4" />
          </button>
        </div>
      </div>

      <QrScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={(code) => onChange(code)}
        title="Quét mã QR / Barcode sản phẩm"
      />
    </>
  );
}
