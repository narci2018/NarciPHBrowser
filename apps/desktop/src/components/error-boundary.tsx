import { Component, type ErrorInfo, type ReactNode } from "react";
import { withTranslation, type WithTranslation } from "react-i18next";
import { LuRefreshCw, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps extends WithTranslation {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches a render-time throw from anywhere below it. Without a boundary a
 * single bad render unmounts the whole tree and the window goes blank, with no
 * way back short of killing the process — this keeps the failure legible and
 * offers a reload.
 *
 * The profiles, proxies and subscriptions live on disk, so nothing is lost by
 * reloading; the message below is the only place the error surfaces.
 */
class ErrorBoundaryBase extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("unhandled render error", error, info.componentStack);
  }

  private readonly reload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { t } = this.props;
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background px-8 text-center text-foreground">
        <div className="grid size-11 place-items-center rounded-lg border border-border bg-muted/50 text-muted-foreground">
          <LuTriangleAlert className="size-5" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">{t("common.crashTitle")}</p>
          <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
            {t("common.crashDescription")}
          </p>
        </div>
        <pre className="max-h-40 w-full max-w-lg overflow-auto rounded-md border border-border bg-muted/40 p-2.5 text-left font-mono text-[11px] break-words whitespace-pre-wrap text-muted-foreground">
          {error.message}
        </pre>
        <Button size="sm" onClick={this.reload}>
          <LuRefreshCw />
          {t("common.crashReload")}
        </Button>
      </div>
    );
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryBase);
