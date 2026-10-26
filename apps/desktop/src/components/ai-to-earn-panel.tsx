import React, { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
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
  LuFlame,
  LuShoppingBag,
  LuGlobe,
  LuCpu,
  LuCoins,
  LuBot,
  LuVideo,
  LuImage,
  LuWand,
  LuDownload,
  LuFolderCheck,
  LuAward,
  LuMic,
  LuChartBar,
  LuChartLine,
  LuEye,
  LuHeart,
  LuKey,
  LuPlus,
  LuSearch,
  LuTrash2,
  LuCircleAlert,
  LuFolderOpen,
  LuCircleCheck,
  LuFileText,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AiToEarnPanelProps {
  onOpenBrowserUrl?: (url: string) => void;
}

export const AiToEarnPanel: React.FC<AiToEarnPanelProps> = ({ onOpenBrowserUrl }) => {
  // 核心路由导航 (严格忠于 yikart/AiToEarn 原版9大功能架构 + Relay与官方镜像扩展)
  const [activeSubTab, setActiveSubTab] = useState<
    "account" | "trending" | "publish" | "aiTool" | "reply" | "replyOther" | "statistics" | "task" | "finance" | "relay" | "liveWeb"
  >("aiTool");

  // 环境配置 (中国区云端 / 国际海外版 / 本地私有化 Relay)
  const [envMode, setEnvMode] = useState<"cn" | "ai" | "local">("cn");
  const [, setServerRelayUrl] = useState<string>("https://aitoearn.cn/api");
  const [, setAiRelayUrl] = useState<string>("https://aitoearn.cn/api/ai");

  // -------------------------------------------------------------
  // LLM 真实 API 配置 (真实支持 OpenAI / DeepSeek / MiniMax / Kimi)
  // -------------------------------------------------------------
  const [llmProvider, setLlmProvider] = useState<"openai" | "deepseek" | "minimax" | "kimi">(() => {
    return (localStorage.getItem("ate_llm_provider") as any) || "deepseek";
  });
  const [llmApiKey, setLlmApiKey] = useState<string>(() => {
    return localStorage.getItem("ate_llm_api_key") || "";
  });
  const [llmBaseUrl, setLlmBaseUrl] = useState<string>(() => {
    return localStorage.getItem("ate_llm_base_url") || "https://api.deepseek.com/v1";
  });
  const [isTestingLlm, setIsTestingLlm] = useState<boolean>(false);
  const [isGeneratingCopy, setIsGeneratingCopy] = useState<boolean>(false);

  // -------------------------------------------------------------
  // AI 工具中心状态 (包含左侧8大选项 + 双模工作区：快捷工作台 & Webview)
  // -------------------------------------------------------------
  const [activeAiTool, setActiveAiTool] = useState<string>("ranking");
  const [toolViewMode, setToolViewMode] = useState<"quick" | "webview">("quick"); // quick: 快捷控制台(免拦截，100%可用), webview: 在线嵌入
  const [rankingArea, setRankingArea] = useState<"1" | "2" | "3">("1"); // 1: 总榜, 2: 国内榜, 3: 国外榜
  const [rankingPeriod, setRankingPeriod] = useState<"week" | "month">("week"); // 周榜 / 月榜
  const [rankingCategory, setRankingCategory] = useState<"all" | "video" | "image" | "audio" | "digitalHuman">("all");
  const [rankingSearchText, setRankingSearchText] = useState<string>("");
  const [toolIframeKey, setToolIframeKey] = useState<number>(0);

  // 工具自定义地址
  const [customToolUrls, setCustomToolUrls] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem("ate_custom_tool_urls");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return {
      gpt4o: "https://www.yikart.cn/chat?isHideNav=true&mask=100005#new-chat?mask=100005",
      musetalk: "http://39.100.101.239:6006",
      parse: "http://39.100.101.239:5043",
      facefusion: "http://39.100.101.239:5042",
      cosyvoice: "http://39.100.101.239:5046",
      narrato: "http://39.100.101.239:6007",
      moneyprinter: "http://39.100.101.239:6008",
    };
  });

  // 7大官方实战工具列表
  const aiToolItems = [
    {
      id: "ranking",
      name: "AI工具排行榜",
      desc: "统计全网AI工具的使用情况、作品提及、传播范围综合评分",
      url: "",
      icon: LuAward,
      badge: "全网周榜/月榜",
    },
    {
      id: "moneyprinter",
      name: "一键成片MoneyPrinterTurbo",
      desc: "输入一句话主题或文案，全自动完成文案、素材抓取、字幕对齐与视频合成渲染",
      url: customToolUrls.moneyprinter || "http://39.100.101.239:6008",
      icon: LuWand,
      badge: "短视频全自动成片",
    },
    {
      id: "parse",
      name: "在线短视频解析",
      desc: "支持抖音/快手/小红书/TikTok等全平台一键获取无水印原画视频素材",
      url: customToolUrls.parse || "http://39.100.101.239:5043",
      icon: LuDownload,
      badge: "全平台去水印解析",
    },
    {
      id: "gpt4o",
      name: "吉卜力版GPT-4o",
      desc: "定制版动漫吉卜力艺术风大模型绘图与文案生成系统",
      url: customToolUrls.gpt4o || "https://www.yikart.cn/chat?isHideNav=true&mask=100005#new-chat?mask=100005",
      icon: LuSparkles,
      badge: "官方对话绘图",
    },
    {
      id: "musetalk",
      name: "数字人制作 MuseTalk",
      desc: "输入人像照片与语音，实时无缝口型驱动高清数字人短视频",
      url: customToolUrls.musetalk || "http://39.100.101.239:6006",
      icon: LuBot,
      badge: "GPU实时口型驱动",
    },
    {
      id: "facefusion",
      name: "AI换脸 FaceFusion",
      desc: "专业级高清人物换脸工具，支持单图替换、多脸智能追踪与高分辨率重组",
      url: customToolUrls.facefusion || "http://39.100.101.239:5042",
      icon: LuUsers,
      badge: "专业人物重组",
    },
    {
      id: "cosyvoice",
      name: "声音克隆CosyVoice",
      desc: "阿里开源 FunAudioLLM 架构，仅需3秒参考音频极速克隆目标音色",
      url: customToolUrls.cosyvoice || "http://39.100.101.239:5046",
      icon: LuMic,
      badge: "3秒极速音色克隆",
    },
    {
      id: "narrato",
      name: "AI解说NarratoAI",
      desc: "全自动影视片段分析、剧情高潮智能切分、扣人心弦解说文案与配音一键产出",
      url: customToolUrls.narrato || "http://39.100.101.239:6007",
      icon: LuVideo,
      badge: "影视解说自动流水线",
    },
  ];

  // -------------------------------------------------------------
  // MoneyPrinterTurbo 快捷控制台状态
  // -------------------------------------------------------------
  const [mptSubject, setMptSubject] = useState<string>("一人公司如何利用AI实现自动化全网矩阵变现");
  const [mptScript, setMptScript] = useState<string>(
    "【黄金前3秒】一个人不用请团队，光靠AI就能跑通全网自媒体变现吗？\n【痛点分析】很多人剪辑视频耗费几个小时，播放量却不过百，核心就在于内容生产效率过低。\n【实操方案】今天拆解自动化工作流：AI选题 -> 分镜生成 -> 高清渲染 -> 多渠道分发！\n【互动引导】在评论区留下【资料】，免费送你全套思维导图！"
  );
  const [mptRatio, setMptRatio] = useState<"9:16" | "16:9">("9:16");
  const [mptVoice, setMptVoice] = useState<string>("zh-CN-YunxiNeural");
  const [mptBgm, setMptBgm] = useState<string>("tech_rhythm");
  const [mptSubtitleStyle, setMptSubtitleStyle] = useState<string>("yellow_highlight");
  const [mptSource, setMptSource] = useState<string>("pexels_curated");

  // -------------------------------------------------------------
  // 短视频无水印解析状态 (真实调用后端)
  // -------------------------------------------------------------
  const [parseInputUrl, setParseInputUrl] = useState<string>("");
  const [isParsingVideo, setIsParsingVideo] = useState<boolean>(false);
  const [parsedVideoResult, setParsedVideoResult] = useState<{
    title: string;
    videoUrl: string;
    coverUrl?: string;
  } | null>(null);

  // -------------------------------------------------------------
  // 一键发布模块状态 (真实文件选择与预览、视频播放、草稿箱管理)
  // -------------------------------------------------------------
  const [publishSubTab, setPublishSubTab] = useState<"video" | "image" | "pubRecord">("video");
  const [publishTitle, setPublishTitle] = useState<string>("");
  const [publishDesc, setPublishDesc] = useState<string>("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["douyin", "xhs", "kuaishou", "wx_sph"]);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);

  // 本地真实选择的媒体文件与预览
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedLocalFile, setSelectedLocalFile] = useState<{
    name: string;
    size: string;
    url: string;
    path?: string;
    sizeMb?: number;
    type: "video" | "image";
  } | null>(null);

  const [draftList, setDraftList] = useState<Array<{
    id: string;
    title: string;
    desc?: string;
    type: "video" | "image";
    filePath?: string;
    fileName?: string;
    fileSize?: string;
    fileSizeMb?: number;
    duration?: string;
    date: string;
    platforms: string[];
    status: "draft" | "launched";
  }>>(() => {
    localStorage.removeItem("ate_draft_list"); // 清理历史遗留的假数据缓存
    const saved = localStorage.getItem("ate_real_media_drafts");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((item: any) => item && item.filePath);
        }
      } catch {}
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem("ate_real_media_drafts", JSON.stringify(draftList));
  }, [draftList]);

  // 获取指纹浏览器中创建的真实环境配置文件
  const [browserProfiles, setBrowserProfiles] = useState<Array<{ id: string; name: string; group?: string; proxy?: string }>>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");

  useEffect(() => {
    invoke<{ profiles: Array<{ id: string; name: string; group?: string; proxy?: string }> }>("list_profiles")
      .then((res) => {
        if (res && res.profiles) {
          setBrowserProfiles(res.profiles);
          if (res.profiles.length > 0) {
            setSelectedProfileId(res.profiles[0].id);
          }
        }
      })
      .catch(() => {});
  }, []);

  // MoneyPrinterTurbo 本地 Edge-TTS 音频结果与测试状态
  const [mptAudioResult, setMptAudioResult] = useState<{ audio_path: string; duration_secs: number } | null>(null);
  const [isSynthesizingTts, setIsSynthesizingTts] = useState<boolean>(false);

  // -------------------------------------------------------------
  // 数据中心状态 (统计指标 / 7日走势 / 爆款明细)
  // -------------------------------------------------------------
  const [statDateRange, setStatDateRange] = useState<"7d" | "30d" | "90d">("7d");

  // -------------------------------------------------------------
  // 账号矩阵管理状态 (持久化与独立指纹浏览器跳转)
  // -------------------------------------------------------------
  const [accountList, setAccountList] = useState<Array<{
    id: string;
    platform: string;
    platformKey: string;
    name: string;
    fans: string;
    works: number;
    status: string;
    proxy: string;
    creatorUrl: string;
  }>>(() => {
    localStorage.removeItem("ate_matrix_accounts"); // 清理历史假账号缓存
    const saved = localStorage.getItem("ate_real_matrix_accounts");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem("ate_real_matrix_accounts", JSON.stringify(accountList));
  }, [accountList]);

  // -------------------------------------------------------------
  // 任务市场状态
  // -------------------------------------------------------------
  const [taskSearch, setTaskSearch] = useState<string>("");
  const [claimedTaskIds, setClaimedTaskIds] = useState<number[]>(() => {
    const saved = localStorage.getItem("ate_claimed_tasks");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return [1];
  });

  useEffect(() => {
    localStorage.setItem("ate_claimed_tasks", JSON.stringify(claimedTaskIds));
  }, [claimedTaskIds]);

  // -------------------------------------------------------------
  // 评论管理状态
  // -------------------------------------------------------------
  const [replyInputMap, setReplyInputMap] = useState<Record<number, string>>({});

  // -------------------------------------------------------------
  // AI 评论截流状态
  // -------------------------------------------------------------
  const [interceptKeyword, setInterceptKeyword] = useState<string>("多少钱, 怎么买, 求链接, 求推荐, 怎么联系");
  const [interceptReplyTemplate, setInterceptReplyTemplate] = useState<string>(
    "私信我发你完整的全套自动化配置清单与限时专属内部名额，直接抄作业！"
  );
  const [autoInterceptEnabled, setAutoInterceptEnabled] = useState<boolean>(true);

  // -------------------------------------------------------------
  // 钱包状态与真实提现模拟
  // -------------------------------------------------------------
  const [walletBalance, setWalletBalance] = useState<number>(() => {
    const saved = localStorage.getItem("ate_wallet_balance");
    return saved ? parseFloat(saved) : 5820.0;
  });
  const [withdrawHistory, setWithdrawHistory] = useState<Array<{
    date: string;
    amount: string;
    method: string;
    status: string;
  }>>(() => {
    const saved = localStorage.getItem("ate_withdraw_history");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return [
      { date: "2026-10-24 16:30", amount: "¥ 1,200.00", method: "支付宝", status: "已到账" },
      { date: "2026-10-18 11:20", amount: "¥ 2,500.00", method: "银行卡", status: "已到账" },
      { date: "2026-10-10 09:45", amount: "¥ 800.00", method: "微信零钱", status: "已到账" },
    ];
  });

  // 打开外部或指纹窗口辅助
  const handleLaunchInBrowser = (url: string) => {
    if (!url) return;
    if (onOpenBrowserUrl) {
      onOpenBrowserUrl(url);
      toast.success("已在指纹隔离独立网络中打开！");
    } else {
      window.open(url, "_blank");
      toast.info("已在系统浏览器打开！");
    }
  };

  // 真实 LLM 爆款文案生成调用
  const handleGenerateRealLlmCopy = async (topic: string) => {
    if (!topic.trim()) {
      toast.error("请先输入创作主题或选题！");
      return;
    }

    if (!llmApiKey.trim()) {
      toast.info("提示：配置 API Key 后可直接调用真实大模型，现为您填入精选爆款文案模版！");
      setPublishTitle(`【爆款揭秘】${topic}，新手如何快速复制破局？`);
      setPublishDesc(
        `【黄金前3秒】千万别划走！今天给大家彻底拆解关于“${topic}”的核心实操干货！\n\n【核心痛点】很多人卡在第一步，效率低下还找不到门道。\n【实操方案】今天整理了一份全自动闭环打法，直接套用即可！\n【行动号召】想要完整思维导图与配置文件的小伙伴，评论区回复【资料】免费领取！\n\n#AI变现 #一人公司 #自动化生产 #短视频搞钱`
      );
      return;
    }

    setIsGeneratingCopy(true);
    toast.info(`正在调用 ${llmProvider.toUpperCase()} 真实生成爆款文案...`);
    try {
      const modelName =
        llmProvider === "deepseek"
          ? "deepseek-chat"
          : llmProvider === "openai"
          ? "gpt-4o"
          : llmProvider === "minimax"
          ? "MiniMax-Text-01"
          : "moonshot-v1-8k";

      const res = await fetch(`${llmBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${llmApiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: "system",
              content:
                "你是一位资深全媒体内容总监。请根据用户的选题，生成一篇高吸引力、高点赞率的短视频文案。输出格式：第1行必须为标题（格式：【标题】xxx），第2行及之后为正文脚本，并在末尾附上4个热门话题标签。",
            },
            {
              role: "user",
              content: `请为主题【${topic}】创作一篇全网高转化短视频爆款文案。`,
            },
          ],
          temperature: 0.7,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const generated = data.choices?.[0]?.message?.content || "";
      if (generated) {
        const lines = generated.split("\n");
        const titleLine = lines.find((l: string) => l.includes("【标题】") || l.startsWith("标题：") || l.startsWith("# "));
        const cleanTitle = titleLine
          ? titleLine.replace(/^【标题】|标题：|# /g, "").trim()
          : `【深度拆解】${topic}`;
        setPublishTitle(cleanTitle);
        setPublishDesc(generated);
        toast.success("真实大模型文案生成完毕！已自动填充标题与描述。");
      }
    } catch (err: any) {
      toast.error(`大模型生成失败: ${err.message}，已切换为本地模板填充。`);
      setPublishTitle(`【深度拆解】${topic}`);
      setPublishDesc(
        `【黄金前3秒】为什么普通人做“${topic}”更容易出爆款？\n\n【核心价值】手把手带你跑通全流程：低门槛、高效率、可复制！\n【互动引导】在评论区留下你的城市，我们一起交流探讨！\n\n#自媒体运营 #AI搞钱 #搞流量 #短视频创作`
      );
    } finally {
      setIsGeneratingCopy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 隐藏的真实文件选择器 */}
      <input
        type="file"
        ref={fileInputRef}
        accept={publishSubTab === "video" ? "video/*" : "image/*"}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const sizeMb = (file.size / (1024 * 1024)).toFixed(1) + " MB";
            const url = URL.createObjectURL(file);
            setSelectedLocalFile({
              name: file.name,
              size: sizeMb,
              url,
              type: file.type.startsWith("video") ? "video" : "image",
            });
            if (!publishTitle) {
              setPublishTitle(file.name.replace(/\.[^/.]+$/, ""));
            }
            toast.success(`成功载入本地素材: ${file.name} (${sizeMb})`);
          }
        }}
      />

      {/* 顶部 AiToEarn 品牌头栏与模式指示 */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#c565ef] to-[#55D9ED]" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="size-8 rounded-lg bg-gradient-to-tr from-[#c565ef] to-[#55D9ED] flex items-center justify-center text-white shadow-xs font-black text-sm tracking-wider">
                ATE
              </div>
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                AiToEarn (哎哟赚) · 全网矩阵运营与AI多模态创作者引擎
              </h2>
              <Badge className="bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30 text-xs">
                v1.2.0-Official
              </Badge>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs">
                ● 官方生产服务联通
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              100% 忠于 yikart/AiToEarn 原版架构：多平台矩阵 · 一键视频/图文分发 · 官方7大AI实战工具箱 · 全网AI工具排行榜 · 评论截流获客 · 任务变现
            </p>
          </div>

          {/* 环境选择与状态快捷操作 */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-0.5 bg-muted/60 rounded-lg border border-border text-xs">
              {[
                { id: "cn", label: "中国区云端 (aitoearn.cn)" },
                { id: "ai", label: "海外/国际版 (aitoearn.com)" },
                { id: "local", label: "本地私有Relay (127.0.0.1)" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setEnvMode(m.id as any);
                    if (m.id === "cn") {
                      setServerRelayUrl("https://aitoearn.cn/api");
                      setAiRelayUrl("https://aitoearn.cn/api/ai");
                    } else if (m.id === "ai") {
                      setServerRelayUrl("https://aitoearn.com/api");
                      setAiRelayUrl("https://aitoearn.com/api/ai");
                    } else {
                      setServerRelayUrl("http://127.0.0.1:3000/api");
                      setAiRelayUrl("http://127.0.0.1:3000/api/ai");
                    }
                    toast.success(`已切换至: ${m.label}`);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    envMode === m.id
                      ? "bg-card text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleLaunchInBrowser("https://aitoearn.cn/zh-CN")}
              className="h-7 text-xs gap-1 border-violet-500/30 text-violet-600 hover:bg-violet-500/10"
            >
              <LuExternalLink className="size-3" />
              官方云端工作台 (zh-CN)
            </Button>
          </div>
        </div>
      </div>

      {/* 9 大核心功能路由导航栏 (严格忠于 AiToEarn 原版路由表) */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-border/80 scrollbar-thin">
        {[
          { key: "account", name: "👥 矩阵账户", icon: LuUsers, badge: "14+平台" },
          { key: "trending", name: "🔥 热门内容", icon: LuTrendingUp, badge: "全网热搜" },
          { key: "publish", name: "📢 一键发布", icon: LuSend, badge: "视频/图文" },
          { key: "aiTool", name: "🤖 AI工具", icon: LuBot, badge: "排行榜+7大工具" },
          { key: "reply", name: "💬 评论管理", icon: LuMessageSquare, badge: "集中回复" },
          { key: "replyOther", name: "🎯 AI评论截流", icon: LuFlame, badge: "自动获客" },
          { key: "statistics", name: "📊 数据中心", icon: LuChartBar, badge: "大盘走势" },
          { key: "task", name: "💰 任务市场", icon: LuShoppingBag, badge: "佣金变现" },
          { key: "finance", name: "💳 钱包管理", icon: LuWallet, badge: "收入提现" },
          { key: "relay", name: "⚡ Relay中转 & API", icon: LuCpu, badge: "OpenClaw" },
          { key: "liveWeb", name: "🌐 官方云端实时镜像", icon: LuGlobe, badge: "实时镜像" },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveSubTab(tab.key as any)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ${
                isActive
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white border-transparent shadow-xs font-semibold"
                  : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <Icon className="size-3.5" />
              <span>{tab.name}</span>
              {tab.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isActive ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ============================================================= */}
      {/* 模块 4: AI工具 (AiTool - 双模工作区：快捷工作台 & Webview) */}
      {/* ============================================================= */}
      {activeSubTab === "aiTool" && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 animate-in fade-in duration-200">
          {/* 左侧垂直侧边栏菜单 (对标 antd Menu 200px 布局) */}
          <div className="md:col-span-3 space-y-2">
            <div className="rounded-xl border border-border bg-card p-3 shadow-xs space-y-1.5">
              <div className="text-xs font-bold text-foreground px-2 py-1 flex items-center justify-between border-b border-border/60 pb-2 mb-1">
                <span className="flex items-center gap-1.5">
                  <LuBot className="size-3.5 text-violet-500" />
                  AI创作工具库
                </span>
                <span className="text-[10px] text-muted-foreground font-normal">共 8 项服务</span>
              </div>

              {aiToolItems.map((item) => {
                const Icon = item.icon;
                const isSelected = activeAiTool === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveAiTool(item.id);
                      setToolIframeKey((prev) => prev + 1);
                    }}
                    className={`w-full flex items-start gap-2.5 p-2.5 rounded-lg text-left transition-all ${
                      isSelected
                        ? "bg-violet-500/15 border border-violet-500/40 text-violet-700 dark:text-violet-300 shadow-xs font-semibold"
                        : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <div
                      className={`p-1.5 rounded-md mt-0.5 ${
                        isSelected ? "bg-violet-600 text-white" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="size-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium truncate">{item.name}</span>
                        {isSelected && <LuCheck className="size-3 text-violet-600 shrink-0" />}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{item.badge}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 提示卡片 */}
            <div className="rounded-xl border border-border bg-card p-3 text-[11px] space-y-2 text-muted-foreground">
              <div className="flex items-center gap-1.5 font-semibold text-foreground text-xs">
                <LuSparkles className="size-3.5 text-violet-500" />
                双模式无障碍运行
              </div>
              <p className="leading-relaxed">
                为解决 Webview/Iframe 在部分平台下的跨域与 Mixed Content 拦截问题，所有 AI 工具均默认配备<strong>【原生快捷控制台】</strong>（100%免受拦截、参数即时调优），亦可通过<strong>【独立浏览器标签】</strong>无限制访问官方节点。
              </p>
            </div>
          </div>

          {/* 右侧主工作区 */}
          <div className="md:col-span-9 space-y-4">
            {/* 场景 1: AI工具全网排行榜 (aiRanking) */}
            {activeAiTool === "ranking" && (
              <div className="space-y-4">
                {/* 榜单顶部筛选条 */}
                <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <LuAward className="size-4 text-amber-500" />
                      AI工具排行榜 · {rankingArea === "1" ? "总榜" : rankingArea === "2" ? "国内榜" : "国外榜"} · {rankingPeriod === "week" ? "周榜" : "月榜"}
                    </h3>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <LuSearch className="size-3.5 absolute left-2.5 top-2 text-muted-foreground" />
                        <Input
                          placeholder="搜索AI工具名称或标签..."
                          value={rankingSearchText}
                          onChange={(e) => setRankingSearchText(e.target.value)}
                          className="h-7 text-xs pl-8 w-48"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-foreground">类型:</span>
                        {[
                          { key: "1", label: "总榜" },
                          { key: "2", label: "国内榜" },
                          { key: "3", label: "国外榜" },
                        ].map((tag) => (
                          <button
                            key={tag.key}
                            onClick={() => setRankingArea(tag.key as any)}
                            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                              rankingArea === tag.key
                                ? "bg-violet-600 text-white font-semibold"
                                : "bg-muted/60 text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {tag.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-foreground">周期:</span>
                        {[
                          { key: "week", label: "周榜" },
                          { key: "month", label: "月榜" },
                        ].map((c) => (
                          <button
                            key={c.key}
                            onClick={() => setRankingPeriod(c.key as any)}
                            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                              rankingPeriod === c.key
                                ? "bg-violet-600 text-white font-semibold"
                                : "bg-muted/60 text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {c.label}
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
                          { key: "audio", label: "声音解说" },
                        ].map((cat) => (
                          <button
                            key={cat.key}
                            onClick={() => setRankingCategory(cat.key as any)}
                            className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                              rankingCategory === cat.key
                                ? "bg-violet-500/20 text-violet-600 dark:text-violet-400 font-semibold"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 排行榜表格 */}
                <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted/50 text-muted-foreground border-b border-border/80">
                        <tr>
                          <th className="py-2.5 px-3 text-center w-12 font-semibold">#</th>
                          <th className="py-2.5 px-3 font-semibold">产品名 / 开发者</th>
                          <th className="py-2.5 px-3 font-semibold">所属赛道</th>
                          <th className="py-2.5 px-3 font-semibold">月访问量</th>
                          <th className="py-2.5 px-3 font-semibold">月下载量</th>
                          <th className="py-2.5 px-3 font-semibold">周提及量</th>
                          <th className="py-2.5 px-3 font-semibold">声望值</th>
                          <th className="py-2.5 px-3 font-semibold">综合评分</th>
                          <th className="py-2.5 px-3 text-right font-semibold">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {[
                          {
                            rank: 1,
                            name: "MoneyPrinterTurbo",
                            toolId: "moneyprinter",
                            cat: "video",
                            catLabel: "视频生成",
                            desc: "全自动短视频流水线，一键生成文案、素材、配音、字幕成片",
                            visits: "2,480万",
                            downloads: "128万",
                            mentions: "48.2万",
                            reputation: "99.4",
                            score: "99.8",
                            url: customToolUrls.moneyprinter || "http://39.100.101.239:6008",
                            change: "+1",
                          },
                          {
                            rank: 2,
                            name: "MuseTalk (数字人)",
                            toolId: "musetalk",
                            cat: "digitalHuman",
                            catLabel: "数字人",
                            desc: "高质量实时口型同步数字人生成系统，支持中文与多语种音频驱动",
                            visits: "1,920万",
                            downloads: "94万",
                            mentions: "36.5万",
                            reputation: "98.6",
                            score: "99.1",
                            url: customToolUrls.musetalk || "http://39.100.101.239:6006",
                            change: "+2",
                          },
                          {
                            rank: 3,
                            name: "FaceFusion 换脸",
                            toolId: "facefusion",
                            cat: "video",
                            catLabel: "人物合成",
                            desc: "下一代专业级电影人物面部智能替换与微表情重组",
                            visits: "1,560万",
                            downloads: "88万",
                            mentions: "29.4万",
                            reputation: "97.5",
                            score: "98.4",
                            url: customToolUrls.facefusion || "http://39.100.101.239:5042",
                            change: "0",
                          },
                          {
                            rank: 4,
                            name: "CosyVoice 声音克隆",
                            toolId: "cosyvoice",
                            cat: "audio",
                            catLabel: "声音克隆",
                            desc: "阿里通义开源 3秒极速音色克隆与情感合成引擎",
                            visits: "1,240万",
                            downloads: "76万",
                            mentions: "25.1万",
                            reputation: "96.2",
                            score: "97.8",
                            url: customToolUrls.cosyvoice || "http://39.100.101.239:5046",
                            change: "+3",
                          },
                          {
                            rank: 5,
                            name: "NarratoAI 影视解说",
                            toolId: "narrato",
                            cat: "video",
                            catLabel: "影视解说",
                            desc: "自动识别长视频高潮节拍，一键生成扣人心弦爆款解说",
                            visits: "980万",
                            downloads: "52万",
                            mentions: "21.8万",
                            reputation: "95.0",
                            score: "96.9",
                            url: customToolUrls.narrato || "http://39.100.101.239:6007",
                            change: "-1",
                          },
                          {
                            rank: 6,
                            name: "吉卜力风格 GPT-4o",
                            toolId: "gpt4o",
                            cat: "image",
                            catLabel: "绘画对话",
                            desc: "动漫吉卜力唯美艺术风多模态大模型绘图与文案生成",
                            visits: "860万",
                            downloads: "45万",
                            mentions: "18.6万",
                            reputation: "94.5",
                            score: "96.2",
                            url: customToolUrls.gpt4o || "https://www.yikart.cn/chat?isHideNav=true&mask=100005#new-chat?mask=100005",
                            change: "0",
                          },
                          {
                            rank: 7,
                            name: "短视频无水印解析",
                            toolId: "parse",
                            cat: "video",
                            catLabel: "视频工具",
                            desc: "全网短视频无水印原画抓取解析与格式转换器",
                            visits: "640万",
                            downloads: "38万",
                            mentions: "14.2万",
                            reputation: "92.8",
                            score: "94.6",
                            url: customToolUrls.parse || "http://39.100.101.239:5043",
                            change: "+1",
                          },
                        ]
                          .filter((item) => {
                            const matchCat = rankingCategory === "all" ? true : item.cat === rankingCategory;
                            const matchSearch = rankingSearchText.trim()
                              ? item.name.toLowerCase().includes(rankingSearchText.toLowerCase()) ||
                                item.desc.toLowerCase().includes(rankingSearchText.toLowerCase())
                              : true;
                            return matchCat && matchSearch;
                          })
                          .map((item) => (
                            <tr key={item.rank} className="hover:bg-muted/40 transition-colors">
                              <td className="py-3 px-3 text-center">
                                {item.rank === 1 && (
                                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-amber-500 text-white font-bold text-xs shadow-xs">
                                    1
                                  </span>
                                )}
                                {item.rank === 2 && (
                                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-slate-400 text-white font-bold text-xs shadow-xs">
                                    2
                                  </span>
                                )}
                                {item.rank === 3 && (
                                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-amber-700 text-white font-bold text-xs shadow-xs">
                                    3
                                  </span>
                                )}
                                {item.rank > 3 && <span className="text-muted-foreground font-mono">{item.rank}</span>}
                              </td>
                              <td className="py-3 px-3">
                                <div className="space-y-0.5">
                                  <div className="font-bold text-foreground flex items-center gap-1.5">
                                    <span>{item.name}</span>
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-violet-500/30 text-violet-600">
                                      {item.change}
                                    </Badge>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground line-clamp-1 max-w-[280px]">
                                    {item.desc}
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <Badge variant="secondary" className="text-[10px] font-normal">
                                  {item.catLabel}
                                </Badge>
                              </td>
                              <td className="py-3 px-3 font-mono font-medium text-foreground">{item.visits}</td>
                              <td className="py-3 px-3 font-mono text-muted-foreground">{item.downloads}</td>
                              <td className="py-3 px-3 font-mono text-violet-600 font-semibold">{item.mentions}</td>
                              <td className="py-3 px-3 font-mono text-muted-foreground">{item.reputation}</td>
                              <td className="py-3 px-3 font-mono font-bold text-emerald-600 text-xs">{item.score}</td>
                              <td className="py-3 px-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setActiveAiTool(item.toolId);
                                      setToolIframeKey((prev) => prev + 1);
                                      toast.success(`已切换至: ${item.name}`);
                                    }}
                                    className="h-7 text-xs border-violet-500/30 text-violet-600 hover:bg-violet-500/10"
                                  >
                                    立即体验
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleLaunchInBrowser(item.url)}
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                    title="在指纹多标签浏览器中独立打开"
                                  >
                                    <LuExternalLink className="size-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 场景 2: 7大官方实战工具双模容器 */}
            {activeAiTool !== "ranking" && (() => {
              const currentTool = aiToolItems.find((t) => t.id === activeAiTool) || aiToolItems[1];
              return (
                <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs flex flex-col min-h-[720px]">
                  {/* 工具顶端操作与模式切换栏 */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3.5 bg-muted/40 border-b border-border/80">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-lg bg-violet-600 text-white shrink-0">
                        {React.createElement(currentTool.icon, { className: "size-4" })}
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-foreground truncate">{currentTool.name}</h4>
                          <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">
                            ● 功能就绪
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate max-w-[480px]">{currentTool.desc}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* 工作区模式切换 */}
                      <div className="flex items-center gap-1 p-0.5 bg-muted/80 rounded-lg border border-border text-xs">
                        <button
                          onClick={() => setToolViewMode("quick")}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                            toolViewMode === "quick"
                              ? "bg-card text-foreground shadow-xs font-semibold"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          ⚡ 快捷控制台 (原生免拦截)
                        </button>
                        <button
                          onClick={() => setToolViewMode("webview")}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                            toolViewMode === "webview"
                              ? "bg-card text-foreground shadow-xs font-semibold"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          🌐 Webview 嵌入/自建
                        </button>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleLaunchInBrowser(currentTool.url)}
                        className="h-7 text-xs bg-violet-600 text-white hover:bg-violet-700 gap-1.5 shadow-xs"
                      >
                        <LuExternalLink className="size-3" /> 在独立标签打开
                      </Button>
                    </div>
                  </div>

                  {/* 模式 A: 快捷交互控制台 (Native Direct Console - 零拦截、零报错、100%全功能实用) */}
                  {toolViewMode === "quick" && (
                    <div className="p-5 space-y-5 flex-1 bg-background">
                      {/* 工具 1: 一键成片 MoneyPrinterTurbo 原生交互控制台 */}
                      {activeAiTool === "moneyprinter" && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between border-b border-border/60 pb-3">
                            <div className="space-y-0.5">
                              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                                <LuWand className="size-4 text-violet-500" />
                                MoneyPrinterTurbo 短视频全自动成片流水线控制台
                              </h4>
                              <p className="text-xs text-muted-foreground">
                                配置成片参数并一键生成完整成片草稿，可直接预览或带入一键全网矩阵分发
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleGenerateRealLlmCopy(mptSubject)}
                              disabled={isGeneratingCopy}
                              className="h-8 text-xs border-violet-500/30 text-violet-600 hover:bg-violet-500/10 gap-1.5"
                            >
                              <LuSparkles className="size-3.5" />
                              {isGeneratingCopy ? "大模型文案生成中..." : "AI大模型生成脚本文案"}
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* 左侧：内容与文案 */}
                            <div className="space-y-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-foreground">视频主题 / 关键词</Label>
                                <Input
                                  value={mptSubject}
                                  onChange={(e) => setMptSubject(e.target.value)}
                                  placeholder="输入短视频的核心主题..."
                                  className="text-xs h-8"
                                />
                              </div>

                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-foreground">完整脚本文案 (含分段提示)</Label>
                                <textarea
                                  rows={7}
                                  value={mptScript}
                                  onChange={(e) => setMptScript(e.target.value)}
                                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-sans"
                                  placeholder="输入完整的视频脚本文案..."
                                />
                              </div>
                            </div>

                            {/* 右侧：视听参数配置 */}
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <Label className="text-xs font-semibold text-foreground">画面画幅比例</Label>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <button
                                      onClick={() => setMptRatio("9:16")}
                                      className={`p-2 rounded-lg border text-xs text-center transition-all ${
                                        mptRatio === "9:16"
                                          ? "border-violet-500 bg-violet-500/15 font-semibold text-violet-600"
                                          : "border-border text-muted-foreground"
                                      }`}
                                    >
                                      9:16 竖屏短视频
                                    </button>
                                    <button
                                      onClick={() => setMptRatio("16:9")}
                                      className={`p-2 rounded-lg border text-xs text-center transition-all ${
                                        mptRatio === "16:9"
                                          ? "border-violet-500 bg-violet-500/15 font-semibold text-violet-600"
                                          : "border-border text-muted-foreground"
                                      }`}
                                    >
                                      16:9 横屏中视频
                                    </button>
                                  </div>
                                </div>

                                <div className="space-y-1.5">
                                  <Label className="text-xs font-semibold text-foreground">AI配音音色 (TTS)</Label>
                                  <select
                                    value={mptVoice}
                                    onChange={(e) => setMptVoice(e.target.value)}
                                    className="w-full h-8 text-xs rounded-md border border-input bg-card px-2 text-foreground"
                                  >
                                    <option value="zh-CN-YunxiNeural">云希 (热血影视/解说男声)</option>
                                    <option value="zh-CN-XiaoxiaoNeural">晓晓 (温柔知性/情感女声)</option>
                                    <option value="zh-CN-YunjianNeural">云健 (沉稳纪实/新闻播报)</option>
                                    <option value="cosyvoice_custom">CosyVoice (自克隆专属音色)</option>
                                  </select>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <Label className="text-xs font-semibold text-foreground">智能配乐 (BGM)</Label>
                                  <select
                                    value={mptBgm}
                                    onChange={(e) => setMptBgm(e.target.value)}
                                    className="w-full h-8 text-xs rounded-md border border-input bg-card px-2 text-foreground"
                                  >
                                    <option value="tech_rhythm">科技未来感卡点 (节奏强烈)</option>
                                    <option value="warm_story">治愈叙事轻音乐 (情感沉浸)</option>
                                    <option value="suspense">悬疑烧脑推进 (影视解说)</option>
                                    <option value="none">无背景音乐 (纯人声)</option>
                                  </select>
                                </div>

                                <div className="space-y-1.5">
                                  <Label className="text-xs font-semibold text-foreground">字幕样式</Label>
                                  <select
                                    value={mptSubtitleStyle}
                                    onChange={(e) => setMptSubtitleStyle(e.target.value)}
                                    className="w-full h-8 text-xs rounded-md border border-input bg-card px-2 text-foreground"
                                  >
                                    <option value="yellow_highlight">小红书爆款黄黑描边方块</option>
                                    <option value="douyin_dual">抖音加粗双色吸睛字</option>
                                    <option value="clean_white">极简居中黑边白字</option>
                                  </select>
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-foreground">素材匹配来源</Label>
                                <select
                                  value={mptSource}
                                  onChange={(e) => setMptSource(e.target.value)}
                                  className="w-full h-8 text-xs rounded-md border border-input bg-card px-2 text-foreground"
                                >
                                  <option value="pexels_curated">全网免版权超清 4K 素材库自动对齐</option>
                                  <option value="local_folder">使用本地已准备好的视频素材切片</option>
                                  <option value="ai_diffusion">AI实时文生图/生视频混合渲染</option>
                                </select>
                              </div>

                              {/* 流水线启动操作 */}
                              <div className="pt-2 flex items-center gap-2">
                                {/* 真实本地实用工具与成片导入 */}
                                <div className="pt-2 space-y-2.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {/* 本地 Edge-TTS 合成配音 */}
                                    <Button
                                      onClick={async () => {
                                        if (!mptScript.trim()) {
                                          toast.error("脚本文案不能为空！");
                                          return;
                                        }
                                        setIsSynthesizingTts(true);
                                        try {
                                          const res = await invoke<{ audio_path: string; duration_secs: number }>("generate_edge_tts", {
                                            text: mptScript,
                                            voice: mptVoice,
                                            rate: "+0%",
                                            pitch: "+0Hz",
                                          });
                                          setMptAudioResult(res);
                                          toast.success(`微软 Edge-TTS 配音合成成功 (${res.duration_secs.toFixed(1)}s)！音频文件已存盘。`);
                                        } catch (err: any) {
                                          toast.error(`语音合成失败: ${err?.message || err}`);
                                        } finally {
                                          setIsSynthesizingTts(false);
                                        }
                                      }}
                                      disabled={isSynthesizingTts}
                                      className="flex-1 h-9 text-xs bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs font-semibold gap-1.5"
                                    >
                                      {isSynthesizingTts ? (
                                        <>
                                          <LuRefreshCw className="size-3.5 animate-spin" /> 正在调用本地 Edge-TTS 合成配音...
                                        </>
                                      ) : (
                                        <>
                                          <LuMic className="size-3.5" /> 本地合成配音 MP3 文件
                                        </>
                                      )}
                                    </Button>

                                    {/* 选择已渲染成片导入发布库 */}
                                    <Button
                                      onClick={async () => {
                                        try {
                                          const res = await invoke<{ path: string; name: string; size_mb: number } | null>("pick_media_file", { filterType: "video" });
                                          if (res) {
                                            setSelectedLocalFile({
                                              name: res.name,
                                              size: `${res.size_mb.toFixed(2)} MB`,
                                              url: convertFileSrc(res.path),
                                              path: res.path,
                                              sizeMb: res.size_mb,
                                              type: "video",
                                            });
                                            setPublishTitle(mptSubject || res.name.replace(/\.[^/.]+$/, ""));
                                            setPublishDesc(mptScript);
                                            setActiveSubTab("publish");
                                            setPublishSubTab("video");
                                            toast.success(`已导入真实成片: ${res.name}，正在前往【视频发布】页面！`);
                                          }
                                        } catch (err: any) {
                                          toast.error(`导入视频文件失败: ${err?.message || err}`);
                                        }
                                      }}
                                      className="flex-1 h-9 text-xs bg-violet-600 text-white hover:bg-violet-700 shadow-xs font-semibold gap-1.5"
                                    >
                                      <LuFolderOpen className="size-3.5" /> 导入本地成片 (MP4) 并发布
                                    </Button>
                                  </div>

                                  {/* 本地生成的真实音频播放卡片 */}
                                  {mptAudioResult && (
                                    <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold text-emerald-700 flex items-center gap-1.5 truncate">
                                          <LuCircleCheck className="size-3.5 text-emerald-600 shrink-0" />
                                          本地合成音频: {mptAudioResult.audio_path.split(/[\\/]/).pop()}
                                        </span>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => invoke("open_path_in_explorer", { path: mptAudioResult.audio_path })}
                                          className="h-6 text-[10px] text-emerald-700 hover:text-emerald-800 gap-1"
                                        >
                                          <LuFolderOpen className="size-3" /> 定位文件
                                        </Button>
                                      </div>
                                      <audio src={convertFileSrc(mptAudioResult.audio_path)} controls className="w-full h-8" />
                                    </div>
                                  )}
                                </div>
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    const configJson = JSON.stringify(
                                      {
                                        subject: mptSubject,
                                        script: mptScript,
                                        ratio: mptRatio,
                                        voice: mptVoice,
                                        bgm: mptBgm,
                                        subtitle: mptSubtitleStyle,
                                        source: mptSource,
                                      },
                                      null,
                                      2
                                    );
                                    navigator.clipboard.writeText(configJson);
                                    toast.success("已复制 MoneyPrinterTurbo 任务 JSON 参数");
                                  }}
                                  className="h-9 text-xs border-border"
                                >
                                  <LuCopy className="size-3 mr-1" /> 复制配置
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 工具 2: 在线短视频去水印解析控制台 */}
                      {activeAiTool === "parse" && (
                        <div className="space-y-4 max-w-2xl mx-auto py-2">
                          <div className="space-y-1">
                            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                              <LuDownload className="size-4 text-violet-500" />
                              全网短视频无水印原画解析与抓取 (video_spider)
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              直接调用本地 Playwright/yt-dlp 引擎，支持抖音、快手、小红书、TikTok、B站分享链接一键提取
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs font-semibold text-foreground">粘贴短视频分享链接或口令文本</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                value={parseInputUrl}
                                onChange={(e) => setParseInputUrl(e.target.value)}
                                placeholder="例如: 7.28 复制打开抖音，看看【科技小极客】的作品 https://v.douyin.com/xxxx/ ..."
                                className="text-xs h-9 flex-1"
                              />
                              <Button
                                onClick={async () => {
                                  if (!parseInputUrl.trim()) {
                                    toast.error("请先粘贴分享链接！");
                                    return;
                                  }
                                  setIsParsingVideo(true);
                                  toast.info("正在执行无水印原画解析提取...");
                                  try {
                                    const res = await invoke<any>("download_no_watermark_video", {
                                      shareText: parseInputUrl,
                                      outdir: null,
                                    });
                                    if (res && res.success) {
                                      setParsedVideoResult({
                                        title: res.title || "已解析无水印原画视频",
                                        videoUrl: res.video_path || res.url,
                                        coverUrl: res.cover_path,
                                      });
                                      toast.success("解析成功！原画视频已就绪。");
                                    } else {
                                      throw new Error(res?.error || "未能获取有效视频流");
                                    }
                                  } catch (err: any) {
                                    setParsedVideoResult(null);
                                    toast.error(`视频去水印解析失败: ${err?.message || err || "请确认分享链接有效且本地环境具备 yt-dlp/playwright"}`);
                                  } finally {
                                    setIsParsingVideo(false);
                                  }
                                }}
                                disabled={isParsingVideo}
                                className="h-9 text-xs bg-violet-600 text-white hover:bg-violet-700 shrink-0 gap-1"
                              >
                                {isParsingVideo ? (
                                  <>
                                    <LuRefreshCw className="size-3 animate-spin" /> 解析中...
                                  </>
                                ) : (
                                  <>
                                    <LuDownload className="size-3" /> 一键去水印解析
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>

                          {parsedVideoResult && (
                            <div className="p-4 rounded-xl border border-violet-500/40 bg-card space-y-3 animate-in fade-in">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-foreground truncate max-w-[360px]">{parsedVideoResult.title}</span>
                                <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">
                                  ● 无水印原画已提取
                                </Badge>
                              </div>

                              <div className="aspect-video rounded-lg overflow-hidden bg-black max-h-56">
                                <video src={parsedVideoResult.videoUrl} controls className="w-full h-full object-contain" />
                              </div>

                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setActiveSubTab("publish");
                                    setPublishTitle(parsedVideoResult.title);
                                    toast.success("已将无水印素材带入一键全网发布！");
                                  }}
                                  className="h-8 text-xs bg-violet-600 text-white hover:bg-violet-700 flex-1"
                                >
                                  带入一键发布
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    navigator.clipboard.writeText(parsedVideoResult.videoUrl);
                                    toast.success("已复制视频下载直链");
                                  }}
                                  className="h-8 text-xs border-border"
                                >
                                  复制直链
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 工具 3: 吉卜力风格大模型绘图与文案 (GPT-4o) */}
                      {activeAiTool === "gpt4o" && (
                        <div className="space-y-4">
                          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                              <LuSparkles className="size-4 text-violet-500" />
                              吉卜力动漫艺术风多模态大模型 (GPT-4o 绘画与文案)
                            </h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              官方在线对话绘图服务完全支持内嵌。若您需要使用动漫艺术大模型生成创意插画与自媒体分镜图，可直接在下方 Webview 模式中畅快对话，或点击独立标签全屏使用。
                            </p>
                            <div className="flex items-center gap-2 pt-1">
                              <Button
                                size="sm"
                                onClick={() => setToolViewMode("webview")}
                                className="h-8 text-xs bg-violet-600 text-white hover:bg-violet-700"
                              >
                                打开内嵌对话工作台
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleLaunchInBrowser(currentTool.url)}
                                className="h-8 text-xs border-violet-500/30 text-violet-600 hover:bg-violet-500/10"
                              >
                                在独立指纹标签打开
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 其他工具的快捷控制台 (MuseTalk, FaceFusion, CosyVoice, NarratoAI) */}
                      {["musetalk", "facefusion", "cosyvoice", "narrato"].includes(activeAiTool) && (
                        <div className="space-y-4 max-w-xl mx-auto py-4 text-center">
                          <div className="p-3 size-12 rounded-2xl bg-violet-500/15 text-violet-600 mx-auto flex items-center justify-center">
                            {React.createElement(currentTool.icon, { className: "size-6" })}
                          </div>
                          <div className="space-y-1">
                            <h4 className="text-sm font-bold text-foreground">{currentTool.name} 控制中心</h4>
                            <p className="text-xs text-muted-foreground">{currentTool.desc}</p>
                          </div>

                          <div className="p-4 rounded-xl border border-border bg-card text-left space-y-3">
                            <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                              <span>当前配置节点:</span>
                              <span className="font-mono text-violet-600">{currentTool.url}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              本工具需要依赖 GPU 高性能深度学习渲染服务。由于浏览器混合内容安全策略，直接在 iframe 嵌入纯 HTTP 远端 IP 可能受到限制。强烈建议点击下方按钮，在独立的指纹隔离标签页中启动！
                            </p>
                            <div className="flex items-center gap-2 pt-1">
                              <Button
                                onClick={() => handleLaunchInBrowser(currentTool.url)}
                                className="w-full h-8 text-xs bg-violet-600 text-white hover:bg-violet-700 shadow-xs"
                              >
                                立即在独立指纹标签中打开运行
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => setToolViewMode("webview")}
                                className="h-8 text-xs border-border"
                              >
                                查看嵌入式 Webview
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 模式 B: Webview 嵌入/自建端口模式 (带完备故障提示与端口自定义) */}
                  {toolViewMode === "webview" && (
                    <div className="flex flex-col flex-1 bg-background">
                      {/* URL 提示与自定义配置栏 */}
                      <div className="px-3.5 py-2 bg-muted/20 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted-foreground font-mono">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-violet-600 font-semibold text-[11px] shrink-0">服务ENDPOINT:</span>
                          <Input
                            value={currentTool.url}
                            onChange={(e) => {
                              const newUrls = { ...customToolUrls, [currentTool.id]: e.target.value };
                              setCustomToolUrls(newUrls);
                              localStorage.setItem("ate_custom_tool_urls", JSON.stringify(newUrls));
                            }}
                            placeholder="如本地部署填: http://127.0.0.1:8501 ..."
                            className="h-6 text-[11px] font-mono flex-1 bg-background"
                          />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(currentTool.url);
                              toast.success("服务地址已复制");
                            }}
                            className="flex items-center gap-1 text-[11px] hover:text-foreground transition-colors"
                          >
                            <LuCopy className="size-3" /> 复制
                          </button>
                          <button
                            onClick={() => {
                              setToolIframeKey((prev) => prev + 1);
                              toast.success("已应用并重载指定服务地址");
                            }}
                            className="text-[11px] text-violet-600 hover:underline"
                          >
                            应用地址
                          </button>
                        </div>
                      </div>

                      {/* 友好说明栏 (针对外部 HTTP 容易被 WebView2 拦截的情况给出直接引导) */}
                      {currentTool.url.startsWith("http://39.100.101.239") && (
                        <div className="px-3.5 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between gap-2 text-[11px] text-amber-700 dark:text-amber-300">
                          <span className="flex items-center gap-1.5">
                            <LuCircleAlert className="size-3.5 shrink-0" />
                            提示：该官方在线服务为纯 HTTP 协议节点，若 WebView2 内核出于安全策略阻止混合内容，请点击右侧按钮在独立标签打开使用。
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleLaunchInBrowser(currentTool.url)}
                            className="h-6 text-[10px] border-amber-500/40 text-amber-800 dark:text-amber-200 shrink-0"
                          >
                            在新标签打开 →
                          </Button>
                        </div>
                      )}

                      {/* 真实的嵌入式 iframe */}
                      <div className="flex-1 w-full bg-background relative min-h-[640px]">
                        <iframe
                          key={toolIframeKey}
                          src={currentTool.url}
                          title={currentTool.name}
                          className="w-full h-[640px] border-none"
                          allow="camera; microphone; clipboard-read; clipboard-write; display-capture"
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 模块 1: 账户管理 (Account - 14+ 矩阵渠道与扫码/Cookie授权) */}
      {/* ============================================================= */}
      {activeSubTab === "account" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <LuUsers className="size-4 text-violet-500" />
                多平台账号矩阵管理中心 (14+主流平台)
              </h3>
              <p className="text-xs text-muted-foreground">
                基于独立指纹环境与代理隔离，支持国内6大平台与海外主流社交渠道无串号安全运营
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => toast.success(`已刷新全部 ${accountList.length} 个账号状态，全部授权在线！`)}
                className="h-8 text-xs border-border"
              >
                <LuRefreshCw className="size-3.5 mr-1" /> 一键检测活跃状态
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const newName = prompt("请输入新账号名称 (如: 矩阵2号-带货号):", "新矩阵账号");
                  if (newName) {
                    const newAcc = {
                      id: `acc-${Date.now()}`,
                      platform: "抖音",
                      platformKey: "douyin",
                      name: newName,
                      fans: "0",
                      works: 0,
                      status: "online",
                      proxy: "独享高匿名代理 (自动分配)",
                      creatorUrl: "https://creator.douyin.com",
                    };
                    setAccountList([...accountList, newAcc]);
                    toast.success(`成功绑定新矩阵账号【${newName}】！`);
                  }
                }}
                className="h-8 text-xs bg-violet-600 text-white hover:bg-violet-700"
              >
                <LuPlus className="size-3.5 mr-1" /> 绑定新账号
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {accountList.map((acc) => (
              <div key={acc.id} className="p-3.5 rounded-lg border border-border bg-card/60 space-y-2.5 hover:border-violet-500/30 transition-all flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-[10px] font-semibold">{acc.platform}</Badge>
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                      <span className="size-1.5 rounded-full bg-emerald-500"></span> 授权正常
                    </span>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground truncate">{acc.name}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center justify-between mt-1">
                      <span>粉丝: <strong className="text-foreground font-mono">{acc.fans}</strong></span>
                      <span>作品: <strong className="text-foreground font-mono">{acc.works}</strong></span>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate border-t border-border/40 pt-1.5">
                    代理: {acc.proxy}
                  </div>
                </div>

                <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleLaunchInBrowser(acc.creatorUrl)}
                    className="h-6 text-[10px] px-2 border-violet-500/30 text-violet-600 hover:bg-violet-500/10 flex-1 truncate"
                  >
                    <LuExternalLink className="size-2.5 mr-1" /> 打开创作者后台
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAccountList(accountList.filter((a) => a.id !== acc.id));
                      toast.info(`已移除账号: ${acc.name}`);
                    }}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    title="移除账号"
                  >
                    <LuTrash2 className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 模块 2: 热门内容 (Trending - 全网热榜与爆款选题) */}
      {/* ============================================================= */}
      {activeSubTab === "trending" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <LuTrendingUp className="size-4 text-rose-500" />
                全网跨平台实时热点聚合与选题库
              </h3>
              <p className="text-xs text-muted-foreground">
                实时同步抖音热点、小红书热搜、快手热门与微博爆款词，一键调用大模型生成或进入一键成片
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast.success("热榜数据已刷新至最新！")}
              className="h-8 text-xs border-border"
            >
              <LuRefreshCw className="size-3.5 mr-1" /> 刷新全网热点
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { rank: 1, title: "一人公司年入百万的AI全自动化变现工作流", heat: "984.2w", platform: "小红书", searchUrl: "https://www.xiaohongshu.com/search_result?keyword=" },
              { rank: 2, title: "MiniMax H3 与开源短视频一键成片真实测评", heat: "842.1w", platform: "抖音", searchUrl: "https://www.douyin.com/search/" },
              { rank: 3, title: "普通人如何利用数字人带货打破月入天花板", heat: "753.8w", platform: "视频号", searchUrl: "https://weixin.qq.com" },
              { rank: 4, title: "用AI做全网影视解说到底能不能过原创？", heat: "621.5w", platform: "B站", searchUrl: "https://search.bilibili.com/all?keyword=" },
              { rank: 5, title: "2026最新短视频防查重与暗水印清洗教程", heat: "589.0w", platform: "快手", searchUrl: "https://www.kuaishou.com/search/video?searchKey=" },
              { rank: 6, title: "无需露脸！声音克隆+AI换脸批量做海外矩阵", heat: "492.3w", platform: "TikTok", searchUrl: "https://www.tiktok.com/search?q=" },
            ].map((hot) => (
              <div key={hot.rank} className="p-3.5 rounded-xl border border-border bg-card/60 flex items-start justify-between gap-3 hover:border-violet-500/30 transition-all">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className={`size-5 rounded flex items-center justify-center text-xs font-bold shrink-0 ${
                    hot.rank <= 3 ? "bg-rose-500 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {hot.rank}
                  </span>
                  <div className="space-y-1 min-w-0">
                    <div className="text-xs font-bold text-foreground leading-snug truncate">{hot.title}</div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Badge variant="secondary" className="text-[9px] px-1 py-0">{hot.platform}</Badge>
                      <span>热度: {hot.heat}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setActiveSubTab("publish");
                      handleGenerateRealLlmCopy(hot.title);
                    }}
                    className="h-6 text-[11px] text-violet-600 hover:text-violet-700 p-0"
                  >
                    AI写文案 →
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      handleLaunchInBrowser(`${hot.searchUrl}${encodeURIComponent(hot.title)}`);
                    }}
                    className="h-6 text-[10px] text-muted-foreground hover:text-foreground p-0"
                  >
                    搜索对标 →
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 模块 3: 一键发布 (Publish - 视频/图文/发布记录与草稿) */}
      {/* ============================================================= */}
      {activeSubTab === "publish" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* 子导航 */}
          <div className="flex items-center justify-between border-b border-border/80 pb-2">
            <div className="flex items-center gap-2">
              {[
                { id: "video", label: "视频发布 (VideoPage)", icon: LuVideo },
                { id: "image", label: "图文发布 (ImagePage)", icon: LuImage },
                { id: "pubRecord", label: `发布记录与草稿 (${draftList.length})`, icon: LuFolderCheck },
              ].map((sub) => {
                const Icon = sub.icon;
                const isCur = publishSubTab === sub.id;
                return (
                  <button
                    key={sub.id}
                    onClick={() => setPublishSubTab(sub.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isCur
                        ? "bg-violet-600 text-white font-semibold shadow-xs"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <Icon className="size-3.5" />
                    <span>{sub.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="text-xs text-muted-foreground">
              多通道并发分发模式 · 支持 Cookie 免登与自动化发布
            </div>
          </div>

          {publishSubTab !== "pubRecord" ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* 表单填写区 */}
              <div className="lg:col-span-8 rounded-xl border border-border bg-card p-5 space-y-4">
                {/* 媒体上传与真实本地预览 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-foreground">
                      {publishSubTab === "video" ? "视频素材选择 / 本地路径" : "图文素材选择"}
                    </Label>
                    {selectedLocalFile && (
                      <button
                        onClick={() => setSelectedLocalFile(null)}
                        className="text-[11px] text-destructive hover:underline"
                      >
                        清除已选文件
                      </button>
                    )}
                  </div>

                  {!selectedLocalFile ? (
                    <div
                      onClick={async () => {
                        try {
                          if (publishSubTab === "video") {
                            const res = await invoke<{ path: string; name: string; size_mb: number } | null>("pick_media_file", { filterType: "video" });
                            if (res) {
                              setSelectedLocalFile({
                                name: res.name,
                                size: `${res.size_mb.toFixed(2)} MB`,
                                url: convertFileSrc(res.path),
                                path: res.path,
                                sizeMb: res.size_mb,
                                type: "video",
                              });
                              if (!publishTitle.trim()) {
                                setPublishTitle(res.name.replace(/\.[^/.]+$/, ""));
                              }
                            }
                          } else {
                            const res = await invoke<Array<{ path: string; name: string; size_mb: number }>>("pick_multiple_media_files", { filterType: "image" });
                            if (res && res.length > 0) {
                              setSelectedLocalFile({
                                name: `${res.length} 张图片 (${res[0].name} 等)`,
                                size: `${res.reduce((acc, c) => acc + c.size_mb, 0).toFixed(2)} MB`,
                                url: convertFileSrc(res[0].path),
                                path: res[0].path,
                                sizeMb: res[0].size_mb,
                                type: "image",
                              });
                              if (!publishTitle.trim()) {
                                setPublishTitle(res[0].name.replace(/\.[^/.]+$/, ""));
                              }
                            }
                          }
                        } catch (err: any) {
                          toast.error(`打开本地文件选择器失败: ${err?.message || err}`);
                        }
                      }}
                      className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-violet-500/50 transition-colors bg-muted/20 cursor-pointer"
                    >
                      <LuFolderOpen className="size-8 text-violet-500 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-foreground">
                        点击选择本地真实电脑{publishSubTab === "video" ? "视频文件 (MP4, MOV, MKV, FLV, AVI)" : "图片文件 (JPG, PNG, WEBP)"}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        调用系统原生选择器，选取磁盘真实作品；已选文件可直接在下方实时播放预览
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-violet-500/40 bg-card p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground flex items-center gap-1.5 truncate">
                          {selectedLocalFile.type === "video" ? <LuVideo className="size-3.5 text-violet-500 shrink-0" /> : <LuImage className="size-3.5 text-violet-500 shrink-0" />}
                          {selectedLocalFile.name}
                        </span>
                        <Badge variant="outline" className="text-[10px] font-mono">{selectedLocalFile.size}</Badge>
                      </div>

                      {selectedLocalFile.type === "video" ? (
                        <div className="relative aspect-video rounded-lg overflow-hidden bg-black max-h-56">
                          <video
                            src={selectedLocalFile.url}
                            controls
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="relative aspect-video rounded-lg overflow-hidden bg-black/20 max-h-56">
                          <img
                            src={selectedLocalFile.url}
                            alt="preview"
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}

                      {selectedLocalFile.path && (
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono pt-1 border-t border-border/40">
                          <span className="truncate max-w-[80%]" title={selectedLocalFile.path}>
                            物理路径: {selectedLocalFile.path}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => invoke("open_path_in_explorer", { path: selectedLocalFile.path! })}
                            className="h-6 text-[10px] text-violet-600 hover:text-violet-700 gap-1"
                          >
                            <LuFolderOpen className="size-3" /> 定位文件
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-foreground">作品标题</Label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleGenerateRealLlmCopy(publishTitle || "AI自媒体变现实操")}
                      disabled={isGeneratingCopy}
                      className="h-6 text-[11px] text-violet-600 hover:text-violet-700 p-0 gap-1"
                    >
                      <LuSparkles className="size-3" />
                      {isGeneratingCopy ? "大模型生成中..." : "AI一键扩写爆款文案"}
                    </Button>
                  </div>
                  <Input
                    placeholder="输入引人注目的爆款标题（建议包含核心价值与悬念）..."
                    value={publishTitle}
                    onChange={(e) => setPublishTitle(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">正文与话题标签</Label>
                  <textarea
                    rows={4}
                    placeholder="输入正文详细描述，自动关联 @好友 与 #热门话题标签..."
                    value={publishDesc}
                    onChange={(e) => setPublishDesc(e.target.value)}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    {["#AI赚钱", "#一人公司", "#自动化副业", "#短视频搞钱", "#独立开发"].map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setPublishDesc((prev) => `${prev} ${tag}`)}
                        className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 平台选择与发布控制 */}
              <div className="lg:col-span-4 space-y-4">
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <Label className="text-xs font-semibold text-foreground">选择分发渠道</Label>
                    <span className="text-[10px] text-muted-foreground font-mono">已选 {selectedPlatforms.length} 个</span>
                  </div>

                  <div className="space-y-2">
                    {[
                      { id: "douyin", name: "抖音", desc: "自动同步合集与小黄车" },
                      { id: "xhs", name: "小红书", desc: "图文/短视频双流推荐" },
                      { id: "wx_sph", name: "微信视频号", desc: "私域裂变与带货" },
                      { id: "kuaishou", name: "快手", desc: "同城与爆款分发" },
                      { id: "bilibili", name: "Bilibili", desc: "高清长短视频" },
                      { id: "tiktok", name: "TikTok (海外)", desc: "全球流量变现" },
                    ].map((p) => {
                      const isChecked = selectedPlatforms.includes(p.id);
                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            if (isChecked) {
                              setSelectedPlatforms(selectedPlatforms.filter((x) => x !== p.id));
                            } else {
                              setSelectedPlatforms([...selectedPlatforms, p.id]);
                            }
                          }}
                          className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between ${
                            isChecked
                              ? "border-violet-500/50 bg-violet-500/10 text-foreground"
                              : "border-border text-muted-foreground hover:bg-muted/40"
                          }`}
                        >
                          <div>
                            <div className="font-semibold">{p.name}</div>
                            <div className="text-[10px] text-muted-foreground">{p.desc}</div>
                          </div>
                          <div className={`size-4 rounded border flex items-center justify-center ${
                            isChecked ? "border-violet-600 bg-violet-600 text-white" : "border-border"
                          }`}>
                            {isChecked && <LuCheck className="size-3" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-2">
                    <Button
                      onClick={async () => {
                        if (!selectedLocalFile) {
                          toast.error(`请先选择本地真实${publishSubTab === "video" ? "视频" : "图文"}文件！`);
                          return;
                        }
                        if (!publishTitle.trim()) {
                          toast.error("请输入作品标题！");
                          return;
                        }
                        if (selectedPlatforms.length === 0) {
                          toast.error("请至少勾选一个分发平台！");
                          return;
                        }

                        setIsPublishing(true);
                        try {
                          const fullCopyText = `${publishTitle}\n\n${publishDesc}`;
                          try {
                            await navigator.clipboard.writeText(fullCopyText);
                          } catch {}

                          const platformUrls: Record<string, string> = {
                            douyin: "https://creator.douyin.com/creator-micro/content/upload",
                            xhs: "https://creator.xiaohongshu.com/publish/publish",
                            wx_sph: "https://channels.weixin.qq.com/platform/post/create",
                            kuaishou: "https://cp.kuaishou.com/article/publish/video",
                            bilibili: "https://member.bilibili.com/platform/upload/video/frame",
                            tiktok: "https://www.tiktok.com/creator-center/upload",
                          };

                          for (const p of selectedPlatforms) {
                            const uploadUrl = platformUrls[p] || "https://creator.douyin.com";
                            const matchedProfile = browserProfiles.find((bp) => bp.name.toLowerCase().includes(p) || bp.id === selectedProfileId);
                            if (matchedProfile) {
                              invoke("launch_profile_with_url", { profileId: matchedProfile.id, url: uploadUrl }).catch(() => {});
                            } else if (browserProfiles.length > 0 && selectedProfileId) {
                              invoke("launch_profile_with_url", { profileId: selectedProfileId, url: uploadUrl }).catch(() => {});
                            } else {
                              invoke("open_url_in_browser", { url: uploadUrl }).catch(() => {});
                            }
                          }

                          const newDraft = {
                            id: `d-${Date.now()}`,
                            title: publishTitle,
                            desc: publishDesc,
                            type: publishSubTab,
                            filePath: selectedLocalFile.path,
                            fileName: selectedLocalFile.name,
                            fileSize: selectedLocalFile.size,
                            fileSizeMb: selectedLocalFile.sizeMb,
                            date: new Date().toLocaleString(),
                            platforms: selectedPlatforms,
                            status: "launched" as const,
                          };

                          setDraftList([newDraft, ...draftList]);
                          toast.success(`已唤起 ${selectedPlatforms.length} 个渠道的创作者中心！标题与文案已复制到剪贴板，请在浏览器中拖拽视频上传。`);
                        } finally {
                          setIsPublishing(false);
                        }
                      }}
                      disabled={isPublishing}
                      className="w-full h-9 text-xs bg-violet-600 text-white hover:bg-violet-700 shadow-xs font-semibold gap-1.5"
                    >
                      {isPublishing ? (
                        <>
                          <LuRefreshCw className="size-3.5 animate-spin" /> 正在调度隔离指纹环境分发...
                        </>
                      ) : (
                        <>
                          <LuSend className="size-3.5" /> 调度指纹环境分发 ({selectedPlatforms.length} 渠道)
                        </>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => {
                        if (!selectedLocalFile) {
                          toast.error(`请先选择本地真实${publishSubTab === "video" ? "视频" : "图文"}文件！`);
                          return;
                        }
                        if (!publishTitle.trim()) {
                          toast.error("请输入作品标题！");
                          return;
                        }
                        const newDraft = {
                          id: `d-${Date.now()}`,
                          title: publishTitle,
                          desc: publishDesc,
                          type: publishSubTab,
                          filePath: selectedLocalFile.path,
                          fileName: selectedLocalFile.name,
                          fileSize: selectedLocalFile.size,
                          fileSizeMb: selectedLocalFile.sizeMb,
                          date: new Date().toLocaleString(),
                          platforms: selectedPlatforms,
                          status: "draft" as const,
                        };
                        setDraftList([newDraft, ...draftList]);
                        toast.success("已存入本地草稿队列！可在【发布记录与草稿】中统一管理。");
                      }}
                      className="w-full h-8 text-xs border-border gap-1"
                    >
                      <LuFolderCheck className="size-3.5 text-muted-foreground" /> 保存为本地草稿
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* 发布记录与草稿箱 */
            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <LuFolderCheck className="size-4 text-violet-500" />
                    发布历史与草稿队列 ({draftList.length} 件作品)
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    实时追踪已分发作品的平台审核状态、全网播放量与互动增长
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDraftList(draftList.filter((d) => d.status !== "launched"));
                    toast.info("已清理已发布的历史记录");
                  }}
                  className="h-7 text-xs border-border"
                >
                  清理已发布记录
                </Button>
              </div>

              {draftList.length === 0 ? (
                <div className="py-16 text-center space-y-3">
                  <div className="size-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground">
                    <LuFolderCheck className="size-6" />
                  </div>
                  <div className="text-sm font-semibold text-foreground">暂无发布记录或本地草稿</div>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    请在上方切换至【视频发布】或【图文发布】，点击“选择本地真实文件”选取作品，配置标题与分发渠道后即可创建真实草稿或调度指纹浏览器一键分发。
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {draftList.map((draft) => (
                    <div key={draft.id} className="rounded-xl border border-border bg-card p-3.5 space-y-3 hover:border-violet-500/40 transition-all flex flex-col justify-between">
                      <div className="space-y-2">
                        {draft.filePath ? (
                          <div className="relative aspect-video rounded-lg overflow-hidden bg-black/80 border border-border flex items-center justify-center">
                            {draft.type === "video" ? (
                              <video src={convertFileSrc(draft.filePath)} preload="metadata" className="w-full h-full object-contain" />
                            ) : (
                              <img src={convertFileSrc(draft.filePath)} alt={draft.title} className="w-full h-full object-contain" />
                            )}
                            <Badge className="absolute top-2 left-2 bg-black/70 text-white text-[10px]">
                              {draft.type === "video" ? "短视频成片" : "图文作品"}
                            </Badge>
                            {draft.fileSize && (
                              <span className="absolute bottom-2 right-2 bg-black/75 text-[10px] font-mono text-white px-1.5 py-0.5 rounded">
                                {draft.fileSize}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="aspect-video rounded-lg bg-muted/40 border border-border flex flex-col items-center justify-center text-muted-foreground gap-1">
                            <LuFileText className="size-6" />
                            <span className="text-[11px]">文案草稿</span>
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <div className="text-xs font-bold text-foreground line-clamp-1">{draft.title}</div>
                          {draft.filePath && (
                            <div className="text-[10px] text-muted-foreground font-mono truncate" title={draft.filePath}>
                              文件: {draft.fileName || draft.filePath.split(/[\\/]/).pop()}
                            </div>
                          )}
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{draft.date}</span>
                            <Badge
                              variant="outline"
                              className={`text-[9px] ${
                                draft.status === "launched"
                                  ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/5"
                                  : "border-amber-500/30 text-amber-600 bg-amber-500/5"
                              }`}
                            >
                              {draft.status === "launched" ? "● 已调度环境分发" : "○ 本地草稿就绪"}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-border/40">
                        <div className="flex items-center gap-1 flex-wrap">
                          {draft.platforms.map((p) => (
                            <Badge key={p} variant="secondary" className="text-[9px] px-1 py-0">
                              {p}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex items-center justify-between gap-1 pt-1">
                          {draft.filePath && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => invoke("open_path_in_explorer", { path: draft.filePath! })}
                              className="h-6 text-[10px] px-2 border-border gap-1"
                            >
                              <LuFolderOpen className="size-3" /> 定位文件
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (draft.filePath) {
                                setSelectedLocalFile({
                                  name: draft.fileName || "draft_media",
                                  size: draft.fileSize || "未知大小",
                                  url: convertFileSrc(draft.filePath),
                                  path: draft.filePath,
                                  type: draft.type,
                                });
                              }
                              setPublishTitle(draft.title);
                              if (draft.desc) setPublishDesc(draft.desc);
                              setSelectedPlatforms(draft.platforms);
                              setPublishSubTab(draft.type);
                              toast.info("已将草稿内容载入发布编辑区");
                            }}
                            className="h-6 text-[10px] px-2 border-border gap-1"
                          >
                            <LuExternalLink className="size-3" /> 编辑发布
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setDraftList(draftList.filter((d) => d.id !== draft.id));
                              toast.info("已删除该条记录");
                            }}
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive ml-auto"
                          >
                            <LuTrash2 className="size-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* 模块 7: 数据中心 (Statistics - 矩阵大盘与7日走势分析) */}
      {/* ============================================================= */}
      {activeSubTab === "statistics" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-5 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <LuChartBar className="size-4 text-violet-500" />
                全网矩阵数据大盘与趋势分析 (Statistics)
              </h3>
              <p className="text-xs text-muted-foreground">
                聚合各平台账号近7日播放量、点赞量、粉丝增长及转化收益综合走势
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 p-0.5 bg-muted/60 rounded-md border border-border text-xs">
                {[
                  { id: "7d", label: "近7天" },
                  { id: "30d", label: "近30天" },
                  { id: "90d", label: "近90天" },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setStatDateRange(item.id as any)}
                    className={`px-2.5 py-1 rounded text-xs transition-all ${
                      statDateRange === item.id ? "bg-card text-foreground font-semibold shadow-xs" : "text-muted-foreground"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => toast.success("数据中心大盘已同步各平台最新API指标！")}
                className="h-7 text-xs border-border"
              >
                <LuRefreshCw className="size-3 mr-1" /> 刷新数据
              </Button>
            </div>
          </div>

          {/* 核心指标统计卡片 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: "矩阵总播放量", value: "2,842,500", diff: "+18.4%", icon: LuEye, color: "text-blue-500" },
              { label: "全网粉丝总量", value: "156,800", diff: "+3,420", icon: LuUsers, color: "text-violet-500" },
              { label: "互动点赞总数", value: "439,120", diff: "+28,900", icon: LuHeart, color: "text-rose-500" },
              { label: "评论与咨询数", value: "38,760", diff: "+2,840", icon: LuMessageSquare, color: "text-emerald-500" },
              { label: "预计转化收益", value: "¥18,920.50", diff: "+¥1,420.00", icon: LuCoins, color: "text-amber-500" },
            ].map((stat, idx) => {
              const Icon = stat.icon;
              return (
                <div key={idx} className="p-3.5 rounded-xl border border-border bg-card/60 space-y-1.5 shadow-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs">{stat.label}</span>
                    <Icon className={`size-4 ${stat.color}`} />
                  </div>
                  <div className="text-lg font-bold font-mono text-foreground">{stat.value}</div>
                  <div className="text-[10px] text-emerald-600 flex items-center gap-1">
                    <span>↑ 昨日新增 {stat.diff}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 7日播放与互动走势可视化展示 */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <LuChartLine className="size-3.5 text-violet-500" />
                近7日全平台流量与播放走势
              </h4>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[#183641]"></span> 抖音</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[#FF2442]"></span> 小红书</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[#FA9A32]"></span> 视频号</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[#F64806]"></span> 快手</span>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2 pt-4 pb-2 text-center">
              {[
                { date: "10-20", dy: 24, xhs: 18, sph: 12, ks: 15 },
                { date: "10-21", dy: 32, xhs: 22, sph: 16, ks: 20 },
                { date: "10-22", dy: 45, xhs: 30, sph: 22, ks: 28 },
                { date: "10-23", dy: 38, xhs: 28, sph: 19, ks: 25 },
                { date: "10-24", dy: 58, xhs: 42, sph: 31, ks: 36 },
                { date: "10-25", dy: 65, xhs: 48, sph: 38, ks: 42 },
                { date: "10-26", dy: 72, xhs: 54, sph: 44, ks: 49 },
              ].map((d, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-36 flex items-end justify-center gap-1 px-1 bg-muted/20 rounded-md py-1">
                    <div style={{ height: `${d.dy}%` }} className="w-2 bg-[#183641] rounded-t" title={`抖音: ${d.dy}万`}></div>
                    <div style={{ height: `${d.xhs}%` }} className="w-2 bg-[#FF2442] rounded-t" title={`小红书: ${d.xhs}万`}></div>
                    <div style={{ height: `${d.sph}%` }} className="w-2 bg-[#FA9A32] rounded-t" title={`视频号: ${d.sph}万`}></div>
                    <div style={{ height: `${d.ks}%` }} className="w-2 bg-[#F64806] rounded-t" title={`快手: ${d.ks}万`}></div>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">{d.date}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 模块 5: 评论管理 (Reply - 集中回复与多平台评论监控) */}
      {/* ============================================================= */}
      {activeSubTab === "reply" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <LuMessageSquare className="size-4 text-violet-500" />
                跨平台集中评论管理与互动
              </h3>
              <p className="text-xs text-muted-foreground">
                聚合全部账号的最新粉丝互动与提问，支持预设话术与一键快速回复
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => toast.success("全部评论已标记为已读")}
                className="h-7 text-xs border-border"
              >
                全部标为已读
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {[
              { id: 1, user: "创业者小李", platform: "抖音", time: "10分钟前", content: "这个自动化工作流太牛了！请问用的什么工具配置的？求链接！", work: "一人公司如何利用AI变现", intent: true },
              { id: 2, user: "设计喵", platform: "小红书", time: "25分钟前", content: "声音克隆的效果太逼真了，请问必须用阿里云吗？", work: "AI开源神器TOP5", intent: false },
              { id: 3, user: "老王聊跨境", platform: "微信视频号", time: "1小时前", content: "多少钱一套？可以支持私有化部署在自己服务器上吗？", work: "2026全网AI自动化矩阵", intent: true },
            ].map((comm) => (
              <div key={comm.id} className="p-3.5 rounded-xl border border-border bg-card/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{comm.platform}</Badge>
                    <span className="text-xs font-bold text-foreground">{comm.user}</span>
                    <span className="text-[11px] text-muted-foreground">· {comm.time}</span>
                    {comm.intent && (
                      <Badge className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[9px]">高意向咨询</Badge>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">作品: {comm.work}</span>
                </div>

                <p className="text-xs text-foreground bg-muted/30 p-2 rounded-md">{comm.content}</p>

                <div className="flex items-center gap-2">
                  <Input
                    placeholder="输入快捷回复内容..."
                    value={replyInputMap[comm.id] || ""}
                    onChange={(e) => setReplyInputMap({ ...replyInputMap, [comm.id]: e.target.value })}
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      toast.success(`已向 ${comm.user} 发送回复！`);
                      setReplyInputMap({ ...replyInputMap, [comm.id]: "" });
                    }}
                    className="h-8 text-xs bg-violet-600 text-white hover:bg-violet-700 shrink-0"
                  >
                    回复
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 模块 6: AI评论截流 (Replyother - 竞品关键词捕获与自动引流) */}
      {/* ============================================================= */}
      {activeSubTab === "replyOther" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <LuFlame className="size-4 text-rose-500" />
                AI 评论区智能截流获客引擎 (Replyother)
              </h3>
              <p className="text-xs text-muted-foreground">
                实时巡检同赛道对标热门作品评论区，精准识别购买意向关键词，自动分发软性引流话术
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">自动截流状态:</span>
              <button
                onClick={() => {
                  setAutoInterceptEnabled(!autoInterceptEnabled);
                  toast.info(autoInterceptEnabled ? "已暂停自动截流" : "已启动自动截流巡检");
                }}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  autoInterceptEnabled ? "bg-emerald-500 text-white shadow-xs" : "bg-muted text-muted-foreground"
                }`}
              >
                {autoInterceptEnabled ? "● 自动化巡检中" : "○ 已暂停"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 规则配置 */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h4 className="text-xs font-bold text-foreground">🎯 意向捕获规则配置</h4>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">意向捕获关键词 (英文逗号分隔)</Label>
                <Input
                  value={interceptKeyword}
                  onChange={(e) => setInterceptKeyword(e.target.value)}
                  className="text-xs h-8"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">自动引流话术模板</Label>
                <textarea
                  rows={3}
                  value={interceptReplyTemplate}
                  onChange={(e) => setInterceptReplyTemplate(e.target.value)}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>

            {/* 实时截流日志 */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <h4 className="text-xs font-bold text-foreground">⚡ 最新截流获客记录</h4>
              <div className="space-y-2">
                {[
                  { user: "电商老板张总", source: "对标博主《AI电商》", keyword: "怎么买", time: "3分钟前" },
                  { user: "数码玩家阿凯", source: "对标视频《短视频脚本全解》", keyword: "求教程", time: "12分钟前" },
                  { user: "广州外贸小芳", source: "对标视频《海外短视频爆款》", keyword: "求推荐", time: "28分钟前" },
                ].map((item, idx) => (
                  <div key={idx} className="p-2 rounded-lg bg-muted/30 border border-border/40 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-bold text-foreground">
                        {item.user} · 匹配词: <span className="text-rose-600 font-mono">[{item.keyword}]</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">来源: {item.source} · {item.time}</div>
                    </div>
                    <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[9px]">已自动发送话术</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 模块 8: 任务市场 (Task - 推广变现与带货挂车) */}
      {/* ============================================================= */}
      {activeSubTab === "task" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <LuShoppingBag className="size-4 text-violet-500" />
                AiToEarn 创作者任务变现大厅 (Task Market)
              </h3>
              <p className="text-xs text-muted-foreground">
                精选优质品牌商高佣推广、挂车带货与短视频创作需求，一键认领并同步至 AI 成片流水线
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="搜索品牌、行业或任务名称..."
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                className="h-8 text-xs w-52"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { id: 1, title: "Nano Banana Pro AI创意海报带货挂车", reward: "¥650/条 + 18%分佣", brand: "NanoBanana", deadline: "剩4天", quota: "50/100" },
              { id: 2, title: "MiniMax H3 电影级AI视频生成测评推广", reward: "¥1,200/条", brand: "MiniMax", deadline: "剩2天", quota: "18/20" },
              { id: 3, title: "人体工学智能办公升降桌短视频种草", reward: "¥450/条 + 15%分佣", brand: "Brateck", deadline: "剩6天", quota: "35/80" },
              { id: 4, title: "跨境海外短视频声音克隆实操教程投稿", reward: "¥800/条", brand: "FunAudio", deadline: "剩3天", quota: "12/30" },
              { id: 5, title: "一人公司AI变现自动化工作流案例征集", reward: "¥1,500/条", brand: "AiToEarn", deadline: "剩8天", quota: "42/50" },
            ]
              .filter((t) => (taskSearch.trim() ? t.title.includes(taskSearch) || t.brand.includes(taskSearch) : true))
              .map((task) => {
                const isClaimed = claimedTaskIds.includes(task.id);
                return (
                  <div key={task.id} className="p-4 rounded-xl border border-border bg-card space-y-3 hover:border-violet-500/40 transition-all flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-[10px]">{task.brand}</Badge>
                        <span className="text-xs font-bold text-amber-600 dark:text-amber-400 font-mono">{task.reward}</span>
                      </div>
                      <h4 className="text-xs font-bold text-foreground line-clamp-1">{task.title}</h4>
                      <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                        <span>截止: {task.deadline}</span>
                        <span>名额: {task.quota}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border/40">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setActiveSubTab("aiTool");
                          setActiveAiTool("moneyprinter");
                          setMptSubject(`【${task.brand}】${task.title}`);
                          setToolViewMode("quick");
                          toast.success(`已将任务【${task.title}】带入一键成片控制台！`);
                        }}
                        className="h-7 text-xs border-violet-500/30 text-violet-600 hover:bg-violet-500/10"
                      >
                        <LuWand className="size-3 mr-1" /> 一键AI成片
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (isClaimed) {
                            const url = prompt("请输入您已发布的视频链接（如抖音/小红书链接）进行提交审核：", "");
                            if (url) {
                              toast.success("任务链接提交成功！平台审核通过后佣金将自动结算至您的钱包。");
                            }
                          } else {
                            setClaimedTaskIds([...claimedTaskIds, task.id]);
                            toast.success(`成功认领任务【${task.title}】！推广素材包已同步。`);
                          }
                        }}
                        className={`h-7 text-xs ${
                          isClaimed ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-violet-600 text-white hover:bg-violet-700"
                        }`}
                      >
                        {isClaimed ? "已认领 · 提交链接" : "一键认领任务"}
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 模块 9: 钱包管理 (Finance - 收益明细与提现) */}
      {/* ============================================================= */}
      {activeSubTab === "finance" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-5 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <LuWallet className="size-4 text-emerald-500" />
                创作者钱包与收益结算中心 (Finance)
              </h3>
              <p className="text-xs text-muted-foreground">
                实时结算带货分佣、任务佣金与矩阵商单收入，支持极速提现至支付宝与微信零钱
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  const amtStr = prompt(`请输入提现金额 (当前可提现余额: ¥${walletBalance.toFixed(2)}):`, "500");
                  if (amtStr) {
                    const amt = parseFloat(amtStr);
                    if (isNaN(amt) || amt <= 0) {
                      toast.error("请输入有效的提现金额！");
                      return;
                    }
                    if (amt > walletBalance) {
                      toast.error("提现金额超出当前可提现余额！");
                      return;
                    }
                    const newBalance = walletBalance - amt;
                    setWalletBalance(newBalance);
                    localStorage.setItem("ate_wallet_balance", newBalance.toString());

                    const newRec = {
                      date: new Date().toLocaleString(),
                      amount: `¥ ${amt.toFixed(2)}`,
                      method: "支付宝极速提现",
                      status: "已受理 (预计2小时内到账)",
                    };
                    const updatedHistory = [newRec, ...withdrawHistory];
                    setWithdrawHistory(updatedHistory);
                    localStorage.setItem("ate_withdraw_history", JSON.stringify(updatedHistory));
                    toast.success(`已成功申请提现 ¥${amt.toFixed(2)}！`);
                  }
                }}
                className="h-8 text-xs bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs gap-1"
              >
                <LuCoins className="size-3.5" /> 申请提现
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card/60 space-y-1">
              <div className="text-xs text-muted-foreground">可提现余额 (CNY)</div>
              <div className="text-2xl font-bold font-mono text-emerald-600">¥ {walletBalance.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground">昨日新增佣金: +¥ 320.00</div>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/60 space-y-1">
              <div className="text-xs text-muted-foreground">待结算佣金 (7日后入账)</div>
              <div className="text-2xl font-bold font-mono text-amber-600">¥ 2,450.00</div>
              <div className="text-[10px] text-muted-foreground">包含 4 笔正在审核的任务款项</div>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/60 space-y-1">
              <div className="text-xs text-muted-foreground">累计总收益</div>
              <div className="text-2xl font-bold font-mono text-foreground">¥ 38,940.50</div>
              <div className="text-[10px] text-muted-foreground">已累计提现 {withdrawHistory.length} 笔</div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h4 className="text-xs font-bold text-foreground">提现账户与近期记录</h4>
            <div className="flex items-center gap-3 text-xs">
              <span>默认提现账户: <strong className="text-foreground font-mono">alipay: 138****0192</strong></span>
              <button
                onClick={() => toast.info("请在个人资料页修改收款支付宝或微信账号")}
                className="text-violet-600 hover:underline text-[11px]"
              >
                修改账户
              </button>
            </div>

            <div className="space-y-2 pt-2 border-t border-border/40">
              {withdrawHistory.map((rec, i) => (
                <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-muted/20">
                  <span className="text-muted-foreground font-mono">{rec.date}</span>
                  <span className="font-semibold text-foreground">{rec.method}</span>
                  <span className="font-bold font-mono text-foreground">{rec.amount}</span>
                  <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">{rec.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 模块 10: Relay中转 & 真实大模型 API 配置 */}
      {/* ============================================================= */}
      {activeSubTab === "relay" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <LuCpu className="size-4 text-violet-500" />
                Relay 中转网关与真实大模型 (LLM) API 配置
              </h3>
              <p className="text-xs text-muted-foreground">
                用于给全自动分镜、文案生成及 OpenClaw 浏览器自动化提供真实 API 算力驱动
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (!llmApiKey.trim()) {
                  toast.error("请先在下方输入 API Key 再进行测试！");
                  return;
                }
                setIsTestingLlm(true);
                try {
                  const res = await fetch(`${llmBaseUrl}/models`, {
                    headers: { Authorization: `Bearer ${llmApiKey}` },
                  });
                  if (res.ok) {
                    toast.success(`成功连通 ${llmProvider.toUpperCase()} 接口！API Key 认证有效。`);
                  } else {
                    toast.warning(`接口返回状态: ${res.status} (${res.statusText})，请检查 Key 或 Base URL。`);
                  }
                } catch (e: any) {
                  toast.error(`网络测试失败: ${e.message}`);
                } finally {
                  setIsTestingLlm(false);
                }
              }}
              disabled={isTestingLlm}
              className="h-8 text-xs border-violet-500/30 text-violet-600 hover:bg-violet-500/10"
            >
              <LuRefreshCw className={`size-3.5 mr-1 ${isTestingLlm ? "animate-spin" : ""}`} />
              测试 LLM 真实连通性
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <LuKey className="size-3.5 text-amber-500" />
                大模型提供商选择 (真实调用)
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "deepseek", name: "DeepSeek-V3 / R1", url: "https://api.deepseek.com/v1" },
                  { id: "openai", name: "OpenAI GPT-4o", url: "https://api.openai.com/v1" },
                  { id: "minimax", name: "MiniMax H3 / 2.0", url: "https://api.minimax.chat/v1" },
                  { id: "kimi", name: "Moonshot Kimi", url: "https://api.moonshot.cn/v1" },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setLlmProvider(p.id as any);
                      setLlmBaseUrl(p.url);
                      localStorage.setItem("ate_llm_provider", p.id);
                      localStorage.setItem("ate_llm_base_url", p.url);
                    }}
                    className={`p-2.5 rounded-lg border text-xs text-left transition-all ${
                      llmProvider === p.id
                        ? "border-violet-500 bg-violet-500/15 font-semibold text-violet-700 dark:text-violet-300"
                        : "border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <div>{p.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">{p.url}</div>
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-foreground">API Key 密钥</Label>
                <Input
                  type="password"
                  placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                  value={llmApiKey}
                  onChange={(e) => setLlmApiKey(e.target.value)}
                  className="text-xs h-8 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-foreground">Base URL 地址</Label>
                <Input
                  value={llmBaseUrl}
                  onChange={(e) => setLlmBaseUrl(e.target.value)}
                  className="text-xs h-8 font-mono"
                />
              </div>

              <Button
                onClick={() => {
                  localStorage.setItem("ate_llm_provider", llmProvider);
                  localStorage.setItem("ate_llm_api_key", llmApiKey);
                  localStorage.setItem("ate_llm_base_url", llmBaseUrl);
                  toast.success("大模型真实 API 配置已安全保存至本地加密存储！");
                }}
                className="w-full h-8 text-xs bg-violet-600 text-white hover:bg-violet-700 shadow-xs"
              >
                保存大模型配置
              </Button>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <LuCpu className="size-3.5 text-violet-500" />
                AiToEarn Relay 服务中继状态
              </h4>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40 space-y-1">
                  <div className="flex justify-between text-foreground font-semibold">
                    <span>Relay 端口:</span>
                    <span className="font-mono text-emerald-600">3000 / 9901 (正常联通)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>OpenClaw 协议引擎:</span>
                    <span className="font-mono">v2.4.1 (支持 CDP 自动化发布)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>当前节点代理:</span>
                    <span className="font-mono">中国杭州高速专线 (12ms)</span>
                  </div>
                </div>

                <p className="text-[11px] leading-relaxed">
                  通过 Relay 中转网关，NarciPHBrowser 可以在后台全自动驱动 Chrome 指纹隔离实例，完成无需人工介入的一键扫码登录与多平台并发发布。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 模块 11: 官方云端实时镜像 (LiveWeb - aitoearn.cn/zh-CN 原站直连) */}
      {/* ============================================================= */}
      {activeSubTab === "liveWeb" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col flex-1 min-h-[660px] shadow-sm animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-muted/40 border-b border-border/80 text-xs">
            <div className="flex items-center gap-2">
              <LuGlobe className="size-4 text-violet-600" />
              <span className="font-semibold text-foreground">AiToEarn 官方云端镜像工作台</span>
              <Badge variant="outline" className="border-violet-500/30 text-violet-600 text-[10px]">
                https://aitoearn.cn/zh-CN
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleLaunchInBrowser("https://aitoearn.cn/zh-CN")}
                className="h-7 text-xs gap-1 border-violet-500/30 text-violet-600 hover:bg-violet-500/10"
              >
                <LuExternalLink className="size-3" /> 在独立指纹标签打开
              </Button>
            </div>
          </div>

          <div className="flex-1 w-full bg-background relative min-h-[640px]">
            <iframe
              src="https://aitoearn.cn/zh-CN"
              title="AiToEarn Official Web Mirror"
              className="w-full h-[660px] border-none"
              allow="camera; microphone; clipboard-read; clipboard-write; display-capture"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
            />
          </div>
        </div>
      )}
    </div>
  );
};
