import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  LuActivity,
  LuDownload,
  LuGlobe,
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
  testAllNodeDelays,
  testNodeDelay,
  testNodeExit,
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

// A few absences from a batch are worth one more try each — a first dial can
// miss on a slow exit — but a wave of them is the subscription itself being
// down, and retrying would only delay the verdict.
const RETRY_LIMIT = 8;

/** The stored latency run, as an already-open dialog shows it. */
const seedResults = (list: SubscriptionNode[]): Record<string, NodeResult> => {
  const seeded: Record<string, NodeResult> = {};
  for (const node of list) {
    const entry: NodeResult = {};
    if (node.delay != null) entry.delay = node.delay;
    if (node.speed != null) entry.speed = node.speed;
    if (node.exit_country != null) entry.exit = { ip: "", country: node.exit_country };
    if (Object.keys(entry).length > 0) seeded[node.name] = entry;
  }
  return seeded;
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
  const { t } = useTranslation();
  const [nodes, setNodes] = useState<SubscriptionNode[]>([]);
  const [results, setResults] = useState<Record<string, NodeResult>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [batchLatency, setBatchLatency] = useState(false);
  const [batchSpeed, setBatchSpeed] = useState(false);
  // How far the speed batch has got, for the button's counter.
  const [speedDone, setSpeedDone] = useState(0);
  // Bumped when the batch's context is torn down — closing the dialog or
  // switching subscriptions — so the pool stops picking up new nodes instead
  // of quietly measuring a list nobody is watching any more.
  const runIdRef = useRef(0);
  // Latency sort direction: false = ascending, true = descending.
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Whether the list is ordered by measured delay. Reset whenever the results
  // are, so a stale order never outlives the readings it came from.
  const [sortedByDelay, setSortedByDelay] = useState(false);

  const id = subscription?.id ?? null;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const next = await listSubscriptionNodes(id);
      setNodes(next);
      setResults(seedResults(next));
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    runIdRef.current += 1;
    if (!open) return;
    setNodes([]);
    setResults({});
    setSortedByDelay(false);
    setFilter("");
    setError(null);
    setSpeedDone(0);
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
        patch(node, { delay, testingDelay: false, delayError: delay == null ? t("common.timedOut") : null });
        setSortedByDelay(true);
      } catch (delayError) {
        patch(node, { testingDelay: false, delayError: String(delayError) });
      }
    },
    [id, patch, t],
  );

  const measureSpeed = useCallback(
    async (node: string) => {
      if (!id) return;
      // If latency test already failed, the node's exit is unreachable — no point running speed.
      if (results[node]?.delayError) {
        patch(node, {
          testingSpeed: false,
          speedError: t("common.speedSkippedLatency"),
        });
        return;
      }
      patch(node, { testingSpeed: true, speedError: null });
      try {
        const speed = await testNodeSpeed(id, node);
        patch(node, {
          speed,
          testingSpeed: false,
          speedError: speed == null ? t("common.speedLimited") : null,
        });
      } catch (speedError) {
        patch(node, { testingSpeed: false, speedError: String(speedError) });
      }
    },
    [id, patch, results, t],
  );

  const measureExit = useCallback(
    async (node: string) => {
      if (!id) return;
      patch(node, { testingExit: true, exitError: null });
      try {
        const exit = await testNodeExit(id, node);
        patch(node, { exit, testingExit: false });
      } catch (exitError) {
        patch(node, { testingExit: false, exitError: String(exitError) });
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

  // A node whose latency test failed cannot answer a download
  // either — the exit is unreachable, so skip it in the batch but mark it visible.
  const speedTargets = useMemo(
    () => filtered.filter((node) => !results[node.name]?.delayError),
    [filtered, results],
  );

  // A node's row number: its place in the subscription, stable across the
  // filter and the delay sort — the way a client numbers its configs.
  const order = useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach((node, index) => map.set(node.name, index));
    return map;
  }, [nodes]);

  // The delay test orders the list: rows with a reading float to the top
  // sorted by that reading, everything else — failed, timed out, untested —
  // keeps its current relative order below them.
  // Clicking the header toggles between ascending and descending.
  const sorted = useMemo(() => {
    if (!sortedByDelay) return filtered;
    const delayOf = (node: SubscriptionNode): number | null => results[node.name]?.delay ?? null;
    return [...filtered].sort((a, b) => {
      const first = delayOf(a);
      const second = delayOf(b);
      if (first != null && second != null) return sortAsc ? first - second : second - first;
      if (first != null) return sortAsc ? -1 : 1;
      if (second != null) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [filtered, results, sortedByDelay, sortAsc]);

  // The batch is one core request that tests the whole provider concurrently,
  // so it costs a single timeout window no matter the node count. Every row is
  // part of it — the search box narrows the view, not the measurement — and a
  // node the core could not measure shows as timed out.
  const testAllLatency = async () => {
    if (batchLatency || !id || filtered.length === 0) return;
    setBatchLatency(true);
    try {
      setResults((current) => {
        const next = { ...current };
        for (const node of nodes) {
          next[node.name] = { ...next[node.name], testingDelay: true, delayError: null };
        }
        return next;
      });
      const delays = await testAllNodeDelays(id);
      setResults((current) => {
        const next = { ...current };
        for (const node of nodes) {
          const delay = delays[node.name] ?? null;
          next[node.name] = {
            ...next[node.name],
            delay,
            testingDelay: false,
            delayError: delay == null ? t("common.timedOut") : null,
          };
        }
        return next;
      });
      // One more try for each absence, while the absences are few: the same
      // single-node measurement, which also records what it finds.
      const missing = nodes.filter((node) => (delays[node.name] ?? null) == null);
      if (missing.length > 0 && missing.length <= RETRY_LIMIT) {
        await runPool(missing, 4, async (node) => {
          await measureDelay(node.name);
        });
      }
    } catch (batchError) {
      setResults((current) => {
        const next = { ...current };
        for (const node of nodes) {
          next[node.name] = { ...next[node.name], testingDelay: false };
        }
        return next;
      });
      toast.error(String(batchError));
    } finally {
      setBatchLatency(false);
      setSortedByDelay(true);
    }
  };

  const testAllSpeed = async () => {
    if (batchSpeed || speedTargets.length === 0) return;
    setBatchSpeed(true);
    setSpeedDone(0);
    const runId = ++runIdRef.current;
    try {
      // One at a time: parallel downloads share the same uplink and every
      // reading would be wrong in the same direction. The core bounds each
      // test, so a row takes seconds, not the length of the batch.
      await runPool(speedTargets, 1, async (node) => {
        if (runIdRef.current !== runId) return;
        await measureSpeed(node.name);
        setSpeedDone((done) => done + 1);
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
      setResults(seedResults(next));
      setSortedByDelay(false);
      toast.success(
        t("common.updatedNodes", { count: next.length}),
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
          <DialogTitle>{subscription?.name ?? t("common.subscription")}</DialogTitle>
          <DialogDescription>
            {t("common.subscriptionNodesDescription", { count: nodes.length})}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <LuSearch className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8 text-sm"
              placeholder={t("common.filterNodes")}
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
            {t("common.testLatency")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || speedTargets.length === 0}
            onClick={() => void testAllSpeed()}
          >
            {batchSpeed ? (
              <LuLoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <LuDownload className="size-3.5" />
            )}
            {batchSpeed
              ? t("common.testingSpeed", { done: speedDone, total: speedTargets.length })
              : t("common.testSpeed")}
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
            {t("common.update")}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
          <Table className="table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-0">
              <TableRow className="border-0! hover:bg-transparent">
                <TableHead className="w-[52px] pl-3">#</TableHead>
                <TableHead>{t("common.node")}</TableHead>
                <TableHead className="w-[120px]">{t("common.protocol")}</TableHead>
                <TableHead
                  className="w-[110px] cursor-pointer select-none hover:bg-accent/50"
                  onClick={() => {
                    if (!sortedByDelay) {
                      setSortedByDelay(true);
                      setSortAsc(true);
                    } else {
                      setSortAsc((v) => !v);
                    }
                  }}
                >
                  <span className="flex items-center gap-0.5">
                    {t("common.latency")}
                    {sortedByDelay && (
                      <span className="text-xs">{sortAsc ? " ↑" : " ↓"}</span>
                    )}
                  </span>
                </TableHead>
                <TableHead className="w-[120px]">{t("common.speed")}</TableHead>
                <TableHead className="w-[90px]">{t("common.exit")}</TableHead>
                <TableHead className="w-[96px] pr-3 text-right">{t("common.test")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }, (_, index) => (
                  <TableRow key={`skeleton-${index}`} className="border-0!">
                    <TableCell colSpan={7} className="py-2 pl-3">
                      <Skeleton className="h-3" style={{ width: `${40 + ((index * 13) % 40)}%` }} />
                    </TableCell>
                  </TableRow>
                ))
              ) : error ? (
                <TableRow className="border-0! hover:bg-transparent">
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow className="border-0! hover:bg-transparent">
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    {nodes.length === 0
                      ? t("common.noNodesYet")
                      : t("common.noNodesMatch")}
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((node) => {
                  const result = results[node.name] ?? {};
                  const tone = delayTone(result.delay);
                  return (
                    <TableRow key={node.name} className="group/row border-0! hover:bg-muted">
                      <TableCell className="pl-3 text-xs tabular-nums text-muted-foreground">
                        {(order.get(node.name) ?? 0) + 1}
                      </TableCell>
                      <TableCell className="min-w-0 pl-2">
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
                            {t("common.failed")}
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
                            {t("common.failed")}
                          </span>
                        ) : result.speed != null ? (
                          <span className="tabular-nums text-foreground">
                            {result.speed.toFixed(1)} Mbps
                          </span>
                        ) : result.speed === null && result.delay != null ? (
                          <span className="text-warning-text" title={t("common.speedLimited")}>
                            {t("common.speedLimited")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {result.testingExit ? (
                          <LuLoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
                        ) : result.exitError ? (
                          <span className="text-destructive" title={result.exitError}>
                            {t("common.failed")}
                          </span>
                        ) : result.exit ? (
                          <span
                            className="tabular-nums text-foreground inline-block max-w-[110px] truncate"
                            title={
                              result.exit.ip
                                ? `${result.exit.country ? result.exit.country + "\n" : ""}${result.exit.ip}`
                                : result.exit.country ?? ""
                            }
                          >
                            {result.exit.country || result.exit.ip || t("common.unknown")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
                          <button
                            type="button"
                            aria-label={t("common.testLatencyFor", { name: node.name })}
                            disabled={result.testingDelay || busy}
                            onClick={() => void measureDelay(node.name)}
                            className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <LuActivity className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={t("common.testSpeedFor", { name: node.name })}
                            disabled={result.testingSpeed || busy}
                            onClick={() => void measureSpeed(node.name)}
                            className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <LuDownload className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={t("common.checkExitFor", { name: node.name })}
                            disabled={result.testingExit || busy}
                            onClick={() => void measureExit(node.name)}
                            className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <LuGlobe className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={t("common.assignNodeToProfile", { name: node.name })}
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
