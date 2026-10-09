import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("common.deleteProfileTitle")}</DialogTitle>
          <DialogDescription>
            {t("common.deleteProfileDescription", { name: profileName })}
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <LuTriangleAlert className="size-4" />
          <AlertTitle>{t("common.deleteProfileAlertTitle")}</AlertTitle>
          <AlertDescription>
            {t("common.deleteProfileAlertDescription")}
          </AlertDescription>
        </Alert>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={onConfirm}>
            {busy ? t("common.moving") : t("common.moveToTrash")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
