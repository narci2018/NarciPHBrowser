import { type HTMLMotionProps, motion } from "motion/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type * as React from "react";
import { RxCross2 } from "react-icons/rx";

import { MOTION_EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

type DialogProps = React.ComponentProps<typeof DialogPrimitive.Root>;

function Dialog(props: DialogProps) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

type DialogTriggerProps = React.ComponentProps<typeof DialogPrimitive.Trigger>;

function DialogTrigger(props: DialogTriggerProps) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

type DialogPortalProps = React.ComponentProps<typeof DialogPrimitive.Portal>;

function DialogPortal({ children, ...props }: DialogPortalProps) {
  return (
    <DialogPrimitive.Portal data-slot="dialog-portal" {...props}>
      {children}
    </DialogPrimitive.Portal>
  );
}

type DialogOverlayProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Overlay>,
  "asChild"
> &
  HTMLMotionProps<"div">;

function DialogOverlay({ className, ...props }: DialogOverlayProps) {
  return (
    <DialogPrimitive.Overlay data-slot="dialog-overlay" asChild forceMount>
      <motion.div
        key="dialog-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: MOTION_EASE_OUT }}
        className={cn("fixed inset-0 z-9999 bg-background/50", className)}
        {...props}
      />
    </DialogPrimitive.Overlay>
  );
}

type DialogContentProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Content>,
  "asChild"
> &
  HTMLMotionProps<"div"> & {
    /** Suppress the built-in top-right close X. */
    hideClose?: boolean;
    /** When false, Escape and outside clicks are ignored. */
    dismissible?: boolean;
  };

function DialogContent({
  className,
  children,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  hideClose,
  dismissible = true,
  ...props
}: DialogContentProps) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay key="dialog-overlay" />
      <DialogPrimitive.Content
        key="dialog-content"
        asChild
        onEscapeKeyDown={(event) => {
          if (!dismissible) event.preventDefault();
          onEscapeKeyDown?.(event);
        }}
        onPointerDownOutside={onPointerDownOutside}
        onInteractOutside={(event) => {
          if (!dismissible) {
            event.preventDefault();
            return;
          }
          onInteractOutside?.(event);
        }}
      >
        <motion.div
          key="dialog-content"
          data-slot="dialog-content"
          style={{ transformOrigin: "center" }}
          initial={{ scale: 0.985, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.985, opacity: 0 }}
          transition={{ duration: 0.18, ease: MOTION_EASE_OUT }}
          className={cn(
            "fixed top-[50%] left-[50%] z-10000 grid max-h-[calc(100vh-3rem)] w-[calc(100%-2rem)] max-w-lg -translate-[50%] gap-4 overflow-y-auto rounded-lg border bg-background p-6",
            className,
          )}
          {...props}
        >
          {children}
          {!hideClose && dismissible && (
            <DialogPrimitive.Close className="absolute top-4 right-4 cursor-pointer rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
              <RxCross2 />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

type DialogCloseProps = React.ComponentProps<typeof DialogPrimitive.Close>;

function DialogClose(props: DialogCloseProps) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 pr-8 text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex shrink-0 flex-row flex-wrap justify-end gap-2",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
