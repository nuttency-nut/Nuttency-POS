import { Toaster as SileoToaster, sileo, type SileoOptions } from "sileo";
import "sileo/styles.css";

type ToasterProps = React.ComponentProps<typeof SileoToaster>;
type ToastOptions = Omit<SileoOptions, "title">;
type ToastPayload = SileoOptions & { id: string };

const MIN_TOAST_DURATION_MS = 2400;
const MAX_TOAST_DURATION_MS = 10000;
const TOAST_READING_CHARS_PER_SECOND = 14;
const TOAST_BUFFER_MS = 1200;

function getTextLength(value: unknown) {
  if (typeof value === "string") return value.trim().length;
  if (typeof value === "number" || typeof value === "boolean") return String(value).length;
  return 0;
}

function normalizeToastText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getAdaptiveDurationMs(title: string, description?: React.ReactNode | string) {
  const totalChars = Math.max(1, getTextLength(title) + getTextLength(description));
  const readingMs = Math.ceil((totalChars / TOAST_READING_CHARS_PER_SECOND) * 1000) + TOAST_BUFFER_MS;
  return Math.min(MAX_TOAST_DURATION_MS, Math.max(MIN_TOAST_DURATION_MS, readingMs));
}

function createToastPayload(title: string, options?: ToastOptions): ToastPayload {
  const safeTitle = normalizeToastText(title) || "Th\u00f4ng b\u00e1o";
  const safeDescription = typeof options?.description === "string" ? normalizeToastText(options.description) : options?.description;
  const resolvedDuration = options?.duration ?? getAdaptiveDurationMs(safeTitle, safeDescription);

  return {
    ...options,
    title: safeTitle,
    description: safeDescription,
    duration: resolvedDuration,
    // Force unique id so multiple toasts stack instead of replacing each other.
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

const Toaster = ({ ...props }: ToasterProps) => (
  <SileoToaster
    position="bottom-left"
    offset={{
      bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)",
      left: "max(12px, calc((100vw - min(100vw, 32rem)) / 2 + 12px))",
    }}
    options={{
      duration: MIN_TOAST_DURATION_MS,
      roundness: 18,
      fill: "hsl(var(--card))",
      styles: {
        description: "whitespace-normal break-words text-left",
      },
    }}
    {...props}
  />
);

export const toast = {
  success: (title: string, options?: ToastOptions) => sileo.success(createToastPayload(title, options)),
  error: (title: string, options?: ToastOptions) => sileo.error(createToastPayload(title, options)),
  info: (title: string, options?: ToastOptions) => sileo.info(createToastPayload(title, options)),
  warning: (title: string, options?: ToastOptions) => sileo.warning(createToastPayload(title, options)),
  dismiss: sileo.dismiss,
  clear: sileo.clear,
};

export { Toaster };
