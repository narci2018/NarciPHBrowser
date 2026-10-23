import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  LuSave,
  LuRotateCcw,
  LuSlidersHorizontal,
  LuNetwork,
  LuShieldCheck,
  LuGlobe,
  LuInfo,
  LuActivity,
  LuCpu,
  LuRoute,
  LuPlus,
  LuTrash2,
  LuPencil,
  LuArrowUp,
  LuArrowDown,
  LuClipboard,
  LuCheck,
  LuCopy,
  LuServer,
  LuCircleCheck,
  LuCircleX,
  LuRefreshCw,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { accountStore, useAccountStore, PREDEFINED_SERVERS } from "@/lib/account-store";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import i18n from "@/i18n";
import { THEME_OPTIONS, type ThemeMode } from "@/lib/themes";

/** Language names are shown in their own language, so they are not translated. */
const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "zh", label: "简体中文" },
];

interface DownloadState {
  phase: string;
  percent: number;
}

interface SecurityInfo {
  store_sealed: boolean;
  store_seal_note: string;
}

interface SettingsPageProps {
  versionLine: string;
  download: DownloadState | null;
}

export interface AdvancedProxySettings {
  mixed_port: number;
  allow_lan: boolean;
  bind_address: string;
  log_level: string;
  mode: string;
  ipv6: boolean;
  udp_enabled: boolean;
  dns_mode: string;
  direct_dns: string;
  remote_dns: string;
  dns_cache: boolean;
  delay_test_url: string;
  delay_timeout_ms: number;
  speed_test_url: string;
  test_concurrency: number;
  bypass_domain_list: string;
}

const DEFAULT_ADVANCED_SETTINGS: AdvancedProxySettings = {
  mixed_port: 0,
  allow_lan: false,
  bind_address: "127.0.0.1",
  log_level: "warning",
  mode: "rule",
  ipv6: false,
  udp_enabled: true,
  dns_mode: "fake-ip",
  direct_dns: "223.5.5.5, 119.29.29.29",
  remote_dns: "https://cloudflare-dns.com/dns-query, 8.8.8.8",
  dns_cache: true,
  delay_test_url: "http://cp.cloudflare.com/generate_204",
  delay_timeout_ms: 5000,
  speed_test_url: "https://speed.cloudflare.com/__down?bytes=5000000",
  test_concurrency: 5,
  bypass_domain_list: "localhost; 127.*; 10.*; 172.16.*; 192.168.*; <local>",
};

export interface RoutingRuleItem {
  id: string;
  enabled: boolean;
  name: string;
  rule_type: string;
  outbound_tag: string; // "block" | "direct" | "proxy"
  port: string;
  protocol: string;
  inbound_tag: string;
  network: string;
  target: string;
}

export interface RoutingRuleSet {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
  domain_strategy: string;
  custom_url: string;
  rules: RoutingRuleItem[];
}

export interface RoutingRuleCollection {
  active_id: string;
  rule_sets: RoutingRuleSet[];
}

const PERFECT_ROUTING_RULE_SET: RoutingRuleSet = {
  id: "perfect_rules",
  name: "完美分流规则",
  active: true,
  sort_order: 0,
  domain_strategy: "IPIfNonMatch",
  custom_url: "",
  rules: [
    {
      id: "rule_udp443",
      enabled: true,
      name: "UDP443阻断",
      rule_type: "",
      outbound_tag: "block",
      port: "443",
      protocol: "",
      inbound_tag: "",
      network: "udp",
      target: "",
    },
    {
      id: "rule_lan",
      enabled: true,
      name: "局域网专用规则",
      rule_type: "",
      outbound_tag: "direct",
      port: "",
      protocol: "",
      inbound_tag: "",
      network: "",
      target: "geosite:private,geoip:private",
    },
    {
      id: "rule_ads",
      enabled: true,
      name: "广告拦截",
      rule_type: "",
      outbound_tag: "block",
      port: "",
      protocol: "",
      inbound_tag: "",
      network: "",
      target: "geosite:category-ads-all",
    },
    {
      id: "rule_ai",
      enabled: true,
      name: "AI专用规则",
      rule_type: "",
      outbound_tag: "proxy",
      port: "",
      protocol: "",
      inbound_tag: "",
      network: "",
      target: "geosite:category-ai-!cn",
    },
    {
      id: "rule_youtube",
      enabled: true,
      name: "油管专用规则",
      rule_type: "",
      outbound_tag: "proxy",
      port: "",
      protocol: "",
      inbound_tag: "",
      network: "",
      target: "geosite:youtube",
    },
    {
      id: "rule_cn",
      enabled: true,
      name: "国内直连",
      rule_type: "",
      outbound_tag: "direct",
      port: "",
      protocol: "",
      inbound_tag: "",
      network: "",
      target: "geosite:cn,geoip:cn",
    },
    {
      id: "rule_proxy",
      enabled: true,
      name: "国外代理",
      rule_type: "",
      outbound_tag: "proxy",
      port: "0-65535",
      protocol: "",
      inbound_tag: "",
      network: "",
      target: "",
    },
  ],
};

const BYPASS_CN_RULE_SET: RoutingRuleSet = {
  id: "bypass_cn",
  name: "绕过大陆",
  active: false,
  sort_order: 1,
  domain_strategy: "IPIfNonMatch",
  custom_url: "",
  rules: [
    {
      id: "rule_lan",
      enabled: true,
      name: "局域网直连",
      rule_type: "",
      outbound_tag: "direct",
      port: "",
      protocol: "",
      inbound_tag: "",
      network: "",
      target: "geosite:private,geoip:private",
    },
    {
      id: "rule_cn",
      enabled: true,
      name: "国内直连",
      rule_type: "",
      outbound_tag: "direct",
      port: "",
      protocol: "",
      inbound_tag: "",
      network: "",
      target: "geosite:cn,geoip:cn",
    },
    {
      id: "rule_proxy",
      enabled: true,
      name: "国外代理",
      rule_type: "",
      outbound_tag: "proxy",
      port: "0-65535",
      protocol: "",
      inbound_tag: "",
      network: "",
      target: "",
    },
  ],
};

const GLOBAL_PROXY_RULE_SET: RoutingRuleSet = {
  id: "global_proxy",
  name: "全局代理",
  active: false,
  sort_order: 2,
  domain_strategy: "AsIs",
  custom_url: "",
  rules: [
    {
      id: "rule_lan",
      enabled: true,
      name: "局域网直连",
      rule_type: "",
      outbound_tag: "direct",
      port: "",
      protocol: "",
      inbound_tag: "",
      network: "",
      target: "geosite:private,geoip:private",
    },
    {
      id: "rule_proxy",
      enabled: true,
      name: "全部代理",
      rule_type: "",
      outbound_tag: "proxy",
      port: "0-65535",
      protocol: "",
      inbound_tag: "",
      network: "",
      target: "",
    },
  ],
};

const GLOBAL_DIRECT_RULE_SET: RoutingRuleSet = {
  id: "global_direct",
  name: "全局直连",
  active: false,
  sort_order: 3,
  domain_strategy: "AsIs",
  custom_url: "",
  rules: [
    {
      id: "rule_direct",
      enabled: true,
      name: "全部直连",
      rule_type: "",
      outbound_tag: "direct",
      port: "0-65535",
      protocol: "",
      inbound_tag: "",
      network: "",
      target: "",
    },
  ],
};

const DEFAULT_ROUTING_COLLECTION: RoutingRuleCollection = {
  active_id: "perfect_rules",
  rule_sets: [
    PERFECT_ROUTING_RULE_SET,
    BYPASS_CN_RULE_SET,
    GLOBAL_PROXY_RULE_SET,
    GLOBAL_DIRECT_RULE_SET,
  ],
};

const parseVersions = (line: string) => {
  const sidecar = line.match(/sidecar\s+(\S+)/)?.[1] ?? "—";
  const core = line.match(/core\s+([^,)]+)/)?.[1]?.trim() ?? "—";
  const engine = line.match(/engine\s+([^)]+)/)?.[1]?.trim() ?? "—";
  return { sidecar, core, engine };
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-xs text-foreground" title={value}>
        {value}
      </span>
    </div>
  );
}

function Section({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
      <div className="border-b border-border px-4 py-3 bg-muted/20">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-4 text-primary shrink-0" />}
          <h3 className="text-sm font-medium text-card-foreground">{title}</h3>
        </div>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>
      <div>{children}</div>
    </section>
  );
}

function AdvancedSettingItem({
  title,
  recommendedBadge,
  description,
  children,
}: {
  title: string;
  recommendedBadge: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/70 px-4 py-3.5 last:border-b-0 hover:bg-muted/10 transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-foreground">{title}</span>
          <Badge
            variant="outline"
            className="text-[10px] h-5 px-1.5 py-0 font-normal text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
          >
            {recommendedBadge}
          </Badge>
        </div>
        <div className="shrink-0 flex items-center">{children}</div>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

export function SettingsPage({ versionLine, download }: SettingsPageProps) {
  const { t } = useTranslation();
  const versions = parseVersions(versionLine);
  const { theme, setTheme } = useTheme();
  const [security, setSecurity] = useState<SecurityInfo | null>(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);

  // Tab state: "general" | "advanced" | "routing"
  const [activeTab, setActiveTab] = useState<string>("general");

  // RBAC Backend state
  const { serverUrl, serverStatus, serverInfo } = useAccountStore();
  const [testingServer, setTestingServer] = useState(false);

  const handleTestServerConnection = async () => {
    setTestingServer(true);
    const ok = await accountStore.testConnection();
    setTestingServer(false);
    if (ok) {
      toast.success("服务器连接成功！");
    } else {
      toast.error("无法连接到服务端，请确认服务已启动且地址正确");
    }
  };

  // Advanced Proxy Settings state
  const [advancedSettings, setAdvancedSettings] = useState<AdvancedProxySettings>(
    DEFAULT_ADVANCED_SETTINGS,
  );
  const [advancedSaving, setAdvancedSaving] = useState(false);

  // Routing Rule Collection state (contains all sibling rule sets)
  const [routingCollection, setRoutingCollection] = useState<RoutingRuleCollection>(
    DEFAULT_ROUTING_COLLECTION,
  );
  // Which rule set is currently selected for viewing/editing in the editor
  const [selectedRuleSetId, setSelectedRuleSetId] = useState<string>("perfect_rules");
  const [routingSaving, setRoutingSaving] = useState(false);

  // New Sibling Rule Set Dialog state
  const [newRuleSetDialogOpen, setNewRuleSetDialogOpen] = useState(false);
  const [newRuleSetName, setNewRuleSetName] = useState("");
  const [newRuleSetDomainStrategy, setNewRuleSetDomainStrategy] = useState("IPIfNonMatch");
  const [newRuleSetTemplate, setNewRuleSetTemplate] = useState<
    "perfect" | "bypass_cn" | "global_proxy" | "global_direct" | "empty"
  >("perfect");
  const [newRuleSetSetActive, setNewRuleSetSetActive] = useState(true);

  // Rule dialog state
  const [editingRule, setEditingRule] = useState<RoutingRuleItem | null>(null);
  const [isNewRule, setIsNewRule] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);

  // Currently active/displayed rule set in editor
  const currentRuleSet =
    routingCollection.rule_sets.find((s) => s.id === selectedRuleSetId) ||
    routingCollection.rule_sets[0] ||
    PERFECT_ROUTING_RULE_SET;

  useEffect(() => {
    invoke<SecurityInfo>("security_info")
      .then(setSecurity)
      .catch(() => setSecurity(null));

    invoke<AdvancedProxySettings>("get_advanced_proxy_settings")
      .then((data) => {
        if (data) {
          setAdvancedSettings(data);
        }
      })
      .catch((err) => {
        console.warn("Could not load advanced settings:", err);
      });

    invoke<RoutingRuleCollection>("get_routing_collection")
      .then((data) => {
        if (data && data.rule_sets && data.rule_sets.length > 0) {
          setRoutingCollection(data);
          setSelectedRuleSetId(data.active_id || data.rule_sets[0].id);
        } else {
          setRoutingCollection(DEFAULT_ROUTING_COLLECTION);
          setSelectedRuleSetId("perfect_rules");
        }
      })
      .catch((err) => {
        console.warn("Could not load routing rule collection:", err);
      });
  }, []);

  const saveDiagnostics = async () => {
    if (diagnosticsBusy) return;
    setDiagnosticsBusy(true);
    try {
      const result = await invoke<{ cancelled?: boolean; path?: string }>(
        "collect_diagnostics",
        {},
      );
      if (!result.cancelled) {
        toast.success(t("common.diagnosticsSaved"), { description: result.path });
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setDiagnosticsBusy(false);
    }
  };

  const handleSaveAdvanced = async () => {
    if (advancedSaving) return;
    setAdvancedSaving(true);
    try {
      const saved = await invoke<AdvancedProxySettings>("save_advanced_proxy_settings", {
        settings: advancedSettings,
      });
      setAdvancedSettings(saved);
      toast.success("高级设置已成功保存并应用到代理内核！");
    } catch (error) {
      toast.error(`保存高级设置失败: ${error}`);
    } finally {
      setAdvancedSaving(false);
    }
  };

  const handleResetAdvanced = () => {
    setAdvancedSettings(DEFAULT_ADVANCED_SETTINGS);
    toast.info("已重置为系统推荐最佳默认值，请点击“保存并应用”以更新内核");
  };

  // Helper to update current selected rule set inside collection
  const updateCurrentRuleSet = (updater: (prev: RoutingRuleSet) => RoutingRuleSet) => {
    setRoutingCollection((prev) => {
      const updatedSets = prev.rule_sets.map((s) => {
        if (s.id === currentRuleSet.id) {
          return updater(s);
        }
        return s;
      });
      return {
        ...prev,
        rule_sets: updatedSets,
      };
    });
  };

  // Set a rule set as active (生效)
  const handleSetActiveRuleSet = (setId: string) => {
    setRoutingCollection((prev) => ({
      ...prev,
      active_id: setId,
      rule_sets: prev.rule_sets.map((s) => ({
        ...s,
        active: s.id === setId,
      })),
    }));
    toast.success("已将该规则集设为当前生效规则，点击“确定保存并应用”更新代理内核");
  };

  // Clone current rule set
  const handleCloneRuleSet = () => {
    const newId = `ruleset_${Date.now()}`;
    const cloned: RoutingRuleSet = {
      ...JSON.parse(JSON.stringify(currentRuleSet)),
      id: newId,
      name: `${currentRuleSet.name} (副本)`,
      active: false,
      sort_order: routingCollection.rule_sets.length,
    };
    setRoutingCollection((prev) => ({
      ...prev,
      rule_sets: [...prev.rule_sets, cloned],
    }));
    setSelectedRuleSetId(newId);
    toast.success(`已成功克隆同级规则集「${cloned.name}」`);
  };

  // Delete current rule set
  const handleDeleteRuleSet = (setId: string) => {
    if (routingCollection.rule_sets.length <= 1) {
      toast.error("至少需保留一个规则集，无法删除");
      return;
    }
    const toDelete = routingCollection.rule_sets.find((s) => s.id === setId);
    if (!window.confirm(`确定要删除规则集「${toDelete?.name || setId}」吗？`)) return;

    const remaining = routingCollection.rule_sets.filter((s) => s.id !== setId);
    let newActiveId = routingCollection.active_id;
    if (routingCollection.active_id === setId) {
      newActiveId = remaining[0].id;
    }

    setRoutingCollection({
      active_id: newActiveId,
      rule_sets: remaining.map((s) => ({
        ...s,
        active: s.id === newActiveId,
      })),
    });

    setSelectedRuleSetId(remaining[0].id);
    toast.success("规则集已删除");
  };

  // Create new sibling rule set at the same level
  const handleCreateSiblingRuleSet = () => {
    if (!newRuleSetName.trim()) {
      toast.error("请输入规则集别名");
      return;
    }
    const newId = `ruleset_${Date.now()}`;
    let baseRules: RoutingRuleItem[] = [];
    if (newRuleSetTemplate === "perfect") {
      baseRules = JSON.parse(JSON.stringify(PERFECT_ROUTING_RULE_SET.rules));
    } else if (newRuleSetTemplate === "bypass_cn") {
      baseRules = JSON.parse(JSON.stringify(BYPASS_CN_RULE_SET.rules));
    } else if (newRuleSetTemplate === "global_proxy") {
      baseRules = JSON.parse(JSON.stringify(GLOBAL_PROXY_RULE_SET.rules));
    } else if (newRuleSetTemplate === "global_direct") {
      baseRules = JSON.parse(JSON.stringify(GLOBAL_DIRECT_RULE_SET.rules));
    } else {
      baseRules = [];
    }

    const newSet: RoutingRuleSet = {
      id: newId,
      name: newRuleSetName.trim(),
      active: newRuleSetSetActive,
      sort_order: routingCollection.rule_sets.length,
      domain_strategy: newRuleSetDomainStrategy,
      custom_url: "",
      rules: baseRules,
    };

    const newActiveId = newRuleSetSetActive ? newId : routingCollection.active_id;
    const newSets = [...routingCollection.rule_sets, newSet].map((s) => ({
      ...s,
      active: s.id === newActiveId,
    }));

    setRoutingCollection({
      active_id: newActiveId,
      rule_sets: newSets,
    });

    setSelectedRuleSetId(newId);
    setNewRuleSetDialogOpen(false);
    setNewRuleSetName("");
    toast.success(`成功创建同级规则集「${newSet.name}」！`);
  };

  // Save full collection and reload core
  const handleSaveRouting = async () => {
    if (routingSaving) return;
    setRoutingSaving(true);
    try {
      const saved = await invoke<RoutingRuleCollection>("save_routing_collection", {
        collection: routingCollection,
      });
      setRoutingCollection(saved);
      toast.success("全部路由规则集已成功保存并应用到代理分流内核！");
    } catch (error) {
      toast.error(`保存路由规则集失败: ${error}`);
    } finally {
      setRoutingSaving(false);
    }
  };

  // Reset all to defaults
  const handleResetRouting = async () => {
    if (!window.confirm("确定要恢复默认预设规则集（完美分流规则、绕过大陆、全局代理、全局直连）吗？")) return;
    try {
      const defaultCol = await invoke<RoutingRuleCollection>("reset_routing_collection");
      setRoutingCollection(defaultCol);
      setSelectedRuleSetId(defaultCol.active_id || "perfect_rules");
      toast.success("已恢复为默认预设规则集，并已应用到内核！");
    } catch {
      setRoutingCollection(DEFAULT_ROUTING_COLLECTION);
      setSelectedRuleSetId("perfect_rules");
      toast.info("已在本地恢复默认预设规则集，请点击“保存并应用”");
    }
  };

  const handleToggleAllRules = (checked: boolean) => {
    updateCurrentRuleSet((set) => ({
      ...set,
      rules: set.rules.map((r) => ({ ...r, enabled: checked })),
    }));
  };

  const handleToggleRule = (index: number, checked: boolean) => {
    updateCurrentRuleSet((set) => {
      const updated = [...set.rules];
      updated[index] = { ...updated[index], enabled: checked };
      return { ...set, rules: updated };
    });
  };

  const handleDeleteRule = (index: number) => {
    updateCurrentRuleSet((set) => ({
      ...set,
      rules: set.rules.filter((_, i) => i !== index),
    }));
  };

  const handleMoveRule = (index: number, direction: "up" | "down") => {
    updateCurrentRuleSet((set) => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= set.rules.length) return set;
      const updated = [...set.rules];
      const temp = updated[index];
      updated[index] = updated[targetIndex];
      updated[targetIndex] = temp;
      return { ...set, rules: updated };
    });
  };

  const handleOpenAddRule = () => {
    setIsNewRule(true);
    setEditingRule({
      id: `rule_${Date.now()}`,
      enabled: true,
      name: "",
      rule_type: "",
      outbound_tag: "proxy",
      port: "",
      protocol: "",
      inbound_tag: "",
      network: "",
      target: "",
    });
    setRuleDialogOpen(true);
  };

  const handleOpenEditRule = (rule: RoutingRuleItem) => {
    setIsNewRule(false);
    setEditingRule({ ...rule });
    setRuleDialogOpen(true);
  };

  const handleSaveRuleFromDialog = () => {
    if (!editingRule) return;
    if (!editingRule.name.trim()) {
      toast.error("规则别名不能为空");
      return;
    }
    updateCurrentRuleSet((set) => {
      if (isNewRule) {
        return {
          ...set,
          rules: [...set.rules, editingRule],
        };
      } else {
        return {
          ...set,
          rules: set.rules.map((r) =>
            r.id === editingRule.id ? editingRule : r,
          ),
        };
      }
    });
    setRuleDialogOpen(false);
    setEditingRule(null);
  };

  const handleImportFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error("剪贴板内容为空");
        return;
      }
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          updateCurrentRuleSet((set) => ({
            ...set,
            rules: [...set.rules, ...parsed],
          }));
          toast.success(`成功从剪贴板导入 ${parsed.length} 条规则`);
          return;
        } else if (parsed && Array.isArray(parsed.rules)) {
          updateCurrentRuleSet((set) => ({
            ...set,
            ...parsed,
          }));
          toast.success(`成功从剪贴板导入完整规则集 (${parsed.rules.length} 条规则)`);
          return;
        }
      } catch {
        // Line-based fallback
        const lines = text
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        const newRules: RoutingRuleItem[] = lines.map((line, idx) => ({
          id: `clip_${Date.now()}_${idx}`,
          enabled: true,
          name: `导入规则 ${idx + 1}`,
          rule_type: "",
          outbound_tag: "proxy",
          port: "",
          protocol: "",
          inbound_tag: "",
          network: "",
          target: line,
        }));
        updateCurrentRuleSet((set) => ({
          ...set,
          rules: [...set.rules, ...newRules],
        }));
        toast.success(`成功从剪贴板行文本导入 ${newRules.length} 条规则`);
      }
    } catch (e) {
      toast.error(`读取剪贴板失败: ${e}`);
    }
  };

  const allRulesChecked =
    currentRuleSet.rules.length > 0 &&
    currentRuleSet.rules.every((r) => r.enabled);

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-11 p-1 bg-muted/60">
            <TabsTrigger value="general" className="flex items-center gap-2 text-xs font-medium">
              <LuSlidersHorizontal className="size-3.5" />
              常规设置 (系统与外观)
            </TabsTrigger>
            <TabsTrigger value="advanced" className="flex items-center gap-2 text-xs font-medium">
              <LuNetwork className="size-3.5" />
              高级设置 (代理内核参数)
            </TabsTrigger>
            <TabsTrigger value="routing" className="flex items-center gap-2 text-xs font-medium">
              <LuRoute className="size-3.5 text-primary" />
              路由设置 (规则分流设定)
            </TabsTrigger>
          </TabsList>

          {/* ========================================================================= */}
          {/* TAB 1: 常规设置 (General Settings)                                        */}
          {/* ========================================================================= */}
          <TabsContent value="general" className="mt-4 flex flex-col gap-4">
            {/* 权限服务端接入配置 (RBAC Backend) */}
            <Section
              title="权限服务端接入配置 (RBAC Backend)"
              description="选择指纹浏览器所连接的权限管理服务端，用于同步团队数据、鉴权验证与安全管控规则。"
              icon={LuServer}
            >
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-foreground">目标服务节点</p>
                    {serverStatus === "connected" && (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 text-[11px] gap-1"
                      >
                        <LuCircleCheck className="size-3" />
                        已连通 {serverInfo && `· ${serverInfo}`}
                      </Badge>
                    )}
                    {serverStatus === "error" && (
                      <Badge
                        variant="outline"
                        className="border-rose-500/30 text-rose-600 bg-rose-50 dark:bg-rose-950/20 text-[11px] gap-1"
                      >
                        <LuCircleX className="size-3" />
                        连接失败
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    默认首选服务节点。系统已启用双机热备自动故障转移 (Auto-Failover)，当首选节点不可用时将自动无缝接管备用节点，并保障数据实时双向同步。
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    value={serverUrl}
                    onValueChange={(val) => {
                      accountStore.setServerUrl(val);
                      toast.success(`已切换至: ${PREDEFINED_SERVERS.find(s => s.url === val)?.name || val}`);
                    }}
                  >
                    <SelectTrigger size="sm" className="w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PREDEFINED_SERVERS.map((server) => (
                        <SelectItem key={server.id} value={server.url}>
                          {server.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleTestServerConnection()}
                    disabled={testingServer}
                    className="h-8 text-xs shrink-0 gap-1.5"
                  >
                    <LuRefreshCw className={`size-3.5 ${testingServer ? "animate-spin" : ""}`} />
                    测试连接
                  </Button>
                </div>
              </div>
            </Section>

            <Section title={t("common.appearance")} description={t("common.appearanceDescription")}>
              <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs text-foreground">{t("common.theme")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("common.systemFollows")}
                  </p>
                </div>
                <Select
                  value={theme}
                  onValueChange={(value) => setTheme(value as ThemeMode)}
                >
                  <SelectTrigger size="sm" className="w-32 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {THEME_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs text-foreground">{t("common.language")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("common.languageDescription")}
                  </p>
                </div>
                <Select
                  value={i18n.resolvedLanguage ?? "en"}
                  onValueChange={(value) => {
                    void i18n.changeLanguage(value);
                  }}
                >
                  <SelectTrigger size="sm" className="w-32 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Section>

            <Section title={t("common.engine")} description={t("common.engineDescription")}>
              <Row label={t("common.target")} value={versions.engine} />
              <Row label={t("common.core")} value={versions.core} />
              <Row label={t("common.sidecar")} value={versions.sidecar} />
            </Section>

            {download && (
              <Section
                title={t("common.downloadingEngine")}
                description={t("common.downloadingEngineDescription")}
              >
                <div className="space-y-2 px-4 py-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{download.phase}</span>
                    <span className="tabular-nums text-foreground">
                      {Math.round(download.percent)}%
                    </span>
                  </div>
                  <Progress value={download.percent} />
                </div>
              </Section>
            )}

            {!versionLine && (
              <Section title={t("common.engine")}>
                <div className="space-y-2 px-4 py-3">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </Section>
            )}

            <Section
              title={t("common.profilesStore")}
              description={t("common.profilesStoreDescription")}
            >
              <Row label={t("common.storedAs")} value={t("common.seedOptions")} />
              <Row label={t("common.identityDrawn")} value={t("common.drawnOnRead")} />
            </Section>

            <Section title={t("common.security")} description={t("common.securityDescription")}>
              {security === null ? (
                <div className="space-y-2 px-4 py-3">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ) : (
                <div className="border-b border-border px-4 py-2.5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-muted-foreground">{t("common.storeFiles")}</span>
                    <span className="text-xs text-foreground">
                      {security.store_sealed ? t("common.sealed") : t("common.plaintext")}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {security.store_seal_note}
                  </p>
                </div>
              )}
            </Section>

            <Section title={t("common.application")} description={t("common.applicationDescription")}>
              <Row label={t("common.application")} value={t("common.applicationName")} />
              <Row label={t("common.window")} value={t("common.windowFrameless")} />
            </Section>

            <Section
              title={t("common.diagnostics")}
              description={t("common.diagnosticsDescription")}
            >
              <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                <p className="text-xs text-muted-foreground">
                  {t("common.diagnosticsHint")}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5 text-xs"
                  disabled={diagnosticsBusy}
                  onClick={() => void saveDiagnostics()}
                >
                  <LuSave className="size-3.5" />
                  {diagnosticsBusy ? t("common.saving") : t("common.saveDiagnostics")}
                </Button>
              </div>
            </Section>
          </TabsContent>

          {/* ========================================================================= */}
          {/* TAB 2: 高级设置 (Advanced Proxy Core Settings)                            */}
          {/* ========================================================================= */}
          <TabsContent value="advanced" className="mt-4 flex flex-col gap-5">
            <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-2.5">
                <LuInfo className="size-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-semibold text-foreground">
                    代理底层内核基础设置 (参考 v2rayN 基础参数规范)
                  </h4>
                  <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                    本页面汇集了代理核心的入站监听、路由分流、DNS 防污染、测速机制及直连绕行名单。每项均预设了业界最佳默认值，并提供详尽的原理解释。修改后点击“保存并应用”将自动平滑重载代理内核。
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleResetAdvanced}
                >
                  <LuRotateCcw className="size-3.5" />
                  恢复推荐默认值
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={advancedSaving}
                  onClick={() => void handleSaveAdvanced()}
                >
                  <LuSave className="size-3.5" />
                  {advancedSaving ? "正在应用..." : "保存并应用"}
                </Button>
              </div>
            </div>

            {/* 1. 本地入站与监听 */}
            <Section
              icon={LuCpu}
              title="1. 本地入站监听 (Inbound & Local Ports)"
              description="配置代理内核在宿主机本地开放的统一监听端口、网卡绑定接口以及日志详细程度。"
            >
              <AdvancedSettingItem
                title="混合监听端口 (Mixed Port)"
                recommendedBadge="推荐默认: 0 (沙箱动态端口)"
                description="设置本地统一监听端口（同时兼容 HTTP 与 SOCKS5 双协议）。设为 0 时系统为每个指纹浏览器环境动态分配互不干扰的独立端口，确保最高防关联隔离安全性；若需要供外部客户端、开发工具或全局代理连接，可输入固定端口（如 10808 或 7890）。"
              >
                <Input
                  type="number"
                  min={0}
                  max={65535}
                  className="w-28 h-8 text-xs font-mono"
                  value={advancedSettings.mixed_port}
                  onChange={(e) =>
                    setAdvancedSettings({
                      ...advancedSettings,
                      mixed_port: Number(e.target.value) || 0,
                    })
                  }
                />
              </AdvancedSettingItem>

              <AdvancedSettingItem
                title="允许来自局域网的连接 (Allow LAN)"
                recommendedBadge="推荐默认: 关闭 (false)"
                description="是否允许局域网内的其它设备（如手机、平板、其它电脑）通过本机的 IP 地址使用此代理通道。指纹防关联浏览器场景下强烈建议保持关闭，防止局域网设备产生意外出口流量或被局域网端口扫描暴露。"
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="allow_lan"
                    checked={advancedSettings.allow_lan}
                    onCheckedChange={(checked) =>
                      setAdvancedSettings({
                        ...advancedSettings,
                        allow_lan: Boolean(checked),
                      })
                    }
                  />
                  <label htmlFor="allow_lan" className="text-xs cursor-pointer select-none">
                    {advancedSettings.allow_lan ? "已开启" : "已关闭"}
                  </label>
                </div>
              </AdvancedSettingItem>

              <AdvancedSettingItem
                title="绑定监听地址 (Bind Address)"
                recommendedBadge="推荐默认: 127.0.0.1 (仅本机)"
                description="代理本地入站服务绑定的网络接口 IP 地址。设为 127.0.0.1 仅允许本机内部应用程序连接，安全性最高；若开启了局域网共享且需要对外提供代理，可改为 0.0.0.0。"
              >
                <Input
                  className="w-32 h-8 text-xs font-mono"
                  value={advancedSettings.bind_address}
                  onChange={(e) =>
                    setAdvancedSettings({
                      ...advancedSettings,
                      bind_address: e.target.value,
                    })
                  }
                />
              </AdvancedSettingItem>

              <AdvancedSettingItem
                title="内核日志输出等级 (Log Level)"
                recommendedBadge="推荐默认: warning (警告)"
                description="控制代理内核后台控制台输出日志的详细程度。日常使用推荐保持 warning，仅记录错误和关键警报，既能迅速发现节点故障，又避免高频读写海量连接日志拖慢磁盘与 CPU 性能。节点连接异常时可临时设为 debug 排查。"
              >
                <Select
                  value={advancedSettings.log_level}
                  onValueChange={(val) =>
                    setAdvancedSettings({ ...advancedSettings, log_level: val })
                  }
                >
                  <SelectTrigger size="sm" className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="silent">silent (完全静默)</SelectItem>
                    <SelectItem value="error">error (仅致命错误)</SelectItem>
                    <SelectItem value="warning">warning (警告与错误)</SelectItem>
                    <SelectItem value="info">info (普通运行日志)</SelectItem>
                    <SelectItem value="debug">debug (深度调试追踪)</SelectItem>
                  </SelectContent>
                </Select>
              </AdvancedSettingItem>
            </Section>

            {/* 2. 路由分流与协议栈 */}
            <Section
              icon={LuGlobe}
              title="2. 路由分流模式与协议 (Routing & Protocols)"
              description="管理国内外网站流量智能分流策略，以及 IPv6 与 UDP 数据包转发协议栈。"
            >
              <AdvancedSettingItem
                title="路由分流模式 (Routing Mode)"
                recommendedBadge="推荐默认: rule (规则分流)"
                description="流量分流规则：【rule 规则分流】（推荐）：国内网站直连秒开、国外网站通过代理节点转发，最省流量且速度最快；【global 全局代理】：所有网络访问（除绕行名单外）强制通过所选节点转发；【direct 全局直连】：全部直连，不经过代理。"
              >
                <Select
                  value={advancedSettings.mode}
                  onValueChange={(val) =>
                    setAdvancedSettings({ ...advancedSettings, mode: val })
                  }
                >
                  <SelectTrigger size="sm" className="w-36 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rule">rule (智能规则分流)</SelectItem>
                    <SelectItem value="global">global (全局节点代理)</SelectItem>
                    <SelectItem value="direct">direct (全局直接直连)</SelectItem>
                  </SelectContent>
                </Select>
              </AdvancedSettingItem>

              <AdvancedSettingItem
                title="IPv6 协议网络支持 (IPv6 Support)"
                recommendedBadge="推荐默认: 关闭 (false - 强烈建议)"
                description="是否允许代理内核解析并使用 IPv6 地址。绝大多数海外代理节点和 VPS 服务器并未正确配置纯净的 IPv6 出口路由。开启 IPv6 容易造成国内运营商 IPv6 绕路、网络卡顿断流，甚至会在 WebRTC 或 DNS 查询中泄漏宽带真实 IPv6 地址，破坏指纹纯净度，因此强烈建议保持关闭。"
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="ipv6"
                    checked={advancedSettings.ipv6}
                    onCheckedChange={(checked) =>
                      setAdvancedSettings({
                        ...advancedSettings,
                        ipv6: Boolean(checked),
                      })
                    }
                  />
                  <label htmlFor="ipv6" className="text-xs cursor-pointer select-none">
                    {advancedSettings.ipv6 ? "已开启" : "已关闭 (防真实IP泄漏)"}
                  </label>
                </div>
              </AdvancedSettingItem>

              <AdvancedSettingItem
                title="UDP 流量代理转发 (UDP Forwarding)"
                recommendedBadge="推荐默认: 开启 (true)"
                description="是否代理转发 UDP 数据包。现代 Web 广泛采用基于 UDP 的 QUIC / HTTP/3 协议，网页实时音视频（WebRTC）、语音通话、游戏联机以及 DNS 53 端口查询均需要 UDP 支持。开启后保障网页秒开与实时通信畅通无阻。"
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="udp_enabled"
                    checked={advancedSettings.udp_enabled}
                    onCheckedChange={(checked) =>
                      setAdvancedSettings({
                        ...advancedSettings,
                        udp_enabled: Boolean(checked),
                      })
                    }
                  />
                  <label htmlFor="udp_enabled" className="text-xs cursor-pointer select-none">
                    {advancedSettings.udp_enabled ? "已开启 (支持 QUIC/语音/游戏)" : "已关闭"}
                  </label>
                </div>
              </AdvancedSettingItem>
            </Section>

            {/* 3. DNS 引擎与防污染 */}
            <Section
              icon={LuShieldCheck}
              title="3. DNS 引擎与防污染 (DNS Engine & Anti-Pollution)"
              description="配置 Fake-IP 虚拟解析、境内外精准分流 Nameservers 以及加密 DoH 安全防劫持。"
            >
              <AdvancedSettingItem
                title="DNS 增强解析模式 (Enhanced Mode)"
                recommendedBadge="推荐默认: fake-ip (秒开防污染)"
                description="【fake-ip 虚拟 IP 模式】（推荐）：内核向浏览器立即返回保留网段虚拟 IP（198.18.x.x），由远程代理节点在服务端解析真实 IP。彻底消除本地 DNS 污染、杜绝本地 DNS 泄露，实现网页秒开；【redir-host 真实 IP 模式】：本地先进行真实 DNS 解析获取真实 IP 后再路由，存在被本地运营商 DNS 污染的风险。"
              >
                <Select
                  value={advancedSettings.dns_mode}
                  onValueChange={(val) =>
                    setAdvancedSettings({ ...advancedSettings, dns_mode: val })
                  }
                >
                  <SelectTrigger size="sm" className="w-36 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fake-ip">fake-ip (虚拟 IP 模式)</SelectItem>
                    <SelectItem value="redir-host">redir-host (真实解析模式)</SelectItem>
                  </SelectContent>
                </Select>
              </AdvancedSettingItem>

              <AdvancedSettingItem
                title="国内直连 DNS (Direct Nameservers)"
                recommendedBadge="推荐默认: 223.5.5.5, 119.29.29.29"
                description="用于快速解析国内直连网站与局域网主机的 DNS 地址（多个以英文逗号分隔）。默认阿里公共 DNS (223.5.5.5) 与腾讯 DNSPod (119.29.29.29)，具备极低响应延迟与智能 CDN 最优就近调度能力。"
              >
                <Input
                  className="w-64 sm:w-80 h-8 text-xs font-mono"
                  value={advancedSettings.direct_dns}
                  onChange={(e) =>
                    setAdvancedSettings({
                      ...advancedSettings,
                      direct_dns: e.target.value,
                    })
                  }
                />
              </AdvancedSettingItem>

              <AdvancedSettingItem
                title="国外/代理加密 DNS (Remote DoH Nameservers)"
                recommendedBadge="推荐默认: Cloudflare DoH & Google DNS"
                description="用于安全解析境外被墙域名与代理节点服务器地址。采用 Cloudflare 加密 DoH (https://cloudflare-dns.com/dns-query) 及 Google DNS (8.8.8.8)，彻底防止域名查询被运营商窥探劫持，且完整支持 HTTPS Type 65 记录与 ECH 握手。"
              >
                <Input
                  className="w-64 sm:w-80 h-8 text-xs font-mono"
                  value={advancedSettings.remote_dns}
                  onChange={(e) =>
                    setAdvancedSettings({
                      ...advancedSettings,
                      remote_dns: e.target.value,
                    })
                  }
                />
              </AdvancedSettingItem>

              <AdvancedSettingItem
                title="DNS 内存缓存 (DNS Memory Cache)"
                recommendedBadge="推荐默认: 开启 (true)"
                description="在代理内核内存中缓存最近解析的 DNS 记录，避免同一域名在访问多资源页面时重复发起网络解析，显著加快网页并行资源加载响应速度。"
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="dns_cache"
                    checked={advancedSettings.dns_cache}
                    onCheckedChange={(checked) =>
                      setAdvancedSettings({
                        ...advancedSettings,
                        dns_cache: Boolean(checked),
                      })
                    }
                  />
                  <label htmlFor="dns_cache" className="text-xs cursor-pointer select-none">
                    {advancedSettings.dns_cache ? "已开启" : "已关闭"}
                  </label>
                </div>
              </AdvancedSettingItem>
            </Section>

            {/* 4. 测速与健康检测 */}
            <Section
              icon={LuActivity}
              title="4. 节点延迟与健康检测 (Latency & Speed Testing)"
              description="配置测量节点响应延迟与出口速率时所使用的全球轻量检测端点、超时阈值及测试并发数。"
            >
              <AdvancedSettingItem
                title="延迟测速目标 URL (Latency Test URL)"
                recommendedBadge="推荐默认: Cloudflare 204 Anycast"
                description="测试节点响应延迟时所发送真实 HTTP 请求的轻量端点。返回 HTTP 204 No Content，极省流量且全球就近 Anycast 服务。推荐使用 http://cp.cloudflare.com/generate_204，备选 http://www.gstatic.com/generate_204。"
              >
                <Input
                  className="w-64 sm:w-80 h-8 text-xs font-mono"
                  value={advancedSettings.delay_test_url}
                  onChange={(e) =>
                    setAdvancedSettings({
                      ...advancedSettings,
                      delay_test_url: e.target.value,
                    })
                  }
                />
              </AdvancedSettingItem>

              <AdvancedSettingItem
                title="延迟测速超时时间 (Delay Timeout)"
                recommendedBadge="推荐默认: 5000 ms (5秒)"
                description="单次节点延迟测速的最大等待时长（范围 1000 ~ 15000 ms）。设置过短（如 < 2000ms）可能误判部分偏远海外节点为超时，设置过长（如 > 10000ms）在遇到批量失效节点时会导致测速卡顿过久。5000ms 为平衡精确度与效率的黄金值。"
              >
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={1000}
                    max={15000}
                    step={500}
                    className="w-24 h-8 text-xs font-mono"
                    value={advancedSettings.delay_timeout_ms}
                    onChange={(e) =>
                      setAdvancedSettings({
                        ...advancedSettings,
                        delay_timeout_ms: Number(e.target.value) || 5000,
                      })
                    }
                  />
                  <span className="text-xs text-muted-foreground">ms</span>
                </div>
              </AdvancedSettingItem>

              <AdvancedSettingItem
                title="下载测速目标 URL (Speed Test URL)"
                recommendedBadge="推荐默认: Cloudflare 5MB Data"
                description="测算节点下载峰值速率（MB/s）所请求的数据测试包。默认采用 Cloudflare Speed 5MB 测试文件，带宽充裕且不会过度损耗节点套餐流量。"
              >
                <Input
                  className="w-64 sm:w-80 h-8 text-xs font-mono"
                  value={advancedSettings.speed_test_url}
                  onChange={(e) =>
                    setAdvancedSettings({
                      ...advancedSettings,
                      speed_test_url: e.target.value,
                    })
                  }
                />
              </AdvancedSettingItem>

              <AdvancedSettingItem
                title="批量测速并发线程数 (Test Concurrency)"
                recommendedBadge="推荐默认: 5 个并发"
                description="批量检测节点延迟时的并发工作任务数（范围 1 ~ 15）。适度并发可在几秒内快速测完全组数十个节点，同时防止瞬时高并发引起本地网络拥塞或触发海外 VPS 节点的防爆限流策略。"
              >
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={1}
                    max={15}
                    className="w-20 h-8 text-xs font-mono"
                    value={advancedSettings.test_concurrency}
                    onChange={(e) =>
                      setAdvancedSettings({
                        ...advancedSettings,
                        test_concurrency: Number(e.target.value) || 5,
                      })
                    }
                  />
                  <span className="text-xs text-muted-foreground">个并发</span>
                </div>
              </AdvancedSettingItem>
            </Section>

            {/* 5. 局域网与直连绕行名单 */}
            <Section
              icon={LuNetwork}
              title="5. 局域网与直连绕行名单 (Bypass Domain & IP List)"
              description="无论在何种代理模式下，匹配该名单的域名与 IP 地址均强制走本地直连，绝不通过代理转发。"
            >
              <div className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-medium text-foreground">绕行目标列表</span>
                  <Badge
                    variant="outline"
                    className="text-[10px] h-5 px-1.5 py-0 font-normal text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                  >
                    推荐默认: 包含回环地址及私有局域网网段
                  </Badge>
                </div>
                <Textarea
                  rows={3}
                  className="text-xs font-mono leading-relaxed resize-y mt-1"
                  placeholder="localhost; 127.*; 10.*; 172.16.*; 192.168.*; <local>"
                  value={advancedSettings.bypass_domain_list}
                  onChange={(e) =>
                    setAdvancedSettings({
                      ...advancedSettings,
                      bypass_domain_list: e.target.value,
                    })
                  }
                />
                <p className="text-[11px] leading-relaxed text-muted-foreground mt-1">
                  支持格式：localhost、&lt;local&gt;、IP 掩码网段（如 127.*, 192.168.*, 10.0.0.0/8）、域名后缀（如 *.internal.com）。多个目标以分号（;）、逗号（,）或换行隔开。确保访问局域网打印机、NAS、企业内网与本地开发测试服务时不经过海外代理。
                </p>
              </div>
            </Section>

            {/* Bottom Save Button Bar */}
            <div className="flex items-center justify-end gap-3 pt-2 pb-6">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={handleResetAdvanced}
              >
                <LuRotateCcw className="size-3.5" />
                恢复推荐默认值
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 min-w-28"
                disabled={advancedSaving}
                onClick={() => void handleSaveAdvanced()}
              >
                <LuSave className="size-3.5" />
                {advancedSaving ? "正在应用..." : "保存并应用"}
              </Button>
            </div>
          </TabsContent>

          {/* ========================================================================= */}
          {/* TAB 3: 路由设置 (Routing Rule-Set Settings - 支持多同级规则集与切换)        */}
          {/* ========================================================================= */}
          <TabsContent value="routing" className="mt-4 flex flex-col gap-4">
            {/* 1. 同级路由规则集选择与管理栏 */}
            <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <LuRoute className="size-4.5 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">路由规则集列表</h3>
                  <Badge variant="outline" className="text-[10px] h-5">
                    共 {routingCollection.rule_sets.length} 个同级规则集
                  </Badge>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5 text-xs bg-orange-600 hover:bg-orange-700 text-white shadow-xs"
                    onClick={() => {
                      setNewRuleSetName("");
                      setNewRuleSetDomainStrategy("IPIfNonMatch");
                      setNewRuleSetTemplate("perfect");
                      setNewRuleSetSetActive(true);
                      setNewRuleSetDialogOpen(true);
                    }}
                  >
                    <LuPlus className="size-3.5" />
                    新建同级规则
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs"
                    onClick={handleCloneRuleSet}
                    title="复制当前规则集创建同级新规则"
                  >
                    <LuCopy className="size-3.5" />
                    克隆此规则集
                  </Button>
                  {routingCollection.rule_sets.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                      onClick={() => handleDeleteRuleSet(currentRuleSet.id)}
                      title="删除当前规则集"
                    >
                      <LuTrash2 className="size-3.5" />
                      删除此集
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs"
                    onClick={() => void handleResetRouting()}
                    title="恢复内置所有默认规则集预设"
                  >
                    <LuRotateCcw className="size-3.5" />
                    恢复默认预设
                  </Button>
                </div>
              </div>

              {/* Sibling Rule Sets Capsule Tabs */}
              <div className="flex flex-wrap gap-2 items-center pt-3">
                {routingCollection.rule_sets.map((set) => {
                  const isSelected = set.id === currentRuleSet.id;
                  const isActive =
                    set.id === routingCollection.active_id || set.active;
                  return (
                    <button
                      key={set.id}
                      type="button"
                      onClick={() => setSelectedRuleSetId(set.id)}
                      className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-accent border-orange-500/80 text-foreground ring-1 ring-orange-500/30"
                          : "bg-muted/40 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {isActive ? (
                        <span className="flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          生效中
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/70 px-1">
                          未生效
                        </span>
                      )}
                      <span className="font-semibold">{set.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        ({set.rules.length}条)
                      </span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    setNewRuleSetName("");
                    setNewRuleSetDomainStrategy("IPIfNonMatch");
                    setNewRuleSetTemplate("perfect");
                    setNewRuleSetSetActive(true);
                    setNewRuleSetDialogOpen(true);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-dashed border-border text-muted-foreground hover:text-orange-500 hover:border-orange-500/50 transition cursor-pointer"
                >
                  <LuPlus className="size-3" />
                  <span>添加同级规则集</span>
                </button>
              </div>
            </div>

            {/* 2. 当前选中规则集设定卡片 (严格参照 v2rayN 路由规则集设定) */}
            <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    规则集设定: <span className="text-orange-600 dark:text-orange-400 font-bold">{currentRuleSet.name}</span>
                  </h3>
                  <Badge
                    variant={
                      currentRuleSet.id === routingCollection.active_id || currentRuleSet.active
                        ? "default"
                        : "secondary"
                    }
                    className="text-[10px] h-5"
                  >
                    {currentRuleSet.id === routingCollection.active_id || currentRuleSet.active
                      ? "当前核心生效规则"
                      : "备用规则集"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {currentRuleSet.id !== routingCollection.active_id && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                      onClick={() => handleSetActiveRuleSet(currentRuleSet.id)}
                    >
                      <LuCheck className="size-3.5" />
                      设为当前生效
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs"
                    onClick={handleOpenAddRule}
                  >
                    <LuPlus className="size-3.5" />
                    新增规则
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs"
                    onClick={() => void handleImportFromClipboard()}
                  >
                    <LuClipboard className="size-3.5" />
                    从剪贴板导入规则
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={routingSaving}
                    onClick={() => void handleSaveRouting()}
                  >
                    <LuSave className="size-3.5" />
                    {routingSaving ? "正在应用..." : "保存并应用"}
                  </Button>
                </div>
              </div>

              {/* Meta fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                <div>
                  <label className="text-xs font-medium text-foreground">别名</label>
                  <Input
                    className="h-8 text-xs mt-1"
                    value={currentRuleSet.name}
                    onChange={(e) =>
                      updateCurrentRuleSet((set) => ({ ...set, name: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">排序</label>
                  <Input
                    type="number"
                    className="h-8 text-xs font-mono mt-1"
                    value={currentRuleSet.sort_order}
                    onChange={(e) =>
                      updateCurrentRuleSet((set) => ({
                        ...set,
                        sort_order: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">域名解析策略</label>
                  <Select
                    value={currentRuleSet.domain_strategy}
                    onValueChange={(val) =>
                      updateCurrentRuleSet((set) => ({ ...set, domain_strategy: val }))
                    }
                  >
                    <SelectTrigger size="sm" className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IPIfNonMatch">IPIfNonMatch (推荐)</SelectItem>
                      <SelectItem value="AsIs">AsIs (直接使用域名)</SelectItem>
                      <SelectItem value="IPOnDemand">IPOnDemand (按需解析)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end pb-1.5">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="routing_active"
                      checked={
                        currentRuleSet.id === routingCollection.active_id || currentRuleSet.active
                      }
                      onCheckedChange={(checked) => {
                        if (checked) {
                          handleSetActiveRuleSet(currentRuleSet.id);
                        } else {
                          updateCurrentRuleSet((set) => ({ ...set, active: false }));
                        }
                      }}
                    />
                    <label
                      htmlFor="routing_active"
                      className="text-xs font-medium cursor-pointer select-none text-foreground"
                    >
                      设置为当前生效规则
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Rules Table Section matching the user screenshot */}
            <div className="rounded-lg border border-border bg-card overflow-hidden shadow-xs">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-orange-500/10 dark:bg-orange-950/20">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                    规则列表 ({currentRuleSet.rules.length})
                  </span>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    自上而下优先匹配
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                    onClick={() => handleToggleAllRules(!allRulesChecked)}
                  >
                    {allRulesChecked ? "取消全选" : "全选"}
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="text-xs">
                      <TableHead className="w-10 text-center">
                        <Checkbox
                          checked={allRulesChecked}
                          onCheckedChange={(checked) =>
                            handleToggleAllRules(Boolean(checked))
                          }
                        />
                      </TableHead>
                      <TableHead className="min-w-28">别名</TableHead>
                      <TableHead className="w-24">规则类型</TableHead>
                      <TableHead className="w-24">outboundTag</TableHead>
                      <TableHead className="w-20">port</TableHead>
                      <TableHead className="w-20">protocol</TableHead>
                      <TableHead className="w-20">inboundTag</TableHead>
                      <TableHead className="w-20">network</TableHead>
                      <TableHead className="min-w-56">domain / ip / process</TableHead>
                      <TableHead className="w-28 text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentRuleSet.rules.map((rule, idx) => {
                      const tagLower = rule.outbound_tag.toLowerCase();
                      const tagBadgeVariant =
                        tagLower === "block" || tagLower === "reject"
                          ? "destructive"
                          : tagLower === "direct"
                            ? "outline"
                            : "default";
                      const tagBadgeColor =
                        tagLower === "direct"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                          : tagLower === "proxy"
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                            : "";

                      return (
                        <TableRow
                          key={rule.id || idx}
                          className={`text-xs hover:bg-muted/20 ${!rule.enabled ? "opacity-50" : ""}`}
                        >
                          <TableCell className="text-center">
                            <Checkbox
                              checked={rule.enabled}
                              onCheckedChange={(checked) =>
                                handleToggleRule(idx, Boolean(checked))
                              }
                            />
                          </TableCell>
                          <TableCell className="font-medium text-foreground">
                            {rule.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {rule.rule_type || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={tagBadgeVariant}
                              className={`text-[10px] font-mono capitalize ${tagBadgeColor}`}
                            >
                              {rule.outbound_tag}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground">
                            {rule.port || "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {rule.protocol || "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {rule.inbound_tag || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground">
                            {rule.network || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-foreground max-w-xs truncate" title={rule.target}>
                            {rule.target || "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-6 text-muted-foreground hover:text-foreground"
                                disabled={idx === 0}
                                title="上移"
                                onClick={() => handleMoveRule(idx, "up")}
                              >
                                <LuArrowUp className="size-3" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-6 text-muted-foreground hover:text-foreground"
                                disabled={idx === currentRuleSet.rules.length - 1}
                                title="下移"
                                onClick={() => handleMoveRule(idx, "down")}
                              >
                                <LuArrowDown className="size-3" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-6 text-primary hover:text-primary/80"
                                title="编辑"
                                onClick={() => handleOpenEditRule(rule)}
                              >
                                <LuPencil className="size-3" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-6 text-destructive hover:text-destructive/80"
                                title="删除"
                                onClick={() => handleDeleteRule(idx)}
                              >
                                <LuTrash2 className="size-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Bottom Actions matching screenshot */}
            <div className="flex items-center justify-between pt-2 pb-6 border-t border-border">
              <p className="text-xs text-muted-foreground">
                核心生效规则：<strong className="text-foreground">
                  {routingCollection.rule_sets.find((s) => s.id === routingCollection.active_id)?.name || currentRuleSet.name}
                </strong> ({currentRuleSet.rules.filter((r) => r.enabled).length} 条启用，正在编辑: {currentRuleSet.name})
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setActiveTab("advanced")}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5 text-xs bg-orange-600 hover:bg-orange-700 text-white min-w-28 shadow-xs"
                  disabled={routingSaving}
                  onClick={() => void handleSaveRouting()}
                >
                  <LuCheck className="size-3.5" />
                  {routingSaving ? "正在应用..." : "确定保存并应用"}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Dialog for Add / Edit Rule */}
        <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">
                {isNewRule ? "新增分流规则" : "编辑分流规则"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                配置匹配条件及对应的目标出口动作（直连、代理或拦截阻断）。
              </DialogDescription>
            </DialogHeader>

            {editingRule && (
              <div className="flex flex-col gap-3.5 py-2">
                <div>
                  <label className="text-xs font-medium text-foreground">别名 (Name)</label>
                  <Input
                    className="h-8 text-xs mt-1"
                    placeholder="如: AI专用规则 / 游戏加速"
                    value={editingRule.name}
                    onChange={(e) =>
                      setEditingRule({ ...editingRule, name: e.target.value })
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-foreground">outboundTag (出口动作)</label>
                    <Select
                      value={editingRule.outbound_tag}
                      onValueChange={(val) =>
                        setEditingRule({ ...editingRule, outbound_tag: val })
                      }
                    >
                      <SelectTrigger size="sm" className="h-8 text-xs mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="proxy">proxy (走当前代理节点)</SelectItem>
                        <SelectItem value="direct">direct (本地直接连接)</SelectItem>
                        <SelectItem value="block">block (拦截阻断/REJECT)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground">network (网络协议)</label>
                    <Select
                      value={editingRule.network || "any"}
                      onValueChange={(val) =>
                        setEditingRule({
                          ...editingRule,
                          network: val === "any" ? "" : val,
                        })
                      }
                    >
                      <SelectTrigger size="sm" className="h-8 text-xs mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">全部 (TCP+UDP)</SelectItem>
                        <SelectItem value="tcp">仅 TCP</SelectItem>
                        <SelectItem value="udp">仅 UDP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-foreground">port (目标端口)</label>
                    <Input
                      className="h-8 text-xs font-mono mt-1"
                      placeholder="如: 443 或 0-65535"
                      value={editingRule.port}
                      onChange={(e) =>
                        setEditingRule({ ...editingRule, port: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground">规则类型 (可选)</label>
                    <Input
                      className="h-8 text-xs mt-1"
                      placeholder="如: Field"
                      value={editingRule.rule_type}
                      onChange={(e) =>
                        setEditingRule({ ...editingRule, rule_type: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground">
                    domain / ip / process (匹配目标)
                  </label>
                  <Textarea
                    rows={2.5}
                    className="text-xs font-mono leading-relaxed mt-1"
                    placeholder="如: geosite:category-ai-!cn 或 geosite:cn,geoip:cn 或 domain:example.com"
                    value={editingRule.target}
                    onChange={(e) =>
                      setEditingRule({ ...editingRule, target: e.target.value })
                    }
                  />
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[10px] text-muted-foreground">快捷填入:</span>
                    <button
                      type="button"
                      className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-foreground transition-colors cursor-pointer"
                      onClick={() =>
                        setEditingRule({
                          ...editingRule,
                          target: "geosite:private,geoip:private",
                          outbound_tag: "direct",
                        })
                      }
                    >
                      局域网私网
                    </button>
                    <button
                      type="button"
                      className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-foreground transition-colors cursor-pointer"
                      onClick={() =>
                        setEditingRule({
                          ...editingRule,
                          target: "geosite:category-ads-all",
                          outbound_tag: "block",
                        })
                      }
                    >
                      全网广告
                    </button>
                    <button
                      type="button"
                      className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-foreground transition-colors cursor-pointer"
                      onClick={() =>
                        setEditingRule({
                          ...editingRule,
                          target: "geosite:category-ai-!cn",
                          outbound_tag: "proxy",
                        })
                      }
                    >
                      海外AI
                    </button>
                    <button
                      type="button"
                      className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-foreground transition-colors cursor-pointer"
                      onClick={() =>
                        setEditingRule({
                          ...editingRule,
                          target: "geosite:youtube",
                          outbound_tag: "proxy",
                        })
                      }
                    >
                      YouTube
                    </button>
                    <button
                      type="button"
                      className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-foreground transition-colors cursor-pointer"
                      onClick={() =>
                        setEditingRule({
                          ...editingRule,
                          target: "geosite:cn,geoip:cn",
                          outbound_tag: "direct",
                        })
                      }
                    >
                      国内CN
                    </button>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setRuleDialogOpen(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                className="text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleSaveRuleFromDialog}
              >
                保存规则
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog for Creating New Sibling Rule Set (创建同级规则集) */}
        <Dialog open={newRuleSetDialogOpen} onOpenChange={setNewRuleSetDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">
                新建同级路由规则集
              </DialogTitle>
              <DialogDescription className="text-xs">
                创建与“完美分流规则”同级的独立路由规则集，可针对特定场景单独配置分流策略并随时一键切换。
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3.5 py-2">
              <div>
                <label className="text-xs font-medium text-foreground">
                  规则集别名 / 名称 <span className="text-destructive">*</span>
                </label>
                <Input
                  className="h-8 text-xs mt-1"
                  placeholder="如: 绕过大陆 / 全球代理 / 公司内网分流"
                  value={newRuleSetName}
                  onChange={(e) => setNewRuleSetName(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">
                  域名解析策略 (Domain Strategy)
                </label>
                <Select
                  value={newRuleSetDomainStrategy}
                  onValueChange={setNewRuleSetDomainStrategy}
                >
                  <SelectTrigger size="sm" className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IPIfNonMatch">IPIfNonMatch (推荐，匹配未中时解析 IP)</SelectItem>
                    <SelectItem value="AsIs">AsIs (直接使用域名进行匹配)</SelectItem>
                    <SelectItem value="IPOnDemand">IPOnDemand (按需解析匹配)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">
                  初始化预设模板
                </label>
                <Select
                  value={newRuleSetTemplate}
                  onValueChange={(val: any) => setNewRuleSetTemplate(val)}
                >
                  <SelectTrigger size="sm" className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="perfect">
                      🌟 完美分流模板 (包含UDP443、广告、AI、YouTube等7条黄金规则)
                    </SelectItem>
                    <SelectItem value="bypass_cn">
                      🌐 绕过大陆模式 (局域网直连、国内CN直连、国外走代理)
                    </SelectItem>
                    <SelectItem value="global_proxy">
                      🚀 全局代理模式 (局域网直连、其余全部走代理)
                    </SelectItem>
                    <SelectItem value="global_direct">
                      ⚡ 全局直连模式 (全部流量直接连接)
                    </SelectItem>
                    <SelectItem value="empty">
                      📝 空白规则集 (从零开始手动添加规则)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="new_set_active"
                  checked={newRuleSetSetActive}
                  onCheckedChange={(checked) => setNewRuleSetSetActive(Boolean(checked))}
                />
                <label
                  htmlFor="new_set_active"
                  className="text-xs font-medium cursor-pointer select-none text-foreground"
                >
                  创建后立即设为当前生效规则集
                </label>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setNewRuleSetDialogOpen(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                className="text-xs bg-orange-600 hover:bg-orange-700 text-white shadow-xs"
                onClick={handleCreateSiblingRuleSet}
              >
                确认创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
