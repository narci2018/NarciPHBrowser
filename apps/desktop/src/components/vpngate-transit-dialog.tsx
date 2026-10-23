import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  LuCheck,
  LuGlobe,
  LuLoaderCircle,
  LuRadio,
  LuRoute,
  LuSearch,
  LuShieldAlert,
  LuWaypoints,
  LuZap,
} from "react-icons/lu";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatTransitSummary,
  listSpecialNodes,
  setVpngateTransitNode,
  type SubscriptionNode,
  type SubscriptionRow,
  type TransitSource,
  type VpngateTransitConfig,
} from "@/lib/subscriptions";
import { type StoredProxy } from "@/lib/proxies";
import { cn } from "@/lib/utils";

interface VpngateTransitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentConfig: VpngateTransitConfig;
  onSaved: (next: VpngateTransitConfig) => void;
}

export function VpngateTransitDialog({
  open,
  onOpenChange,
  currentConfig,
  onSaved,
}: VpngateTransitDialogProps) {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<TransitSource>(currentConfig.source || "direct");
  const [selectedCandidate, setSelectedCandidate] = useState<VpngateTransitConfig>(currentConfig);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);

  // Data states
  const [proxies, setProxies] = useState<StoredProxy[]>([]);
  const [proxiesLoading, setProxiesLoading] = useState(false);

  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [selectedSubId, setSelectedSubId] = useState<string>("");
  const [subNodes, setSubNodes] = useState<SubscriptionNode[]>([]);
  const [subNodesLoading, setSubNodesLoading] = useState(false);

  const [psiphonNodes, setPsiphonNodes] = useState<SubscriptionNode[]>([]);
  const [psiphonLoading, setPsiphonLoading] = useState(false);

  const [megavNodes, setMegavNodes] = useState<SubscriptionNode[]>([]);
  const [megavLoading, setMegavLoading] = useState(false);

  // Sync candidate when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedCandidate(currentConfig);
      setActiveTab(currentConfig.source || "direct");
      setFilter("");
    }
  }, [open, currentConfig]);

  // Load proxies
  useEffect(() => {
    if (open && activeTab === "proxy" && proxies.length === 0) {
      setProxiesLoading(true);
      invoke<StoredProxy[]>("list_proxies")
        .then(setProxies)
        .catch((err) => toast.error(String(err)))
        .finally(() => setProxiesLoading(false));
    }
  }, [open, activeTab, proxies.length]);

  // Load subscriptions
  useEffect(() => {
    if (open && activeTab === "subscription" && subscriptions.length === 0) {
      invoke<SubscriptionRow[]>("list_subscriptions")
        .then((list) => {
          // Filter out built-ins from normal subscriptions view
          const normalSubs = list.filter((s) => !s.id.startsWith("builtin-"));
          setSubscriptions(normalSubs);
          if (normalSubs.length > 0) {
            const initialSubId =
              currentConfig.subscription_id && normalSubs.some((s) => s.id === currentConfig.subscription_id)
                ? currentConfig.subscription_id
                : normalSubs[0].id;
            setSelectedSubId(initialSubId);
          }
        })
        .catch((err) => toast.error(String(err)));
    }
  }, [open, activeTab, subscriptions.length, currentConfig.subscription_id]);

  // Load nodes for selected subscription
  useEffect(() => {
    if (open && activeTab === "subscription" && selectedSubId) {
      setSubNodesLoading(true);
      invoke<SubscriptionNode[]>("list_subscription_nodes", { id: selectedSubId })
        .then(setSubNodes)
        .catch((err) => toast.error(String(err)))
        .finally(() => setSubNodesLoading(false));
    }
  }, [open, activeTab, selectedSubId]);

  // Load Psiphon nodes
  useEffect(() => {
    if (open && activeTab === "psiphon" && psiphonNodes.length === 0) {
      setPsiphonLoading(true);
      listSpecialNodes("builtin-psiphon")
        .then(setPsiphonNodes)
        .catch((err) => toast.error(String(err)))
        .finally(() => setPsiphonLoading(false));
    }
  }, [open, activeTab, psiphonNodes.length]);

  // Load MegaV nodes
  useEffect(() => {
    if (open && activeTab === "megav" && megavNodes.length === 0) {
      setMegavLoading(true);
      listSpecialNodes("builtin-megav")
        .then(setMegavNodes)
        .catch((err) => toast.error(String(err)))
        .finally(() => setMegavLoading(false));
    }
  }, [open, activeTab, megavNodes.length]);

  // Handle saving
  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await setVpngateTransitNode(selectedCandidate);
      onSaved(saved);
      toast.success(
        selectedCandidate.source === "direct"
          ? t("vpngate.transitCleared", { defaultValue: "已切换为 VPNGate 直连模式" })
          : t("vpngate.transitSaved", { defaultValue: "VPNGate 中转节点设置成功" }),
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  // Filtered lists
  const filteredProxies = useMemo(() => {
    if (!filter) return proxies;
    const lower = filter.toLowerCase();
    return proxies.filter(
      (p) => p.name.toLowerCase().includes(lower) || p.url.toLowerCase().includes(lower),
    );
  }, [proxies, filter]);

  const filteredSubNodes = useMemo(() => {
    if (!filter) return subNodes;
    const lower = filter.toLowerCase();
    return subNodes.filter((n) => n.name.toLowerCase().includes(lower));
  }, [subNodes, filter]);

  const filteredPsiphonNodes = useMemo(() => {
    if (!filter) return psiphonNodes;
    const lower = filter.toLowerCase();
    return psiphonNodes.filter((n) => n.name.toLowerCase().includes(lower));
  }, [psiphonNodes, filter]);

  const filteredMegavNodes = useMemo(() => {
    if (!filter) return megavNodes;
    const lower = filter.toLowerCase();
    return megavNodes.filter((n) => n.name.toLowerCase().includes(lower));
  }, [megavNodes, filter]);

  const sourceTabs: { key: TransitSource; label: string; icon: any }[] = [
    { key: "direct", label: t("vpngate.tabDirect", { defaultValue: "直连 (无中转)" }), icon: LuRoute },
    { key: "proxy", label: t("vpngate.tabProxy", { defaultValue: "代理库" }), icon: LuRadio },
    { key: "subscription", label: t("vpngate.tabSubscription", { defaultValue: "订阅" }), icon: LuZap },
    { key: "psiphon", label: "Psiphon", icon: LuGlobe },
    { key: "megav", label: "MegaV", icon: LuGlobe },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="shrink-0 space-y-1">
          <div className="flex items-center gap-2">
            <LuWaypoints className="size-5 text-primary" />
            <DialogTitle className="text-base font-semibold">
              {t("vpngate.transitDialogTitle", { defaultValue: "设置 VPNGate 中转节点 (Chain Proxy)" })}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {t("vpngate.transitDialogDesc", {
              defaultValue:
                "由于 VPNGate 节点服务器多在海外公网且 IP 受阻断，国内通常无法直连。您可选择任意一个代理、订阅、Psiphon 或 MegaV 节点作为中转前置跳板，VPNGate 流量将通过中转跳板安全建立连接。",
            })}
          </DialogDescription>
        </DialogHeader>

        {/* Source selector buttons */}
        <div className="shrink-0 grid grid-cols-5 gap-1.5 rounded-lg border border-border bg-muted/30 p-1 mt-2">
          {sourceTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setActiveTab(tab.key);
                  setFilter("");
                  if (tab.key === "direct") {
                    setSelectedCandidate({ source: "direct" });
                  }
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search bar when browsing nodes */}
        {activeTab !== "direct" && (
          <div className="shrink-0 relative mt-3">
            <LuSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("vpngate.searchTransitNode", { defaultValue: "搜索节点名称或地址..." })}
              className="h-8 pl-8 text-xs"
            />
          </div>
        )}

        {/* Tab contents list */}
        <div className="min-h-[260px] max-h-[380px] flex-1 overflow-y-auto mt-3 rounded-lg border border-border/60 bg-muted/10 p-2 space-y-1.5">
          {/* 1. Direct */}
          {activeTab === "direct" && (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <div className="rounded-full bg-amber-500/10 p-3 text-amber-500">
                <LuShieldAlert className="size-7" />
              </div>
              <div className="max-w-md space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {t("vpngate.directModeTitle", { defaultValue: "已选择直连模式 (不使用中转)" })}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("vpngate.directModeWarning", {
                    defaultValue:
                      "在直连模式下，系统将直接连接 VPNGate 服务器。如果您处于受限网络环境，节点测延迟及浏览器连接大概率会超时失效。建议使用 Psiphon、MegaV 或自建代理作为中转跳板。",
                  })}
                </p>
              </div>
            </div>
          )}

          {/* 2. Proxy Library */}
          {activeTab === "proxy" && (
            <>
              {proxiesLoading ? (
                <div className="space-y-2 p-2">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : filteredProxies.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  {proxies.length === 0
                    ? t("vpngate.noProxiesInLibrary", { defaultValue: "代理库暂无可用代理，请先在代理页面添加代理。" })
                    : t("vpngate.noMatchingProxies", { defaultValue: "没有匹配的代理。" })}
                </div>
              ) : (
                filteredProxies.map((p) => {
                  const isSelected =
                    selectedCandidate.source === "proxy" && selectedCandidate.proxy_id === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() =>
                        setSelectedCandidate({
                          source: "proxy",
                          proxy_id: p.id,
                          proxy_name: p.name,
                          proxy_url: p.url,
                        })
                      }
                      className={cn(
                        "flex items-center justify-between gap-3 p-2.5 rounded-md border text-xs cursor-pointer transition-colors",
                        isSelected
                          ? "border-primary bg-primary/10 text-foreground font-medium"
                          : "border-border/60 hover:bg-muted/40 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={cn(
                            "size-4 rounded-full flex items-center justify-center border",
                            isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                          )}
                        >
                          {isSelected && <LuCheck className="size-2.5 stroke-[3]" />}
                        </div>
                        <span className="font-semibold text-foreground truncate">{p.name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground truncate">{p.url}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {p.exit_country && (
                          <Badge variant="outline" className="text-[10px]">
                            {p.exit_country}
                          </Badge>
                        )}
                        {p.last_check?.latency_ms != null && (
                          <span className="text-[11px] text-emerald-600 font-mono">
                            {p.last_check.latency_ms} ms
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* 3. Subscriptions */}
          {activeTab === "subscription" && (
            <div className="space-y-3">
              {subscriptions.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  {t("vpngate.noSubscriptions", { defaultValue: "暂无自定义订阅，请先在订阅页面添加。" })}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">
                      {t("vpngate.selectSubSource", { defaultValue: "选择订阅" })}:
                    </span>
                    <Select value={selectedSubId} onValueChange={setSelectedSubId}>
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue placeholder={t("common.selectSubscription")} />
                      </SelectTrigger>
                      <SelectContent>
                        {subscriptions.map((s) => (
                          <SelectItem key={s.id} value={s.id} className="text-xs">
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {subNodesLoading ? (
                    <div className="space-y-2 p-2">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : filteredSubNodes.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      {t("vpngate.noSubNodesFound", { defaultValue: "该订阅下未获取到节点。" })}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredSubNodes.map((n) => {
                        const isSelected =
                          selectedCandidate.source === "subscription" &&
                          selectedCandidate.subscription_id === selectedSubId &&
                          selectedCandidate.node_name === n.name;
                        const curSubName = subscriptions.find((s) => s.id === selectedSubId)?.name || "订阅";
                        return (
                          <div
                            key={n.name}
                            onClick={() =>
                              setSelectedCandidate({
                                source: "subscription",
                                subscription_id: selectedSubId,
                                subscription_name: curSubName,
                                node_name: n.name,
                              })
                            }
                            className={cn(
                              "flex items-center justify-between gap-3 p-2 rounded-md border text-xs cursor-pointer transition-colors",
                              isSelected
                                ? "border-primary bg-primary/10 text-foreground font-medium"
                                : "border-border/50 hover:bg-muted/40 text-muted-foreground hover:text-foreground",
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={cn(
                                  "size-4 rounded-full flex items-center justify-center border",
                                  isSelected
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-muted-foreground/40",
                                )}
                              >
                                {isSelected && <LuCheck className="size-2.5 stroke-[3]" />}
                              </div>
                              <span className="truncate">{n.name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {n.kind}
                              </Badge>
                              {n.delay != null && (
                                <span className="text-[11px] text-emerald-600 font-mono">
                                  {n.delay} ms
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 4. Psiphon */}
          {activeTab === "psiphon" && (
            <>
              {psiphonLoading ? (
                <div className="space-y-2 p-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : filteredPsiphonNodes.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  {t("vpngate.noPsiphonNodes", { defaultValue: "暂无可用 Psiphon 节点。" })}
                </div>
              ) : (
                filteredPsiphonNodes.map((n) => {
                  const isSelected =
                    selectedCandidate.source === "psiphon" && selectedCandidate.node_name === n.name;
                  return (
                    <div
                      key={n.name}
                      onClick={() =>
                        setSelectedCandidate({
                          source: "psiphon",
                          subscription_id: "builtin-psiphon",
                          subscription_name: "Psiphon",
                          node_name: n.name,
                        })
                      }
                      className={cn(
                        "flex items-center justify-between gap-3 p-2 rounded-md border text-xs cursor-pointer transition-colors",
                        isSelected
                          ? "border-primary bg-primary/10 text-foreground font-medium"
                          : "border-border/50 hover:bg-muted/40 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={cn(
                            "size-4 rounded-full flex items-center justify-center border",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40",
                          )}
                        >
                          {isSelected && <LuCheck className="size-2.5 stroke-[3]" />}
                        </div>
                        <span className="truncate">{n.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {n.kind}
                        </Badge>
                        {n.delay != null && (
                          <span className="text-[11px] text-emerald-600 font-mono">
                            {n.delay} ms
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* 5. MegaV */}
          {activeTab === "megav" && (
            <>
              {megavLoading ? (
                <div className="space-y-2 p-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : filteredMegavNodes.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  {t("vpngate.noMegavNodes", { defaultValue: "暂无可用 MegaV 节点。" })}
                </div>
              ) : (
                filteredMegavNodes.map((n) => {
                  const isSelected =
                    selectedCandidate.source === "megav" && selectedCandidate.node_name === n.name;
                  return (
                    <div
                      key={n.name}
                      onClick={() =>
                        setSelectedCandidate({
                          source: "megav",
                          subscription_id: "builtin-megav",
                          subscription_name: "MegaV",
                          node_name: n.name,
                        })
                      }
                      className={cn(
                        "flex items-center justify-between gap-3 p-2 rounded-md border text-xs cursor-pointer transition-colors",
                        isSelected
                          ? "border-primary bg-primary/10 text-foreground font-medium"
                          : "border-border/50 hover:bg-muted/40 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={cn(
                            "size-4 rounded-full flex items-center justify-center border",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40",
                          )}
                        >
                          {isSelected && <LuCheck className="size-2.5 stroke-[3]" />}
                        </div>
                        <span className="truncate">{n.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {n.kind}
                        </Badge>
                        {n.delay != null && (
                          <span className="text-[11px] text-emerald-600 font-mono">
                            {n.delay} ms
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>

        {/* Selected candidate status summary */}
        <div className="shrink-0 flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-2.5 text-xs mt-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-muted-foreground shrink-0">
              {t("vpngate.currentCandidate", { defaultValue: "当前选择" })}:
            </span>
            <Badge
              variant={selectedCandidate.source === "direct" ? "outline" : "default"}
              className="font-mono text-xs truncate max-w-sm"
            >
              {formatTransitSummary(selectedCandidate)}
            </Badge>
          </div>
          {selectedCandidate.source !== "direct" && (
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium shrink-0">
              {t("vpngate.relayReady", { defaultValue: "✓ 准备就绪" })}
            </span>
          )}
        </div>

        <DialogFooter className="shrink-0 mt-4 gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("common.cancel", { defaultValue: "取消" })}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? (
              <>
                <LuLoaderCircle className="size-3.5 animate-spin mr-1.5" />
                {t("common.saving", { defaultValue: "正在保存并重载核心..." })}
              </>
            ) : (
              t("vpngate.confirmApply", { defaultValue: "确认应用" })
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
