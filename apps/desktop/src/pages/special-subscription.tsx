import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  LuActivity,
  LuArrowDown,
  LuArrowUp,
  LuArrowUpDown,
  LuChevronDown,
  LuChevronRight,
  LuDownload,
  LuGlobe,
  LuLoaderCircle,
  LuRefreshCw,
  LuRoute,
  LuSearch,
  LuTrash2,
  LuUserPlus,
  LuWaypoints,
} from "react-icons/lu";
import { Logo } from "@/components/icons/logo";
import { ProfilePickerDialog } from "@/components/profile-picker-dialog";
import { VpngateTransitDialog } from "@/components/vpngate-transit-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  assignNode,
  delayTone,
  formatTransitSummary,
  getVpngateTransitNode,
  groupNodesByCountry,
  listSpecialNodes,
  pruneSpecialNodes,
  refreshSpecialSubscription,
  runPool,
  setVpngateTransitNode,
  SPECIAL_SUBSCRIPTIONS,
  type SpecialSubscriptionType,
  testAllNodeDelays,
  testNodeDelay,
  testNodeExit,
  testNodeSpeed,
  type NodeResult,
  type SubscriptionNode,
  type VpngateTransitConfig,
} from "@/lib/subscriptions";
import { cn } from "@/lib/utils";

const DELAY_TONE: Record<"fast" | "ok" | "slow" | "none", string> = {
  fast: "text-emerald-500 font-medium",
  ok: "text-amber-500 font-medium",
  slow: "text-rose-500 font-medium",
  none: "text-muted-foreground",
};

interface SpecialSubscriptionPageProps {
  specialKey: SpecialSubscriptionType;
}

export function SpecialSubscriptionPage({ specialKey }: SpecialSubscriptionPageProps) {
  const { t } = useTranslation();
  const meta = SPECIAL_SUBSCRIPTIONS[specialKey];
  const subId = meta.id;

  const [nodes, setNodes] = useState<SubscriptionNode[]>([]);
  const [results, setResults] = useState<Record<string, NodeResult>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [batchLatency, setBatchLatency] = useState(false);
  const [batchSpeed, setBatchSpeed] = useState(false);
  const [speedDone, setSpeedDone] = useState(0);
  const [filter, setFilter] = useState("");
  const [expandedCountries, setExpandedCountries] = useState<Record<string, boolean>>({});
  const [assignTargetNode, setAssignTargetNode] = useState<string | null>(null);
  const [delaySortOrder, setDelaySortOrder] = useState<"asc" | "desc" | "none">("none");

  // Transit node configuration (VPNGate)
  const [transitConfig, setTransitConfig] = useState<VpngateTransitConfig>({ source: "direct" });
  const [transitDialogOpen, setTransitDialogOpen] = useState(false);

  const runIdRef = useRef(0);

  const patch = useCallback((node: string, delta: Partial<NodeResult>) => {
    setResults((current) => ({
      ...current,
      [node]: { ...current[node], ...delta },
    }));
  }, []);

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listSpecialNodes(subId);
      setNodes(next);
      setResults(seedResults(next));
      // Expand all countries by default
      const grouped = groupNodesByCountry(next);
      const initialExpanded: Record<string, boolean> = {};
      for (const g of grouped) {
        initialExpanded[g.countryCode] = true;
      }
      setExpandedCountries(initialExpanded);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  }, [subId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Load transit configuration for VPNGate
  useEffect(() => {
    if (specialKey === "vpngate") {
      getVpngateTransitNode()
        .then(setTransitConfig)
        .catch(console.error);
    }
  }, [specialKey]);

  // Quick clear transit (revert to direct)
  const handleClearTransit = async () => {
    try {
      const next: VpngateTransitConfig = { source: "direct" };
      await setVpngateTransitNode(next);
      setTransitConfig(next);
      toast.success(t("vpngate.transitCleared", { defaultValue: "已切换为 VPNGate 直连模式" }));
      void load();
    } catch (err) {
      toast.error(String(err));
    }
  };

  const [pruningTimeouts, setPruningTimeouts] = useState(false);

  // List of nodes currently measured as timed-out
  const timedOutNodes = useMemo(() => {
    return nodes.filter((n) => results[n.name]?.delayError != null).map((n) => n.name);
  }, [nodes, results]);

  // Immediately remove timed out nodes
  const handlePruneTimeouts = async () => {
    if (pruningTimeouts || timedOutNodes.length === 0) return;
    setPruningTimeouts(true);
    try {
      const survivingNodes = await pruneSpecialNodes(subId, timedOutNodes);
      setNodes(survivingNodes);
      setResults(seedResults(survivingNodes));
      toast.success(
        t("common.prunedTimeouts", {
          defaultValue: `已清理 ${timedOutNodes.length} 个超时节点，剩余 ${survivingNodes.length} 个可用节点`,
          count: timedOutNodes.length,
          remaining: survivingNodes.length,
        }),
      );
    } catch (err) {
      toast.error(String(err));
    } finally {
      setPruningTimeouts(false);
    }
  };

  // Refresh from upstream official source (prunes timed-out nodes and merges fresh ones)
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const timedOutList = nodes
        .filter((n) => results[n.name]?.delayError != null)
        .map((n) => n.name);

      const freshNodes = await refreshSpecialSubscription(subId, timedOutList);
      setNodes(freshNodes);
      setResults(seedResults(freshNodes));
      const grouped = groupNodesByCountry(freshNodes);
      const initialExpanded: Record<string, boolean> = {};
      for (const g of grouped) {
        initialExpanded[g.countryCode] = true;
      }
      setExpandedCountries(initialExpanded);
      const prunedInfo =
        timedOutList.length > 0 ? ` (已清理 ${timedOutList.length} 个超时节点)` : "";
      toast.success(
        t("common.specialNodesRefreshed", {
          defaultValue: `已成功刷新 ${meta.name} 官方可用节点（共 ${freshNodes.length} 个）${prunedInfo}`,
          count: freshNodes.length,
          name: meta.name,
        }),
      );
    } catch (err) {
      toast.error(String(err));
    } finally {
      setRefreshing(false);
    }
  };

  // Measure single node latency
  const measureLatency = useCallback(
    async (node: string) => {
      patch(node, { testingDelay: true, delayError: null });
      try {
        const delay = await testNodeDelay(subId, node);
        patch(node, {
          delay,
          testingDelay: false,
          delayError: delay == null ? t("common.nodeTimedOut", { defaultValue: "超时" }) : null,
        });
      } catch (err) {
        patch(node, { testingDelay: false, delayError: String(err) });
      }
    },
    [subId, patch, t],
  );

  // Measure single node speed
  const measureSpeed = useCallback(
    async (node: string) => {
      if (results[node]?.delayError) {
        patch(node, {
          testingSpeed: false,
          speedError: t("common.speedSkippedLatency", { defaultValue: "延迟超时，跳过测速" }),
        });
        return;
      }
      patch(node, { testingSpeed: true, speedError: null });
      try {
        const speed = await testNodeSpeed(subId, node);
        patch(node, {
          speed,
          testingSpeed: false,
          speedError:
            speed == null
              ? t("common.speedLimited", { defaultValue: "无法测速 (限速或仅直连)" })
              : null,
        });
      } catch (err) {
        patch(node, { testingSpeed: false, speedError: String(err) });
      }
    },
    [subId, patch, results, t],
  );

  // Measure single node exit probe
  const measureExit = useCallback(
    async (node: string) => {
      patch(node, { testingExit: true, exitError: null });
      try {
        const exit = await testNodeExit(subId, node);
        patch(node, { exit, testingExit: false });
      } catch (err) {
        patch(node, { testingExit: false, exitError: String(err) });
      }
    },
    [subId, patch],
  );

  // Test all latencies in batch
  const testAllLatency = async () => {
    if (batchLatency || nodes.length === 0) return;
    setBatchLatency(true);
    try {
      setResults((current) => {
        const next = { ...current };
        for (const node of nodes) {
          next[node.name] = { ...next[node.name], testingDelay: true, delayError: null };
        }
        return next;
      });
      const delays = await testAllNodeDelays(subId);
      setResults((current) => {
        const next = { ...current };
        for (const node of nodes) {
          const delay = delays[node.name] ?? null;
          next[node.name] = {
            ...next[node.name],
            delay,
            testingDelay: false,
            delayError: delay == null ? t("common.nodeTimedOut", { defaultValue: "超时" }) : null,
          };
        }
        return next;
      });
      toast.success(t("common.latencyTested", { defaultValue: "已完成全部节点延迟测速" }));
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBatchLatency(false);
    }
  };

  // Test all speeds in batch
  const testAllSpeed = async () => {
    if (batchSpeed || nodes.length === 0) return;
    const runId = (runIdRef.current += 1);
    const targets = nodes.filter((node) => !results[node.name]?.delayError);
    if (targets.length === 0) {
      toast.info(t("common.noNodesToSpeedTest", { defaultValue: "没有可供测速的存活节点" }));
      return;
    }
    setBatchSpeed(true);
    setSpeedDone(0);
    try {
      await runPool(targets, 3, async (node) => {
        if (runIdRef.current !== runId) return;
        await measureSpeed(node.name);
        setSpeedDone((prev) => prev + 1);
      });
      toast.success(t("common.speedTested", { defaultValue: "已完成可用节点下载测速" }));
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBatchSpeed(false);
    }
  };

  const handleAssignToProfile = async (profileId: string) => {
    if (!assignTargetNode) return;
    try {
      await assignNode(profileId, { subscription_id: subId, node: assignTargetNode });
      toast.success(
        t("common.assignedNamed", {
          defaultValue: `已将节点 "${assignTargetNode}" 分配给环境`,
          name: assignTargetNode,
        }),
      );
    } catch (err) {
      toast.error(String(err));
    } finally {
      setAssignTargetNode(null);
    }
  };

  // Filter nodes by search query
  const filteredNodes = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.kind.toLowerCase().includes(q) ||
        (n.exit_country && n.exit_country.toLowerCase().includes(q)),
    );
  }, [nodes, filter]);

  const getNodeDelayScore = useCallback(
    (node: SubscriptionNode): number => {
      const res = results[node.name];
      if (res?.delayError) return 99999998;
      const d = res?.delay ?? node.delay;
      if (d != null && d > 0) return d;
      return 99999999;
    },
    [results],
  );

  const toggleDelaySort = () => {
    setDelaySortOrder((prev) => {
      if (prev === "none") return "asc";
      if (prev === "asc") return "desc";
      return "none";
    });
  };

  // Group nodes by country (and sort by delay if enabled)
  const countryGroups = useMemo(() => {
    const rawGroups = groupNodesByCountry(filteredNodes);
    if (delaySortOrder === "none") return rawGroups;

    return rawGroups
      .map((group) => {
        const sortedNodes = [...group.nodes].sort((a, b) => {
          const scoreA = getNodeDelayScore(a);
          const scoreB = getNodeDelayScore(b);
          if (scoreA !== scoreB) {
            return delaySortOrder === "asc" ? scoreA - scoreB : scoreB - scoreA;
          }
          return a.name.localeCompare(b.name);
        });
        return {
          ...group,
          nodes: sortedNodes,
        };
      })
      .sort((ga, gb) => {
        const minA = ga.nodes.length > 0 ? Math.min(...ga.nodes.map(getNodeDelayScore)) : 99999999;
        const minB = gb.nodes.length > 0 ? Math.min(...gb.nodes.map(getNodeDelayScore)) : 99999999;
        if (minA !== minB) {
          return delaySortOrder === "asc" ? minA - minB : minB - minA;
        }
        return ga.countryName.localeCompare(gb.countryName);
      });
  }, [filteredNodes, delaySortOrder, getNodeDelayScore]);

  const toggleCountry = (code: string) => {
    setExpandedCountries((prev) => ({
      ...prev,
      [code]: !prev[code],
    }));
  };

  const toggleAll = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    for (const g of countryGroups) {
      next[g.countryCode] = expand;
    }
    setExpandedCountries(next);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{meta.title}</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">{meta.desc}</span>
        </div>

        <div className="flex-1" />

        <div className="relative w-44 sm:w-56">
          <LuSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("common.searchCountryOrNode", { defaultValue: "搜索国家或节点..." })}
            className="h-8 pl-8 text-xs"
          />
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => toggleAll(true)}
        >
          {t("common.expandAll", { defaultValue: "全部展开" })}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => toggleAll(false)}
        >
          {t("common.collapseAll", { defaultValue: "全部收起" })}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={batchLatency || nodes.length === 0}
          onClick={() => void testAllLatency()}
        >
          {batchLatency ? (
            <LuLoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <LuActivity className="size-3.5" />
          )}
          {t("common.testLatency", { defaultValue: "测延迟" })}
        </Button>

        <Button
          type="button"
          variant={delaySortOrder !== "none" ? "secondary" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={toggleDelaySort}
          title={t("common.sortByDelay", { defaultValue: "点击按延迟排序 (升序/降序/默认)" })}
        >
          {delaySortOrder === "asc" ? (
            <LuArrowUp className="size-3.5 text-primary stroke-[2.5]" />
          ) : delaySortOrder === "desc" ? (
            <LuArrowDown className="size-3.5 text-primary stroke-[2.5]" />
          ) : (
            <LuArrowUpDown className="size-3.5 text-muted-foreground" />
          )}
          {delaySortOrder === "asc"
            ? t("common.latencyAsc", { defaultValue: "延迟升序" })
            : delaySortOrder === "desc"
              ? t("common.latencyDesc", { defaultValue: "延迟降序" })
              : t("common.latencySort", { defaultValue: "延迟排序" })}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={batchSpeed || nodes.length === 0}
          onClick={() => void testAllSpeed()}
        >
          {batchSpeed ? (
            <LuLoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <LuDownload className="size-3.5" />
          )}
          {batchSpeed
            ? `${speedDone}/${nodes.length}`
            : t("common.testSpeed", { defaultValue: "测速" })}
        </Button>

        {timedOutNodes.length > 0 && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-8 text-xs font-medium gap-1.5"
            disabled={pruningTimeouts}
            onClick={() => void handlePruneTimeouts()}
            title={t("common.pruneTimeoutsTooltip", { defaultValue: "立即删除所有测试超时的节点" })}
          >
            {pruningTimeouts ? (
              <LuLoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <LuTrash2 className="size-3.5" />
            )}
            {t("common.pruneTimeouts", {
              defaultValue: `清理超时 (${timedOutNodes.length})`,
              count: timedOutNodes.length,
            })}
          </Button>
        )}

        <Button
          type="button"
          size="sm"
          className="h-8 text-xs font-medium"
          disabled={refreshing}
          onClick={() => void handleRefresh()}
          title={t("common.refreshOfficialTooltip", { defaultValue: "刷新并合并节点：保留存活节点，剔除超时节点，加入新节点" })}
        >
          <LuRefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          {refreshing
            ? t("common.refreshing", { defaultValue: "正在刷新官方节点..." })
            : t("common.refreshOfficial", { defaultValue: "刷新可用节点" })}
        </Button>
      </div>

      {/* VPNGate Transit Node Bar */}
      {specialKey === "vpngate" && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/20 bg-primary/5 px-4 py-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <LuWaypoints className="size-4 text-primary shrink-0" />
            <span className="font-semibold text-foreground shrink-0">
              {t("vpngate.transitNode", { defaultValue: "中转节点 (前置代理)" })}:
            </span>
            {transitConfig.source === "direct" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-muted-foreground font-mono">
                  {t("vpngate.transitDirect", { defaultValue: "未设置 (直连)" })}
                </Badge>
                <span className="text-[11px] text-amber-600 dark:text-amber-400">
                  {t("vpngate.transitDirectWarning", {
                    defaultValue: "（国内网络通常无法直连 VPNGate，建议设置中转跳板）",
                  })}
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default" className="bg-primary text-primary-foreground font-mono">
                  {formatTransitSummary(transitConfig)}
                </Badge>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  {t("vpngate.transitActiveHint", {
                    defaultValue: "✓ 节点测速及浏览器流量将经由该中转跳板连接",
                  })}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {transitConfig.source !== "direct" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => void handleClearTransit()}
              >
                {t("vpngate.clearTransit", { defaultValue: "设为直连" })}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs font-medium"
              onClick={() => setTransitDialogOpen(true)}
            >
              <LuRoute className="size-3.5 mr-1" />
              {transitConfig.source === "direct"
                ? t("vpngate.setTransit", { defaultValue: "设置中转节点" })
                : t("vpngate.changeTransit", { defaultValue: "更换中转节点" })}
            </Button>
          </div>
        </div>
      )}

      {/* Sub bar: counts */}
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 px-4 py-1.5 text-xs text-muted-foreground">
        <span>
          {t("common.nodesInCountries", {
            defaultValue: `共 ${filteredNodes.length} 个可用节点，分布于 ${countryGroups.length} 个国家/地区`,
            nodeCount: filteredNodes.length,
            countryCount: countryGroups.length,
          })}
        </span>
        <span className="text-[11px] text-muted-foreground/80">
          {t("common.autoCountryGroupHint", {
            defaultValue: "节点已按国家智能分组，点击国家可展开/收起具体节点",
          })}
        </span>
      </div>

      {/* Node list grouped by country */}
      <div className="scroll-fade relative min-h-0 min-w-0 flex-1 overflow-auto p-4 space-y-3">
        {loading && nodes.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, idx) => (
              <div key={idx} className="rounded-lg border border-border p-4 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        ) : countryGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Logo className="size-12 text-muted-foreground/60 mb-3" />
            <p className="text-sm font-medium text-foreground">
              {t("common.noSpecialNodesYet", { defaultValue: "暂无可用节点" })}
            </p>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              {t("common.noSpecialNodesHint", {
                defaultValue: "该订阅节点可能已更新，请点击上方“刷新可用节点”从官方获取最新实时中继。",
              })}
            </p>
            <Button
              size="sm"
              className="mt-4"
              disabled={refreshing}
              onClick={() => void handleRefresh()}
            >
              <LuRefreshCw className={cn("size-3.5 mr-1.5", refreshing && "animate-spin")} />
              {t("common.refreshNow", { defaultValue: "立即刷新官方节点" })}
            </Button>
          </div>
        ) : (
          countryGroups.map((group) => {
            const isExpanded = !!expandedCountries[group.countryCode];
            const nodeCount = group.nodes.length;

            return (
              <div
                key={group.countryCode}
                className="overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-colors"
              >
                {/* Level 1: Country Header Banner */}
                <div
                  onClick={() => toggleCountry(group.countryCode)}
                  className="flex cursor-pointer select-none items-center justify-between bg-muted/40 px-3.5 py-2.5 transition-colors hover:bg-muted/70"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl leading-none">{group.flag}</span>
                    <span className="text-sm font-semibold text-foreground">
                      {group.countryName}
                    </span>
                    <Badge variant="secondary" className="px-2 py-0 text-xs tabular-nums font-medium">
                      {nodeCount}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="hidden sm:inline">
                      {isExpanded ? t("common.clickToCollapse", { defaultValue: "点击折叠" }) : t("common.clickToExpand", { defaultValue: "点击展开" })}
                    </span>
                    {isExpanded ? (
                      <LuChevronDown className="size-4 transition-transform" />
                    ) : (
                      <LuChevronRight className="size-4 transition-transform" />
                    )}
                  </div>
                </div>

                {/* Level 2: Specific Nodes within Country */}
                {isExpanded && (
                  <div className="border-t border-border">
                    <Table className="table-fixed">
                      <TableHeader className="bg-background/80">
                        <TableRow className="hover:bg-transparent border-b border-border/60">
                          <TableHead className="pl-3 w-[40%] text-xs font-medium">
                            {t("common.nodeName", { defaultValue: "节点名称" })}
                          </TableHead>
                          <TableHead className="w-[100px] text-xs font-medium">
                            {t("common.protocol", { defaultValue: "协议" })}
                          </TableHead>
                          <TableHead
                            className="w-[120px] text-xs font-medium cursor-pointer select-none hover:text-foreground transition-colors group/latency"
                            onClick={toggleDelaySort}
                            title={t("common.sortByDelay", { defaultValue: "点击按延迟排序 (升序/降序/默认)" })}
                          >
                            <div className="flex items-center gap-1.5">
                              <span>{t("common.latency", { defaultValue: "延迟" })}</span>
                              {delaySortOrder === "asc" && (
                                <LuArrowUp className="size-3.5 text-primary stroke-[2.5]" />
                              )}
                              {delaySortOrder === "desc" && (
                                <LuArrowDown className="size-3.5 text-primary stroke-[2.5]" />
                              )}
                              {delaySortOrder === "none" && (
                                <LuArrowUpDown className="size-3 text-muted-foreground/60 group-hover/latency:text-foreground transition-colors" />
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="w-[120px] text-xs font-medium">
                            {t("common.speed", { defaultValue: "速度" })}
                          </TableHead>
                          <TableHead className="w-[150px] text-xs font-medium">
                            {t("common.exitIp", { defaultValue: "出口检测" })}
                          </TableHead>
                          <TableHead className="pr-3 text-right text-xs font-medium">
                            {t("common.actions", { defaultValue: "操作" })}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.nodes.map((node) => {
                          const result = results[node.name] || {};
                          const delay = result.delay ?? node.delay ?? null;
                          const speed = result.speed ?? node.speed ?? null;
                          const tone = delayTone(delay);

                          return (
                            <TableRow
                              key={node.name}
                              className="group/row hover:bg-muted/40 transition-colors border-b border-border/30 last:border-b-0"
                            >
                              {/* Node Name */}
                              <TableCell className="pl-3 min-w-0">
                                <span
                                  className="block truncate text-xs font-medium text-foreground"
                                  title={node.name}
                                >
                                  {node.name}
                                </span>
                              </TableCell>

                              {/* Protocol Badge */}
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className="font-mono text-[10px] px-1.5 py-0 uppercase"
                                >
                                  {node.kind}
                                </Badge>
                              </TableCell>

                              {/* Latency */}
                              <TableCell>
                                {result.testingDelay ? (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <LuLoaderCircle className="size-3 animate-spin" />
                                    测速中
                                  </span>
                                ) : result.delayError ? (
                                  <span
                                    className="text-xs text-rose-500 font-medium"
                                    title={result.delayError}
                                  >
                                    超时
                                  </span>
                                ) : delay != null ? (
                                  <span className={cn("text-xs tabular-nums", DELAY_TONE[tone])}>
                                    {delay} ms
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>

                              {/* Download Speed */}
                              <TableCell>
                                {result.testingSpeed ? (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <LuLoaderCircle className="size-3 animate-spin" />
                                    测速中
                                  </span>
                                ) : result.speedError ? (
                                  <span
                                    className="text-[11px] text-muted-foreground truncate block max-w-[110px]"
                                    title={result.speedError}
                                  >
                                    {result.speedError}
                                  </span>
                                ) : speed != null ? (
                                  <span className="text-xs font-medium text-foreground tabular-nums">
                                    {speed.toFixed(1)} Mbps
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>

                              {/* Exit Probe */}
                              <TableCell>
                                {result.testingExit ? (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <LuLoaderCircle className="size-3 animate-spin" />
                                    检测中
                                  </span>
                                ) : result.exit ? (
                                  <span
                                    className="text-xs text-foreground truncate block"
                                    title={`${result.exit.ip} (${result.exit.country || ""})`}
                                  >
                                    {result.exit.country ? `[${result.exit.country}] ` : ""}
                                    {result.exit.ip}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>

                              {/* Actions */}
                              <TableCell className="pr-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {/* Test Latency */}
                                  <button
                                    type="button"
                                    aria-label="测延迟"
                                    title="测试单节点延迟"
                                    disabled={result.testingDelay}
                                    onClick={() => void measureLatency(node.name)}
                                    className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
                                  >
                                    <LuActivity className="size-3.5" />
                                  </button>

                                  {/* Test Speed */}
                                  <button
                                    type="button"
                                    aria-label="测下载速度"
                                    title="测试下载速度"
                                    disabled={result.testingSpeed}
                                    onClick={() => void measureSpeed(node.name)}
                                    className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
                                  >
                                    <LuDownload className="size-3.5" />
                                  </button>

                                  {/* Test Exit */}
                                  <button
                                    type="button"
                                    aria-label="探测出口"
                                    title="探测真实出口 IP 与归属地"
                                    disabled={result.testingExit}
                                    onClick={() => void measureExit(node.name)}
                                    className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
                                  >
                                    <LuGlobe className="size-3.5" />
                                  </button>

                                  {/* Assign to Profile */}
                                  <button
                                    type="button"
                                    aria-label="分配给环境"
                                    title="分配给指纹环境 (Profile)"
                                    onClick={() => setAssignTargetNode(node.name)}
                                    className="grid size-6 cursor-pointer place-items-center rounded-sm text-primary transition-colors hover:bg-primary/10"
                                  >
                                    <LuUserPlus className="size-3.5" />
                                  </button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Assign node to profile dialog */}
      <ProfilePickerDialog
        open={assignTargetNode !== null}
        onOpenChange={(open) => {
          if (!open) setAssignTargetNode(null);
        }}
        onPick={(profileId) => {
          void handleAssignToProfile(profileId);
        }}
      />

      {/* VPNGate Transit Node dialog */}
      {specialKey === "vpngate" && (
        <VpngateTransitDialog
          open={transitDialogOpen}
          onOpenChange={setTransitDialogOpen}
          currentConfig={transitConfig}
          onSaved={(next) => {
            setTransitConfig(next);
            void load();
          }}
        />
      )}
    </div>
  );
}
