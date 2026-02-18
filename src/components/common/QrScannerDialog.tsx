import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from "@zxing/library";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";

interface QrScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (value: string) => void;
  title?: string;
}

type BarcodeLikeDetector = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): BarcodeLikeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

const SCAN_INTERVAL_MS = 200; // 5 fps
const BARCODE_FORMATS = [
  "qr_code",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "codabar",
  "itf",
] as const;

export default function QrScannerDialog({
  open,
  onOpenChange,
  onDetected,
  title = "Quét mã QR / Barcode",
}: QrScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeLikeDetector | null>(null);
  const zxingReaderRef = useRef<MultiFormatReader | null>(null);
  const detectedRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stopScanner = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const notifyDetected = (value: string) => {
    if (detectedRef.current) return;
    detectedRef.current = true;
    stopScanner();
    onDetected(value);
    onOpenChange(false);
    toast.success("Đã quét mã");
  };

  useEffect(() => {
    if (!open) {
      stopScanner();
      return;
    }

    let cancelled = false;
    detectedRef.current = false;

    const initDetector = async () => {
      if (!zxingReaderRef.current) {
        const reader = new MultiFormatReader();
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.QR_CODE,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODABAR,
          BarcodeFormat.ITF,
        ]);
        reader.setHints(hints);
        zxingReaderRef.current = reader;
      }

      const Ctor = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      if (!Ctor) {
        detectorRef.current = null;
        return;
      }

      try {
        const supported = (await Ctor.getSupportedFormats?.()) || [];
        const usableFormats = BARCODE_FORMATS.filter((format) => supported.includes(format));
        detectorRef.current = new Ctor({
          formats: usableFormats.length > 0 ? usableFormats : ["qr_code"],
        });
      } catch {
        detectorRef.current = null;
      }
    };

    const startScanner = async () => {
      setErrorMessage(null);
      await initDetector();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await video.play();

        intervalRef.current = window.setInterval(async () => {
          if (detectedRef.current) return;
          const currentVideo = videoRef.current;
          if (!currentVideo || currentVideo.readyState < 2) return;

          const width = currentVideo.videoWidth;
          const height = currentVideo.videoHeight;
          if (!width || !height) return;

          if (!canvasRef.current) {
            canvasRef.current = document.createElement("canvas");
          }
          const canvas = canvasRef.current;
          canvas.width = width;
          canvas.height = height;

          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) return;
          context.drawImage(currentVideo, 0, 0, width, height);

          // 1) Try generic barcode detector first (QR + linear barcodes)
          if (detectorRef.current) {
            try {
              const codes = await detectorRef.current.detect(canvas);
              const detected = codes.find((c) => typeof c.rawValue === "string" && c.rawValue.trim() !== "");
              if (detected?.rawValue) {
                notifyDetected(detected.rawValue);
                return;
              }
            } catch {
              // Ignore and fallback to jsQR below
            }
          }

          // 2) Fallback QR decoder for browsers without BarcodeDetector support
          const imageData = context.getImageData(0, 0, width, height);
          const zxingReader = zxingReaderRef.current;
          if (zxingReader) {
            try {
              const luminance = new RGBLuminanceSource(imageData.data, width, height);
              const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminance));
              const result = zxingReader.decode(binaryBitmap);
              if (result?.getText()) {
                notifyDetected(result.getText());
                return;
              }
            } catch {
              // Continue fallback
            }
          }

          // 3) Last fallback for QR only
          const qr = jsQR(imageData.data, width, height, { inversionAttempts: "attemptBoth" });
          if (qr?.data) {
            notifyDetected(qr.data);
          }
        }, SCAN_INTERVAL_MS);
      } catch {
        setErrorMessage("Không thể mở camera. Vui lòng cấp quyền camera.");
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [open, onDetected, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-border bg-black/90 aspect-square">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          </div>

          {errorMessage ? (
            <p className="text-xs text-destructive">{errorMessage}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Đưa QR hoặc barcode vào giữa khung để quét (5 fps).</p>
          )}

          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
