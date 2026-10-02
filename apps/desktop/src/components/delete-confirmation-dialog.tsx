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
            This permanently removes <span className="font-medium text-foreground">{profileName}</span>{" "}
            from the store.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <LuTriangleAlert className="size-4" />
          <AlertTitle>Browser data is destroyed with it</AlertTitle>
          <AlertDescription>
            Cookies, storage and the profile's history live inside the profile
            directory. Deleting the profile deletes them.
          </AlertDescription>
        </Alert>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={onConfirm}>
            {busy ? "Deleting…" : "Delete profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
