import { useCallback, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, Download, AlertCircle, CheckCircle2, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { BulkProductRow, useBulkImportProducts } from "@/hooks/useBulkImportProducts";

interface BulkProductImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const COLUMN_MAP: Record<string, keyof BulkProductRow> = {
  "Tên sản phẩm": "name",
  Barcode: "barcode",
  "Giá vốn": "cost_price",
  "Giá bán": "selling_price",
  "Đơn vị": "unit",
  "Danh mục": "category_name",
  "Tồn kho tối thiểu": "min_stock",
  "Mô tả": "description",
  "Trạng thái": "is_active",
  "Link ảnh": "image_url",
  "Phân loại": "classifications",
};

const REQUIRED_COLS = ["Tên sản phẩm"];

function generateTemplate() {
  const headers = Object.keys(COLUMN_MAP);
  const sampleRow = [
    "Cà phê sữa đá",
    "CF001",
    15000,
    29000,
    "ly",
    "Đồ uống",
    10,
    "Cà phê pha phin truyền thống",
    "Có",
    "",
    "Size:S:0|Size:M:5000|Size:L:10000|Topping:Trân châu:8000",
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  ws["!cols"] = headers.map((header) => ({ wch: Math.max(header.length + 4, 16) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sản phẩm");
  XLSX.writeFile(wb, "mau-import-san-pham.xlsx");
}

export default function BulkProductImport({ open, onOpenChange }: BulkProductImportProps) {
  const [rows, setRows] = useState<BulkProductRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [step, setStep] = useState<"upload" | "preview" | "importing">("upload");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importMutation = useBulkImportProducts();

  const resetState = useCallback(() => {
    setRows([]);
    setErrors([]);
    setFileName("");
    setStep("upload");
  }, []);

  const handleClose = useCallback(() => {
    if (step === "importing") return;
    onOpenChange(false);
    setTimeout(resetState, 200);
  }, [onOpenChange, resetState, step]);

  const handleFile = useCallback(async (file: File) => {
    setErrors([]);
    setFileName(file.name);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

      if (jsonRows.length === 0) {
        setErrors(["File không có dữ liệu"]);
        return;
      }

      const parsedRows: BulkProductRow[] = [];
      const parseErrors: string[] = [];

      for (let i = 0; i < jsonRows.length; i++) {
        const raw = jsonRows[i];
        const row: Partial<BulkProductRow> = {};

        for (const [header, fieldKey] of Object.entries(COLUMN_MAP)) {
          const value = raw[header];
          if (value === undefined || value === null || value === "") continue;

          switch (fieldKey) {
            case "cost_price":
            case "selling_price":
            case "min_stock":
              row[fieldKey] = Number(value) || 0;
              break;
            case "is_active": {
              const lower = String(value).toLowerCase();
              row[fieldKey] = lower !== "không" && lower !== "no" && lower !== "false" && String(value) !== "0";
              break;
            }
            default:
              (row as Record<string, unknown>)[fieldKey] = String(value);
              break;
          }
        }

        if (!row.name?.trim()) {
          parseErrors.push(`Dòng ${i + 2}: thiếu "Tên sản phẩm"`);
          continue;
        }

        parsedRows.push(row as BulkProductRow);
      }

      const barcodes = parsedRows.map((row) => row.barcode?.trim()).filter(Boolean) as string[];
      if (barcodes.length > 0) {
        const { data: existing } = await supabase
          .from("products")
          .select("id, barcode")
          .in("barcode", barcodes);

        const existedMap = new Map((existing || []).map((item: { id: string; barcode: string }) => [item.barcode, item.id]));
        parsedRows.forEach((row) => {
          const existedId = row.barcode?.trim() ? existedMap.get(row.barcode.trim()) : undefined;
          if (existedId) {
            row._status = "update";
            row._existingId = existedId;
          } else {
            row._status = "new";
          }
        });
      } else {
        parsedRows.forEach((row) => {
          row._status = "new";
        });
      }

      setRows(parsedRows);
      setErrors(parseErrors);
      setStep("preview");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không đọc được file";
      setErrors([`Lỗi đọc file: ${message}`]);
    }
  }, []);

  const handleImport = useCallback(async () => {
    setStep("importing");
    try {
      await importMutation.mutateAsync(rows);
      handleClose();
    } catch {
      setStep("preview");
    }
  }, [handleClose, importMutation, rows]);

  const newCount = useMemo(() => rows.filter((row) => row._status === "new").length, [rows]);
  const updateCount = useMemo(() => rows.filter((row) => row._status === "update").length, [rows]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Import sản phẩm từ Excel
          </DialogTitle>
          <DialogDescription>
            Upload file Excel để thêm hoặc cập nhật sản phẩm hàng loạt.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex-1 flex flex-col gap-4">
            <div
              className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Upload className="w-6 h-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">Kéo thả file vào đây</p>
                <p className="text-sm text-muted-foreground mt-1">hoặc nhấn để chọn file (.xlsx, .xls)</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleFile(file);
                  event.target.value = "";
                }}
              />
            </div>

            <Button variant="outline" className="gap-2" onClick={generateTemplate}>
              <Download className="w-4 h-4" />
              Tải file mẫu Excel
            </Button>

            <div className="rounded-xl bg-muted/50 p-4 text-sm space-y-2">
              <p className="font-medium text-foreground">Định dạng cột:</p>
              <div className="grid grid-cols-2 gap-1 text-muted-foreground text-xs">
                {Object.keys(COLUMN_MAP).map((col) => (
                  <span key={col}>
                    • {col} {REQUIRED_COLS.includes(col) && <span className="text-destructive">*</span>}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                <strong>Phân loại:</strong> Nhóm:Tùy chọn:Giá thêm, cách nhau bởi "|".
                <br />
                Ví dụ: <code className="bg-muted px-1 rounded">Size:S:0|Size:M:5000|Topping:Trân châu:8000</code>
              </p>
            </div>

            {errors.length > 0 && (
              <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>{errors.join("; ")}</div>
              </div>
            )}
          </div>
        )}

        {step === "preview" && (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="gap-1">
                <FileSpreadsheet className="w-3 h-3" />
                {fileName}
              </Badge>
              <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200 bg-emerald-50">
                <CheckCircle2 className="w-3 h-3" />
                {newCount} mới
              </Badge>
              {updateCount > 0 && (
                <Badge variant="outline" className="gap-1 text-amber-600 border-amber-200 bg-amber-50">
                  {updateCount} cập nhật
                </Badge>
              )}
              {errors.length > 0 && (
                <Badge variant="outline" className="gap-1 text-destructive border-destructive/30 bg-destructive/10">
                  <AlertCircle className="w-3 h-3" />
                  {errors.length} lỗi
                </Badge>
              )}
            </div>

            {errors.length > 0 && (
              <div className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive max-h-20 overflow-y-auto">
                {errors.map((error, idx) => (
                  <div key={`${error}-${idx}`}>{error}</div>
                ))}
              </div>
            )}

            <ScrollArea className="flex-1 min-h-0 border rounded-lg">
              <div className="min-w-[720px]">
                <table className="w-full text-xs">
                  <thead className="bg-muted/70 sticky top-0">
                    <tr>
                      <th className="p-2 text-left font-medium">#</th>
                      <th className="p-2 text-left font-medium">Trạng thái</th>
                      <th className="p-2 text-left font-medium">Tên sản phẩm</th>
                      <th className="p-2 text-left font-medium">Barcode</th>
                      <th className="p-2 text-right font-medium">Giá vốn</th>
                      <th className="p-2 text-right font-medium">Giá bán</th>
                      <th className="p-2 text-left font-medium">Đơn vị</th>
                      <th className="p-2 text-left font-medium">Danh mục</th>
                      <th className="p-2 text-left font-medium">Phân loại</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={`${row.name}-${idx}`} className="border-t border-border/50 hover:bg-accent/30">
                        <td className="p-2 text-muted-foreground">{idx + 1}</td>
                        <td className="p-2">
                          {row._status === "update" ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-200">
                              Cập nhật
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-200">
                              Mới
                            </Badge>
                          )}
                        </td>
                        <td className="p-2 font-medium max-w-[180px] truncate">{row.name}</td>
                        <td className="p-2 text-muted-foreground">{row.barcode || "-"}</td>
                        <td className="p-2 text-right">{Number(row.cost_price || 0).toLocaleString("vi-VN")}</td>
                        <td className="p-2 text-right">{Number(row.selling_price || 0).toLocaleString("vi-VN")}</td>
                        <td className="p-2">{row.unit || "cái"}</td>
                        <td className="p-2">{row.category_name || "-"}</td>
                        <td className="p-2 max-w-[160px] truncate text-muted-foreground">{row.classifications || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </div>
        )}

        {step === "importing" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <RotateCw className="w-6 h-6 text-primary animate-spin" />
            </div>
            <p className="font-medium text-foreground">Đang import sản phẩm...</p>
            <p className="text-sm text-muted-foreground">{rows.length} dòng dữ liệu</p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose}>
              Đóng
            </Button>
          )}

          {step === "preview" && (
            <>
              <Button variant="outline" onClick={resetState}>
                <X className="w-4 h-4 mr-1" />
                Chọn lại file
              </Button>
              <Button onClick={handleImport} disabled={rows.length === 0 || importMutation.isPending}>
                <Upload className="w-4 h-4 mr-1" />
                Import {rows.length} sản phẩm
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
