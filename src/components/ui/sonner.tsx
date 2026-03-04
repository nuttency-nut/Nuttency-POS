import { Toaster as SileoToaster, sileo, type SileoOptions } from "sileo";
import "sileo/styles.css";

type ToasterProps = React.ComponentProps<typeof SileoToaster>;
type ToastOptions = Omit<SileoOptions, "title">;
type ToastPayload = SileoOptions & { id: string };

const MIN_TOAST_DURATION_MS = 2400;
const MAX_TOAST_DURATION_MS = 11000;
const TOAST_READING_CHARS_PER_SECOND = 13;
const TOAST_BUFFER_MS = 1300;
const LONG_TOAST_TITLE_THRESHOLD = 52;

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

function createToastPayload(
  title: string,
  options?: ToastOptions,
  kind: "success" | "error" | "info" | "warning" = "info",
): ToastPayload {
  const normalizedTitle = normalizeToastText(title);
  const isLong = normalizedTitle.length > LONG_TOAST_TITLE_THRESHOLD;
  const fallbackTitle =
    kind === "success"
      ? "Th\u00e0nh c\u00f4ng"
      : kind === "error"
        ? "L\u1ed7i"
        : kind === "warning"
          ? "C\u1ea3nh b\u00e1o"
          : "Th\u00f4ng b\u00e1o";

  const { description, duration, ...restOptions } = options ?? {};
  const safeTitle = normalizedTitle || fallbackTitle;
  const safeDescription = typeof description === "string" ? normalizeToastText(description) : description;
  const resolvedTitle = isLong ? fallbackTitle : safeTitle;
  const resolvedDescription = isLong ? safeTitle : safeDescription;
  const resolvedDuration = duration !== undefined ? duration : getAdaptiveDurationMs(resolvedTitle, resolvedDescription);
  const resolvedAutopilot =
    restOptions.autopilot !== undefined
      ? restOptions.autopilot
      : {
          expand: 120,
          // Keep expanded almost until toast dismisses so long messages remain readable.
          collapse: Math.max(2000, resolvedDuration - 600),
        };

  return {
    ...restOptions,
    title: resolvedTitle,
    description: resolvedDescription,
    duration: resolvedDuration,
    autopilot: resolvedAutopilot,
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
  success: (title: string, options?: ToastOptions) => sileo.success(createToastPayload(title, options, "success")),
  error: (title: string, options?: ToastOptions) => sileo.error(createToastPayload(title, options, "error")),
  info: (title: string, options?: ToastOptions) => sileo.info(createToastPayload(title, options, "info")),
  warning: (title: string, options?: ToastOptions) => sileo.warning(createToastPayload(title, options, "warning")),
  dismiss: sileo.dismiss,
  clear: sileo.clear,
};

export { Toaster };
