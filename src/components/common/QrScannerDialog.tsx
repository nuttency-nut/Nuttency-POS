import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";

interface QrScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (value: string) => void;
  title?: string;
}

const SCAN_INTERVAL_MS = 200; // 5 fps

export default function QrScannerDialog({
  open,
  onOpenChange,
  onDetected,
  title = "Quét mã QR",
}: QrScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<number | null>(null);
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

  useEffect(() => {
    if (!open) {
      stopScanner();
      return;
    }

    let cancelled = false;

    const startScanner = async () => {
      setErrorMessage(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
          },
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

        intervalRef.current = window.setInterval(() => {
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
          const imageData = context.getImageData(0, 0, width, height);
          const qr = jsQR(imageData.data, width, height, { inversionAttempts: "attemptBoth" });

          if (qr?.data) {
            stopScanner();
            onDetected(qr.data);
            onOpenChange(false);
            toast.success("Đã quét mã QR");
          }
        }, SCAN_INTERVAL_MS);
      } catch (error) {
        setErrorMessage("Không thể mở camera. Vui lòng cấp quyền truy cập camera.");
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
            <p className="text-xs text-muted-foreground">Đưa mã QR vào giữa khung để quét (5 fps).</p>
          )}

          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
