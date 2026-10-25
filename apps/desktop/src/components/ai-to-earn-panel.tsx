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
  LuWand,
  LuLayers,
  LuFileText,
  LuDownload,
  LuSlidersHorizontal,
  LuFolderCheck,
  LuAward,
  LuMic,
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

  // 创作工作区状态 (四合一模式)
  const [aiWorkTab, setAiWorkTab] = useState<"agent" | "tools" | "ranking" | "drafts">("agent");

  // AI 创作工具箱 (8大内置工具)
  const [activeWebtool, setActiveWebtool] = useState<string>("gpt4o");
  const [rankingArea, setRankingArea] = useState<"all" | "cn" | "global">("all");
  const [rankingPeriod, setRankingPeriod] = useState<"week" | "month" | "total">("week");
  const [rankingCategory, setRankingCategory] = useState<"all" | "video" | "image" | "audio" | "digitalHuman" | "write">("all");

  // Agent 智能创作工作流状态
  const [agentTopic, setAgentTopic] = useState<string>("一人公司如何利用AI实现自动化全网营销与矩阵变现");
  const [agentModel, setAgentModel] = useState<string>("minimax_h3");
  const [agentStep, setAgentStep] = useState<"idle" | "script" | "storyboard" | "render" | "done">("idle");
  const [agentScript, setAgentScript] = useState<string>(
    "【标题】一个人也能干翻一个团队？2026年OPC一人公司的AI变现全流程复盘！\n【黄金前3秒】你是否曾想过，不用招人、不用买专业相机，光靠一个AI智能体就能全自动产出爆款视频？\n【痛点共鸣】很多创作者每天花5小时剪辑、写脚本，播放量却不过百，核心就在于内容生产效率过低。\n【解决方案】今天带大家拆解一套自动化流程：选品→分镜生成→2K高清渲染→多平台矩阵一键分发！\n【行动号召】在评论区留言「一人公司」，获取完整自动化Agent配置脚本与实操指南！"
  );
  const [storyboardShots] = useState<
    Array<{ shot: number; time: string; desc: string; voice: string; prompt: string; preview: string }>
  >([
    {
      shot: 1,
      time: "00:00 - 00:03",
      desc: "极简科技风办公桌，笔记本荧幕代码与AI数据流涌动，微距特写推入",
      voice: "你是否曾想过，不用招人，光靠一个AI就能全自动产出爆款视频？",
      prompt: "Cinematic close-up of futuristic laptop keyboard, glowing cyan and purple code matrix reflection, depth of field 8k",
      preview: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=600&auto=format&fit=crop",
    },
    {
      shot: 2,
      time: "00:03 - 00:07",
      desc: "一人公司创作者手持咖啡，背后的巨大全息大屏展示各大社交平台收益曲线飙升",
      voice: "每天花5小时剪辑文案，不如把这些繁琐工作交给AI工作流引擎。",
      prompt: "Solopreneur standing before gigantic holographic analytics dashboard, exponential growth charts, cyberpunk lighting",
      preview: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=600&auto=format&fit=crop",
    },
    {
      shot: 3,
      time: "00:07 - 00:12",
      desc: "MiniMax H3 与 Nano Banana 自动化渲染画面展示，精美4K成片一键导出",
      voice: "从分镜脚本、原声克隆到一键全网发布，全流程全自动完成。",
      prompt: "Futuristic digital creation pipeline, visual nodes interconnecting, rendering high fidelity video frames",
      preview: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600&auto=format&fit=crop",
    },
    {
      shot: 4,
      time: "00:12 - 00:15",
      desc: "屏幕中央弹出评论区互动引导标签与专属礼物包礼盒动效，淡出结语",
      voice: "想要这套自动化工作流？评论区留下「一人公司」立即获取！",
      prompt: "Modern floating call to action card with glowing gift box icon, glossy modern tech aesthetic, dark studio backdrop",
      preview: "https://images.unsplash.com/photo-1563986768609-322da13575f3?q=80&w=600&auto=format&fit=crop",
    },
  ]);

  // 草稿箱任务列表
  const [draftList, setDraftList] = useState<
    Array<{
      id: string;
      title: string;
      type: "video" | "image";
      model: string;
      ratio: string;
      duration: string;
      shots: number;
      cover: string;
      createTime: string;
      status: "ready" | "processing" | "published";
    }>
  >([
    {
      id: "DF-901",
      title: "【AI一人公司】2026内容营销与矩阵变现爆款成片",
      type: "video",
      model: "MiniMax H3 (秘塔2K)",
      ratio: "9:16 竖屏",
      duration: "15s",
      shots: 4,
      cover: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600&auto=format&fit=crop",
      createTime: "刚刚",
      status: "ready",
    },
    {
      id: "DF-902",
      title: "【数码科技】降噪耳机极致沉浸感3D视效演示",
      type: "video",
      model: "Seedance 2.0 Fast",
      ratio: "16:9 横屏",
      duration: "10s",
      shots: 3,
      cover: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?q=80&w=600&auto=format&fit=crop",
      createTime: "10分钟前",
      status: "ready",
    },
    {
      id: "DF-903",
      title: "【小红书美学】极简北欧风桌面改造灵感四宫格",
      type: "image",
      model: "Nano Banana Pro",
      ratio: "3:4 图文",
      duration: "4图",
      shots: 4,
      cover: "https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?q=80&w=600&auto=format&fit=crop",
      createTime: "1小时前",
      status: "published",
    },
  ]);

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
                          setAiWorkTab("agent");
                          setAgentTopic(task.title);
                          setAgentScript(`【标题】${task.title} 爆款推介\n【前3秒】千万别错过！今天给大家种草一款来自${task.brand}的宝藏好物！\n【核心价值】解决日常使用痛点，高品质与性价比兼具！\n【引导互动】想要同款的小伙伴，评论区留言即可获取限时专属优惠！`);
                          toast.info(`已将【${task.brand}】推广要求带入 AI 创作工作坊`);
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

      {/* 模块 3: AI 创作工作坊 (Create / AITool 完整复刻：Agent工作台 · 内置8大工具箱 · AI排行榜 · 批量草稿箱) */}
      {activeSubTab === "aiTool" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* 四大核心子工作区切换 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3 rounded-xl border border-border">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {[
                { id: "agent", name: "✨ 智能创作 Agent (分镜成片)", icon: LuWand, desc: "爆款脚本分镜 + 音视频生成" },
                { id: "tools", name: "🧰 官方8大AI工具箱", icon: LuLayers, desc: "吉卜力GPT/数字人/换脸/克隆/解说" },
                { id: "ranking", name: "🏆 AI工具全网排行榜", icon: LuAward, desc: "周榜/月榜/国内外热度榜单" },
                { id: "drafts", name: "📦 批量草稿箱 (Draft Box)", icon: LuFolderCheck, desc: "批量成片与一键直发队列" },
              ].map((sub) => {
                const Icon = sub.icon;
                const isCur = aiWorkTab === sub.id;
                return (
                  <button
                    key={sub.id}
                    onClick={() => setAiWorkTab(sub.id as any)}
                    className={`flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-all ${
                      isCur
                        ? "bg-violet-600 text-white font-semibold shadow-xs"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <Icon className="size-3.5" />
                    <span>{sub.name}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Badge variant="outline" className="border-violet-500/30 text-violet-600 dark:text-violet-400">
                All-In-Agent 创作架构
              </Badge>
              <span>算力驱动: MiniMax H3 / Seedance 2.0 / OpenAI</span>
            </div>
          </div>

          {/* 子模块 1: 智能创作 Agent (分镜成片 & 剧本生成) */}
          {aiWorkTab === "agent" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* 左侧控制台 (7列) */}
                <div className="lg:col-span-7 space-y-4">
                  {/* 1. 创作主题与灵感生成 */}
                  <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-border/60 pb-3">
                      <div className="flex items-center gap-2">
                        <LuWand className="size-4 text-violet-500" />
                        <h3 className="text-sm font-semibold text-foreground">AI 智能脚本与分镜创作工作台</h3>
                      </div>
                      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">
                        全自动分镜管线就绪
                      </Badge>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <Label className="text-foreground font-semibold">创作主题 / 核心痛点</Label>
                        <span className="text-muted-foreground text-[11px]">支持自然语言输入</span>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={agentTopic}
                          onChange={(e) => setAgentTopic(e.target.value)}
                          placeholder="例如：一人公司如何利用AI实现自动化全网营销与矩阵变现..."
                          className="text-xs h-9 bg-background"
                        />
                        <Button
                          size="sm"
                          disabled={agentStep === "script"}
                          onClick={() => {
                            setAgentStep("script");
                            toast.info("AI Agent 正在分析全网爆款模型并生成专业短视频脚本...");
                            setTimeout(() => {
                              setAgentStep("storyboard");
                              toast.success("爆款脚本与四段黄金分镜已自动构思完成！");
                            }, 1500);
                          }}
                          className="h-9 text-xs bg-violet-600 text-white hover:bg-violet-700 shrink-0 gap-1.5 font-medium px-3.5"
                        >
                          <LuSparkles className="size-3.5" />
                          智能生成分镜
                        </Button>
                      </div>
                    </div>

                    {/* 预设灵感模板快捷标签 */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground">精选灵感:</span>
                      {[
                        "一人公司AI变现",
                        "数码3C极客评测",
                        "小红书美学改造",
                        "出海短剧解说",
                        "本地探店吃喝",
                      ].map((tag) => (
                        <button
                          key={tag}
                          onClick={() => setAgentTopic(tag)}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-muted/60 hover:bg-violet-500/10 hover:text-violet-600 border border-border/80 transition-colors"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>

                    {/* 参数配置 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">成片模型</Label>
                        <select
                          value={agentModel}
                          onChange={(e) => setAgentModel(e.target.value)}
                          className="w-full h-7 rounded border border-input bg-background px-2 text-[11px] mt-1"
                        >
                          <option value="minimax_h3">MiniMax H3 (0.09元/秒)</option>
                          <option value="seedance_2">Seedance 2.0 Fast</option>
                          <option value="veo_3">Veo 3.1 电影级</option>
                          <option value="nanobanana">Nano Banana Pro 2K</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">画面画幅比例</Label>
                        <select className="w-full h-7 rounded border border-input bg-background px-2 text-[11px] mt-1">
                          <option value="9:16">📱 9:16 竖屏短视频</option>
                          <option value="16:9">💻 16:9 横屏影视/B站</option>
                          <option value="3:4">📷 3:4 小红书比例</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">声音配音 (TTS)</Label>
                        <select className="w-full h-7 rounded border border-input bg-background px-2 text-[11px] mt-1">
                          <option value="voice_yunxi">晓晓 (年轻知性女声)</option>
                          <option value="voice_yunjian">云希 (阳光活力男声)</option>
                          <option value="voice_cosy">CosyVoice 自克隆音色</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">背景配乐风格</Label>
                        <select className="w-full h-7 rounded border border-input bg-background px-2 text-[11px] mt-1">
                          <option value="bgm_tech">节奏感科技未来 (Future)</option>
                          <option value="bgm_jazz">轻快爵士轻音乐 (Jazz)</option>
                          <option value="bgm_epic">史诗宏大电影氛围</option>
                        </select>
                      </div>
                    </div>

                    {/* 脚本编辑区 */}
                    <div className="space-y-1.5 pt-2 border-t border-border/60">
                      <div className="flex items-center justify-between text-xs">
                        <Label className="text-foreground font-semibold flex items-center gap-1.5">
                          <LuFileText className="size-3.5 text-violet-500" />
                          AI 结构化短视频脚本
                        </Label>
                        <span className="text-[10px] text-muted-foreground">
                          黄金前3秒钩子 · 痛点挖掘 · 价值提供 · 评论区截流引导
                        </span>
                      </div>
                      <textarea
                        rows={4}
                        value={agentScript}
                        onChange={(e) => setAgentScript(e.target.value)}
                        className="w-full rounded-md border border-input bg-background p-2.5 text-xs font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  {/* 2. 四段分镜拆解列表 */}
                  <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                      <div className="flex items-center gap-2">
                        <LuSlidersHorizontal className="size-4 text-violet-500" />
                        <h4 className="text-xs font-semibold text-foreground">分镜拆解与英文渲染提示词 (Storyboard)</h4>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        共 4 个精细分镜 · 15 秒总长
                      </Badge>
                    </div>

                    <div className="space-y-2.5">
                      {storyboardShots.map((shot) => (
                        <div
                          key={shot.shot}
                          className="rounded-lg border border-border/70 bg-muted/20 p-3 flex flex-col sm:flex-row items-start gap-3 hover:border-violet-500/40 transition-colors"
                        >
                          <div className="relative w-full sm:w-28 h-20 rounded-md overflow-hidden bg-black shrink-0 border border-border">
                            <img src={shot.preview} alt={`Shot ${shot.shot}`} className="w-full h-full object-cover" />
                            <Badge className="absolute top-1 left-1 bg-black/70 text-white text-[9px] px-1 py-0">
                              镜头 {shot.shot}
                            </Badge>
                            <span className="absolute bottom-1 right-1 bg-black/70 text-[9px] font-mono text-white/90 px-1 rounded">
                              {shot.time}
                            </span>
                          </div>

                          <div className="flex-1 space-y-1 min-w-0">
                            <div className="text-xs font-medium text-foreground line-clamp-1">{shot.desc}</div>
                            <div className="text-[11px] text-violet-600 dark:text-violet-400 flex items-center gap-1 line-clamp-1">
                              <LuMic className="size-3 shrink-0" />
                              <span>解说词: {shot.voice}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono truncate bg-background/80 px-2 py-0.5 rounded border border-border/60">
                              Prompt: {shot.prompt}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-border/60">
                      <div className="text-[11px] text-muted-foreground">
                        单次生成消耗约 1.35 积分 · 视频将自动带入草稿箱
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const newDraft = {
                              id: `DF-${Math.floor(Math.random() * 900 + 100)}`,
                              title: `【${agentTopic}】分镜草稿任务`,
                              type: "video" as const,
                              model: "MiniMax H3",
                              ratio: "9:16 竖屏",
                              duration: "15s",
                              shots: 4,
                              cover: storyboardShots[0].preview,
                              createTime: "刚刚",
                              status: "ready" as const,
                            };
                            setDraftList([newDraft, ...draftList]);
                            toast.success("已保存该分镜大纲至批量草稿箱！");
                          }}
                          className="h-8 text-xs border-border"
                        >
                          保存至草稿箱
                        </Button>
                        <Button
                          size="sm"
                          disabled={agentStep === "render"}
                          onClick={() => {
                            setAgentStep("render");
                            toast.info("MiniMax H3 渲染引擎正在并行处理4个分镜，音画同步管线调度中...");
                            setTimeout(() => {
                              setAgentStep("done");
                              setGeneratedResult(storyboardShots[0].preview);
                              toast.success("AI 完整成片渲染完成！音轨配音与全息特效已无缝合成！");
                            }, 3000);
                          }}
                          className="h-8 text-xs bg-violet-600 text-white hover:bg-violet-700 shadow-sm gap-1.5 font-medium px-4"
                        >
                          {agentStep === "render" ? (
                            <LuRefreshCw className="size-3.5 animate-spin" />
                          ) : (
                            <LuPlay className="size-3.5" />
                          )}
                          {agentStep === "render" ? "正在合成渲染 2K 成片..." : "一键开始合成成片"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 右侧实时成片预览区 (5列) */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <LuPlay className="size-3.5 text-violet-500" />
                        AI Agent 成片播放器 (2K 渲染)
                      </span>
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        音画同步 · 动态字幕
                      </Badge>
                    </div>

                    <div className="relative rounded-lg overflow-hidden bg-black aspect-[9/16] max-h-[420px] flex items-center justify-center border border-border/80 mx-auto">
                      {generatedResult || agentStep === "done" ? (
                        <div className="relative w-full h-full group">
                          <img
                            src={generatedResult || storyboardShots[0].preview}
                            alt="Generated Preview"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-4 text-white">
                            <Badge className="w-fit mb-1.5 bg-violet-600 text-white text-[10px]">
                              MiniMax H3 2K 电影级
                            </Badge>
                            <span className="text-xs font-bold leading-tight">{agentTopic}</span>
                            <p className="text-[10px] text-white/80 line-clamp-2 mt-1">
                              字幕: {storyboardShots[0].voice}
                            </p>
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity cursor-pointer">
                            <div className="size-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
                              <LuPlay className="size-6 text-white ml-0.5" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center p-6 space-y-3 text-muted-foreground">
                          {agentStep === "render" ? (
                            <>
                              <LuRefreshCw className="size-8 mx-auto text-violet-500 animate-spin" />
                              <p className="text-xs text-foreground font-medium">GPU 渲染节点正在合成音画素材...</p>
                              <p className="text-[11px] text-muted-foreground">正在同步晓晓知性配音与动态字幕</p>
                            </>
                          ) : (
                            <>
                              <LuSparkles className="size-8 mx-auto text-violet-500/60 animate-pulse" />
                              <p className="text-xs">等待生成，配置左侧分镜后点击「一键开始合成成片」</p>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toast.success("已下载 2K 高清短视频 (MP4) 到本地")}
                          className="h-8 text-xs border-border flex-1 mr-2 gap-1"
                        >
                          <LuDownload className="size-3" />
                          下载无水印成片
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setActiveSubTab("publish");
                            setPublishTitle(`【${agentTopic}】一人公司自动化AI内容实操！`);
                            toast.success("已将 AI 成片载入一键发布待发队列！");
                          }}
                          className="h-8 text-xs bg-emerald-600 text-white hover:bg-emerald-700 flex-1 gap-1"
                        >
                          <LuSend className="size-3" />
                          一键推送到发布
                        </Button>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const newDraft = {
                            id: `DF-${Math.floor(Math.random() * 900 + 100)}`,
                            title: `【${agentTopic}】已渲染成片`,
                            type: "video" as const,
                            model: "MiniMax H3",
                            ratio: "9:16 竖屏",
                            duration: "15s",
                            shots: 4,
                            cover: storyboardShots[0].preview,
                            createTime: "刚刚",
                            status: "ready" as const,
                          };
                          setDraftList([newDraft, ...draftList]);
                          setAiWorkTab("drafts");
                          toast.success("已将成片加入草稿箱！");
                        }}
                        className="w-full h-7 text-xs text-muted-foreground hover:text-foreground"
                      >
                        加入批量草稿箱统一管理 →
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 子模块 2: 官方 8 大内置 AI 工具箱 (Webview 工具集) */}
          {aiWorkTab === "tools" && (
            <div className="space-y-4">
              {/* 工具导航条 (8大官方工具) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {[
                  { id: "gpt4o", name: "吉卜力 GPT-4o", tag: "AI创意绘图", url: "https://www.yikart.cn/chat" },
                  { id: "musetalk", name: "MuseTalk 数字人", tag: "唇形实时同步", url: "http://39.100.101.239:6006" },
                  { id: "parse", name: "短视频无水印解析", tag: "多平台解析", url: "http://39.100.101.239:5043" },
                  { id: "facefusion", name: "FaceFusion 换脸", tag: "AI智能换脸", url: "http://39.100.101.239:5042" },
                  { id: "cosyvoice", name: "CosyVoice 声音克隆", tag: "3秒极速克隆", url: "http://39.100.101.239:5046" },
                  { id: "narrato", name: "NarratoAI 解说", tag: "影视全自动解说", url: "http://39.100.101.239:6007" },
                  { id: "moneyprinter", name: "MoneyPrinter 成片", tag: "全自动剪辑成片", url: "http://39.100.101.239:6008" },
                  { id: "minimax", name: "MiniMax H3 引擎", tag: "秘塔2K生视频", url: "https://metaso.cn/minimax-h3/?s=ATE" },
                ].map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => setActiveWebtool(tool.id)}
                    className={`p-2.5 rounded-xl border text-left space-y-1 transition-all ${
                      activeWebtool === tool.id
                        ? "border-violet-500 bg-violet-500/15 ring-1 ring-violet-500/50 shadow-xs"
                        : "border-border bg-card hover:border-violet-500/30"
                    }`}
                  >
                    <div className="text-xs font-semibold text-foreground truncate">{tool.name}</div>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-violet-500/30 text-violet-600 truncate">
                      {tool.tag}
                    </Badge>
                  </button>
                ))}
              </div>

              {/* 工具工作容器与内嵌/弹窗控制 */}
              {(() => {
                const toolsMap: Record<string, { title: string; desc: string; url: string; badge: string }> = {
                  gpt4o: {
                    title: "吉卜力风格 GPT-4o 交互创意工坊",
                    desc: "专为内容创作者定制的吉卜力动漫艺术风大模型绘图与文案生成体系",
                    url: "https://www.yikart.cn/chat?isHideNav=true&mask=100005#new-chat?mask=100005",
                    badge: "官方定制对话系统",
                  },
                  musetalk: {
                    title: "MuseTalk 实时高清数字人驱动系统",
                    desc: "基于腾讯开源 MuseTalk 架构，输入一张人物照片与任意语音音频，实时生成无缝口型同步的数字人视频",
                    url: "http://39.100.101.239:6006",
                    badge: "GPU 实时渲染节点",
                  },
                  parse: {
                    title: "在线短视频无水印解析与格式转换 (video_spider)",
                    desc: "支持抖音、小红书、快手、TikTok、B站等主流短视频平台一键抓取无水印原画视频素材",
                    url: "http://39.100.101.239:5043",
                    badge: "全网解析服务",
                  },
                  facefusion: {
                    title: "FaceFusion 下一代高清人脸替换系统",
                    desc: "专业级电影人物换脸工具，支持单图替换、多脸智能跟踪、光照自适应与高分辨率重绘",
                    url: "http://39.100.101.239:5042",
                    badge: "本地/云端换脸引擎",
                  },
                  cosyvoice: {
                    title: "CosyVoice 极速多语言音色克隆 (FunAudioLLM)",
                    desc: "只需 3 秒参考音频，完美克隆目标人物音色、情感语调与口音，支持中英文双语跨语种合成",
                    url: "http://39.100.101.239:5046",
                    badge: "阿里开源音色大模型",
                  },
                  narrato: {
                    title: "NarratoAI 全自动影视解说与剧情生成",
                    desc: "自动分析电影片段，智能切分剧情高潮节点，自动生成扣人心弦的解说文案与字幕配音",
                    url: "http://39.100.101.239:6007",
                    badge: "爆款解说生成器",
                  },
                  moneyprinter: {
                    title: "MoneyPrinterTurbo 短视频一键成片流水线",
                    desc: "输入一句话主题，自动完成文案构思、素材抓取、背景音乐匹配、字幕对齐与视频渲染",
                    url: "http://39.100.101.239:6008",
                    badge: "OPC 爆款流水线",
                  },
                  minimax: {
                    title: "MiniMax H3 视频生成 API (秘塔科技专属)",
                    desc: "原生 2K 电影级画质，音画高度同步，兼容 OpenAI 协议与 ComfyUI，低至 0.09 元/秒",
                    url: "https://metaso.cn/minimax-h3/?s=ATE",
                    badge: "官方赞助合作伙伴",
                  },
                };

                const currentTool = toolsMap[activeWebtool] || toolsMap.gpt4o;

                return (
                  <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col min-h-[620px] shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border bg-muted/40 px-4 py-3 gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-foreground">{currentTool.title}</h4>
                          <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30 text-[10px]">
                            {currentTool.badge}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{currentTool.desc}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopy(currentTool.url, "工具服务地址")}
                          className="h-7 text-xs border-border gap-1"
                        >
                          <LuCopy className="size-3" />
                          复制直链
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleOpenExternal(currentTool.url)}
                          className="h-7 text-xs bg-violet-600 text-white hover:bg-violet-700 gap-1"
                        >
                          <LuExternalLink className="size-3" />
                          指纹浏览器独立窗口打开
                        </Button>
                      </div>
                    </div>

                    {/* 内嵌 iframe / 模拟 Webview */}
                    <div className="flex-1 w-full relative bg-background">
                      <iframe
                        key={currentTool.url}
                        src={currentTool.url}
                        className="w-full h-full min-h-[550px] border-none"
                        title={currentTool.title}
                        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 子模块 3: AI 工具全网排行榜 (aiRanking) */}
          {aiWorkTab === "ranking" && (
            <div className="space-y-4">
              {/* 榜单筛选栏 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground">类型:</span>
                    {[
                      { key: "all", label: "总榜" },
                      { key: "cn", label: "国内榜" },
                      { key: "global", label: "国外榜" },
                    ].map((item) => (
                      <button
                        key={item.key}
                        onClick={() => setRankingArea(item.key as any)}
                        className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                          rankingArea === item.key
                            ? "bg-violet-600 text-white font-semibold"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground">周期:</span>
                    {[
                      { key: "week", label: "周榜" },
                      { key: "month", label: "月榜" },
                      { key: "total", label: "年度榜" },
                    ].map((item) => (
                      <button
                        key={item.key}
                        onClick={() => setRankingPeriod(item.key as any)}
                        className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                          rankingPeriod === item.key
                            ? "bg-violet-600 text-white font-semibold"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground">分类:</span>
                    {[
                      { key: "all", label: "全部" },
                      { key: "video", label: "AI视频" },
                      { key: "image", label: "AI绘画" },
                      { key: "digitalHuman", label: "数字人" },
                      { key: "audio", label: "声音/解说" },
                    ].map((item) => (
                      <button
                        key={item.key}
                        onClick={() => setRankingCategory(item.key as any)}
                        className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                          rankingCategory === item.key
                            ? "bg-violet-500/20 text-violet-600 font-semibold"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  数据来源: AiToEarn 全球AI工具雷达 · 每周一实时同步
                </div>
              </div>

              {/* 榜单数据表格 */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/50 text-muted-foreground border-b border-border/80">
                      <tr>
                        <th className="py-2.5 px-3 text-center w-12 font-semibold">#</th>
                        <th className="py-2.5 px-3 font-semibold">产品名 / 开发者</th>
                        <th className="py-2.5 px-3 font-semibold">所属赛道</th>
                        <th className="py-2.5 px-3 font-semibold">月访问量</th>
                        <th className="py-2.5 px-3 font-semibold">周作品提及量</th>
                        <th className="py-2.5 px-3 font-semibold">综合声望值</th>
                        <th className="py-2.5 px-3 font-semibold">综合评分</th>
                        <th className="py-2.5 px-3 text-right font-semibold">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {[
                        {
                          rank: 1,
                          name: "MiniMax H3 (秘塔视频)",
                          cat: "video",
                          catLabel: "AI视频",
                          desc: "原生2K超清、音画同步对齐、低至0.09元/秒",
                          visits: "1,820万",
                          mentions: "36.8万",
                          reputation: "98.7",
                          score: "99.2",
                          url: "https://metaso.cn/minimax-h3/?s=ATE",
                          change: "+2",
                        },
                        {
                          rank: 2,
                          name: "Nano Banana Pro",
                          cat: "image",
                          catLabel: "AI绘画",
                          desc: "小红书爆款图文神器、支持2K高质感商品排版渲染",
                          visits: "940万",
                          mentions: "24.5万",
                          reputation: "96.4",
                          score: "98.0",
                          url: "https://aitoearn.cn",
                          change: "+1",
                        },
                        {
                          rank: 3,
                          name: "MuseTalk 腾讯数字人",
                          cat: "digitalHuman",
                          catLabel: "数字人",
                          desc: "实时唇形与语音极致匹配、电商直播与解说带货首选",
                          visits: "680万",
                          mentions: "18.2万",
                          reputation: "94.8",
                          score: "96.5",
                          url: "http://39.100.101.239:6006",
                          change: "+5",
                        },
                        {
                          rank: 4,
                          name: "CosyVoice 阿里声音克隆",
                          cat: "audio",
                          catLabel: "声音/解说",
                          desc: "3秒音频极速克隆原声、多语种跨语言声线合成",
                          visits: "520万",
                          mentions: "15.9万",
                          reputation: "93.1",
                          score: "95.2",
                          url: "http://39.100.101.239:5046",
                          change: "0",
                        },
                        {
                          rank: 5,
                          name: "FaceFusion 下一代换脸",
                          cat: "video",
                          catLabel: "AI视频",
                          desc: "无痕实时人脸替换与多目标智能追踪算法",
                          visits: "490万",
                          mentions: "12.4万",
                          reputation: "91.6",
                          score: "93.8",
                          url: "http://39.100.101.239:5042",
                          change: "-1",
                        },
                        {
                          rank: 6,
                          name: "NarratoAI 影视剧解说",
                          cat: "audio",
                          catLabel: "声音/解说",
                          desc: "长视频剧情全自动分段、高能爆点智能解说配音",
                          visits: "380万",
                          mentions: "9.7万",
                          reputation: "90.2",
                          score: "92.4",
                          url: "http://39.100.101.239:6007",
                          change: "+3",
                        },
                        {
                          rank: 7,
                          name: "MoneyPrinterTurbo 成片",
                          cat: "video",
                          catLabel: "AI视频",
                          desc: "一键批量生成短视频、文案/素材/字幕一气呵成",
                          visits: "310万",
                          mentions: "8.6万",
                          reputation: "89.5",
                          score: "91.0",
                          url: "http://39.100.101.239:6008",
                          change: "+2",
                        },
                      ]
                        .filter((item) => rankingCategory === "all" || item.cat === rankingCategory)
                        .map((item) => (
                          <tr key={item.rank} className="hover:bg-muted/40 transition-colors">
                            <td className="py-3 px-3 text-center">
                              {item.rank <= 3 ? (
                                <span className="inline-flex items-center justify-center size-6 rounded-full bg-violet-600 text-white font-bold text-xs shadow-xs">
                                  {item.rank}
                                </span>
                              ) : (
                                <span className="font-semibold text-muted-foreground">{item.rank}</span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-semibold text-foreground flex items-center gap-1.5">
                                <span>{item.name}</span>
                                <Badge variant="secondary" className="text-[9px] px-1 py-0 text-emerald-600">
                                  {item.change}
                                </Badge>
                              </div>
                              <div className="text-[11px] text-muted-foreground line-clamp-1">{item.desc}</div>
                            </td>
                            <td className="py-3 px-3">
                              <Badge variant="outline" className="text-[10px]">
                                {item.catLabel}
                              </Badge>
                            </td>
                            <td className="py-3 px-3 font-mono font-medium">{item.visits}</td>
                            <td className="py-3 px-3 font-mono">{item.mentions}</td>
                            <td className="py-3 px-3 font-mono text-muted-foreground">{item.reputation}</td>
                            <td className="py-3 px-3 font-mono font-bold text-violet-600 dark:text-violet-400">
                              {item.score}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenExternal(item.url)}
                                className="h-7 text-xs border-violet-500/30 text-violet-600 hover:bg-violet-500/10 gap-1"
                              >
                                立即体验
                                <LuExternalLink className="size-3" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 子模块 4: 批量草稿箱 (Draft Box - 批量成片与分发) */}
          {aiWorkTab === "drafts" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <LuFolderCheck className="size-4 text-violet-500" />
                    批量草稿箱 (Draft Box)
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    所有通过 AI Agent、分镜创作与外部工具生成的成片/图文草稿均统一存储于此，支持一键批量下发全网发布
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      toast.info("已清空已发布草稿记录");
                      setDraftList(draftList.filter((d) => d.status !== "published"));
                    }}
                    className="h-8 text-xs border-border"
                  >
                    清除已发布草稿
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setActiveSubTab("publish");
                      toast.success(`已将全部 ${draftList.length} 条成片载入矩阵发布队列！`);
                    }}
                    className="h-8 text-xs bg-violet-600 text-white hover:bg-violet-700 shadow-sm gap-1.5"
                  >
                    <LuSend className="size-3.5" />
                    一键批量发布全部成片 ({draftList.length})
                  </Button>
                </div>
              </div>

              {/* 草稿列表卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {draftList.map((draft) => (
                  <div
                    key={draft.id}
                    className="rounded-xl border border-border bg-card p-4 space-y-3 hover:border-violet-500/40 hover:shadow-sm transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-border">
                        <img src={draft.cover} alt={draft.title} className="w-full h-full object-cover" />
                        <Badge className="absolute top-2 left-2 bg-black/70 text-white text-[10px]">
                          {draft.type === "video" ? "短视频成片" : "小红书图文"}
                        </Badge>
                        <span className="absolute bottom-2 right-2 bg-black/75 text-[10px] font-mono text-white px-1.5 py-0.5 rounded">
                          {draft.duration}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="font-mono">{draft.id}</span>
                          <span>{draft.createTime}</span>
                        </div>
                        <h5 className="text-xs font-semibold text-foreground line-clamp-1">{draft.title}</h5>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">
                            {draft.model}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {draft.ratio}
                          </Badge>
                          <Badge
                            className={`text-[9px] px-1 py-0 ${
                              draft.status === "published"
                                ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                                : "bg-violet-500/15 text-violet-600 border-violet-500/30"
                            }`}
                          >
                            {draft.status === "published" ? "已全网发布" : "草稿待发布"}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-border/60">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDraftList(draftList.filter((d) => d.id !== draft.id));
                          toast.info("已删除该草稿");
                        }}
                        className="h-7 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 p-0 px-2"
                      >
                        删除
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setActiveSubTab("publish");
                          setPublishTitle(draft.title);
                          toast.success(`已载入「${draft.title}」至发布队列！`);
                        }}
                        className="h-7 text-xs bg-emerald-600 text-white hover:bg-emerald-700 gap-1"
                      >
                        <LuSend className="size-3" />
                        发布该作品
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                      setAiWorkTab("agent");
                      setAgentTopic(hot.title);
                      setAgentScript(`【热点聚焦】最新全网热议：${hot.title}！\n【深度拆解】这背后到底反映了怎样的趋势和机会？\n【独家观点】普通创作者如何借势这波流量红利实现破圈？\n【讨论互动】你怎么看这个热搜？快在评论区发表你的观点！`);
                      toast.info(`已将热搜【${hot.title}】载入 AI 创作工作坊`);
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
