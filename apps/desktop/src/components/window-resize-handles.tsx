import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Mirrors the API's own `ResizeDirection`, which it declares but does not
 * export. Structurally identical, so a drift would fail the call below.
 */
type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

/**
 * Mouse resize areas for a window with no server-side decorations.
 *
 * Without these the window can only be resized through window-manager
 * shortcuts. Each handle hands the pointer to the OS via
 * `startResizeDragging`, so edge snapping and the resize cursor come from the
 * platform exactly as they do for a native window.
 */

/** Top edge only — it overlaps the 44px-tall window controls. */
const TOP_EDGE = "6px";
/** Sides and bottom overlap nothing, so they can be comfortably grabbable. */
const EDGE = "8px";
/** Corners need to win over the edges that overlap them. */
const CORNER = "16px";

interface Handle {
  direction: ResizeDirection;
  style: React.CSSProperties;
  cursor: string;
}

const HANDLES: Handle[] = [
  {
    direction: "North",
    cursor: "ns-resize",
    style: { top: 0, left: CORNER, right: CORNER, height: TOP_EDGE },
  },
  {
    direction: "South",
    cursor: "ns-resize",
    style: { bottom: 0, left: CORNER, right: CORNER, height: EDGE },
  },
  {
    direction: "West",
    cursor: "ew-resize",
    style: { left: 0, top: CORNER, bottom: CORNER, width: EDGE },
  },
  {
    direction: "East",
    cursor: "ew-resize",
    style: { right: 0, top: CORNER, bottom: CORNER, width: EDGE },
  },
  {
    direction: "NorthWest",
    cursor: "nwse-resize",
    style: { top: 0, left: 0, width: CORNER, height: TOP_EDGE },
  },
  {
    direction: "NorthEast",
    cursor: "nesw-resize",
    style: { top: 0, right: 0, width: CORNER, height: TOP_EDGE },
  },
  {
    direction: "SouthWest",
    cursor: "nesw-resize",
    style: { bottom: 0, left: 0, width: CORNER, height: CORNER },
  },
  {
    direction: "SouthEast",
    cursor: "nwse-resize",
    style: { bottom: 0, right: 0, width: CORNER, height: CORNER },
  },
];

export function WindowResizeHandles({ isMaximized }: { isMaximized: boolean }) {
  if (isMaximized) {
    return null;
  }

  const startResize =
    (direction: ResizeDirection) => (e: React.PointerEvent) => {
      if (e.button !== 0) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      void getCurrentWindow()
        .startResizeDragging(direction)
        .catch((error: unknown) => {
          console.error("Failed to start window resize:", error);
        });
    };

  return (
    <>
      {HANDLES.map((handle) => (
        <div
          key={handle.direction}
          className="pointer-events-auto fixed z-[99998]"
          style={{ ...handle.style, cursor: handle.cursor }}
          onPointerDown={startResize(handle.direction)}
          aria-hidden="true"
        />
      ))}
    </>
  );
}
