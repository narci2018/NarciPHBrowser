import React, { useState } from "react";
import { toast } from "sonner";
import {
  LuSparkles,
  LuSend,
  LuMessageSquare,
  LuTrendingUp,
  LuWallet,
  LuUsers,
  LuExternalLink,
  LuRefreshCw,
  LuCheck,
  LuCopy,
  LuPlay,
  LuFlame,
  LuShoppingBag,
  LuCalendar,
  LuGlobe,
  LuCpu,
  LuCoins,
  LuBot,
  LuVideo,
  LuImage,
  LuFilter,
  LuPlus,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AiToEarnPanelProps {
  onOpenBrowserUrl?: (url: string) => void;
}

export const AiToEarnPanel: React.FC<AiToEarnPanelProps> = ({ onOpenBrowserUrl }) => {
  // 子模块导航状态
  const [activeSubTab, setActiveSubTab] = useState<
    "task" | "publish" | "aiTool" | "reply" | "replyOther" | "trending" | "finance" | "account" | "relay" | "liveWeb"
  >("task");

  // 环境配置 (中国版 / 国际版 / 本地私有化)
  const [envMode, setEnvMode] = useState<"cn" | "ai" | "local">("cn");
  const [apiKey, setApiKey] = useState<string>("ate-live-8f92b4c10e39");
  const [serverRelayUrl, setServerRelayUrl] = useState<string>("https://aitoearn.cn/api");
  const [aiRelayUrl, setAiRelayUrl] = useState<string>("https://aitoearn.cn/api/ai");

  // 任务市场过滤器
  const [taskCategory, setTaskCategory] = useState<"all" | "article" | "car" | "interaction" | "offline" | "mine">("all");
  const [taskSearch, setTaskSearch] = useState<string>("");

  // 创作工作区状态
  const [aiToolType, setAiToolType] = useState<"minimax" | "nanobanana" | "musetalk" | "cosyvoice" | "narrato" | "text">("minimax");
  const [aiPrompt, setAiPrompt] = useState<string>("科技博主评测数码新品，镜头由远及近推入，展示精湛金属倒角工艺，伴随未来感声效。");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedResult, setGeneratedResult] = useState<string | null>(null);

  // 一键发布状态
  const [publishType, setPublishType] = useState<"video" | "image">("video");
  const [publishTitle, setPublishTitle] = useState<string>("【AI全自动赚钱实测】OPC一人公司的内容营销秘密武器 🚀 #副业赚钱 #AI创作");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    "douyin", "xhs", "kuaishou", "wx_sph", "bilibili", "tiktok", "youtube"
  ]);

  // 截流意向词状态
  const [interceptKeywords, setInterceptKeywords] = useState<string>("求链接, 怎么买, 多少钱, 求同款, 有推荐吗, 哪里的");
  const [autoReplyTemplate, setAutoReplyTemplate] = useState<string>("已私信您专属粉丝特惠入口，请查收私信消息哦~ ✨");

  // 打开外部浏览器或指纹浏览器窗口
  const handleOpenExternal = (url: string) => {
    if (onOpenBrowserUrl) {
      onOpenBrowserUrl(url);
    } else {
      window.open(url, "_blank");
    }
  };

  // 复制文本
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`已复制 ${label} 到剪贴板`);
  };

  // 模拟任务列表
  const mockTasks = [
    {
      id: "T-2026-001",
      title: "【新能源汽车】小米SU7 Ultra 性能美学短视频推广",
      category: "car",
      brand: "Xiaomi Auto",
      settleType: "CPM",
      settlePrice: "¥45 / 千次播放",
      cpeRate: "+¥0.08 / 互动",
      platform: "抖音 · 视频号 · B站",
      quota: "剩余 12 / 50 名",
      reward: "预计收益 ¥800~¥3,500",
      tags: ["高额CPM", "汽车专区", "官方提审"],
      claimed: false,
    },
    {
      id: "T-2026-002",
      title: "【数码好物】智能降噪无线耳机小红书图文种草",
      category: "article",
      brand: "Edifier",
      settleType: "CPS",
      settlePrice: "18% 成交佣金",
      cpeRate: "底薪 ¥150 + 提成",
      platform: "小红书 · 微信公众号",
      quota: "剩余 8 / 30 名",
      reward: "平均单客分成 ¥58/单",
      tags: ["高转化CPS", "图文爆款", "带货分佣"],
      claimed: true,
    },
    {
      id: "T-2026-003",
      title: "【线下探店】精品设计师民宿客栈打卡传播引流",
      category: "offline",
      brand: "大理栖霞云庐客栈",
      settleType: "CPE",
      settlePrice: "¥0.15 / 点赞互动",
      cpeRate: "包房体验 + ¥300 车马",
      platform: "抖音 · 快手 · 小红书",
      quota: "剩余 3 / 10 名",
      reward: "综合收益 ¥500~¥1,200",
      tags: ["线下商户推广", "文旅探店", "互动结算"],
      claimed: false,
    },
    {
      id: "T-2026-004",
      title: "【出海变现】AI 效率办公工具海外 TikTok 爆款切片",
      category: "interaction",
      brand: "AiToEarn Global",
      settleType: "CPM",
      settlePrice: "$8.5 / 1000 Views",
      cpeRate: "$15 新增付费佣金",
      platform: "TikTok · YouTube · X",
      quota: "剩余 45 / 100 名",
      reward: "美金结算 · 支持USDT",
      tags: ["出海变现", "TikTok爆款", "美金结算"],
      claimed: false,
    },
  ];

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* 顶部 Brand Banner */}
      <div className="rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-600/15 via-purple-500/10 to-indigo-600/10 p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md ring-2 ring-violet-500/30">
              <LuCoins className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-bold text-foreground tracking-tight">
                  AiToEarn 哎哟赚 · OPC（一人公司）内容营销智能体
                </h2>
                <Badge className="bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/40 text-xs font-semibold">
                  v2.5.0 像素级深度复刻版
                </Badge>
                <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse inline-block" />
                  Relay 中转服务正常
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                围绕内容变现全链路：<strong className="text-foreground">Monetize（任务变现）</strong> ·{" "}
                <strong className="text-foreground">Publish（14+全网发布）</strong> ·{" "}
                <strong className="text-foreground">Engage（互动截流）</strong> ·{" "}
                <strong className="text-foreground">Create（AI批量创作）</strong>
              </p>
            </div>
          </div>

          {/* 快捷动作 */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleOpenExternal(envMode === "cn" ? "https://aitoearn.cn" : "https://aitoearn.ai")}
              className="h-8 text-xs gap-1.5 border-violet-500/30 text-violet-600 hover:bg-violet-500/10 dark:text-violet-400"
            >
              <LuExternalLink className="size-3.5" />
              打开官方网站 ({envMode === "cn" ? "aitoearn.cn" : "aitoearn.ai"})
            </Button>
            <Button
              size="sm"
              onClick={() => setActiveSubTab("liveWeb")}
              className="h-8 text-xs gap-1.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700 shadow-sm"
            >
              <LuGlobe className="size-3.5" />
              在线内嵌工作台
            </Button>
          </div>
        </div>
      </div>

      {/* 9 大核心模块导航栏 (像素级对应 AiToEarn 架构) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border/80 scrollbar-thin">
        {[
          { key: "task", name: "💰 任务市场 (Monetize)", icon: LuShoppingBag },
          { key: "publish", name: "📢 一键全网发布 (Publish)", icon: LuSend },
          { key: "aiTool", name: "🤖 AI创作工坊 (Create)", icon: LuBot },
          { key: "reply", name: "💬 评论管理 (Engage)", icon: LuMessageSquare },
          { key: "replyOther", name: "🎯 AI评论截流引流", icon: LuFlame },
          { key: "trending", name: "🔥 全网热门趋势", icon: LuTrendingUp },
          { key: "finance", name: "💳 钱包与结算中心", icon: LuWallet },
          { key: "account", name: "👥 账号渠道矩阵 (14+)", icon: LuUsers },
          { key: "relay", name: "⚡ Relay中转 & OpenClaw", icon: LuCpu },
          { key: "liveWeb", name: "🌐 官方云端实时镜像", icon: LuGlobe },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveSubTab(tab.key as any)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg font-medium whitespace-nowrap transition-all ${
                isActive
                  ? "bg-violet-600 text-white shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <Icon className="size-3.5" />
              {tab.name}
            </button>
          );
        })}
      </div>

      {/* 模块 1: 任务市场 (Task Market & Monetize) */}
      {activeSubTab === "task" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
            <div className="flex items-center gap-2 overflow-x-auto">
              {[
                { key: "all", label: "全部变现任务" },
                { key: "article", label: "图文好物 (CPS)" },
                { key: "car", label: "汽车推广专区" },
                { key: "interaction", label: "互动短视频 (CPM)" },
                { key: "offline", label: "线下商户推广 (探店)" },
                { key: "mine", label: "我的认领任务 (1)" },
              ].map((c) => (
                <button
                  key={c.key}
                  onClick={() => setTaskCategory(c.key as any)}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    taskCategory === c.key
                      ? "bg-violet-500/15 text-violet-700 dark:text-violet-300 font-semibold border border-violet-500/30"
                      : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Input
                placeholder="搜索品牌 / 行业关键词..."
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                className="h-8 text-xs w-48"
              />
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1 border-border">
                <LuFilter className="size-3" /> 筛选
              </Button>
            </div>
          </div>

          {/* 任务卡片网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mockTasks
              .filter((t) => taskCategory === "all" || t.category === taskCategory)
              .map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-border bg-card p-4 space-y-3 hover:border-violet-500/40 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30 text-[10px]">
                          {task.settleType} 结算
                        </Badge>
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {task.brand}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground font-mono">{task.id}</span>
                      </div>
                      <h4 className="text-sm font-semibold text-foreground line-clamp-1">{task.title}</h4>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold text-violet-600 dark:text-violet-400 block font-mono">
                        {task.settlePrice}
                      </span>
                      <span className="text-[10px] text-muted-foreground block">{task.cpeRate}</span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/30 p-2.5 text-xs space-y-1 text-muted-foreground">
                    <div className="flex justify-between">
                      <span>适用发布渠道：</span>
                      <span className="text-foreground font-medium">{task.platform}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>预计收益参考：</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{task.reward}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>名额状态：</span>
                      <span className="text-amber-600 dark:text-amber-400">{task.quota}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border/50">
                    <div className="flex items-center gap-1 flex-wrap">
                      {task.tags.map((t, idx) => (
                        <Badge key={idx} variant="secondary" className="text-[9px] px-1 py-0">
                          {t}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setActiveSubTab("aiTool");
                          setAiPrompt(`为推广【${task.title}】撰写一段高转化的自媒体宣传文案与分镜脚本，强调核心卖点。`);
                          toast.info(`已将【${task.brand}】推广要求带入 AI 创作工坊`);
                        }}
                        className="h-7 text-xs border-violet-500/30 text-violet-600 hover:bg-violet-500/10"
                      >
                        <LuSparkles className="size-3" /> 一键AI创作
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          toast.success(`成功认领任务【${task.title}】！任务素材与推广口令已同步到剪贴板。`);
                        }}
                        className="h-7 text-xs bg-violet-600 text-white hover:bg-violet-700"
                      >
                        {task.claimed ? "已认领 · 提交链接" : "一键认领任务"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 模块 2: 一键全网发布 (Publish Agent) */}
      {activeSubTab === "publish" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-in fade-in duration-200">
          {/* 左侧配置 (7列) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
                    <LuSend className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">一键全网跨平台分发中心</h3>
                    <p className="text-xs text-muted-foreground">支持国内 6 大自媒体 + 海外 8 大主流渠道矩阵一键并发下发</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 p-0.5 bg-muted/60 rounded-md">
                  <button
                    onClick={() => setPublishType("video")}
                    className={`px-2.5 py-1 text-xs rounded transition-all ${
                      publishType === "video" ? "bg-card text-foreground shadow-xs font-semibold" : "text-muted-foreground"
                    }`}
                  >
                    <LuVideo className="size-3 inline mr-1" /> 视频发布
                  </button>
                  <button
                    onClick={() => setPublishType("image")}
                    className={`px-2.5 py-1 text-xs rounded transition-all ${
                      publishType === "image" ? "bg-card text-foreground shadow-xs font-semibold" : "text-muted-foreground"
                    }`}
                  >
                    <LuImage className="size-3 inline mr-1" /> 图文发布
                  </button>
                </div>
              </div>

              {/* 渠道多选 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground">目标分发渠道 (已选 {selectedPlatforms.length} 个)</Label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedPlatforms([
                          "douyin", "xhs", "kuaishou", "wx_sph", "bilibili", "wx_gzh",
                          "tiktok", "youtube", "facebook", "instagram", "threads", "twitter", "pinterest", "linkedin"
                        ])
                      }
                      className="text-[11px] text-violet-600 hover:underline"
                    >
                      全选全部14平台
                    </button>
                    <span className="text-muted-foreground">·</span>
                    <button
                      type="button"
                      onClick={() => setSelectedPlatforms([])}
                      className="text-[11px] text-muted-foreground hover:underline"
                    >
                      清空
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: "douyin", name: "抖音短视频", color: "#000000" },
                    { id: "xhs", name: "小红书", color: "#FF2442" },
                    { id: "kuaishou", name: "快手", color: "#FF4D4F" },
                    { id: "wx_sph", name: "微信视频号", color: "#07C160" },
                    { id: "bilibili", name: "哔哩哔哩 B站", color: "#00A1D6" },
                    { id: "wx_gzh", name: "微信公众号", color: "#07C160" },
                    { id: "tiktok", name: "TikTok (出海)", color: "#000000" },
                    { id: "youtube", name: "YouTube Shorts", color: "#FF0000" },
                    { id: "facebook", name: "Facebook", color: "#1877F2" },
                    { id: "instagram", name: "Instagram Reels", color: "#E4405F" },
                    { id: "threads", name: "Threads", color: "#000000" },
                    { id: "twitter", name: "X (Twitter)", color: "#000000" },
                    { id: "pinterest", name: "Pinterest", color: "#BD081C" },
                    { id: "linkedin", name: "LinkedIn 领英", color: "#0A66C2" },
                  ].map((p) => {
                    const isChecked = selectedPlatforms.includes(p.id);
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          setSelectedPlatforms((prev) =>
                            prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                          );
                        }}
                        className={`cursor-pointer rounded-lg border p-2 flex items-center justify-between text-xs transition-all ${
                          isChecked
                            ? "border-violet-500 bg-violet-500/10 text-foreground font-medium"
                            : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
                          <span className="truncate">{p.name}</span>
                        </div>
                        {isChecked && <LuCheck className="size-3 text-violet-600 shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 标题与描述 */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-foreground">作品标题与主标语</Label>
                  <Input
                    value={publishTitle}
                    onChange={(e) => setPublishTitle(e.target.value)}
                    placeholder="输入吸引人的爆款作品标题..."
                    className="h-8 text-xs font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-foreground">正文文案与话题标签</Label>
                  <textarea
                    rows={4}
                    defaultValue={`很多朋友都在问OPC一人公司到底该怎么做内容营销？\n今天给大家分享这个基于 AI Agent 的一站式变现流水线！\n从选题生成、视频去水印清洗、到全网14平台定时排期发布，全部交给智能体托管！\n\n#自媒体运营 #一人公司 #AI生产力 #AiToEarn #副业赚钱`}
                    className="w-full rounded-md border border-input bg-background p-2.5 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                  />
                </div>
              </div>

              {/* 定时与排期设置 */}
              <div className="rounded-lg bg-muted/30 p-3 space-y-2 text-xs border border-border/50">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <LuCalendar className="size-3.5 text-violet-500" />
                    日历发布排期策略
                  </span>
                  <Badge variant="outline" className="text-[10px] text-violet-600 border-violet-500/30">
                    立即下发 / 定时排期
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">发布时间模式</span>
                    <select className="w-full h-7 rounded border border-input bg-background px-2 text-xs mt-0.5">
                      <option value="now">⚡ 立即下发 (并发直发)</option>
                      <option value="smart">🎲 智能错峰 (每隔10分钟顺序下发)</option>
                      <option value="schedule">📅 指定定时时间</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">定时执行时间</span>
                    <input
                      type="datetime-local"
                      defaultValue="2026-10-25T18:30"
                      className="w-full h-7 rounded border border-input bg-background px-2 text-xs mt-0.5"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toast.success("已将当前草稿保存至本地草稿箱")}
                  className="h-8 text-xs border-border"
                >
                  保存为草稿
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    toast.success(`已成功向 ${selectedPlatforms.length} 个社交平台下发分发任务！`);
                  }}
                  className="h-8 text-xs bg-violet-600 text-white hover:bg-violet-700 shadow-sm gap-1.5 font-medium"
                >
                  <LuSend className="size-3.5" />
                  一键启动全网多账号发布 ({selectedPlatforms.length})
                </Button>
              </div>
            </div>
          </div>

          {/* 右侧发布记录与日历看板 (5列) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <LuCalendar className="size-3.5 text-violet-500" />
                  近期分发历史与任务状态
                </h4>
                <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1 px-1.5">
                  <LuRefreshCw className="size-3" /> 刷新
                </Button>
              </div>

              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {[
                  {
                    title: "MiniMax H3 超拟真视频生成测评",
                    time: "2026-10-25 10:15",
                    platforms: ["抖音", "B站", "YouTube"],
                    status: "发布成功",
                    views: "18.4K",
                  },
                  {
                    title: "大理线下民宿探店体验图文",
                    time: "2026-10-24 18:20",
                    platforms: ["小红书", "微信公众号"],
                    status: "已结算佣金",
                    views: "9.2K",
                  },
                  {
                    title: "OPC内容营销智能体实战指南",
                    time: "2026-10-24 14:00",
                    platforms: ["TikTok", "X", "Facebook"],
                    status: "发布成功",
                    views: "34.1K",
                  },
                  {
                    title: "降噪耳机深度使用报告",
                    time: "2026-10-23 20:00",
                    platforms: ["快手", "视频号"],
                    status: "待平台审核",
                    views: "1.2K",
                  },
                ].map((item, idx) => (
                  <div key={idx} className="rounded-lg bg-muted/20 border border-border/60 p-2.5 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground line-clamp-1">{item.title}</span>
                      <Badge
                        className={`text-[9px] px-1 py-0 shrink-0 ${
                          item.status.includes("成功") || item.status.includes("已结算")
                            ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                            : "bg-amber-500/15 text-amber-600 border-amber-500/30"
                        }`}
                      >
                        {item.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{item.platforms.join(" · ")}</span>
                      <span className="font-mono text-violet-600 dark:text-violet-400 font-semibold">{item.views} 播放</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground/80 font-mono">{item.time}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 模块 3: AI 创作工坊 (Create / AITool) */}
      {activeSubTab === "aiTool" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {[
              { id: "minimax", name: "MiniMax H3 视频", badge: "0.09元/秒", color: "border-purple-500/30 bg-purple-500/10" },
              { id: "nanobanana", name: "Nano Banana Pro 生图", badge: "2K顶级渲染", color: "border-yellow-500/30 bg-yellow-500/10" },
              { id: "musetalk", name: "MuseTalk 数字人", badge: "唇形实时同步", color: "border-blue-500/30 bg-blue-500/10" },
              { id: "cosyvoice", name: "CosyVoice 声音克隆", badge: "音色3秒极速克隆", color: "border-emerald-500/30 bg-emerald-500/10" },
              { id: "narrato", name: "NarratoAI 智能解说", badge: "电影短剧自动解说", color: "border-indigo-500/30 bg-indigo-500/10" },
              { id: "text", name: "MoneyPrinter 一键成片", badge: "全自动成片", color: "border-rose-500/30 bg-rose-500/10" },
            ].map((tool) => (
              <div
                key={tool.id}
                onClick={() => setAiToolType(tool.id as any)}
                className={`cursor-pointer rounded-xl border p-3 text-center space-y-1 transition-all ${
                  aiToolType === tool.id
                    ? "border-violet-500 bg-violet-500/15 ring-1 ring-violet-500/50 shadow-xs"
                    : "border-border bg-card hover:border-violet-500/30"
                }`}
              >
                <div className="text-xs font-semibold text-foreground truncate">{tool.name}</div>
                <Badge variant="outline" className="text-[9px] px-1 py-0 border-violet-500/30 text-violet-600">
                  {tool.badge}
                </Badge>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 space-y-3.5">
                <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                  <div className="flex items-center gap-2">
                    <LuBot className="size-4 text-violet-500" />
                    <h3 className="text-sm font-semibold text-foreground">AI 提示词创作与参数控制</h3>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    MiniMax H3 / OpenAI 协议原生兼容
                  </Badge>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <Label className="text-foreground font-semibold">生成提示词 (Prompt)</Label>
                    <span className="text-muted-foreground text-[11px]">支持中英文混合 · 自动增强光影分镜</span>
                  </div>
                  <textarea
                    rows={4}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    className="w-full rounded-md border border-input bg-background p-2.5 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                    placeholder="详细描述画面构图、镜头运镜、主体动作、光影材质与氛围..."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">分辨率画质</Label>
                    <select className="w-full h-8 rounded border border-input bg-background px-2 text-xs mt-1">
                      <option value="768p">768P 高清 (0.09 元/秒)</option>
                      <option value="1080p">1080P 全高清 (0.12 元/秒)</option>
                      <option value="2k">原生 2K 电影级 (0.15 元/秒)</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">画面画幅比例</Label>
                    <select className="w-full h-8 rounded border border-input bg-background px-2 text-xs mt-1">
                      <option value="9:16">📱 9:16 竖屏短视频 (推荐)</option>
                      <option value="16:9">💻 16:9 横屏影视/B站</option>
                      <option value="3:4">📷 3:4 小红书黄金比例</option>
                      <option value="1:1">⏹️ 1:1 正方形</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">时长规格</Label>
                    <select className="w-full h-8 rounded border border-input bg-background px-2 text-xs mt-1">
                      <option value="6s">6 秒黄金钩子</option>
                      <option value="10s">10 秒标准短视频片段</option>
                      <option value="15s">15 秒完整故事分镜</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/60">
                  <div className="text-[11px] text-muted-foreground">
                    通过秘塔科技专属渠道接入 · 享受免GPU自建算力低延迟直出
                  </div>
                  <Button
                    size="sm"
                    disabled={isGenerating}
                    onClick={() => {
                      setIsGenerating(true);
                      toast.info("AI 正在调度 MiniMax H3 视频生成引擎与音画同步管线...");
                      setTimeout(() => {
                        setIsGenerating(false);
                        setGeneratedResult(
                          "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop"
                        );
                        toast.success("AI 视频分镜成片生成完毕！已生成 2K 预览！");
                      }, 2500);
                    }}
                    className="h-8 text-xs bg-violet-600 text-white hover:bg-violet-700 shadow-sm gap-1.5 font-medium"
                  >
                    {isGenerating ? <LuRefreshCw className="size-3.5 animate-spin" /> : <LuSparkles className="size-3.5" />}
                    {isGenerating ? "正在渲染生成中..." : "启动 AI 极速生成"}
                  </Button>
                </div>
              </div>
            </div>

            {/* 右侧预览区 (5列) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <LuPlay className="size-3.5 text-violet-500" />
                    成片与分镜素材实时预览
                  </span>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    MiniMax H3 Output
                  </Badge>
                </div>

                <div className="relative rounded-lg overflow-hidden bg-black/90 aspect-[9/16] max-h-[380px] flex items-center justify-center border border-border/80 mx-auto">
                  {generatedResult ? (
                    <div className="relative w-full h-full">
                      <img src={generatedResult} alt="Generated Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-3 text-white">
                        <span className="text-xs font-bold">2K 电影级画质 · 音画完全对齐</span>
                        <span className="text-[10px] text-white/80 line-clamp-1">{aiPrompt}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-6 space-y-2 text-muted-foreground">
                      <LuSparkles className="size-8 mx-auto text-violet-500/60 animate-pulse" />
                      <p className="text-xs">等待生成，点击左侧按钮立即调用 AI 大模型渲染</p>
                    </div>
                  )}
                </div>

                {generatedResult && (
                  <div className="flex items-center justify-between pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toast.success("已下载高清成片到本地素材库")}
                      className="h-7 text-xs border-border"
                    >
                      下载高清素材
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setActiveSubTab("publish");
                        toast.success("已将 AI 生成素材载入一键发布待发队列！");
                      }}
                      className="h-7 text-xs bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      带入一键全网发布
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 模块 4: 互动与评论管理 (Engage / Reply) */}
      {activeSubTab === "reply" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <LuMessageSquare className="size-4 text-violet-500" />
                跨平台评论互动与 AI 智能回复 Agent
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                实时聚合抖音、小红书、快手等平台评论，支持一键批量点赞互动与大模型智能回复
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1 border-border">
                <LuRefreshCw className="size-3" /> 同步最新评论
              </Button>
              <Button
                size="sm"
                onClick={() => toast.success("已启动 AI 批量互动 Agent，正在自动回复高热度评论...")}
                className="h-8 text-xs bg-violet-600 text-white hover:bg-violet-700"
              >
                启动 AI 批量智能回复
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {[
              {
                user: "数码发烧友_小明",
                platform: "抖音",
                content: "这个一人公司的自动化发布靠谱吗？一个人真能搞定几十个矩阵号？",
                time: "10分钟前",
                suggestedReply: "绝对靠谱！通过 AiToEarn 智能体托管，从选题、AI生图剪辑到14平台定时排期发布全部全自动，一个人顶一个运营团队！",
              },
              {
                user: "大理旅游策划师",
                platform: "小红书",
                content: "我们民宿客栈想做线上曝光引流，支持按入住成交或者到店人数结算吗？",
                time: "25分钟前",
                suggestedReply: "支持的！我们平台提供 CPS(按成交佣金) 和 CPE(互动结算) 等多种模式，全国创作者可以认领您的推广任务带来源源不断的精准客流！",
              },
              {
                user: "电商创业老张",
                platform: "视频号",
                content: "请问海外 TikTok 和 YouTube 也支持自动发布吗？需要自己申请开发者账号吗？",
                time: "1小时前",
                suggestedReply: "不需要自己申请复杂的开发者账号！在配置中配置好 Server Relay 中转，直接复用官方安全 OAuth 凭据，一秒完成出海多渠道授权分发！",
              },
            ].map((item, idx) => (
              <div key={idx} className="rounded-lg border border-border/70 bg-muted/20 p-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{item.user}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {item.platform}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{item.time}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toast.success(`已为用户【${item.user}】点赞评论`)}
                    className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    👍 点赞互动
                  </Button>
                </div>
                <p className="text-foreground text-xs leading-relaxed font-medium">“{item.content}”</p>
                <div className="rounded-md bg-violet-500/10 border border-violet-500/20 p-2 text-xs flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-semibold text-violet-600 block">AI 推荐针对性回复：</span>
                    <p className="text-foreground leading-relaxed">{item.suggestedReply}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => toast.success(`已成功向【${item.user}】发送回复！`)}
                    className="h-6 text-[11px] bg-violet-600 text-white shrink-0"
                  >
                    发送此回复
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 模块 5: AI 评论截流与引流 (ReplyOther / Traffic Intercept) */}
      {activeSubTab === "replyOther" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <LuFlame className="size-4 text-rose-500" />
                AI 评论区截流与高意向潜客挖掘 Agent
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                自动监测评论区“求链接”、“怎么买”、“多少钱”等高转化购买信号，自动私信引导私域转化
              </p>
            </div>
            <Badge className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-xs">
              高转化引流神器
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">意向监控触发词库 (英文逗号隔开)</Label>
              <Input
                value={interceptKeywords}
                onChange={(e) => setInterceptKeywords(e.target.value)}
                className="h-8 text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                当评论内容包含任一触发词时，智能体将在 5 秒内自动标记为高意向潜客并触发私信引流。
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">自动化私信引导触达模板</Label>
              <Input
                value={autoReplyTemplate}
                onChange={(e) => setAutoReplyTemplate(e.target.value)}
                className="h-8 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                支持带入动态粉丝昵称与防折叠随机表情符号。
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-muted/30 p-3 space-y-2 border border-border/50 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-foreground">实时截流意向监控列表 (今日已捕获 38 位潜客)</span>
              <Button size="sm" variant="ghost" className="h-6 text-[11px] text-violet-600">
                导出线索名单 (Excel)
              </Button>
            </div>
            <div className="divide-y divide-border/60">
              {[
                { user: "上海吃货探店宝", keyword: "怎么买", platform: "抖音", msg: "看着太诱人了，怎么购买？有专属券吗？", status: "已自动私信" },
                { user: "极客老张", keyword: "求链接", platform: "小红书", msg: "求链接求链接！急求！", status: "已自动私信" },
                { user: "阿杰跨境笔记", keyword: "多少钱", platform: "B站", msg: "兄弟多少钱入手的？求带！", status: "排队发送中" },
              ].map((c, i) => (
                <div key={i} className="py-2 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground">{c.user}</span>
                      <Badge variant="outline" className="text-[9px]">{c.platform}</Badge>
                      <Badge className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[9px]">命中「{c.keyword}」</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">“{c.msg}”</p>
                  </div>
                  <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px] shrink-0">
                    {c.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 模块 6: 全网热门趋势 (Trending Topics) */}
      {activeSubTab === "trending" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <LuTrendingUp className="size-4 text-amber-500" />
                全网实时爆款热搜榜与选题雷达
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                整合抖音、小红书、B站、微博与 TikTok 全球热度排行榜，一键生成爆款同款脚本
              </p>
            </div>
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-500/30">
              5分钟实时刷新
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {[
              { rank: 1, tag: "热搜第1", title: "OPC一人公司AI工具全家桶", heat: "982.4万", category: "商业创业", source: "抖音热搜" },
              { rank: 2, tag: "上升极快", title: "MiniMax H3 视频生成评测", heat: "764.1万", category: "科技数码", source: "小红书爆款" },
              { rank: 3, tag: "爆款话题", title: "大理线下民宿沉浸式探店", heat: "612.8万", category: "文旅生活", source: "快手热榜" },
              { rank: 4, tag: "国际出海", title: "AI Agent automation workflow", heat: "589.2万", category: "海外TikTok", source: "TikTok Viral" },
              { rank: 5, tag: "热搜讨论", title: "短视频盲水印物理去除技术", heat: "420.5万", category: "技术干货", source: "B站热门" },
              { rank: 6, tag: "带货飙升", title: "办公人体工学好物种草合集", heat: "389.0万", category: "数码好物", source: "小红书种草" },
            ].map((hot) => (
              <div
                key={hot.rank}
                className="rounded-lg border border-border/70 bg-muted/20 p-3 flex items-center justify-between gap-3 text-xs hover:border-amber-500/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`size-6 rounded-md flex items-center justify-center font-bold text-xs shrink-0 ${
                      hot.rank <= 3 ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {hot.rank}
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-foreground truncate">{hot.title}</span>
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">{hot.tag}</Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                      <span>{hot.source}</span>
                      <span>·</span>
                      <span>分类: {hot.category}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 block">{hot.heat}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setActiveSubTab("aiTool");
                      setAiPrompt(`围绕当前全网热搜第一的话题【${hot.title}】，撰写一篇具有极强传播力的自媒体爆款文案。`);
                      toast.info(`已将热搜【${hot.title}】载入 AI 创作工坊`);
                    }}
                    className="h-6 text-[10px] text-violet-600 hover:text-violet-700 p-0"
                  >
                    一键蹭热点生成
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 模块 7: 钱包与变现结算 (Finance / Wallet) */}
      {activeSubTab === "finance" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 space-y-1">
              <span className="text-xs text-muted-foreground">累计已变现总收益</span>
              <div className="text-2xl font-bold font-mono text-violet-600 dark:text-violet-400">
                ¥ 14,850.00
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                <LuTrendingUp className="size-3" /> 较上月增长 +38.5%
              </span>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <span className="text-xs text-muted-foreground">可提现可用余额</span>
              <div className="text-2xl font-bold font-mono text-foreground">
                ¥ 3,420.50
              </div>
              <span className="text-[10px] text-muted-foreground">支持支付宝/微信/银行卡/USDT</span>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <span className="text-xs text-muted-foreground">待结算在途佣金 (CPS/CPE)</span>
              <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                ¥ 1,840.00
              </div>
              <span className="text-[10px] text-muted-foreground">预计 3~5 个工作日入账</span>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <span className="text-xs text-muted-foreground">本月预估总收入</span>
              <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                ¥ 6,580.00
              </div>
              <span className="text-[10px] text-muted-foreground">基于当前CPM播放量与转化率</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <h4 className="text-xs font-semibold text-foreground">绑定提现结算账户 (userWalletAccount)</h4>
                <Button size="sm" variant="outline" className="h-6 text-[11px] gap-1">
                  <LuPlus className="size-3" /> 添加账户
                </Button>
              </div>
              <div className="space-y-2 text-xs">
                <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-foreground block">支付宝 (个人认证)</span>
                    <span className="text-muted-foreground font-mono text-[11px]">138****8888 (王*伟)</span>
                  </div>
                  <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">默认收款</Badge>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-foreground block">USDT - TRC20 (海外出海专用)</span>
                    <span className="text-muted-foreground font-mono text-[11px]">TX9qK...vP2x8</span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">正常可用</Badge>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <h4 className="text-xs font-semibold text-foreground">近期提现收支明细 (userWalletRecord)</h4>
                <Button size="sm" variant="ghost" className="h-6 text-[11px] text-muted-foreground">查看全部</Button>
              </div>
              <div className="space-y-2 text-xs">
                {[
                  { title: "提现到支付宝账户", amount: "-¥2,000.00", time: "2026-10-23 16:30", status: "已到账" },
                  { title: "小米汽车短视频推广播放收益(CPM)", amount: "+¥850.00", time: "2026-10-22 11:20", status: "入账结算" },
                  { title: "智能降噪耳机带货佣金分成(CPS)", amount: "+¥420.00", time: "2026-10-21 09:15", status: "入账结算" },
                ].map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b border-border/40 last:border-none">
                    <div>
                      <span className="font-medium text-foreground block">{r.title}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{r.time}</span>
                    </div>
                    <div className="text-right">
                      <span
                        className={`font-bold font-mono text-xs block ${
                          r.amount.startsWith("+") ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                        }`}
                      >
                        {r.amount}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{r.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 模块 8: 账号渠道矩阵 (Accounts Matrix) */}
      {activeSubTab === "account" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <LuUsers className="size-4 text-violet-500" />
                全网 14+ 社交渠道与账号矩阵管理
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                无缝衔接当前指纹浏览器环境，支持一键检测登录态、绑定独立代理IP与安全风控检测
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => toast.success("正在通过 Server Relay 中转校验所有 14+ 账号授权状态...")}
              className="h-8 text-xs bg-violet-600 text-white hover:bg-violet-700 gap-1.5"
            >
              <LuRefreshCw className="size-3" /> 一键检测所有账号状态
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { name: "科技观察室 (主号)", platform: "抖音", followers: "18.4W", status: "已授权正常", proxy: "香港住宅IP 103.*" },
              { name: "极客日常测评", platform: "小红书", followers: "6.2W", status: "已授权正常", proxy: "上海机房IP 180.*" },
              { name: "硬核数码说", platform: "微信视频号", followers: "3.5W", status: "已授权正常", proxy: "广州本地IP 14.*" },
              { name: "GeekGlobal Reviews", platform: "TikTok (US)", followers: "42.8W", status: "已授权正常", proxy: "美国家庭IP 72.*" },
              { name: "TechDaily Shorts", platform: "YouTube", followers: "12.0W", status: "已授权正常", proxy: "美西高匿IP 64.*" },
              { name: "AiToEarn Official", platform: "X (Twitter)", followers: "8.9W", status: "已授权正常", proxy: "新加坡代理IP 45.*" },
            ].map((acc, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="size-7 rounded-full bg-violet-500/20 text-violet-600 font-bold flex items-center justify-center shrink-0">
                      {acc.platform.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <span className="font-semibold text-foreground truncate block">{acc.name}</span>
                      <span className="text-[10px] text-muted-foreground">{acc.platform} · {acc.followers} 粉丝</span>
                    </div>
                  </div>
                  <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[9px] shrink-0">
                    {acc.status}
                  </Badge>
                </div>
                <div className="rounded bg-background/80 p-1.5 text-[10px] text-muted-foreground font-mono flex items-center justify-between">
                  <span>代理网络: {acc.proxy}</span>
                  <span className="text-emerald-600 font-semibold">健康度 100%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 模块 9: Relay中转 & OpenClaw / MCP 开放生态 */}
      {activeSubTab === "relay" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Server Relay 配置 */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3.5">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <LuCpu className="size-4 text-violet-500" />
                  <h4 className="text-sm font-semibold text-foreground">Server Relay (授权中转服务)</h4>
                </div>
                <Badge className="bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/30 text-[10px]">
                  免开发者申请
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                无需自己逐个向抖音、小红书、TikTok 等平台申请昂贵的开发者资质。通过官方 Server Relay 直接复用安全合规的 OAuth 凭据完成一键绑定。
              </p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-foreground">Server Relay 中转地址</Label>
                  <Input
                    value={serverRelayUrl}
                    onChange={(e) => setServerRelayUrl(e.target.value)}
                    className="h-8 text-xs font-mono mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-foreground">AiToEarn API Key</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopy(apiKey, "API Key")}
                      className="h-8 text-xs shrink-0"
                    >
                      <LuCopy className="size-3" />
                    </Button>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => toast.success("Server Relay 配置已保存并自动重启加载！")}
                className="w-full h-8 text-xs bg-violet-600 text-white hover:bg-violet-700"
              >
                保存并测试 Relay 连通性
              </Button>
            </div>

            {/* AI Relay & 模型服务商 */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3.5">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <LuBot className="size-4 text-purple-500" />
                  <h4 className="text-sm font-semibold text-foreground">AI Relay (大模型中转与自建KEY)</h4>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  OpenAI协议兼容
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                支持借用官方 AI Relay 调用 MiniMax H3、Nano Banana、Seedance，亦可填入自建 OpenAI / Claude / Gemini API。
              </p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-foreground">AI Relay 模型地址</Label>
                  <Input
                    value={aiRelayUrl}
                    onChange={(e) => setAiRelayUrl(e.target.value)}
                    className="h-8 text-xs font-mono mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">模型提供商</Label>
                    <select className="w-full h-8 rounded border border-input bg-background px-2 text-xs mt-1">
                      <option value="official">官方智能中转 (MiniMax H3+Nano)</option>
                      <option value="openai">OpenAI (GPT-4o / Sora)</option>
                      <option value="anthropic">Anthropic (Claude 3.5 Sonnet)</option>
                      <option value="metaso">秘塔科技 MiniMax 专属 API</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">并发速率限制</Label>
                    <Input defaultValue="20 次/分钟" className="h-8 text-xs mt-1" />
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => toast.success("AI 大模型服务商连通性测试通过！平均延迟 180ms")}
                className="w-full h-8 text-xs border-violet-500/30 text-violet-600 hover:bg-violet-500/10"
              >
                测试 AI 模型接口响应
              </Button>
            </div>
          </div>

          {/* OpenClaw (龙虾) 与 MCP 协议配置卡片 */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <div className="space-y-0.5">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <LuSparkles className="size-4 text-emerald-500" />
                  OpenClaw (龙虾) 接入与 MCP 开放协议联动 (Claude Desktop / Cursor)
                </h4>
                <p className="text-xs text-muted-foreground">
                  在 OpenClaw、Cursor 或任何支持 MCP 协议的 AI 助手中直接下发并接收 AiToEarn 的内容变现任务
                </p>
              </div>
              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs">
                MCP 协议 100% 支持
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 rounded-lg bg-muted/20 p-3.5 border border-border/60">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  🦞 龙虾 OpenClaw 一键安装命令
                </span>
                <p className="text-[11px] text-muted-foreground">在服务器终端输入以下命令安装赚钱插件：</p>
                <div className="flex items-center justify-between rounded bg-black/80 px-3 py-2 text-xs font-mono text-emerald-400">
                  <span>npx -y @aitoearn/openclaw-plugin-cli</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCopy("npx -y @aitoearn/openclaw-plugin-cli", "OpenClaw 命令")}
                    className="h-6 text-[10px] text-white hover:text-emerald-400 p-0"
                  >
                    复制
                  </Button>
                </div>
              </div>

              <div className="space-y-2 rounded-lg bg-muted/20 p-3.5 border border-border/60">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  🤖 Claude Desktop / Cursor MCP 配置
                </span>
                <p className="text-[11px] text-muted-foreground">在 claude_desktop_config.json 或 Cursor MCP 设置中配置：</p>
                <div className="flex items-center justify-between rounded bg-black/80 px-3 py-2 text-xs font-mono text-purple-300">
                  <span className="truncate">URL: {serverRelayUrl}/unified/mcp</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      handleCopy(
                        JSON.stringify(
                          {
                            mcpServers: {
                              aitoearn: {
                                type: "http",
                                url: `${serverRelayUrl}/unified/mcp`,
                                headers: { "x-api-key": apiKey },
                              },
                            },
                          },
                          null,
                          2
                        ),
                        "MCP JSON 配置"
                      )
                    }
                    className="h-6 text-[10px] text-white hover:text-purple-300 p-0 shrink-0 ml-2"
                  >
                    复制 JSON
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 模块 10: 官方云端实时镜像 (Live Webview) */}
      {activeSubTab === "liveWeb" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col flex-1 min-h-[640px] shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs">
                实时云端工作台
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">
                {envMode === "cn" ? "https://aitoearn.cn" : "https://aitoearn.ai"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEnvMode(envMode === "cn" ? "ai" : "cn")}
                className="h-7 text-xs border-border"
              >
                切换为{envMode === "cn" ? "国际版 (aitoearn.ai)" : "中国版 (aitoearn.cn)"}
              </Button>
              <Button
                size="sm"
                onClick={() => handleOpenExternal(envMode === "cn" ? "https://aitoearn.cn" : "https://aitoearn.ai")}
                className="h-7 text-xs bg-violet-600 text-white hover:bg-violet-700 gap-1"
              >
                <LuExternalLink className="size-3" />
                用指纹浏览器独立窗口打开
              </Button>
            </div>
          </div>

          <iframe
            key={envMode}
            src={envMode === "cn" ? "https://aitoearn.cn" : "https://aitoearn.ai"}
            className="w-full flex-1 min-h-[580px] border-none bg-background"
            title="AiToEarn Live"
          />
        </div>
      )}
    </div>
  );
};
