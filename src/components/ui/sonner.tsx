import { Toaster as SileoToaster, sileo, type SileoOptions } from "sileo";
import "sileo/styles.css";

type ToasterProps = React.ComponentProps<typeof SileoToaster>;
type ToastOptions = Omit<SileoOptions, "title">;
type ToastPayload = SileoOptions & { id: string };

function createToastPayload(title: string, options?: ToastOptions, kind: "success" | "error" | "info" | "warning" = "info"): ToastPayload {
  const isLong = title.length > 48;
  const fallbackTitle =
    kind === "success"
      ? "Thành công"
      : kind === "error"
        ? "Lỗi"
        : kind === "warning"
          ? "Cảnh báo"
          : "Thông báo";

  return {
    title: isLong ? fallbackTitle : title,
    description: isLong ? title : options?.description,
    ...options,
    // Force unique id so multiple toasts stack instead of replacing each other.
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

const Toaster = ({ ...props }: ToasterProps) => (
  <SileoToaster
    position="bottom-left"
    offset={{
      bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)",
      // Keep toast inside app frame (max-w-lg) on desktop and mobile.
      left: "max(12px, calc((100vw - min(100vw, 32rem)) / 2 + 12px))",
    }}
    options={{
      duration: 1800,
      roundness: 18,
      fill: "hsl(var(--card))",
      // Auto-expand quickly so long messages can wrap in description area.
      autopilot: { expand: 120, collapse: 1200 },
      styles: {
        description: "whitespace-normal break-words text-left max-w-[220px]",
      },
    }}
    {...props}
  />
);

export const toast = {
  success: (title: string, options?: ToastOptions) => sileo.success(createToastPayload(title, options, "success")),
  error: (title: string, options?: ToastOptions) => sileo.error(createToastPayload(title, options, "error")),
  info: (title: string, options?: ToastOptions) => sileo.info(createToastPayload(title, options, "info")),
  warning: (title: string, options?: ToastOptions) => sileo.warning(createToastPayload(title, options, "warning")),
  dismiss: sileo.dismiss,
  clear: sileo.clear,
};

export { Toaster };
