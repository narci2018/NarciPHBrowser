import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  LuChevronDown,
  LuChevronUp,
  LuDownload,
  LuNetwork,
  LuPencil,
  LuPlus,
  LuShuffle,
  LuTrash2,
  LuUpload,
  LuX,
} from "react-icons/lu";
import type { ProfileSummary } from "@narc/sdk";
import { Logo } from "@/components/icons/logo";
import { ProxyAssignDialog, type ProfileSummaryLike } from "@/components/proxy-assign-dialog";
import { ProxyCheckCell } from "@/components/proxy-check-cell";
import { ProxyDistributeDialog } from "@/components/proxy-distribute-dialog";
import { ProxyExportDialog } from "@/components/proxy-export-dialog";
import { ProxyFormDialog, type ProxyFormValue } from "@/components/proxy-form-dialog";
import { ProxyImportDialog } from "@/components/proxy-import-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  hostPortOf,
  schemeLabel,
  type ProxyCheck,
  type StoredProxy,
} from "@/lib/proxies";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 44;

interface ProxiesPageProps {
  profiles: ProfileSummary[];
  /** Called after the proxy store changes, so usage columns can re-settle. */
  onProfilesChanged: () => void;
}

function UsageCell({
  proxy,
  onOpenAssign,
  onRemove,
}: {
  proxy: StoredProxy;
  onOpenAssign: (proxy: StoredProxy, preselected: string[]) => void;
  onRemove: (proxy: StoredProxy, profile: ProfileSummaryLike) => void;
}) {
  const { t } = useTranslation();
  const usage = proxy.used_by ?? [];
  if (usage.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="cursor-pointer rounded-sm text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          {t("common.usageCount", { count: usage.length })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">
            {t("common.routedThrough", { name: proxy.name })}
          </p>
          <div className="max-h-44 space-y-0.5 overflow-y-auto">
            {usage.map((profile) => (
              <div
                key={profile.id}
                className="group flex items-center gap-2 rounded-sm px-1.5 py-1 hover:bg-accent/60"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {profile.name}
                </span>
                <button
                  type="button"
                  aria-label={t("common.removeFromProxy", {
                    profile: profile.name,
                    proxy: proxy.name,
                  })}
                  className="grid size-5 shrink-0 cursor-pointer place-items-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => {
                    onRemove(proxy, profile);
                  }}
                >
                  <LuX className="size-3" />
                </button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              onOpenAssign(proxy, usage.map((profile) => profile.id));
            }}
          >
            <LuNetwork className="size-3.5" />
            {t("common.reassign")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ProxiesPage({ profiles, onProfilesChanged }: ProxiesPageProps) {
  const { t } = useTranslation();
  const [proxies, setProxies] = useState<StoredProxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortDesc, setSortDesc] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StoredProxy | null>(null);
  const [assignTarget, setAssignTarget] = useState<StoredProxy | null>(null);
  const [assignPreselected, setAssignPreselected] = useState<string[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [distributeOpen, setDistributeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StoredProxy | "bulk" | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const rows = await invoke<StoredProxy[]>("list_proxies");
      setProxies(rows);
      setSelectedIds((current) =>
        current.filter((id) => rows.some((proxy) => proxy.id === id)),
      );
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rows = useMemo(() => {
    const sorted = [...proxies].sort((a, b) => a.name.localeCompare(b.name));
    return sortDesc ? sorted.reverse() : sorted;
  }, [proxies, sortDesc]);

  const allIds = rows.map((proxy) => proxy.id);
  const allSelected = allIds.length > 0 && selectedIds.length === allIds.length;

  const openAssign = (proxy: StoredProxy, preselected: string[] = []) => {
    setAssignTarget(proxy);
    setAssignPreselected(preselected);
    setAssignOpen(true);
  };

  const submitForm = async (value: ProxyFormValue) => {
    if (editing) {
      const result = await invoke<{ updated_profiles: number }>("update_proxy", {
        id: editing.id,
        spec: value,
      });
      toast.success(
        result.updated_profiles > 0
          ? t("common.savedRewritten", { count: result.updated_profiles })
          : t("common.savedNamed", { name: value.name }),
      );
    } else {
      await invoke("create_proxy", { spec: value });
      toast.success(t("common.createdNamed", { name: value.name }));
    }
    await refresh();
    await onProfilesChanged();
    setFormOpen(false);
    setEditing(null);
  };

  const confirmDelete = async () => {
    if (deleteTarget === null || deleteBusy) return;
    setDeleteBusy(true);
    try {
      if (deleteTarget === "bulk") {
        let done = 0;
        for (const id of selectedIds) {
          await invoke("delete_proxy", { id });
          done += 1;
        }
        toast.success(t("common.deletedProxies", { count: done }));
        setSelectedIds([]);
      } else {
        await invoke("delete_proxy", { id: deleteTarget.id });
        toast.success(t("common.deletedNamed", { name: deleteTarget.name }));
      }
      await refresh();
      await onProfilesChanged();
      setDeleteTarget(null);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setDeleteBusy(false);
    }
  };

  const removeOne = async (proxy: StoredProxy, profile: ProfileSummaryLike) => {
    try {
      await invoke("assign_proxy", {
        payload: { profile_ids: [profile.id], proxy: null },
      });
      toast.success(t("common.noLongerRoutes", { profile: profile.name, proxy: proxy.name }));
      await refresh();
      await onProfilesChanged();
    } catch (error) {
      toast.error(String(error));
    }
  };

  const bulkUsing = useMemo(
    () =>
      proxies.filter(
        (proxy) => selectedIds.includes(proxy.id) && (proxy.used_by ?? []).length > 0,
      ).length,
    [proxies, selectedIds],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="text-xs text-muted-foreground">
          {t("common.proxyCount", { count: rows.length })}
        </span>
        <div className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setImportOpen(true);
          }}
        >
          <LuUpload className="size-3.5" />
          {t("common.import")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={proxies.length === 0}
          onClick={() => {
            setExportOpen(true);
          }}
        >
          <LuDownload className="size-3.5" />
          {t("common.export")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={proxies.length < 2 || profiles.length === 0}
          onClick={() => {
            setDistributeOpen(true);
          }}
        >
          <LuShuffle className="size-3.5" />
          {t("common.distribute")}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <LuPlus className="size-3.5" />
          {t("common.newProxy")}
        </Button>
      </div>

      <div className="scroll-fade relative min-h-0 min-w-0 flex-1 overflow-auto">
        <Table className="table-fixed" containerClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-0">
            <TableRow className="border-0! hover:bg-transparent">
              <TableHead className="w-10 pl-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(state) => {
                    setSelectedIds(state === true ? [...allIds] : []);
                  }}
                />
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  onClick={() => {
                    setSortDesc((value) => !value);
                  }}
                  className="flex cursor-pointer items-center gap-1 text-left font-semibold transition-colors hover:text-foreground"
                >
                  {t("common.name")}
                  {sortDesc ? (
                    <LuChevronDown className="size-3.5" />
                  ) : (
                    <LuChevronUp className="size-3.5" />
                  )}
                </button>
              </TableHead>
              <TableHead className="w-[120px]">{t("common.protocol")}</TableHead>
              <TableHead className="w-[200px]">{t("common.host")}</TableHead>
              <TableHead className="w-[76px]">{t("common.exit")}</TableHead>
              <TableHead className="w-[130px]">{t("common.usage")}</TableHead>
              <TableHead className="w-[64px]">{t("common.check")}</TableHead>
              <TableHead className="w-[112px] pr-3 text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="overflow-visible">
            {loading && rows.length === 0 ? (
              Array.from({ length: 5 }, (_, index) => (
                <TableRow
                  key={`skeleton-${index}`}
                  className="border-0!"
                  style={{ height: ROW_HEIGHT }}
                >
                  <TableCell colSpan={8} className="py-0 pl-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-3 w-3" />
                      <Skeleton className="h-3" style={{ width: `${30 + ((index * 17) % 40)}%` }} />
                      <div className="flex-1" />
                      <Skeleton className="h-3 w-14" />
                      <Skeleton className="h-3 w-10" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="border-0! hover:bg-transparent">
                <TableCell colSpan={8} className="py-16">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <Logo className="size-12 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {t("common.noProxiesYet")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{t("common.noProxiesHint")}</p>
                    </div>
                    <div className="mt-1 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setEditing(null);
                          setFormOpen(true);
                        }}
                      >
                        {t("common.addFirstProxy")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setImportOpen(true);
                        }}
                      >
                        {t("common.import")}
                      </Button>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((proxy) => {
                const checked = selectedIds.includes(proxy.id);
                return (
                  <TableRow
                    key={proxy.id}
                    data-proxy-id={proxy.id}
                    style={{ height: ROW_HEIGHT }}
                    className={cn("group/row border-0! hover:bg-muted", checked && "bg-muted/60")}
                  >
                    <TableCell className="py-0 pl-3">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => {
                          setSelectedIds((current) =>
                            current.includes(proxy.id)
                              ? current.filter((value) => value !== proxy.id)
                              : [...current, proxy.id],
                          );
                        }}
                      />
                    </TableCell>
                    <TableCell className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {proxy.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {schemeLabel(proxy.url)}
                      </Badge>
                    </TableCell>
                    <TableCell className="truncate font-mono text-xs text-muted-foreground">
                      {hostPortOf(proxy.url)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {proxy.exit_country ?? "—"}
                    </TableCell>
                    <TableCell>
                      <UsageCell
                        proxy={proxy}
                        onOpenAssign={(target, preselected) => {
                          openAssign(target, preselected);
                        }}
                        onRemove={(target, profile) => void removeOne(target, profile)}
                      />
                    </TableCell>
                    <TableCell className="py-0">
                      <ProxyCheckCell
                        proxy={proxy}
                        onChecked={(check: ProxyCheck) => {
                          setProxies((current) =>
                            current.map((row) =>
                              row.id === proxy.id ? { ...row, last_check: check } : row,
                            ),
                          );
                        }}
                      />
                    </TableCell>
                    <TableCell className="pr-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={t("common.assignNamed", { name: proxy.name })}
                              onClick={() => {
                                openAssign(proxy);
                              }}
                              className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                              <LuNetwork className="size-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{t("common.assignProxy")}</TooltipContent>
                        </Tooltip>
                        <button
                          type="button"
                          aria-label={t("common.editNamed", { name: proxy.name })}
                          onClick={() => {
                            setEditing(proxy);
                            setFormOpen(true);
                          }}
                          className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          <LuPencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={t("common.deleteNamed", { name: proxy.name })}
                          onClick={() => {
                            setDeleteTarget(proxy);
                          }}
                          className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <LuTrash2 className="size-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 border-t border-border bg-background px-4 py-2">
          <span className="text-xs text-muted-foreground">
            {t("common.selectedCount", { count: selectedIds.length })}
          </span>
          <div className="flex-1" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedIds([]);
            }}
          >
            {t("common.clear")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              setDeleteTarget("bulk");
            }}
          >
            <LuTrash2 className="size-3.5" />
            {t("common.deleteCount", { count: selectedIds.length })}
          </Button>
        </div>
      )}

      <ProxyFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        proxy={editing}
        onSubmit={submitForm}
      />

      <ProxyAssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        proxy={assignTarget}
        profiles={profiles}
        preselected={assignPreselected}
        onAssigned={() => {
          void refresh();
          void onProfilesChanged();
        }}
      />

      <ProxyDistributeDialog
        open={distributeOpen}
        onOpenChange={setDistributeOpen}
        proxies={proxies}
        profiles={profiles}
        onDone={() => {
          void refresh();
          void onProfilesChanged();
        }}
      />

      <ProxyImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => {
          void refresh();
        }}
      />

      <ProxyExportDialog open={exportOpen} onOpenChange={setExportOpen} proxies={proxies} />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={
          deleteTarget === "bulk"
            ? t("common.deleteProxies", { count: selectedIds.length })
            : deleteTarget
              ? t("common.deleteProxy", { name: deleteTarget.name })
              : ""
        }
        description={
          deleteTarget === "bulk" ? (
            <>
              {bulkUsing > 0 ? `${t("common.deleteBulkWarning", { count: bulkUsing })} ` : ""}
              {t("common.cannotBeUndone")}
            </>
          ) : deleteTarget && (deleteTarget.used_by ?? []).length > 0 ? (
            t("common.deleteProxyWarning", { count: (deleteTarget.used_by ?? []).length })
          ) : (
            t("common.cannotBeUndone")
          )
        }
        busy={deleteBusy}
        onConfirm={() => {
          void confirmDelete();
        }}
        onCancel={() => {
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
