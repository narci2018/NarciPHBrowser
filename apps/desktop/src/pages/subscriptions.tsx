import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  LuList,
  LuPencil,
  LuPlus,
  LuRefreshCw,
  LuTrash2,
} from "react-icons/lu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Logo } from "@/components/icons/logo";
import { ProfilePickerDialog } from "@/components/profile-picker-dialog";
import { SubscriptionFormDialog, type SubscriptionFormValue } from "@/components/subscription-form-dialog";
import { SubscriptionNodesDialog } from "@/components/subscription-nodes-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { relativeTime } from "@/lib/proxies";
import {
  listSubscriptions,
  maskSubscriptionUrl,
  type SubscriptionRow,
} from "@/lib/subscriptions";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 44;

export function SubscriptionsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SubscriptionRow | null>(null);
  const [nodesTarget, setNodesTarget] = useState<SubscriptionRow | null>(null);
  const [assignNode, setAssignNode] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubscriptionRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await listSubscriptions();
      setRows(next.filter((sub) => !sub.id.startsWith("builtin-")));
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitForm = async (value: SubscriptionFormValue) => {
    if (editing) {
      await invoke("update_subscription", { id: editing.id, spec: value });
      toast.success(t("common.savedNamed", { name: value.name }));
    } else {
      await invoke("create_subscription", { spec: value });
      toast.success(t("common.addedNamed", { name: value.name }));
    }
    await refresh();
    setFormOpen(false);
    setEditing(null);
  };

  const updateNodes = async (row: SubscriptionRow) => {
    setBusyId(row.id);
    try {
      const result = await invoke<{ nodes: unknown[] }>("refresh_subscription", { id: row.id });
      toast.success(t("common.updatedNodes", { count: result.nodes.length }));
      await refresh();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusyId(null);
    }
  };

  const assignNodeToProfile = async (profileId: string) => {
    const subscriptionId = nodesTarget?.id;
    if (!assignNode || !subscriptionId) return;
    try {
      await invoke("assign_node", {
        payload: { profile_ids: [profileId], subscription_id: subscriptionId, node: assignNode },
      });
      toast.success(t("common.assignedNamed", { name: assignNode }));
    } catch (error) {
      toast.error(String(error));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await invoke("delete_subscription", { id: deleteTarget.id });
      toast.success(t("common.deletedNamed", { name: deleteTarget.name }));
      setDeleteTarget(null);
      await refresh();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="text-xs text-muted-foreground">
          {t("common.subscriptionCount", { count: rows.length })}
        </span>
        <div className="flex-1" />
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <LuPlus className="size-3.5" />
          {t("common.addSubscription")}
        </Button>
      </div>

      <div className="scroll-fade relative min-h-0 min-w-0 flex-1 overflow-auto">
        <Table className="table-fixed" containerClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-0">
            <TableRow className="border-0! hover:bg-transparent">
              <TableHead className="pl-3">{t("common.name")}</TableHead>
              <TableHead className="w-[110px]">{t("common.nodes")}</TableHead>
              <TableHead className="w-[280px]">{t("common.url")}</TableHead>
              <TableHead className="w-[140px]">{t("common.updated")}</TableHead>
              <TableHead className="w-[152px] pr-3 text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="overflow-visible">
            {loading && rows.length === 0 ? (
              Array.from({ length: 4 }, (_, index) => (
                <TableRow key={`skeleton-${index}`} className="border-0!" style={{ height: ROW_HEIGHT }}>
                  <TableCell colSpan={5} className="py-0 pl-3">
                    <Skeleton className="h-3" style={{ width: `${30 + ((index * 17) % 40)}%` }} />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="border-0! hover:bg-transparent">
                <TableCell colSpan={5} className="py-16">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <Logo className="size-12 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {t("common.noSubscriptionsYet")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("common.noSubscriptionsHint")}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="mt-1"
                      onClick={() => {
                        setEditing(null);
                        setFormOpen(true);
                      }}
                    >
                      {t("common.addFirstSubscription")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-subscription-id={row.id}
                  style={{ height: ROW_HEIGHT }}
                  className={cn("group/row border-0! hover:bg-muted")}
                >
                  <TableCell className="min-w-0 pl-3">
                    <button
                      type="button"
                      onClick={() => {
                        setNodesTarget(row);
                      }}
                      className="block max-w-full truncate text-left text-sm font-medium text-foreground hover:underline"
                    >
                      {row.name}
                    </button>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {row.node_count != null ? row.node_count : "—"}
                  </TableCell>
                  <TableCell className="truncate font-mono text-xs text-muted-foreground" title={row.url}>
                    {maskSubscriptionUrl(row.url)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.updated_at ? relativeTime(row.updated_at) : t("common.never")}
                  </TableCell>
                  <TableCell className="pr-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        aria-label={t("common.openNodesFor", { name: row.name })}
                        onClick={() => {
                          setNodesTarget(row);
                        }}
                        className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <LuList className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={t("common.updateNamed", { name: row.name })}
                        disabled={busyId === row.id}
                        onClick={() => void updateNodes(row)}
                        className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <LuRefreshCw className={cn("size-3.5", busyId === row.id && "animate-spin")} />
                      </button>
                      <button
                        type="button"
                        aria-label={t("common.editNamed", { name: row.name })}
                        onClick={() => {
                          setEditing(row);
                          setFormOpen(true);
                        }}
                        className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <LuPencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={t("common.deleteNamed", { name: row.name })}
                        onClick={() => {
                          setDeleteTarget(row);
                        }}
                        className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <LuTrash2 className="size-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <SubscriptionFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        subscription={editing}
        onSubmit={submitForm}
      />

      <SubscriptionNodesDialog
        open={nodesTarget !== null}
        onOpenChange={(open) => {
          if (!open) setNodesTarget(null);
        }}
        subscription={nodesTarget}
        onAssign={(node) => {
          setAssignNode(node);
        }}
        onRefreshed={() => {
          void refresh();
        }}
      />

      <ProfilePickerDialog
        open={assignNode !== null}
        onOpenChange={(open) => {
          if (!open) setAssignNode(null);
        }}
        onPick={(profileId) => {
          setAssignNode(null);
          void assignNodeToProfile(profileId);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? t("common.deleteSubscriptionTitle", { name: deleteTarget.name }) : ""}
        description={t("common.deleteSubscriptionDescription")}
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
