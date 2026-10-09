import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { LuPlus, LuPuzzle, LuTrash2 } from "react-icons/lu";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProfileSummary } from "@narc/sdk";

interface ExtensionsPageProps {
  profiles: ProfileSummary[];
  /** Called after a profile's addons change, so count columns re-settle. */
  onProfilesChanged: () => void;
}

/**
 * The Extensions page: which profiles load which browser extensions.
 *
 * An addon is a path to an `.xpi` file or an unpacked addon directory; the
 * engine loads the ones it finds at launch and skips the rest with a warning.
 * One profile at a time is managed, from a dialog that shows the live list —
 * the count column here re-settles through `onProfilesChanged` after each
 * change, so the table never lies about what a profile carries.
 */
export function ExtensionsPage({ profiles, onProfilesChanged }: ExtensionsPageProps) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<ProfileSummary | null>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) {
      setAddons([]);
      return;
    }
    let cancelled = false;
    void invoke<{ profile: { addons?: string[] } }>("inspect_profile", { id: target.id })
      .then((result) => {
        if (!cancelled) setAddons(result.profile.addons ?? []);
      })
      .catch((error) => {
        toast.error(String(error));
        setTarget(null);
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  const addAddon = useCallback(async () => {
    if (!target || !path.trim()) return;
    setBusy(true);
    try {
      const result = await invoke<{ addons: string[] }>("add_addon", {
        id: target.id,
        path: path.trim(),
      });
      setAddons(result.addons);
      setPath("");
      onProfilesChanged();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  }, [target, path, onProfilesChanged]);

  const removeAddon = useCallback(
    async (addon: string) => {
      if (!target) return;
      setBusy(true);
      try {
        const result = await invoke<{ addons: string[] }>("remove_addon", {
          id: target.id,
          path: addon,
        });
        setAddons(result.addons);
        onProfilesChanged();
      } catch (error) {
        toast.error(String(error));
      } finally {
        setBusy(false);
      }
    },
    [target, onProfilesChanged],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center border-b border-border px-4 py-2.5">
        <span className="text-xs text-muted-foreground">
          {t("common.usageCount", { count: profiles.length})}
        </span>
        <div className="flex-1" />
      </div>

      <div className="scroll-fade relative min-h-0 min-w-0 flex-1 overflow-auto">
        <Table className="table-fixed" containerClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-0">
            <TableRow className="border-0! hover:bg-transparent">
              <TableHead className="pl-3">{t("common.profileColumn")}</TableHead>
              <TableHead className="w-[110px]">{t("common.extensionsColumn")}</TableHead>
              <TableHead className="w-[140px] pr-3 text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="overflow-visible">
            {profiles.length === 0 ? (
              <TableRow className="border-0! hover:bg-transparent">
                <TableCell colSpan={3} className="py-16">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <LuPuzzle className="size-12 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{t("common.noProfilesYet")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("common.noProfilesForExtensions")}
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              profiles.map((profile) => (
                <TableRow
                  key={profile.id}
                  className="group/row border-0! hover:bg-muted"
                >
                  <TableCell className="min-w-0 pl-3">
                    <div className="block max-w-full truncate text-sm font-medium text-foreground">
                      {profile.name}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {profile.addon_count}
                  </TableCell>
                  <TableCell className="pr-3">
                    <div className="flex items-center justify-end">
                      <Button size="sm" variant="outline" onClick={() => setTarget(profile)}>
                        <LuPuzzle className="size-3.5" />
                        {t("common.manageExtensions")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("common.extensionsTitle", { name: target?.name })}</DialogTitle>
            <DialogDescription>
              {t("common.extensionsDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {addons.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                {t("common.noExtensionsYet")}
              </p>
            ) : (
              addons.map((addon) => (
                <div
                  key={addon}
                  className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground" title={addon}>
                    {addon}
                  </span>
                  <button
                    type="button"
                    aria-label={t("common.removeExtension", { name: addon })}
                    disabled={busy}
                    onClick={() => void removeAddon(addon)}
                    className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <LuTrash2 className="size-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Input
              value={path}
              placeholder={t("common.extensionPathPlaceholder")}
              onChange={(event) => setPath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addAddon();
              }}
              className="font-mono text-xs"
            />
            <Button type="button" size="sm" disabled={busy || !path.trim()} onClick={() => void addAddon()}>
              <LuPlus className="size-3.5" />
              {t("common.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
