import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SubscriptionRow } from "@/lib/subscriptions";

export interface SubscriptionFormValue {
  name: string;
  url: string;
}

interface SubscriptionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The subscription being edited, or `null` to add one. */
  subscription: SubscriptionRow | null;
  onSubmit: (value: SubscriptionFormValue) => Promise<void>;
}

export function SubscriptionFormDialog({
  open,
  onOpenChange,
  subscription,
  onSubmit,
}: SubscriptionFormDialogProps) {
  const { t } = useTranslation();
  const editing = subscription !== null;
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setUrl("");
      setTouched(false);
      setBusy(false);
      return;
    }
    setName(subscription?.name ?? "");
    setUrl(subscription?.url ?? "");
  }, [open, subscription]);

  const urlValid = url.trim().startsWith("http://") || url.trim().startsWith("https://");
  const error = !name.trim() ? t("common.subscriptionNameRequired") : !urlValid ? t("common.subscriptionUrlInvalid") : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (error || busy) return;
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), url: url.trim() });
    } catch {
      // The page toasts the failure; keep the dialog open for corrections.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? t("common.editSubscription") : t("common.addSubscription")}</DialogTitle>
          <DialogDescription>
            {t("common.subscriptionDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="subscription-name">{t("common.subscriptionName")}</Label>
            <Input
              id="subscription-name"
              autoFocus
              placeholder={t("common.subscriptionNamePlaceholder")}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="subscription-url">{t("common.subscriptionUrl")}</Label>
            <Input
              id="subscription-url"
              placeholder={t("common.subscriptionUrlPlaceholder")}
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              {t("common.subscriptionUrlHint")}
            </p>
          </div>

          {touched && error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? t("common.saving") : editing ? t("common.saveChanges") : t("common.addSubscription")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
