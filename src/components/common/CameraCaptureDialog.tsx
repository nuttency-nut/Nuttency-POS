import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, RefreshCw, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CameraCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (photoBase64: string) => void;
  title?: string;
  description?: string;
}

export default function CameraCaptureDialog({
  open,
  onOpenChange,
  onCapture,
  title = "Chụp ảnh xác nhận",
  description = "Đưa khuôn mặt vào khung để chụp ảnh.",
}: CameraCaptureDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async (facing: "user" | "environment") => {
    setErrorMessage(null);
    setCapturedPhoto(null);
    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      await video.play();
    } catch {
      setErrorMessage("Không thể mở camera. Vui lòng cấp quyền camera.");
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    const canvas = canvasRef.current;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror for front camera
    if (facingMode === "user") {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setCapturedPhoto(dataUrl);
    stopCamera();
  };

  const confirmPhoto = () => {
    if (!capturedPhoto) return;
    // Remove data URL prefix to get raw base64
    const base64 = capturedPhoto.replace(/^data:image\/\w+;base64,/, "");
    onCapture(base64);
    onOpenChange(false);
    setCapturedPhoto(null);
  };

  const retake = () => {
    setCapturedPhoto(null);
    void startCamera(facingMode);
  };

  const switchCamera = () => {
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    void startCamera(next);
  };

  useEffect(() => {
    if (open) {
      void startCamera(facingMode);
    } else {
      stopCamera();
      setCapturedPhoto(null);
    }

    return () => {
      stopCamera();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && !capturedPhoto) {
      void startCamera(facingMode);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Camera / Preview area */}
          <div className="relative overflow-hidden rounded-xl border border-border bg-black/90 aspect-[4/3] flex items-center justify-center">
            {capturedPhoto ? (
              <img
                src={capturedPhoto}
                alt="Đã chụp"
                className="w-full h-full object-cover"
              />
            ) : (
              <>
                <video
                  ref={videoRef}
                  className={`w-full h-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
                  muted
                  playsInline
                />
                {/* Overlay guide */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-32 h-32 rounded-full border-2 border-white/50" />
                </div>
              </>
            )}

            {/* Loading overlay */}
            {!capturedPhoto && errorMessage === null && !streamRef.current && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="w-8 h-8 animate-spin text-white" />
              </div>
            )}
          </div>

          {errorMessage ? (
            <p className="text-xs text-destructive text-center">{errorMessage}</p>
          ) : (
            <p className="text-xs text-muted-foreground text-center">{description}</p>
          )}

          {/* Controls */}
          {capturedPhoto ? (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-1.5" onClick={retake}>
                <RefreshCw className="w-4 h-4" />
                Chụp lại
              </Button>
              <Button className="flex-1 gap-1.5" onClick={confirmPhoto}>
                <X className="w-4 h-4" />
                Xác nhận
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={switchCamera}
                title="Đổi camera"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button
                className="flex-1 gap-1.5"
                onClick={capturePhoto}
                disabled={!streamRef.current}
              >
                <Camera className="w-4 h-4" />
                Chụp ảnh
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
