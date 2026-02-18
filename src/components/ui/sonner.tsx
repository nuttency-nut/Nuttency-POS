import { Toaster as SileoToaster, sileo, type SileoOptions } from "sileo";
import "sileo/styles.css";

type ToasterProps = React.ComponentProps<typeof SileoToaster>;
type ToastOptions = Omit<SileoOptions, "title">;

const Toaster = ({ ...props }: ToasterProps) => (
  <SileoToaster
    position="top-right"
    offset={{ top: 12, right: 12, bottom: 12, left: 12 }}
    options={{
      duration: 3200,
      roundness: 18,
      fill: "hsl(var(--card))",
      autopilot: { expand: 1800, collapse: 500 },
    }}
    {...props}
  />
);

export const toast = {
  success: (title: string, options?: ToastOptions) => sileo.success({ title, ...options }),
  error: (title: string, options?: ToastOptions) => sileo.error({ title, ...options }),
  info: (title: string, options?: ToastOptions) => sileo.info({ title, ...options }),
  warning: (title: string, options?: ToastOptions) => sileo.warning({ title, ...options }),
  dismiss: sileo.dismiss,
  clear: sileo.clear,
};

export { Toaster };
