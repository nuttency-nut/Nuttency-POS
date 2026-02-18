import { Toaster as SileoToaster, sileo, type SileoOptions } from "sileo";
import "sileo/styles.css";

type ToasterProps = React.ComponentProps<typeof SileoToaster>;
type ToastOptions = Omit<SileoOptions, "title">;
type ToastPayload = SileoOptions & { id: string };

function createToastPayload(title: string, options?: ToastOptions): ToastPayload {
  return {
    title,
    ...options,
    // Force unique id so multiple toasts stack instead of replacing each other.
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

const Toaster = ({ ...props }: ToasterProps) => (
  <SileoToaster
    position="bottom-left"
    offset={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)", left: 12 }}
    options={{
      duration: 1800,
      roundness: 18,
      fill: "hsl(var(--card))",
      // Keep all active toasts expanded so new toasts stack at the bottom
      // and older ones are pushed upward (chat-like behavior).
      autopilot: false,
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
