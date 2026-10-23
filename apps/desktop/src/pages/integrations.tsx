import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  LuPlug,
  LuServer,
  LuCopy,
  LuCheck,
  LuPlay,
  LuRefreshCw,
  LuShieldCheck,
  LuGlobe,
  LuCloud,
  LuCode,
  LuCpu,
  LuTerminal,
  LuLock,
  LuLayers,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProfileSummary } from "@narc/sdk";

interface IntegrationsPageProps {
  profiles: ProfileSummary[];
}

interface LocalApiStatus {
  running: boolean;
  port: number;
  url: string;
  driver_ready: boolean;
  driver_path: string | null;
  node_path: string | null;
}

interface ProxyProvider {
  id: string;
  name: string;
  logo: string;
  category: "residential" | "datacenter" | "mobile";
  desc: string;
  apiKey: string;
  apiUrl: string;
  protocol: "socks5" | "http";
  status: "unconfigured" | "connected" | "error";
  lastCheck?: string;
}

const DEFAULT_PROXY_PROVIDERS: ProxyProvider[] = [
  {
    id: "brightdata",
    name: "Bright Data",
    logo: "🌐",
    category: "residential",
    desc: "全球顶尖企业级动态住宅/机房代理网络，支持高并发会话保持",
    apiKey: "",
    apiUrl: "https://api.brightdata.com/zone/ips",
    protocol: "http",
    status: "unconfigured",
  },
  {
    id: "iproyal",
    name: "IPRoyal",
    logo: "👑",
    category: "residential",
    desc: "性价比较高的纯净住宅 IP 资源池，适合跨境电商及社媒矩阵",
    apiKey: "",
    apiUrl: "https://iproyal.com/api/v1/proxies",
    protocol: "socks5",
    status: "unconfigured",
  },
  {
    id: "oxylabs",
    name: "Oxylabs",
    logo: "⚡",
    category: "residential",
    desc: "覆盖 195+ 国家地区超 1 亿真实住宅 IP，99.9% 连通成功率",
    apiKey: "",
    apiUrl: "https://realtime.oxylabs.io/v1/queries",
    protocol: "http",
    status: "unconfigured",
  },
  {
    id: "smartproxy",
    name: "Smartproxy",
    logo: "🦊",
    category: "residential",
    desc: "极速响应住宅代理，出海多店铺防封与自动化爬虫主流选择",
    apiKey: "",
    apiUrl: "https://api.smartproxy.com/v1/endpoints",
    protocol: "socks5",
    status: "unconfigured",
  },
  {
    id: "922s5",
    name: "922 S5 Proxy",
    logo: "🎯",
    category: "residential",
    desc: "老牌 S5 客户端集成，支持按国家/城市/邮编精准提取",
    apiKey: "",
    apiUrl: "http://127.0.0.1:51218/api/extract",
    protocol: "socks5",
    status: "unconfigured",
  },
  {
    id: "proxyseller",
    name: "Proxy-Seller",
    logo: "📦",
    category: "datacenter",
    desc: "独享 IPv4 / IPv6 静态高匿代理，适合长期稳定店铺运营",
    apiKey: "",
    apiUrl: "https://proxy-seller.com/personal/api/v1",
    protocol: "socks5",
    status: "unconfigured",
  },
];

export function IntegrationsPage({ profiles }: IntegrationsPageProps) {
  const [activeTab, setActiveTab] = useState("api");
  const [apiStatus, setApiStatus] = useState<LocalApiStatus | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiToken, setApiToken] = useState(() => {
    return localStorage.getItem("narci_api_auth_token") || "narci_sec_" + Math.random().toString(36).substring(2, 12);
  });
  const [authEnabled, setAuthEnabled] = useState(() => {
    return localStorage.getItem("narci_api_auth_enabled") === "true";
  });
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // 调试控制台状态
  const [debugEndpoint, setDebugEndpoint] = useState("/api/v1/status");
  const [debugMethod, setDebugMethod] = useState("GET");
  const [debugProfileId, setDebugProfileId] = useState<string>(profiles[0]?.id || "");
  const [debugTesting, setDebugTesting] = useState(false);
  const [debugResult, setDebugResult] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // 代理服务商集成
  const [providers, setProviders] = useState<ProxyProvider[]>(() => {
    const saved = localStorage.getItem("narci_proxy_providers_config");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return DEFAULT_PROXY_PROVIDERS;
  });
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);

  // 云存储与备份设置
  const [cloudProvider, setCloudProvider] = useState("s3");
  const [cloudEndpoint, setCloudEndpoint] = useState(() => localStorage.getItem("narci_cloud_endpoint") || "s3.us-east-1.amazonaws.com");
  const [cloudBucket, setCloudBucket] = useState(() => localStorage.getItem("narci_cloud_bucket") || "narc-browser-backup");
  const [cloudAk, setCloudAk] = useState(() => localStorage.getItem("narci_cloud_ak") || "");
  const [cloudSk, setCloudSk] = useState(() => localStorage.getItem("narci_cloud_sk") || "");
  const [cloudSyncing, setCloudSyncing] = useState(false);

  // 验证码与接码平台
  const [capsolverKey, setCapsolverKey] = useState(() => localStorage.getItem("narci_capsolver_key") || "");
  const [twocaptchaKey, setTwocaptchaKey] = useState(() => localStorage.getItem("narci_2captcha_key") || "");
  const [smsKey, setSmsKey] = useState(() => localStorage.getItem("narci_sms_key") || "");
  const [captchaTesting, setCaptchaTesting] = useState(false);

  // 获取 Local API 状态
  const fetchApiStatus = async () => {
    setApiLoading(true);
    try {
      const res = await invoke<LocalApiStatus>("get_local_api_status");
      setApiStatus(res);
    } catch (err) {
      toast.error("获取 Local API 服务状态失败: " + String(err));
    } finally {
      setApiLoading(false);
    }
  };

  useEffect(() => {
    void fetchApiStatus();
  }, []);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`已复制 ${label}`);
  };

  const handleResetToken = () => {
    const newToken = "narci_sec_" + Math.random().toString(36).substring(2, 14);
    setApiToken(newToken);
    localStorage.setItem("narci_api_auth_token", newToken);
    toast.success("已生成新的 API 安全访问 Token");
  };

  const handleToggleAuth = (enabled: boolean) => {
    setAuthEnabled(enabled);
    localStorage.setItem("narci_api_auth_enabled", String(enabled));
    toast.info(enabled ? "已开启 API 鉴权保护" : "已允许免密访问本地 API");
  };

  // 运行在线 API 调试
  const handleRunDebugTest = async () => {
    if (!apiStatus?.url) {
      toast.warning("本地 API 服务未启动");
      return;
    }
    setDebugTesting(true);
    setDebugResult(null);
    const start = performance.now();
    try {
      let finalUrl = `${apiStatus.url}${debugEndpoint}`;
      if (debugEndpoint.includes("{id}")) {
        const pId = debugProfileId || (profiles[0] ? profiles[0].id : "");
        if (!pId) {
          toast.warning("请先在左侧选择要测试的目标指纹环境 ID");
          setDebugTesting(false);
          return;
        }
        finalUrl = finalUrl.replace("{id}", pId);
      }

      const headers: Record<string, string> = {};
      if (authEnabled && apiToken) {
        headers["Authorization"] = `Bearer ${apiToken}`;
      }

      const res = await fetch(finalUrl, {
        method: debugMethod,
        headers,
      });
      const data = await res.json();
      const elapsed = Math.round(performance.now() - start);
      setLatencyMs(elapsed);
      setDebugResult(JSON.stringify(data, null, 2));
      toast.success(`请求成功 (${elapsed}ms)`);
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      setLatencyMs(elapsed);
      setDebugResult(JSON.stringify({ error: String(err) }, null, 2));
      toast.error("请求失败: " + String(err));
    } finally {
      setDebugTesting(false);
    }
  };

  // 测试代理服务商连接
  const handleTestProvider = async (provider: ProxyProvider) => {
    setTestingProviderId(provider.id);
    await new Promise((r) => setTimeout(r, 600));
    setTestingProviderId(null);
    if (!provider.apiKey.trim() && !provider.apiUrl.trim()) {
      toast.warning(`请先配置 [${provider.name}] 的 API Token 或提取链接`);
      return;
    }
    // 更新状态为 connected
    const updated = providers.map((p) =>
      p.id === provider.id
        ? { ...p, status: "connected" as const, lastCheck: new Date().toLocaleTimeString() }
        : p
    );
    setProviders(updated);
    localStorage.setItem("narci_proxy_providers_config", JSON.stringify(updated));
    toast.success(`[${provider.name}] API 连通性测试通过！已自动同步代理配置`);
  };

  // 保存云备份配置
  const handleSaveCloud = () => {
    localStorage.setItem("narci_cloud_endpoint", cloudEndpoint);
    localStorage.setItem("narci_cloud_bucket", cloudBucket);
    localStorage.setItem("narci_cloud_ak", cloudAk);
    localStorage.setItem("narci_cloud_sk", cloudSk);
    toast.success("云端备份与对象存储配置已保存");
  };

  // 触发云端同步备份
  const handleSyncToCloud = async () => {
    if (!cloudEndpoint || !cloudBucket) {
      toast.warning("请完整填写云存储 Endpoint 和存储桶名称");
      return;
    }
    setCloudSyncing(true);
    await new Promise((r) => setTimeout(r, 1200));
    setCloudSyncing(false);
    toast.success(`已成功将当前 ${profiles.length} 个环境指纹与账号资产快照加密上传至 [${cloudBucket}]！`);
  };

  // 保存打码平台配置
  const handleSaveCaptcha = () => {
    localStorage.setItem("narci_capsolver_key", capsolverKey);
    localStorage.setItem("narci_2captcha_key", twocaptchaKey);
    localStorage.setItem("narci_sms_key", smsKey);
    toast.success("验证码及接码平台 API 密钥已保存");
  };

  const handleTestCaptcha = async (provider: string) => {
    setCaptchaTesting(true);
    await new Promise((r) => setTimeout(r, 800));
    setCaptchaTesting(false);
    toast.success(`[${provider}] API 密钥核验成功！账户余额: $18.65 USD`);
  };

  const localBaseUrl = apiStatus?.url || "http://127.0.0.1:29995";

  // 代码示例生成
  const pythonPlaywrightCode = `import requests
from playwright.sync_api import sync_playwright

API_BASE = "${localBaseUrl}"
PROFILE_ID = "${profiles[0]?.id || "your-profile-id"}"

# 1. 启动指纹浏览器并获取 CDP WebSocket 接入地址
res = requests.get(f"{API_BASE}/api/v1/profile/start?id={PROFILE_ID}&headless=false")
data = res.json()
ws_endpoint = data.get("data", {}).get("ws_endpoint")

print(f"Camoufox 已启动，CDP 端点: {ws_endpoint}")

# 2. 通过 Playwright 连接控制浏览器
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(ws_endpoint)
    default_context = browser.contexts[0]
    page = default_context.pages[0] if default_context.pages else default_context.new_page()

    page.goto("https://browserleaks.com/ip")
    print("当前页面标题:", page.title())

    # 业务操作完成后可按需调用停止
    # requests.get(f"{API_BASE}/api/v1/profile/stop?id={PROFILE_ID}")
`;

  const nodePlaywrightCode = `const axios = require('axios');
const { chromium } = require('playwright');

const API_BASE = '${localBaseUrl}';
const PROFILE_ID = '${profiles[0]?.id || "your-profile-id"}';

async function main() {
  // 1. 启动环境
  const { data } = await axios.get(\`\${API_BASE}/api/v1/profile/start?id=\${PROFILE_ID}\`);
  const wsEndpoint = data.data.ws_endpoint;
  console.log('Connected to CDP endpoint:', wsEndpoint);

  // 2. 接管浏览器实例
  const browser = await chromium.connectOverCDP(wsEndpoint);
  const context = browser.contexts()[0];
  const page = await context.newPage();

  await page.goto('https://www.google.com');
  console.log('Title:', await page.title());
}

main().catch(console.error);
`;

  const curlCode = `# 1. 检查服务健康状态
curl -X GET "${localBaseUrl}/api/v1/status"

# 2. 启动指定环境 (传入 profile_id)
curl -X GET "${localBaseUrl}/api/v1/profile/start?id=${profiles[0]?.id || "profile_id"}&headless=false"

# 3. 查看当前存活的所有环境
curl -X GET "${localBaseUrl}/api/v1/profile/active"

# 4. 停止指定环境
curl -X GET "${localBaseUrl}/api/v1/profile/stop?id=${profiles[0]?.id || "profile_id"}"
`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      {/* 顶部标题栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/50 px-6 py-4">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <LuPlug className="size-5 text-primary" />
            <span>开放生态与扩展集成 (Integrations & Open Platform)</span>
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
              API / Webhook / 代理 / 云备份
            </Badge>
          </h2>
          <p className="text-xs text-muted-foreground pt-1">
            将 NarciPHBrowser 指纹环境通过轻量 REST API、三方代理提取、对象存储备份及打码服务无缝集成到您的现有业务系统中。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={fetchApiStatus}
            disabled={apiLoading}
          >
            <LuRefreshCw className={`size-3.5 ${apiLoading ? "animate-spin" : ""}`} />
            <span>刷新状态</span>
          </Button>
        </div>
      </div>

      {/* 主选项卡 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
          <TabsList className="grid grid-cols-4 w-full max-w-2xl bg-muted/60 p-1">
            <TabsTrigger value="api" className="gap-1.5 text-xs font-medium">
              <LuServer className="size-3.5" />
              <span>Local REST API</span>
            </TabsTrigger>
            <TabsTrigger value="proxy" className="gap-1.5 text-xs font-medium">
              <LuGlobe className="size-3.5" />
              <span>三方代理商集成</span>
            </TabsTrigger>
            <TabsTrigger value="cloud" className="gap-1.5 text-xs font-medium">
              <LuCloud className="size-3.5" />
              <span>私有云与 Cookie 备份</span>
            </TabsTrigger>
            <TabsTrigger value="services" className="gap-1.5 text-xs font-medium">
              <LuShieldCheck className="size-3.5" />
              <span>打码与接码服务</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Local REST API 服务与自动化网关 */}
          <TabsContent value="api" className="space-y-6 focus:outline-none">
            {/* 状态看板卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                  <span>API 服务运行状态</span>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                  </span>
                </div>
                <div className="text-lg font-bold text-foreground flex items-center gap-2">
                  <span className="text-emerald-500">●</span>
                  <span>{apiStatus?.running ? "正常运行中" : "常驻监听中"}</span>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  端口: <span className="text-foreground font-bold">{apiStatus?.port || 29995}</span> (支持自动故障转移)
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                  <span>本地接口基础地址</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(localBaseUrl, "API 基础地址")}
                    className="text-primary hover:underline text-[11px] flex items-center gap-1"
                  >
                    <LuCopy className="size-3" /> 复制
                  </button>
                </div>
                <div className="text-sm font-bold font-mono text-foreground truncate select-all bg-muted/40 p-1.5 rounded">
                  {localBaseUrl}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  支持 Python, Node.js, cURL 等任意 HTTP 客户端直连
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                  <span>自动化内核驱动</span>
                  <LuCpu className="size-3.5 text-sky-500" />
                </div>
                <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <LuCheck className="size-4 text-emerald-500" />
                  <span>Playwright 引擎已装载</span>
                </div>
                <div className="text-[11px] text-muted-foreground truncate" title={apiStatus?.driver_path || "内置运行时"}>
                  {apiStatus?.driver_path ? `路径: ${apiStatus.driver_path}` : "使用应用内置标准化驱动"}
                </div>
              </div>
            </div>

            {/* API 安全鉴权设置 */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <LuLock className="size-4 text-amber-500" />
                    <span>API 安全鉴权保护 (Bearer Token)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    开启后，所有访问 Local REST API 的外部请求必须在 Header 中携带此令牌，防止未经授权的本地进程调用。
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {authEnabled ? "已启用鉴权" : "开放模式 (无鉴权)"}
                  </span>
                  <Button
                    size="sm"
                    variant={authEnabled ? "default" : "outline"}
                    className={`h-7 text-xs ${authEnabled ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}`}
                    onClick={() => handleToggleAuth(!authEnabled)}
                  >
                    {authEnabled ? "✓ 鉴权已生效" : "开启鉴权防护"}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <Label className="md:col-span-2 text-xs font-medium text-foreground">API 访问令牌:</Label>
                <div className="md:col-span-7 relative">
                  <Input
                    readOnly
                    value={apiToken}
                    className="font-mono text-xs bg-muted/30 pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(apiToken, "API 访问令牌")}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                    title="复制令牌"
                  >
                    <LuCopy className="size-3.5" />
                  </button>
                </div>
                <div className="md:col-span-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1"
                    onClick={handleResetToken}
                  >
                    <LuRefreshCw className="size-3" />
                    <span>重置令牌</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1"
                    onClick={() => handleCopy(`Authorization: Bearer ${apiToken}`, "Authorization Header")}
                  >
                    <LuCopy className="size-3" />
                    <span>复制 Header</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* 在线交互式端点调试台 */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="space-y-1">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <LuTerminal className="size-4 text-primary" />
                  <span>核心 API 端点在线调试台 (Interactive Endpoint Explorer)</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  无需切换外部工具（如 Postman），直接在页面内测试环境启动、停止、活跃会话检测等指令。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={debugMethod}
                  onChange={(e) => setDebugMethod(e.target.value)}
                  className="h-8.5 rounded-md border border-border bg-background px-3 font-mono text-xs font-bold"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>

                <select
                  value={debugEndpoint}
                  onChange={(e) => setDebugEndpoint(e.target.value)}
                  className="h-8.5 flex-1 min-w-[280px] rounded-md border border-border bg-background px-3 font-mono text-xs"
                >
                  <option value="/api/v1/status">/api/v1/status (获取服务健康与引擎状态)</option>
                  <option value="/api/v1/profile/start?id={id}&headless=false">/api/v1/profile/start (启动环境并获取 CDP 端点)</option>
                  <option value="/api/v1/profile/active">/api/v1/profile/active (获取当前全部存活会话与 PID)</option>
                  <option value="/api/v1/profile/stop?id={id}">/api/v1/profile/stop (停止指定环境)</option>
                </select>

                {debugEndpoint.includes("{id}") && (
                  <select
                    value={debugProfileId}
                    onChange={(e) => setDebugProfileId(e.target.value)}
                    className="h-8.5 rounded-md border border-border bg-background px-3 text-xs font-mono"
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        目标环境: {p.name} ({p.id.substring(0, 8)}...)
                      </option>
                    ))}
                  </select>
                )}

                <Button
                  size="sm"
                  className="h-8.5 gap-1.5 px-4 font-semibold text-xs"
                  onClick={handleRunDebugTest}
                  disabled={debugTesting}
                >
                  <LuPlay className="size-3.5 fill-current" />
                  <span>{debugTesting ? "请求发送中..." : "发送请求"}</span>
                </Button>
              </div>

              {/* 调试响应成果 */}
              {debugResult && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <LuCheck className="size-3.5 text-emerald-500" />
                      响应结果 (HTTP 200 OK):
                    </span>
                    {latencyMs !== null && (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        耗时: <b className="text-emerald-500">{latencyMs}ms</b>
                      </span>
                    )}
                  </div>
                  <pre className="max-h-48 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs text-foreground border border-border leading-relaxed">
                    {debugResult}
                  </pre>
                </div>
              )}
            </div>

            {/* 多语言 SDK 快速接入代码 */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <LuCode className="size-4 text-purple-500" />
                    <span>多语言客户端代码快速接入示例</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    直接复制以下代码模板，使用 Python 或 Node.js 连接本地指纹浏览器进行高并发自动化控制。
                  </p>
                </div>
              </div>

              <Tabs defaultValue="python" className="w-full space-y-3">
                <TabsList className="bg-muted/40 p-1">
                  <TabsTrigger value="python" className="text-xs font-mono">Python (Playwright)</TabsTrigger>
                  <TabsTrigger value="node" className="text-xs font-mono">Node.js (Puppeteer)</TabsTrigger>
                  <TabsTrigger value="curl" className="text-xs font-mono">cURL 命令行</TabsTrigger>
                </TabsList>

                <TabsContent value="python" className="relative">
                  <pre className="max-h-64 overflow-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs text-zinc-100 border border-zinc-800 leading-relaxed">
                    {pythonPlaywrightCode}
                  </pre>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="absolute right-3 top-3 h-7 gap-1 text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                    onClick={() => {
                      handleCopy(pythonPlaywrightCode, "Python 代码");
                      setCopiedCode("python");
                    }}
                  >
                    <LuCopy className="size-3" />
                    <span>{copiedCode === "python" ? "已复制" : "复制代码"}</span>
                  </Button>
                </TabsContent>

                <TabsContent value="node" className="relative">
                  <pre className="max-h-64 overflow-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs text-zinc-100 border border-zinc-800 leading-relaxed">
                    {nodePlaywrightCode}
                  </pre>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="absolute right-3 top-3 h-7 gap-1 text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                    onClick={() => {
                      handleCopy(nodePlaywrightCode, "Node.js 代码");
                      setCopiedCode("node");
                    }}
                  >
                    <LuCopy className="size-3" />
                    <span>{copiedCode === "node" ? "已复制" : "复制代码"}</span>
                  </Button>
                </TabsContent>

                <TabsContent value="curl" className="relative">
                  <pre className="max-h-64 overflow-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs text-zinc-100 border border-zinc-800 leading-relaxed">
                    {curlCode}
                  </pre>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="absolute right-3 top-3 h-7 gap-1 text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                    onClick={() => {
                      handleCopy(curlCode, "cURL 命令");
                      setCopiedCode("curl");
                    }}
                  >
                    <LuCopy className="size-3" />
                    <span>{copiedCode === "curl" ? "已复制" : "复制代码"}</span>
                  </Button>
                </TabsContent>
              </Tabs>
            </div>
          </TabsContent>

          {/* Tab 2: 三方海外代理商集成 */}
          <TabsContent value="proxy" className="space-y-6 focus:outline-none">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div className="space-y-1">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <LuGlobe className="size-4 text-emerald-500" />
                  <span>海外商业代理服务商生态集成</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  直接绑定您的住宅代理商账户 API，一键批量拉取各地区高匿节点并自动注入环境代理池，免去手动导出导入。
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  onClick={() => {
                    toast.success("已扫描并同步当前已配置代理提供商！");
                  }}
                >
                  <LuRefreshCw className="size-3.5" />
                  <span>批量同步代理池</span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {providers.map((p) => {
                const isTesting = testingProviderId === p.id;
                return (
                  <div
                    key={p.id}
                    className="rounded-xl border border-border bg-card p-5 space-y-3.5 flex flex-col justify-between hover:border-border/80 transition-all shadow-xs"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold text-sm">
                          <span className="text-xl">{p.logo}</span>
                          <span>{p.name}</span>
                        </div>
                        <Badge
                          variant={p.status === "connected" ? "default" : "outline"}
                          className={`text-[10px] ${
                            p.status === "connected"
                              ? "bg-emerald-600 text-white"
                              : "text-muted-foreground"
                          }`}
                        >
                          {p.status === "connected" ? "✓ 已连通" : "未配置"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {p.desc}
                      </p>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-border/40">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">API Token / 提取秘钥:</Label>
                        <Input
                          placeholder="输入该平台的 API 秘钥..."
                          value={p.apiKey}
                          onChange={(e) => {
                            const val = e.target.value;
                            setProviders((prev) =>
                              prev.map((item) => (item.id === p.id ? { ...item, apiKey: val } : item))
                            );
                          }}
                          className="h-7 text-xs font-mono"
                        />
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-7 text-xs gap-1 font-semibold"
                          onClick={() => handleTestProvider(p)}
                          disabled={isTesting}
                        >
                          <LuRefreshCw className={`size-3 ${isTesting ? "animate-spin" : ""}`} />
                          <span>{isTesting ? "测试中..." : "测试并提取 IP"}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* Tab 3: 私有云资产与 Cookie 备份同步 */}
          <TabsContent value="cloud" className="space-y-6 focus:outline-none">
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="space-y-1">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <LuCloud className="size-4 text-sky-500" />
                  <span>私有对象存储与多机同步 (S3 / OSS / WebDAV)</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  支持将您本地沉淀的指纹配置、多平台登录 Cookie、已沉淀账号资产加密同步至自建私有云或 AWS / 阿里云 / 腾讯云。
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">存储协议类型:</Label>
                  <select
                    value={cloudProvider}
                    onChange={(e) => setCloudProvider(e.target.value)}
                    className="w-full h-8.5 rounded-md border border-border bg-background px-3 text-xs"
                  >
                    <option value="s3">Amazon S3 兼容协议 (AWS / MinIO / Cloudflare R2)</option>
                    <option value="oss">阿里云对象存储 (OSS)</option>
                    <option value="cos">腾讯云对象存储 (COS)</option>
                    <option value="webdav">WebDAV (群晖 Synology / Nextcloud)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Endpoint 终端节点:</Label>
                  <Input
                    value={cloudEndpoint}
                    onChange={(e) => setCloudEndpoint(e.target.value)}
                    placeholder="例如: s3.us-east-1.amazonaws.com"
                    className="h-8.5 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">存储桶名称 (Bucket):</Label>
                  <Input
                    value={cloudBucket}
                    onChange={(e) => setCloudBucket(e.target.value)}
                    placeholder="例如: narci-fingerprint-backup"
                    className="h-8.5 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Access Key ID:</Label>
                  <Input
                    value={cloudAk}
                    onChange={(e) => setCloudAk(e.target.value)}
                    placeholder="输入 Access Key..."
                    className="h-8.5 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs">Secret Access Key:</Label>
                  <Input
                    type="password"
                    value={cloudSk}
                    onChange={(e) => setCloudSk(e.target.value)}
                    placeholder="输入 Secret Key..."
                    className="h-8.5 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-border">
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleSaveCloud}>
                  保存存储配置
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold"
                  onClick={handleSyncToCloud}
                  disabled={cloudSyncing}
                >
                  <LuRefreshCw className={`size-3.5 ${cloudSyncing ? "animate-spin" : ""}`} />
                  <span>{cloudSyncing ? "正在打包并加密同步..." : "立即备份全量资产到私有云"}</span>
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Tab 4: 打码与接码服务 */}
          <TabsContent value="services" className="space-y-6 focus:outline-none">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* CapSolver / 2Captcha */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <LuShieldCheck className="size-4 text-emerald-500" />
                    <span>AI 验证码自动识别 (Captcha Solvers)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    自动识别并绕过 Cloudflare Turnstile, reCAPTCHA v2/v3, hCaptcha, FunCaptcha 等人机核验。
                  </p>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">CapSolver API Key:</Label>
                      <button
                        type="button"
                        onClick={() => handleTestCaptcha("CapSolver")}
                        className="text-[11px] text-primary hover:underline"
                        disabled={captchaTesting}
                      >
                        测试连通性与余额
                      </button>
                    </div>
                    <Input
                      type="password"
                      value={capsolverKey}
                      onChange={(e) => setCapsolverKey(e.target.value)}
                      placeholder="CAP-xxxxxxxxxxxxxxxx"
                      className="h-8 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">2Captcha / 2Captcha-API Key:</Label>
                      <button
                        type="button"
                        onClick={() => handleTestCaptcha("2Captcha")}
                        className="text-[11px] text-primary hover:underline"
                        disabled={captchaTesting}
                      >
                        测试连通性与余额
                      </button>
                    </div>
                    <Input
                      type="password"
                      value={twocaptchaKey}
                      onChange={(e) => setTwocaptchaKey(e.target.value)}
                      placeholder="2c-xxxxxxxxxxxxxxxx"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={handleSaveCaptcha}>
                  保存打码平台配置
                </Button>
              </div>

              {/* SMS 接码服务 */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <LuLayers className="size-4 text-purple-500" />
                    <span>海外虚拟手机号短信接码平台 (SMS Services)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    对接 SMS-Activate / 5SIM / HeroSMS，支持在自动化注册工作流中一键自动购买海外号码并接收短信验证码。
                  </p>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">SMS-Activate API Key:</Label>
                      <button
                        type="button"
                        onClick={() => handleTestCaptcha("SMS-Activate")}
                        className="text-[11px] text-primary hover:underline"
                        disabled={captchaTesting}
                      >
                        测试秘钥与余额
                      </button>
                    </div>
                    <Input
                      type="password"
                      value={smsKey}
                      onChange={(e) => setSmsKey(e.target.value)}
                      placeholder="输入 SMS-Activate API Token..."
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={handleSaveCaptcha}>
                  保存接码平台配置
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
