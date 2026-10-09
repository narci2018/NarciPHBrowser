import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  /** Whether the profile has a proxy at all — what a bulk target knows. */
  proxied: boolean;
  /**
   * The proxy URL when the caller knows it exactly (the info dialog reads
   * it off its inspection); absent for bulk targets, which fall back to
   * `proxied` — coarse, but never wrongly excluding a login that exists.
   */
  proxyUrl?: string | null;
}

interface ProfileExportDialogProps {
  targets: ExportTarget[] | null;
  onOpenChange: (open: boolean) => void;
  onExported: () => void;
}

/** Whether a proxy URL carries a login, the way the engine splits it. */
const hasProxyLogin = (url: string): boolean =>
  url.includes("://") && url.slice(url.indexOf("://") + 3).includes("@");

/** Whether any target in the set can carry a login worth asking about. */
const someLogin = (targets: ExportTarget[]): boolean =>
  targets.some((target) =>
    target.proxyUrl === undefined
      ? target.proxied
      : target.proxyUrl !== null && hasProxyLogin(target.proxyUrl),
  );

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
  targets,
  onOpenChange,
  onExported,
}: ProfileExportDialogProps) {
  const { t } = useTranslation();
  const [includeLogin, setIncludeLogin] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (targets) return;
    setIncludeLogin(false);
    setBusy(false);
  }, [targets]);

  if (!targets || targets.length === 0) return null;

  const single = targets.length === 1 ? targets[0] : null;
  const loginInUse = someLogin(targets);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = single
        ? await invoke<{ cancelled?: boolean; path?: string; count?: number }>(
            "export_profile",
            {
              id: single.id,
              includeProxyLogin: includeLogin,
            },
          )
        : await invoke<{ cancelled?: boolean; path?: string; count?: number }>(
            "export_profiles",
            { ids: targets.map((target) => target.id), includeProxyLogin: includeLogin },
          );
      if (result.cancelled) {
        onOpenChange(false);
        return;
      }
      if (single) {
        toast.success(t("common.exportedProfile", { name: single.name }), {
          description: result.path,
        });
      } else {
        toast.success(
          t("common.exportedProfilesCount", { count: result.count ?? targets.length }),
          { description: result.path },
        );
      }
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
          <DialogTitle>
            {single
              ? t("common.exportProfile", { name: single.name })
              : t("common.exportProfilesCount", { count: targets.length })}
          </DialogTitle>
          <DialogDescription>
            {single
              ? t("common.exportProfileDescription")
              : t("common.exportProfilesDescription", { count: targets.length })}
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
            {t("common.includeProxyLogin")}
          </label>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {loginInUse
              ? includeLogin
                ? t("common.proxyLoginWarning")
                : t("common.proxyNoLogin")
              : t("common.proxyNoLoginToInclude")}
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
            {t("common.cancel")}
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void confirm()}>
            {t("common.export")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
