import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { WindowResizeHandles } from "./window-resize-handles";

type WindowControl = "minimize" | "maximize" | "close";

/**
 * The window controls for a frameless window, anchored at the top-right
 * corner of the title bar. The header starts window dragging itself through
 * a press-and-hold pointer gesture, so no drag-region attribute is used here.
 */
export function WindowDragArea() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    let cancelled = false;
    const sync = async () => {
      try {
        const maximized = await win.isMaximized();
        if (!cancelled) setIsMaximized(maximized);
      } catch (error) {
        console.error("Failed to read window maximized state:", error);
      }
    };
    void sync();
    const unlistenPromise = win.onResized(() => {
      void sync();
    });
    return () => {
      cancelled = true;
      void unlistenPromise.then((unlisten) => {
        unlisten();
      });
    };
  }, []);

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (error) {
      console.error("Failed to minimize window:", error);
    }
  };

  const handleToggleMaximize = async () => {
    try {
      await getCurrentWindow().toggleMaximize();
    } catch (error) {
      console.error("Failed to toggle window maximize:", error);
    }
  };

  const handleClose = async () => {
    try {
      await getCurrentWindow().close();
    } catch (error) {
      console.error("Failed to close window:", error);
    }
  };

  const renderControl = (control: WindowControl) => {
    switch (control) {
      case "minimize":
        return (
          <button
            key="minimize"
            type="button"
            onClick={() => {
              void handleMinimize();
            }}
            className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            aria-label="Minimize"
          >
            <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
              <rect width="10" height="1" />
            </svg>
          </button>
        );
      case "maximize":
        return (
          <button
            key="maximize"
            type="button"
            onClick={() => {
              void handleToggleMaximize();
            }}
            className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            aria-label={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? (
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              >
                <rect x="1" y="3" width="6" height="6" />
                <path d="M3 3 V1 H9 V7 H7" />
              </svg>
            ) : (
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              >
                <rect x="1" y="1" width="8" height="8" />
              </svg>
            )}
          </button>
        );
      case "close":
        return (
          <button
            key="close"
            type="button"
            onClick={() => {
              void handleClose();
            }}
            className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
            aria-label="Close"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            >
              <line x1="1" y1="1" x2="9" y2="9" />
              <line x1="9" y1="1" x2="1" y2="9" />
            </svg>
          </button>
        );
    }
  };

  return (
    <>
      <WindowResizeHandles isMaximized={isMaximized} />
      <div
        className="fixed top-0 right-0 z-50 flex h-11 items-center select-none"
        aria-hidden="false"
      >
        {(["minimize", "maximize", "close"] as WindowControl[]).map(
          renderControl,
        )}
      </div>
    </>
  );
}
