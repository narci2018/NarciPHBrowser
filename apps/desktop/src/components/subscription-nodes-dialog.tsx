import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  LuActivity,
  LuDownload,
  LuLoaderCircle,
  LuRefreshCw,
  LuSearch,
  LuUserPlus,
} from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  delayTone,
  listSubscriptionNodes,
  refreshSubscription,
  runPool,
  testNodeDelay,
  testNodeSpeed,
  type NodeResult,
  type SubscriptionNode,
  type SubscriptionRow,
} from "@/lib/subscriptions";
import { cn } from "@/lib/utils";

const DELAY_TONE: Record<"fast" | "ok" | "slow" | "none", string> = {
  fast: "text-success-text",
  ok: "text-foreground",
  slow: "text-warning-text",
  none: "text-muted-foreground",
};

interface SubscriptionNodesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: SubscriptionRow | null;
  /** Called when the user wants to assign a node to a profile. */
  onAssign: (node: string) => void;
  /** Called after a refresh, so the list's node count can settle. */
  onRefreshed: () => void;
}

export function SubscriptionNodesDialog({
  open,
  onOpenChange,
  subscription,
  onAssign,
  onRefreshed,
}: SubscriptionNodesDialogProps) {
  const [nodes, setNodes] = useState<SubscriptionNode[]>([]);
  const [results, setResults] = useState<Record<string, NodeResult>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [batchLatency, setBatchLatency] = useState(false);
  const [batchSpeed, setBatchSpeed] = useState(false);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const id = subscription?.id ?? null;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const next = await listSubscriptionNodes(id);
      setNodes(next);
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!open) return;
    setNodes([]);
    setResults({});
    setFilter("");
    setError(null);
    void load();
  }, [open, id, load]);

  const patch = useCallback((node: string, change: Partial<NodeResult>) => {
    setResults((current) => ({ ...current, [node]: { ...current[node], ...change } }));
  }, []);

  const measureDelay = useCallback(
    async (node: string) => {
      if (!id) return;
      patch(node, { testingDelay: true, delayError: null });
      try {
        const delay = await testNodeDelay(id, node);
        patch(node, { delay, testingDelay: false, delayError: delay == null ? "timed out" : null });
      } catch (delayError) {
        patch(node, { testingDelay: false, delayError: String(delayError) });
      }
    },
    [id, patch],
  );

  const measureSpeed = useCallback(
    async (node: string) => {
      if (!id) return;
      patch(node, { testingSpeed: true, speedError: null });
      try {
        const speed = await testNodeSpeed(id, node);
        patch(node, { speed, testingSpeed: false });
      } catch (speedError) {
        patch(node, { testingSpeed: false, speedError: String(speedError) });
      }
    },
    [id, patch],
  );

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return nodes;
    return nodes.filter(
      (node) =>
        node.name.toLowerCase().includes(query) || node.kind.toLowerCase().includes(query),
    );
  }, [nodes, filter]);

  const testAllLatency = async () => {
    if (batchLatency || filtered.length === 0) return;
    setBatchLatency(true);
    try {
      await runPool(filtered, 8, async (node) => {
        await measureDelay(node.name);
      });
    } finally {
      setBatchLatency(false);
    }
  };

  const testAllSpeed = async () => {
    if (batchSpeed || filtered.length === 0) return;
    setBatchSpeed(true);
    try {
      // One at a time: parallel downloads share the same uplink and every
      // reading would be wrong in the same direction.
      await runPool(filtered, 1, async (node) => {
        await measureSpeed(node.name);
      });
    } finally {
      setBatchSpeed(false);
    }
  };

  const refresh = async () => {
    if (!id || refreshing) return;
    setRefreshing(true);
    try {
      const next = await refreshSubscription(id);
      setNodes(next);
      setResults({});
      toast.success(
        `Updated — ${next.length} node${next.length === 1 ? "" : "s"}`,
      );
      onRefreshed();
    } catch (refreshError) {
      toast.error(String(refreshError));
    } finally {
      setRefreshing(false);
    }
  };

  const busy = batchLatency || batchSpeed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>{subscription?.name ?? "Subscription"}</DialogTitle>
          <DialogDescription>
            {nodes.length} node{nodes.length === 1 ? "" : "s"} from the provider. Latency is a real
            request through the node; speed is a download measured through it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <LuSearch className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8 text-sm"
              placeholder="Filter nodes…"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
              }}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || filtered.length === 0}
            onClick={() => void testAllLatency()}
          >
            {batchLatency ? (
              <LuLoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <LuActivity className="size-3.5" />
            )}
            Test latency
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || filtered.length === 0}
            onClick={() => void testAllSpeed()}
          >
            {batchSpeed ? (
              <LuLoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <LuDownload className="size-3.5" />
            )}
            Test speed
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing || busy}
            onClick={() => void refresh()}
          >
            {refreshing ? (
              <LuLoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <LuRefreshCw className="size-3.5" />
            )}
            Update
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
          <Table className="table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-0">
              <TableRow className="border-0! hover:bg-transparent">
                <TableHead className="pl-3">Node</TableHead>
                <TableHead className="w-[120px]">Protocol</TableHead>
                <TableHead className="w-[110px]">Latency</TableHead>
                <TableHead className="w-[120px]">Speed</TableHead>
                <TableHead className="w-[96px] pr-3 text-right">Test</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }, (_, index) => (
                  <TableRow key={`skeleton-${index}`} className="border-0!">
                    <TableCell colSpan={5} className="py-2 pl-3">
                      <Skeleton className="h-3" style={{ width: `${40 + ((index * 13) % 40)}%` }} />
                    </TableCell>
                  </TableRow>
                ))
              ) : error ? (
                <TableRow className="border-0! hover:bg-transparent">
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow className="border-0! hover:bg-transparent">
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    {nodes.length === 0
                      ? "No nodes yet — press Update to fetch them from the provider."
                      : "No nodes match the filter."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((node) => {
                  const result = results[node.name] ?? {};
                  const tone = delayTone(result.delay);
                  return (
                    <TableRow key={node.name} className="group/row border-0! hover:bg-muted">
                      <TableCell className="min-w-0 pl-3">
                        <span className="block truncate text-sm text-foreground">{node.name}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[11px]">
                          {node.kind}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {result.testingDelay ? (
                          <LuLoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
                        ) : result.delayError ? (
                          <span className="text-destructive" title={result.delayError}>
                            failed
                          </span>
                        ) : result.delay != null ? (
                          <span className={cn("tabular-nums", DELAY_TONE[tone])}>
                            {result.delay} ms
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {result.testingSpeed ? (
                          <LuLoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
                        ) : result.speedError ? (
                          <span className="text-destructive" title={result.speedError}>
                            failed
                          </span>
                        ) : result.speed != null ? (
                          <span className="tabular-nums text-foreground">
                            {result.speed.toFixed(1)} Mbps
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
                          <button
                            type="button"
                            aria-label={`Test latency for ${node.name}`}
                            disabled={result.testingDelay || busy}
                            onClick={() => void measureDelay(node.name)}
                            className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <LuActivity className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Test speed for ${node.name}`}
                            disabled={result.testingSpeed || busy}
                            onClick={() => void measureSpeed(node.name)}
                            className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <LuDownload className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Assign ${node.name} to a profile`}
                            onClick={() => onAssign(node.name)}
                            className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            <LuUserPlus className="size-3.5" />
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
      </DialogContent>
    </Dialog>
  );
}
