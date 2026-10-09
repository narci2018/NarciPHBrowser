import { useEffect, useMemo, useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { geoCompatible, maskPassword, type StoredProxy } from "@/lib/proxies";

export interface ProfileSummaryLike {
  id: string;
  name: string;
  country?: string | null;
  proxied?: boolean;
}

interface ProxyAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` removes the proxy (assign "direct") from the chosen profiles. */
  proxy: StoredProxy | null;
  profiles: ProfileSummaryLike[];
  /** Profile ids that arrive pre-selected (row "Assign…" from a usage link). */
  preselected?: string[];
  onAssigned: (updated: number, failed: { id: string; error: string }[]) => void;
}

export function ProxyAssignDialog({
  open,
  onOpenChange,
  proxy,
  profiles,
  preselected,
  onAssigned,
}: ProxyAssignDialogProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(preselected?.length ? [...preselected] : []);
    setBusy(false);
  }, [open, preselected]);

  const rows = useMemo(
    () =>
      profiles.map((profile) => ({
        profile,
        geoMismatch: proxy ? !geoCompatible(proxy.exit_country, profile.country) : false,
      })),
    [profiles, proxy],
  );

  const mismatchIds = useMemo(
    () => new Set(rows.filter((row) => row.geoMismatch).map((row) => row.profile.id)),
    [rows],
  );

  const allIds = profiles.map((profile) => profile.id);
  const allSelected = allIds.length > 0 && selected.length === allIds.length;
  const selectedMismatch = selected.filter((id) => mismatchIds.has(id)).length;

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };

  const submit = async () => {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    try {
      const payload = {
        profile_ids: selected,
        proxy: proxy ? { url: proxy.url, exit_country: proxy.exit_country ?? null } : null,
      };
      const result = await invoke<{
        updated: string[];
        failed: { id: string; error: string }[];
      }>("assign_proxy", { payload });
      const updated = result?.updated.length ?? 0;
      const failed = result?.failed ?? [];
      if (failed.length > 0) {
        toast.error(
          t("common.assignFailed", { count: failed.length}),
        );
      } else {
        toast.success(
          proxy
            ? t("common.assignedTo", { count: updated})
            : t("common.removedProxyFrom", { count: updated}),
        );
      }
      onAssigned(updated, failed);
      onOpenChange(false);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {proxy ? t("common.assignProxyTitle", { name: proxy.name }) : t("common.removeProxy")}
          </DialogTitle>
          <DialogDescription>
            {proxy
              ? t("common.assignProxyDescription", {
                  url: maskPassword(proxy.url),
                  exitInfo: proxy.exit_country
                    ? t("common.assignProxyExit", { country: proxy.exit_country })
                    : t("common.assignProxyNoExit"),
                })
              : t("common.removeProxyDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(state) => {
                  setSelected(state === true ? [...allIds] : []);
                }}
              />
              {t("common.selectAll")}
            </label>
            <span className="text-xs text-muted-foreground">
              {t("common.selectedOf", { selected: selected.length, total: allIds.length })}
            </span>
          </div>

          <ScrollArea className="h-56 rounded-md border border-border">
            <div className="divide-y divide-border">
              {rows.map(({ profile, geoMismatch }) => {
                const checked = selected.includes(profile.id);
                return (
                  <div
                    key={profile.id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-accent/50"
                    onClick={() => {
                      toggle(profile.id);
                    }}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => {
                        toggle(profile.id);
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {profile.name}
                    </span>
                    {profile.proxied && !proxy && (
                      <span className="text-[11px] text-muted-foreground">{t("common.proxied")}</span>
                    )}
                    {geoMismatch && (
                      <span className="shrink-0 rounded-sm border border-warning/50 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning-text">
                        {t("common.countryDiffers")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {selectedMismatch > 0 && (
            <p className="text-[11px] text-warning-text">
              {t("common.geoMismatchWarning", { count: selectedMismatch})}
            </p>
          )}
        </div>

        <DialogFooter>
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
          <Button
            type="button"
            size="sm"
            disabled={selected.length === 0 || busy}
            onClick={() => {
              void submit();
            }}
          >
            {busy
              ? t("common.assigning")
              : proxy
                ? t("common.assignTo", { count: selected.length})
                : t("common.removeFrom", { count: selected.length})}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
