import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { LuRotateCcw, LuTrash2 } from "react-icons/lu";
import type { TrashedProfile } from "@narc/sdk";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TrashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

const dayOf = (unixSeconds: number): string =>
  new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

/**
 * The store's trash: profiles that were deleted and can still come back.
 *
 * Deleting a profile removes its browser data with it, and that data —
 * cookies, a logged-in session, history — is the part no one can re-create
 * from the seed. So a delete lands here instead, and the two ways out are
 * explicit: restore, or purge for good.
 *
 * A restored profile does not get its proxy assignment back: trashing it let
 * go of the proxy, and re-claiming one the user gave away is a decision the
 * app makes for no one. Assign it again after restoring.
 */
export function TrashDialog({ open, onOpenChange, onChanged }: TrashDialogProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<TrashedProfile[] | null>(null);

  const refresh = async () => {
    try {
      const result = await invoke<TrashedProfile[]>("list_trash", {});
      setEntries(result);
    } catch (error) {
      toast.error(String(error));
    }
  };

  useEffect(() => {
    if (open) {
      setEntries(null);
      void refresh();
    }
  }, [open]);

  const restore = async (id: string) => {
    try {
      const result = await invoke<{ id: string; name: string }>("restore_profile", { id });
      toast.success(t("common.restoredProfile", { name: result.name }), {
        description: t("common.restoredProfileHint"),
      });
      await refresh();
      onChanged();
    } catch (error) {
      toast.error(String(error));
    }
  };

  const purge = async (id: string, name: string) => {
    try {
      await invoke("purge_trash", { id });
      toast.success(t("common.purgedProfile", { name }));
      await refresh();
      onChanged();
    } catch (error) {
      toast.error(String(error));
    }
  };

  const empty = async () => {
    try {
      const result = await invoke<{ purged: number }>("purge_all_trash", {});
      toast.success(t("common.emptiedTrash", { count: result.purged }));
      await refresh();
      onChanged();
    } catch (error) {
      toast.error(String(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[70vh] max-w-lg flex-col gap-0 overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t("common.trashTitle")}</DialogTitle>
          <DialogDescription>
            {t("common.trashDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto py-2">
          {entries === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("common.trashLoading")}</p>
          ) : entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("common.trashEmpty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{entry.name}</p>
                      {!entry.readable && (
                        <Badge variant="outline" className="text-[10px]">
                          {t("common.unreadable")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {t("common.seedLabel", { seed: entry.seed })} · {t("common.trashedLabel", { date: dayOf(entry.trashed_at) })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!entry.readable}
                    className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => void restore(entry.id)}
                  >
                    <LuRotateCcw className="size-3" />
                    {t("common.restore")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => void purge(entry.id, entry.name)}
                  >
                    <LuTrash2 className="size-3" />
                    {t("common.purge")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {entries !== null && entries.length > 0 && (
          <div className="flex justify-end border-t border-border py-2">
            <Button type="button" variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => void empty()}>
              {t("common.emptyTrash")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
