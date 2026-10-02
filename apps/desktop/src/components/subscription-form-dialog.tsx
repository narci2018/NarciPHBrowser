import { useEffect, useState } from "react";
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
  const error = !name.trim() ? "A name is required" : !urlValid ? "The URL must start with http:// or https://" : null;

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
          <DialogTitle>{editing ? "Edit subscription" : "Add subscription"}</DialogTitle>
          <DialogDescription>
            A subscription URL the proxy core fetches and turns into nodes. The core supports
            every protocol it knows — VLESS, VMess, Trojan, Shadowsocks, Hysteria2, TUIC and more.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="subscription-name">Name</Label>
            <Input
              id="subscription-name"
              autoFocus
              placeholder="e.g. Main airport"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="subscription-url">Subscription URL</Label>
            <Input
              id="subscription-url"
              placeholder="https://example.com/api/v1/client/subscribe?token=…"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              Fetched by the core, not this window. The URL is stored locally and never leaves
              the machine except to the provider.
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
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save changes" : "Add subscription"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
