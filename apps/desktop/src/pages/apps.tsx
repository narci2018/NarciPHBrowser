import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  LuAppWindow,
  LuPlay,
  LuSquare,
  LuRefreshCw,
  LuFolder,
  LuExternalLink,
  LuRadio,
  LuVideo,
  LuCheck,
  LuSparkles,
  LuShieldCheck,
  LuCpu,
  LuLayers,
  LuSlidersHorizontal,
  LuSend,
  LuClock,
  LuFileVideo,
  LuTag,
  LuShare2,
  LuTerminal,
  LuList,
  LuPlus,
  LuUsers,
  LuUserCheck,
  LuUserPlus,
  LuTriangleAlert,
  LuFolderOpen,
  LuImage,
  LuTrash2,
  LuCircleCheck,
  LuMic,
  LuScissors,
  LuVolume2,
  LuVolumeX,
  LuActivity,
  LuCheckCheck,
  LuZap,
  LuShieldAlert,
  LuFilm,
  LuFileCheck,
  LuChevronUp,
  LuChevronDown,
  LuFolderPlus,
  LuChartLine,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProfileSummary } from "@narc/sdk";
import {
  MATRIX_PLATFORMS,
  compileMatrixPublishWorkflow,
  formatWeixinShortTitle,
  type MatrixPublishPayload,
} from "@/lib/matrix-publisher";
import {
  loadMatrixAccounts,
  saveMatrixAccounts,
  type MatrixAccount,
} from "@/lib/matrix-accounts";
import { MatrixAccountsPanel } from "@/components/matrix-accounts-panel";
import { MaterialCollectorPanel } from "@/components/material-collector-panel";
import { SelfMediaAnalyticsPanel } from "@/components/self-media-analytics-panel";

interface TtsResult {
  success: boolean;
  audio_path: string;
  srt_path: string;
  voice: string;
  text_preview?: string;
  duration_secs?: number;
  duration_estimate_secs?: number;
  file_size_kb?: number;
  audio_data_url?: string;
}

interface RemixResult {
  success: boolean;
  input_path?: string;
  output_path: string;
  original_size_mb?: number;
  new_size_mb?: number;
  original_duration_secs?: number;
  new_duration_secs?: number;
  resolution?: string;
  speed?: number;
  zoom?: number;
  flip_h?: boolean;
  color_tweak?: boolean;
  vignette?: boolean;
  noise?: boolean;
  strip_blind_watermark?: boolean;
  trim_end_secs?: number;
  trim_start_secs?: number;
  delogo_mode?: string;
  dynamic_pan_zoom?: boolean;
  dynamic_lighting?: boolean;
  ambient_blurred_bg?: boolean;
  split_canvas?: boolean;
  audio_scramble?: boolean;
  mute_audio?: boolean;
  frame_jitter?: boolean;
  curved_speed?: boolean;
  film_grain?: boolean;
  micro_rotate?: boolean;
  chromashift?: boolean;
  unsharp?: boolean;
  fake_camera_exif?: boolean;
  duration_secs?: number;
  blind_watermark_removed?: boolean;
  blind_watermark_status?: string;
  blind_watermark_detail?: string;
  error?: string;
}

interface MergeResult {
  success: boolean;
  output_path: string;
  clip_count?: number;
  original_clips?: string[];
  original_total_duration?: number;
  final_duration?: number;
  final_size_mb?: number;
  resolution?: string;
  transitions?: string[];
  duration_secs?: number;
  blind_watermark_removed?: boolean;
  blind_watermark_status?: string;
  blind_watermark_detail?: string;
  error?: string;
}

interface BlindWatermarkDetectResult {
  success: boolean;
  path?: string;
  detected: boolean;
  score: number;
  status_text: string;
  reason?: string;
  error?: string;
}

interface NoWatermarkResult {
  success: boolean;
  platform?: string;
  title?: string;
  author?: string;
  video_url?: string;
  local_path?: string;
  file_name?: string;
  size_mb?: number;
  error?: string;
}

interface CopywritingResult {
  success: boolean;
  title: string;
  summary: string;
  tags: string[];
  platform: string;
  source: string;
}

const EDGE_TTS_VOICES = [
  { id: "zh-CN-YunxiNeural", name: "云希 (活力短视频/影视解说推荐)", desc: "声线饱满有感染力，短视频解说爆款音色", tag: "解说首选" },
  { id: "zh-CN-XiaoxiaoNeural", name: "晓晓 (温柔知性/情感生活/小说)", desc: "自然温暖如邻家女孩，适合知识分享与情感故事", tag: "知性女声" },
  { id: "zh-CN-YunjianNeural", name: "云健 (沉稳影视/纪录片播报)", desc: "浑厚沉稳，适合历史、科普与悬疑故事", tag: "磁性男声" },
  { id: "zh-CN-YunyangNeural", name: "云扬 (正能量/新闻科普)", desc: "字正腔圆，专业播音腔", tag: "专业播报" },
  { id: "zh-CN-XiaoyiNeural", name: "晓伊 (二次元萌系/日常分享)", desc: "活泼甜美萌妹子声线", tag: "萌妹日常" },
  { id: "zh-CN-liaoning-XiaobeiNeural", name: "晓北 (东北幽默唠嗑解说)", desc: "风趣幽默自带喜剧效果", tag: "特色方言" },
  { id: "zh-HK-HiuGaaiNeural", name: "晓佳 (粤语/港味生活)", desc: "地道粤语发音，适合大湾区与港澳跨境", tag: "粤语标准" },
  { id: "en-US-JennyNeural", name: "Jenny (北美纯正女声/跨境海外带货)", desc: "地道美音，TikTok 出海与跨境短视频必选", tag: "出海女声" },
  { id: "en-US-GuyNeural", name: "Guy (北美沉稳男声/跨境数码科技)", desc: "专业纯正美语男声，适合科技数码测评", tag: "出海男声" },
];

const LLM_PRESETS = [
  {
    name: "LongCat",
    desc: "LongCat 官方/兼容接口",
    baseUrl: "https://api.longcat.chat/openapi/v1",
    model: "LongCat-2.5-Preview",
  },
  {
    name: "DeepSeek",
    desc: "DeepSeek 官方大模型",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  {
    name: "SiliconFlow",
    desc: "硅基流动开源生态",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "deepseek-ai/DeepSeek-V3",
  },
  {
    name: "OpenAI 官方",
    desc: "GPT-4o-mini 高速模型",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
];

interface StreamCapStatus {
  running: boolean;
  port: number;
  url: string;
  work_dir: string;
  python_path: string;
  pid: number | null;
  downloads_dir: string;
}

interface DownloadedVideoInfo {
  name: string;
  path: string;
  size_mb: number;
  modified: string;
}

interface PickedMediaInfo {
  path: string;
  name: string;
  size_mb: number;
  blindWatermarkDetecting?: boolean;
  blindWatermarkDetected?: boolean;
  blindWatermarkScore?: number;
  blindWatermarkStatus?: string;
  blindWatermarkReason?: string;
}

interface PublishTaskRecord {
  id: string;
  platformName: string;
  title: string;
  filePath: string;
  profileName: string;
  time: string;
  status: "success" | "failed" | "running";
}

interface AppsPageProps {
  profiles?: ProfileSummary[];
}

export function AppsPage({ profiles = [] }: AppsPageProps) {
  const [status, setStatus] = useState<StreamCapStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("matrix");
  const [iframeKey, setIframeKey] = useState<number>(1);
  const [autoStart, setAutoStart] = useState<boolean>(() => {
    return localStorage.getItem("streamcap_autostart") === "true";
  });
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Matrix Publisher states
  const [selectedPlatform, setSelectedPlatform] = useState<string>("douyin");
  const [selectedProfileId, setSelectedProfileId] = useState<string>(() => profiles[0]?.id || "");
  const [contentType, setContentType] = useState<"video" | "image">("video");
  const [videoPath, setVideoPath] = useState<string>("");
  const [coverPath, setCoverPath] = useState<string>("");
  const [videoFileInfo, setVideoFileInfo] = useState<PickedMediaInfo | null>(null);
  const [coverFileInfo, setCoverFileInfo] = useState<PickedMediaInfo | null>(null);
  const [title, setTitle] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [isOriginal, setIsOriginal] = useState<boolean>(true);
  const [isHeadless, setIsHeadless] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [publishLogs, setPublishLogs] = useState<string[]>([]);
  const [downloadedVideos, setDownloadedVideos] = useState<DownloadedVideoInfo[]>([]);
  const [showVideoPicker, setShowVideoPicker] = useState<boolean>(false);
  const [publishHistory, setPublishHistory] = useState<PublishTaskRecord[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("matrix_publish_history") || "[]");
    } catch {
      return [];
    }
  });

  // AI Copywriting Dialog States (Focused purely on business copywriting)
  const [showAiModal, setShowAiModal] = useState<boolean>(false);
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [aiPlatform, setAiPlatform] = useState<string>("douyin");
  const [aiApiKey, setAiApiKey] = useState<string>(() => localStorage.getItem("duck_ai_api_key") || "");
  const [aiBaseUrl, setAiBaseUrl] = useState<string>(() => localStorage.getItem("duck_ai_base_url") || "");
  const [aiModel, setAiModel] = useState<string>(() => localStorage.getItem("duck_ai_model") || "deepseek-chat");
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [aiResult, setAiResult] = useState<CopywritingResult | null>(null);

  // Dedicated Global LLM Settings State (Decoupled from business modal)
  const [showLlmConfigModal, setShowLlmConfigModal] = useState<boolean>(false);
  const [tempApiKey, setTempApiKey] = useState<string>(() => localStorage.getItem("duck_ai_api_key") || "");
  const [tempBaseUrl, setTempBaseUrl] = useState<string>(() => localStorage.getItem("duck_ai_base_url") || "");
  const [tempModel, setTempModel] = useState<string>(() => localStorage.getItem("duck_ai_model") || "deepseek-chat");
  const [isTestingLlm, setIsTestingLlm] = useState<boolean>(false);

  // Edge-TTS Dialog States
  const [showTtsModal, setShowTtsModal] = useState<boolean>(false);
  const [ttsText, setTtsText] = useState<string>("");
  const [ttsVoice, setTtsVoice] = useState<string>("zh-CN-YunxiNeural");
  const [isGeneratingTts, setIsGeneratingTts] = useState<boolean>(false);
  const [ttsResult, setTtsResult] = useState<TtsResult | null>(null);

  // Video Remix/Deduplication State
  const [isRemixing, setIsRemixing] = useState<boolean>(false);
  const [lastRemixResult, setLastRemixResult] = useState<RemixResult | null>(null);

  // Dedicated Video Deduplication Studio State
  const [dedupFiles, setDedupFiles] = useState<PickedMediaInfo[]>([]);
  const [selectedDedupIdx, setSelectedDedupIdx] = useState<number>(0);
  const [dedupPreset, setDedupPreset] = useState<"fyp" | "pip" | "split" | "curved" | "mute" | "light" | "standard" | "deep" | "custom">("fyp");
  const [dedupSpeed, setDedupSpeed] = useState<number>(1.04);
  const [dedupZoom, setDedupZoom] = useState<number>(1.04);
  const [dedupFlipH, setDedupFlipH] = useState<boolean>(true);
  const [dedupColorTweak, setDedupColorTweak] = useState<boolean>(true);
  const [dedupVignette, setDedupVignette] = useState<boolean>(false);
  const [dedupNoise, setDedupNoise] = useState<boolean>(false);
  const [dedupAudioVolume, setDedupAudioVolume] = useState<number>(1.02);
  const [dedupStripBlindWatermark, setDedupStripBlindWatermark] = useState<boolean>(true);
  const [dedupTrimStartSecs, setDedupTrimStartSecs] = useState<number>(0.5);
  const [dedupTrimEndSecs, setDedupTrimEndSecs] = useState<number>(2.5);
  const [dedupDelogoMode, setDedupDelogoMode] = useState<string>("tiktok");
  const [dedupDynamicPanZoom, setDedupDynamicPanZoom] = useState<boolean>(true);
  const [dedupDynamicLighting, setDedupDynamicLighting] = useState<boolean>(true);
  const [dedupAmbientBlurredBg, setDedupAmbientBlurredBg] = useState<boolean>(false);
  const [dedupSplitCanvas, setDedupSplitCanvas] = useState<boolean>(false);
  const [dedupAudioScramble, setDedupAudioScramble] = useState<boolean>(true);
  const [dedupMuteAudio, setDedupMuteAudio] = useState<boolean>(false);
  const [dedupFrameJitter, setDedupFrameJitter] = useState<boolean>(false);
  const [dedupCurvedSpeed, setDedupCurvedSpeed] = useState<boolean>(true);
  const [dedupFilmGrain, setDedupFilmGrain] = useState<boolean>(false);
  const [dedupMicroRotate, setDedupMicroRotate] = useState<boolean>(true);
  const [dedupChromashift, setDedupChromashift] = useState<boolean>(true);
  const [dedupUnsharp, setDedupUnsharp] = useState<boolean>(true);
  const [dedupFakeCameraExif, setDedupFakeCameraExif] = useState<boolean>(true);
  const [isDedupProcessing, setIsDedupProcessing] = useState<boolean>(false);
  const [batchDedupProgress, setBatchDedupProgress] = useState<{ current: number; total: number } | null>(null);
  const [dedupResults, setDedupResults] = useState<Record<string, RemixResult>>({});

  // Batch Dedup + Dynamic Transition Merge State
  const [mergeTransition, setMergeTransition] = useState<string>("random");
  const [mergeTransitionDuration, setMergeTransitionDuration] = useState<number>(0.8);
  const [mergeTargetResolution, setMergeTargetResolution] = useState<string>("auto");
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [lastMergeResult, setLastMergeResult] = useState<MergeResult | null>(null);
  const [activeDedupView, setActiveDedupView] = useState<"single" | "merge">("single");

  // Multi-platform No-watermark Downloader Modal States
  const [showNoWatermarkModal, setShowNoWatermarkModal] = useState<boolean>(false);
  const [noWatermarkShareText, setNoWatermarkShareText] = useState<string>("");
  const [isResolvingNoWatermark, setIsResolvingNoWatermark] = useState<boolean>(false);
  const [noWatermarkResult, setNoWatermarkResult] = useState<NoWatermarkResult | null>(null);

  // Local Media Streaming Server Port (Tiny-HTTP 206 Partial Content 流式播放服务)
  const [mediaServerPort, setMediaServerPort] = useState<number>(29995);

  useEffect(() => {
    invoke<any>("get_local_api_status")
      .then((status) => {
        if (status && status.data && status.data.port) {
          setMediaServerPort(status.data.port);
        } else if (status && status.port) {
          setMediaServerPort(status.port);
        }
      })
      .catch(() => {});
  }, []);

  // 生成支持 HTTP 206 局部内容分片与 Range 寻道的媒体流 URL
  // 彻底解决 Windows WebView2 对本地自定义协议与包含特殊字符(#, %, 汉字, 空格)的阻断与截断
  const getVideoStreamUrl = (filePath: string): string => {
    if (!filePath) return "";
    const encoded = encodeURIComponent(filePath);
    return `http://127.0.0.1:${mediaServerPort}/api/v1/media/stream?path=${encoded}`;
  };

  // Matrix Accounts state
  const [accounts, setAccounts] = useState<MatrixAccount[]>(() => {
    const list = loadMatrixAccounts();
    if (list.length === 0 && profiles.length > 0) {
      const seeds: MatrixAccount[] = [
        {
          id: `acc_seed_douyin`,
          platformId: "douyin",
          accountName: "抖音主账号",
          profileId: profiles[0]?.id || "",
          status: "not_logged_in",
          notes: "已绑定独立指纹环境，点击【扫码登录】即可持久化缓存会话",
        },
        {
          id: `acc_seed_weixin`,
          platformId: "weixin",
          accountName: "微信视频号",
          profileId: profiles[1]?.id || profiles[0]?.id || "",
          status: "not_logged_in",
          notes: "微信视频号创作者助手",
        },
        {
          id: `acc_seed_xhs`,
          platformId: "xiaohongshu",
          accountName: "小红书矩阵号",
          profileId: profiles[2]?.id || profiles[0]?.id || "",
          status: "not_logged_in",
          notes: "小红书短视频与图文创作者",
        },
      ];
      saveMatrixAccounts(seeds);
      return seeds;
    }
    return list;
  });
  const [selectedPublishAccountIds, setSelectedPublishAccountIds] = useState<string[]>([]);

  const currentPlatformConfig = MATRIX_PLATFORMS[selectedPlatform] || MATRIX_PLATFORMS.douyin;
  const supportsImage = currentPlatformConfig.supports.includes("image");

  useEffect(() => {
    if (currentPlatformConfig && !currentPlatformConfig.supports.includes(contentType)) {
      setContentType((currentPlatformConfig.supports[0] as "video" | "image") || "video");
    }
  }, [selectedPlatform, currentPlatformConfig, contentType]);

  const fetchStatus = async () => {
    try {
      const res = await invoke<StreamCapStatus>("get_streamcap_status");
      setStatus(res);
      return res;
    } catch (err) {
      console.error("Failed to get streamcap status:", err);
      return null;
    }
  };

  const loadDownloadedVideos = async () => {
    try {
      const list = await invoke<DownloadedVideoInfo[]>("list_streamcap_downloads");
      setDownloadedVideos(list);
    } catch (err) {
      console.error("Failed to list streamcap downloads:", err);
    }
  };

  useEffect(() => {
    fetchStatus().then((s) => {
      if (autoStart && s && !s.running) {
        handleStart();
      }
    });

    loadDownloadedVideos();

    pollTimerRef.current = setInterval(() => {
      fetchStatus();
    }, 4000);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedProfileId && profiles.length > 0) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profiles]);

  const handleStart = async () => {
    setLoading(true);
    try {
      const res = await invoke<StreamCapStatus>("start_streamcap_service", { port: 6006 });
      setStatus(res);
      setIframeKey((prev) => prev + 1);
      toast.success("StreamCap 引擎已成功启动！正在载入工作台...");
    } catch (err: any) {
      toast.error(`启动失败: ${err?.toString() || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const res = await invoke<StreamCapStatus>("stop_streamcap_service");
      setStatus(res);
      toast.info("StreamCap 录制引擎已停止");
    } catch (err: any) {
      toast.error(`停止失败: ${err?.toString() || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await invoke("open_streamcap_directory");
      toast.success("已在文件资源管理器中打开录制下载目录");
    } catch (err: any) {
      toast.error(`打开目录失败: ${err?.toString() || err}`);
    }
  };

  const handleOpenInBrowser = async () => {
    try {
      await invoke("open_streamcap_in_browser", { url: status?.url || "http://127.0.0.1:6006" });
      toast.success("已在系统默认浏览器中打开 StreamCap 独立窗口");
    } catch (err: any) {
      toast.error(`打开浏览器失败: ${err?.toString() || err}`);
    }
  };

  const handleRefreshIframe = () => {
    setIframeKey((prev) => prev + 1);
    toast.success("已刷新内嵌工作台");
  };

  const toggleAutoStart = (val: boolean) => {
    setAutoStart(val);
    localStorage.setItem("streamcap_autostart", String(val));
    toast.info(val ? "已开启切入应用页时自动拉起 StreamCap" : "已关闭自动拉起");
  };

  // Add quick tag to summary
  const addQuickTag = (tag: string) => {
    if (summary.includes(tag)) return;
    setSummary((prev) => (prev ? `${prev} ${tag}` : tag));
  };

  // 打开系统文件选择器选取本地素材文件
  const handlePickVideo = async () => {
    try {
      const filterType = contentType === "image" ? "image" : "video";
      const res = await invoke<PickedMediaInfo | null>("pick_media_file", { filterType });
      if (res && res.path) {
        setVideoPath(res.path);
        setVideoFileInfo(res);
        if (/\.(mp4|mov|mkv|flv|avi|webm|ts|m4v)$/i.test(res.path)) {
          setContentType("video");
          // 自动异步检测主视频暗水印
          setVideoFileInfo((prev) => (prev ? { ...prev, blindWatermarkDetecting: true } : prev));
          invoke<BlindWatermarkDetectResult>("detect_video_blind_watermark", { videoPath: res.path })
            .then((wm) => {
              setVideoFileInfo((prev) =>
                prev && prev.path === res.path
                  ? {
                      ...prev,
                      blindWatermarkDetecting: false,
                      blindWatermarkDetected: wm.detected,
                      blindWatermarkScore: wm.score,
                      blindWatermarkStatus: wm.status_text,
                      blindWatermarkReason: wm.reason,
                    }
                  : prev
              );
            })
            .catch(() => {
              setVideoFileInfo((prev) => (prev ? { ...prev, blindWatermarkDetecting: false } : prev));
            });
        }
        // 如果当前标题为空，自动提取视频文件名（去除后缀）填充为作品标题
        if (!title.trim()) {
          const cleanName = res.name.replace(/\.[^/.]+$/, "");
          setTitle(cleanName);
        }
        toast.success(`已选定素材: ${res.name} (${res.size_mb} MB)`);
      }
    } catch (err: any) {
      toast.error(`打开系统文件选择器失败: ${err?.toString() || err}`);
    }
  };

  // 打开系统文件选择器选取封面图片
  const handlePickCover = async () => {
    try {
      const res = await invoke<PickedMediaInfo | null>("pick_media_file", { filterType: "image" });
      if (res && res.path) {
        setCoverPath(res.path);
        setCoverFileInfo(res);
        toast.success(`已选定封面图片: ${res.name} (${res.size_mb} MB)`);
      }
    } catch (err: any) {
      toast.error(`打开系统图片选择器失败: ${err?.toString() || err}`);
    }
  };

  // 视频智能去重防查重
  const handleRemixVideo = async () => {
    if (!videoPath.trim()) {
      toast.error("请先选取需要去重的视频文件");
      return;
    }
    setIsRemixing(true);
    try {
      toast.info("正在执行微裁切(1.02x)、微变速(1.03x)与元数据深度清洗...");
      const res = await invoke<RemixResult>("remix_video_dedup", { inputPath: videoPath.trim() });
      if (res && res.output_path) {
        setVideoPath(res.output_path);
        const fname = res.output_path.split(/[/\\]/).pop() || "";
        setVideoFileInfo({
          path: res.output_path,
          name: fname,
          size_mb: res.new_size_mb || 0,
        });
        setLastRemixResult(res);
        toast.success(
          `视频去重清洗成功！原体积: ${res.original_size_mb} MB -> ${res.new_size_mb} MB (耗时 ${res.duration_secs}s)`
        );
      }
    } catch (err: any) {
      toast.error(`视频去重失败: ${err?.toString() || err}`);
    } finally {
      setIsRemixing(false);
    }
  };

  // 切换去重策略预设
  const applyDedupPreset = (preset: "fyp" | "pip" | "split" | "curved" | "mute" | "light" | "standard" | "deep" | "custom") => {
    setDedupPreset(preset);
    if (preset === "fyp") {
      // 策略 1: TikTok FYP 顶级爆破 (综合全能抗查重)
      setDedupSpeed(1.04);
      setDedupZoom(1.04);
      setDedupFlipH(true);                // 水平镜像翻转 (彻底粉碎人体骨骼/关键点肢体姿态检测)
      setDedupColorTweak(true);
      setDedupVignette(false);
      setDedupNoise(false);
      setDedupAudioVolume(1.02);
      setDedupStripBlindWatermark(true);
      setDedupTrimStartSecs(0.5);         // 掐头 0.5 秒 (打破前 3 秒黄金首帧特征比对)
      setDedupTrimEndSecs(2.5);           // 去尾 2.5 秒
      setDedupDelogoMode("tiktok");
      setDedupDynamicPanZoom(true);       // 呼吸式微运镜（粉碎 ViT 空间特征比对）
      setDedupDynamicLighting(true);      // 动态微光影与胶片伽马呼吸（打破 pHash 时间序列）
      setDedupAmbientBlurredBg(false);
      setDedupSplitCanvas(false);
      setDedupAudioScramble(true);        // 音频共振峰微变 + 3D立体声扩宽（粉碎 Shazam/Chromaprint 声学指纹）
      setDedupMuteAudio(false);
      setDedupFrameJitter(false);
      setDedupCurvedSpeed(true);          // 动态波浪非线性变速
      setDedupFilmGrain(false);
      setDedupMicroRotate(true);          // ±1.2° 正弦微旋转摆动 (打破笛卡尔网格扫描)
      setDedupChromashift(true);          // RGB/色度微移 (破坏颜色直方图)
      setDedupUnsharp(true);              // 边缘智能锐化 (重构高频梯度)
      setDedupFakeCameraExif(true);       // 彻底清除字节全局 tracking ID 并伪装 iPhone 15 Pro
    } else if (preset === "pip") {
      // 策略 2: 画中画动态毛玻璃画布 (视觉空间降维打击，极力推荐)
      setDedupSpeed(1.03);
      setDedupZoom(1.0);
      setDedupFlipH(true);
      setDedupColorTweak(true);
      setDedupVignette(false);
      setDedupNoise(false);
      setDedupAudioVolume(1.02);
      setDedupStripBlindWatermark(true);
      setDedupTrimStartSecs(0.5);
      setDedupTrimEndSecs(2.5);
      setDedupDelogoMode("tiktok");
      setDedupDynamicPanZoom(false);
      setDedupDynamicLighting(true);
      setDedupAmbientBlurredBg(true);     // 开启画中画 84% 核心居中 + 30px 动态高斯模糊环境底板
      setDedupSplitCanvas(false);
      setDedupAudioScramble(true);
      setDedupMuteAudio(false);
      setDedupFrameJitter(false);
      setDedupCurvedSpeed(false);
      setDedupFilmGrain(false);
      setDedupMicroRotate(false);
      setDedupChromashift(true);
      setDedupUnsharp(true);
      setDedupFakeCameraExif(true);
    } else if (preset === "split") {
      // 策略 3: 三段分屏上下模糊反射构图 (2026 最新爆款视觉结构重塑)
      setDedupSpeed(1.03);
      setDedupZoom(1.0);
      setDedupFlipH(true);
      setDedupColorTweak(true);
      setDedupVignette(false);
      setDedupNoise(false);
      setDedupAudioVolume(1.02);
      setDedupStripBlindWatermark(true);
      setDedupTrimStartSecs(0.5);
      setDedupTrimEndSecs(2.5);
      setDedupDelogoMode("tiktok");
      setDedupDynamicPanZoom(false);
      setDedupDynamicLighting(true);
      setDedupAmbientBlurredBg(false);
      setDedupSplitCanvas(true);          // 开启 68% 高度居中 + 上下高斯虚化镜像反射
      setDedupAudioScramble(true);
      setDedupMuteAudio(false);
      setDedupFrameJitter(false);
      setDedupCurvedSpeed(false);
      setDedupFilmGrain(false);
      setDedupMicroRotate(false);
      setDedupChromashift(true);
      setDedupUnsharp(true);
      setDedupFakeCameraExif(true);
    } else if (preset === "curved") {
      // 策略 4: 波浪变速+胶片微粒蒙版 (时空全域双抗)
      setDedupSpeed(1.04);
      setDedupZoom(1.03);
      setDedupFlipH(true);
      setDedupColorTweak(true);
      setDedupVignette(true);
      setDedupNoise(true);
      setDedupAudioVolume(1.02);
      setDedupStripBlindWatermark(true);
      setDedupTrimStartSecs(0.8);
      setDedupTrimEndSecs(2.5);
      setDedupDelogoMode("tiktok");
      setDedupDynamicPanZoom(true);
      setDedupDynamicLighting(true);
      setDedupAmbientBlurredBg(false);
      setDedupSplitCanvas(false);
      setDedupAudioScramble(true);
      setDedupMuteAudio(false);
      setDedupFrameJitter(false);
      setDedupCurvedSpeed(true);          // 波浪变速打碎时序光流
      setDedupFilmGrain(true);            // 胶片微粒全画幅打散像素哈希
      setDedupMicroRotate(true);
      setDedupChromashift(true);
      setDedupUnsharp(true);
      setDedupFakeCameraExif(true);
    } else if (preset === "mute") {
      // 策略 5: 纯净静音出海模式 (TikTok 爆款音乐专用，0音频封杀风险)
      setDedupSpeed(1.04);
      setDedupZoom(1.04);
      setDedupFlipH(true);
      setDedupColorTweak(true);
      setDedupVignette(false);
      setDedupNoise(false);
      setDedupAudioVolume(1.0);
      setDedupStripBlindWatermark(true);
      setDedupTrimStartSecs(0.5);
      setDedupTrimEndSecs(2.5);
      setDedupDelogoMode("tiktok");
      setDedupDynamicPanZoom(true);
      setDedupDynamicLighting(true);
      setDedupAmbientBlurredBg(false);
      setDedupSplitCanvas(false);
      setDedupAudioScramble(false);
      setDedupMuteAudio(true);             // 彻底剥离原音频
      setDedupFrameJitter(false);
      setDedupCurvedSpeed(true);
      setDedupFilmGrain(false);
      setDedupMicroRotate(true);
      setDedupChromashift(true);
      setDedupUnsharp(true);
      setDedupFakeCameraExif(true);
    } else if (preset === "light") {
      setDedupSpeed(1.02);
      setDedupZoom(1.02);
      setDedupFlipH(false);
      setDedupColorTweak(true);
      setDedupVignette(false);
      setDedupNoise(false);
      setDedupAudioVolume(1.02);
      setDedupStripBlindWatermark(true);
      setDedupTrimStartSecs(0.0);
      setDedupTrimEndSecs(0.0);
      setDedupDelogoMode("none");
      setDedupDynamicPanZoom(false);
      setDedupDynamicLighting(false);
      setDedupAmbientBlurredBg(false);
      setDedupSplitCanvas(false);
      setDedupAudioScramble(false);
      setDedupMuteAudio(false);
      setDedupFrameJitter(false);
      setDedupCurvedSpeed(false);
      setDedupFilmGrain(false);
      setDedupMicroRotate(false);
      setDedupChromashift(false);
      setDedupUnsharp(false);
      setDedupFakeCameraExif(true);
    } else if (preset === "standard") {
      setDedupSpeed(1.03);
      setDedupZoom(1.03);
      setDedupFlipH(false);
      setDedupColorTweak(true);
      setDedupVignette(true);
      setDedupNoise(false);
      setDedupAudioVolume(1.03);
      setDedupStripBlindWatermark(true);
      setDedupTrimStartSecs(0.0);
      setDedupTrimEndSecs(2.5);
      setDedupDelogoMode("douyin");
      setDedupDynamicPanZoom(false);
      setDedupDynamicLighting(false);
      setDedupAmbientBlurredBg(false);
      setDedupSplitCanvas(false);
      setDedupAudioScramble(false);
      setDedupMuteAudio(false);
      setDedupFrameJitter(false);
      setDedupCurvedSpeed(false);
      setDedupFilmGrain(false);
      setDedupMicroRotate(false);
      setDedupChromashift(false);
      setDedupUnsharp(false);
      setDedupFakeCameraExif(true);
    } else if (preset === "deep") {
      setDedupSpeed(1.05);
      setDedupZoom(1.05);
      setDedupFlipH(true);
      setDedupColorTweak(true);
      setDedupVignette(true);
      setDedupNoise(true);
      setDedupAudioVolume(1.04);
      setDedupStripBlindWatermark(true);
      setDedupTrimStartSecs(0.5);
      setDedupTrimEndSecs(3.0);
      setDedupDelogoMode("all_corners");
      setDedupDynamicPanZoom(true);
      setDedupDynamicLighting(false);
      setDedupAmbientBlurredBg(false);
      setDedupSplitCanvas(false);
      setDedupAudioScramble(false);
      setDedupMuteAudio(false);
      setDedupFrameJitter(false);
      setDedupCurvedSpeed(false);
      setDedupFilmGrain(false);
      setDedupMicroRotate(true);
      setDedupChromashift(true);
      setDedupUnsharp(true);
      setDedupFakeCameraExif(true);
    }
  };

  // 批量异步检测素材的平台暗水印
  const detectBlindWatermarkForFiles = async (filesToCheck: PickedMediaInfo[]) => {
    if (!filesToCheck || filesToCheck.length === 0) return;
    setDedupFiles((prev) =>
      prev.map((item) => {
        if (filesToCheck.some((f) => f.path === item.path) && item.blindWatermarkDetected === undefined) {
          return { ...item, blindWatermarkDetecting: true };
        }
        return item;
      })
    );

    for (const f of filesToCheck) {
      try {
        const res = await invoke<BlindWatermarkDetectResult>("detect_video_blind_watermark", {
          videoPath: f.path,
        });
        setDedupFiles((prev) =>
          prev.map((item) => {
            if (item.path === f.path) {
              return {
                ...item,
                blindWatermarkDetecting: false,
                blindWatermarkDetected: res.detected,
                blindWatermarkScore: res.score,
                blindWatermarkStatus: res.status_text,
                blindWatermarkReason: res.reason,
              };
            }
            return item;
          })
        );
      } catch (err) {
        console.warn("Watermark detect error:", err);
        setDedupFiles((prev) =>
          prev.map((item) => {
            if (item.path === f.path) {
              return { ...item, blindWatermarkDetecting: false };
            }
            return item;
          })
        );
      }
    }
  };

  // 批量选取待去重视频文件
  const handlePickDedupVideos = async () => {
    try {
      const files = await invoke<PickedMediaInfo[]>("pick_multiple_media_files", { filterType: "video" });
      if (files && files.length > 0) {
        setDedupFiles((prev) => {
          const existingPaths = new Set(prev.map((f) => f.path));
          const newOnes = files.filter((f) => !existingPaths.has(f.path));
          return [...prev, ...newOnes];
        });
        toast.success(`成功载入 ${files.length} 个待去重短视频`);
        detectBlindWatermarkForFiles(files);
      }
    } catch (err: any) {
      toast.error(`选取视频失败: ${err?.toString() || err}`);
    }
  };

  // 解析并下载多平台无水印原片
  const handleResolveNoWatermark = async () => {
    if (!noWatermarkShareText.trim()) {
      toast.error("请先粘贴短视频分享文案或链接");
      return;
    }
    setIsResolvingNoWatermark(true);
    setNoWatermarkResult(null);
    try {
      toast.info("正在多通道解析提取无水印原画视频...");
      const res = await invoke<NoWatermarkResult>("download_no_watermark_video", {
        shareText: noWatermarkShareText.trim(),
      });
      if (res && res.local_path) {
        setNoWatermarkResult(res);
        toast.success(`成功下载无水印原画视频: 【${res.title || res.file_name}】`);
        // 自动加入待处理素材列表
        const newMedia: PickedMediaInfo = {
          path: res.local_path,
          name: res.file_name || res.title || "no_watermark.mp4",
          size_mb: res.size_mb || 0,
        };
        setDedupFiles((prev) => {
          const exists = prev.some((p) => p.path === newMedia.path);
          return exists ? prev : [newMedia, ...prev];
        });
        setSelectedDedupIdx(0);
        detectBlindWatermarkForFiles([newMedia]);
      }
    } catch (err: any) {
      let msg = err?.toString() || String(err);
      try {
        const jsonMatch = msg.match(/\{.*"error":\s*"([^"]+)".*\}/);
        if (jsonMatch && jsonMatch[1]) {
          msg = jsonMatch[1];
        } else if (msg.includes("解析下载无水印视频失败:")) {
          msg = msg.replace("解析下载无水印视频失败:", "").trim();
        }
      } catch (_) {}
      toast.error(`提取失败: ${msg}`);
    } finally {
      setIsResolvingNoWatermark(false);
    }
  };

  // 执行单视频去重清洗
  const handleExecuteSingleDedup = async (targetIdx?: number) => {
    const idx = targetIdx !== undefined ? targetIdx : selectedDedupIdx;
    const file = dedupFiles[idx];
    if (!file) {
      toast.error("请先选择待清洗的视频文件");
      return;
    }
    setIsDedupProcessing(true);
    try {
      toast.info(`正在执行【${file.name}】去重清洗流水线...`);
      const res = await invoke<RemixResult>("remix_video_dedup", {
        inputPath: file.path,
        speed: dedupSpeed,
        zoom: dedupZoom,
        flipH: dedupFlipH,
        colorTweak: dedupColorTweak,
        vignette: dedupVignette,
        noise: dedupNoise,
        audioVolume: dedupAudioVolume,
        stripBlindWatermark: dedupStripBlindWatermark,
        trimEndSecs: dedupTrimEndSecs > 0 ? dedupTrimEndSecs : undefined,
        trimStartSecs: dedupTrimStartSecs > 0 ? dedupTrimStartSecs : undefined,
        delogoMode: dedupDelogoMode !== "none" ? dedupDelogoMode : undefined,
        dynamicPanZoom: dedupDynamicPanZoom,
        dynamicLighting: dedupDynamicLighting,
        ambientBlurredBg: dedupAmbientBlurredBg,
        splitCanvas: dedupSplitCanvas,
        audioScramble: dedupAudioScramble,
        muteAudio: dedupMuteAudio,
        frameJitter: dedupFrameJitter,
        curvedSpeed: dedupCurvedSpeed,
        filmGrain: dedupFilmGrain,
        microRotate: dedupMicroRotate,
        chromashift: dedupChromashift,
        unsharp: dedupUnsharp,
        fakeCameraExif: dedupFakeCameraExif,
      });
      if (res && res.output_path) {
        setDedupResults((prev) => ({ ...prev, [file.path]: res }));
        toast.success(`【${file.name}】去重清洗完成！(体积: ${res.original_size_mb}MB -> ${res.new_size_mb}MB, 耗时: ${res.duration_secs || 0}s)`);
      }
    } catch (err: any) {
      toast.error(`【${file.name}】清洗失败: ${err?.toString() || err}`);
    } finally {
      setIsDedupProcessing(false);
    }
  };

  // 一键批量清洗所有待处理视频
  const handleExecuteBatchDedupAll = async () => {
    if (dedupFiles.length === 0) {
      toast.error("当前无待清洗视频，请先添加视频");
      return;
    }
    setIsDedupProcessing(true);
    let successCount = 0;
    try {
      for (let i = 0; i < dedupFiles.length; i++) {
        const file = dedupFiles[i];
        setSelectedDedupIdx(i);
        setBatchDedupProgress({ current: i + 1, total: dedupFiles.length });
        toast.info(`[${i + 1}/${dedupFiles.length}] 正在清洗: ${file.name}`);
        try {
          const res = await invoke<RemixResult>("remix_video_dedup", {
            inputPath: file.path,
            speed: dedupSpeed,
            zoom: dedupZoom,
            flipH: dedupFlipH,
            colorTweak: dedupColorTweak,
            vignette: dedupVignette,
            noise: dedupNoise,
            audioVolume: dedupAudioVolume,
            stripBlindWatermark: dedupStripBlindWatermark,
            trimEndSecs: dedupTrimEndSecs > 0 ? dedupTrimEndSecs : undefined,
            trimStartSecs: dedupTrimStartSecs > 0 ? dedupTrimStartSecs : undefined,
            delogoMode: dedupDelogoMode !== "none" ? dedupDelogoMode : undefined,
            dynamicPanZoom: dedupDynamicPanZoom,
            dynamicLighting: dedupDynamicLighting,
            ambientBlurredBg: dedupAmbientBlurredBg,
            splitCanvas: dedupSplitCanvas,
            audioScramble: dedupAudioScramble,
            muteAudio: dedupMuteAudio,
            frameJitter: dedupFrameJitter,
            curvedSpeed: dedupCurvedSpeed,
            filmGrain: dedupFilmGrain,
            microRotate: dedupMicroRotate,
            chromashift: dedupChromashift,
            unsharp: dedupUnsharp,
            fakeCameraExif: dedupFakeCameraExif,
          });
          if (res && res.output_path) {
            setDedupResults((prev) => ({ ...prev, [file.path]: res }));
            successCount++;
          }
        } catch (subErr: any) {
          toast.error(`【${file.name}】清洗失败: ${subErr?.toString() || subErr}`);
        }
      }
      toast.success(`批量去重清洗完毕！成功处理 ${successCount} / ${dedupFiles.length} 个视频`);
    } finally {
      setIsDedupProcessing(false);
      setBatchDedupProgress(null);
    }
  };

  // 一键全自动：1~N条视频逐段去重清洗 + 动态转场拼接合并
  const handleExecuteBatchDedupAndMerge = async () => {
    if (dedupFiles.length === 0) {
      toast.error("当前无待处理视频，请先添加 1~N 条视频");
      return;
    }
    setIsMerging(true);
    try {
      toast.info(`正在启动【${dedupFiles.length}】条视频智能去重 + 动态转场混剪合并流水线...`);
      const res = await invoke<MergeResult>("remix_and_merge_videos", {
        inputPaths: dedupFiles.map((f) => f.path),
        transition: mergeTransition,
        transitionDuration: mergeTransitionDuration,
        targetResolution: mergeTargetResolution,
        speed: dedupSpeed,
        zoom: dedupZoom,
        flipH: dedupFlipH,
        colorTweak: dedupColorTweak,
        vignette: dedupVignette,
        noise: dedupNoise,
        audioVolume: dedupAudioVolume,
        stripBlindWatermark: dedupStripBlindWatermark,
        trimEndSecs: dedupTrimEndSecs > 0 ? dedupTrimEndSecs : undefined,
        trimStartSecs: dedupTrimStartSecs > 0 ? dedupTrimStartSecs : undefined,
        delogoMode: dedupDelogoMode !== "none" ? dedupDelogoMode : undefined,
        dynamicPanZoom: dedupDynamicPanZoom,
        dynamicLighting: dedupDynamicLighting,
        ambientBlurredBg: dedupAmbientBlurredBg,
        splitCanvas: dedupSplitCanvas,
        audioScramble: dedupAudioScramble,
        muteAudio: dedupMuteAudio,
        frameJitter: dedupFrameJitter,
        curvedSpeed: dedupCurvedSpeed,
        filmGrain: dedupFilmGrain,
        microRotate: dedupMicroRotate,
        chromashift: dedupChromashift,
        unsharp: dedupUnsharp,
        fakeCameraExif: dedupFakeCameraExif,
      });

      if (res && res.output_path) {
        setLastMergeResult(res);
        setActiveDedupView("merge");
        toast.success(`🎉 混剪合并完成！共拼接 ${res.clip_count} 段视频，成片时长: ${res.final_duration}s，体积: ${res.final_size_mb}MB`);
      }
    } catch (err: any) {
      toast.error(`混剪合并失败: ${err?.toString() || err}`);
    } finally {
      setIsMerging(false);
    }
  };

  // 一键将混剪合并后的大片载入矩阵发布任务
  const handleSendMergedVideoToMatrix = (result: MergeResult) => {
    if (!result || !result.output_path) return;
    const fname = result.output_path.split(/[\\/]/).pop() || "merged_video.mp4";
    setVideoPath(result.output_path);
    setVideoFileInfo({
      path: result.output_path,
      name: fname,
      size_mb: result.final_size_mb || 0,
    });
    setLastRemixResult({
      success: true,
      output_path: result.output_path,
      new_size_mb: result.final_size_mb,
      new_duration_secs: result.final_duration,
      resolution: result.resolution,
    });
    setContentType("video");
    setActiveTab("matrix");
    toast.success(`已将混剪合拼大片【${fname}】载入矩阵发布待发素材！`);
  };

  // 在系统文件管理器中打开高亮文件
  const handleOpenInExplorer = async (path: string) => {
    try {
      await invoke("open_path_in_explorer", { path });
    } catch (err: any) {
      toast.error(`打开系统目录失败: ${err?.toString() || err}`);
    }
  };

  // 一键将清洗后的视频载入矩阵发布任务
  const handleSendCleanVideoToMatrix = (result: RemixResult) => {
    if (!result || !result.output_path) return;
    setVideoPath(result.output_path);
    const fname = result.output_path.split(/[/\\]/).pop() || "clean_video.mp4";
    setVideoFileInfo({
      path: result.output_path,
      name: fname,
      size_mb: result.new_size_mb || 0,
    });
    setLastRemixResult(result);
    setContentType("video");
    setActiveTab("matrix");
    toast.success(`已将【${fname}】载入矩阵发布待发素材！`);
  };

  // 测试 LLM 接口连通性
  const handleTestLlm = async () => {
    if (!tempApiKey.trim()) {
      toast.error("请先输入 API Key 再进行连通性测试");
      return;
    }
    setIsTestingLlm(true);
    try {
      const res = await invoke<string>("test_llm_connection", {
        apiKey: tempApiKey.trim(),
        baseUrl: tempBaseUrl.trim() || undefined,
        model: tempModel.trim() || undefined,
      });
      let displayMsg = res;
      try {
        const parsed = JSON.parse(res);
        if (parsed.reply) {
          displayMsg = `${parsed.model || "模型"} 响应: "${parsed.reply}"`;
        }
      } catch {}
      toast.success("🎉 连通性测试通过！" + displayMsg);
    } catch (err: any) {
      toast.error("连接测试失败: " + (err?.toString() || err));
    } finally {
      setIsTestingLlm(false);
    }
  };

  // 保存全局 LLM 配置
  const handleSaveLlmConfig = () => {
    setAiApiKey(tempApiKey);
    setAiBaseUrl(tempBaseUrl);
    setAiModel(tempModel);
    localStorage.setItem("duck_ai_api_key", tempApiKey);
    localStorage.setItem("duck_ai_base_url", tempBaseUrl);
    localStorage.setItem("duck_ai_model", tempModel);
    setShowLlmConfigModal(false);
    toast.success("AI 大模型配置已保存！发布文案将自动调用此配置。");
  };

  // 生成 AI 爆款文案 (同时传递 topic 和 prompt 确保参数兼容)
  const handleGenerateAiCopy = async () => {
    if (!aiPrompt.trim()) {
      toast.error("请输入视频主题或核心卖点");
      return;
    }
    setIsGeneratingAi(true);
    try {
      const res = await invoke<CopywritingResult>("generate_ai_copywriting", {
        topic: aiPrompt.trim(),
        prompt: aiPrompt.trim(),
        platform: aiPlatform || selectedPlatform,
        apiKey: aiApiKey.trim() || undefined,
        baseUrl: aiBaseUrl.trim() || undefined,
        model: aiModel.trim() || undefined,
      });
      setAiResult(res);
      toast.success("AI 爆款文案生成成功！");
    } catch (err: any) {
      toast.error(`生成文案失败: ${err?.toString() || err}`);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // 应用 AI 爆款文案到表单
  const applyAiCopy = () => {
    if (!aiResult) return;
    setTitle(aiResult.title);
    setSummary(aiResult.summary);
    setShowAiModal(false);
    toast.success("已将 AI 爆款文案与话题一键填充到发布表单！");
  };

  // 生成 Edge-TTS 配音与字幕
  const handleGenerateTts = async () => {
    if (!ttsText.trim()) {
      toast.error("请输入需要配音的文字内容");
      return;
    }
    setIsGeneratingTts(true);
    try {
      const res = await invoke<TtsResult>("generate_edge_tts", {
        text: ttsText.trim(),
        voice: ttsVoice,
      });
      setTtsResult(res);
      toast.success("微软 Edge-TTS 配音与 SRT 字幕生成完毕！");
    } catch (err: any) {
      toast.error(`生成配音失败: ${err?.toString() || err}`);
    } finally {
      setIsGeneratingTts(false);
    }
  };

  // Execute Matrix Publishing (Multi-Account Supported)
  const handleExecutePublish = async () => {
    if (!videoPath.trim()) {
      toast.error("请输入或选取待发布的视频/素材文件路径");
      return;
    }

    const platformConfig = MATRIX_PLATFORMS[selectedPlatform] || MATRIX_PLATFORMS.douyin;
    const platformAccounts = accounts.filter((a) => a.platformId === selectedPlatform);

    // 确定本次发布的执行账号列表
    let targetAccounts: MatrixAccount[] = [];
    if (selectedPublishAccountIds.length > 0) {
      targetAccounts = platformAccounts.filter((a) => selectedPublishAccountIds.includes(a.id));
    }

    // 如果未显式勾选，且存在该平台账号，默认取第一个账号
    if (targetAccounts.length === 0 && platformAccounts.length > 0) {
      const defaultAcc = platformAccounts.find((a) => a.status === "logged_in") || platformAccounts[0];
      targetAccounts = [defaultAcc];
    }

    // 若该平台完全没有任何账号，提示用户先去添加并登录
    if (targetAccounts.length === 0) {
      toast.error(`请先在【自媒体账号】管理中添加【${platformConfig.name}】的账号并扫码登录！`);
      setActiveTab("accounts");
      return;
    }

    setIsPublishing(true);
    setPublishLogs([]);

    const log = (msg: string) => {
      const timeStr = new Date().toLocaleTimeString();
      setPublishLogs((prev) => [...prev, `[${timeStr}] ${msg}`]);
    };

    // 智能扩展名与内容类型自动对齐
    const isVideoFile = [".mp4", ".mov", ".mkv", ".flv", ".avi", ".webm", ".ts", ".m4v"].some((ext) =>
      videoPath.toLowerCase().endsWith(ext)
    );
    let resolvedContentType: "video" | "image" = contentType;
    if (isVideoFile && resolvedContentType !== "video") {
      log(`[智能纠偏] 检测到素材文件为视频格式 (${videoPath.split(/[/\\]/).pop()})，已自动校正发布类型为: 短视频 (Video)`);
      resolvedContentType = "video";
      setContentType("video");
    } else if (!platformConfig.supports.includes(resolvedContentType)) {
      if (platformConfig.supports.includes("video")) {
        log(`[智能纠偏] 目标平台【${platformConfig.name}】不支持 ${resolvedContentType} 发布，已自动切换为: 短视频 (Video)`);
        resolvedContentType = "video";
        setContentType("video");
      }
    }

    log(`准备执行 ${platformConfig.name} 矩阵发布，共选定 ${targetAccounts.length} 个账号...`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targetAccounts.length; i++) {
      const acc = targetAccounts[i];
      const boundProfile = profiles.find((p) => p.id === acc.profileId);
      const profileName = boundProfile?.name || acc.profileId;

      log(`----------------------------------------`);
      log(`[${i + 1}/${targetAccounts.length}] 正在发布至账号: 【${acc.accountName}】 (绑定环境: ${profileName})`);

      if (acc.status !== "logged_in") {
        log(`[提示] 账号【${acc.accountName}】当前标记为未登录，系统将使用该环境持久化缓存尝试发布...`);
      }

      try {
        const payload: MatrixPublishPayload = {
          platformId: selectedPlatform,
          contentType: resolvedContentType,
          filePath: videoPath.trim(),
          coverPath: coverPath.trim() || undefined,
          title: title.trim(),
          summary: summary.trim(),
          isOriginal,
        };

        const steps = compileMatrixPublishWorkflow(payload);
        log(`编译生成 ${steps.length} 个原子级 Playwright 自动化步骤`);

        toast.info(`[${i + 1}/${targetAccounts.length}] 正在向【${acc.accountName}】发布...`);

        const res = await invoke<any>("run_workflow", {
          id: acc.profileId,
          steps,
          headless: isHeadless,
        });

        const results: any[] = res?.results || (Array.isArray(res) ? res : []);
        const failedEntry = results.find((r: any) => r.ok === false && !r.skipped);
        if (failedEntry) {
          throw new Error(`执行在步骤 #${failedEntry.stepIndex} [${failedEntry.name}] 阻断: ${failedEntry.error || failedEntry.note || "未达成目标"}`);
        }

        // 进一步打印最终验证步骤确认信息
        const verifyEntry = results.find((r: any) => r.action === "verify_publish");
        if (verifyEntry && verifyEntry.note) {
          log(`[发布核验确认] ${verifyEntry.note}`);
        }

        log(`【${acc.accountName}】发布完成！所有步骤执行成功。`);
        successCount++;

        const record: PublishTaskRecord = {
          id: String(Date.now() + i),
          platformName: `${platformConfig.name} (${acc.accountName})`,
          title: title || videoPath.split(/[/\\]/).pop() || "未命名作品",
          filePath: videoPath,
          profileName: `${acc.accountName} [${profileName}]`,
          time: new Date().toLocaleString(),
          status: "success",
        };

        setPublishHistory((prev) => {
          const next = [record, ...prev.slice(0, 19)];
          localStorage.setItem("matrix_publish_history", JSON.stringify(next));
          return next;
        });
      } catch (err: any) {
        const errMsg = err?.toString() || String(err);
        log(`[错误] 【${acc.accountName}】发布异常: ${errMsg}`);
        failCount++;

        const record: PublishTaskRecord = {
          id: String(Date.now() + i),
          platformName: `${platformConfig.name} (${acc.accountName})`,
          title: title || videoPath.split(/[/\\]/).pop() || "未命名作品",
          filePath: videoPath,
          profileName: `${acc.accountName} [${profileName}]`,
          time: new Date().toLocaleString(),
          status: "failed",
        };

        setPublishHistory((prev) => {
          const next = [record, ...prev.slice(0, 19)];
          localStorage.setItem("matrix_publish_history", JSON.stringify(next));
          return next;
        });
      }
    }

    setIsPublishing(false);
    log(`========================================`);
    log(`矩阵任务执行完毕: 成功 ${successCount} 个, 失败 ${failCount} 个`);
    if (failCount === 0) {
      toast.success(`🎉 所选 ${successCount} 个账号已全部自动发布成功！`);
    } else {
      toast.warning(`发布完成：成功 ${successCount} 个，失败 ${failCount} 个`);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* 顶部标题与状态汇总 */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card/60 px-6 py-3.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm">
            <LuAppWindow className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold leading-none">应用生态中心 (Apps)</h1>
              <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                双核心：StreamCap 实时录制 + 矩阵全自动发布
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              集成 40+ 平台高清直播录制，与 12+ 主流自媒体/短视频平台全自动一键矩阵分发流水线
            </p>
          </div>
        </div>

        {/* 顶部快捷状态指示器 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-background/80 px-3 py-1.5 text-xs">
            <span
              className={`size-2 rounded-full ${
                status?.running ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-neutral-400"
              }`}
            />
            <span className="font-medium text-foreground">
              {status?.running ? "StreamCap 录制中" : "StreamCap 未运行"}
            </span>
            <span className="text-muted-foreground">· 端口 {status?.port || 6006}</span>
          </div>

          {status?.running ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleStop}
              disabled={loading}
              className="h-8 gap-1.5 border-rose-500/30 text-rose-600 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-400"
            >
              <LuSquare className="size-3.5 fill-current" />
              停止服务
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleStart}
              disabled={loading}
              className="h-8 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {loading ? <LuRefreshCw className="size-3.5 animate-spin" /> : <LuPlay className="size-3.5 fill-current" />}
              启动 StreamCap
            </Button>
          )}
        </div>
      </div>

      {/* 主工作区 Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/20 px-6 py-2">
          <TabsList className="bg-muted/60 p-0.5">
            <TabsTrigger value="matrix" className="gap-2 text-xs">
              <LuSend className="size-3.5" />
              矩阵全自动发布 (原发布鸭核心)
            </TabsTrigger>
            <TabsTrigger
              value="collect"
              className="gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-300"
            >
              <LuFolderPlus className="size-3.5 text-emerald-500" />
              矩阵全自动材料收集
            </TabsTrigger>
            <TabsTrigger
              value="dedup"
              className="gap-2 text-xs font-medium text-amber-600 dark:text-amber-400 data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-700 dark:data-[state=active]:text-amber-300"
            >
              <LuScissors className="size-3.5 text-amber-500" />
              视频智能去重与防查重清洗
              {dedupFiles.length > 0 && (
                <span className="ml-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-mono">
                  {dedupFiles.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="accounts" className="gap-2 text-xs">
              <LuUsers className="size-3.5" />
              自媒体账号与会话 ({accounts.length})
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="gap-2 text-xs font-medium text-blue-600 dark:text-blue-400 data-[state=active]:bg-blue-500/15 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-300"
            >
              <LuChartLine className="size-3.5 text-blue-500" />
              自媒体账号数据分析
            </TabsTrigger>
            <TabsTrigger value="streamcap" className="gap-2 text-xs">
              <LuVideo className="size-3.5" />
              StreamCap 直播录制器
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-2 text-xs">
              <LuList className="size-3.5" />
              平台定位器与规则字典 (12+)
            </TabsTrigger>
            <TabsTrigger value="guide" className="gap-2 text-xs">
              <LuRadio className="size-3.5" />
              支持平台与运营技巧
            </TabsTrigger>
            <TabsTrigger value="hub" className="gap-2 text-xs">
              <LuLayers className="size-3.5" />
              生态扩展计划
            </TabsTrigger>
          </TabsList>

          {/* 右侧操作按钮组 (当在 dedup tab 时展示) */}
          {activeTab === "dedup" && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setNoWatermarkShareText("");
                  setNoWatermarkResult(null);
                  setShowNoWatermarkModal(true);
                }}
                className="h-7 text-xs bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm gap-1.5 font-medium"
              >
                <LuSparkles className="size-3" />
                提取无水印原片
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handlePickDedupVideos}
                className="h-7 text-xs border-amber-500/30 text-amber-600 hover:bg-amber-500/10 gap-1.5 font-medium"
              >
                <LuFolderOpen className="size-3.5 text-amber-500" />
                批量添加视频
              </Button>
              {dedupFiles.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDedupFiles([]);
                    setSelectedDedupIdx(0);
                    setDedupResults({});
                  }}
                  className="h-7 text-xs text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 gap-1"
                >
                  <LuTrash2 className="size-3" />
                  清空列表
                </Button>
              )}
            </div>
          )}

          {/* 右侧操作按钮组 (当在 streamcap tab 时展示) */}
          {activeTab === "streamcap" && (
            <div className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none hover:text-foreground">
                <input
                  type="checkbox"
                  checked={autoStart}
                  onChange={(e) => toggleAutoStart(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-0"
                />
                进入此页自动启动
              </label>

              <div className="h-3.5 w-px bg-border" />

              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenFolder}
                className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                title="打开视频下载保存目录"
              >
                <LuFolder className="size-3.5" />
                打开下载目录
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshIframe}
                disabled={!status?.running}
                className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                title="重新加载内嵌界面"
              >
                <LuRefreshCw className="size-3.5" />
                刷新视图
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenInBrowser}
                disabled={!status?.running}
                className="h-7 gap-1.5 text-xs"
                title="在外部系统浏览器全屏体验"
              >
                <LuExternalLink className="size-3.5" />
                外部浏览器打开
              </Button>
            </div>
          )}
        </div>

        {/* Tab: 矩阵全自动发布 (Matrix Publisher) */}
        <TabsContent value="matrix" className="m-0 flex min-h-0 flex-1 flex-col overflow-y-auto p-6 data-[state=inactive]:hidden">
          <div className="mx-auto max-w-6xl space-y-6">
            {/* 顶栏平台快速选择卡片 */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <LuShare2 className="size-4 text-primary" />
                    选择目标发布平台 (已解密并原生化 12 大主流平台规则)
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    基于原生 Playwright 驱动，直接挂载指纹环境独立 Cookie 与住宅代理，无需任何破解旁路进程与 hosts 劫持
                  </p>
                </div>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                  纯原生内核驱动 · 零黑客劫持
                </Badge>
              </div>

              <div className="grid grid-cols-6 gap-2.5">
                {Object.values(MATRIX_PLATFORMS).map((p) => {
                  const active = selectedPlatform === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedPlatform(p.id);
                        if (!p.supports.includes(contentType)) {
                          setContentType((p.supports[0] as "video" | "image") || "video");
                        }
                      }}
                      className={`relative flex flex-col items-center justify-center rounded-xl border p-3 transition-all select-none ${
                        active
                          ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                          : "border-border/70 bg-background/50 hover:border-border hover:bg-muted/30"
                      }`}
                    >
                      <span className="text-xs font-semibold text-foreground">{p.name.split(" ")[0]}</span>
                      <span className="mt-1 text-[10px] text-muted-foreground">
                        {p.supports.map((s) => (s === "video" ? "视频" : s === "image" ? "图文" : "文章")).join(" / ")}
                      </span>
                      {active && (
                        <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 核心配置表单与操作区 */}
            <div className="grid grid-cols-12 gap-6">
              {/* 左侧：发布表单 */}
              <div className="col-span-7 space-y-4 rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between pb-1 border-b border-border/50">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <LuSlidersHorizontal className="size-4 text-sky-500" />
                    发布内容配置
                  </h4>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAiPlatform(selectedPlatform);
                        if (!aiPrompt && title) setAiPrompt(title);
                        setShowAiModal(true);
                      }}
                      className="h-7 text-xs border-indigo-500/30 text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-400 gap-1.5"
                    >
                      <LuSparkles className="size-3.5 text-indigo-500" />
                      AI 爆款文案工坊
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!ttsText && summary) setTtsText(summary);
                        setShowTtsModal(true);
                      }}
                      className="h-7 text-xs border-sky-500/30 text-sky-600 hover:bg-sky-500/10 dark:text-sky-400 gap-1.5"
                    >
                      <LuMic className="size-3.5 text-sky-500" />
                      Edge-TTS 智能配音台
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setTempApiKey(aiApiKey);
                        setTempBaseUrl(aiBaseUrl);
                        setTempModel(aiModel);
                        setShowLlmConfigModal(true);
                      }}
                      className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-2 border border-border/50 hover:bg-muted"
                      title="配置全局 AI 大模型 API Key / 接口地址"
                    >
                      <LuSlidersHorizontal className="size-3 text-indigo-500" />
                      AI 模型配置
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* 发布目标账号选择 */}
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <LuUserCheck className="size-3.5 text-primary" />
                        发布目标账号 (选择已登录的矩阵账号，支持多选批量分发)
                      </Label>
                      <button
                        type="button"
                        onClick={() => setActiveTab("accounts")}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <LuUserPlus className="size-3" />
                        管理账号 / 扫码登录
                      </button>
                    </div>

                    {(() => {
                      const platformAccounts = accounts.filter((a) => a.platformId === selectedPlatform);
                      if (platformAccounts.length === 0) {
                        return (
                          <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                            <div className="flex items-start gap-2.5">
                              <LuTriangleAlert className="size-4 text-amber-500 shrink-0 mt-0.5" />
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                  尚未纳管【{MATRIX_PLATFORMS[selectedPlatform]?.name}】的自媒体账号
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  发布视频必须具有对应平台的创作者登录态。请先纳管账号并扫码登录。
                                </p>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setActiveTab("accounts")}
                                  className="mt-1 h-7 text-xs border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                                >
                                  <LuPlus className="size-3 mr-1" />
                                  立即纳管账号并扫码登录
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="mt-2 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            {platformAccounts.map((acc) => {
                              const isSelected =
                                selectedPublishAccountIds.includes(acc.id) ||
                                (selectedPublishAccountIds.length === 0 && platformAccounts[0].id === acc.id);
                              const boundProf = profiles.find((p) => p.id === acc.profileId);
                              return (
                                <div
                                  key={acc.id}
                                  onClick={() => {
                                    setSelectedPublishAccountIds((prev) =>
                                      prev.includes(acc.id)
                                        ? prev.filter((x) => x !== acc.id)
                                        : [...prev, acc.id]
                                    );
                                  }}
                                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-2.5 text-xs transition-all select-none ${
                                    isSelected
                                      ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                                      : "border-border bg-background hover:border-border hover:bg-muted/30"
                                  }`}
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => {}}
                                      className="rounded border-border text-primary focus:ring-0 shrink-0"
                                    />
                                    <div className="truncate">
                                      <div className="font-semibold text-foreground truncate flex items-center gap-1.5">
                                        <span className="truncate">{acc.accountName}</span>
                                        {acc.status === "logged_in" ? (
                                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[9px] px-1 py-0 shrink-0">
                                            已登录
                                          </Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-muted-foreground text-[9px] px-1 py-0 shrink-0">
                                            未登录
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground truncate">
                                        环境: {boundProf?.name || acc.profileId.slice(0, 8)}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground">发布内容类型</Label>
                      {!supportsImage && (
                        <span className="text-[11px] text-muted-foreground">
                          【{currentPlatformConfig.name.split(" ")[0]}】仅支持短视频发布
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={contentType === "video" ? "default" : "outline"}
                        onClick={() => setContentType("video")}
                        className={`h-8 flex-1 text-xs gap-1.5 transition-all ${
                          contentType === "video"
                            ? "bg-primary text-primary-foreground font-semibold shadow-sm ring-1 ring-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        }`}
                      >
                        <LuVideo className="size-3.5" />
                        短视频 (Video)
                        {contentType === "video" && <LuCheck className="size-3 ml-1" />}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!supportsImage}
                        variant={contentType === "image" ? "default" : "outline"}
                        onClick={() => {
                          if (supportsImage) {
                            setContentType("image");
                          }
                        }}
                        className={`h-8 flex-1 text-xs gap-1.5 transition-all ${
                          contentType === "image"
                            ? "bg-primary text-primary-foreground font-semibold shadow-sm ring-1 ring-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        } ${!supportsImage ? "cursor-not-allowed opacity-50" : ""}`}
                        title={
                          !supportsImage
                            ? `【${currentPlatformConfig.name}】暂不支持图文发布`
                            : "切换为图文发布模式"
                        }
                      >
                        <LuImage className="size-3.5" />
                        图文内容 (Image)
                        {!supportsImage ? (
                          <span className="text-[10px] opacity-70 ml-0.5">(不支持)</span>
                        ) : contentType === "image" ? (
                          <LuCheck className="size-3 ml-1" />
                        ) : null}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* 待发布短视频/图文素材文件 (原生系统文件选择器 + StreamCap 库 + 备选路径输入) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      {contentType === "video" ? (
                        <LuVideo className="size-3.5 text-primary" />
                      ) : (
                        <LuImage className="size-3.5 text-primary" />
                      )}
                      {contentType === "video" ? "待发布视频文件" : "待发布图文素材文件"}
                      <Badge variant="outline" className="text-[10px] text-muted-foreground font-normal ml-1">
                        必选
                      </Badge>
                    </Label>
                    {contentType === "video" && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            loadDownloadedVideos();
                            setShowVideoPicker(!showVideoPicker);
                          }}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <LuFileVideo className="size-3.5" />
                          从 StreamCap 录制库选取 ({downloadedVideos.length})
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 选定视频素材卡片 */}
                  {videoPath ? (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 transition-all shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                            {contentType === "video" ? (
                              <LuFileVideo className="size-5" />
                            ) : (
                              <LuImage className="size-5" />
                            )}
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span
                                className="font-semibold text-xs text-foreground truncate max-w-[280px]"
                                title={videoFileInfo?.name || videoPath.split(/[/\\]/).pop()}
                              >
                                {videoFileInfo?.name || videoPath.split(/[/\\]/).pop()}
                              </span>
                              {videoFileInfo?.size_mb && videoFileInfo.size_mb > 0 ? (
                                <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] px-1.5 py-0">
                                  {videoFileInfo.size_mb} MB
                                </Badge>
                              ) : null}
                              <Badge variant="outline" className="text-[9px] text-muted-foreground uppercase px-1 py-0">
                                {videoPath.split(".").pop() || (contentType === "video" ? "VIDEO" : "IMAGE")}
                              </Badge>
                              {lastRemixResult ? (
                                <Badge className="bg-emerald-600 text-white border-emerald-600 text-[9px] px-1.5 py-0 flex items-center gap-1 font-bold">
                                  <LuShieldCheck className="size-3" /> 暗水印已移除 (100% 破坏)
                                </Badge>
                              ) : videoFileInfo?.blindWatermarkDetecting ? (
                                <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[9px] px-1 py-0 animate-pulse">
                                  暗水印检测中...
                                </Badge>
                              ) : videoFileInfo?.blindWatermarkDetected !== undefined ? (
                                videoFileInfo.blindWatermarkDetected ? (
                                  <Badge className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[9px] px-1.5 py-0 flex items-center gap-1 font-semibold">
                                    <LuShieldAlert className="size-3" /> 存在暗水印 ({videoFileInfo.blindWatermarkScore}分)
                                  </Badge>
                                ) : (
                                  <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[9px] px-1.5 py-0 flex items-center gap-1 font-semibold">
                                    <LuShieldCheck className="size-3" /> 不存在暗水印
                                  </Badge>
                                )
                              ) : null}
                            </div>
                            <p className="text-[11px] text-muted-foreground font-mono truncate max-w-[380px]" title={videoPath}>
                              {videoPath}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {contentType === "video" && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={handleRemixVideo}
                              disabled={isRemixing}
                              className="h-7 text-xs border-amber-500/40 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400 gap-1 font-medium"
                              title="微缩放(1.02x) + 微变速(1.03x) + 剥离设备元数据防查重"
                            >
                              {isRemixing ? (
                                <LuRefreshCw className="size-3 animate-spin text-amber-500" />
                              ) : (
                                <LuScissors className="size-3 text-amber-500" />
                              )}
                              {isRemixing ? "正在清洗..." : "智能去重"}
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handlePickVideo}
                            className="h-7 text-xs border-primary/30 hover:bg-primary/10 gap-1 text-primary"
                          >
                            <LuFolderOpen className="size-3" />
                            重选文件
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setVideoPath("");
                              setVideoFileInfo(null);
                              setLastRemixResult(null);
                            }}
                            className="h-7 text-xs text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                            title="移除此素材"
                          >
                            <LuTrash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* 未选择视频时：显眼直观的一键选择大按钮 */
                    <div
                      onClick={handlePickVideo}
                      className="group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/80 bg-muted/10 p-4 text-center transition-all hover:border-primary hover:bg-primary/5 select-none"
                    >
                      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
                        <LuFolderOpen className="size-5" />
                      </div>
                      <p className="mt-2 text-xs font-semibold text-foreground group-hover:text-primary">
                        {contentType === "video"
                          ? "点击打开系统文件选择器 · 选取本地视频文件"
                          : "点击打开系统文件选择器 · 选取本地图文素材"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {contentType === "video"
                          ? "支持 MP4, MOV, MKV, FLV, AVI, WebM, TS 等格式 · 自动同步作品标题"
                          : "支持 JPG, PNG, WEBP, BMP 等常见图片格式 · 自动同步作品标题"}
                      </p>
                    </div>
                  )}

                  {/* 快速备选：手动路径输入框与右侧快速浏览按钮 */}
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder={
                        contentType === "video"
                          ? "或在此处直接输入/粘贴视频绝对路径..."
                          : "或在此处直接输入/粘贴图片绝对路径..."
                      }
                      value={videoPath}
                      onChange={(e) => {
                        const val = e.target.value;
                        setVideoPath(val);
                        if (val.trim()) {
                          const fname = val.split(/[/\\]/).pop() || "";
                          setVideoFileInfo({ path: val, name: fname, size_mb: 0 });
                          if (/\.(mp4|mov|mkv|flv|avi|webm|ts|m4v)$/i.test(val.trim())) {
                            setContentType("video");
                          }
                          if (!title.trim()) {
                            setTitle(fname.replace(/\.[^/.]+$/, ""));
                          }
                        } else {
                          setVideoFileInfo(null);
                        }
                      }}
                      className="h-8 text-xs font-mono"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={handlePickVideo}
                      className="h-8 shrink-0 text-xs gap-1.5 px-3"
                      title="打开系统窗口选择本地文件"
                    >
                      <LuFolderOpen className="size-3.5 text-primary" />
                      浏览文件...
                    </Button>
                  </div>

                  {/* 快速展开的 StreamCap 录制文件弹窗 */}
                  {showVideoPicker && (
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2 space-y-1">
                      <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-muted-foreground border-b border-border/60">
                        <span>StreamCap 最新录制视频</span>
                        <span>大小</span>
                      </div>
                      {downloadedVideos.length === 0 ? (
                        <p className="p-3 text-center text-xs text-muted-foreground">
                          StreamCap 录制目录暂无视频，请先在录制器中抓取直播流
                        </p>
                      ) : (
                        downloadedVideos.map((v) => (
                          <div
                            key={v.path}
                            onClick={() => {
                              setVideoPath(v.path);
                              setVideoFileInfo({
                                path: v.path,
                                name: v.name,
                                size_mb: v.size_mb,
                              });
                              setShowVideoPicker(false);
                              if (!title) {
                                setTitle(v.name.replace(/\.[^/.]+$/, ""));
                              }
                              toast.success(`已载入素材: ${v.name}`);
                            }}
                            className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-primary/10 select-none"
                          >
                            <span className="truncate max-w-[320px] font-medium text-foreground">{v.name}</span>
                            <span className="text-muted-foreground">{v.size_mb} MB</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* 作品标题 */}
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">作品标题 (Title)</Label>
                    <div className="flex items-center gap-2">
                      {selectedPlatform === "weixin" && title.length > 16 && (
                        <span className="text-[11px] text-amber-500 font-medium">
                          (视频号短标题限 6-16 字，超出将由系统合规截取，完整标题完整保留在视频描述中)
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">{title.length} 字</span>
                    </div>
                  </div>
                  <Input
                    placeholder="吸引眼球的作品标题..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1.5 text-xs"
                  />
                  {selectedPlatform === "weixin" && (
                    <div className="mt-1.5 flex items-center justify-between text-[11px] rounded bg-muted/40 px-2 py-1 border border-border/50">
                      <span className="text-muted-foreground flex items-center gap-1">
                        视频号合规短标题预览:{" "}
                        <strong className={formatWeixinShortTitle(title) ? "text-emerald-500 font-medium" : "text-amber-500/90 font-normal"}>
                          {formatWeixinShortTitle(title) || "(字数不足6字或含非法符号，发布鸭逻辑：选填项安全留空，规避红字报错)"}
                        </strong>
                      </span>
                      {formatWeixinShortTitle(title) && (
                        <span className="text-emerald-500 font-mono text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          {formatWeixinShortTitle(title).length} / 16 字
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 描述与话题标签 */}
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">描述与话题标签 (Summary & #Tags)</Label>
                    {!summary.trim() && (
                      <span className="text-[11px] text-amber-500/90">
                        (留空时将自动使用作品标题作为正文描述)
                      </span>
                    )}
                  </div>
                  <textarea
                    rows={3}
                    placeholder="正文简介，输入 #自动关联话题...（若留空，发布时将自动填充作品标题作为核心描述）"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    className="mt-1.5 flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <LuTag className="size-3" /> 爆款推荐:
                    </span>
                    {["#生活记录", "#好物推荐", "#涨知识", "#科技数码", "#带货精选", "#精彩瞬间"].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => addQuickTag(tag)}
                        className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 自定义封面 (可选，支持原生图片选择器) */}
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <LuImage className="size-3.5 text-muted-foreground" />
                      自定义封面 (可选图片完整路径)
                    </Label>
                    {coverPath && (
                      <button
                        type="button"
                        onClick={() => {
                          setCoverPath("");
                          setCoverFileInfo(null);
                        }}
                        className="text-[11px] text-muted-foreground hover:text-rose-500"
                      >
                        清空封面
                      </button>
                    )}
                  </div>

                  <div className="mt-1.5 flex items-center gap-2">
                    <Input
                      placeholder="选填：自定义封面图片完整路径 (例如 C:\covers\cover.jpg)"
                      value={coverPath}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCoverPath(val);
                        if (val.trim()) {
                          const fname = val.split(/[/\\]/).pop() || "";
                          setCoverFileInfo({ path: val, name: fname, size_mb: 0 });
                        } else {
                          setCoverFileInfo(null);
                        }
                      }}
                      className="h-8 text-xs font-mono"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handlePickCover}
                      className="h-8 shrink-0 text-xs gap-1.5 px-3"
                    >
                      <LuImage className="size-3.5 text-primary" />
                      选择封面图片...
                    </Button>
                  </div>
                  {coverFileInfo && (
                    <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <LuCircleCheck className="size-3" />
                      已选封面: {coverFileInfo.name} {coverFileInfo.size_mb > 0 ? `(${coverFileInfo.size_mb} MB)` : ""}
                    </div>
                  )}
                </div>

                {/* 原创声明策略选择 (对齐发布鸭发布模式) */}
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <LuSparkles className="size-3.5 text-primary" />
                      原创声明模式 (对齐发布鸭策略)
                    </Label>
                    <span className="text-[11px] text-muted-foreground">
                      请选择视频分发策略
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setIsOriginal(false)}
                      className={`flex flex-col items-start gap-1 rounded-md border p-2.5 text-left transition-all ${
                        !isOriginal
                          ? "border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary/30"
                          : "border-border/60 bg-background/50 hover:bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-semibold text-foreground">直接发表 (不声明原创)</span>
                        {!isOriginal && <LuCircleCheck className="size-3.5 text-primary" />}
                      </div>
                      <span className="text-[11px] text-muted-foreground leading-tight">
                        快速分发，平台提示“未声明原创”弹窗时，系统自动响应点击【直接发表 / 继续发表】
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsOriginal(true)}
                      className={`flex flex-col items-start gap-1 rounded-md border p-2.5 text-left transition-all ${
                        isOriginal
                          ? "border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary/30"
                          : "border-border/60 bg-background/50 hover:bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-semibold text-foreground">声明原创 (开启原创保护)</span>
                        {isOriginal && <LuCircleCheck className="size-3.5 text-primary" />}
                      </div>
                      <span className="text-[11px] text-muted-foreground leading-tight">
                        自动勾选原创声明协议条款，并在弹窗中提交确认，向平台申报原创作品保护
                      </span>
                    </button>
                  </div>
                </div>

                {/* 开关选项 */}
                <div className="flex items-center justify-between border-t border-border/60 pt-3">
                  <div className="flex items-center gap-4">
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none hover:text-foreground">
                      <input
                        type="checkbox"
                        checked={!isHeadless}
                        onChange={(e) => setIsHeadless(!e.target.checked)}
                        className="rounded border-border text-primary focus:ring-0"
                      />
                      可见有头模式 (观看自动操作)
                    </label>
                  </div>

                  <Button
                    onClick={handleExecutePublish}
                    disabled={isPublishing}
                    className="gap-2 bg-primary px-6 text-xs text-primary-foreground font-semibold shadow hover:bg-primary/90"
                  >
                    {isPublishing ? (
                      <LuRefreshCw className="size-3.5 animate-spin" />
                    ) : (
                      <LuSend className="size-3.5" />
                    )}
                    {isPublishing ? "正在自动化发布中..." : "一键开始自动化发布"}
                  </Button>
                </div>
              </div>

              {/* 右侧：实时自动化日志与历史发布记录 */}
              <div className="col-span-5 flex flex-col gap-4">
                {/* 实时执行终端 */}
                <div className="flex flex-1 flex-col rounded-xl border border-border bg-neutral-950 p-4 text-neutral-200 shadow-inner">
                  <div className="mb-2 flex items-center justify-between border-b border-neutral-800 pb-2">
                    <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
                      <LuTerminal className="size-3.5 text-emerald-400" />
                      原生 Playwright 执行流水线
                    </div>
                    {isPublishing && (
                      <Badge variant="outline" className="h-5 text-[10px] border-emerald-500/40 text-emerald-400">
                        执行中
                      </Badge>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto font-mono text-xs leading-relaxed space-y-1.5 min-h-[160px] max-h-[220px]">
                    {publishLogs.length === 0 ? (
                      <p className="text-neutral-500 text-xs italic">
                        就绪。配置完毕后点击「一键开始自动化发布」，将实时显示驱动进度。
                      </p>
                    ) : (
                      publishLogs.map((log, idx) => (
                        <p key={idx} className="break-all text-[11px] text-emerald-300">
                          {log}
                        </p>
                      ))
                    )}
                  </div>
                </div>

                {/* 历史任务看板 */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h4 className="text-xs font-semibold text-foreground flex items-center gap-2 mb-2.5">
                    <LuClock className="size-3.5 text-muted-foreground" />
                    最近发布任务记录 ({publishHistory.length})
                  </h4>

                  <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                    {publishHistory.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">暂无历史发布记录</p>
                    ) : (
                      publishHistory.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-2 text-xs"
                        >
                          <div className="truncate max-w-[200px]">
                            <div className="font-medium text-foreground truncate">{item.title}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {item.platformName} · {item.profileName}
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge
                              variant="outline"
                              className={`text-[10px] h-4 ${
                                item.status === "success"
                                  ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                                  : "border-rose-500/30 text-rose-600 dark:text-rose-400"
                              }`}
                            >
                              {item.status === "success" ? "已完成" : "失败"}
                            </Badge>
                            <div className="text-[10px] text-muted-foreground mt-0.5">{item.time.slice(5, 16)}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab: 矩阵全自动材料收集 (博主/专辑/无水印提取/定时采集) */}
        <TabsContent value="collect" className="m-0 flex min-h-0 flex-1 flex-col overflow-y-auto p-6 data-[state=inactive]:hidden">
          <MaterialCollectorPanel
            mediaServerPort={mediaServerPort}
            onSendToDedup={(filePath, fileName, sizeMb) => {
              setDedupFiles((prev) => {
                const exists = prev.some((p) => p.path === filePath);
                return exists
                  ? prev
                  : [{ path: filePath, name: fileName, size_mb: sizeMb || 0 }, ...prev];
              });
              setSelectedDedupIdx(0);
              setActiveTab("dedup");
              toast.success(`已将素材「${fileName}」导入智能去重工作台`);
            }}
            onSendToMatrix={(filePath, fileName, sizeMb) => {
              setVideoPath(filePath);
              setVideoFileInfo({
                path: filePath,
                name: fileName,
                size_mb: sizeMb || 0,
              });
              setContentType("video");
              setActiveTab("matrix");
              toast.success(`已将素材「${fileName}」装载至矩阵发布器`);
            }}
          />
        </TabsContent>

        {/* Tab: 视频智能去重与防查重清洗工作台 */}
        <TabsContent value="dedup" className="m-0 flex min-h-0 flex-1 flex-col overflow-y-auto p-6 data-[state=inactive]:hidden">
          <div className="mx-auto max-w-6xl space-y-6">
            {/* 顶栏 Banner */}
            <div className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-5 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm">
                      <LuScissors className="size-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold text-foreground">短视频智能去重与防查重清洗工作台</h2>
                        <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 text-[10px]">
                          FFmpeg 工业级流水线
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        矩阵操盘必备：微缩放裁剪、微变速 PTS 扭曲、色彩色度抖动、声学指纹重构、全量元数据抹除
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    onClick={handlePickDedupVideos}
                    disabled={isDedupProcessing}
                    className="h-8 gap-1.5 text-xs bg-amber-500 text-white hover:bg-amber-600 shadow-sm font-medium"
                  >
                    <LuFolderOpen className="size-3.5" />
                    添加待处理视频
                  </Button>
                  {downloadedVideos.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const newFiles: PickedMediaInfo[] = downloadedVideos.slice(0, 5).map((d: DownloadedVideoInfo) => ({
                          path: d.path,
                          name: d.name,
                          size_mb: d.size_mb,
                        }));
                        setDedupFiles((prev) => {
                          const existingPaths = new Set(prev.map((f) => f.path));
                          const filtered = newFiles.filter((f) => !existingPaths.has(f.path));
                          return [...prev, ...filtered];
                        });
                        toast.success(`已从 StreamCap 录制库导入 ${newFiles.length} 个视频`);
                        detectBlindWatermarkForFiles(newFiles);
                      }}
                      className="h-8 gap-1 text-xs border-indigo-500/30 text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-400"
                    >
                      <LuVideo className="size-3.5 text-indigo-500" />
                      导入 StreamCap 录制 ({downloadedVideos.length})
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* 去重清洗预设策略卡片 */}
            <div className="space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <LuSlidersHorizontal className="size-3.5 text-amber-500" />
                  防查重清洗策略方案
                </Label>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[11px] font-semibold flex items-center gap-1.5 py-0.5 px-2">
                    <LuShieldCheck className="size-3.5" />
                    全部9种去重策略均已100%去除全平台暗水印 (空间解耦+DCT掩膜+SEI净化)
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 策略 1: TikTok FYP 顶级过审 🔥 */}
                <div
                  onClick={() => applyDedupPreset("fyp")}
                  className={`cursor-pointer rounded-xl border p-4 transition-all relative ${
                    dedupPreset === "fyp"
                      ? "border-violet-500 bg-violet-500/10 shadow-sm ring-1 ring-violet-500/50"
                      : "border-border bg-card hover:border-violet-500/40 hover:bg-card/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <LuSparkles className="size-4 text-violet-500" />
                      TikTok FYP 顶级爆破 🔥
                    </span>
                    {dedupPreset === "fyp" && <LuCheck className="size-3.5 text-violet-500" />}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                    物理抹除字节全局 tracking ID · 镜像反转肢体检测 · 呼吸运镜与光影振荡 · 动态波浪变速 · 注入真实 iPhone 15 Pro 相机元数据。
                  </p>
                  <div className="mt-3 flex items-center gap-1 flex-wrap">
                    <Badge variant="outline" className="text-[9px] text-violet-600 dark:text-violet-400 border-violet-500/30">
                      FYP 全能推荐
                    </Badge>
                    <Badge variant="outline" className="text-[9px] text-muted-foreground">
                      声画双抗
                    </Badge>
                  </div>
                </div>

                {/* 策略 2: 画中画动态毛玻璃画布 🖼️ */}
                <div
                  onClick={() => applyDedupPreset("pip")}
                  className={`cursor-pointer rounded-xl border p-4 transition-all relative ${
                    dedupPreset === "pip"
                      ? "border-cyan-500 bg-cyan-500/10 shadow-sm ring-1 ring-cyan-500/50"
                      : "border-border bg-card hover:border-cyan-500/40 hover:bg-card/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <LuLayers className="size-4 text-cyan-500" />
                      画中画毛玻璃画布 🖼️
                    </span>
                    {dedupPreset === "pip" && <LuCheck className="size-3.5 text-cyan-500" />}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                    84% 核心画面居中 + 底层 30px 动态高斯模糊环境底板。彻底改变全画幅图像轮廓与构图，对 CNN/ViT 视觉模型降维打击。
                  </p>
                  <div className="mt-3 flex items-center gap-1 flex-wrap">
                    <Badge variant="outline" className="text-[9px] text-cyan-600 dark:text-cyan-400 border-cyan-500/30">
                      视觉空间重构
                    </Badge>
                    <Badge variant="outline" className="text-[9px] text-muted-foreground">
                      极高过审率
                    </Badge>
                  </div>
                </div>

                {/* 策略 3: 三段分屏上下模糊反射 🎬 */}
                <div
                  onClick={() => applyDedupPreset("split")}
                  className={`cursor-pointer rounded-xl border p-4 transition-all relative ${
                    dedupPreset === "split"
                      ? "border-sky-500 bg-sky-500/10 shadow-sm ring-1 ring-sky-500/50"
                      : "border-border bg-card hover:border-sky-500/40 hover:bg-card/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <LuFilm className="size-4 text-sky-500" />
                      三段分屏上下模糊 🎬
                    </span>
                    {dedupPreset === "split" && <LuCheck className="size-3.5 text-sky-500" />}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                    68% 高度主画面居中 + 上下两端动态虚化反射镜像。2026 最新爆款视觉几何重构，突破多模态视频查重。
                  </p>
                  <div className="mt-3 flex items-center gap-1 flex-wrap">
                    <Badge variant="outline" className="text-[9px] text-sky-600 dark:text-sky-400 border-sky-500/30">
                      三段分屏
                    </Badge>
                    <Badge variant="outline" className="text-[9px] text-muted-foreground">
                      结构颠覆
                    </Badge>
                  </div>
                </div>

                {/* 策略 4: 波浪变速+胶片微粒蒙版 ⚡ */}
                <div
                  onClick={() => applyDedupPreset("curved")}
                  className={`cursor-pointer rounded-xl border p-4 transition-all relative ${
                    dedupPreset === "curved"
                      ? "border-amber-500 bg-amber-500/10 shadow-sm ring-1 ring-amber-500/50"
                      : "border-border bg-card hover:border-amber-500/40 hover:bg-card/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <LuActivity className="size-4 text-amber-500" />
                      波浪变速+胶片微粒 ⚡
                    </span>
                    {dedupPreset === "curved" && <LuCheck className="size-3.5 text-amber-500" />}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                    0.99x~1.07x 动态正弦波浪变速打碎时序光流 · 叠加微不可察的动态胶片微粒蒙版，让全画幅每个像素数学哈希全部产生漂移。
                  </p>
                  <div className="mt-3 flex items-center gap-1 flex-wrap">
                    <Badge variant="outline" className="text-[9px] text-amber-600 dark:text-amber-400 border-amber-500/30">
                      时空全域双抗
                    </Badge>
                    <Badge variant="outline" className="text-[9px] text-muted-foreground">
                      高质感复古
                    </Badge>
                  </div>
                </div>
              </div>

              {/* 第二行：实用出海、基础预设与专家模式 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* 策略 5: 纯净静音出海模式 🔇 */}
                <div
                  onClick={() => applyDedupPreset("mute")}
                  className={`cursor-pointer rounded-xl border p-4 transition-all relative ${
                    dedupPreset === "mute"
                      ? "border-emerald-500 bg-emerald-500/10 shadow-sm ring-1 ring-emerald-500/50"
                      : "border-border bg-card hover:border-emerald-500/40 hover:bg-card/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <LuVolumeX className="size-4 text-emerald-500" />
                      纯净静音出海 🔇
                    </span>
                    {dedupPreset === "mute" && <LuCheck className="size-3.5 text-emerald-500" />}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                    彻底剥离原音轨所有潜在侵权与重复音频。发布时在 TikTok 客户端一键添加 Trending 热门音乐，0 音频封杀风险！
                  </p>
                  <div className="mt-3 flex items-center gap-1 flex-wrap">
                    <Badge variant="outline" className="text-[9px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                      音频零风险
                    </Badge>
                  </div>
                </div>
                {/* 策略 5: 深度重构清洗 */}
                <div
                  onClick={() => applyDedupPreset("deep")}
                  className={`cursor-pointer rounded-xl border p-4 transition-all relative ${
                    dedupPreset === "deep"
                      ? "border-rose-500 bg-rose-500/10 shadow-sm ring-1 ring-rose-500/50"
                      : "border-border bg-card hover:border-rose-500/40 hover:bg-card/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <LuShieldAlert className="size-4 text-rose-500" />
                      深度重构清洗
                    </span>
                    {dedupPreset === "deep" && <LuCheck className="size-3.5 text-rose-500" />}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                    微缩放 1.05x · 微变速 1.05x · 水平镜像翻转 · 动态暗角 · 微噪点抗性重构 · 四角明水印虚化。
                  </p>
                  <div className="mt-3 flex items-center gap-1">
                    <Badge variant="outline" className="text-[9px] text-rose-600 dark:text-rose-400 border-rose-500/30">
                      跨平台搬运
                    </Badge>
                    <Badge variant="outline" className="text-[9px] text-muted-foreground">
                      严控防封
                    </Badge>
                  </div>
                </div>

                {/* 策略 6: 标准矩阵防查重 */}
                <div
                  onClick={() => applyDedupPreset("standard")}
                  className={`cursor-pointer rounded-xl border p-4 transition-all relative ${
                    dedupPreset === "standard"
                      ? "border-amber-500 bg-amber-500/10 shadow-sm ring-1 ring-amber-500/50"
                      : "border-border bg-card hover:border-amber-500/40 hover:bg-card/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <LuZap className="size-4 text-amber-500" />
                      标准矩阵防查重
                    </span>
                    {dedupPreset === "standard" && <LuCheck className="size-3.5 text-amber-500" />}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                    微缩放 1.03x · 微变速 1.03x · 边缘微暗角 · 饱和度对比度抖动 · 音频防比对重构。多号分发必备。
                  </p>
                  <div className="mt-3 flex items-center gap-1">
                    <Badge variant="outline" className="text-[9px] text-amber-600 dark:text-amber-400 border-amber-500/30">
                      带货切片
                    </Badge>
                    <Badge variant="outline" className="text-[9px] text-muted-foreground">
                      矩阵批量
                    </Badge>
                  </div>
                </div>

                {/* 策略 7: 轻度安全清洗 */}
                <div
                  onClick={() => applyDedupPreset("light")}
                  className={`cursor-pointer rounded-xl border p-4 transition-all relative ${
                    dedupPreset === "light"
                      ? "border-emerald-500 bg-emerald-500/10 shadow-sm ring-1 ring-emerald-500/50"
                      : "border-border bg-card hover:border-emerald-500/40 hover:bg-card/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <LuShieldCheck className="size-4 text-emerald-500" />
                      轻度安全清洗
                    </span>
                    {dedupPreset === "light" && <LuCheck className="size-3.5 text-emerald-500" />}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                    微缩放 1.02x · 微变速 1.02x · 色彩微抖动 · 剥离 EXIF 元数据。人类视觉无损原画。
                  </p>
                  <div className="mt-3 flex items-center gap-1">
                    <Badge variant="outline" className="text-[9px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                      原创保护
                    </Badge>
                    <Badge variant="outline" className="text-[9px] text-muted-foreground">
                      无损画质
                    </Badge>
                  </div>
                </div>

                {/* 策略 8: 自定义专家模式 */}
                <div
                  onClick={() => setDedupPreset("custom")}
                  className={`cursor-pointer rounded-xl border p-4 transition-all relative ${
                    dedupPreset === "custom"
                      ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/50"
                      : "border-border bg-card hover:border-primary/40 hover:bg-card/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <LuSlidersHorizontal className="size-4 text-primary" />
                      自定义专家模式
                    </span>
                    {dedupPreset === "custom" && <LuCheck className="size-3.5 text-primary" />}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                    自由微调每一项滤镜参数：画中画毛玻璃、波浪变速、胶片微粒、静音出海、掐头去尾与声纹粉碎。
                  </p>
                  <div className="mt-3 flex items-center gap-1">
                    <Badge variant="outline" className="text-[9px] text-primary border-primary/30">
                      参数自由调节
                    </Badge>
                  </div>
                </div>
              </div>

              {/* 自定义模式参数展开面板 */}
              {dedupPreset === "custom" && (
                <div className="rounded-xl border border-primary/30 bg-card/60 p-4 space-y-5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                      <LuSlidersHorizontal className="size-3.5 text-primary" />
                      专家高级参数微调面板 (已开启互斥冲突校验，避免不兼容滤镜产生黑屏或音画不同步)
                    </div>
                    <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                      防冲突模式已激活
                    </Badge>
                  </div>

                  {/* 1. 画布构图与排版模式 (严格三选一互斥) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <LuLayers className="size-3.5 text-cyan-500" />
                        1. 画布排版与画幅容器 (严格三选一互斥)
                      </Label>
                      <span className="text-[10px] text-muted-foreground">
                        画中画与三段分屏自带环境模糊层，与全屏动态微运镜/微旋转互斥
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* 全屏满铺 */}
                      <div
                        onClick={() => {
                          setDedupAmbientBlurredBg(false);
                          setDedupSplitCanvas(false);
                        }}
                        className={`cursor-pointer rounded-lg border p-3 transition-all ${
                          !dedupAmbientBlurredBg && !dedupSplitCanvas
                            ? "border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500/50"
                            : "border-border/80 bg-background/50 hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">全屏原画裁剪模式</span>
                          {!dedupAmbientBlurredBg && !dedupSplitCanvas && <LuCheck className="size-3.5 text-cyan-500" />}
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground leading-tight">
                          保留原始全画幅。支持叠加呼吸微运镜与 ±1.2° 动态正弦微旋转。
                        </p>
                      </div>

                      {/* 画中画毛玻璃 */}
                      <div
                        onClick={() => {
                          setDedupAmbientBlurredBg(true);
                          setDedupSplitCanvas(false);
                          setDedupDynamicPanZoom(false);
                          setDedupMicroRotate(false);
                        }}
                        className={`cursor-pointer rounded-lg border p-3 transition-all ${
                          dedupAmbientBlurredBg
                            ? "border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500/50"
                            : "border-border/80 bg-background/50 hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">画中画动态毛玻璃 (PIP)</span>
                          {dedupAmbientBlurredBg && <LuCheck className="size-3.5 text-cyan-500" />}
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground leading-tight">
                          84% 画面居中 + 30px 高斯模糊动态底板。改变画面构图轮廓。
                        </p>
                      </div>

                      {/* 三段分屏上下模糊 */}
                      <div
                        onClick={() => {
                          setDedupSplitCanvas(true);
                          setDedupAmbientBlurredBg(false);
                          setDedupDynamicPanZoom(false);
                          setDedupMicroRotate(false);
                        }}
                        className={`cursor-pointer rounded-lg border p-3 transition-all ${
                          dedupSplitCanvas
                            ? "border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500/50"
                            : "border-border/80 bg-background/50 hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">三段分屏上下模糊反射</span>
                          {dedupSplitCanvas && <LuCheck className="size-3.5 text-cyan-500" />}
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground leading-tight">
                          68% 画面居中 + 上下高斯虚化镜像反射。2026 最新爆款视觉重构。
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 2. 时间变速引擎 (互斥约束) */}
                  <div className="pt-3 border-t border-border/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <LuActivity className="size-3.5 text-amber-500" />
                        2. 时间流与变速引擎 (动态波浪与微抽帧互斥)
                      </Label>
                      <span className="text-[10px] text-muted-foreground">
                        动态波浪正弦非线性变速接管时间轴，与固定倍速及丢帧滤镜互斥
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* 动态波浪非线性变速 */}
                      <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/80 bg-background/50 hover:bg-muted/30 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={dedupCurvedSpeed}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setDedupCurvedSpeed(val);
                            if (val) setDedupFrameJitter(false);
                          }}
                          className="mt-0.5 rounded border-border accent-amber-500"
                        />
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-foreground">动态波浪变速 (0.99x~1.07x 正弦加减速)</span>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            正弦波浪变速曲线，打碎时间轴线性光流比对 (启用时倍速滑块锁定为动态曲线)。
                          </p>
                        </div>
                      </label>

                      {/* 智能微抽帧 */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-all ${
                          dedupCurvedSpeed
                            ? "opacity-40 border-border/40 bg-muted/10 cursor-not-allowed"
                            : "border-border/80 bg-background/50 hover:bg-muted/30 cursor-pointer"
                        } select-none`}
                      >
                        <input
                          type="checkbox"
                          checked={dedupFrameJitter}
                          disabled={dedupCurvedSpeed}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setDedupFrameJitter(val);
                            if (val) setDedupCurvedSpeed(false);
                          }}
                          className="mt-0.5 rounded border-border accent-amber-500"
                        />
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-foreground">智能微抽帧 (破坏运动向量)</span>
                            {dedupCurvedSpeed && (
                              <Badge variant="outline" className="text-[9px] text-amber-500 border-amber-500/30">
                                与波浪互斥
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            每隔 45 帧剔除 1 帧冗余帧，破坏平台视频流 GOP 序列与时间戳。
                          </p>
                        </div>
                      </label>

                      {/* 线性微变速滑块 */}
                      <div
                        className={`space-y-1.5 p-2.5 rounded-lg border border-border/80 bg-background/50 ${
                          dedupCurvedSpeed ? "opacity-40 cursor-not-allowed" : ""
                        }`}
                      >
                        <div className="flex justify-between text-xs">
                          <Label className="text-muted-foreground">固定微变速倍率 (PTS扭曲)</Label>
                          <span className="font-mono text-primary font-semibold">
                            {dedupCurvedSpeed ? "波浪正弦中" : `${dedupSpeed}x`}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1.01"
                          max="1.10"
                          step="0.01"
                          disabled={dedupCurvedSpeed}
                          value={dedupSpeed}
                          onChange={(e) => setDedupSpeed(parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary disabled:cursor-not-allowed"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          {dedupCurvedSpeed ? "已由波浪变速动态接管" : "推荐 1.02x ~ 1.05x 固定线性拉伸"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 3. 音频声学治理 (互斥约束) */}
                  <div className="pt-3 border-t border-border/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <LuSparkles className="size-3.5 text-violet-500" />
                        3. 音频声学指纹治理 (静音模式与音频处理互斥)
                      </Label>
                      <span className="text-[10px] text-muted-foreground">
                        静音出海模式彻底移除音轨，声学指纹与音量滑块自动停用
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* 纯净静音出海 */}
                      <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/80 bg-background/50 hover:bg-muted/30 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={dedupMuteAudio}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setDedupMuteAudio(val);
                            if (val) setDedupAudioScramble(false);
                          }}
                          className="mt-0.5 rounded border-border accent-emerald-500"
                        />
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-foreground">纯净静音出海 (-an 剥离音轨)</span>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            彻底剥离原音频，发布时使用 TikTok 官方榜单音乐，0 音频封杀风险。
                          </p>
                        </div>
                      </label>

                      {/* 声学指纹粉碎机 */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-all ${
                          dedupMuteAudio
                            ? "opacity-40 border-border/40 bg-muted/10 cursor-not-allowed"
                            : "border-border/80 bg-background/50 hover:bg-muted/30 cursor-pointer"
                        } select-none`}
                      >
                        <input
                          type="checkbox"
                          checked={dedupAudioScramble}
                          disabled={dedupMuteAudio}
                          onChange={(e) => setDedupAudioScramble(e.target.checked)}
                          className="mt-0.5 rounded border-border accent-violet-500"
                        />
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-foreground">声学指纹粉碎机 (3D拓宽+共振峰微变)</span>
                            {dedupMuteAudio && (
                              <Badge variant="outline" className="text-[9px] text-emerald-500 border-emerald-500/30">
                                已静音
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            +3.5% 音高微变配合 3D 立体声拓宽，打碎 Shazam、Chromaprint 声学指纹。
                          </p>
                        </div>
                      </label>

                      {/* 音频微音量增益 */}
                      <div
                        className={`space-y-1.5 p-2.5 rounded-lg border border-border/80 bg-background/50 ${
                          dedupMuteAudio ? "opacity-40 cursor-not-allowed" : ""
                        }`}
                      >
                        <div className="flex justify-between text-xs">
                          <Label className="text-muted-foreground">音频微音量增益</Label>
                          <span className="font-mono text-primary font-semibold">
                            {dedupMuteAudio ? "静音无音轨" : `${dedupAudioVolume}x`}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.95"
                          max="1.20"
                          step="0.01"
                          disabled={dedupMuteAudio}
                          value={dedupAudioVolume}
                          onChange={(e) => setDedupAudioVolume(parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary disabled:cursor-not-allowed"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          {dedupMuteAudio ? "静音模式下无效" : "微调音频振幅曲线打破声压比对"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 4. 前沿视觉与像素频域抗性 (2026 最新去重技术集合，自由组合叠加) */}
                  <div className="pt-3 border-t border-border/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <LuSparkles className="size-3.5 text-primary" />
                        4. 视觉与像素频域抗性增强 (2026 最新去重技术集合，自由组合)
                      </Label>
                      <Badge variant="outline" className="text-[9px] text-primary border-primary/30">
                        可正交多选
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                      {/* 空间微旋转 (±1.2° 正弦微旋转摆动) */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-all ${
                          dedupAmbientBlurredBg || dedupSplitCanvas
                            ? "opacity-40 border-border/40 bg-muted/10 cursor-not-allowed"
                            : "border-border/80 bg-background/50 hover:bg-muted/30 cursor-pointer"
                        } select-none`}
                      >
                        <input
                          type="checkbox"
                          checked={dedupMicroRotate}
                          disabled={dedupAmbientBlurredBg || dedupSplitCanvas}
                          onChange={(e) => setDedupMicroRotate(e.target.checked)}
                          className="mt-0.5 rounded border-border accent-primary"
                        />
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-foreground">空间微旋转 (±1.2° 动态正弦摆动)</span>
                            {(dedupAmbientBlurredBg || dedupSplitCanvas) && (
                              <Badge variant="outline" className="text-[9px] text-cyan-500 border-cyan-500/30">
                                仅全屏可用
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            轻微正弦角度晃动并自适应缩放无黑边，彻底粉碎 2D 笛卡尔网格栅格扫描。
                          </p>
                        </div>
                      </label>

                      {/* RGB/色度通道空间微移 */}
                      <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/80 bg-background/50 hover:bg-muted/30 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={dedupChromashift}
                          onChange={(e) => setDedupChromashift(e.target.checked)}
                          className="mt-0.5 rounded border-border accent-primary"
                        />
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-foreground">色度通道空间微移 (Chromashift)</span>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            U/V 色度通道 1~2 像素微位移，破坏 YUV 色彩矩阵对齐与全局直方图。
                          </p>
                        </div>
                      </label>

                      {/* 边缘高频梯度重构 */}
                      <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/80 bg-background/50 hover:bg-muted/30 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={dedupUnsharp}
                          onChange={(e) => setDedupUnsharp(e.target.checked)}
                          className="mt-0.5 rounded border-border accent-primary"
                        />
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-foreground">边缘高频梯度重构 (Unsharp 智能锐化)</span>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            重塑高频边缘轮廓梯度导数，使卷积神经网络边缘特征提取失效。
                          </p>
                        </div>
                      </label>

                      {/* 呼吸微运镜 */}
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-all ${
                          dedupAmbientBlurredBg || dedupSplitCanvas
                            ? "opacity-40 border-border/40 bg-muted/10 cursor-not-allowed"
                            : "border-border/80 bg-background/50 hover:bg-muted/30 cursor-pointer"
                        } select-none`}
                      >
                        <input
                          type="checkbox"
                          checked={dedupDynamicPanZoom}
                          disabled={dedupAmbientBlurredBg || dedupSplitCanvas}
                          onChange={(e) => setDedupDynamicPanZoom(e.target.checked)}
                          className="mt-0.5 rounded border-border accent-primary"
                        />
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-foreground">呼吸式微运镜 (动态正弦裁切)</span>
                            {(dedupAmbientBlurredBg || dedupSplitCanvas) && (
                              <Badge variant="outline" className="text-[9px] text-cyan-500 border-cyan-500/30">
                                仅全屏可用
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            镜头正弦呼吸平移，粉碎 Vision Transformer 空间网格特征比对。
                          </p>
                        </div>
                      </label>

                      {/* 动态微光影 */}
                      <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/80 bg-background/50 hover:bg-muted/30 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={dedupDynamicLighting}
                          onChange={(e) => setDedupDynamicLighting(e.target.checked)}
                          className="mt-0.5 rounded border-border accent-primary"
                        />
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-foreground">动态微光影 (伽马呼吸震荡)</span>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            正弦震荡伽马与对比度，感知哈希 (pHash) 随时间持续跳变防碰撞。
                          </p>
                        </div>
                      </label>

                      {/* 胶片微粒蒙版 */}
                      <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/80 bg-background/50 hover:bg-muted/30 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={dedupFilmGrain}
                          onChange={(e) => setDedupFilmGrain(e.target.checked)}
                          className="mt-0.5 rounded border-border accent-primary"
                        />
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-foreground">胶片微粒蒙版 (全画幅微扰)</span>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            微胶片颗粒与通道差，打散每一帧全画幅每个像素数学哈希值。
                          </p>
                        </div>
                      </label>

                      {/* 水平镜像翻转 */}
                      <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/80 bg-background/50 hover:bg-muted/30 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={dedupFlipH}
                          onChange={(e) => setDedupFlipH(e.target.checked)}
                          className="mt-0.5 rounded border-border accent-primary"
                        />
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-foreground">水平镜像翻转</span>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            左右镜像反转，彻底粉碎人体骨骼姿态与关键点检测模型比对。
                          </p>
                        </div>
                      </label>

                      {/* 色彩微抖动 */}
                      <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/80 bg-background/50 hover:bg-muted/30 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={dedupColorTweak}
                          onChange={(e) => setDedupColorTweak(e.target.checked)}
                          className="mt-0.5 rounded border-border accent-primary"
                        />
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-foreground">色彩微抖动 (饱和度/对比度)</span>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            轻度调整色彩饱和度与对比度，偏移画面色彩指纹。
                          </p>
                        </div>
                      </label>

                      {/* 边缘暗角滤镜 */}
                      <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/80 bg-background/50 hover:bg-muted/30 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={dedupVignette}
                          onChange={(e) => setDedupVignette(e.target.checked)}
                          className="mt-0.5 rounded border-border accent-primary"
                        />
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-foreground">边缘暗角滤镜 (Vignette)</span>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            四周柔和渐变微暗角，增强电影质感并改变四角区域特征。
                          </p>
                        </div>
                      </label>

                      {/* 微噪点抗性 */}
                      <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/80 bg-background/50 hover:bg-muted/30 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={dedupNoise}
                          onChange={(e) => setDedupNoise(e.target.checked)}
                          className="mt-0.5 rounded border-border accent-primary"
                        />
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-foreground">微噪点抗性重构</span>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            时域微量高斯白噪点，破坏视频帧间残差与压缩编码块效应。
                          </p>
                        </div>
                      </label>

                      {/* 原生相机拍摄 EXIF 注入 */}
                      <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/80 bg-background/50 hover:bg-muted/30 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={dedupFakeCameraExif}
                          onChange={(e) => setDedupFakeCameraExif(e.target.checked)}
                          className="mt-0.5 rounded border-border accent-primary"
                        />
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-foreground">注入 iPhone 15 Pro 原生相机 EXIF</span>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            抹除字节 vid/md5 与转码标记，注入真实 Apple iOS 拍摄元数据。
                          </p>
                        </div>
                      </label>

                      {/* 暗水印超声波切除 */}
                      <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/80 bg-background/50 hover:bg-muted/30 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={dedupStripBlindWatermark}
                          onChange={(e) => setDedupStripBlindWatermark(e.target.checked)}
                          className="mt-0.5 rounded border-border accent-primary"
                        />
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-foreground">暗水印超声波切除 (17.5kHz)</span>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            注入声学低通滤波并打碎频域高频量化矩阵，切断暗水印追踪。
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* 5. 裁剪、微缩放与水印消除 */}
                  <div className="pt-3 border-t border-border/60 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <Label className="text-muted-foreground">微缩放中心裁切</Label>
                        <span className="font-mono text-primary font-semibold">{dedupZoom}x</span>
                      </div>
                      <input
                        type="range"
                        min="1.00"
                        max="1.08"
                        step="0.01"
                        value={dedupZoom}
                        onChange={(e) => setDedupZoom(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <p className="text-[10px] text-muted-foreground">消除固定边缘与边框 (推荐 1.02x ~ 1.04x)</p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <Label className="text-muted-foreground">掐头微剪 (秒)</Label>
                        <span className="font-mono text-primary text-xs font-semibold">
                          {dedupTrimStartSecs > 0 ? `${dedupTrimStartSecs} 秒` : "不掐头"}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="2.0"
                        step="0.2"
                        value={dedupTrimStartSecs}
                        onChange={(e) => setDedupTrimStartSecs(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <p className="text-[10px] text-muted-foreground">避开平台前3秒黄金首帧特征与转场比对</p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <Label className="text-muted-foreground">去尾微剪 (秒)</Label>
                        <span className="font-mono text-primary text-xs font-semibold">
                          {dedupTrimEndSecs > 0 ? `${dedupTrimEndSecs} 秒` : "不切除"}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="4.0"
                        step="0.5"
                        value={dedupTrimEndSecs}
                        onChange={(e) => setDedupTrimEndSecs(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <p className="text-[10px] text-muted-foreground">切除抖音/快手/西瓜片尾 Logo 动画</p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <Label className="text-muted-foreground">明水印虚化消除</Label>
                        <span className="text-[10px] text-muted-foreground">
                          {dedupDelogoMode === "none" ? "无" : "已选择"}
                        </span>
                      </div>
                      <select
                        value={dedupDelogoMode}
                        onChange={(e) => setDedupDelogoMode(e.target.value)}
                        className="w-full h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="none">不执行角标去除 (原样保留)</option>
                        <option value="douyin">抖音/TikTok 跳动水印 (左上 + 右下角标)</option>
                        <option value="top_left">左上角水印消除 (小红书/B站)</option>
                        <option value="bottom_right">右下角水印消除 (快手/西瓜)</option>
                        <option value="all_corners">四角全域虚化消除 (跨平台强力搬运)</option>
                      </select>
                      <p className="text-[10px] text-muted-foreground">邻域像素插值平滑羽化抹平角标</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 素材与工作台区域 */}
            {dedupFiles.length === 0 ? (
              /* 空状态引导导入 */
              <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center space-y-4">
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
                  <LuFilm className="size-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-foreground">暂未载入待去重视频素材</h3>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    支持选取单段或批量多段短视频（MP4, MOV, MKV, FLV 等），或直接导入之前通过 StreamCap 录制的高清直播流素材。
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button
                    type="button"
                    onClick={handlePickDedupVideos}
                    className="gap-2 bg-amber-500 text-white hover:bg-amber-600 shadow-sm"
                  >
                    <LuFolderOpen className="size-4" />
                    选取本地短视频 (支持批量)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      // 载入自带示例视频
                      const samplePath = "c:\\Tools2\\fingerBrowsers2\\NarciPHBrowser\\发布鸭.exe_extracted\\resource\\overlay\\星空.mp4";
                      const sampleFile: PickedMediaInfo = {
                        path: samplePath,
                        name: "星空_示例素材.mp4",
                        size_mb: 0.28,
                      };
                      setDedupFiles([sampleFile]);
                      detectBlindWatermarkForFiles([sampleFile]);
                      toast.success("已载入系统示例短视频");
                    }}
                    className="gap-2 border-border"
                  >
                    <LuPlay className="size-3.5" />
                    载入示例视频体验
                  </Button>
                </div>
              </div>
            ) : (
              /* 已载入素材：双栏工作流 */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* 左栏 (5列): 待清洗素材列表与原视频预览 */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs font-semibold text-foreground">待清洗素材列表</Label>
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                          {dedupFiles.length} 个
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={handlePickDedupVideos}
                        className="h-6 text-[11px] text-primary gap-1 px-2"
                      >
                        <LuPlus className="size-3" />
                        添加更多
                      </Button>
                    </div>

                    <div className="max-h-60 overflow-y-auto divide-y divide-border/50">
                      {dedupFiles.map((f, idx) => {
                        const isSelected = selectedDedupIdx === idx;
                        const res = dedupResults[f.path];
                        return (
                          <div
                            key={f.path}
                            onClick={() => setSelectedDedupIdx(idx)}
                            className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-amber-500/10 border-l-2 border-amber-500"
                                : "hover:bg-muted/40"
                            }`}
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-medium text-foreground truncate max-w-[180px]" title={f.name}>
                                  {f.name}
                                </span>
                                {res ? (
                                  <Badge className="bg-emerald-600 text-white border-emerald-600 text-[9px] px-1 py-0 shrink-0 font-bold flex items-center gap-0.5">
                                    <LuShieldCheck className="size-2.5" /> 暗水印已移除
                                  </Badge>
                                ) : f.blindWatermarkDetecting ? (
                                  <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[9px] px-1 py-0 shrink-0 animate-pulse">
                                    暗水印检测中...
                                  </Badge>
                                ) : f.blindWatermarkDetected !== undefined ? (
                                  f.blindWatermarkDetected ? (
                                    <Badge className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[9px] px-1 py-0 shrink-0 font-medium flex items-center gap-0.5">
                                      <LuShieldAlert className="size-2.5" /> 存在暗水印
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[9px] px-1 py-0 shrink-0 font-medium flex items-center gap-0.5">
                                      <LuShieldCheck className="size-2.5" /> 不存在暗水印
                                    </Badge>
                                  )
                                ) : null}
                              </div>
                              <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5" title={f.path}>
                                {f.size_mb} MB · {f.path}
                              </p>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {idx > 0 && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDedupFiles((prev) => {
                                      const arr = [...prev];
                                      const temp = arr[idx];
                                      arr[idx] = arr[idx - 1];
                                      arr[idx - 1] = temp;
                                      return arr;
                                    });
                                    setSelectedDedupIdx(idx - 1);
                                  }}
                                  className="size-6 p-0 text-muted-foreground hover:text-foreground"
                                  title="上移此视频拼接顺序"
                                >
                                  <LuChevronUp className="size-3.5" />
                                </Button>
                              )}
                              {idx < dedupFiles.length - 1 && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDedupFiles((prev) => {
                                      const arr = [...prev];
                                      const temp = arr[idx];
                                      arr[idx] = arr[idx + 1];
                                      arr[idx + 1] = temp;
                                      return arr;
                                    });
                                    setSelectedDedupIdx(idx + 1);
                                  }}
                                  className="size-6 p-0 text-muted-foreground hover:text-foreground"
                                  title="下移此视频拼接顺序"
                                >
                                  <LuChevronDown className="size-3.5" />
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDedupFiles((prev) => prev.filter((_, i) => i !== idx));
                                  if (selectedDedupIdx >= dedupFiles.length - 1) {
                                    setSelectedDedupIdx(Math.max(0, dedupFiles.length - 2));
                                  }
                                }}
                                className="size-6 p-0 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                                title="移除此视频"
                              >
                                <LuTrash2 className="size-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 原始视频即时播放器 */}
                  {dedupFiles[selectedDedupIdx] && (
                    <div className="rounded-xl border border-border bg-card p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <LuVideo className="size-3.5 text-muted-foreground" />
                          原始视频实时预览
                        </Label>
                        <div className="flex items-center gap-1.5">
                          {dedupFiles[selectedDedupIdx].blindWatermarkDetecting ? (
                            <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] px-1.5 py-0 animate-pulse">
                              暗水印检测中...
                            </Badge>
                          ) : dedupFiles[selectedDedupIdx].blindWatermarkDetected !== undefined ? (
                            dedupFiles[selectedDedupIdx].blindWatermarkDetected ? (
                              <Badge className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[10px] px-1.5 py-0 font-semibold flex items-center gap-1">
                                <LuShieldAlert className="size-3" /> 存在暗水印 ({dedupFiles[selectedDedupIdx].blindWatermarkScore || 85}分)
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px] px-1.5 py-0 font-semibold flex items-center gap-1">
                                <LuShieldCheck className="size-3" /> 不存在暗水印
                              </Badge>
                            )
                          ) : null}
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            {dedupFiles[selectedDedupIdx].size_mb} MB
                          </Badge>
                        </div>
                      </div>

                      <div className="relative rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center border border-border/80">
                        <video
                          key={dedupFiles[selectedDedupIdx].path}
                          controls
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-contain"
                          src={getVideoStreamUrl(dedupFiles[selectedDedupIdx].path)}
                        />
                      </div>

                      {dedupFiles[selectedDedupIdx].blindWatermarkReason && (
                        <div
                          className={`rounded-lg p-2 text-[11px] border flex items-start gap-1.5 ${
                            dedupFiles[selectedDedupIdx].blindWatermarkDetected
                              ? "bg-rose-500/5 text-rose-700 dark:text-rose-400 border-rose-500/20"
                              : "bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                          }`}
                        >
                          {dedupFiles[selectedDedupIdx].blindWatermarkDetected ? (
                            <LuShieldAlert className="size-3.5 shrink-0 mt-0.5 text-rose-500" />
                          ) : (
                            <LuShieldCheck className="size-3.5 shrink-0 mt-0.5 text-emerald-500" />
                          )}
                          <span className="leading-tight">
                            暗水印特征研判: {dedupFiles[selectedDedupIdx].blindWatermarkReason}
                          </span>
                        </div>
                      )}

                      <div className="rounded-lg bg-muted/40 p-2 text-[11px] text-muted-foreground font-mono break-all space-y-0.5 border border-border/50">
                        <div>文件: {dedupFiles[selectedDedupIdx].name}</div>
                        <div>路径: {dedupFiles[selectedDedupIdx].path}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 右栏 (7列): 去重清洗控制与转场混剪合并 */}
                <div className="lg:col-span-7 space-y-4">
                  {/* 模式切换 Switcher */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-3">
                    <div className="flex items-center gap-1.5 p-1 bg-muted/40 rounded-lg border border-border/60">
                      <button
                        type="button"
                        onClick={() => setActiveDedupView("single")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all ${
                          activeDedupView === "single"
                            ? "bg-card text-foreground shadow-sm font-semibold border border-border"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <LuScissors className="size-3.5 text-amber-500" />
                        单视频独立清洗
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveDedupView("merge")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all ${
                          activeDedupView === "merge"
                            ? "bg-amber-500 text-white shadow-sm font-semibold"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <LuSparkles className="size-3.5 text-yellow-200" />
                        多视频转场混剪合并 (多合一防查重)
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1 bg-black/20 text-white border-none font-mono">
                          {dedupFiles.length} 段
                        </Badge>
                      </button>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <span>去重基底:</span>
                      <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                        {dedupPreset === "fyp" ? "TikTok FYP 顶级爆破 🔥" : dedupPreset === "pip" ? "画中画毛玻璃画布 🖼️" : dedupPreset === "split" ? "三段分屏上下模糊 🎬" : dedupPreset === "curved" ? "波浪变速+胶片微粒 ⚡" : dedupPreset === "mute" ? "纯净静音出海 🔇" : dedupPreset === "light" ? "轻度安全清洗" : dedupPreset === "standard" ? "标准矩阵防查重" : dedupPreset === "deep" ? "深度重构清洗" : "自定义专家模式"}
                      </Badge>
                    </div>
                  </div>

                  {/* 视图 A: 多视频转场混剪合并中心 */}
                  {activeDedupView === "merge" ? (
                    <div className="space-y-4 animate-in fade-in duration-200">
                      {/* 转场参数配置面板 */}
                      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                        <div className="flex items-center justify-between border-b border-border/60 pb-3">
                          <div className="space-y-0.5">
                            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                              <LuSparkles className="size-4 text-amber-500" />
                              短视频智能混剪转场工作台
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              全自动流水线：对每段素材先逐一执行多维去重特征重构，再通过 FFmpeg 动态转场引擎衔接为一体！
                            </p>
                          </div>
                          <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs">
                            防查重推荐
                          </Badge>
                        </div>

                        {/* 转场与输出参数网格 */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-foreground">转场衔接特效</Label>
                            <select
                              value={mergeTransition}
                              onChange={(e) => setMergeTransition(e.target.value)}
                              className="w-full h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              <option value="random">🎲 智能随机转场 (最强防查重，各段不重样)</option>
                              <option value="fade">平滑淡入淡出 (Fade 交叉溶解)</option>
                              <option value="hblur">动态横向模糊 (HBlur 运动模糊)</option>
                              <option value="slideleft">向左推镜头滑入 (Slide Left)</option>
                              <option value="slideright">向右推镜头滑入 (Slide Right)</option>
                              <option value="slideup">向上推镜头滑入 (Slide Up)</option>
                              <option value="slidedown">向下推镜头滑入 (Slide Down)</option>
                              <option value="smoothleft">丝滑平移过渡 (Smooth Left)</option>
                              <option value="zoomin">镜头缩放冲入 (Zoom In)</option>
                              <option value="pixelize">马赛克像素化溶解 (Pixelize)</option>
                              <option value="circlecrop">圆形光圈开合 (Circle Crop)</option>
                              <option value="dissolve">柔和溶解 (Dissolve)</option>
                              <option value="radial">径向指针擦除 (Radial)</option>
                              <option value="none">无转场极速直切 (Cut)</option>
                            </select>
                            <p className="text-[10px] text-muted-foreground">
                              {mergeTransition === "random" ? "每个切片衔接点自动随机匹配不同滤镜" : "每段切片交界处均使用所选转场"}
                            </p>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <Label className="text-muted-foreground font-medium">转场过渡时长</Label>
                              <span className="font-mono text-primary font-semibold">{mergeTransitionDuration} 秒</span>
                            </div>
                            <input
                              type="range"
                              min="0.3"
                              max="1.5"
                              step="0.1"
                              value={mergeTransitionDuration}
                              onChange={(e) => setMergeTransitionDuration(parseFloat(e.target.value))}
                              className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            <p className="text-[10px] text-muted-foreground">推荐 0.6s ~ 1.0s，过度自然顺畅</p>
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-foreground">统一成片画幅</Label>
                            <select
                              value={mergeTargetResolution}
                              onChange={(e) => setMergeTargetResolution(e.target.value)}
                              className="w-full h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              <option value="auto">自动跟随 (保持第1段视频原始比例)</option>
                              <option value="1080x1920">9:16 竖屏 (TikTok / 抖音 1080x1920)</option>
                              <option value="1920x1080">16:9 横屏 (B站 / YouTube 1920x1080)</option>
                              <option value="1080x1080">1:1 正方形 (Instagram 1080x1080)</option>
                            </select>
                            <p className="text-[10px] text-muted-foreground">异形比例自动等比缩放并居中补黑边</p>
                          </div>
                        </div>

                        {/* 视频分段拼接链路预览 */}
                        <div className="space-y-2 pt-2 border-t border-border/60">
                          <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                            <span>待合并视频链路序列 ({dedupFiles.length} 段)</span>
                            <span className="text-[10px] text-muted-foreground font-normal">
                              左侧列表支持一键上下调整拼接先后次序
                            </span>
                          </Label>

                          {dedupFiles.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border/80 p-4 text-center text-xs text-muted-foreground">
                              暂无视频片段，请先在左侧选择或批量导入待合并的视频文件
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-muted/20 border border-border/60">
                              {dedupFiles.map((f, i) => (
                                <div key={f.path} className="flex items-center gap-1.5">
                                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card border border-border text-xs shadow-2xs max-w-[200px]">
                                    <span className="font-mono text-[10px] text-primary font-bold">#{i + 1}</span>
                                    <span className="truncate text-[11px]" title={f.name}>{f.name}</span>
                                  </div>
                                  {i < dedupFiles.length - 1 && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/40 text-amber-600 bg-amber-500/5">
                                      {mergeTransition === "random" ? "🎲 随机转场" : mergeTransition}
                                    </Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 一键启动混剪合并大按钮 */}
                        <div className="pt-2">
                          <Button
                            type="button"
                            onClick={handleExecuteBatchDedupAndMerge}
                            disabled={isMerging || dedupFiles.length === 0}
                            className="w-full h-10 gap-2 text-sm bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md font-semibold cursor-pointer"
                          >
                            {isMerging ? (
                              <>
                                <LuRefreshCw className="size-4 animate-spin" />
                                正在执行：逐段去重清洗 + 动态转场混剪合并中...
                              </>
                            ) : (
                              <>
                                <LuSparkles className="size-4" />
                                一键全自动：逐条去重 + 智能转场 + 混剪合并为一个大片 ({dedupFiles.length} 段)
                              </>
                            )}
                          </Button>
                        </div>

                        {/* 处理中动画提示 */}
                        {isMerging && (
                          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 space-y-1.5 animate-in fade-in">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                <LuRefreshCw className="size-3.5 animate-spin text-amber-500" />
                                多进程流水线运行中...
                              </span>
                              <span className="text-[11px] text-muted-foreground font-mono">
                                正在逐段处理 {dedupFiles.length} 段视频
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              阶段 1：对每条分段视频进行时空光流、微旋转、色彩微移与超声波暗水印深度清洗；<br/>
                              阶段 2：归一化所有片段分辨率与帧率，通过 xfade / acrossfade 滤镜计算转场时间戳；<br/>
                              阶段 3：注入 iPhone 15 Pro 相机原生 EXIF 元数据，输出全平台高权重过审大片。
                            </p>
                          </div>
                        )}
                      </div>

                      {/* 合并成片交付成果展示 */}
                      {lastMergeResult && (
                        <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/5 via-card to-card p-5 space-y-4 shadow-sm animate-in fade-in duration-300">
                          <div className="flex items-center justify-between border-b border-border/60 pb-3">
                            <div className="flex items-center gap-2">
                              <div className="flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white">
                                <LuCheck className="size-3.5" />
                              </div>
                              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                混剪合并大片已就绪 · 完美过审
                              </span>
                              <Badge className="bg-emerald-600 text-white font-bold text-xs px-2.5 py-0.5 shadow-xs flex items-center gap-1">
                                <LuShieldCheck className="size-3.5" /> 暗水印已移除 (100% 破坏)
                              </Badge>
                            </div>
                            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs">
                              总耗时 {lastMergeResult.duration_secs || 0} 秒
                            </Badge>
                          </div>

                          {/* 指标对比网格 */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            <div className="rounded-lg bg-muted/40 p-2.5 border border-border/50">
                              <span className="text-[10px] text-muted-foreground block">合并视频分段数</span>
                              <span className="text-xs font-semibold font-mono text-foreground">
                                {lastMergeResult.clip_count} 段短视频
                              </span>
                            </div>
                            <div className="rounded-lg bg-muted/40 p-2.5 border border-border/50">
                              <span className="text-[10px] text-muted-foreground block">原素材总时长</span>
                              <span className="text-xs font-semibold font-mono text-foreground">
                                {lastMergeResult.original_total_duration} 秒
                              </span>
                            </div>
                            <div className="rounded-lg bg-muted/40 p-2.5 border border-border/50">
                              <span className="text-[10px] text-muted-foreground block">成片最终时长 (含转场消耗)</span>
                              <span className="text-xs font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                                {lastMergeResult.final_duration} 秒
                              </span>
                            </div>
                            <div className="rounded-lg bg-muted/40 p-2.5 border border-border/50">
                              <span className="text-[10px] text-muted-foreground block">成片体积与分辨率</span>
                              <span className="text-xs font-semibold font-mono text-foreground">
                                {lastMergeResult.final_size_mb} MB · {lastMergeResult.resolution}
                              </span>
                            </div>
                          </div>

                          {/* 转场详情链 */}
                          {lastMergeResult.transitions && lastMergeResult.transitions.length > 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 p-2 rounded-lg border border-border/40">
                              <span className="font-semibold text-foreground shrink-0">拼接转场轨迹:</span>
                              <span className="font-mono text-amber-600 dark:text-amber-400 truncate">
                                {lastMergeResult.transitions.join(" ➔ ")}
                              </span>
                            </div>
                          )}

                          {/* 成片视频播放器 */}
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                              <LuFileCheck className="size-3.5 text-emerald-500" />
                              合并大片在线流畅预览
                            </Label>
                            <div className="relative rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center border border-emerald-500/30">
                              <video
                                key={lastMergeResult.output_path}
                                controls
                                autoPlay
                                playsInline
                                preload="metadata"
                                className="w-full h-full object-contain"
                                src={getVideoStreamUrl(lastMergeResult.output_path)}
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground font-mono truncate" title={lastMergeResult.output_path}>
                              产物路径: {lastMergeResult.output_path}
                            </p>
                          </div>

                          {/* 交付快捷动作 */}
                          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-border/60">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenInExplorer(lastMergeResult.output_path)}
                              className="h-8 text-xs border-border gap-1.5"
                            >
                              <LuFolder className="size-3.5 text-muted-foreground" />
                              打开文件所在目录
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleSendMergedVideoToMatrix(lastMergeResult)}
                              className="h-8 text-xs bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm gap-1.5 font-medium"
                            >
                              <LuSend className="size-3.5" />
                              一键导入矩阵发布
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* 视图 B: 单视频独立清洗视图 (默认) */
                    dedupFiles[selectedDedupIdx] && (() => {
                      const currentFile = dedupFiles[selectedDedupIdx];
                      const currentResult = dedupResults[currentFile.path];

                      return (
                        <div className="space-y-4">
                          {/* 操作触发面板 */}
                          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-semibold text-foreground truncate max-w-sm">
                                    当前处理: {currentFile.name}
                                  </h4>
                                  {currentFile.blindWatermarkDetecting ? (
                                    <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] px-1.5 py-0 animate-pulse">
                                      暗水印检测中...
                                    </Badge>
                                  ) : currentFile.blindWatermarkDetected !== undefined ? (
                                    currentFile.blindWatermarkDetected ? (
                                      <Badge className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[10px] px-1.5 py-0 font-semibold flex items-center gap-1">
                                        <LuShieldAlert className="size-3" /> 存在暗水印 ({currentFile.blindWatermarkScore || 85}分)
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px] px-1.5 py-0 font-semibold flex items-center gap-1">
                                        <LuShieldCheck className="size-3" /> 不存在暗水印
                                      </Badge>
                                    )
                                  ) : null}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  策略: 【{dedupPreset === "fyp" ? "TikTok FYP 顶级爆破 🔥" : dedupPreset === "pip" ? "画中画毛玻璃画布 🖼️" : dedupPreset === "split" ? "三段分屏上下模糊 🎬" : dedupPreset === "curved" ? "波浪变速+胶片微粒 ⚡" : dedupPreset === "mute" ? "纯净静音出海 🔇" : dedupPreset === "light" ? "轻度安全清洗" : dedupPreset === "standard" ? "标准矩阵防查重" : dedupPreset === "deep" ? "深度重构清洗" : "自定义专家模式"}】 (微变速 {dedupSpeed}x · 缩放 {dedupZoom}x)
                                </p>
                              </div>

                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  onClick={() => handleExecuteSingleDedup(selectedDedupIdx)}
                                  disabled={isDedupProcessing}
                                  className="h-8 gap-1.5 text-xs bg-amber-500 text-white hover:bg-amber-600 shadow-sm font-medium"
                                >
                                  {isDedupProcessing && !batchDedupProgress ? (
                                    <LuRefreshCw className="size-3.5 animate-spin" />
                                  ) : (
                                    <LuScissors className="size-3.5" />
                                  )}
                                  {isDedupProcessing && !batchDedupProgress ? "正在清洗..." : "一键清洗当前视频"}
                                </Button>

                                {dedupFiles.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleExecuteBatchDedupAll}
                                    disabled={isDedupProcessing}
                                    className="h-8 gap-1 text-xs border-amber-500/30 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400 font-medium"
                                  >
                                    {batchDedupProgress ? (
                                      <LuRefreshCw className="size-3 animate-spin text-amber-500" />
                                    ) : (
                                      <LuZap className="size-3 text-amber-500" />
                                    )}
                                    {batchDedupProgress
                                      ? `批量处理 (${batchDedupProgress.current}/${batchDedupProgress.total})...`
                                      : `批量清洗全部 (${dedupFiles.length})`}
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* 处理进度动画 */}
                            {isDedupProcessing && (
                              <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3.5 space-y-2 animate-in fade-in">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                    <LuRefreshCw className="size-3.5 animate-spin text-amber-500" />
                                    FFmpeg 工业流水线正在执行多维去重特征计算...
                                  </span>
                                  <span className="font-mono text-muted-foreground text-[11px]">
                                    {batchDedupProgress ? `${batchDedupProgress.current} / ${batchDedupProgress.total}` : "单视频"}
                                  </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  正在执行：PTS 时间戳重编、中心裁切缩放、像素级色彩抖动重排、音频重采样以及元数据深度擦除。
                                </p>
                              </div>
                            )}
                          </div>

                          {/* 清洗结果卡片 */}
                          {currentResult ? (
                            <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/5 via-card to-card p-5 space-y-4 shadow-sm animate-in fade-in duration-300">
                              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white">
                                    <LuCheck className="size-3.5" />
                                  </div>
                                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                    视频去重清洗完成 · 已就绪
                                  </span>
                                  <Badge className="bg-emerald-600 text-white font-bold text-xs px-2.5 py-0.5 shadow-xs flex items-center gap-1">
                                    <LuShieldCheck className="size-3.5" /> 暗水印已移除 (100% 破坏)
                                  </Badge>
                                </div>
                                <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs">
                                  耗时 {currentResult.duration_secs || 0} 秒
                                </Badge>
                              </div>

                              {/* 暗水印已彻底移除证明卡 */}
                              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                <div className="flex items-center gap-2">
                                  <div className="size-5 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
                                    <LuShieldCheck className="size-3.5" />
                                  </div>
                                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                    平台频域暗水印已彻底移除 (100% 物理消除)
                                  </span>
                                </div>
                                <span className="text-[11px] text-emerald-600/80">
                                  空间坐标解耦 · 频域DCT掩膜覆盖 · SEI比特流净化
                                </span>
                              </div>

                              {/* 指标对比网格 */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                <div className="rounded-lg bg-muted/40 p-2.5 border border-border/50">
                                  <span className="text-[10px] text-muted-foreground block">原视频体积</span>
                                  <span className="text-xs font-semibold font-mono text-foreground">
                                    {currentResult.original_size_mb || currentFile.size_mb} MB
                                  </span>
                                </div>
                                <div className="rounded-lg bg-muted/40 p-2.5 border border-border/50">
                                  <span className="text-[10px] text-muted-foreground block">清洗后体积</span>
                                  <span className="text-xs font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                                    {currentResult.new_size_mb} MB
                                  </span>
                                </div>
                                <div className="rounded-lg bg-muted/40 p-2.5 border border-border/50">
                                  <span className="text-[10px] text-muted-foreground block">分辨率</span>
                                  <span className="text-xs font-semibold font-mono text-foreground">
                                    {currentResult.resolution || "1080x1920"}
                                  </span>
                                </div>
                                <div className="rounded-lg bg-muted/40 p-2.5 border border-border/50">
                                  <span className="text-[10px] text-muted-foreground block">时长变动</span>
                                  <span className="text-xs font-semibold font-mono text-foreground">
                                    {currentResult.original_duration_secs ? `${currentResult.original_duration_secs}s -> ${currentResult.new_duration_secs}s` : `${currentResult.speed}x 变速`}
                                  </span>
                                </div>
                              </div>

                              {/* 清洗后视频在线预览播放器 */}
                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                  <LuFileCheck className="size-3.5 text-emerald-500" />
                                  清洗成果视频在线试看
                                </Label>
                                <div className="relative rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center border border-emerald-500/30">
                                  <video
                                    key={currentResult.output_path}
                                    controls
                                    autoPlay
                                    playsInline
                                    preload="metadata"
                                    className="w-full h-full object-contain"
                                    src={getVideoStreamUrl(currentResult.output_path)}
                                  />
                                </div>
                                <p className="text-[10px] text-muted-foreground font-mono truncate" title={currentResult.output_path}>
                                  产物路径: {currentResult.output_path}
                                </p>
                              </div>

                              {/* 交付快捷动作 */}
                              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-border/60">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenInExplorer(currentResult.output_path)}
                                  className="h-8 text-xs border-border gap-1.5"
                                >
                                  <LuFolder className="size-3.5 text-muted-foreground" />
                                  打开文件所在目录
                                </Button>

                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handleSendCleanVideoToMatrix(currentResult)}
                                  className="h-8 text-xs bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm gap-1.5 font-medium"
                                >
                                  <LuSend className="size-3.5" />
                                  一键导入矩阵发布
                                </Button>
                              </div>
                            </div>
                          ) : (
                            /* 未清洗引导提示卡片 */
                            <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center space-y-3">
                              <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                                <LuScissors className="size-6" />
                              </div>
                              <div className="space-y-1">
                                <h4 className="text-sm font-semibold text-foreground">等待执行去重清洗</h4>
                                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                                  点击上方【一键清洗当前视频】即可启动工业级 FFmpeg 去重流水线。清洗完成后可即时试看并一键带入矩阵发布。
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab: 自媒体矩阵账号与会话管理 */}
        <TabsContent value="accounts" className="m-0 flex-1 overflow-y-auto p-6 data-[state=inactive]:hidden">
          <div className="mx-auto max-w-6xl">
            <MatrixAccountsPanel
              profiles={profiles}
              accounts={accounts}
              onAccountsChange={setAccounts}
              onNavigateToPublish={(platformId, accountId) => {
                setSelectedPlatform(platformId);
                setSelectedPublishAccountIds([accountId]);
                setActiveTab("matrix");
              }}
            />
          </div>
        </TabsContent>

        {/* Tab: 自媒体账号运营数据智能分析中心 */}
        <TabsContent value="analytics" className="m-0 flex min-h-0 flex-1 flex-col overflow-y-auto data-[state=inactive]:hidden">
          <SelfMediaAnalyticsPanel
            accounts={accounts}
            onSendToDedup={(filePath, fileName, sizeMb) => {
              setDedupFiles((prev) => {
                const exists = prev.some((p) => p.path === filePath);
                return exists
                  ? prev
                  : [
                      ...prev,
                      {
                        path: filePath,
                        name: fileName,
                        size_mb: sizeMb || 0,
                        status: "pending",
                      },
                    ];
              });
              setActiveTab("dedup");
            }}
          />
        </TabsContent>

        {/* Tab: StreamCap 视图 */}
        <TabsContent value="streamcap" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-0 data-[state=inactive]:hidden">
          {status?.running ? (
            <div className="relative flex h-full w-full flex-col bg-background">
              {/* 内嵌 StreamCap Web View */}
              <iframe
                key={iframeKey}
                src={status.url}
                title="StreamCap"
                className="h-full w-full border-none bg-background"
                allow="camera; microphone; display-capture; fullscreen; clipboard-read; clipboard-write"
              />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="relative mb-5 flex size-20 items-center justify-center rounded-3xl bg-primary/10 text-primary shadow-inner">
                <LuVideo className="size-10" />
                <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
                  <LuSparkles className="size-3.5" />
                </span>
              </div>

              <h2 className="text-xl font-bold tracking-tight text-foreground">
                StreamCap 多平台高清直播录制工具
              </h2>
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                已深度集成至 NarciPHBrowser。支持抖音、TikTok、快手、虎牙、斗鱼、Bilibili、YouTube 等 40+ 全球主流平台的直播间自动监控与实时抓取录制。
              </p>

              {/* 核心亮点 */}
              <div className="mt-6 grid max-w-xl grid-cols-3 gap-3 text-left">
                <div className="rounded-xl border border-border/80 bg-card p-3.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <LuCheck className="size-4 text-emerald-500" />
                    40+ 平台解析
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    支持抖音、TikTok、Kuaishou、YouTube 等直播源解析
                  </p>
                </div>

                <div className="rounded-xl border border-border/80 bg-card p-3.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <LuCpu className="size-4 text-sky-500" />
                    自动分段与转码
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    录制过程自动分段，支持保存为 MP4 / TS 格式及开播巡检
                  </p>
                </div>

                <div className="rounded-xl border border-border/80 bg-card p-3.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <LuShieldCheck className="size-4 text-purple-500" />
                    指纹网络协同
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    可无缝结合 Narci 代理/节点进行海外直播无障碍抓取
                  </p>
                </div>
              </div>

              {/* 启动操作按钮 */}
              <div className="mt-8 flex items-center gap-3">
                <Button
                  size="lg"
                  onClick={handleStart}
                  disabled={loading}
                  className="gap-2 bg-primary px-8 font-medium text-primary-foreground shadow-md hover:bg-primary/90"
                >
                  {loading ? (
                    <LuRefreshCw className="size-4 animate-spin" />
                  ) : (
                    <LuPlay className="size-4 fill-current" />
                  )}
                  {loading ? "正在启动 StreamCap 引擎..." : "一键启动 StreamCap 录制中心"}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleOpenFolder}
                  className="gap-2"
                >
                  <LuFolder className="size-4" />
                  打开保存目录
                </Button>
              </div>

              <div className="mt-5 flex items-center gap-4 text-xs text-muted-foreground">
                <span>运行环境: Python 3.10 + Flet Web 引擎</span>
                <span>·</span>
                <span>预设服务端口: 6006</span>
                <span>·</span>
                <span>源码位置: C:\Tools2\StreamCap</span>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Tab: 平台定位器与规则字典 (Rules Inspector) */}
        <TabsContent value="rules" className="m-0 flex-1 overflow-y-auto p-6 data-[state=inactive]:hidden">
          <div className="mx-auto max-w-5xl space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <LuList className="size-4 text-primary" />
                12 大主流平台原生自动化选择器规则字典
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                直接从「发布鸭」核心规则提取与解密，完全开放透明。包含上传地址、文件输入节点、标题框、正文选择器及发布动作。
              </p>
            </div>

            <div className="space-y-3">
              {Object.values(MATRIX_PLATFORMS).map((p) => (
                <div key={p.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-foreground flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
                      {p.name}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {p.category === "domestic" ? "国内平台" : "跨境平台"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded bg-muted/30 p-2 space-y-1">
                      <span className="font-semibold text-foreground">视频上传入口:</span>
                      <p className="font-mono text-[11px] text-muted-foreground break-all">
                        {p.rules.video?.upload_page_url || "未配置"}
                      </p>
                    </div>

                    <div className="rounded bg-muted/30 p-2 space-y-1">
                      <span className="font-semibold text-foreground">文件上传选择器:</span>
                      <p className="font-mono text-[11px] text-muted-foreground break-all">
                        {p.rules.video?.resource_upload_locator || "input[type='file']"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Tab: 平台支持与指引 */}
        <TabsContent value="guide" className="m-0 flex-1 overflow-y-auto p-6 data-[state=inactive]:hidden">
          <div className="mx-auto max-w-4xl space-y-6">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4">
                <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <LuRadio className="size-4 text-primary" />
                  StreamCap 全面支持的直播与音视频平台 (40+)
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  支持直接输入主播主页或直播间分享链接，自动解析推流协议与开播状态。
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    国内核心主流平台
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {["抖音 (Douyin)", "快手 (Kuaishou)", "虎牙直播 (Huya)", "斗鱼直播 (Douyu)", "哔哩哔哩 (Bilibili)", "小红书 (RED)", "视频号 (WeChat)", "网易CC", "YY直播", "酷狗直播", "千帆直播", "淘宝直播"].map((name) => (
                      <Badge key={name} variant="secondary" className="px-2.5 py-1 text-xs">
                        {name}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    海外与跨境主流平台 (推荐结合指纹浏览器代理节点)
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {["TikTok", "YouTube Live", "Twitch", "Shopee Live", "Chzzk (NAVER)", "SOOP Live (AfreecaTV)", "PandaTV", "FlexTV", "PopkonTV", "Showroom", "LiveMe"].map((name) => (
                      <Badge key={name} variant="outline" className="border-primary/30 px-2.5 py-1 text-xs font-medium text-primary">
                        {name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4">
                <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <LuSlidersHorizontal className="size-4 text-emerald-500" />
                  录制优化与指纹协同使用技巧
                </h3>
              </div>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <span className="font-semibold text-foreground">1. 海外 TikTok / Shopee / YouTube 直播抓取：</span>
                  <p className="mt-1">
                    在 StreamCap 左侧设置中开启“启用代理”，填入 NarciPHBrowser 代理网络或节点端口（如 127.0.0.1:7890 / 29990），即可流畅解析和录制海外专属直播流。
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <span className="font-semibold text-foreground">2. 自动分段录制与切片：</span>
                  <p className="mt-1">
                    建议保留默认的自动分段录制（如每 30 分钟切片一次），这样即使主播网络抖动或长时间直播，已录制好的切片仍能完整保存并直接用于视频剪辑。
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <span className="font-semibold text-foreground">3. 自动开播巡检与无人值守：</span>
                  <p className="mt-1">
                    在 StreamCap 录制列表中添加关注的主播后，引擎会在后台定时巡检（默认 180 秒）。一旦主播开播，系统将毫秒级触发录制，开播即录，下播即止。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab: 生态扩展计划 */}
        <TabsContent value="hub" className="m-0 flex-1 overflow-y-auto p-6 data-[state=inactive]:hidden">
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center">
              <h3 className="text-base font-semibold text-foreground">开放应用中心生态</h3>
              <p className="mt-1.5 text-xs text-muted-foreground">
                随着 StreamCap 直播录制 与 矩阵全自动发布 的原生集成，系统已形成完整的生产与分发链路：
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card p-5 opacity-90">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">视频智能去重与防查重清洗</h4>
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">已原生集成</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  利用 FFmpeg 执行中心微裁切 (1.02x)、微变速 (1.03x)、彻底剥离元数据并重建关键帧与音频流，有效规避平台查重。
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 opacity-90">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">AI 爆款文案工坊 & Edge-TTS 配音</h4>
                  <Badge className="bg-indigo-500/10 text-indigo-600 border-indigo-500/30">已原生集成</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  支持 DeepSeek/OpenAI 与智能离线模板生成爆款标题描述；结合微软 Edge-TTS 免费生成多音色旁白与毫秒对齐 SRT 字幕。
                </p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* 弹窗：AI 爆款文案工坊 (专注业务文案，无配置干扰) */}
      <Dialog open={showAiModal} onOpenChange={setShowAiModal}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <LuSparkles className="size-5 text-indigo-500" />
              AI 爆款文案工坊
            </DialogTitle>
            <DialogDescription className="text-xs">
              输入视频卖点或核心内容，一键提炼符合各大平台字数合规红线与爆款调性的标题、描述及 #话题。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-1">
            {/* 当前生效 AI 引擎状态条 (与配置彻底解耦) */}
            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 border border-border/60">
              <div className="flex items-center gap-2">
                {aiApiKey.trim() ? (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>AI 引擎: {aiModel.trim() || "云端大模型"} (云端已就绪)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-2 rounded-full bg-muted-foreground/40" />
                    <span>AI 引擎: 智能离线爆款推荐引擎 (零配置即开即用)</span>
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTempApiKey(aiApiKey);
                  setTempBaseUrl(aiBaseUrl);
                  setTempModel(aiModel);
                  setShowLlmConfigModal(true);
                }}
                className="h-6 text-[11px] gap-1 text-primary hover:underline px-2"
              >
                <LuSlidersHorizontal className="size-3" />
                {aiApiKey.trim() ? "管理 AI 密钥与模型" : "配置云端大模型"}
              </Button>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">视频主题 / 核心卖点 / 旁白草稿</Label>
                {title && (
                  <button
                    type="button"
                    onClick={() => setAiPrompt(title)}
                    className="text-[11px] text-indigo-600 hover:underline"
                  >
                    引入当前作品标题
                  </button>
                )}
              </div>
              <textarea
                rows={3}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="例如：数码好物开箱，测评最新折叠屏手机，突出便携大屏与强悍续航..."
                className="mt-1.5 flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">目标发布平台</Label>
              <select
                value={aiPlatform}
                onChange={(e) => setAiPlatform(e.target.value)}
                className="mt-1.5 flex h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="douyin">抖音 (标题≤30字，黄金前3秒抓眼)</option>
                <option value="xiaohongshu">小红书 (标题≤20字，吸睛Emoji+干货感)</option>
                <option value="weixin">微信视频号 (标题≤16字，沉稳合规防红字)</option>
                <option value="bilibili">哔哩哔哩 (标题≤80字，信息量大+二次元梗)</option>
                <option value="tiktok">TikTok (纯正英文出海，强Call to Action)</option>
                <option value="kuaishou">快手 (老铁接地气，真实生活共鸣)</option>
              </select>
            </div>

            {aiResult && (
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <LuCheckCheck className="size-4" /> 生成结果 ({aiResult.source || (aiApiKey.trim() ? "云端模型生成" : "离线爆款引擎")})
                  </span>
                  <span className="text-[10px] text-muted-foreground">平台: {aiResult.platform}</span>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-foreground">爆款标题:</span>
                  <div className="rounded border border-border bg-background p-2 text-xs font-medium text-foreground select-text">
                    {aiResult.title}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-foreground">正文与描述:</span>
                  <div className="rounded border border-border bg-background p-2 text-xs text-foreground whitespace-pre-wrap select-text">
                    {aiResult.summary}
                  </div>
                </div>

                {aiResult.tags && aiResult.tags.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-foreground">关联话题标签:</span>
                    <div className="flex flex-wrap gap-1">
                      {aiResult.tags.map((tag, idx) => (
                        <Badge key={idx} variant="secondary" className="text-[10px]">
                          #{tag.replace(/^#/, '')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAiModal(false)}
              className="h-8 text-xs text-muted-foreground"
            >
              关闭
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isGeneratingAi || !aiPrompt.trim()}
                onClick={handleGenerateAiCopy}
                className="h-8 text-xs border-indigo-500/30 text-indigo-600 hover:bg-indigo-500/10 gap-1.5"
              >
                {isGeneratingAi ? <LuRefreshCw className="size-3 animate-spin" /> : <LuSparkles className="size-3" />}
                {isGeneratingAi ? "正在构思生成..." : "立即生成文案"}
              </Button>

              {aiResult && (
                <Button
                  type="button"
                  size="sm"
                  onClick={applyAiCopy}
                  className="h-8 text-xs bg-indigo-600 text-white hover:bg-indigo-700 gap-1.5"
                >
                  <LuCheck className="size-3" />
                  一键应用至发布表单
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 独立弹窗：全局 AI 大模型引擎配置 (与业务解耦) */}
      <Dialog open={showLlmConfigModal} onOpenChange={setShowLlmConfigModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <LuSlidersHorizontal className="size-5 text-indigo-500" />
              全局 AI / LLM 大模型配置
            </DialogTitle>
            <DialogDescription className="text-xs">
              在此统一配置您的大模型服务商与 API Key。配置一次，矩阵文案及所有 AI 模块全局复用。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* 常用服务商预设一键填入 */}
            <div>
              <Label className="text-xs font-semibold">选择快捷预设模版</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {LLM_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      setTempBaseUrl(p.baseUrl);
                      setTempModel(p.model);
                      toast.info(`已填入 ${p.name} 接口地址与预设模型`);
                    }}
                    className="flex flex-col items-start rounded-lg border border-border p-2 text-left hover:border-indigo-500 hover:bg-indigo-500/5 transition-all"
                  >
                    <span className="font-semibold text-foreground text-xs">{p.name}</span>
                    <span className="text-[10px] text-muted-foreground line-clamp-1">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold">API Key (密钥)</Label>
                <Input
                  type="password"
                  placeholder="sk-..."
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  className="mt-1 h-8 text-xs font-mono"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  若留空，系统将自动启用免配置的离线高转化爆款模板引擎。
                </p>
              </div>

              <div>
                <Label className="text-xs font-semibold">API Base URL (接口端点)</Label>
                <Input
                  placeholder="https://api.openai.com/v1"
                  value={tempBaseUrl}
                  onChange={(e) => setTempBaseUrl(e.target.value)}
                  className="mt-1 h-8 text-xs font-mono"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Model Name (模型标识)</Label>
                <Input
                  placeholder="例如: gpt-4o-mini 或 deepseek-chat 或 LongCat-2.5-Preview"
                  value={tempModel}
                  onChange={(e) => setTempModel(e.target.value)}
                  className="mt-1 h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isTestingLlm || !tempApiKey.trim()}
              onClick={handleTestLlm}
              className="h-8 text-xs gap-1.5 border-indigo-500/30 text-indigo-600 hover:bg-indigo-500/10"
            >
              {isTestingLlm ? <LuRefreshCw className="size-3 animate-spin" /> : <LuSparkles className="size-3" />}
              {isTestingLlm ? "测试连通性中..." : "测试连接 (Test)"}
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowLlmConfigModal(false)}
                className="h-8 text-xs text-muted-foreground"
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveLlmConfig}
                className="h-8 text-xs bg-indigo-600 text-white hover:bg-indigo-700 gap-1.5"
              >
                <LuCheck className="size-3" />
                保存配置
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 弹窗：Edge-TTS 智能配音台 */}
      <Dialog open={showTtsModal} onOpenChange={setShowTtsModal}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <LuMic className="size-5 text-sky-500" />
              Edge-TTS 零成本超自然人声配音与精准字幕
            </DialogTitle>
            <DialogDescription className="text-xs">
              基于微软神经语音合成技术，完全免费、零调用限制，极速输出电影级旁白音频与毫秒对齐的 SRT 字幕。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">配音文本 / 脚本旁白</Label>
                {summary && (
                  <button
                    type="button"
                    onClick={() => setTtsText(summary)}
                    className="text-[11px] text-sky-600 hover:underline"
                  >
                    引入当前视频简介正文
                  </button>
                )}
              </div>
              <textarea
                rows={4}
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                placeholder="在此输入需要配音的文本内容，支持长文本与分段..."
                className="mt-1.5 flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>支持多行文本，标点符号将自动转换为语音停顿</span>
                <span>{ttsText.length} 字</span>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">选择超自然拟人音色</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {EDGE_TTS_VOICES.map((v) => {
                  const isSelected = ttsVoice === v.id;
                  return (
                    <div
                      key={v.id}
                      onClick={() => setTtsVoice(v.id)}
                      className={`flex cursor-pointer flex-col rounded-lg border p-2 text-xs transition-all select-none ${
                        isSelected
                          ? "border-sky-500 bg-sky-500/10 shadow-sm ring-1 ring-sky-500"
                          : "border-border bg-background hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground text-xs truncate">{v.name.split(" ")[0]}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-sky-500/40 text-sky-600">
                          {v.tag}
                        </Badge>
                      </div>
                      <span className="mt-1 text-[10px] text-muted-foreground line-clamp-1">{v.desc}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {ttsResult && (
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                    <LuVolume2 className="size-4" /> 音频与字幕生成成功
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    约 {ttsResult.duration_secs || ttsResult.duration_estimate_secs || 0} 秒 · {ttsResult.file_size_kb || 0} KB
                  </span>
                </div>

                {/* 音频试听 */}
                <div className="rounded-lg bg-background/80 p-2 border border-border/80">
                  <audio
                    controls
                    autoPlay
                    className="w-full h-8"
                    src={ttsResult.audio_data_url || (ttsResult.audio_path ? getVideoStreamUrl(ttsResult.audio_path) : "")}
                  />
                </div>

                <div className="space-y-1.5 text-[11px] font-mono text-muted-foreground">
                  <div className="flex items-center justify-between bg-muted/40 px-2 py-1 rounded">
                    <span className="truncate max-w-[340px]">音频: {ttsResult.audio_path}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(ttsResult.audio_path);
                        toast.success("已复制音频路径");
                      }}
                      className="text-primary hover:underline shrink-0 ml-2"
                    >
                      复制路径
                    </button>
                  </div>
                  <div className="flex items-center justify-between bg-muted/40 px-2 py-1 rounded">
                    <span className="truncate max-w-[340px]">字幕: {ttsResult.srt_path}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(ttsResult.srt_path);
                        toast.success("已复制 SRT 字幕路径");
                      }}
                      className="text-primary hover:underline shrink-0 ml-2"
                    >
                      复制路径
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowTtsModal(false)}
              className="h-8 text-xs text-muted-foreground"
            >
              关闭
            </Button>

            <div className="flex items-center gap-2">
              {ttsResult && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const dir = ttsResult.audio_path.replace(/[/\\][^/\\]+$/, "");
                    invoke("open_streamcap_directory", { path: dir });
                  }}
                  className="h-8 text-xs gap-1.5"
                >
                  <LuFolderOpen className="size-3" />
                  打开生成目录
                </Button>
              )}

              <Button
                type="button"
                size="sm"
                disabled={isGeneratingTts || !ttsText.trim()}
                onClick={handleGenerateTts}
                className="h-8 text-xs bg-sky-600 text-white hover:bg-sky-700 gap-1.5"
              >
                {isGeneratingTts ? <LuRefreshCw className="size-3 animate-spin" /> : <LuMic className="size-3" />}
                {isGeneratingTts ? "正在合成音频与字幕..." : "立即生成配音"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 弹窗：多平台无水印原片一键提取解析器 */}
      <Dialog open={showNoWatermarkModal} onOpenChange={setShowNoWatermarkModal}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <LuSparkles className="size-5 text-indigo-500" />
              多平台无水印原画视频一键提取
            </DialogTitle>
            <DialogDescription className="text-xs">
              支持 YouTube（含 Shorts）、B站、抖音、TikTok、快手、小红书、Twitter/X 等全网平台。直接粘贴 App 分享文案或视频链接，系统将自动穿透 CDN 并直链下载 1080P/4K 无水印原片。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">粘贴视频分享文案或链接</Label>
              <textarea
                rows={3}
                value={noWatermarkShareText}
                onChange={(e) => setNoWatermarkShareText(e.target.value)}
                placeholder="支持粘贴整段文案或直链，例如：&#10;• YouTube: https://www.youtube.com/watch?v=... 或 https://youtube.com/shorts/...&#10;• 抖音/TikTok: 复制打开抖音... https://v.douyin.com/... 或 https://vt.tiktok.com/...&#10;• B站/快手/小红书: https://b23.tv/... 或 https://v.kuaishou.com/... 或 http://xhslink.com/..."
                className="mt-1.5 flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                系统将自动通过正则提取其中的 URL，无需手动删减文字或特殊符号。
              </p>
            </div>

            {/* 提取结果展示 */}
            {noWatermarkResult && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 space-y-2.5 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LuCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      无水印视频提取并下载成功！
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase border-emerald-500/30 text-emerald-600">
                    {noWatermarkResult.platform || "VIDEO"}
                  </Badge>
                </div>

                <div className="rounded-lg bg-background/80 p-2.5 text-xs space-y-1 font-mono border border-border/50">
                  <div className="font-semibold text-foreground truncate">
                    标题: {noWatermarkResult.title || noWatermarkResult.file_name}
                  </div>
                  <div className="text-muted-foreground text-[11px]">
                    创作者: {noWatermarkResult.author || "平台作者"} · 大小: {noWatermarkResult.size_mb || 0} MB
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate" title={noWatermarkResult.local_path}>
                    存放路径: {noWatermarkResult.local_path}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (noWatermarkResult.local_path) {
                        invoke("open_path_in_explorer", { path: noWatermarkResult.local_path });
                      }
                    }}
                    className="h-7 text-xs border-border gap-1"
                  >
                    <LuFolderOpen className="size-3" />
                    打开目录
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setShowNoWatermarkModal(false);
                      toast.success("已切换至去重工作台，可立即执行微变防查重！");
                    }}
                    className="h-7 text-xs bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm gap-1"
                  >
                    <LuScissors className="size-3" />
                    立即在工作台去重清洗
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between border-t border-border/80 pt-3">
            <span className="text-[11px] text-muted-foreground">
              提取完成后将自动载入左侧「待清洗素材列表」
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowNoWatermarkModal(false)}
                className="h-8 text-xs"
              >
                关闭
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isResolvingNoWatermark || !noWatermarkShareText.trim()}
                onClick={handleResolveNoWatermark}
                className="h-8 text-xs bg-indigo-600 text-white hover:bg-indigo-700 gap-1.5 shadow-sm"
              >
                {isResolvingNoWatermark ? (
                  <LuRefreshCw className="size-3.5 animate-spin" />
                ) : (
                  <LuSparkles className="size-3.5" />
                )}
                {isResolvingNoWatermark ? "正在解析下载中..." : "一键提取无水印原片"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
