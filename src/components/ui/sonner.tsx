import { Toaster as SileoToaster, sileo, type SileoOptions } from "sileo";
import "sileo/styles.css";

type ToasterProps = React.ComponentProps<typeof SileoToaster>;
type ToastOptions = Omit<SileoOptions, "title"> & {
  compactTitle?: boolean;
};
type ToastPayload = SileoOptions & { id: string };
type ToastKind = "success" | "error" | "info" | "warning";

const MIN_TOAST_DURATION_MS = 2400;
const MAX_TOAST_DURATION_MS = 10000;
const TOAST_READING_CHARS_PER_SECOND = 14;
const TOAST_BUFFER_MS = 1200;
const MIN_EXPANDED_VIEW_MS = 2200;
const TITLE_BY_KIND: Record<ToastKind, string> = {
  success: "Th\u00e0nh c\u00f4ng",
  error: "L\u1ed7i",
  warning: "C\u1ea3nh b\u00e1o",
  info: "Th\u00f4ng b\u00e1o",
};
const DETAIL_PREFIX_BY_KIND: Record<ToastKind, RegExp[]> = {
  success: [/^th\u00e0nh c\u00f4ng\s*:\s*/i, /^success\s*:\s*/i],
  error: [/^l\u1ed7i\s*:\s*/i, /^error\s*:\s*/i],
  warning: [/^c\u1ea3nh b\u00e1o\s*:\s*/i, /^warning\s*:\s*/i],
  info: [/^th\u00f4ng b\u00e1o\s*:\s*/i, /^info\s*:\s*/i],
};

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

function stripStatusPrefix(kind: ToastKind, text: string) {
  const normalizedText = normalizeToastText(text);
  return DETAIL_PREFIX_BY_KIND[kind].reduce(
    (acc, pattern) => acc.replace(pattern, "").trim(),
    normalizedText,
  );
}

function createToastPayload(kind: ToastKind, detail: string, options?: ToastOptions): ToastPayload {
  const normalizedDetail = stripStatusPrefix(kind, detail);
  const { compactTitle, description, duration, autopilot, ...restOptions } = options ?? {};
  const optionsDescription = typeof description === "string" ? normalizeToastText(description) : description;
  const resolvedTitle = compactTitle ? (normalizedDetail || TITLE_BY_KIND[kind]) : TITLE_BY_KIND[kind];
  const resolvedDescription = compactTitle ? optionsDescription : optionsDescription ?? (normalizedDetail || undefined);
  const resolvedDuration = duration ?? getAdaptiveDurationMs(resolvedTitle, resolvedDescription);
  const resolvedAutopilot =
    autopilot ??
    (resolvedDescription
      ? {
          expand: 120,
          collapse: Math.max(MIN_EXPANDED_VIEW_MS, resolvedDuration - 500),
        }
      : undefined);

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
      bottom: "calc(env(safe-area-inset-bottom, 0px) + var(--toast-offset-bottom, 76px))",
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
  success: (detail: string, options?: ToastOptions) => sileo.success(createToastPayload("success", detail, options)),
  error: (detail: string, options?: ToastOptions) => sileo.error(createToastPayload("error", detail, options)),
  info: (detail: string, options?: ToastOptions) => sileo.info(createToastPayload("info", detail, options)),
  warning: (detail: string, options?: ToastOptions) => sileo.warning(createToastPayload("warning", detail, options)),
  dismiss: sileo.dismiss,
  clear: sileo.clear,
};

export { Toaster };
