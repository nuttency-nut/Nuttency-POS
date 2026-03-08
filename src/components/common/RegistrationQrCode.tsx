import { useEffect, useMemo, useRef, useState } from "react";
import { BarcodeFormat, EncodeHintType, MultiFormatWriter } from "@zxing/library";

interface RegistrationQrCodeProps {
  payload: string;
  size?: number;
  className?: string;
}

export default function RegistrationQrCode({ payload, size = 220, className }: RegistrationQrCodeProps) {
  const writerRef = useRef<MultiFormatWriter | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  const safePayload = useMemo(() => payload.trim(), [payload]);

  useEffect(() => {
    if (!safePayload) {
      setDataUrl(null);
      return;
    }

    if (!writerRef.current) {
      writerRef.current = new MultiFormatWriter();
    }

    try {
      const hints = new Map();
      hints.set(EncodeHintType.MARGIN, 1);

      const matrix = writerRef.current.encode(
        safePayload,
        BarcodeFormat.QR_CODE,
        size,
        size,
        hints
      );

      const canvas = document.createElement("canvas");
      canvas.width = matrix.getWidth();
      canvas.height = matrix.getHeight();
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        setDataUrl(null);
        return;
      }

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000000";

      for (let y = 0; y < matrix.getHeight(); y += 1) {
        for (let x = 0; x < matrix.getWidth(); x += 1) {
          if (matrix.get(x, y)) {
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }

      setDataUrl(canvas.toDataURL("image/png"));
    } catch {
      setDataUrl(null);
    }
  }, [safePayload, size]);

  return (
    <div className={className}>
      {dataUrl ? (
        <img
          src={dataUrl}
          alt="QR đăng ký tài khoản"
          className="w-full h-full object-contain"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full rounded-lg bg-muted/40 animate-pulse" />
      )}
    </div>
  );
}
