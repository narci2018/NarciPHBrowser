import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  LuFolderPlus,
  LuUserPlus,
  LuDownload,
  LuClock,
  LuCheck,
  LuTrash2,
  LuFolder,
  LuSend,
  LuScissors,
  LuPlay,
  LuRefreshCw,
  LuLayers,
  LuUsers,
  LuVideo,
  LuSearch,
  LuPlus,
  LuFileVideo,
  LuSettings,
  LuExternalLink,
  LuSquare,
  LuSquareCheck,
  LuSparkles,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// 顶层支持的自媒体平台列表
export const COLLECTOR_PLATFORMS = [
  { id: "all", name: "全部平台", icon: "🌐", color: "from-zinc-500 to-slate-600" },
  { id: "douyin", name: "抖音", icon: "🎵", color: "from-rose-500 to-pink-600" },
  { id: "tiktok", name: "TikTok", icon: "🖤", color: "from-slate-900 to-zinc-800" },
  { id: "kuaishou", name: "快手", icon: "⚡", color: "from-amber-500 to-orange-500" },
  { id: "xiaohongshu", name: "小红书", icon: "📕", color: "from-red-500 to-rose-600" },
  { id: "weixin", name: "微信视频号", icon: "🟢", color: "from-emerald-500 to-teal-600" },
  { id: "bilibili", name: "哔哩哔哩", icon: "📺", color: "from-sky-400 to-blue-500" },
  { id: "youtube", name: "YouTube", icon: "▶️", color: "from-red-600 to-rose-700" },
];

export interface CollectorAccount {
  id: string;
  platform: string;
  accountName: string;
  homeUrl: string;
  avatarUrl?: string;
  note?: string;
  syncSchedule: "none" | "1h" | "6h" | "12h" | "24h";
  autoDownloadNew?: boolean; // 发现新作品时是否自动加入后台下载队列
  syncTimeRange?: "all" | "3d" | "7d" | "15d" | "30d" | "90d"; // 近期时间跨度 (默认 7d)
  syncMaxCount?: number; // 单次同步最大抓取条数 (默认 20 条，可选 10 / 20 / 50 / 100)
  lastSyncAt?: number;
  createdAt: number;
}

export interface CollectorAlbum {
  id: string;
  name: string;
  platform: string;
  description?: string;
  color?: string;
  createdAt: number;
}

export interface CollectedVideo {
  id: string;
  platform: string;
  title: string;
  shareUrl: string;
  accountId?: string;
  albumId?: string;
  coverUrl?: string;
  author?: string;
  publishTime?: string;
  likeCount?: string;
  durationSecs?: number;
  videoStreamUrl?: string;
  status: "pending" | "downloading" | "downloaded" | "failed" | "queued";
  localPath?: string;
  fileName?: string;
  sizeMb?: number;
  downloadedAt?: number;
  error?: string;
  createdAt: number;
}

export interface MaterialCollectorPanelProps {
  onSendToDedup: (filePath: string, fileName: string, sizeMb?: number) => void;
  onSendToMatrix: (filePath: string, fileName: string, sizeMb?: number) => void;
  mediaServerPort: number;
}

const STORAGE_KEY_ACCOUNTS = "matrix_collector_accounts_v1";
const STORAGE_KEY_ALBUMS = "matrix_collector_albums_v1";
const STORAGE_KEY_VIDEOS = "matrix_collector_videos_v1";

export const MaterialCollectorPanel: React.FC<MaterialCollectorPanelProps> = ({
  onSendToDedup,
  onSendToMatrix,
  mediaServerPort,
}) => {
  // 顶层选中的平台筛选
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");

  // 视图类型: albums (专辑) | accounts (博主) | library (已下载素材库) | list (全部素材清单)
  const [activeSubView, setActiveSubView] = useState<"albums" | "accounts" | "library" | "list">("accounts");

  // 搜索关键字
  const [searchQuery, setSearchQuery] = useState<string>("");

  // 1. 博主账号库
  const [accounts, setAccounts] = useState<CollectorAccount[]>(() => {
    try {
      const data = localStorage.getItem(STORAGE_KEY_ACCOUNTS);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          // 自动修复旧版示例地址为用户提供的真实有效地址，避免用户重复受阻
          return parsed.map((a: any) => {
            if (a.accountName?.includes("小A") && (!a.homeUrl || a.homeUrl.includes("demo") || a.homeUrl.includes("_fin"))) {
              return { ...a, homeUrl: "https://v.douyin.com/4yS4yT7qsxY/" };
            }
            return a;
          });
        }
      }
    } catch (_) {}
    return [];
  });

  // 2. 自定义主题专辑
  const [albums, setAlbums] = useState<CollectorAlbum[]>(() => {
    try {
      const data = localStorage.getItem(STORAGE_KEY_ALBUMS);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed.filter((a: any) => !a.id?.startsWith("alb_demo_"));
        }
      }
    } catch (_) {}
    return [];
  });

  // 3. 收集的视频素材库 (严格杜绝任何虚假演示数据注入)
  const [videos, setVideos] = useState<CollectedVideo[]>(() => {
    try {
      const data = localStorage.getItem(STORAGE_KEY_VIDEOS);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          // 彻底清除早期注入的所有虚假演示数据（包含 post_fin_, vid_demo_, unsplash 占位等）
          return parsed.filter(
            (v: any) =>
              !v.id?.startsWith("vid_demo_") &&
              !v.id?.startsWith("fin_") &&
              !v.id?.startsWith("post_fin_") &&
              !v.id?.startsWith("gen_") &&
              !v.id?.startsWith("post_gen_") &&
              !v.shareUrl?.includes("oceans.mp4") &&
              !v.shareUrl?.includes("mov_bbb.mp4") &&
              !v.shareUrl?.includes("flower.mp4") &&
              !v.shareUrl?.includes("big_buck_bunny.mp4") &&
              !v.coverUrl?.includes("unsplash.com")
          );
        }
      }
    } catch (_) {}
    return [];
  });

  // 当前进入的博主详情 (为空则展示博主列表卡片)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  // 当前进入的专辑详情 (为空则展示专辑列表卡片)
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);

  // 批量多选
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);

  // 批量下载状态与进度
  const [isBatchExtracting, setIsBatchExtracting] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  // 博主同步抓取中状态
  const [isSyncingAccount, setIsSyncingAccount] = useState<boolean>(false);

  // 视频预览播放器状态
  const [previewVideo, setPreviewVideo] = useState<CollectedVideo | null>(null);

  // 弹窗状态
  const [showAddVideoModal, setShowAddVideoModal] = useState<boolean>(false);
  const [showAddAccountModal, setShowAddAccountModal] = useState<boolean>(false);
  const [showAddAlbumModal, setShowAddAlbumModal] = useState<boolean>(false);
  const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false);
  const [editingAccount, setEditingAccount] = useState<CollectorAccount | null>(null);

  // 添加视频表单数据
  const [videoInputText, setVideoInputText] = useState<string>("");
  const [videoTargetAlbum, setVideoTargetAlbum] = useState<string>("");
  const [videoTargetAccount, setVideoTargetAccount] = useState<string>("");
  const [videoTargetPlatform] = useState<string>("douyin");
  const [autoDownloadImmediately, setAutoDownloadImmediately] = useState<boolean>(true);

  // 添加博主表单数据
  const [newAccountPlatform, setNewAccountPlatform] = useState<string>("douyin");
  const [newAccountName, setNewAccountName] = useState<string>("");
  const [newAccountUrl, setNewAccountUrl] = useState<string>("");
  const [newAccountNote, setNewAccountNote] = useState<string>("");
  const [newAccountSchedule, setNewAccountSchedule] = useState<"none" | "1h" | "6h" | "12h" | "24h">("6h");
  const [newAccountSyncTimeRange, setNewAccountSyncTimeRange] = useState<"all" | "3d" | "7d" | "15d" | "30d" | "90d">("all");
  const [newAccountSyncMaxCount, setNewAccountSyncMaxCount] = useState<number>(20);
  const [newAccountAutoDownload, setNewAccountAutoDownload] = useState<boolean>(false);
  const [autoFetchPostsAfterAdd, setAutoFetchPostsAfterAdd] = useState<boolean>(true);

  // 添加专辑表单数据
  const [newAlbumName, setNewAlbumName] = useState<string>("");
  const [newAlbumPlatform, setNewAlbumPlatform] = useState<string>("all");
  const [newAlbumDesc, setNewAlbumDesc] = useState<string>("");
  const [newAlbumColor] = useState<string>("bg-amber-500");

  // 数据持久化
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
    } catch (_) {}
  }, [accounts]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ALBUMS, JSON.stringify(albums));
    } catch (_) {}
  }, [albums]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_VIDEOS, JSON.stringify(videos));
    } catch (_) {}
  }, [videos]);

  // =========================================================================
  // 后台任务下载队列调度器 (Task Worker: 静默并发，下载不卡顿界面)
  // =========================================================================
  const [isQueueWorkerActive, setIsQueueWorkerActive] = useState<boolean>(false);
  const queuedVideos = videos.filter((v) => v.status === "queued");

  useEffect(() => {
    if (queuedVideos.length === 0 || isQueueWorkerActive) return;

    let isCancelled = false;
    const processQueueItem = async () => {
      setIsQueueWorkerActive(true);
      const target = queuedVideos[0];

      // 将状态更新为 downloading
      setVideos((prev) =>
        prev.map((v) => (v.id === target.id ? { ...v, status: "downloading", error: undefined } : v))
      );

      try {
        const res = await invoke<any>("download_no_watermark_video", {
          shareText: target.shareUrl,
        });

        if (!isCancelled && res && res.local_path) {
          setVideos((prev) =>
            prev.map((v) =>
              v.id === target.id
                ? {
                    ...v,
                    status: "downloaded",
                    localPath: res.local_path,
                    fileName: res.file_name || res.title,
                    title: res.title || v.title,
                    author: res.author || v.author,
                    sizeMb: res.size_mb || 0,
                    downloadedAt: Date.now(),
                    error: undefined,
                  }
                : v
            )
          );
          toast.success(`🎉 [后台下载完成] ${res.title || target.title}`);
        } else if (!isCancelled) {
          throw new Error(res?.error || "未能获取到下载视频路径");
        }
      } catch (err: any) {
        if (!isCancelled) {
          const msg = err?.toString() || String(err);
          setVideos((prev) =>
            prev.map((v) => (v.id === target.id ? { ...v, status: "failed", error: msg } : v))
          );
        }
      } finally {
        if (!isCancelled) {
          setIsQueueWorkerActive(false);
        }
      }
    };

    processQueueItem();
    return () => {
      isCancelled = true;
    };
  }, [queuedVideos, isQueueWorkerActive]);

  // =========================================================================
  // 定时监控后台心跳轮询调度器 (按 1h/6h/12h/24h 自动巡检新视频)
  // =========================================================================
  useEffect(() => {
    const checkScheduledAccounts = () => {
      const now = Date.now();
      accounts.forEach((acc) => {
        if (acc.syncSchedule === "none") return;
        const intervalMs =
          acc.syncSchedule === "1h"
            ? 3600000
            : acc.syncSchedule === "6h"
            ? 3600000 * 6
            : acc.syncSchedule === "12h"
            ? 3600000 * 12
            : 3600000 * 24;
        const last = acc.lastSyncAt || 0;
        if (now - last >= intervalMs) {
          handleSyncAccountVideos(acc);
        }
      });
    };

    const timer = setInterval(checkScheduledAccounts, 60000);
    return () => clearInterval(timer);
  }, [accounts]);

  // 本地/远程流媒体直链（支持本地 206 分片与远程防盗链流媒体代理）
  const getVideoStreamUrl = (localPath?: string, remoteUrl?: string) => {
    if (localPath) {
      const encoded = encodeURIComponent(localPath);
      return `http://127.0.0.1:${mediaServerPort || 29995}/api/v1/media/stream?path=${encoded}`;
    }
    if (remoteUrl) {
      const encoded = encodeURIComponent(remoteUrl);
      return `http://127.0.0.1:${mediaServerPort || 29995}/api/v1/media/stream?url=${encoded}`;
    }
    return "";
  };

  // 在系统文件管理器中打开
  const handleOpenPath = async (filePath?: string) => {
    if (!filePath) return;
    try {
      await invoke("open_path_in_explorer", { path: filePath });
    } catch (e: any) {
      toast.error(`打开文件失败: ${e.message || String(e)}`);
    }
  };

  // 在系统外部浏览器中打开指定链接或博主主页
  const handleOpenUrl = async (rawUrl?: string, platform?: string, accountName?: string) => {
    let target = rawUrl?.trim();
    if (!target && accountName) {
      if (platform === "douyin") {
        target = `https://www.douyin.com/search/${encodeURIComponent(accountName)}`;
      } else if (platform === "tiktok") {
        target = `https://www.tiktok.com/search?q=${encodeURIComponent(accountName)}`;
      } else if (platform === "kuaishou") {
        target = `https://www.kuaishou.com/search/author?searchKey=${encodeURIComponent(accountName)}`;
      } else if (platform === "bilibili") {
        target = `https://search.bilibili.com/all?keyword=${encodeURIComponent(accountName)}`;
      } else if (platform === "youtube") {
        target = `https://www.youtube.com/results?search_query=${encodeURIComponent(accountName)}`;
      } else {
        target = `https://www.baidu.com/s?wd=${encodeURIComponent(accountName)}`;
      }
    }
    if (!target) {
      toast.error("未找到可访问的博主主页链接");
      return;
    }
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      target = `https://${target}`;
    }
    try {
      await invoke("open_url_in_browser", { url: target });
      toast.success("已在系统浏览器中打开！");
    } catch (e: any) {
      toast.error(`打开链接失败: ${e.message || String(e)}`);
    }
  };

  // =========================================================================
  // 1. 执行单视频实时无水印提取下载
  // =========================================================================
  const handleExtractSingle = async (item: CollectedVideo) => {
    if (!item.shareUrl) {
      toast.error("视频链接无效");
      return;
    }

    setVideos((prev) =>
      prev.map((v) => (v.id === item.id ? { ...v, status: "downloading", error: undefined } : v))
    );

    try {
      toast.info(`正在实时解析下载【${item.title || "视频"}】无水印原画...`);
      const res = await invoke<any>("download_no_watermark_video", {
        shareText: item.shareUrl,
      });

      if (res && res.local_path) {
        setVideos((prev) =>
          prev.map((v) =>
            v.id === item.id
              ? {
                  ...v,
                  status: "downloaded",
                  localPath: res.local_path,
                  fileName: res.file_name || res.title,
                  title: res.title || v.title,
                  author: res.author || v.author,
                  sizeMb: res.size_mb || 0,
                  downloadedAt: Date.now(),
                }
              : v
          )
        );
        toast.success(`🎉 成功下载无水印视频: 【${res.title || res.file_name}】`);
      } else {
        throw new Error(res?.error || "未能获取到下载视频路径");
      }
    } catch (err: any) {
      const msg = err?.toString() || String(err);
      setVideos((prev) =>
        prev.map((v) => (v.id === item.id ? { ...v, status: "failed", error: msg } : v))
      );
      toast.error(`提取失败: ${msg}`);
    }
  };

  // =========================================================================
  // 2. 加入后台下载任务队列 (单条 / 批量)
  // =========================================================================
  const handleQueueSingle = (item: CollectedVideo) => {
    if (item.status === "downloaded") {
      toast.info("该视频已下载完成，无需重复排队");
      return;
    }
    setVideos((prev) =>
      prev.map((v) => (v.id === item.id ? { ...v, status: "queued", error: undefined } : v))
    );
    toast.success(`已加入后台下载任务队列: 【${item.title}】`);
  };

  const handleBatchQueue = (targetVideos: CollectedVideo[]) => {
    const pendings = targetVideos.filter((v) => v.status !== "downloaded" && v.status !== "queued");
    if (pendings.length === 0) {
      toast.info("所选视频均已在队列或已下载完成");
      return;
    }
    const targetIds = new Set(pendings.map((v) => v.id));
    setVideos((prev) =>
      prev.map((v) => (targetIds.has(v.id) ? { ...v, status: "queued", error: undefined } : v))
    );
    toast.success(`已将 ${pendings.length} 条视频加入后台下载任务队列！`);
  };

  // =========================================================================
  // 3. 批量实时提取视频集合
  // =========================================================================
  const handleBatchExtract = async (targetVideos: CollectedVideo[]) => {
    const pendings = targetVideos.filter((v) => v.status !== "downloaded");
    if (pendings.length === 0) {
      toast.info("所选列表内视频均已下载完成，无需重复提取");
      return;
    }

    setIsBatchExtracting(true);
    let successCount = 0;

    try {
      for (let i = 0; i < pendings.length; i++) {
        const item = pendings[i];
        setBatchProgress({ current: i + 1, total: pendings.length });
        toast.info(`[${i + 1}/${pendings.length}] 正在提取: ${item.title || item.shareUrl.slice(0, 30)}`);

        setVideos((prev) =>
          prev.map((v) => (v.id === item.id ? { ...v, status: "downloading" } : v))
        );

        try {
          const res = await invoke<any>("download_no_watermark_video", {
            shareText: item.shareUrl,
          });

          if (res && res.local_path) {
            setVideos((prev) =>
              prev.map((v) =>
                v.id === item.id
                  ? {
                      ...v,
                      status: "downloaded",
                      localPath: res.local_path,
                      fileName: res.file_name || res.title,
                      title: res.title || v.title,
                      author: res.author || v.author,
                      sizeMb: res.size_mb || 0,
                      downloadedAt: Date.now(),
                    }
                  : v
              )
            );
            successCount++;
          }
        } catch (subErr: any) {
          setVideos((prev) =>
            prev.map((v) => (v.id === item.id ? { ...v, status: "failed", error: String(subErr) } : v))
          );
        }
      }

      toast.success(`批量提取完毕！成功: ${successCount} / 共: ${pendings.length} 条`);
    } finally {
      setIsBatchExtracting(false);
      setBatchProgress({ current: 0, total: 0 });
    }
  };

  // =========================================================================
  // 4. 自动同步博主最新作品 (调用真实嗅探爬虫，绝不伪造虚假数据)
  // =========================================================================
  const filterPostsByTimeRange = (posts: any[], range: string = "7d"): any[] => {
    if (!range || range === "all") return posts;

    const now = Date.now();
    let maxAgeMs = 7 * 86400 * 1000;
    if (range === "3d") maxAgeMs = 3 * 86400 * 1000;
    else if (range === "7d") maxAgeMs = 7 * 86400 * 1000;
    else if (range === "15d") maxAgeMs = 15 * 86400 * 1000;
    else if (range === "30d") maxAgeMs = 30 * 86400 * 1000;
    else if (range === "90d") maxAgeMs = 90 * 86400 * 1000;

    return posts.filter((p) => {
      const pTimeStr = p.publish_time || p.publishTime;
      if (pTimeStr && typeof pTimeStr === "string") {
        if (pTimeStr.includes("天前")) {
          const m = pTimeStr.match(/(\d+)\s*天前/);
          if (m) {
            const days = parseInt(m[1], 10);
            return days * 86400 * 1000 <= maxAgeMs;
          }
        }
        if (
          pTimeStr.includes("小时前") ||
          pTimeStr.includes("分钟前") ||
          pTimeStr.includes("刚刚") ||
          pTimeStr.includes("近期")
        ) {
          return true;
        }
        if (pTimeStr.includes("月前")) {
          const m = pTimeStr.match(/(\d+)\s*月前/);
          if (m) {
            const months = parseInt(m[1], 10);
            return months * 30 * 86400 * 1000 <= maxAgeMs;
          }
        }
        const parsed = Date.parse(pTimeStr);
        if (!isNaN(parsed)) {
          return now - parsed <= maxAgeMs;
        }
      }
      if (p.createdAt && typeof p.createdAt === "number") {
        return now - p.createdAt <= maxAgeMs;
      }
      return true;
    });
  };

  const handleSyncAccountVideos = async (acc: CollectorAccount) => {
    setIsSyncingAccount(true);
    const range = acc.syncTimeRange || "7d";
    const maxCnt = acc.syncMaxCount || 20;

    const rangeLabels: Record<string, string> = {
      "3d": "近3天",
      "7d": "近7天",
      "15d": "近15天",
      "30d": "近30天",
      "90d": "近90天",
      all: "全部作品",
    };

    const queryUrl = acc.homeUrl || `https://www.douyin.com/search/${encodeURIComponent(acc.accountName)}`;
    toast.info(`正在嗅探同步【${acc.accountName}】(${queryUrl.slice(0, 32)}...)...`);
    try {
      if (acc.homeUrl && (acc.homeUrl.includes("demo") || acc.homeUrl.includes("_fin"))) {
        toast.warning(
          `【${acc.accountName}】绑定的主页链接为演示虚拟地址（${acc.homeUrl}），在抖音上不存在。\n请点击主页旁的「修改」输入真实的博主主页分享短链！`,
          { duration: 8000 }
        );
        return;
      }

      const res = await invoke<any>("fetch_author_posts", {
        authorUrl: queryUrl,
        platform: acc.platform,
        count: maxCnt,
      });

      if (res && res.error) {
        toast.error(`同步【${acc.accountName}】失败: ${res.error}`, { duration: 8000 });
        setAccounts((prev) =>
          prev.map((a) => (a.id === acc.id ? { ...a, lastSyncAt: Date.now() } : a))
        );
        return;
      }

      const rawPosts: any[] = res && res.posts && Array.isArray(res.posts) ? res.posts : [];

      // 若平台反爬机制或滑块拦截未直接拿到列表，真实告知用户，坚决不注入虚假数据
      if (rawPosts.length === 0) {
        toast.warning(
          `未能直接从【${acc.accountName}】的主页（${queryUrl.slice(0, 30)}...）嗅探到公开作品。\n可能由于平台启用了访客滑块拦截或主页暂无公开视频。建议点击「访问主页」在浏览器中复制作品链接，或点击「粘贴录入作品」直接收录！`,
          { duration: 6000 }
        );
        setAccounts((prev) =>
          prev.map((a) => (a.id === acc.id ? { ...a, lastSyncAt: Date.now() } : a))
        );
        return;
      }

      // 按设定的时间跨度进行过滤
      const filtered = filterPostsByTimeRange(rawPosts, range);

      // 智能作品集组装：
      // 如果所选范围（如近7天）作品少于期望条数(maxCnt)，优先保留该范围内的最新作品，
      // 并自动补充博主近期历史作品填满预期条数（避免博主更新频率较低时出现“选了20篇却只有1篇”的空白感）
      let postsToAdd = filtered;
      let isFilledWithHistory = false;
      if (range === "all" || postsToAdd.length === 0) {
        postsToAdd = rawPosts.slice(0, maxCnt);
      } else if (postsToAdd.length < maxCnt) {
        const remaining = rawPosts.filter((p) => !postsToAdd.some((f) => (f.url && f.url === p.url) || (f.id && f.id === p.id)));
        if (remaining.length > 0) {
          isFilledWithHistory = true;
          postsToAdd = [...postsToAdd, ...remaining].slice(0, maxCnt);
        }
      } else {
        postsToAdd = postsToAdd.slice(0, maxCnt);
      }

      let addedCount = 0;
      setVideos((prev) => {
        const newVideos = [...prev];
        for (const p of postsToAdd) {
          const postShareUrl = p.url || p.shareUrl;
          const exists = newVideos.some(
            (v) => (postShareUrl && v.shareUrl === postShareUrl) || (p.id && (v.id === `post_${p.id}` || v.id === p.id))
          );
          if (!exists) {
            addedCount++;
            newVideos.unshift({
              id: p.id && !p.id.startsWith("post_") ? `post_${p.id}` : (p.id || `post_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
              platform: acc.platform,
              title: p.title || "短视频作品",
              shareUrl: postShareUrl,
              accountId: acc.id,
              coverUrl: p.cover_url || p.coverUrl,
              author: p.author || acc.accountName,
              publishTime: p.publish_time || p.publishTime,
              likeCount: p.like_count || p.likeCount,
              durationSecs: p.duration_secs || p.durationSecs,
              videoStreamUrl: p.video_stream_url || p.videoStreamUrl,
              status: acc.autoDownloadNew ? "queued" : "pending",
              createdAt: Date.now(),
            });
          }
        }
        return newVideos;
      });

      setAccounts((prev) =>
        prev.map((a) => (a.id === acc.id ? { ...a, lastSyncAt: Date.now() } : a))
      );

      const rangeDesc = rangeLabels[range] || range;
      const historyNotice = isFilledWithHistory
        ? `（近${rangeDesc}发布 ${filtered.length} 篇，已补充 ${postsToAdd.length - filtered.length} 篇近期作品）`
        : "";
      toast.success(
        `🎉 成功同步【${acc.accountName}】${postsToAdd.length} 篇真实作品${historyNotice}！${addedCount > 0 ? `新增 ${addedCount} 篇` : "作品列表已是最新"}。`,
        { duration: 5000 }
      );
    } catch (err: any) {
      toast.error(
        `同步【${acc.accountName}】作品失败: ${err?.message || err || "网络或接口异常"}。建议使用「粘贴录入作品」直接批量收录。`
      );
    } finally {
      setIsSyncingAccount(false);
    }
  };

  // =========================================================================
  // 5. 添加多条视频表单处理
  // =========================================================================
  const handleSaveAddVideo = () => {
    if (!videoInputText.trim()) {
      toast.error("请输入至少一条视频链接或文案");
      return;
    }

    const lines = videoInputText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const newItems: CollectedVideo[] = [];
    const now = Date.now();

    lines.forEach((line, idx) => {
      let plat = videoTargetPlatform;
      if (line.includes("tiktok.com")) plat = "tiktok";
      else if (line.includes("douyin.com")) plat = "douyin";
      else if (line.includes("kuaishou.com")) plat = "kuaishou";
      else if (line.includes("xiaohongshu.com") || line.includes("xhslink.com")) plat = "xiaohongshu";
      else if (line.includes("bilibili.com") || line.includes("b23.tv")) plat = "bilibili";
      else if (line.includes("youtube.com") || line.includes("youtu.be")) plat = "youtube";

      let cleanTitle = line.replace(/https?:\/\/[^\s]+/g, "").trim();
      if (!cleanTitle || cleanTitle.length < 2) {
        cleanTitle = `素材_${plat}_${new Date().toLocaleDateString()}_${idx + 1}`;
      } else {
        cleanTitle = cleanTitle.slice(0, 30);
      }

      newItems.push({
        id: `vid_${now}_${idx}`,
        platform: plat,
        title: cleanTitle,
        shareUrl: line,
        albumId: videoTargetAlbum || undefined,
        accountId: videoTargetAccount || undefined,
        status: autoDownloadImmediately ? "queued" : "pending",
        createdAt: now,
      });
    });

    setVideos((prev) => [...newItems, ...prev]);
    setShowAddVideoModal(false);
    setVideoInputText("");
    toast.success(`成功录入 ${newItems.length} 条视频素材！`);
  };

  // 添加新专辑
  const handleSaveAddAlbum = () => {
    if (!newAlbumName.trim()) {
      toast.error("请输入专辑名称");
      return;
    }
    const newAlb: CollectorAlbum = {
      id: `alb_${Date.now()}`,
      name: newAlbumName.trim(),
      platform: newAlbumPlatform,
      description: newAlbumDesc.trim(),
      color: newAlbumColor,
      createdAt: Date.now(),
    };
    setAlbums((prev) => [newAlb, ...prev]);
    setShowAddAlbumModal(false);
    setNewAlbumName("");
    setNewAlbumDesc("");
    toast.success(`成功创建专辑【${newAlb.name}】！`);
  };

  // 添加新博主
  const handleSaveAddAccount = () => {
    if (!newAccountName.trim()) {
      toast.error("请输入博主昵称");
      return;
    }
    const newAcc: CollectorAccount = {
      id: `acc_${Date.now()}`,
      platform: newAccountPlatform,
      accountName: newAccountName.trim(),
      homeUrl: newAccountUrl.trim(),
      note: newAccountNote.trim(),
      syncSchedule: newAccountSchedule,
      syncTimeRange: newAccountSyncTimeRange,
      syncMaxCount: newAccountSyncMaxCount,
      autoDownloadNew: newAccountAutoDownload,
      lastSyncAt: Date.now(),
      createdAt: Date.now(),
    };
    setAccounts((prev) => [newAcc, ...prev]);
    setShowAddAccountModal(false);
    setNewAccountName("");
    setNewAccountUrl("");
    setNewAccountNote("");
    toast.success(`成功录入博主【${newAcc.accountName}】！`);

    // 默认打开该博主页面
    setSelectedAccountId(newAcc.id);
    setActiveSubView("accounts");

    // 若勾选了添加后立即抓取作品
    if (autoFetchPostsAfterAdd) {
      setTimeout(() => {
        handleSyncAccountVideos(newAcc);
      }, 300);
    }
  };

  // 保存监控策略修改
  const handleSaveScheduleEdit = () => {
    if (!editingAccount) return;
    setAccounts((prev) =>
      prev.map((a) => (a.id === editingAccount.id ? editingAccount : a))
    );
    setShowScheduleModal(false);
    toast.success(`已更新【${editingAccount.accountName}】的定时监控策略！`);
  };

  // 过滤后的集合
  const filteredAccounts = accounts.filter((a) => {
    const matchPlat = selectedPlatform === "all" || a.platform === selectedPlatform;
    const matchSearch =
      !searchQuery ||
      a.accountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.note && a.note.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchPlat && matchSearch;
  });

  const filteredAlbums = albums.filter((a) => {
    const matchPlat = selectedPlatform === "all" || a.platform === "all" || a.platform === selectedPlatform;
    const matchSearch =
      !searchQuery ||
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.description && a.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchPlat && matchSearch;
  });

  const filteredVideos = videos.filter((v) => {
    const matchPlat = selectedPlatform === "all" || v.platform === selectedPlatform;
    const matchSearch =
      !searchQuery ||
      v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.author && v.author.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchPlat && matchSearch;
  });

  const downloadedVideos = filteredVideos.filter((v) => v.status === "downloaded");

  // 多选切换
  const handleToggleSelectVideo = (id: string) => {
    setSelectedVideoIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* ========================================================================= */}
      {/* 顶栏 Banner 与后台下载进度条 */}
      {/* ========================================================================= */}
      <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent p-5 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <LuFolderPlus className="size-4" />
              </span>
              <h3 className="text-base font-bold text-foreground">矩阵全自动材料收集中心</h3>
              <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/40 bg-emerald-500/10">
                多平台无水印原画
              </Badge>
              {queuedVideos.length > 0 && (
                <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] flex items-center gap-1 animate-pulse">
                  <LuRefreshCw className="size-2.5 animate-spin" />
                  后台下载队列: {queuedVideos.length} 篇排队中
                </Badge>
              )}
              {isBatchExtracting && (
                <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-[10px] flex items-center gap-1 animate-pulse">
                  <LuRefreshCw className="size-2.5 animate-spin" />
                  批量提取中: {batchProgress.current} / {batchProgress.total}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              支持按对标博主账号收集、自定义专辑分类，提供多平台无水印原画一键提取、在线试看、实时下载与定时后台任务自动抓取。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setVideoTargetAccount(selectedAccountId || "");
                setVideoTargetAlbum(selectedAlbumId || "");
                setShowAddVideoModal(true);
              }}
              className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs"
            >
              <LuPlus className="size-3.5" />
              添加视频素材
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowAddAlbumModal(true)}
              className="h-8 gap-1.5 text-xs border-border"
            >
              <LuLayers className="size-3.5 text-amber-500" />
              新建专辑
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowAddAccountModal(true)}
              className="h-8 gap-1.5 text-xs border-border"
            >
              <LuUserPlus className="size-3.5 text-violet-500" />
              添加对标博主
            </Button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 顶层平台快速筛选 Chips */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center gap-2">
        {COLLECTOR_PLATFORMS.map((p) => {
          const isSelected = selectedPlatform === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPlatform(p.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                isSelected
                  ? "bg-foreground text-background shadow-xs font-semibold scale-102"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span>{p.icon}</span>
              <span>{p.name}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 二级导航栏与搜索条 */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setActiveSubView("accounts");
              setSelectedAccountId(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md transition-all ${
              activeSubView === "accounts"
                ? "bg-card text-foreground font-semibold shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LuUsers className="size-3.5 text-violet-500" />
            对标博主账号 ({accounts.length})
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSubView("albums");
              setSelectedAlbumId(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md transition-all ${
              activeSubView === "albums"
                ? "bg-card text-foreground font-semibold shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LuLayers className="size-3.5 text-amber-500" />
            自定义专辑 ({albums.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveSubView("library")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md transition-all ${
              activeSubView === "library"
                ? "bg-card text-foreground font-semibold shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LuCheck className="size-3.5 text-emerald-500" />
            已下载素材库 ({downloadedVideos.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveSubView("list")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md transition-all ${
              activeSubView === "list"
                ? "bg-card text-foreground font-semibold shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LuFileVideo className="size-3.5 text-sky-500" />
            全部材料清单 ({filteredVideos.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {(selectedAccountId || selectedAlbumId) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedAccountId(null);
                setSelectedAlbumId(null);
              }}
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
            >
              返回全部
            </Button>
          )}

          <div className="relative w-48 sm:w-64">
            <LuSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="搜索标题、作者或专辑..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 视图内容切换区 */}
      {/* ========================================================================= */}
      <div>
        {/* ========================================================================= */}
        {/* 视图 1: 对标博主库展示 */}
        {/* ========================================================================= */}
        {activeSubView === "accounts" && (
          <div className="space-y-4">
            {selectedAccountId ? (
              // 博主详情主页
              (() => {
                const acc = accounts.find((a) => a.id === selectedAccountId);
                const accVideos = videos.filter((v) => v.accountId === selectedAccountId);
                const downloadedCount = accVideos.filter((v) => v.status === "downloaded").length;

                return (
                  <div className="space-y-4">
                    {/* 博主顶栏信息卡片 */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border border-violet-500/30 bg-violet-500/5 gap-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <div className="flex size-8 items-center justify-center rounded-full bg-violet-600 text-white text-sm font-bold shadow-xs">
                            {acc?.accountName.slice(0, 1) || "博"}
                          </div>
                          <h4 className="text-base font-bold text-foreground">{acc?.accountName}</h4>
                          <Badge variant="outline" className="text-[10px] uppercase font-mono">
                            {acc?.platform}
                          </Badge>
                          {acc?.syncSchedule !== "none" ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAccount(acc || null);
                                setShowScheduleModal(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 hover:bg-violet-500/25 text-violet-700 dark:text-violet-300 border border-violet-500/30 text-[10px] px-2 py-0.5 font-medium transition-colors cursor-pointer"
                              title="点击查看/修改监控配置"
                            >
                              <LuClock className="size-3 text-violet-500" />
                              定时监控: 每 {acc?.syncSchedule}
                              <LuSettings className="size-2.5 ml-0.5 opacity-70" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAccount(acc || null);
                                setShowScheduleModal(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground border border-border text-[10px] px-2 py-0.5 hover:text-foreground cursor-pointer"
                            >
                              手动监控 (点击配置定时)
                            </button>
                          )}
                          {acc?.autoDownloadNew && (
                            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px] px-1.5 py-0">
                              自动后台下载新视频
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2.5 text-xs text-muted-foreground flex-wrap">
                          <span>{acc?.note || "暂无对标赛道备注"}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1 font-mono text-[11px] bg-muted/60 px-2 py-0.5 rounded border border-border/60">
                            <span className="text-muted-foreground font-sans">主页:</span>
                            <span className="max-w-[200px] truncate text-foreground font-semibold" title={acc?.homeUrl}>
                              {acc?.homeUrl || "未绑定链接"}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (!acc) return;
                                const newUrl = window.prompt("请输入博主主页链接或短链 (如 https://v.douyin.com/...):", acc.homeUrl || "");
                                if (newUrl !== null && newUrl.trim()) {
                                  setAccounts((prev) =>
                                    prev.map((a) => (a.id === acc.id ? { ...a, homeUrl: newUrl.trim() } : a))
                                  );
                                  toast.success("已更新主页链接！点击「同步博主最新作品」开始嗅探。");
                                }
                              }}
                              className="text-violet-600 hover:text-violet-700 ml-1 font-sans underline"
                            >
                              修改
                            </button>
                          </span>
                          <span>·</span>
                          <span>作品总收录: <strong className="text-foreground">{accVideos.length}</strong> 篇</span>
                          <span>·</span>
                          <span>原画就绪: <strong className="text-emerald-600">{downloadedCount}</strong> 篇</span>
                          {acc?.lastSyncAt && (
                            <>
                              <span>·</span>
                              <span className="text-[11px] font-mono">
                                上次更新: {new Date(acc.lastSyncAt).toLocaleTimeString().slice(0, 5)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 博主专属操作按钮组 */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* 抓取范围与条数快捷设置 */}
                        {acc && (
                          <div className="flex items-center gap-1.5 bg-background border border-border/80 rounded-md px-2 h-8 text-xs shadow-2xs">
                            <span className="text-muted-foreground text-[11px] select-none font-medium">范围:</span>
                            <select
                              value={acc.syncTimeRange || "all"}
                              onChange={(e) => {
                                const val = e.target.value as any;
                                setAccounts((prev) =>
                                  prev.map((a) => (a.id === acc.id ? { ...a, syncTimeRange: val } : a))
                                );
                              }}
                              className="bg-transparent text-foreground text-xs font-medium cursor-pointer focus:outline-none"
                              title="设置抓取视频的发布时间跨度"
                            >
                              <option value="all">全部最新作品 (推荐)</option>
                              <option value="7d">近 7 天</option>
                              <option value="15d">近 15 天</option>
                              <option value="30d">近 30 天</option>
                              <option value="90d">近 90 天</option>
                              <option value="3d">近 3 天</option>
                            </select>

                            <span className="text-border/60">|</span>

                            <span className="text-muted-foreground text-[11px] select-none font-medium">最多:</span>
                            <select
                              value={acc.syncMaxCount || 20}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setAccounts((prev) =>
                                  prev.map((a) => (a.id === acc.id ? { ...a, syncMaxCount: val } : a))
                                );
                              }}
                              className="bg-transparent text-foreground text-xs font-medium cursor-pointer focus:outline-none"
                              title="单次最大抓取作品条数"
                            >
                              <option value={10}>10 篇</option>
                              <option value={20}>20 篇</option>
                              <option value={50}>50 篇</option>
                              <option value={100}>100 篇</option>
                            </select>
                          </div>
                        )}

                        {/* 自动同步/嗅探博主作品 */}
                        <Button
                          type="button"
                          size="sm"
                          disabled={isSyncingAccount}
                          onClick={() => acc && handleSyncAccountVideos(acc)}
                          className="h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white shadow-2xs font-medium"
                          title="根据所选时间范围和条数同步最新作品"
                        >
                          <LuRefreshCw className={`size-3.5 ${isSyncingAccount ? "animate-spin" : ""}`} />
                          {isSyncingAccount ? "抓取作品中..." : "同步博主最新作品"}
                        </Button>

                        {/* 打开博主主页 */}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenUrl(acc?.homeUrl, acc?.platform, acc?.accountName)}
                          className="h-8 text-xs gap-1.5 border-border"
                          title="在系统默认浏览器中直接打开博主主页"
                        >
                          <LuExternalLink className="size-3.5" />
                          访问主页
                        </Button>

                        {/* 手动添加作品 */}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setVideoTargetAccount(acc?.id || "");
                            setShowAddVideoModal(true);
                          }}
                          className="h-8 text-xs gap-1.5 border-border"
                        >
                          <LuPlus className="size-3.5" />
                          粘贴录入作品
                        </Button>

                        {/* 监控设置 */}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingAccount(acc || null);
                            setShowScheduleModal(true);
                          }}
                          className="size-8 p-0 text-muted-foreground hover:text-foreground"
                          title="配置定时监控策略"
                        >
                          <LuSettings className="size-4" />
                        </Button>

                        {/* 移除该博主 */}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (window.confirm(`确定要移除博主【${acc?.accountName}】吗？`)) {
                              setAccounts((prev) => prev.filter((a) => a.id !== acc?.id));
                              setVideos((prev) => prev.filter((v) => v.accountId !== acc?.id));
                              setSelectedAccountId(null);
                              toast.success(`已移除博主【${acc?.accountName}】`);
                            }
                          }}
                          className="size-8 p-0 text-muted-foreground hover:text-destructive"
                          title="移除该博主及未下载作品"
                        >
                          <LuTrash2 className="size-4" />
                        </Button>

                        {accVideos.some((v) => v.status !== "downloaded") && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleBatchQueue(accVideos)}
                            className="h-8 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
                            title="将该博主未下载的视频全部加入后台静默下载"
                          >
                            <LuDownload className="size-3.5" />
                            全量加入后台下载
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* 博主作品列表区 */}
                    {accVideos.length === 0 ? (
                      // 空状态引导卡片 (真实透明引导)
                      <div className="rounded-xl border-2 border-dashed border-border/80 bg-muted/10 p-10 flex flex-col items-center justify-center text-center space-y-4">
                        <div className="flex size-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600">
                          <LuVideo className="size-7" />
                        </div>
                        <div className="space-y-1.5 max-w-lg">
                          <h4 className="text-sm font-bold text-foreground">
                            暂未获取到【{acc?.accountName}】的短视频作品
                          </h4>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            短视频平台（如抖音、TikTok PC端）对未登录访客设有严格的风控与滑块拦截。若自动嗅探未抓取到作品，推荐点击下方「访问博主主页」打开浏览器，复制博主的视频分享链接，再点击「粘贴录入作品」批量添加收录！
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={isSyncingAccount}
                            onClick={() => acc && handleSyncAccountVideos(acc)}
                            className="h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white font-medium shadow-2xs"
                          >
                            <LuRefreshCw className={`size-3.5 ${isSyncingAccount ? "animate-spin" : ""}`} />
                            {isSyncingAccount ? "嗅探抓取中..." : "重新嗅探同步"}
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenUrl(acc?.homeUrl, acc?.platform, acc?.accountName)}
                            className="h-8 text-xs gap-1.5 border-border hover:bg-muted"
                          >
                            <LuExternalLink className="size-3.5" />
                            访问博主主页
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="default"
                            onClick={() => {
                              setVideoTargetAccount(acc?.id || "");
                              setShowAddVideoModal(true);
                            }}
                            className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground font-medium shadow-2xs"
                          >
                            <LuPlus className="size-3.5" />
                            粘贴录入作品
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <VideoCardsGrid
                        items={accVideos}
                        selectedIds={selectedVideoIds}
                        onToggleSelect={handleToggleSelectVideo}
                        onExtractSingle={handleExtractSingle}
                        onQueueSingle={handleQueueSingle}
                        onPreview={(v) => setPreviewVideo(v)}
                        onSendToDedup={onSendToDedup}
                        onSendToMatrix={onSendToMatrix}
                        onOpenPath={handleOpenPath}
                        onDelete={(id) => setVideos((prev) => prev.filter((v) => v.id !== id))}
                      />
                    )}
                  </div>
                );
              })()
            ) : (
              // 博主列表卡片
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAccounts.map((acc) => {
                  const accVideos = videos.filter((v) => v.accountId === acc.id);
                  const downloadedCount = accVideos.filter((v) => v.status === "downloaded").length;

                  return (
                    <div
                      key={acc.id}
                      onClick={() => setSelectedAccountId(acc.id)}
                      className="group cursor-pointer rounded-xl border border-border bg-card p-5 space-y-3 transition-all hover:border-violet-500/50 hover:shadow-sm hover:bg-card/90"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-9 items-center justify-center rounded-full bg-violet-500/20 text-violet-600 font-bold text-sm">
                            {acc.accountName.slice(0, 1)}
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-foreground group-hover:text-violet-600 transition-colors truncate max-w-[150px]">
                              {acc.accountName}
                            </h4>
                            <span className="text-[10px] text-muted-foreground uppercase">{acc.platform}</span>
                          </div>
                        </div>

                        {acc.syncSchedule !== "none" ? (
                          <Badge className="bg-violet-500/15 text-violet-600 border-violet-500/30 text-[10px] px-1.5 py-0 flex items-center gap-1">
                            <LuClock className="size-2.5" />
                            每{acc.syncSchedule}自动监控
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            手动监控
                          </Badge>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {acc.note || "暂无对标赛道备注，点击进入查看已收录作品及在线试看。"}
                      </p>

                      <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                        <span className="text-muted-foreground text-[11px]">
                          作品收录: <strong className="text-foreground">{accVideos.length}</strong> · 已就绪:{" "}
                          <strong className="text-emerald-600 dark:text-emerald-400">{downloadedCount}</strong>
                        </span>

                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenUrl(acc.homeUrl, acc.platform, acc.accountName);
                            }}
                            className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted"
                            title="在系统浏览器中直接打开博主主页"
                          >
                            <LuExternalLink className="size-3 mr-0.5" />
                            主页
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSyncAccountVideos(acc);
                            }}
                            className="h-6 px-2 text-[11px] text-violet-600 hover:bg-violet-500/10"
                          >
                            同步作品
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAccounts((prev) => prev.filter((a) => a.id !== acc.id));
                              toast.info(`已移除博主【${acc.accountName}】`);
                            }}
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-500"
                            title="删除博主"
                          >
                            <LuTrash2 className="size-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* 添加对标博主卡片 */}
                <div
                  onClick={() => setShowAddAccountModal(true)}
                  className="cursor-pointer rounded-xl border-2 border-dashed border-border/80 bg-muted/10 p-5 flex flex-col items-center justify-center text-center space-y-2 hover:border-violet-500 hover:bg-violet-500/5 transition-all select-none min-h-[140px]"
                >
                  <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
                    <LuUserPlus className="size-5" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">添加对标创作者/博主</span>
                  <p className="text-[11px] text-muted-foreground">录入主页链接，支持自动抓取与定时监控新作品</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 视图 2: 自定义主题专辑展示 */}
        {/* ========================================================================= */}
        {activeSubView === "albums" && (
          <div className="space-y-4">
            {selectedAlbumId ? (
              // 专辑详情页
              (() => {
                const alb = albums.find((a) => a.id === selectedAlbumId);
                const albumVideos = videos.filter((v) => v.albumId === selectedAlbumId);
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-bold text-foreground">{alb?.name}</h4>
                          <Badge variant="outline" className="text-[10px]">
                            {alb?.platform === "all" ? "全平台通用" : alb?.platform}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{alb?.description || "暂无专辑说明"}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            setVideoTargetAlbum(alb?.id || "");
                            setShowAddVideoModal(true);
                          }}
                          className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground"
                        >
                          <LuPlus className="size-3.5" />
                          添加视频到此专辑
                        </Button>
                        {albumVideos.some((v) => v.status !== "downloaded") && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleBatchQueue(albumVideos)}
                            className="h-8 text-xs gap-1.5 bg-amber-500 text-white hover:bg-amber-600"
                          >
                            <LuDownload className="size-3.5" />
                            全量加入后台下载
                          </Button>
                        )}
                      </div>
                    </div>

                    <VideoCardsGrid
                      items={albumVideos}
                      selectedIds={selectedVideoIds}
                      onToggleSelect={handleToggleSelectVideo}
                      onExtractSingle={handleExtractSingle}
                      onQueueSingle={handleQueueSingle}
                      onPreview={(v) => setPreviewVideo(v)}
                      onSendToDedup={onSendToDedup}
                      onSendToMatrix={onSendToMatrix}
                      onOpenPath={handleOpenPath}
                      onDelete={(id) => setVideos((prev) => prev.filter((v) => v.id !== id))}
                    />
                  </div>
                );
              })()
            ) : (
              // 专辑网格
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAlbums.map((alb) => {
                  const albVideos = videos.filter((v) => v.albumId === alb.id);
                  const downloadedCount = albVideos.filter((v) => v.status === "downloaded").length;

                  return (
                    <div
                      key={alb.id}
                      onClick={() => setSelectedAlbumId(alb.id)}
                      className="group cursor-pointer rounded-xl border border-border bg-card p-5 space-y-3 transition-all hover:border-amber-500/50 hover:shadow-sm hover:bg-card/90"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
                            <LuLayers className="size-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-foreground group-hover:text-amber-500 transition-colors">
                              {alb.name}
                            </h4>
                            <span className="text-[10px] text-muted-foreground uppercase">{alb.platform}</span>
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {alb.description || "收集优质爆款视频，支持批量无水印提取与定时抓取。"}
                      </p>

                      <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                        <span className="text-muted-foreground text-[11px]">
                          已收录: <strong className="text-foreground">{albVideos.length}</strong> 篇 · 已就绪:{" "}
                          <strong className="text-emerald-600 dark:text-emerald-400">{downloadedCount}</strong>
                        </span>

                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAlbums((prev) => prev.filter((a) => a.id !== alb.id));
                              toast.info(`已移除专辑【${alb.name}】`);
                            }}
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-500"
                            title="删除专辑"
                          >
                            <LuTrash2 className="size-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* 创建专辑卡片 */}
                <div
                  onClick={() => setShowAddAlbumModal(true)}
                  className="cursor-pointer rounded-xl border-2 border-dashed border-border/80 bg-muted/10 p-5 flex flex-col items-center justify-center text-center space-y-2 hover:border-amber-500 hover:bg-amber-500/5 transition-all select-none min-h-[140px]"
                >
                  <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                    <LuPlus className="size-5" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">新建主题收集专辑</span>
                  <p className="text-[11px] text-muted-foreground">根据类目、风格、爆款赛道归纳视频</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 视图 3: 已下载素材库展示 (统一管理) */}
        {/* ========================================================================= */}
        {activeSubView === "library" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/60">
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                  原画已就绪 ({downloadedVideos.length})
                </Badge>
                <span className="text-xs text-muted-foreground">
                  总存储占用:{" "}
                  <strong>
                    {downloadedVideos.reduce((acc, v) => acc + (v.sizeMb || 0), 0).toFixed(1)} MB
                  </strong>
                </span>
              </div>

              <div className="text-xs text-muted-foreground">
                提示：点击素材可直接秒开流式试看，一键推入去重或矩阵发布
              </div>
            </div>

            <VideoCardsGrid
              items={downloadedVideos}
              selectedIds={selectedVideoIds}
              onToggleSelect={handleToggleSelectVideo}
              onExtractSingle={handleExtractSingle}
              onQueueSingle={handleQueueSingle}
              onPreview={(v) => setPreviewVideo(v)}
              onSendToDedup={onSendToDedup}
              onSendToMatrix={onSendToMatrix}
              onOpenPath={handleOpenPath}
              onDelete={(id) => setVideos((prev) => prev.filter((v) => v.id !== id))}
            />
          </div>
        )}

        {/* ========================================================================= */}
        {/* 视图 4: 全部材料清单列表 */}
        {/* ========================================================================= */}
        {activeSubView === "list" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                共找到 <strong className="text-foreground">{filteredVideos.length}</strong> 条收集素材
              </span>

              {filteredVideos.some((v) => v.status !== "downloaded") && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleBatchQueue(filteredVideos)}
                    className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground shadow-2xs"
                  >
                    <LuDownload className="size-3.5" />
                    未下载项一键入列后台提取
                  </Button>
                </div>
              )}
            </div>

            <VideoCardsGrid
              items={filteredVideos}
              selectedIds={selectedVideoIds}
              onToggleSelect={handleToggleSelectVideo}
              onExtractSingle={handleExtractSingle}
              onQueueSingle={handleQueueSingle}
              onPreview={(v) => setPreviewVideo(v)}
              onSendToDedup={onSendToDedup}
              onSendToMatrix={onSendToMatrix}
              onOpenPath={handleOpenPath}
              onDelete={(id) => setVideos((prev) => prev.filter((v) => v.id !== id))}
            />
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 底部浮动批量操作条 (当勾选了任意视频卡片时出现) */}
      {/* ========================================================================= */}
      {selectedVideoIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur-md px-5 py-3 shadow-xl">
          <span className="text-xs font-semibold text-foreground">
            已选择 <strong className="text-primary">{selectedVideoIds.length}</strong> 项素材
          </span>

          <div className="h-4 w-px bg-border" />

          <Button
            type="button"
            size="sm"
            onClick={() => {
              const targets = videos.filter((v) => selectedVideoIds.includes(v.id));
              handleBatchExtract(targets);
            }}
            disabled={isBatchExtracting}
            className="h-8 text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-medium"
          >
            <LuDownload className="size-3.5" />
            ⚡ 批量立即下载
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const targets = videos.filter((v) => selectedVideoIds.includes(v.id));
              handleBatchQueue(targets);
              setSelectedVideoIds([]);
            }}
            className="h-8 text-xs gap-1.5 text-primary border-primary/40 hover:bg-primary/10"
          >
            <LuClock className="size-3.5" />
            📥 批量加入后台下载
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setSelectedVideoIds([])}
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            取消选择
          </Button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 弹窗 1: 添加视频素材 (多行粘贴录入) */}
      {/* ========================================================================= */}
      <Dialog open={showAddVideoModal} onOpenChange={setShowAddVideoModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <LuPlus className="size-4 text-primary" />
              添加视频素材 (支持多行批量粘贴)
            </DialogTitle>
            <DialogDescription className="text-xs">
              粘贴抖音、TikTok、快手、小红书、B站、YouTube 短视频分享文案或链接，系统自动识别平台。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">视频链接 / 分享文案 (每行一条)</Label>
              <textarea
                rows={5}
                value={videoInputText}
                onChange={(e) => setVideoInputText(e.target.value)}
                placeholder="例如粘贴：&#10;7.12 复制打开抖音，看看【小A学财经的作品】 https://v.douyin.com/xxx/&#10;https://www.tiktok.com/@user/video/123456789"
                className="w-full rounded-md border border-input bg-background p-2.5 text-xs font-mono shadow-2xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">归属专辑 (可选)</Label>
                <select
                  value={videoTargetAlbum}
                  onChange={(e) => setVideoTargetAlbum(e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">未分类专辑</option>
                  {albums.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">归属博主 (可选)</Label>
                <select
                  value={videoTargetAccount}
                  onChange={(e) => setVideoTargetAccount(e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">无指定博主</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.accountName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none text-xs">
              <input
                type="checkbox"
                checked={autoDownloadImmediately}
                onChange={(e) => setAutoDownloadImmediately(e.target.checked)}
                className="rounded border-border accent-primary"
              />
              <span className="font-medium text-foreground">添加后立即加入后台下载队列 (自动静默下载原画)</span>
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAddVideoModal(false)}>
              取消
            </Button>
            <Button type="button" size="sm" onClick={handleSaveAddVideo}>
              确认录入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 弹窗 2: 新建专辑 */}
      {/* ========================================================================= */}
      <Dialog open={showAddAlbumModal} onOpenChange={setShowAddAlbumModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <LuFolderPlus className="size-4 text-amber-500" />
              创建新主题收集专辑
            </DialogTitle>
            <DialogDescription className="text-xs">
              通过专辑对不同赛道、产品线或风格的爆款视频进行归集。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">专辑名称</Label>
              <Input
                placeholder="例如：3C数码出海爆款集"
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">目标平台适用</Label>
              <select
                value={newAlbumPlatform}
                onChange={(e) => setNewAlbumPlatform(e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="all">全平台通用</option>
                <option value="douyin">抖音</option>
                <option value="tiktok">TikTok</option>
                <option value="kuaishou">快手</option>
                <option value="xiaohongshu">小红书</option>
                <option value="weixin">微信视频号</option>
                <option value="bilibili">哔哩哔哩</option>
                <option value="youtube">YouTube</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">专辑描述 / 运营意图</Label>
              <Input
                placeholder="例如：准备二创用于美区带货账号分发"
                value={newAlbumDesc}
                onChange={(e) => setNewAlbumDesc(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAddAlbumModal(false)}>
              取消
            </Button>
            <Button type="button" size="sm" onClick={handleSaveAddAlbum} className="bg-amber-500 hover:bg-amber-600 text-white">
              创建专辑
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 弹窗 3: 添加对标博主账号 */}
      {/* ========================================================================= */}
      <Dialog open={showAddAccountModal} onOpenChange={setShowAddAccountModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <LuUserPlus className="size-4 text-violet-500" />
              添加对标创作者/博主账号
            </DialogTitle>
            <DialogDescription className="text-xs">
              录入博主主页，支持自动抓取近期作品，并开启后台定时增量监控。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">所在平台</Label>
                <select
                  value={newAccountPlatform}
                  onChange={(e) => setNewAccountPlatform(e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="douyin">抖音</option>
                  <option value="tiktok">TikTok</option>
                  <option value="kuaishou">快手</option>
                  <option value="xiaohongshu">小红书</option>
                  <option value="weixin">微信视频号</option>
                  <option value="bilibili">哔哩哔哩</option>
                  <option value="youtube">YouTube</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">博主昵称</Label>
                <Input
                  placeholder="例如：小A学财经"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">博主主页链接</Label>
              <Input
                placeholder="https://www.douyin.com/user/... 或 TikTok 主页链接"
                value={newAccountUrl}
                onChange={(e) => setNewAccountUrl(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">定时自动监控周期</Label>
              <select
                value={newAccountSchedule}
                onChange={(e) => setNewAccountSchedule(e.target.value as any)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="none">不开启定时自动监控 (仅手动触发)</option>
                <option value="1h">每 1 小时自动检查新作品</option>
                <option value="6h">每 6 小时自动检查新作品 (推荐)</option>
                <option value="12h">每 12 小时检查一次</option>
                <option value="24h">每天定时检查一次</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">作品同步时间跨度</Label>
                <select
                  value={newAccountSyncTimeRange}
                  onChange={(e) => setNewAccountSyncTimeRange(e.target.value as any)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="all">全部最新作品 (推荐)</option>
                  <option value="7d">近 7 天发布作品</option>
                  <option value="15d">近 15 天发布作品</option>
                  <option value="30d">近 30 天发布作品</option>
                  <option value="90d">近 90 天发布作品</option>
                  <option value="3d">近 3 天发布作品</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">单次最大获取条数</Label>
                <select
                  value={newAccountSyncMaxCount}
                  onChange={(e) => setNewAccountSyncMaxCount(Number(e.target.value))}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value={10}>最多 10 篇</option>
                  <option value={20}>最多 20 篇 (标准)</option>
                  <option value={50}>最多 50 篇 (深度)</option>
                  <option value={100}>最多 100 篇 (批量)</option>
                </select>
              </div>
            </div>

            <div className="space-y-2 pt-1 border-t border-border/60">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs">
                <input
                  type="checkbox"
                  checked={autoFetchPostsAfterAdd}
                  onChange={(e) => setAutoFetchPostsAfterAdd(e.target.checked)}
                  className="rounded border-border accent-violet-600"
                />
                <span className="font-semibold text-foreground">录入后立即抓取博主作品列表</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none text-xs">
                <input
                  type="checkbox"
                  checked={newAccountAutoDownload}
                  onChange={(e) => setNewAccountAutoDownload(e.target.checked)}
                  className="rounded border-border accent-violet-600"
                />
                <span className="text-muted-foreground">监控发现新视频时，自动推入后台静默下载原画</span>
              </label>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">对标说明 / 赛道标签</Label>
              <Input
                placeholder="例如：财经口播爆款达人，完播率极高"
                value={newAccountNote}
                onChange={(e) => setNewAccountNote(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAddAccountModal(false)}>
              取消
            </Button>
            <Button type="button" size="sm" onClick={handleSaveAddAccount} className="bg-violet-600 hover:bg-violet-700 text-white">
              录入并开启监控
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 弹窗 4: 定时监控任务说明与策略配置 (解答用户问题 1) */}
      {/* ========================================================================= */}
      {editingAccount && (
        <Dialog open={showScheduleModal} onOpenChange={setShowScheduleModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <LuClock className="size-4 text-violet-500" />
                定时监控自动化配置 · 【{editingAccount.accountName}】
              </DialogTitle>
              <DialogDescription className="text-xs">
                详细定义后台定时监控的行为模式与新视频处理流水线。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              {/* 功能机制解释卡片 */}
              <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-3 space-y-2">
                <h5 className="font-bold text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                  <LuSparkles className="size-3.5" />
                  定时监控会做哪些事情？
                </h5>
                <ul className="space-y-1 text-muted-foreground list-disc list-inside leading-relaxed">
                  <li>
                    <strong>自动周期巡检</strong>：按设定频率（如每 6h）在后台静默访问博主主页；
                  </li>
                  <li>
                    <strong>增量感知新作品</strong>：自动识别博主新发布的视频，过滤已收录历史；
                  </li>
                  <li>
                    <strong>作品流自动入库</strong>：将新视频标题、封面、发布时间更新到博主名下；
                  </li>
                  <li>
                    <strong>智能策略执行</strong>：根据下方勾选项，自动加入后台静默下载或保留未下载供您手动在线试看。
                  </li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">博主主页链接 (Web端长链接或App分享短链)</Label>
                <Input
                  value={editingAccount.homeUrl || ""}
                  onChange={(e) =>
                    setEditingAccount({ ...editingAccount, homeUrl: e.target.value })
                  }
                  placeholder="如 https://www.douyin.com/user/... 或 https://v.douyin.com/..."
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">监控频率</Label>
                <select
                  value={editingAccount.syncSchedule}
                  onChange={(e) =>
                    setEditingAccount({ ...editingAccount, syncSchedule: e.target.value as any })
                  }
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="none">关闭定时监控 (仅支持手动同步)</option>
                  <option value="1h">每 1 小时巡检一次</option>
                  <option value="6h">每 6 小时巡检一次 (推荐)</option>
                  <option value="12h">每 12 小时巡检一次</option>
                  <option value="24h">每天定时巡检一次</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">作品同步时间跨度</Label>
                  <select
                    value={editingAccount.syncTimeRange || "all"}
                    onChange={(e) =>
                      setEditingAccount({ ...editingAccount, syncTimeRange: e.target.value as any })
                    }
                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="all">全部最新作品 (推荐)</option>
                    <option value="7d">近 7 天发布作品</option>
                    <option value="15d">近 15 天发布作品</option>
                    <option value="30d">近 30 天发布作品</option>
                    <option value="90d">近 90 天发布作品</option>
                    <option value="3d">近 3 天发布作品</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">单次最大获取条数</Label>
                  <select
                    value={editingAccount.syncMaxCount || 20}
                    onChange={(e) =>
                      setEditingAccount({ ...editingAccount, syncMaxCount: Number(e.target.value) })
                    }
                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value={10}>最多 10 篇</option>
                    <option value={20}>最多 20 篇 (标准)</option>
                    <option value={50}>最多 50 篇 (深度)</option>
                    <option value={100}>最多 100 篇 (批量)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 pt-1 border-t border-border/60">
                <Label className="text-xs">发现新发布作品时的处理方式</Label>
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editingAccount.autoDownloadNew || false}
                    onChange={(e) =>
                      setEditingAccount({ ...editingAccount, autoDownloadNew: e.target.checked })
                    }
                    className="rounded border-border accent-violet-600 mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <span className="font-medium text-foreground block">自动推入后台任务队列下载原画</span>
                    <span className="text-[11px] text-muted-foreground block">
                      新视频发布后，系统后台静默提取无水印原画并存入本地素材库，无需人工点击。
                    </span>
                  </div>
                </label>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">对标说明 / 备忘</Label>
                <Input
                  value={editingAccount.note || ""}
                  onChange={(e) => setEditingAccount({ ...editingAccount, note: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowScheduleModal(false);
                  handleSyncAccountVideos(editingAccount);
                }}
                className="text-xs text-violet-600 hover:bg-violet-500/10"
              >
                立即执行一次检查
              </Button>

              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowScheduleModal(false)}>
                  取消
                </Button>
                <Button type="button" size="sm" onClick={handleSaveScheduleEdit} className="bg-violet-600 hover:bg-violet-700 text-white">
                  保存策略
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* 弹窗 5: 视频在线观看 / 流式播放试看器 */}
      {/* ========================================================================= */}
      {previewVideo && (
        <Dialog open={!!previewVideo} onOpenChange={(open) => !open && setPreviewVideo(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2 text-sm font-semibold truncate max-w-lg">
                  <LuPlay className="size-4 text-emerald-500" />
                  {previewVideo.title}
                </DialogTitle>
                <Badge
                  variant="outline"
                  className={`text-[10px] uppercase font-mono ${
                    previewVideo.status === "downloaded"
                      ? "text-emerald-600 border-emerald-500/40 bg-emerald-500/10"
                      : previewVideo.status === "queued"
                      ? "text-primary border-primary/40 bg-primary/10"
                      : "text-amber-600 border-amber-500/40 bg-amber-500/10"
                  }`}
                >
                  {previewVideo.status === "downloaded"
                    ? "本地原画流"
                    : previewVideo.status === "queued"
                    ? "排队下载中"
                    : "在线预览源"}
                </Badge>
              </div>
              <DialogDescription className="text-xs font-mono truncate">
                {previewVideo.localPath || previewVideo.shareUrl}
              </DialogDescription>
            </DialogHeader>

            {/* 视频播放窗口 */}
            <div className="relative rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center border border-border">
              {previewVideo.localPath || previewVideo.videoStreamUrl ? (
                // 走本地高性能 206 流式分片服务（支持本地原画与远程防盗链直链代理）
                <video
                  key={previewVideo.localPath || previewVideo.videoStreamUrl}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-contain"
                  src={getVideoStreamUrl(previewVideo.localPath, previewVideo.videoStreamUrl)}
                />
              ) : (
                // 尚未下载且未提取直链时的封面预览与快速解析
                <div className="relative w-full h-full flex flex-col items-center justify-center bg-zinc-950 p-6 space-y-3">
                  {previewVideo.coverUrl && (
                    <img
                      src={previewVideo.coverUrl}
                      alt={previewVideo.title}
                      className="absolute inset-0 w-full h-full object-cover opacity-30 blur-xs"
                    />
                  )}
                  <div className="relative z-10 flex size-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    <LuPlay className="size-6 ml-0.5" />
                  </div>
                  <div className="relative z-10 text-center space-y-1">
                    <p className="text-sm font-semibold text-white">该视频尚未下载到本地</p>
                    <p className="text-xs text-zinc-400">
                      支持点击下方【立即下载原画】即刻下载，或在外部浏览器查看原网页
                    </p>
                  </div>
                  <div className="relative z-10 flex items-center gap-2 pt-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleExtractSingle(previewVideo)}
                      className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    >
                      <LuDownload className="size-3.5" />
                      ⚡ 立即下载原画并试看
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenUrl(previewVideo.shareUrl, previewVideo.platform, previewVideo.author)}
                      className="h-8 text-xs gap-1.5 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    >
                      <LuExternalLink className="size-3.5" />
                      访问原平台
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* 播放器底栏控制 */}
            <DialogFooter className="flex flex-col sm:flex-row items-center justify-between sm:justify-between w-full gap-3 pt-2">
              <div className="text-xs text-muted-foreground font-mono flex items-center gap-2">
                <span>作者: {previewVideo.author || "平台创作者"}</span>
                {previewVideo.sizeMb && <span>· {previewVideo.sizeMb} MB</span>}
                {previewVideo.likeCount && <span>· {previewVideo.likeCount}</span>}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {previewVideo.status === "downloaded" ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenPath(previewVideo.localPath)}
                      className="h-8 text-xs gap-1.5"
                    >
                      <LuFolder className="size-3.5" />
                      打开本地文件
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (previewVideo.localPath) {
                          onSendToDedup(
                            previewVideo.localPath,
                            previewVideo.fileName || previewVideo.title,
                            previewVideo.sizeMb
                          );
                          setPreviewVideo(null);
                        }
                      }}
                      className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-white gap-1.5 font-medium"
                    >
                      <LuScissors className="size-3.5" />
                      送入智能去重
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (previewVideo.localPath) {
                          onSendToMatrix(
                            previewVideo.localPath,
                            previewVideo.fileName || previewVideo.title,
                            previewVideo.sizeMb
                          );
                          setPreviewVideo(null);
                        }
                      }}
                      className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-medium"
                    >
                      <LuSend className="size-3.5" />
                      送入矩阵发布
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        handleQueueSingle(previewVideo);
                        setPreviewVideo(null);
                      }}
                      className="h-8 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                    >
                      <LuClock className="size-3.5" />
                      📥 加入后台下载队列
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleExtractSingle(previewVideo)}
                      className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    >
                      <LuDownload className="size-3.5" />
                      ⚡ 立即下载原画
                    </Button>
                  </>
                )}
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

// =========================================================================
// 视频素材卡片网格子组件 (支持封面展示、在线播放试看、实时下载与后台任务队列)
// =========================================================================
interface VideoCardsGridProps {
  items: CollectedVideo[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onExtractSingle: (item: CollectedVideo) => void;
  onQueueSingle: (item: CollectedVideo) => void;
  onPreview: (item: CollectedVideo) => void;
  onSendToDedup: (filePath: string, fileName: string, sizeMb?: number) => void;
  onSendToMatrix: (filePath: string, fileName: string, sizeMb?: number) => void;
  onOpenPath: (filePath?: string) => void;
  onDelete: (id: string) => void;
}

const VideoCardsGrid: React.FC<VideoCardsGridProps> = ({
  items,
  selectedIds,
  onToggleSelect,
  onExtractSingle,
  onQueueSingle,
  onPreview,
  onSendToDedup,
  onSendToMatrix,
  onOpenPath,
  onDelete,
}) => {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/80 bg-muted/10 p-10 flex flex-col items-center justify-center text-center space-y-2">
        <LuFileVideo className="size-8 text-muted-foreground/60" />
        <h4 className="text-xs font-semibold text-foreground">暂无符合条件的素材条目</h4>
        <p className="text-[11px] text-muted-foreground">
          点击上方【添加视频素材】录入链接，或切换顶层平台分类。
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item) => {
        const isDownloaded = item.status === "downloaded" && !!item.localPath;
        const isQueued = item.status === "queued";
        const isSelected = selectedIds.includes(item.id);

        return (
          <div
            key={item.id}
            className={`group rounded-xl border bg-card overflow-hidden transition-all flex flex-col justify-between ${
              isSelected
                ? "border-primary shadow-xs ring-1 ring-primary"
                : isDownloaded
                ? "border-emerald-500/30 hover:border-emerald-500/60"
                : isQueued
                ? "border-primary/40 bg-primary/5"
                : "border-border hover:border-border/80 hover:shadow-2xs"
            }`}
          >
            {/* 卡片顶部：封面图 + 在线试看悬停蒙层 */}
            <div className="relative aspect-video w-full bg-zinc-900 overflow-hidden cursor-pointer select-none">
              {item.coverUrl ? (
                <img
                  src={item.coverUrl}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950 p-4 text-center">
                  <LuVideo className="size-8 text-zinc-500 mb-1" />
                  <span className="text-[11px] text-zinc-400 font-medium truncate max-w-[90%]">
                    {item.title}
                  </span>
                </div>
              )}

              {/* 悬停在线试看蒙层 */}
              <div
                onClick={() => onPreview(item)}
                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-2xs"
              >
                <div className="flex size-11 items-center justify-center rounded-full bg-white/90 text-zinc-900 shadow-md transform hover:scale-110 transition-transform">
                  <LuPlay className="size-5 ml-0.5 fill-current" />
                </div>
                <span className="text-xs font-bold text-white tracking-wide">在线观看试看</span>
              </div>

              {/* 左上角平台胶囊 */}
              <div className="absolute top-2 left-2">
                <Badge
                  variant="outline"
                  className="bg-black/60 text-white backdrop-blur-md border-white/20 text-[10px] px-1.5 py-0 uppercase"
                >
                  {item.platform}
                </Badge>
              </div>

              {/* 右上角多选 Checkbox */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(item.id);
                }}
                className="absolute top-2 right-2 cursor-pointer z-10"
              >
                {isSelected ? (
                  <LuSquareCheck className="size-5 text-primary bg-background rounded fill-background" />
                ) : (
                  <LuSquare className="size-5 text-white/80 hover:text-white bg-black/40 rounded" />
                )}
              </div>

              {/* 右下角状态标签与时长 */}
              <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                {item.durationSecs ? (
                  <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-mono text-white/90">
                    {Math.floor(item.durationSecs / 60)}:
                    {String(Math.floor(item.durationSecs % 60)).padStart(2, "0")}
                  </span>
                ) : null}

                {isDownloaded ? (
                  <span className="rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-xs">
                    原画就绪
                  </span>
                ) : item.status === "downloading" ? (
                  <span className="rounded bg-amber-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white flex items-center gap-1">
                    <LuRefreshCw className="size-2.5 animate-spin" />
                    下载中
                  </span>
                ) : isQueued ? (
                  <span className="rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium text-white flex items-center gap-1">
                    <LuClock className="size-2.5" />
                    排队中
                  </span>
                ) : item.status === "failed" ? (
                  <span className="rounded bg-rose-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    提取失败
                  </span>
                ) : (
                  <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                    待下载
                  </span>
                )}
              </div>
            </div>

            {/* 卡片下半部：信息与操作栏 */}
            <div className="p-3.5 space-y-2.5 flex-1 flex flex-col justify-between">
              <div className="space-y-1">
                <h4
                  onClick={() => onPreview(item)}
                  className="text-xs font-semibold text-foreground line-clamp-2 hover:text-primary transition-colors cursor-pointer leading-snug"
                  title={item.title}
                >
                  {item.title}
                </h4>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                  <span className="truncate max-w-[120px]">{item.author || "平台创作者"}</span>
                  <span>{item.likeCount || (item.sizeMb ? `${item.sizeMb} MB` : item.publishTime || "")}</span>
                </div>
              </div>

              {/* 操作按钮栏 */}
              <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onPreview(item)}
                  className="h-7 px-2 text-xs text-foreground hover:bg-muted gap-1"
                >
                  <LuPlay className="size-3 text-emerald-500 fill-current" />
                  在线试看
                </Button>

                <div className="flex items-center gap-1">
                  {isDownloaded ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onSendToDedup(item.localPath!, item.fileName || item.title, item.sizeMb)}
                        className="size-7 p-0 text-amber-600 hover:bg-amber-500/10"
                        title="一键送入智能去重"
                      >
                        <LuScissors className="size-3.5" />
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onSendToMatrix(item.localPath!, item.fileName || item.title, item.sizeMb)}
                        className="size-7 p-0 text-primary hover:bg-primary/10"
                        title="一键送入矩阵发布"
                      >
                        <LuSend className="size-3.5" />
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onOpenPath(item.localPath)}
                        className="size-7 p-0 text-muted-foreground hover:text-foreground"
                        title="打开所在文件夹"
                      >
                        <LuFolder className="size-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onQueueSingle(item)}
                        disabled={item.status === "downloading" || isQueued}
                        className="h-7 px-2 text-[11px] border-primary/30 text-primary hover:bg-primary/10 gap-1"
                        title="将该视频加入后台静默下载队列"
                      >
                        <LuClock className="size-3" />
                        后台下载
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => onExtractSingle(item)}
                        disabled={item.status === "downloading"}
                        className="h-7 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                        title="立即解析并实时下载原画"
                      >
                        <LuDownload className="size-3" />
                        立即提取
                      </Button>
                    </>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(item.id)}
                    className="size-7 p-0 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                    title="移除记录"
                  >
                    <LuTrash2 className="size-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
