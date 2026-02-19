import { Component, ErrorInfo, ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || "Unknown error",
    };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {}

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-sm w-full rounded-xl border border-destructive/30 bg-card p-4 space-y-3">
            <h1 className="text-base font-semibold text-foreground">Ứng dụng gặp lỗi</h1>
            <p className="text-sm text-muted-foreground break-words">{this.state.message}</p>
            <button
              onClick={this.handleReload}
              className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
