import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LuTriangleAlert } from "react-icons/lu";

interface DeleteConfirmationDialogProps {
  open: boolean;
  profileName: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmationDialog({
  open,
  profileName,
  busy,
  onConfirm,
  onCancel,
}: DeleteConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete profile</DialogTitle>
          <DialogDescription>
            Moves <span className="font-medium text-foreground">{profileName}</span> to the
            store's trash, and it can be restored from there.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <LuTriangleAlert className="size-4" />
          <AlertTitle>The proxy assignment is let go</AlertTitle>
          <AlertDescription>
            The profile keeps its browser data in the trash — cookies, sessions, history all
            come back on restore. Its proxy assignment does not; assign one again after
            restoring.
          </AlertDescription>
        </Alert>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={onConfirm}>
            {busy ? "Moving…" : "Move to trash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
