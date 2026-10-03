import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ExportTarget {
  id: string;
  name: string;
  proxyUrl: string | null;
}

interface ProfileExportDialogProps {
  target: ExportTarget | null;
  onOpenChange: (open: boolean) => void;
  onExported: () => void;
}

/** Whether a proxy URL carries a login, the way the engine splits it. */
const hasProxyLogin = (url: string): boolean =>
  url.includes("://") && url.slice(url.indexOf("://") + 3).includes("@");

/**
 * The export dialog: what the file will contain, and one decision about it.
 *
 * The decision is the proxy login. A profile's proxy can carry `user:pass`,
 * and an export is a plain file the user may share, back up or commit, so the
 * default is to leave the login out — the same proxy, anonymous. Including it
 * is opt-in and labelled plainly, because the honest version of "your proxy
 * password will be written to a file in plaintext" is to say it, not to hide
 * it behind a format detail.
 */
export function ProfileExportDialog({
  target,
  onOpenChange,
  onExported,
}: ProfileExportDialogProps) {
  const [includeLogin, setIncludeLogin] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) return;
    setIncludeLogin(false);
    setBusy(false);
  }, [target]);

  if (!target) return null;

  const loginInUse = target.proxyUrl !== null && hasProxyLogin(target.proxyUrl);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await invoke<{ cancelled?: boolean; path?: string }>("export_profile", {
        id: target.id,
        includeProxyLogin: includeLogin,
      });
      if (result.cancelled) {
        onOpenChange(false);
        return;
      }
      toast.success(`Exported ${target.name}`, {
        description: result.path,
      });
      onExported();
      onOpenChange(false);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export {target.name}</DialogTitle>
          <DialogDescription>
            Writes a portable copy of the profile — its seed, options, hand edits, addons and
            proxy. Importing it elsewhere re-draws the same machine; browser data stays behind.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 rounded-md border border-border bg-card px-3 py-2.5">
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={includeLogin}
              disabled={!loginInUse}
              onChange={(event) => {
                setIncludeLogin(event.target.checked);
              }}
              className="size-3.5 accent-current"
            />
            Include the proxy login in the file
          </label>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {loginInUse
              ? includeLogin
                ? "The proxy password will be written into the file as plaintext. Anyone who can read the file can use the proxy as you."
                : "The proxy is exported without its login — same proxy, no password in the file."
              : "This profile's proxy (or lack of one) carries no login, so there is nothing to include."}
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void confirm()}>
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
