import { useCallback, useEffect, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  LuPlus,
  LuPuzzle,
  LuTrash2,
  LuSearch,
  LuDownload,
  LuGlobe,
  LuFilter,
  LuLayers,
  LuRefreshCw,
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import type { ProfileSummary } from "@narc/sdk";

interface ExtensionsPageProps {
  profiles: ProfileSummary[];
  /** Called after a profile's addons change, so count columns re-settle. */
  onProfilesChanged: () => void;
}

export interface StoreExtensionItem {
  id: string;
  name: string;
  nameZh: string;
  category: "web3" | "ecommerce" | "translation" | "security" | "network" | "script";
  categoryLabel: string;
  desc: string;
  version: string;
  icon: string;
  rating: string;
  installedUsers: string;
  defaultPath: string;
}

const STORE_EXTENSIONS: StoreExtensionItem[] = [
  {
    id: "metamask",
    name: "MetaMask",
    nameZh: "小狐狸 Web3 钱包",
    category: "web3",
    categoryLabel: "Web3 / 钱包",
    desc: "全球最受欢迎的以太坊及 EVM 兼容链浏览器扩展钱包，支持 DApp 交互与链上资产管理。",
    version: "v12.9.2",
    icon: "🦊",
    rating: "4.8",
    installedUsers: "1,000万+",
    defaultPath: "extensions/metamask.xpi",
  },
  {
    id: "phantom",
    name: "Phantom Wallet",
    nameZh: "Phantom 幻影钱包",
    category: "web3",
    categoryLabel: "Web3 / 钱包",
    desc: "专为 Solana、以太坊及 Bitcoin 打造的轻量级非托管钱包，出海链游与 NFT 必备。",
    version: "v24.28.0",
    icon: "👻",
    rating: "4.9",
    installedUsers: "500万+",
    defaultPath: "extensions/phantom.xpi",
  },
  {
    id: "okx-wallet",
    name: "OKX Wallet",
    nameZh: "欧易 Web3 钱包",
    category: "web3",
    categoryLabel: "Web3 / 钱包",
    desc: "多链一站式钱包，支持 100+ 热门区块链网络、DEX 聚合交易及 Ordinals 铭文生态。",
    version: "v3.18.0",
    icon: "🪙",
    rating: "4.7",
    installedUsers: "400万+",
    defaultPath: "extensions/okx-wallet.xpi",
  },
  {
    id: "immersive-translate",
    name: "Immersive Translate",
    nameZh: "沉浸式双语翻译",
    category: "translation",
    categoryLabel: "翻译辅助",
    desc: "智能双语对照网页翻译利器，完美支持 Amazon, Shopee, eBay, Twitter, Discord 等全网站点。",
    version: "v1.0.42",
    icon: "🌐",
    rating: "4.9",
    installedUsers: "300万+",
    defaultPath: "extensions/immersive-translate.xpi",
  },
  {
    id: "cookie-editor",
    name: "Cookie-Editor",
    nameZh: "Cookie 高级编辑器",
    category: "security",
    categoryLabel: "账号与安全",
    desc: "在浏览器内快速查看、修改、添加、批量导出和导入 Cookies，多账号免密登录调试利器。",
    version: "v1.12.2",
    icon: "🍪",
    rating: "4.8",
    installedUsers: "200万+",
    defaultPath: "extensions/cookie-editor.xpi",
  },
  {
    id: "authenticator",
    name: "Authenticator (2FA)",
    nameZh: "二步验证动态口令",
    category: "security",
    categoryLabel: "账号与安全",
    desc: "在浏览器中直接生成两步验证 (TOTP) 动态码，告别手机扫码，支持批量秘钥导入。",
    version: "v7.0.1",
    icon: "🔐",
    rating: "4.9",
    installedUsers: "400万+",
    defaultPath: "extensions/authenticator.xpi",
  },
  {
    id: "switchy-omega",
    name: "Proxy SwitchyOmega",
    nameZh: "SwitchyOmega 代理切换",
    category: "network",
    categoryLabel: "网络工具",
    desc: "轻松快捷地管理和切换多个代理服务器设置，支持按域名自动切换代理与白名单规则。",
    version: "v2.5.21",
    icon: "⚡",
    rating: "4.6",
    installedUsers: "500万+",
    defaultPath: "extensions/switchyomega.xpi",
  },
  {
    id: "user-agent-switcher",
    name: "User-Agent Switcher",
    nameZh: "UA 请求头快捷切换",
    category: "network",
    categoryLabel: "网络工具",
    desc: "快速伪装与模拟不同平台浏览器和移动设备的 User-Agent 字符串，增强指纹抗检能力。",
    version: "v0.5.8",
    icon: "📱",
    rating: "4.5",
    installedUsers: "150万+",
    defaultPath: "extensions/ua-switcher.xpi",
  },
  {
    id: "violentmonkey",
    name: "Violentmonkey",
    nameZh: "暴力猴用户脚本",
    category: "script",
    categoryLabel: "自动化脚本",
    desc: "轻量级开源用户脚本管理器，支持运行各类 Tampermonkey/Greasemonkey 自动化油猴脚本。",
    version: "v2.18.0",
    icon: "🐵",
    rating: "4.8",
    installedUsers: "250万+",
    defaultPath: "extensions/violentmonkey.xpi",
  },
  {
    id: "amazon-seller",
    name: "Amazon Seller Helper",
    nameZh: "亚马逊卖家多站分析",
    category: "ecommerce",
    categoryLabel: "跨境电商",
    desc: "亚马逊各站点商品关键词排名监控、竞品销量估算、FBA 费用利润一键试算助手。",
    version: "v2.4.1",
    icon: "🛒",
    rating: "4.7",
    installedUsers: "80万+",
    defaultPath: "extensions/amazon-helper.xpi",
  },
  {
    id: "shopee-assistant",
    name: "Shopee Assistant",
    nameZh: "虾皮出海采集助手",
    category: "ecommerce",
    categoryLabel: "跨境电商",
    desc: "支持 Shopee / Lazada 多站点爆品货源采集、违禁词检测与主图高清一键抓取。",
    version: "v1.8.6",
    icon: "🛍️",
    rating: "4.6",
    installedUsers: "60万+",
    defaultPath: "extensions/shopee-assistant.xpi",
  },
];

export function ExtensionsPage({ profiles, onProfilesChanged }: ExtensionsPageProps) {
  const [activeMainTab, setActiveMainTab] = useState("store");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // 环境管理模式状态
  const [selectedProfileIds, setSelectedProfileIds] = useState<Set<string>>(new Set());
  const [profileAddonsMap, setProfileAddonsMap] = useState<Record<string, string[]>>({});
  const [loadingMap, setLoadingMap] = useState(false);

  // 单环境管理对话框
  const [singleTarget, setSingleTarget] = useState<ProfileSummary | null>(null);
  const [singleAddons, setSingleAddons] = useState<string[]>([]);
  const [customPath, setCustomPath] = useState("");
  const [busy, setBusy] = useState(false);

  // 批量安装选定扩展对话框
  const [batchInstallModalOpen, setBatchInstallModalOpen] = useState(false);
  const [pendingInstallExtension, setPendingInstallExtension] = useState<StoreExtensionItem | null>(null);
  const [batchTargetProfileIds, setBatchTargetProfileIds] = useState<Set<string>>(new Set());

  // 自定义扩展上传登记对话框
  const [customAddonModalOpen, setCustomAddonModalOpen] = useState(false);
  const [customAddonName, setCustomAddonName] = useState("");
  const [customAddonPath, setCustomAddonPath] = useState("");

  // 刷新所有环境的扩展映射
  const refreshAddonsMap = useCallback(async () => {
    setLoadingMap(true);
    try {
      const res = await invoke<Record<string, string[]>>("list_all_profile_addons");
      setProfileAddonsMap(res || {});
    } catch {
      // fallback: inspect one by one for first few
      const map: Record<string, string[]> = {};
      for (const p of profiles.slice(0, 50)) {
        try {
          const res = await invoke<{ profile: { addons?: string[] } }>("inspect_profile", { id: p.id });
          map[p.id] = res.profile.addons || [];
        } catch {
          // ignore
        }
      }
      setProfileAddonsMap(map);
    } finally {
      setLoadingMap(false);
    }
  }, [profiles]);

  useEffect(() => {
    void refreshAddonsMap();
  }, [refreshAddonsMap]);

  // 当打开单个环境管理时加载该环境扩展
  useEffect(() => {
    if (!singleTarget) {
      setSingleAddons([]);
      return;
    }
    let cancelled = false;
    void invoke<{ profile: { addons?: string[] } }>("inspect_profile", { id: singleTarget.id })
      .then((result) => {
        if (!cancelled) setSingleAddons(result.profile.addons ?? []);
      })
      .catch((error) => {
        toast.error(String(error));
        setSingleTarget(null);
      });
    return () => {
      cancelled = true;
    };
  }, [singleTarget]);

  // 单环境添加扩展
  const handleSingleAddAddon = useCallback(async () => {
    if (!singleTarget || !customPath.trim()) return;
    setBusy(true);
    try {
      const result = await invoke<{ addons: string[] }>("add_addon", {
        id: singleTarget.id,
        path: customPath.trim(),
      });
      setSingleAddons(result.addons);
      setCustomPath("");
      onProfilesChanged();
      void refreshAddonsMap();
      toast.success("扩展已成功添加到当前环境");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  }, [singleTarget, customPath, onProfilesChanged, refreshAddonsMap]);

  // 单环境移除扩展
  const handleSingleRemoveAddon = useCallback(
    async (addon: string) => {
      if (!singleTarget) return;
      setBusy(true);
      try {
        const result = await invoke<{ addons: string[] }>("remove_addon", {
          id: singleTarget.id,
          path: addon,
        });
        setSingleAddons(result.addons);
        onProfilesChanged();
        void refreshAddonsMap();
        toast.success("扩展已从当前环境移除");
      } catch (error) {
        toast.error(String(error));
      } finally {
        setBusy(false);
      }
    },
    [singleTarget, onProfilesChanged, refreshAddonsMap],
  );

  // 打开批量安装指定应用市场扩展的模态框
  const openBatchInstallModal = (ext: StoreExtensionItem) => {
    setPendingInstallExtension(ext);
    // 默认全选当前所有环境
    setBatchTargetProfileIds(new Set(profiles.map((p) => p.id)));
    setBatchInstallModalOpen(true);
  };

  // 执行批量安装
  const handleConfirmBatchInstall = async () => {
    if (!pendingInstallExtension) return;
    const targetIds = Array.from(batchTargetProfileIds);
    if (targetIds.length === 0) {
      toast.warning("请至少选择一个目标指纹环境");
      return;
    }
    setBusy(true);
    try {
      const res = await invoke<{ success: boolean; updated: number }>("batch_add_addon", {
        ids: targetIds,
        path: pendingInstallExtension.defaultPath,
      });
      toast.success(
        `成功为 ${res.updated || targetIds.length} 个环境批量安装 [${pendingInstallExtension.nameZh || pendingInstallExtension.name}]！`
      );
      setBatchInstallModalOpen(false);
      setPendingInstallExtension(null);
      onProfilesChanged();
      void refreshAddonsMap();
    } catch (err) {
      toast.error("批量安装失败: " + String(err));
    } finally {
      setBusy(false);
    }
  };

  // 批量为选中的表格行环境安装自定义扩展
  const handleBatchInstallCustom = async () => {
    if (!customAddonPath.trim()) {
      toast.warning("请输入扩展的本地绝对路径或标识");
      return;
    }
    const targetIds = Array.from(selectedProfileIds);
    if (targetIds.length === 0) {
      toast.warning("请在表格中至少勾选一个环境");
      return;
    }
    setBusy(true);
    try {
      const res = await invoke<{ success: boolean; updated: number }>("batch_add_addon", {
        ids: targetIds,
        path: customAddonPath.trim(),
      });
      toast.success(`成功为 ${res.updated || targetIds.length} 个环境批量绑定扩展！`);
      setCustomAddonModalOpen(false);
      setCustomAddonPath("");
      setCustomAddonName("");
      onProfilesChanged();
      void refreshAddonsMap();
    } catch (err) {
      toast.error("批量添加失败: " + String(err));
    } finally {
      setBusy(false);
    }
  };

  // 批量从选中环境移除指定扩展
  const handleBatchRemoveExtension = async (addonPath: string) => {
    const targetIds = Array.from(selectedProfileIds);
    if (targetIds.length === 0) {
      toast.warning("请在表格中至少勾选一个环境");
      return;
    }
    setBusy(true);
    try {
      const res = await invoke<{ success: boolean; removed: number }>("batch_remove_addon", {
        ids: targetIds,
        path: addonPath,
      });
      toast.success(`已从 ${res.removed} 个环境中卸载此扩展！`);
      onProfilesChanged();
      void refreshAddonsMap();
    } catch (err) {
      toast.error("批量移除失败: " + String(err));
    } finally {
      setBusy(false);
    }
  };

  // 过滤后的应用市场扩展
  const filteredStoreExtensions = useMemo(() => {
    return STORE_EXTENSIONS.filter((ext) => {
      if (categoryFilter !== "all" && ext.category !== categoryFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          ext.name.toLowerCase().includes(q) ||
          ext.nameZh.toLowerCase().includes(q) ||
          ext.desc.toLowerCase().includes(q) ||
          ext.categoryLabel.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [categoryFilter, searchQuery]);

  // 环境多选逻辑
  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProfileIds(new Set(profiles.map((p) => p.id)));
    } else {
      setSelectedProfileIds(new Set());
    }
  };

  const handleToggleProfile = (id: string) => {
    setSelectedProfileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      {/* 顶部现代化标题栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/50 px-6 py-4">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <LuPuzzle className="size-5 text-purple-500" />
            <span>浏览器扩展中心 (Browser Extensions Hub)</span>
            <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
              应用市场 / 批量安装 / 环境矩阵
            </Badge>
          </h2>
          <p className="text-xs text-muted-foreground pt-1">
            出海业务高频扩展一键安装，支持为全量指纹环境或指定多环境批量下发、自动激活与统一管理。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => void refreshAddonsMap()}
            disabled={loadingMap}
          >
            <LuRefreshCw className={`size-3.5 ${loadingMap ? "animate-spin" : ""}`} />
            <span>刷新配置</span>
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-xs"
            onClick={() => setCustomAddonModalOpen(true)}
          >
            <LuPlus className="size-3.5" />
            <span>上传自定义扩展</span>
          </Button>
        </div>
      </div>

      {/* 主选项卡: 应用市场 vs 环境扩展管理 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-6">
        <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="w-full space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList className="bg-muted/60 p-1">
              <TabsTrigger value="store" className="gap-1.5 text-xs font-medium">
                <LuGlobe className="size-3.5" />
                <span>精选扩展应用市场 ({STORE_EXTENSIONS.length})</span>
              </TabsTrigger>
              <TabsTrigger value="matrix" className="gap-1.5 text-xs font-medium">
                <LuLayers className="size-3.5" />
                <span>环境扩展配置矩阵 ({profiles.length})</span>
              </TabsTrigger>
            </TabsList>

            {activeMainTab === "store" && (
              <div className="flex items-center gap-2 flex-1 max-w-xs">
                <div className="relative w-full">
                  <LuSearch className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="搜索扩展名称、功能或分类..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8.5 pl-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* TAB 1: 精选扩展应用市场 (Store) */}
          <TabsContent value="store" className="space-y-6 focus:outline-none">
            {/* 分类筛选器 */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border/50 pb-3">
              <span className="text-xs text-muted-foreground mr-1 flex items-center gap-1">
                <LuFilter className="size-3" /> 分类:
              </span>
              {[
                { id: "all", label: "全部扩展" },
                { id: "web3", label: "Web3 / 钱包" },
                { id: "ecommerce", label: "跨境电商" },
                { id: "translation", label: "翻译辅助" },
                { id: "security", label: "账号与安全 (2FA)" },
                { id: "network", label: "网络与指纹" },
                { id: "script", label: "自动化脚本" },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryFilter(c.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    categoryFilter === c.id
                      ? "bg-purple-600 text-white font-semibold shadow-xs"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* 扩展卡片网格 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredStoreExtensions.map((ext) => {
                // 计算当前有多少个环境安装了该扩展
                const installedCount = Object.values(profileAddonsMap).filter((list) =>
                  list.some((path) => path.toLowerCase().includes(ext.id) || path.toLowerCase().includes(ext.defaultPath.toLowerCase()))
                ).length;

                return (
                  <div
                    key={ext.id}
                    className="rounded-xl border border-border bg-card p-5 space-y-4 flex flex-col justify-between hover:border-purple-500/30 transition-all shadow-xs"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 shadow-xs">
                            {ext.icon}
                          </span>
                          <div>
                            <div className="font-bold text-sm text-foreground flex items-center gap-1.5">
                              <span>{ext.nameZh}</span>
                              <span className="text-[11px] font-normal text-muted-foreground font-mono">
                                ({ext.name})
                              </span>
                            </div>
                            <div className="flex items-center gap-2 pt-0.5 text-[11px] text-muted-foreground">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {ext.categoryLabel}
                              </Badge>
                              <span>{ext.version}</span>
                              <span>★ {ext.rating}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {ext.desc}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                      <div className="text-[11px] text-muted-foreground">
                        已在 <b className="text-purple-600 dark:text-purple-400 font-bold">{installedCount}</b> / {profiles.length} 环境启用
                      </div>

                      <Button
                        size="sm"
                        className="h-8 gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                        onClick={() => openBatchInstallModal(ext)}
                      >
                        <LuDownload className="size-3.5" />
                        <span>一键安装到环境</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* TAB 2: 环境扩展配置矩阵 (Matrix) */}
          <TabsContent value="matrix" className="space-y-4 focus:outline-none">
            {/* 批量操作控制栏 */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedProfileIds.size === profiles.length && profiles.length > 0}
                  onCheckedChange={handleToggleSelectAll}
                />
                <span className="text-xs font-medium">
                  已选择 <b className="text-primary">{selectedProfileIds.size}</b> / {profiles.length} 个环境
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setCustomAddonModalOpen(true)}
                  disabled={selectedProfileIds.size === 0}
                >
                  <LuPlus className="size-3.5" />
                  <span>为选中环境安装扩展</span>
                </Button>
                {selectedProfileIds.size > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      const sampleAddon = Array.from(selectedProfileIds)
                        .map((id) => profileAddonsMap[id] || [])
                        .flat()[0];
                      if (!sampleAddon) {
                        toast.info("所选环境未安装任何扩展");
                        return;
                      }
                      void handleBatchRemoveExtension(sampleAddon);
                    }}
                  >
                    <LuTrash2 className="size-3.5" />
                    <span>批量卸载扩展</span>
                  </Button>
                )}
              </div>
            </div>

            {/* 环境与扩展对应表格 */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 text-xs">
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selectedProfileIds.size === profiles.length && profiles.length > 0}
                        onCheckedChange={handleToggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-[200px]">指纹环境名称</TableHead>
                    <TableHead className="w-[120px]">扩展总数</TableHead>
                    <TableHead>已装载扩展列表</TableHead>
                    <TableHead className="w-[120px] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-12 text-center text-xs text-muted-foreground">
                        暂无环境，请先在【环境列表】中创建指纹浏览器实例
                      </TableCell>
                    </TableRow>
                  ) : (
                    profiles.map((p) => {
                      const isSelected = selectedProfileIds.has(p.id);
                      const currentAddons = profileAddonsMap[p.id] || [];

                      return (
                        <TableRow key={p.id} className="text-xs hover:bg-muted/30">
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleToggleProfile(p.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium text-foreground">
                            <div className="flex flex-col">
                              <span className="font-semibold">{p.name}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">{p.id.substring(0, 8)}...</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[11px] font-mono ${
                                currentAddons.length > 0
                                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 font-bold"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {currentAddons.length} 个扩展
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {currentAddons.length === 0 ? (
                                <span className="text-muted-foreground text-[11px] italic">未装载任何扩展</span>
                              ) : (
                                currentAddons.map((addon) => {
                                  const name = addon.split(/[\\/]/).pop() || addon;
                                  return (
                                    <span
                                      key={addon}
                                      className="inline-flex items-center gap-1 rounded bg-muted/60 px-2 py-0.5 text-[11px] font-mono border border-border"
                                      title={addon}
                                    >
                                      <LuPuzzle className="size-2.5 text-purple-500" />
                                      <span className="truncate max-w-[140px]">{name}</span>
                                    </span>
                                  );
                                })
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => setSingleTarget(p)}
                            >
                              <LuPuzzle className="size-3" />
                              <span>管理扩展</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* 弹窗 1: 单环境扩展管理与编辑 */}
      <Dialog
        open={singleTarget !== null}
        onOpenChange={(open) => {
          if (!open) setSingleTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold">
              <LuPuzzle className="size-4 text-purple-500" />
              <span>管理环境扩展: {singleTarget?.name}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              为该环境配置启动时自动加载的插件，支持 .xpi 格式安装包或已解压扩展文件夹。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="max-h-60 overflow-auto space-y-2">
              {singleAddons.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg space-y-1">
                  <LuPuzzle className="mx-auto size-6 text-muted-foreground/40" />
                  <div>该环境当前未安装任何扩展</div>
                </div>
              ) : (
                singleAddons.map((addon) => (
                  <div
                    key={addon}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-2 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground" title={addon}>
                      {addon}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleSingleRemoveAddon(addon)}
                      className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                      title="卸载扩展"
                    >
                      <LuTrash2 className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-border space-y-2">
              <Label className="text-xs font-medium">添加新扩展 (输入绝对文件路径或内置扩展标识):</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={customPath}
                  placeholder="例如: C:\extensions\metamask.xpi 或 extensions/metamask.xpi"
                  onChange={(e) => setCustomPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSingleAddAddon();
                  }}
                  className="font-mono text-xs h-8"
                />
                <Button
                  size="sm"
                  disabled={busy || !customPath.trim()}
                  onClick={() => void handleSingleAddAddon()}
                  className="h-8 gap-1 text-xs shrink-0"
                >
                  <LuPlus className="size-3.5" />
                  <span>添加</span>
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setSingleTarget(null)}>
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 弹窗 2: 从应用市场一键批量安装 */}
      <Dialog
        open={batchInstallModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setBatchInstallModalOpen(false);
            setPendingInstallExtension(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold">
              <span className="text-xl">{pendingInstallExtension?.icon}</span>
              <span>批量安装 [{pendingInstallExtension?.nameZh}] 到环境</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              请勾选您希望安装该扩展的目标指纹环境，环境启动时将自动加载此插件。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={batchTargetProfileIds.size === profiles.length && profiles.length > 0}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setBatchTargetProfileIds(new Set(profiles.map((p) => p.id)));
                    } else {
                      setBatchTargetProfileIds(new Set());
                    }
                  }}
                />
                <span className="font-semibold">全选所有环境</span>
              </div>
              <span className="text-muted-foreground">
                已选中 {batchTargetProfileIds.size} / {profiles.length} 个环境
              </span>
            </div>

            <div className="max-h-52 overflow-auto border border-border rounded-md divide-y divide-border">
              {profiles.map((p) => {
                const isChecked = batchTargetProfileIds.has(p.id);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2 hover:bg-muted/40 cursor-pointer text-xs"
                    onClick={() => {
                      setBatchTargetProfileIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      });
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox checked={isChecked} />
                      <span className="font-medium text-foreground">{p.name}</span>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">{p.id.substring(0, 8)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button size="sm" variant="outline" onClick={() => setBatchInstallModalOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold"
              onClick={handleConfirmBatchInstall}
              disabled={busy || batchTargetProfileIds.size === 0}
            >
              {busy ? "正在安装..." : `确认安装到 ${batchTargetProfileIds.size} 个环境`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 弹窗 3: 上传或批量添加自定义本地扩展 */}
      <Dialog open={customAddonModalOpen} onOpenChange={setCustomAddonModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold">
              <LuPlus className="size-4 text-purple-500" />
              <span>批量安装自定义本地扩展</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              输入本地扩展的绝对路径（.xpi 文件或解压扩展文件夹），系统将批量分发给选中的环境。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">扩展名称 / 标识 (可选):</Label>
              <Input
                placeholder="例如: MyCustomTool"
                value={customAddonName}
                onChange={(e) => setCustomAddonName(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">本地绝对路径 (.xpi 或目录):</Label>
              <Input
                placeholder="例如: D:\addons\my-extension.xpi"
                value={customAddonPath}
                onChange={(e) => setCustomAddonPath(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="rounded-md bg-muted/40 p-2.5 text-[11px] text-muted-foreground border border-border leading-relaxed">
              提示：选中的 <b>{selectedProfileIds.size}</b> 个指纹环境在启动时，内核将直接以此路径加载扩展。
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button size="sm" variant="outline" onClick={() => setCustomAddonModalOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold"
              onClick={handleBatchInstallCustom}
              disabled={busy || !customAddonPath.trim() || selectedProfileIds.size === 0}
            >
              {busy ? "执行中..." : `批量应用给选中的 ${selectedProfileIds.size} 个环境`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
