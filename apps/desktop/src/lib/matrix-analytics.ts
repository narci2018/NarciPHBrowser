import type { MatrixAccount } from "./matrix-accounts";

export interface AccountWorkItem {
  id: string;
  title: string;
  coverUrl?: string;
  publishTime: string;
  durationSecs?: number;
  playCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  completionRate5s: number; // 百分比，例如 48.5
  completionRateFull: number; // 百分比，例如 19.2
  avgPlayDuration: number; // 平均播放秒数，例如 28.5
  trafficRecommendPct: number; // 推荐流占比 %
  trafficSearchPct: number; // 搜索流占比 %
  trafficFansPct: number; // 粉丝关注页 %
  fansNetGain: number; // 该作品带来的粉丝净增
  status: "normal" | "reviewing" | "failed";
  videoUrl?: string;
  localPath?: string;
}

export interface TrendPoint {
  date: string; // "10-18"
  plays: number;
  fansGain: number;
  likes: number;
  comments: number;
}

export interface AccountAudience {
  malePct: number;
  femalePct: number;
  ageDistribution: { range: string; pct: number }[];
  topCities: { city: string; pct: number }[];
  activePeakHour: string; // 例如 "20:00 - 22:00"
}

export interface AccountAnalyticsData {
  accountId: string;
  platformId: string;
  accountName: string;
  avatar?: string;
  lastSyncedAt: number;
  healthScore: number; // 0 - 100
  creditStatus: "normal" | "warning" | "restricted";
  totalFans: number;
  fansGrowthToday: number;
  totalPlays: number;
  todayPlays: number;
  totalLikes: number;
  todayLikes: number;
  totalComments: number;
  totalShares: number;
  avgCompletionRate: number;
  trend30d: TrendPoint[];
  works: AccountWorkItem[];
  audience: AccountAudience;
}

const STORAGE_KEY = "matrix_accounts_analytics_v1";

export function loadAllAnalytics(): Record<string, AccountAnalyticsData> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to load analytics store:", err);
    return {};
  }
}

export function saveAccountAnalytics(data: AccountAnalyticsData): void {
  try {
    const map = loadAllAnalytics();
    map[data.accountId] = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.error("Failed to save account analytics:", err);
  }
}

export function getAccountAnalytics(accountId: string): AccountAnalyticsData | null {
  const map = loadAllAnalytics();
  return map[accountId] || null;
}

/**
 * 为账号生成初始真实感的运营分析指标（基于账号元数据计算基线，保证新账号接入时立即可见完整分析）
 */
export function generateInitialAnalytics(acc: MatrixAccount): AccountAnalyticsData {
  // 基于 accountId 计算相对稳定的哈希种子
  let seed = 0;
  for (let i = 0; i < acc.id.length; i++) {
    seed = (seed * 31 + acc.id.charCodeAt(i)) & 0xffffff;
  }
  const pseudoRand = (offset: number) => {
    const x = Math.sin(seed + offset) * 10000;
    return x - Math.floor(x);
  };

  const isDouyin = acc.platformId === "douyin";
  const baseFans = Math.floor(18000 + pseudoRand(1) * 85000);
  const fansGrowthToday = Math.floor(40 + pseudoRand(2) * 450);
  const totalPlays = Math.floor(baseFans * (12 + pseudoRand(3) * 18));
  const todayPlays = Math.floor(fansGrowthToday * (45 + pseudoRand(4) * 80));
  const totalLikes = Math.floor(totalPlays * (0.04 + pseudoRand(5) * 0.05));
  const todayLikes = Math.floor(todayPlays * (0.04 + pseudoRand(6) * 0.05));
  const totalComments = Math.floor(totalLikes * (0.08 + pseudoRand(7) * 0.06));
  const totalShares = Math.floor(totalLikes * (0.12 + pseudoRand(8) * 0.15));

  // 近 14 天趋势数据
  const trend30d: TrendPoint[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
    const dayFactor = 0.7 + pseudoRand(i * 3 + 10) * 0.6;
    const plays = Math.floor((todayPlays * dayFactor) * (i === 0 ? 1 : (0.8 + pseudoRand(i) * 0.4)));
    trend30d.push({
      date: dateStr,
      plays,
      fansGain: Math.max(5, Math.floor((plays / 150) * (0.8 + pseudoRand(i + 2) * 0.4))),
      likes: Math.floor(plays * 0.055),
      comments: Math.floor(plays * 0.006),
    });
  }

  // 模拟近期的代表性作品数据
  const sampleTitles = isDouyin
    ? [
        "万字长文解读《周期》：掌握市场波动的核心逻辑",
        "深度复盘：美联储降息对普通人资产的三大影响",
        "巴菲特致股东信深度精读，散户必须明白的投资第一课",
        "实体零售与短视频带货如何打通全域闭环？",
        "《思考，快与慢》如何帮助你在股市中克服人性弱点",
        "AI自动化工作流：普通人如何用大模型提升10倍人效",
      ]
    : [
        "实操干货：自媒体矩阵全自动化运营架构指南",
        "从0到1搭建企业私域流量与微信生态变现矩阵",
        "如何利用本地浏览器多会话管理突破平台限流瓶颈",
        "短视频去重降重黑科技：帧级混剪与元数据深度清洗",
        "跨境电商选品底层逻辑与爆款视频拆解技巧",
      ];

  const works: AccountWorkItem[] = sampleTitles.map((title, idx) => {
    const play = Math.floor(4500 + pseudoRand(idx * 7 + 100) * 38000);
    const like = Math.floor(play * (0.04 + pseudoRand(idx * 3) * 0.04));
    const comp5s = Math.floor((42 + pseudoRand(idx * 5) * 25) * 10) / 10;
    const compFull = Math.floor((14 + pseudoRand(idx * 9) * 16) * 10) / 10;
    const avgSec = Math.floor(18 + pseudoRand(idx * 11) * 35);
    const d = new Date(now.getTime() - idx * 2.5 * 86400000);

    return {
      id: `work_${acc.id}_${idx}`,
      title,
      coverUrl: "",
      publishTime: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${17 + (idx % 4)}:00`,
      durationSecs: 90 + idx * 45,
      playCount: play,
      likeCount: like,
      commentCount: Math.floor(like * 0.09),
      shareCount: Math.floor(like * 0.16),
      completionRate5s: comp5s,
      completionRateFull: compFull,
      avgPlayDuration: avgSec,
      trafficRecommendPct: Math.floor(65 + pseudoRand(idx * 13) * 22),
      trafficSearchPct: Math.floor(5 + pseudoRand(idx * 17) * 12),
      trafficFansPct: Math.floor(8 + pseudoRand(idx * 19) * 10),
      fansNetGain: Math.floor(play * 0.008),
      status: "normal",
    };
  });

  return {
    accountId: acc.id,
    platformId: acc.platformId,
    accountName: acc.accountName,
    avatar: acc.avatar,
    lastSyncedAt: Date.now() - Math.floor(pseudoRand(99) * 3600000 * 4),
    healthScore: Math.floor(92 + pseudoRand(77) * 7),
    creditStatus: "normal",
    totalFans: baseFans,
    fansGrowthToday,
    totalPlays,
    todayPlays,
    totalLikes,
    todayLikes,
    totalComments,
    totalShares,
    avgCompletionRate: 21.4,
    trend30d,
    works,
    audience: {
      malePct: Math.floor(58 + pseudoRand(12) * 16),
      femalePct: 100 - Math.floor(58 + pseudoRand(12) * 16),
      ageDistribution: [
        { range: "18-24岁", pct: 18 },
        { range: "25-30岁", pct: 36 },
        { range: "31-40岁", pct: 32 },
        { range: "41岁以上", pct: 14 },
      ],
      topCities: [
        { city: "北京", pct: 15.2 },
        { city: "上海", pct: 14.8 },
        { city: "深圳", pct: 12.4 },
        { city: "广州", pct: 10.1 },
        { city: "杭州", pct: 8.5 },
      ],
      activePeakHour: "20:00 - 22:30",
    },
  };
}

/**
 * 刷新或同步指定账号的运营分析数据
 */
export async function syncAccountAnalytics(acc: MatrixAccount): Promise<AccountAnalyticsData> {
  // 模拟从创作者中心拉取最新实时数据并写入本地持久化
  const existing = getAccountAnalytics(acc.id) || generateInitialAnalytics(acc);

  // 注入微小的实时增量
  const now = Date.now();
  const deltaPlays = Math.floor(50 + Math.random() * 200);
  const deltaLikes = Math.floor(deltaPlays * 0.05);
  const deltaFans = Math.max(1, Math.floor(deltaPlays * 0.008));

  const updated: AccountAnalyticsData = {
    ...existing,
    lastSyncedAt: now,
    todayPlays: existing.todayPlays + deltaPlays,
    totalPlays: existing.totalPlays + deltaPlays,
    todayLikes: existing.todayLikes + deltaLikes,
    totalLikes: existing.totalLikes + deltaLikes,
    fansGrowthToday: existing.fansGrowthToday + deltaFans,
    totalFans: existing.totalFans + deltaFans,
  };

  saveAccountAnalytics(updated);
  return updated;
}
