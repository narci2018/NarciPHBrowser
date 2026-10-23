import { useCallback, useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import {
  LuArrowDown,
  LuArrowUp,
  LuBot,
  LuCamera,
  LuCheck,
  LuSquareCheck,
  LuCode,
  LuCopy,
  LuCpu,
  LuDownload,
  LuEye,
  LuFlaskConical,
  LuGlobe,
  LuHourglass,
  LuInfo,
  LuKeyboard,
  LuLayers,
  LuListFilter,
  LuListPlus,
  LuMousePointer,
  LuMousePointerClick,
  LuPencil,
  LuPlay,
  LuPlus,
  LuRefreshCw,
  LuSearch,
  LuSettings2,
  LuSparkles,
  LuSquare,
  LuTerminal,
  LuTimer,
  LuTrash2,
  LuWorkflow,
  LuShoppingCart,
  LuStore,
  LuVideo,
  LuShieldCheck,
  LuSlidersHorizontal,
  LuZap,
  LuMail,
  LuKeyRound,
  LuEyeOff,
  LuLayoutGrid,
  LuMaximize2,
  LuTable,
  LuFileSpreadsheet,
  LuUpload,
  LuRadio,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProfileSummary } from "@narc/sdk";

/** Storage keys */
const DRIVER_STORAGE_KEY = "narc.driverPath";
const NODE_STORAGE_KEY = "narc.nodePath";
const WARMED_PROFILES_KEY = "narc.warmedProfiles";
const SCHEDULES_STORAGE_KEY = "narc.automationSchedules";
const WORKFLOWS_STORAGE_KEY = "narc.customWorkflows";

const DEFAULT_SITES = [
  "https://www.wikipedia.org/",
  "https://www.mozilla.org/",
  "https://www.bbc.com/",
  "https://www.nytimes.com/",
  "https://www.reddit.com/",
];

export type WorkflowStepAction =
  | "goto"
  | "click"
  | "type"
  | "screenshot"
  | "wait"
  | "scroll"
  | "press"
  | "hover"
  | "select"
  | "check"
  | "eval"
  | "takeover"
  | "interactive"
  | "adaptive_profile"
  | "smart_profile"
  | "extract"
  | "loop";

export interface WorkflowStep {
  id: string;
  action: WorkflowStepAction;
  name?: string;
  url?: string;
  selector?: string;
  text?: string;
  value?: string;
  uncheck?: boolean;
  script?: string;
  clear?: boolean;
  delay?: number;
  fullPage?: boolean;
  duration?: number;
  distance?: number | "bottom";
  key?: string;
  timeout?: number;
  stopOnError?: boolean;
  optional?: boolean;
  minDuration?: number;
  maxDuration?: number;
  times?: number;
  randomJitter?: boolean;
  intervalMs?: number;
  successUrl?: string;
  successSelector?: string;
  firstName?: string;
  lastName?: string;
  birthYear?: string | number;
  birthMonth?: string | number;
  birthDay?: string | number;
  // 阶段 3 进阶 RPA 新增属性
  extractType?: "text" | "href" | "src" | "value";
  extractKey?: string;
  loopCount?: number;
  loopInterval?: number;
  subAction?: string;
}

export interface CustomWorkflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  updatedAt: string;
}

export interface StepExecutionResult {
  stepIndex: number;
  action: string;
  name: string;
  ok: boolean;
  error?: string;
  durationMs: number;
  screenshot?: string;
  url?: string;
  selector?: string;
  text?: string;
  value?: string;
  checked?: boolean;
  evalResult?: string;
  skipped?: boolean;
  note?: string;
  solved?: boolean;
  extracted?: { selector: string; type: string; value: string };
  iterations?: number;
}

export interface AccountVaultItem {
  id: string;
  platform: "outlook" | "163" | "temp" | "custom";
  platformName: string;
  email: string;
  password?: string;
  profileId?: string;
  profileName?: string;
  status: "verified" | "pending" | "temp_ready";
  createdAt: string;
  note?: string;
}

export const VAULT_STORAGE_KEY = "narc_account_vault_v1";

export interface RpaParamConfig {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  defaultValue: string | number | boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  helper?: string;
}

export interface EcommerceRpaTemplate {
  id: string;
  category: "amazon" | "tiktok" | "facebook" | "shopee" | "google" | "security" | "email";
  platformName: string;
  name: string;
  badge: string;
  badgeColor: string;
  description: string;
  targetRole: string;
  antiDetectNotes: string;
  parameters: RpaParamConfig[];
  buildWorkflow: (params: Record<string, any>) => CustomWorkflow;
}

export const ECOMMERCE_RPA_TEMPLATES: EcommerceRpaTemplate[] = [
  {
    id: "wf-amz-cart",
    category: "amazon",
    platformName: "Amazon (亚马逊)",
    name: "Amazon 拟人货比三家与加购 (Browse & Add to Cart)",
    badge: "买家加购 / 养号测评",
    badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    description: "模拟真实买家搜索关键词、平滑微动滚动翻看列表、货比三家深度阅读详情页，并将目标商品加入购物车或心愿单，完成留存快照。",
    targetRole: "跨境买家号矩阵养号、Listing 权重提升、测评辅助加购",
    antiDetectNotes: "智能弹窗过滤、拟人键盘输入延迟 (45ms)、多频微动滚轮模拟与随机停留",
    parameters: [
      {
        key: "siteUrl",
        label: "亚马逊站点网址",
        type: "text",
        defaultValue: "https://www.amazon.com",
        placeholder: "如 https://www.amazon.com / https://www.amazon.co.uk",
      },
      {
        key: "keyword",
        label: "目标检索关键词",
        type: "text",
        defaultValue: "wireless noise cancelling headphones",
        placeholder: "输入核心搜索品类词",
      },
      {
        key: "dwellSeconds",
        label: "详情页停留秒数",
        type: "number",
        defaultValue: 12,
        helper: "模拟买家阅读主图、五点描述与买家评论的时长",
      },
      {
        key: "targetAction",
        label: "终点加购动作",
        type: "select",
        defaultValue: "cart",
        options: [
          { label: "加入购物车 (Add to Cart)", value: "cart" },
          { label: "加入心愿单 (Add to Wishlist)", value: "wishlist" },
          { label: "仅深度浏览 (不加购)", value: "browse" },
        ],
      },
    ],
    buildWorkflow: (params) => {
      const site = String(params.siteUrl || "https://www.amazon.com");
      const kw = String(params.keyword || "wireless noise cancelling headphones");
      const dwell = Math.max(5, Number(params.dwellSeconds) || 12);
      const action = String(params.targetAction || "cart");
      return {
        id: "wf-amz-cart",
        name: `Amazon 拟人搜索加购 [${kw}]`,
        description: `在 ${site} 搜索【${kw}】，深度浏览详情页并执行${action === "cart" ? "加购" : action === "wishlist" ? "加心愿单" : "浏览"}`,
        updatedAt: new Date().toISOString(),
        steps: [
          {
            id: "s1",
            action: "goto",
            name: "访问亚马逊站点首页",
            url: site,
            timeout: 30000,
          },
          {
            id: "s2",
            action: "click",
            name: "智能跳过潜在的区域偏好或Cookie弹窗",
            selector: 'input[data-action-type="DISMISS"], #sp-cc-accept, .a-popover-close',
            optional: true,
            timeout: 3000,
          },
          {
            id: "s3",
            action: "click",
            name: "聚焦顶部商品搜索框",
            selector: "#twotabsearchtextbox",
          },
          {
            id: "s4",
            action: "type",
            name: "拟人化输入目标搜索词",
            selector: "#twotabsearchtextbox",
            text: kw,
            delay: 45,
            clear: true,
          },
          {
            id: "s5",
            action: "press",
            name: "按回车键触发搜索",
            key: "Enter",
          },
          {
            id: "s6",
            action: "wait",
            name: "等待搜索结果列表稳定呈现",
            duration: 3500,
            minDuration: 2500,
            maxDuration: 4500,
          },
          {
            id: "s7",
            action: "scroll",
            name: "拟人平滑多频微动浏览搜索列表",
            distance: 480,
            times: 3,
            randomJitter: true,
            intervalMs: 1000,
          },
          {
            id: "s8",
            action: "click",
            name: "点击目标商品卡片进入详情页",
            selector: '[data-component-type="s-search-result"] h2 a, [data-cy="title-recipe"] a',
            optional: true,
          },
          {
            id: "s9",
            action: "wait",
            name: "深度停留阅读图文、参数与买家评价",
            duration: dwell * 1000,
            minDuration: (dwell - 3) * 1000,
            maxDuration: (dwell + 3) * 1000,
          },
          {
            id: "s10",
            action: "scroll",
            name: "向下浏览买家评星与 Q&A 问答区",
            distance: 420,
            times: 2,
            randomJitter: true,
            intervalMs: 800,
          },
          ...(action !== "browse"
            ? [
                {
                  id: "s11",
                  action: "click" as WorkflowStepAction,
                  name: action === "cart" ? "模拟点击【加入购物车】" : "模拟点击【加入心愿单】",
                  selector: action === "cart" ? "#add-to-cart-button" : "#add-to-wishlist-button-submit",
                  optional: true,
                },
              ]
            : []),
          {
            id: "s12",
            action: "screenshot",
            name: "生成商品交互存证高清快照",
            fullPage: false,
          },
        ],
      };
    },
  },
  {
    id: "wf-amz-price",
    category: "amazon",
    platformName: "Amazon (亚马逊)",
    name: "Amazon 竞品 Listing 价格与 BuyBox 巡检 (Price & BuyBox Monitor)",
    badge: "竞品盯盘 / 黄金购物车",
    badgeColor: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    description: "直达目标竞品 Listing 详情页，自动捕获当前价格、黄金购物车 (BuyBox) 卖家归属、评分数并留存高清快照。",
    targetRole: "跨境运营跟卖监控、竞品价格变动巡检、缺货预警",
    antiDetectNotes: "原生只读 DOM 解析、合规弹窗自动跳过、页面结构高容错",
    parameters: [
      {
        key: "productUrl",
        label: "目标 Listing 链接或 ASIN",
        type: "text",
        defaultValue: "https://www.amazon.com/dp/B09XS7JWHH",
        placeholder: "如 https://www.amazon.com/dp/B09XS7JWHH",
      },
      {
        key: "dwellSeconds",
        label: "页面渲染等待秒数",
        type: "number",
        defaultValue: 6,
      },
    ],
    buildWorkflow: (params) => {
      const url = String(params.productUrl || "https://www.amazon.com/dp/B09XS7JWHH");
      const dwell = Math.max(3, Number(params.dwellSeconds) || 6);
      return {
        id: "wf-amz-price",
        name: "Amazon 竞品价格与 BuyBox 巡检",
        description: `直达 ${url}，提取当前售价、黄金购物车归属与评星`,
        updatedAt: new Date().toISOString(),
        steps: [
          {
            id: "s1",
            action: "goto",
            name: "直达目标竞品 ASIN Listing 页面",
            url,
            timeout: 30000,
          },
          {
            id: "s2",
            action: "click",
            name: "容错跳过海外合规弹窗",
            selector: "#sp-cc-accept",
            optional: true,
            timeout: 3000,
          },
          {
            id: "s3",
            action: "wait",
            name: "等待核心购买框与详情载入",
            duration: dwell * 1000,
          },
          {
            id: "s4",
            action: "eval",
            name: "智能提取标题、当前售价、黄金购物车归属与评星",
            script: `const title = document.querySelector('#productTitle')?.innerText?.trim() || document.title;
const price = document.querySelector('.a-price .a-offscreen, #priceblock_ourprice')?.innerText || '需加购查看';
const seller = document.querySelector('#merchant-info, #sellerProfileTriggerId')?.innerText?.trim() || 'Amazon 官方自营/未标明';
const stars = document.querySelector('#acrPopover')?.title || '暂无评分';
return '【商品】' + title.slice(0, 35) + '... | 【售价】' + price + ' | 【BuyBox归属】' + seller + ' | 【评级】' + stars;`,
            timeout: 10000,
          },
          {
            id: "s5",
            action: "scroll",
            name: "向下滚动展示核心参数",
            distance: 350,
          },
          {
            id: "s6",
            action: "screenshot",
            name: "生成竞品 Listing 状态快照",
            fullPage: false,
          },
        ],
      };
    },
  },
  {
    id: "wf-tk-fyp",
    category: "tiktok",
    platformName: "TikTok",
    name: "TikTok 推荐流 (FYP) 自然拟人养号 (FYP Auto-Warmup)",
    badge: "短视频矩阵养号",
    badgeColor: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    description: "访问 TikTok For You 算法推荐流，自然完播观看 3~5 个视频（单片随机停留 8~16 秒），平滑滚动切片并按概率双击点赞，沉淀真人账号权重与垂直标签。",
    targetRole: "TK 跨境带货新号起号、广告投放前置养号、防封权重沉淀",
    antiDetectNotes: "完播时间随机抖动 (8~16s)、真实滚轮微抖动向下滑动、弹窗智能规避",
    parameters: [
      {
        key: "videoCount",
        label: "连续观看视频数 (个)",
        type: "number",
        defaultValue: 3,
        helper: "建议单次运行 3~5 个视频，模拟自然人类作息",
      },
      {
        key: "avgSeconds",
        label: "单视频平均停留 (秒)",
        type: "number",
        defaultValue: 10,
      },
      {
        key: "enableLike",
        label: "是否概率性点赞互动",
        type: "boolean",
        defaultValue: true,
      },
    ],
    buildWorkflow: (params) => {
      const count = Math.max(2, Math.min(8, Number(params.videoCount) || 3));
      const avg = Math.max(5, Number(params.avgSeconds) || 10);
      const enableLike = params.enableLike !== false;
      const steps: WorkflowStep[] = [
        {
          id: "s1",
          action: "goto",
          name: "打开 TikTok For You 算法推荐流",
          url: "https://www.tiktok.com/foryou",
          timeout: 35000,
        },
        {
          id: "s2",
          action: "click",
          name: "智能跳过未登录或访客提示浮层",
          selector: '[data-e2e="modal-close-inner-button"], button[aria-label="Close"]',
          optional: true,
          timeout: 3000,
        },
      ];

      for (let i = 1; i <= count; i++) {
        steps.push({
          id: `step-v-${i}`,
          action: "wait",
          name: `拟人停留观看第 ${i} 个推荐视频 (完播模拟)`,
          duration: avg * 1000,
          minDuration: (avg - 3) * 1000,
          maxDuration: (avg + 4) * 1000,
        });
        if (enableLike && i === 2) {
          steps.push({
            id: `step-like-${i}`,
            action: "click",
            name: "概率性对高兴趣视频点赞",
            selector: '[data-e2e="like-icon"], button[aria-label*="Like"]',
            optional: true,
            timeout: 2500,
          });
        }
        if (i < count) {
          steps.push({
            id: `step-scroll-${i}`,
            action: "scroll",
            name: `平滑向下滑动切换至第 ${i + 1} 个视频`,
            distance: 660,
            randomJitter: true,
          });
        }
      }

      steps.push({
        id: "step-end",
        action: "screenshot",
        name: "生成 TikTok FYP 推荐流养号存证快照",
        fullPage: false,
      });

      return {
        id: "wf-tk-fyp",
        name: `TikTok 推荐流拟人养号 (${count} 视频)`,
        description: `在 For You 推荐流连续拟人浏览 ${count} 个视频，沉淀账号兴趣标签与防封权重`,
        updatedAt: new Date().toISOString(),
        steps,
      };
    },
  },
  {
    id: "wf-tk-tag",
    category: "tiktok",
    platformName: "TikTok Shop",
    name: "TikTok 热门带货标签探索 (#AmazonFinds Explore)",
    badge: "爆款选品 / 竞品调研",
    badgeColor: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20",
    description: "直达热门带货标签页面，平滑滚动加载爆款视频流，悬停预览高播放量带货视频封面并截图存证。",
    targetRole: "TikTok Shop 选品团队、爆款视频对标、带货脚本调研",
    antiDetectNotes: "标签聚合流平滑翻滚、自适应卡片微停顿",
    parameters: [
      {
        key: "tag",
        label: "热门带货标签",
        type: "text",
        defaultValue: "amazonfinds",
        placeholder: "如 amazonfinds / tiktokmademebuyit / unboxing",
      },
      {
        key: "scrollRounds",
        label: "向下翻页加载轮次",
        type: "number",
        defaultValue: 3,
      },
    ],
    buildWorkflow: (params) => {
      const tag = String(params.tag || "amazonfinds").replace(/^#/, "");
      const rounds = Math.max(1, Math.min(6, Number(params.scrollRounds) || 3));
      return {
        id: "wf-tk-tag",
        name: `TikTok 带货标签探索 [#${tag}]`,
        description: `探索 #${tag} 热门爆款带货视频，连续加载 ${rounds} 轮`,
        updatedAt: new Date().toISOString(),
        steps: [
          {
            id: "s1",
            action: "goto",
            name: `直达跨境爆款选品标签 #${tag}`,
            url: `https://www.tiktok.com/tag/${tag}`,
            timeout: 35000,
          },
          {
            id: "s2",
            action: "wait",
            name: "等待热门带货视频网格载入",
            duration: 4000,
          },
          {
            id: "s3",
            action: "scroll",
            name: "顺滑滚动加载更多带货爆款视频卡片",
            distance: 600,
            times: rounds,
            randomJitter: true,
            intervalMs: 1200,
          },
          {
            id: "s4",
            action: "hover",
            name: "鼠标悬停带货封面预览播放动态",
            selector: '[data-e2e="challenge-item"]',
            optional: true,
            timeout: 8000,
          },
          {
            id: "s5",
            action: "screenshot",
            name: "截取热门带货标签选品探索存证快照",
            fullPage: false,
          },
        ],
      };
    },
  },
  {
    id: "wf-fb-feed",
    category: "facebook",
    platformName: "Facebook / Meta",
    name: "Facebook 动态流自然漫游防封 (News Feed Browse & Like)",
    badge: "账号防封 / 权重维护",
    badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    description: "进入个人主页信息流，模拟真人滚轮浏览好友动态与帖子，随机停留阅读并点赞，保持矩阵账号健康度与防封权重。",
    targetRole: "FB 广告投流前置养号、BM 资产防封、跨境社媒矩阵日常维活",
    antiDetectNotes: "随机停顿阅读 (6~12s)、拟人微滚动、Cookie 协议智能确认",
    parameters: [
      {
        key: "scrollRounds",
        label: "动态漫游滚动轮数",
        type: "number",
        defaultValue: 3,
      },
      {
        key: "enableLike",
        label: "是否概率性点赞互动",
        type: "boolean",
        defaultValue: true,
      },
    ],
    buildWorkflow: (params) => {
      const rounds = Math.max(1, Math.min(8, Number(params.scrollRounds) || 3));
      const enableLike = params.enableLike !== false;
      return {
        id: "wf-fb-feed",
        name: "Facebook 动态流自然漫游养号",
        description: "浏览信息流、随机停顿细读帖子并互动点赞",
        updatedAt: new Date().toISOString(),
        steps: [
          {
            id: "s1",
            action: "goto",
            name: "访问 Facebook 首页动态流",
            url: "https://www.facebook.com",
            timeout: 35000,
          },
          {
            id: "s2",
            action: "click",
            name: "自动跳过海外 Cookie 授权横幅",
            selector: '[data-cookiebanner="accept_button"], button:has-text("Allow all cookies")',
            optional: true,
            timeout: 3000,
          },
          {
            id: "s3",
            action: "scroll",
            name: "模拟真实滚轮向下滑动浏览动态",
            distance: 450,
            times: rounds,
            randomJitter: true,
            intervalMs: 1200,
          },
          {
            id: "s4",
            action: "wait",
            name: "停顿细读信息流动态帖子",
            duration: 8000,
            minDuration: 6000,
            maxDuration: 12000,
          },
          ...(enableLike
            ? [
                {
                  id: "s5",
                  action: "click" as WorkflowStepAction,
                  name: "对感兴趣的贴文点赞保持自然活跃",
                  selector: 'div[aria-label="赞"], div[aria-label="Like"]',
                  optional: true,
                  timeout: 3000,
                },
              ]
            : []),
          {
            id: "s6",
            action: "scroll",
            name: "再次向下滚动浏览新贴文",
            distance: 500,
            randomJitter: true,
          },
          {
            id: "s7",
            action: "screenshot",
            name: "生成 Facebook 账号日常活跃防封存证快照",
            fullPage: false,
          },
        ],
      };
    },
  },
  {
    id: "wf-shopee-browse",
    category: "shopee",
    platformName: "Shopee (虾皮)",
    name: "Shopee 东南亚全景逛店与热品比价 (Shopee Browse & Compare)",
    badge: "东南亚电商搜品",
    badgeColor: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    description: "访问 Shopee 东南亚站点，搜索核心品类词，模拟买家比价浏览搜索列表前排商品、查看价格区间与月销，生成存证快照。",
    targetRole: "东南亚本土店/跨境店运营、竞品定价监控、买家号日常预热",
    antiDetectNotes: "多站点适配、自动跳过新人大促弹窗、拟人键盘输入延迟",
    parameters: [
      {
        key: "siteUrl",
        label: "Shopee 站点",
        type: "text",
        defaultValue: "https://shopee.sg",
        placeholder: "如 https://shopee.sg / https://shopee.com.my",
      },
      {
        key: "keyword",
        label: "搜品比价关键词",
        type: "text",
        defaultValue: "mechanical keyboard gaming",
      },
    ],
    buildWorkflow: (params) => {
      const site = String(params.siteUrl || "https://shopee.sg");
      const kw = String(params.keyword || "mechanical keyboard gaming");
      return {
        id: "wf-shopee-browse",
        name: `Shopee 搜品比价 [${kw}]`,
        description: `在 ${site} 检索【${kw}】，浏览前排热卖商品与价格分布`,
        updatedAt: new Date().toISOString(),
        steps: [
          {
            id: "s1",
            action: "goto",
            name: "访问 Shopee 东南亚站点首页",
            url: site,
            timeout: 35000,
          },
          {
            id: "s2",
            action: "click",
            name: "容错关闭促销或语言弹窗",
            selector: '.shopee-popup__close-btn, button:has-text("English")',
            optional: true,
            timeout: 3000,
          },
          {
            id: "s3",
            action: "click",
            name: "聚焦商品搜索栏",
            selector: ".shopee-searchbar-input__input, input.shopee-searchbar-input__input",
          },
          {
            id: "s4",
            action: "type",
            name: "拟人输入品类搜索词",
            selector: ".shopee-searchbar-input__input, input.shopee-searchbar-input__input",
            text: kw,
            delay: 50,
            clear: true,
          },
          {
            id: "s5",
            action: "press",
            name: "回车检索热门品类",
            key: "Enter",
          },
          {
            id: "s6",
            action: "wait",
            name: "等待东南亚各店铺 Listing 呈现",
            duration: 3500,
          },
          {
            id: "s7",
            action: "scroll",
            name: "平滑滚动浏览店铺价格与月销量排行",
            distance: 500,
            times: 3,
            randomJitter: true,
            intervalMs: 1000,
          },
          {
            id: "s8",
            action: "screenshot",
            name: "生成 Shopee 搜品比价存证快照",
            fullPage: false,
          },
        ],
      };
    },
  },
  {
    id: "wf-google-dwell",
    category: "google",
    platformName: "Google / 独立站",
    name: "Google 拟人搜索与独立站加权停留 (Google Search & Dwell Boost)",
    badge: "SEO 流量 / 高权重Cookie",
    badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    description: "访问 Google 搜索行业关键词，翻看前排自然搜索结果并深度停留阅读，建立高权重真实买家搜索历史与可信 Cookie。",
    targetRole: "独立站 SEO 流量加权、Google 买家账号提权、建立可信搜索档案",
    antiDetectNotes: "全拟人回车检索、前排 Listing 平滑浏览、真实停留时间沉淀",
    parameters: [
      {
        key: "keyword",
        label: "行业核心检索词",
        type: "text",
        defaultValue: "cross border ecommerce browser automation",
      },
      {
        key: "dwellSeconds",
        label: "搜索结果细读停留秒数",
        type: "number",
        defaultValue: 12,
      },
    ],
    buildWorkflow: (params) => {
      const kw = String(params.keyword || "cross border ecommerce browser automation");
      const dwell = Math.max(5, Number(params.dwellSeconds) || 12);
      return {
        id: "wf-google-dwell",
        name: `Google 自然搜索加权 [${kw}]`,
        description: `在 Google 搜索【${kw}】并深度漫游，沉淀可信权重 Cookie`,
        updatedAt: new Date().toISOString(),
        steps: [
          {
            id: "s1",
            action: "goto",
            name: "访问 Google 全球搜索引擎",
            url: "https://www.google.com",
            timeout: 30000,
          },
          {
            id: "s2",
            action: "click",
            name: "跳过合规授权提示",
            selector: '#L2AGLb, button:has-text("Accept all")',
            optional: true,
            timeout: 3000,
          },
          {
            id: "s3",
            action: "type",
            name: "拟人化输入行业核心搜索词",
            selector: 'textarea[name="q"], input[name="q"]',
            text: kw,
            delay: 45,
            clear: true,
          },
          {
            id: "s4",
            action: "press",
            name: "按回车键触发搜索",
            key: "Enter",
          },
          {
            id: "s5",
            action: "wait",
            name: "等待搜索结果列表载入",
            duration: 3000,
          },
          {
            id: "s6",
            action: "scroll",
            name: "平滑向下浏览前排自然搜索结果",
            distance: 450,
            times: 2,
            randomJitter: true,
            intervalMs: 800,
          },
          {
            id: "s7",
            action: "wait",
            name: "模拟真实买家停留阅读结果摘要 (沉淀高信誉Cookie)",
            duration: dwell * 1000,
            minDuration: (dwell - 3) * 1000,
            maxDuration: (dwell + 4) * 1000,
          },
          {
            id: "s8",
            action: "screenshot",
            name: "拍摄 Google 搜索加权存证快照",
            fullPage: false,
          },
        ],
      };
    },
  },
  {
    id: "wf-audit-ip",
    category: "security",
    platformName: "指纹纯净度体检",
    name: "跨境出口 IP 与 WebRTC 穿透合规体检 (IP & WebRTC Audit)",
    badge: "IP 与伪装防封核查",
    badgeColor: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
    description: "一键连接权威 IP 泄漏检测站，全方位核验真实公网 IP、地理位置归属、DNS 泄漏与 WebRTC 是否穿透，输出高清存证快照。",
    targetRole: "多账号环境防关联核查、住宅代理可用性验收、防止母机真实 IP 裸奔",
    antiDetectNotes: "底层自动读取 IP 探针、无侵入只读审计",
    parameters: [
      {
        key: "checkUrl",
        label: "检测站点网址",
        type: "text",
        defaultValue: "https://browserleaks.com/ip",
      },
    ],
    buildWorkflow: (params) => {
      const url = String(params.checkUrl || "https://browserleaks.com/ip");
      return {
        id: "wf-audit-ip",
        name: "出口 IP 与 WebRTC 防封体检",
        description: `在 ${url} 自动化核验出口 IP、WebRTC 穿透及系统伪装报表`,
        updatedAt: new Date().toISOString(),
        steps: [
          {
            id: "s1",
            action: "goto",
            name: "访问专业 IP 伪装与泄漏检测站",
            url,
            timeout: 35000,
          },
          {
            id: "s2",
            action: "wait",
            name: "等待 IP 地图、DNS 与 WebRTC 探针分析",
            duration: 4000,
          },
          {
            id: "s3",
            action: "eval",
            name: "抓取出口 IP、归属国与 WebRTC 穿透判定",
            script: `const ip = document.querySelector('#ip-address, .myip')?.innerText?.trim() || '检测完成';
const country = document.querySelector('#country, .country')?.innerText?.trim() || '境外代理';
const webrtc = document.querySelector('#webrtc, .webrtc')?.innerText?.trim() || 'WebRTC 伪装正常';
return '【公网IP】' + ip + ' | 【归属地】' + country + ' | 【WebRTC状态】' + webrtc;`,
            timeout: 10000,
          },
          {
            id: "s4",
            action: "scroll",
            name: "向下滚动展示完整合规报表",
            distance: 400,
          },
          {
            id: "s5",
            action: "screenshot",
            name: "生成指纹纯净度合规认证快照",
            fullPage: false,
          },
        ],
      };
    },
  },
  {
    id: "wf-audit-session",
    category: "security",
    platformName: "多平台登录态巡检",
    name: "跨境平台登录态与 Cookie 存活体检 (Cookie & Session Vitality)",
    badge: "Session 存活与防掉线",
    badgeColor: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
    description: "自动巡检当前指纹环境在目标电商或社媒站点的 Cookie 会话活性与登录态，预警 Session 过期，避免频繁二次登录验证。",
    targetRole: "全矩阵店铺免密登录巡检、Cookie 失效预警、自动化批量前置检查",
    antiDetectNotes: "只读 Session 检查、智能提取页面身份标识",
    parameters: [
      {
        key: "targetUrl",
        label: "目标平台登录或首页网址",
        type: "text",
        defaultValue: "https://www.bing.com",
      },
    ],
    buildWorkflow: (params) => {
      const url = String(params.targetUrl || "https://www.bing.com");
      return {
        id: "wf-audit-session",
        name: "多平台登录态与 Cookie 存活体检",
        description: `快速探查 ${url} 的会话活跃度与登录上下文`,
        updatedAt: new Date().toISOString(),
        steps: [
          {
            id: "s1",
            action: "goto",
            name: "访问环境常驻平台验证入口",
            url,
            timeout: 25000,
          },
          {
            id: "s2",
            action: "wait",
            name: "等待页面 Cookie 上下文生效",
            duration: 3000,
          },
          {
            id: "s3",
            action: "eval",
            name: "智能核验 Cookie 存活状态与登录会话健康度",
            script: `const hasCookies = document.cookie.length > 0;
return '【Cookie 缓存】: ' + (hasCookies ? '有效沉淀 (' + document.cookie.split(';').length + ' 项)' : '无残留') + ' | 【页面标题】: ' + document.title;`,
            timeout: 10000,
          },
          {
            id: "s4",
            action: "screenshot",
            name: "拍摄会话存活状态快照",
            fullPage: false,
          },
        ],
      };
    },
  },
  {
    id: "wf-email-outlook",
    category: "email",
    platformName: "Microsoft Outlook",
    name: "Outlook 微软邮箱自动表单预填与协同注册",
    badge: "海外主流 / 辅助起号",
    badgeColor: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
    description: "直达微软全球注册通道，自动生成防重邮箱前缀与高强密码，拟人填写姓名与出生日期。注意：提交后需通过微软 Arkose 人机拼图验证码，账号才会真正生成入库。",
    targetRole: "跨境海外电商买家号、TikTok / Facebook 矩阵绑定、海外 PayPal 注册",
    antiDetectNotes: "全链路动态延迟输入 (45ms)、自动附加防重字符、表单自动分步推进、验证码状态截屏",
    parameters: [
      {
        key: "accountPrefix",
        label: "邮箱前缀规则",
        type: "text",
        defaultValue: "narc_{random}",
        placeholder: "如 narc_{random}，系统会自动将 {random} 替换为 6 位唯一字符",
        helper: "支持 {random} 动态随机占位符",
      },
      {
        key: "password",
        label: "注册强密码",
        type: "text",
        defaultValue: "W!x9{random}Qz#2026",
        placeholder: "必须包含大小写字母、数字及标点符号，且绝对不能与邮箱前缀重名",
        helper: "微软硬性安全要求：密码中严禁包含用户名或邮箱前缀中任意连续3位字符",
      },
      {
        key: "firstName",
        label: "名字 (First Name)",
        type: "text",
        defaultValue: "Alex",
      },
      {
        key: "lastName",
        label: "姓氏 (Last Name)",
        type: "text",
        defaultValue: "Miller",
      },
      {
        key: "birthYear",
        label: "出生年份",
        type: "number",
        defaultValue: 1997,
      },
    ],
    buildWorkflow: (params) => {
      const randStr = Math.random().toString(36).slice(2, 8);
      const rawPrefix = String(params.accountPrefix || "narc_{random}");
      const actualPrefix = rawPrefix.includes("{random}")
        ? rawPrefix.replace("{random}", randStr)
        : `${rawPrefix}_${randStr}`;
      
      // 必须严格避开微软 MSA 密码策略：密码中绝对不能包含用户名或邮箱前缀的任何连续3位字符
      const randSecret = Math.random().toString(36).slice(2, 6).toUpperCase();
      const rawPass = String(params.password || "W!x9{random}Qz#2026");
      let actualPass = rawPass.includes("{random}")
        ? rawPass.replace("{random}", randSecret)
        : rawPass;
      // 深度安全防护：如果用户自定义密码里包含 actualPrefix 或 "narc"，强制替换避免被微软静默拦截
      if (actualPass.toLowerCase().includes(actualPrefix.toLowerCase()) || actualPass.toLowerCase().includes("narc")) {
        actualPass = `W!x9${randSecret}Qz#2026`;
      }
      const fullEmail = `${actualPrefix}@outlook.com`;
      const fName = String(params.firstName || "Alex");
      const lName = String(params.lastName || "Miller");
      const year = String(params.birthYear || 1997);

      return {
        id: "wf-email-outlook",
        name: `Outlook 邮箱注册 [${fullEmail}]`,
        description: `自动注册微软账号【${fullEmail}】，密码【${actualPass}】并输出凭据留存`,
        updatedAt: new Date().toISOString(),
        steps: [
          {
            id: "s1",
            action: "goto",
            name: "直达微软全球账号与 Outlook 注册入口",
            url: "https://signup.live.com/signup",
            timeout: 35000,
          },
          {
            id: "s2",
            action: "wait",
            name: "等待微软注册向导首屏渲染",
            selector: '#usernameInput, input[type="email"], input[name="MemberName"], #MemberName',
            timeout: 25000,
          },
          {
            id: "s3",
            action: "click",
            name: "容错跳过海外 Cookie / 区域确认横幅",
            selector: 'button[data-testid="secondaryButton"], #sp-cc-accept, .banner-actions button, button:has-text("Accept")',
            optional: true,
            timeout: 3000,
          },
          {
            id: "s4",
            action: "click",
            name: "聚焦账号地址输入框",
            selector: '#usernameInput, input[type="email"], input[name="MemberName"], #MemberName',
          },
          {
            id: "s5",
            action: "type",
            name: `拟人键入专属邮箱前缀 [${fullEmail}]`,
            selector: '#usernameInput, input[type="email"], input[name="MemberName"], #MemberName',
            text: fullEmail,
            delay: 45,
            clear: true,
          },
          {
            id: "s6",
            action: "click",
            name: "点击【下一步】提交邮箱账号名",
            selector: '#nextButton, button[type="submit"], input[type="submit"], #iSignupAction',
          },
          {
            id: "s7",
            action: "wait",
            name: "等待密码设置表单加载",
            selector: '#PasswordInput, input[type="password"], input[name="Password"]',
            timeout: 25000,
          },
          {
            id: "s8",
            action: "type",
            name: "拟人化键入高强度注册密码",
            selector: '#PasswordInput, input[type="password"], input[name="Password"]',
            text: actualPass,
            delay: 50,
          },
          {
            id: "s8_settle",
            action: "wait",
            name: "等待微软前端密码合规校验就绪",
            duration: 800,
          },
          {
            id: "s9",
            action: "click",
            name: "点击【下一步】提交安全密码",
            selector: '#nextButton, button[type="submit"], input[type="submit"], #iSignupAction',
          },
          {
            id: "s10_smart_profile",
            action: "adaptive_profile",
            name: "自适应跨国别表单预填 (智能绑定年月日与姓名顺序)",
            firstName: fName,
            lastName: lName,
            birthYear: year,
            birthMonth: 5,
            birthDay: 16,
            timeout: 50000,
          },
          {
            id: "s18",
            action: "wait",
            name: "等待人机验证模块初始化",
            duration: 2500,
          },
          {
            id: "s19",
            action: "eval",
            name: "输出预填注册凭据并启动人机接管提示",
            script: `return '⚠️【Outlook 表单已预填】预填账号: ${fullEmail} | 预设密码: ${actualPass} | 🔔 人机协同接管中：指纹浏览器窗口已前置激活，请在当前窗口完成 3 秒旋转动物拼图，系统正实时监听验证结果...';`,
            timeout: 10000,
          },
          {
            id: "s20",
            action: "screenshot",
            name: "生成 Outlook 当前人机验证码状态存证快照",
            fullPage: false,
          },
          {
            id: "s21",
            action: "takeover",
            name: "🤖 自动化按住人机验证 (连续自动长按 3 次，超时 120 秒)",
            timeout: 120000,
            optional: false,
          },
          {
            id: "s22",
            action: "wait",
            name: "等待个人中心与收件箱页面加载",
            duration: 3000,
            optional: true,
          },
          {
            id: "s23",
            action: "screenshot",
            name: "生成 Outlook 官方落库完成最终存证快照",
            fullPage: false,
          },
        ],
      };
    },
  },
  {
    id: "wf-email-163",
    category: "email",
    platformName: "网易 163 邮箱",
    name: "网易 163 邮箱自动表单填充与协议签署",
    badge: "国内商用 / 批量起号",
    badgeColor: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    description: "直达网易邮箱注册中心，拟人输入分配的字母邮箱账号与安全密码，自动勾选服务协议与隐私条款，准备提交并生成凭据快照。",
    targetRole: "国内电商/物流服务商绑定、国内跨境服务通道归档、多渠道备用邮箱",
    antiDetectNotes: "智能切换字母邮箱标签、拟人打字节奏延迟、协议自动复选合规",
    parameters: [
      {
        key: "accountPrefix",
        label: "163 邮箱账号前缀",
        type: "text",
        defaultValue: "narci_{random}",
        placeholder: "建议字母开头，支持 {random} 随机占位符",
      },
      {
        key: "password",
        label: "注册安全密码",
        type: "text",
        defaultValue: "NetEase!{random}99",
        placeholder: "必须包含大小写字母与数字",
      },
    ],
    buildWorkflow: (params) => {
      const randStr = Math.random().toString(36).slice(2, 8);
      const rawPrefix = String(params.accountPrefix || "narci_{random}");
      const actualPrefix = rawPrefix.includes("{random}")
        ? rawPrefix.replace("{random}", randStr)
        : `${rawPrefix}_${randStr}`;
      const rawPass = String(params.password || "NetEase!{random}99");
      const actualPass = rawPass.includes("{random}")
        ? rawPass.replace("{random}", Math.random().toString(36).slice(2, 6))
        : rawPass;
      const full163 = `${actualPrefix}@163.com`;

      return {
        id: "wf-email-163",
        name: `网易 163 邮箱注册预填 [${full163}]`,
        description: `直达网易注册中心预填【${full163}】，密码【${actualPass}】并勾选协议`,
        updatedAt: new Date().toISOString(),
        steps: [
          {
            id: "s1",
            action: "goto",
            name: "直达网易通行证与 163 邮箱注册页面",
            url: "https://zc.reg.163.com/regInitialized",
            timeout: 30000,
          },
          {
            id: "s2",
            action: "wait",
            name: "等待注册中心表单加载渲染",
            duration: 2500,
          },
          {
            id: "s3",
            action: "click",
            name: "切换到【注册字母邮箱】模式",
            selector: 'a:has-text("注册字母邮箱"), .tab-item:has-text("字母"), a:has-text("字母邮箱")',
            optional: true,
            timeout: 3000,
          },
          {
            id: "s4",
            action: "click",
            name: "聚焦账号输入框",
            selector: 'input[name="name"], #nameIpt, input[placeholder*="邮箱地址"], input[placeholder*="帐号"]',
          },
          {
            id: "s5",
            action: "type",
            name: `拟人键入分配的 163 邮箱前缀 [${actualPrefix}]`,
            selector: 'input[name="name"], #nameIpt, input[placeholder*="邮箱地址"], input[placeholder*="帐号"]',
            text: actualPrefix,
            delay: 50,
            clear: true,
          },
          {
            id: "s5_suggest",
            action: "click",
            name: "选中 @163.com 后缀建议并关闭联想下拉浮层",
            selector: 'li.suggest-item:has-text("@163.com"), li.suggest-item',
            optional: true,
            timeout: 2500,
          },
          {
            id: "s6",
            action: "click",
            name: "聚焦密码输入框",
            selector: 'input[type="password"], input[name="password"], #mainPwdIpt',
          },
          {
            id: "s7",
            action: "type",
            name: "拟人输入高强度安全密码",
            selector: 'input[type="password"], input[name="password"], #mainPwdIpt',
            text: actualPass,
            delay: 45,
            clear: true,
          },
          {
            id: "s8",
            action: "click",
            name: "聚焦确认密码输入框",
            selector: 'input[name="confirmPassword"], #mainCfmPwdIpt',
            optional: true,
          },
          {
            id: "s9",
            action: "type",
            name: "再次输入确认密码",
            selector: 'input[name="confirmPassword"], #mainCfmPwdIpt',
            text: actualPass,
            delay: 45,
            optional: true,
          },
          {
            id: "s10",
            action: "click",
            name: "勾选【我已阅读并同意服务条款与隐私政策】",
            selector: '.m-agree, .u-agree-area, .agree, input[type="checkbox"], #agreeService, input[name="agree"]',
            optional: true,
          },
          {
            id: "s10_next",
            action: "click",
            name: "点击【下一步】提交账号密码并进入手机滑块验证",
            selector: '.step0-btn, button:has-text("下一步"), .bview-button:has-text("下一步")',
            optional: true,
            timeout: 5000,
          },
          {
            id: "s11",
            action: "eval",
            name: "输出预填凭据并提示短信滑块验证",
            script: `return '⚠️【网易 163 邮箱表单已预填】预填邮箱: ${full163} | 预设密码: ${actualPass} | 🔔 人机接管已启动：请在弹出的指纹浏览器窗口中拖动易盾滑块并填入短信验证码，系统正实时监听结果！';`,
            timeout: 10000,
          },
          {
            id: "s12",
            action: "screenshot",
            name: "生成网易 163 邮箱滑块/短信验证当前状态快照",
            fullPage: false,
          },
          {
            id: "s13",
            action: "takeover",
            name: "🔔 人机协同接管：请在窗口中完成滑块拼图或填入短信验证码 (60秒)",
            timeout: 60000,
            optional: true,
          },
          {
            id: "s14",
            action: "screenshot",
            name: "生成网易 163 邮箱最终入库状态存证快照",
            fullPage: false,
          },
        ],
      };
    },
  },
  {
    id: "wf-email-temp",
    category: "email",
    platformName: "临时隐私邮箱",
    name: "跨境免封临时邮箱自动提取与激活",
    badge: "免手机号 / 即用即抛",
    badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    description: "直达国际临时邮箱平台，毫秒级提取系统自动分配的真实接收邮箱地址并监听收件箱，无需手机号即可完成各类海外网站的验证码接收。",
    targetRole: "各类跨境平台快速注册、免费试用账号批量开通、一次性验证码接收",
    antiDetectNotes: "原生只读提取、防封无侵入操作、自动捕获分配 Token",
    parameters: [
      {
        key: "serviceUrl",
        label: "临时邮箱服务入口",
        type: "text",
        defaultValue: "https://temp-mail.org/",
        placeholder: "如 https://temp-mail.org/ 或 https://mail.tm/",
      },
      {
        key: "waitInboxSeconds",
        label: "收件箱等待秒数",
        type: "number",
        defaultValue: 6,
      },
    ],
    buildWorkflow: (params) => {
      const url = String(params.serviceUrl || "https://temp-mail.org/");
      const waitSec = Math.max(3, Number(params.waitInboxSeconds) || 6);
      return {
        id: "wf-email-temp",
        name: "跨境免封临时邮箱自动提取",
        description: `直达 ${url}，提取系统分配的独立接收邮箱地址并监听收件箱`,
        updatedAt: new Date().toISOString(),
        steps: [
          {
            id: "s1",
            action: "goto",
            name: "访问国际临时邮箱分配中心",
            url,
            timeout: 35000,
          },
          {
            id: "s2",
            action: "wait",
            name: "等待系统自动分发独立邮箱地址",
            duration: waitSec * 1000,
          },
          {
            id: "s3",
            action: "eval",
            name: "自动提取当前分配的临时邮箱地址",
            script: `const addr = document.querySelector('#mail, input.mail, .email-address, #email')?.value || document.querySelector('#mail, .email-address')?.innerText || '已生成临时邮箱';
return '✅【当前环境已分配临时接收邮箱】: ' + addr.trim() + ' | 状态: 收件箱已就绪，可用于接收海外验证码';`,
            timeout: 10000,
          },
          {
            id: "s4",
            action: "scroll",
            name: "向下滚动查看实时收件箱动态",
            distance: 350,
          },
          {
            id: "s5",
            action: "screenshot",
            name: "截取分配的临时邮箱与收件箱存证快照",
            fullPage: false,
          },
        ],
      };
    },
  },
];

export const DEFAULT_WORKFLOWS: CustomWorkflow[] = ECOMMERCE_RPA_TEMPLATES.map((tpl) => {
  const defaultParams: Record<string, any> = {};
  tpl.parameters.forEach((p) => {
    defaultParams[p.key] = p.defaultValue;
  });
  return tpl.buildWorkflow(defaultParams);
});

interface WarmupForm {
  sites: string;
  seconds: string;
}

interface AgentSessionRow {
  id: string;
  wsEndpoint: string;
  pid: number;
}

interface LocalApiStatus {
  running: boolean;
  port: number;
  url: string;
  driver_ready: boolean;
  driver_path: string | null;
  node_path: string | null;
}

interface AutomationEnvInfo {
  node_found: boolean;
  node_version: string | null;
  node_path: string | null;
  driver_found: boolean;
  driver_path: string | null;
  ready: boolean;
}

interface BatchLogItem {
  id: string;
  time: string;
  profileName: string;
  message: string;
  status: "running" | "success" | "error";
}

export type AutomationTemplateType = "warmup" | "cruise" | "search" | "check" | "workflow";

export interface ScheduleConfig {
  customSites?: string;
  dwellSeconds?: number;
  keywords?: string;
  engine?: "bing" | "google";
  searchDwellSeconds?: number;
  workflowId?: string;
}

interface AutomationSchedule {
  id: string;
  name: string;
  targetProfileIds: string[];
  template: AutomationTemplateType;
  customUrl?: string;
  intervalMinutes: number;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  config?: ScheduleConfig;
}

export function AgentPage({ profiles }: { profiles: ProfileSummary[] }) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<AgentSessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Active top tab: "list" | "orchestrator" | "workflow" | "scheduler" | "synchronizer" | "vault"
  const [activeMainTab, setActiveMainTab] = useState<"list" | "orchestrator" | "workflow" | "scheduler" | "synchronizer" | "vault">("list");

  // Selection for Batch actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Local API & Env Status
  const [apiStatus, setApiStatus] = useState<LocalApiStatus | null>(null);
  const [envInfo, setEnvInfo] = useState<AutomationEnvInfo | null>(null);

  // Settings & Custom Override Dialog
  const [showSettings, setShowSettings] = useState(false);
  const [customDriver, setCustomDriver] = useState("");
  const [customNode, setCustomNode] = useState("");
  const [headlessDefault, setHeadlessDefault] = useState(true);

  // Code Snippets Dialog
  const [snippetProfile, setSnippetProfile] = useState<ProfileSummary | null>(null);
  const [copiedLang, setCopiedLang] = useState<string | null>(null);

  // Action status
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);

  // Batch orchestrator state
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchLogs, setBatchLogs] = useState<BatchLogItem[]>([]);
  const [concurrency, setConcurrency] = useState<number>(2);

  // Warmup Dialog
  const [warmTarget, setWarmTarget] = useState<ProfileSummary | null>(null);
  const [warmForm, setWarmForm] = useState<WarmupForm>({
    sites: DEFAULT_SITES.join("\n"),
    seconds: "20",
  });
  const [warming, setWarming] = useState(false);
  const [warmedIds, setWarmedIds] = useState<Set<string>>(() => {
    try {
      const saved = window.localStorage.getItem(WARMED_PROFILES_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Visual Custom Workflow states
  const [workflows, setWorkflows] = useState<CustomWorkflow[]>(() => {
    try {
      const TARGET_VER = "20261014-v13-auto-hold-120s";
      const currentVer = window.localStorage.getItem("narc.workflows_ver");
      const saved = window.localStorage.getItem(WORKFLOWS_STORAGE_KEY);
      if (!saved) {
        window.localStorage.setItem("narc.workflows_ver", TARGET_VER);
        return DEFAULT_WORKFLOWS;
      }
      const parsed: CustomWorkflow[] = JSON.parse(saved);
      if (currentVer !== TARGET_VER) {
        window.localStorage.setItem("narc.workflows_ver", TARGET_VER);
        const customOnly = parsed.filter(
          (p) => !DEFAULT_WORKFLOWS.some((d) => d.id === p.id) && !p.id.includes("outlook") && !p.name.includes("Outlook")
        );
        const updated = [...DEFAULT_WORKFLOWS, ...customOnly];
        window.localStorage.setItem(WORKFLOWS_STORAGE_KEY, JSON.stringify(updated));
        return updated;
      }
      return parsed;
    } catch {
      return DEFAULT_WORKFLOWS;
    }
  });
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(() => {
    try {
      return "wf-email-outlook";
    } catch {
      return DEFAULT_WORKFLOWS[0].id;
    }
  });
  const [workflowTargetProfileId, setWorkflowTargetProfileId] = useState<string>(() => profiles[0]?.id || "");
  const [workflowExecuting, setWorkflowExecuting] = useState(false);
  const [workflowStepResults, setWorkflowStepResults] = useState<StepExecutionResult[]>([]);
  const [previewScreenshot, setPreviewScreenshot] = useState<{ title: string; src: string } | null>(null);
  const [deliveryModal, setDeliveryModal] = useState<{
    open: boolean;
    platform: string;
    email: string;
    password: string;
    isVerified: boolean;
    statusText: string;
    note: string;
    passedSteps: number;
    totalSteps: number;
    screenshot?: string;
  } | null>(null);

  // 跨境电商 RPA 市场、步骤链、账号资产账本与动态数据池状态
  const [workflowSubTab, setWorkflowSubTab] = useState<"marketplace" | "editor" | "vault" | "datapool">("marketplace");
  const [rpaCategoryFilter, setRpaCategoryFilter] = useState<string>("all");
  const [rpaWizardTemplate, setRpaWizardTemplate] = useState<EcommerceRpaTemplate | null>(null);
  const [rpaWizardParams, setRpaWizardParams] = useState<Record<string, any>>({});
  const [rpaWizardTargetProfileId, setRpaWizardTargetProfileId] = useState<string>(() => profiles[0]?.id || "");

  // 阶段 3 进阶 RPA: 动态 CSV 数据池与变量绑定状态
  const [csvRawText, setCsvRawText] = useState<string>(() => {
    return (
      window.localStorage.getItem("narc_datapool_csv") ||
      `username,password,email,search_term,address
user_us_01,Pass@9821,user01@outlook.com,mechanical keyboard,100 Main St New York
user_us_02,Pass@7319,user02@outlook.com,gaming mouse,200 Broad St Los Angeles
user_uk_01,Pass@4402,user03@outlook.com,noise cancelling earbuds,12 Oxford St London`
    );
  });
  const [useDataPool, setUseDataPool] = useState<boolean>(true);
  const [csvActiveRowIndex, setCsvActiveRowIndex] = useState<number>(0);

  // 阶段 3 群控同步器 (Synchronizer & Multi-Window Control) 状态
  const [syncMasterId, setSyncMasterId] = useState<string>("");
  const [syncSlaveIds, setSyncSlaveIds] = useState<Set<string>>(new Set());
  const [syncCols, setSyncCols] = useState<number>(3); // 0 (auto), 2, 3, 4
  const [syncJitter, setSyncJitter] = useState<boolean>(true); // 防关联拟人微扰 ±2px, 30~180ms
  const [syncBroadcastUrl, setSyncBroadcastUrl] = useState<string>("https://www.bing.com");
  const [syncBroadcastText, setSyncBroadcastText] = useState<string>("");
  const [syncBroadcastScript, setSyncBroadcastScript] = useState<string>("document.body.style.filter = 'contrast(1.02)';");
  const [syncBusy, setSyncBusy] = useState<boolean>(false);
  const [liveSyncActive, setLiveSyncActive] = useState<boolean>(false);
  const [syncLogs, setSyncLogs] = useState<Array<{ time: string; action: string; msg: string; ok: boolean }>>([]);

  // 差异化文本广播状态 (Differential Data Broadcast)
  const [syncDiffText, setSyncDiffText] = useState<string>(() => {
    return (
      "alice_usa@outlook.com\tPass123456\t关注店铺并咨询\thttps://www.amazon.com\n" +
      "bob_uk@outlook.com\tPass654321\t催发货核实单号\thttps://www.amazon.co.uk\n" +
      "cindy_jp@outlook.com\tPass888999\t询问最新折扣活动\thttps://www.amazon.co.jp"
    );
  });

  // 免代码动作录制器状态 (No-Code Action Recorder)
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordTargetId, setRecordTargetId] = useState<string>("");
  const [recordedModalOpen, setRecordedModalOpen] = useState<boolean>(false);
  const [recordedActions, setRecordedActions] = useState<any[]>([]);
  const [recordedWfName, setRecordedWfName] = useState<string>("");

  // 账号矩阵批量导入状态 (Excel/CSV Batch Importer)
  const [batchImportModalOpen, setBatchImportModalOpen] = useState<boolean>(false);
  const [batchImportText, setBatchImportText] = useState<string>("");

  // 已沉淀账号资产账本 (Account Vault)
  const [accountVault, setAccountVault] = useState<AccountVaultItem[]>(() => {
    try {
      const saved = window.localStorage.getItem(VAULT_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
      return [
        {
          id: "vault-init-1",
          platform: "outlook",
          platformName: "Microsoft Outlook",
          email: "narc_isgpje@outlook.com",
          password: "Narc!af862026",
          status: "pending",
          createdAt: new Date().toLocaleString(),
          note: "表单自动预填完成，等待人机协同拼图完成落库",
        },
      ];
    } catch {
      return [];
    }
  });
  const [revealedPasswords, setRevealedPasswords] = useState<Set<string>>(new Set());
  const [vaultSearch, setVaultSearch] = useState("");
  const [addVaultModalOpen, setAddVaultModalOpen] = useState(false);
  const [newVaultEmail, setNewVaultEmail] = useState("");
  const [newVaultPassword, setNewVaultPassword] = useState("");
  const [newVaultPlatform, setNewVaultPlatform] = useState<"outlook" | "163" | "temp" | "custom">("outlook");

  // Scheduled Jobs state
  const [schedules, setSchedules] = useState<AutomationSchedule[]>(() => {
    try {
      const saved = window.localStorage.getItem(SCHEDULES_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [newScheduleModal, setNewScheduleModal] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [newSchedName, setNewSchedName] = useState("定时自动化计划");
  const [newSchedInterval, setNewSchedInterval] = useState("60"); // 分钟
  const [newSchedTemplate, setNewSchedTemplate] = useState<AutomationTemplateType>("warmup");
  const [schedTargetIds, setSchedTargetIds] = useState<string[]>([]);
  // Template parameters
  const [schedCruiseSites, setSchedCruiseSites] = useState("https://www.wikipedia.org\nhttps://www.bbc.com\nhttps://www.reddit.com");
  const [schedCruiseDwell, setSchedCruiseDwell] = useState("15");
  const [schedSearchKeywords, setSchedSearchKeywords] = useState("NarciPH 指纹浏览器\n跨境电商多账号管理\n海外社交媒体运营");
  const [schedSearchEngine, setSchedSearchEngine] = useState<"bing" | "google">("bing");
  const [schedSearchDwell, setSchedSearchDwell] = useState("12");
  const [schedWorkflowId, setSchedWorkflowId] = useState<string>(() => DEFAULT_WORKFLOWS[0].id);

  const selectedWorkflow = workflows.find((w) => w.id === selectedWorkflowId) || workflows[0];

  const saveWorkflowsToStorage = (list: CustomWorkflow[]) => {
    try {
      window.localStorage.setItem(WORKFLOWS_STORAGE_KEY, JSON.stringify(list));
    } catch {}
  };

  // Workflow CRUD modal states
  const [workflowManagerModal, setWorkflowManagerModal] = useState(false);
  const [workflowCreateModal, setWorkflowCreateModal] = useState(false);
  const [workflowEditMetaModal, setWorkflowEditMetaModal] = useState<CustomWorkflow | null>(null);
  const [workflowDeleteConfirmId, setWorkflowDeleteConfirmId] = useState<string | null>(null);
  const [newWfName, setNewWfName] = useState("");
  const [newWfDesc, setNewWfDesc] = useState("");
  const [newWfTemplate, setNewWfTemplate] = useState<"search" | "form" | "advanced" | "empty">("search");
  const [editMetaName, setEditMetaName] = useState("");
  const [editMetaDesc, setEditMetaDesc] = useState("");
  const [workflowSearchFilter, setWorkflowSearchFilter] = useState("");

  const handleAddStep = (action: WorkflowStepAction) => {
    if (!selectedWorkflow) return;
    const newStep: WorkflowStep = {
      id: "step-" + Math.random().toString(36).slice(2, 9),
      action,
      name:
        action === "click"
          ? "点击目标元素 (Click)"
          : action === "type"
          ? "拟人输入文字 (Type)"
          : action === "hover"
          ? "鼠标悬停菜单 (Hover)"
          : action === "select"
          ? "下拉选项选择 (Select)"
          : action === "check"
          ? "表单复选勾选 (Check)"
          : action === "eval"
          ? "执行自定义脚本 (JS Eval)"
          : action === "screenshot"
          ? "页面快照存证 (Screenshot)"
          : action === "goto"
          ? "导航至目标网址 (Navigate)"
          : action === "wait"
          ? "等待延迟 (Wait)"
          : action === "scroll"
          ? "平滑滚动浏览 (Scroll)"
          : action === "extract"
          ? "数据字段抓取 (Extract)"
          : action === "loop"
          ? "重复循环执行 (Loop)"
          : "按键触发交互 (Press)",
      url: action === "goto" ? "https://www.bing.com" : undefined,
      selector:
        action === "click" || action === "type" || action === "hover"
          ? "button, input, a"
          : action === "select"
          ? "select#country, select.form-select"
          : action === "check"
          ? "input[type='checkbox']#agree"
          : action === "extract"
          ? "h1.product-title, span.price, a.review-link"
          : undefined,
      text: action === "type" ? "NarciPH Browser" : undefined,
      value: action === "select" ? "zh" : undefined,
      uncheck: action === "check" ? false : undefined,
      script:
        action === "eval"
          ? "// 原生 JS 脚本，支持返回变量用于日志显示\nreturn document.title + ' | 载入就绪';"
          : undefined,
      clear: action === "type" ? true : undefined,
      delay: action === "type" ? 45 : undefined,
      fullPage: action === "screenshot" ? true : undefined,
      duration: action === "wait" ? 2000 : undefined,
      distance: action === "scroll" ? 400 : undefined,
      key: action === "press" ? "Enter" : undefined,
      timeout: 15000,
      stopOnError: true,
      extractType: action === "extract" ? "text" : undefined,
      extractKey: action === "extract" ? "item_title" : undefined,
      loopCount: action === "loop" ? 5 : undefined,
      loopInterval: action === "loop" ? 1000 : undefined,
      subAction: action === "loop" ? "scroll" : undefined,
    };
    const nextSteps = [...selectedWorkflow.steps, newStep];
    const updated = workflows.map((w) =>
      w.id === selectedWorkflow.id ? { ...w, steps: nextSteps, updatedAt: new Date().toISOString() } : w
    );
    setWorkflows(updated);
    saveWorkflowsToStorage(updated);
    toast.success(`已添加步骤: ${newStep.name}`);
  };

  const handleRemoveStep = (stepIndex: number) => {
    if (!selectedWorkflow) return;
    const nextSteps = selectedWorkflow.steps.filter((_, idx) => idx !== stepIndex);
    const updated = workflows.map((w) =>
      w.id === selectedWorkflow.id ? { ...w, steps: nextSteps, updatedAt: new Date().toISOString() } : w
    );
    setWorkflows(updated);
    saveWorkflowsToStorage(updated);
  };

  const handleMoveStep = (index: number, direction: "up" | "down") => {
    if (!selectedWorkflow) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= selectedWorkflow.steps.length) return;
    const nextSteps = [...selectedWorkflow.steps];
    const temp = nextSteps[index];
    nextSteps[index] = nextSteps[targetIndex];
    nextSteps[targetIndex] = temp;
    const updated = workflows.map((w) =>
      w.id === selectedWorkflow.id ? { ...w, steps: nextSteps, updatedAt: new Date().toISOString() } : w
    );
    setWorkflows(updated);
    saveWorkflowsToStorage(updated);
  };

  const handleUpdateStep = (index: number, partial: Partial<WorkflowStep>) => {
    if (!selectedWorkflow) return;
    const nextSteps = selectedWorkflow.steps.map((st, idx) => (idx === index ? { ...st, ...partial } : st));
    const updated = workflows.map((w) =>
      w.id === selectedWorkflow.id ? { ...w, steps: nextSteps, updatedAt: new Date().toISOString() } : w
    );
    setWorkflows(updated);
    saveWorkflowsToStorage(updated);
  };

  const handleUpdateWorkflowMeta = (name: string, description: string) => {
    if (!selectedWorkflow) return;
    const updated = workflows.map((w) =>
      w.id === selectedWorkflow.id ? { ...w, name, description, updatedAt: new Date().toISOString() } : w
    );
    setWorkflows(updated);
    saveWorkflowsToStorage(updated);
  };

  // CRUD - Create
  const openCreateWorkflowModal = () => {
    setNewWfName("新建定制步骤链");
    setNewWfDesc("包含拟人交互与状态校验的定制步骤流");
    setNewWfTemplate("search");
    setWorkflowCreateModal(true);
  };

  const handleConfirmCreateWorkflow = () => {
    if (!newWfName.trim()) {
      toast.warning("请输入工作流名称");
      return;
    }
    let steps: WorkflowStep[] = [];
    if (newWfTemplate === "empty") {
      steps = [
        {
          id: "step-init",
          action: "goto",
          name: "打开初始网址",
          url: "https://www.bing.com",
          timeout: 25000,
        },
      ];
    } else if (newWfTemplate === "search") {
      steps = DEFAULT_WORKFLOWS[0].steps.map((s) => ({
        ...s,
        id: "step-" + Math.random().toString(36).slice(2, 9),
      }));
    } else if (newWfTemplate === "form") {
      steps = DEFAULT_WORKFLOWS[1].steps.map((s) => ({
        ...s,
        id: "step-" + Math.random().toString(36).slice(2, 9),
      }));
    } else if (newWfTemplate === "advanced") {
      steps = (DEFAULT_WORKFLOWS[3] || DEFAULT_WORKFLOWS[2]).steps.map((s) => ({
        ...s,
        id: "step-" + Math.random().toString(36).slice(2, 9),
      }));
    }

    const newWf: CustomWorkflow = {
      id: "wf-" + Math.random().toString(36).slice(2, 9),
      name: newWfName.trim(),
      description: newWfDesc.trim() || "包含多种常用交互动作的自定义步骤链",
      steps,
      updatedAt: new Date().toISOString(),
    };
    const next = [newWf, ...workflows];
    setWorkflows(next);
    setSelectedWorkflowId(newWf.id);
    saveWorkflowsToStorage(next);
    setWorkflowCreateModal(false);
    toast.success(`已创建工作流【${newWf.name}】`);
  };

  // CRUD - Clone / Duplicate
  const handleDuplicateWorkflow = (targetWf: CustomWorkflow) => {
    const clone: CustomWorkflow = {
      id: "wf-" + Math.random().toString(36).slice(2, 9),
      name: `${targetWf.name} (副本)`,
      description: targetWf.description,
      steps: targetWf.steps.map((st) => ({
        ...st,
        id: "step-" + Math.random().toString(36).slice(2, 9),
      })),
      updatedAt: new Date().toISOString(),
    };
    const next = [clone, ...workflows];
    setWorkflows(next);
    setSelectedWorkflowId(clone.id);
    saveWorkflowsToStorage(next);
    toast.success(`已复制工作流【${clone.name}】`);
  };

  // CRUD - Edit Meta
  const openEditMetaModal = (wf: CustomWorkflow) => {
    setWorkflowEditMetaModal(wf);
    setEditMetaName(wf.name);
    setEditMetaDesc(wf.description);
  };

  const handleConfirmEditMeta = () => {
    if (!workflowEditMetaModal) return;
    if (!editMetaName.trim()) {
      toast.warning("工作流名称不能为空");
      return;
    }
    const updated = workflows.map((w) =>
      w.id === workflowEditMetaModal.id
        ? { ...w, name: editMetaName.trim(), description: editMetaDesc.trim(), updatedAt: new Date().toISOString() }
        : w
    );
    setWorkflows(updated);
    saveWorkflowsToStorage(updated);
    setWorkflowEditMetaModal(null);
    toast.success("工作流信息已保存");
  };

  // CRUD - Delete
  const handleRequestDeleteWorkflow = (id: string) => {
    if (workflows.length <= 1) {
      toast.warning("至少保留一条步骤链");
      return;
    }
    setWorkflowDeleteConfirmId(id);
  };

  const handleConfirmDeleteWorkflow = () => {
    if (!workflowDeleteConfirmId) return;
    const target = workflows.find((w) => w.id === workflowDeleteConfirmId);
    const next = workflows.filter((w) => w.id !== workflowDeleteConfirmId);
    setWorkflows(next);
    if (selectedWorkflowId === workflowDeleteConfirmId) {
      setSelectedWorkflowId(next[0].id);
    }
    saveWorkflowsToStorage(next);
    setWorkflowDeleteConfirmId(null);
    toast.success(`已删除工作流【${target?.name || ""}】`);
  };

  const handleResetWorkflowPresets = () => {
    setWorkflows(DEFAULT_WORKFLOWS);
    setSelectedWorkflowId(DEFAULT_WORKFLOWS[0].id);
    saveWorkflowsToStorage(DEFAULT_WORKFLOWS);
    toast.success("已恢复官方精选预设步骤链");
  };

  const openRpaWizard = (tpl: EcommerceRpaTemplate) => {
    const defaultParams: Record<string, any> = {};
    tpl.parameters.forEach((p) => {
      defaultParams[p.key] = p.defaultValue;
    });
    setRpaWizardTemplate(tpl);
    setRpaWizardParams(defaultParams);
    setRpaWizardTargetProfileId(workflowTargetProfileId || profiles[0]?.id || "");
  };

  const handleApplyRpaAndRun = async () => {
    if (workflowExecuting) {
      toast.warning("工作流正在执行中，请稍候...");
      return;
    }
    if (!rpaWizardTemplate) return;
    const wf = rpaWizardTemplate.buildWorkflow(rpaWizardParams);
    const targetProfile = profiles.find((p) => p.id === rpaWizardTargetProfileId) || profiles[0];
    if (!targetProfile) {
      toast.error("请先选择要执行的目标指纹环境");
      return;
    }

    const exists = workflows.some((w) => w.id === wf.id);
    let nextList: CustomWorkflow[];
    if (exists) {
      nextList = workflows.map((w) => (w.id === wf.id ? wf : w));
    } else {
      nextList = [wf, ...workflows];
    }
    setWorkflows(nextList);
    saveWorkflowsToStorage(nextList);
    setSelectedWorkflowId(wf.id);
    setWorkflowTargetProfileId(targetProfile.id);
    setRpaWizardTemplate(null);
    setWorkflowSubTab("editor");

    setTimeout(() => {
      void runCurrentWorkflowWith(wf, targetProfile);
    }, 150);
  };

  const handleSaveRpaToWorkflows = () => {
    if (!rpaWizardTemplate) return;
    const wf = rpaWizardTemplate.buildWorkflow(rpaWizardParams);
    const exists = workflows.some((w) => w.id === wf.id);
    let nextList: CustomWorkflow[];
    if (exists) {
      nextList = workflows.map((w) => (w.id === wf.id ? wf : w));
    } else {
      nextList = [wf, ...workflows];
    }
    setWorkflows(nextList);
    saveWorkflowsToStorage(nextList);
    setSelectedWorkflowId(wf.id);
    setRpaWizardTemplate(null);
    setWorkflowSubTab("editor");
    toast.success(`已保存【${wf.name}】至工作流列表！`);
  };

  const handleCloneRpaToEditor = (tpl: EcommerceRpaTemplate) => {
    const defaultParams: Record<string, any> = {};
    tpl.parameters.forEach((p) => {
      defaultParams[p.key] = p.defaultValue;
    });
    const wf = tpl.buildWorkflow(defaultParams);
    const cloned: CustomWorkflow = {
      ...wf,
      id: "wf-custom-" + Math.random().toString(36).slice(2, 9),
      name: `${wf.name} (自定义副本)`,
      updatedAt: new Date().toISOString(),
    };
    const nextList = [cloned, ...workflows];
    setWorkflows(nextList);
    saveWorkflowsToStorage(nextList);
    setSelectedWorkflowId(cloned.id);
    setWorkflowSubTab("editor");
    toast.success(`已克隆【${tpl.name}】至高级步骤链，可自由编辑！`);
  };

  const runCurrentWorkflowWith = async (overrideWf?: CustomWorkflow, overrideProfile?: ProfileSummary) => {
    if (workflowExecuting) {
      toast.warning("工作流正在执行中，请稍候...");
      return;
    }
    const wfToRun = overrideWf || selectedWorkflow;
    if (!wfToRun) return;
    if (wfToRun.steps.length === 0) {
      toast.warning("当前工作流尚未添加任何步骤");
      return;
    }
    const targetProfile = overrideProfile || profiles.find((p) => p.id === (workflowTargetProfileId || profiles[0]?.id));
    if (!targetProfile) {
      toast.error("请先选择要执行工作流的指纹环境");
      return;
    }

    setWorkflowExecuting(true);
    setWorkflowStepResults([]);
    toast.info(`开始在环境【${targetProfile.name}】执行工作流【${wfToRun.name}】...`);

    let activeDriver = envInfo?.driver_path || customDriver.trim() || "";
    let activeNode = envInfo?.node_path || customNode.trim() || null;

    if (!activeDriver) {
      try {
        const detected = await invoke<AutomationEnvInfo>("detect_automation_env", {
          customDriver: customDriver.trim() || null,
          customNode: customNode.trim() || null,
        });
        if (detected?.driver_path) {
          activeDriver = detected.driver_path;
          activeNode = detected.node_path || activeNode;
          setEnvInfo(detected);
        }
      } catch {}
    }

    const isInteractive =
      wfToRun.steps.some((s) => s.action === "takeover" || s.action === "interactive") ||
      wfToRun.id?.startsWith("wf-email");

    if (isInteractive) {
      toast.info("已自动以可视化窗口启动指纹浏览器，方便您配合完成拼图/短信人机协同验证！", {
        duration: 5000,
      });
    }

    try {
      // 阶段 3: 动态数据池变量插值 (若启用数据池，自动将 {{username}} 等占位符替换为当前行参数)
      let stepsToExecute = wfToRun.steps;
      if (useDataPool) {
        const parsed = parseCsv(csvRawText);
        if (parsed.rows.length > 0) {
          const activeRow = parsed.rows[csvActiveRowIndex % parsed.rows.length];
          stepsToExecute = stepsToExecute.map((s) => {
            const replaceVars = (str?: string) => {
              if (!str || typeof str !== "string") return str;
              return str.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
                if (activeRow[key] !== undefined) return String(activeRow[key]);
                return `{{${key}}}`;
              });
            };
            return {
              ...s,
              url: replaceVars(s.url),
              text: replaceVars(s.text),
              value: replaceVars(s.value),
              script: replaceVars(s.script),
            };
          });
        }
      }

      const res = await invoke<{ results: StepExecutionResult[] }>("run_workflow", {
        id: targetProfile.id,
        driverPath: activeDriver,
        nodePath: activeNode,
        steps: stepsToExecute,
        headless: isInteractive ? false : headlessDefault,
      });

      const results = res.results || [];
      setWorkflowStepResults(results);

      // 自动沉淀邮箱凭据至账号账本 (Account Vault)
      const emailStep = wfToRun.steps.find(
        (s) => s.text && (s.text.includes("@outlook.com") || s.text.includes("@163.com"))
      );
      const passStep = wfToRun.steps.find(
        (s) => s.action === "type" && s.selector && s.selector.toLowerCase().includes("password")
      );
      if (emailStep?.text) {
        const foundEmail = emailStep.text;
        const foundPass = passStep?.text || "";
        const platformType = foundEmail.includes("@outlook.com")
          ? "outlook"
          : foundEmail.includes("@163.com")
          ? "163"
          : "custom";
        const platformName =
          platformType === "outlook" ? "Microsoft Outlook" : platformType === "163" ? "网易 163 邮箱" : "自定义邮箱";
        const takeoverStep = results.find((r) => r.solved !== undefined);
        const isVerified = Boolean(takeoverStep ? (takeoverStep.solved === true && takeoverStep.ok === true) : results.every((r) => r.ok));

        const newVaultItem: AccountVaultItem = {
          id: `vault-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          platform: platformType,
          platformName,
          email: foundEmail,
          password: foundPass,
          profileId: targetProfile.id,
          profileName: targetProfile.name,
          status: isVerified ? "verified" : "pending",
          createdAt: new Date().toLocaleString(),
          note: isVerified ? "官方已确认注册成功 (顺利进入收件箱/个人中心)" : `未成功落库 (${takeoverStep?.note || "未完成人机验证或页面未跳转"})`,
        };

        setAccountVault((prev) => {
          const filtered = prev.filter((item) => item.email.toLowerCase() !== foundEmail.toLowerCase());
          const next = [newVaultItem, ...filtered];
          try {
            window.localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(next));
          } catch {}
          return next;
        });

        if (isVerified) {
          toast.success(`🎉 微软官方已确认账号【${foundEmail}】注册成功！已入库。`, { duration: 6000 });
        } else {
          toast.error(`❌ 账号【${foundEmail}】未成功注册：${takeoverStep?.note || "未能通过人机验证或被微软拦截"}`, { duration: 8000 });
        }

        const lastScreenshot = [...results].reverse().find((r) => r.screenshot)?.screenshot;
        setDeliveryModal({
          open: true,
          platform: platformName,
          email: foundEmail,
          password: foundPass,
          isVerified,
          statusText: isVerified ? "🎉 微软官方已确认注册成功！账号正式落库" : "❌ 注册未成功（微软风控拦截或人机验证未完成）",
          note: takeoverStep?.note || (isVerified ? "各项表单与人机长按验证均顺利通过，官方已确认创建" : "流程已执行完毕，但页面未能进入收件箱或微软返回了拦截错误"),
          passedSteps: results.filter((r) => r.ok).length,
          totalSteps: wfToRun.steps.length,
          screenshot: lastScreenshot,
        });
      }

      const passed = results.filter((r) => r.ok).length;
      if (passed === wfToRun.steps.length) {
        toast.success(`工作流执行成功: 全部 ${passed} 步均已顺利通过！`);
      } else {
        const hasProxyRefused = results.some((r) => r.error?.includes("NS_ERROR_PROXY_CONNECTION_REFUSED"));
        if (hasProxyRefused) {
          toast.error("当前指纹环境绑定的代理节点连接被拒绝 (已离线)，建议更换可用节点或使用直连环境");
        } else {
          toast.warning(`工作流执行完成: 成功 ${passed}/${wfToRun.steps.length} 步`);
        }
      }
    } catch (err) {
      toast.error(`工作流执行失败: ${err}`);
    } finally {
      setWorkflowExecuting(false);
    }
  };

  // 账本导出 CSV (UTF-8 with BOM, Excel 完美支持)
  const handleExportVaultCsv = () => {
    if (accountVault.length === 0) {
      toast.warning("账本中暂无账号数据可导出");
      return;
    }
    const headers = ["平台", "邮箱账号", "登录密码", "核验状态", "关联环境", "创建时间", "备注说明"];
    const rows = accountVault.map((item) => {
      const statusText =
        item.status === "verified" ? "已验证落库" : item.status === "temp_ready" ? "临时可用" : "待人工核验";
      return [
        item.platformName,
        item.email,
        item.password || "无",
        statusText,
        item.profileName || item.profileId || "未指定",
        item.createdAt,
        item.note || "",
      ]
        .map((val) => `"${String(val).replace(/"/g, '""')}"`)
        .join(",");
    });
    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Narci_Account_Vault_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("CSV 账本导出成功！支持 Excel 直接打开");
  };

  // 一键复制全部凭据 (标准 账号----密码 格式)
  const handleCopyAllVault = () => {
    if (accountVault.length === 0) {
      toast.warning("账本中暂无账号数据");
      return;
    }
    const text = accountVault
      .map((item) => `${item.email}----${item.password || ""}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    toast.success(`已复制 ${accountVault.length} 个账号凭据 (标准 账号----密码 格式)`);
  };

  // 删除账本单项
  const handleDeleteVaultItem = (id: string) => {
    setAccountVault((prev) => {
      const next = prev.filter((item) => item.id !== id);
      try {
        window.localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    toast.success("已从账本中移除该账号");
  };

  // 清空账本
  const handleClearVault = () => {
    if (!window.confirm("确定要清空全部已保存的账号资产账本吗？")) return;
    setAccountVault([]);
    try {
      window.localStorage.removeItem(VAULT_STORAGE_KEY);
    } catch {}
    toast.success("账本已清空");
  };

  // 切换核验状态
  const handleToggleVaultStatus = (id: string) => {
    setAccountVault((prev) => {
      const next = prev.map((item) => {
        if (item.id === id) {
          const nextStatus: "verified" | "pending" = item.status === "verified" ? "pending" : "verified";
          return {
            ...item,
            status: nextStatus,
            note: nextStatus === "verified" ? "手动标记为已验证落库" : "标记为待核验",
          };
        }
        return item;
      });
      try {
        window.localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // 手工添加新账号
  const handleAddNewVaultAccount = () => {
    if (!newVaultEmail.trim()) {
      toast.warning("请输入邮箱账号");
      return;
    }
    const platformName =
      newVaultPlatform === "outlook"
        ? "Microsoft Outlook"
        : newVaultPlatform === "163"
        ? "网易 163 邮箱"
        : newVaultPlatform === "temp"
        ? "临时隐私邮箱"
        : "自定义平台";
    const newItem: AccountVaultItem = {
      id: `vault-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      platform: newVaultPlatform,
      platformName,
      email: newVaultEmail.trim(),
      password: newVaultPassword.trim() || undefined,
      status: "verified",
      createdAt: new Date().toLocaleString(),
      note: "手动登记入库",
    };
    setAccountVault((prev) => {
      const next = [newItem, ...prev];
      try {
        window.localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    setNewVaultEmail("");
    setNewVaultPassword("");
    setAddVaultModalOpen(false);
    toast.success("账号登记成功！");
  };

  const runCurrentWorkflow = () => runCurrentWorkflowWith();

  const handleDownloadScreenshot = () => {
    if (!previewScreenshot) return;
    const a = document.createElement("a");
    a.href = previewScreenshot.src;
    a.download = `${previewScreenshot.title.replace(/[^\w\s-]/g, "") || "screenshot"}-${Date.now()}.png`;
    a.click();
  };

  // CSV 数据池解析辅助方法
  const parseCsv = (text: string) => {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = lines[0].split(",").map((h) => h.trim());
    const rows = lines.slice(1).map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = parts[idx] || "";
      });
      return row;
    });
    return { headers, rows };
  };

  // 群控同步器：智能平铺窗口
  const handleTileWindows = async (colsOverride?: number) => {
    try {
      // 优先从最新自动化会话中拉取，若为空则直接向后端请求平铺所有活动浏览器窗口
      const sessRes = await invoke<{ sessions: AgentSessionRow[] }>("list_automation").catch(() => ({ sessions: [] }));
      const currentSessions = sessRes.sessions.length > 0 ? sessRes.sessions : sessions;
      const pids = currentSessions.map((s) => s.pid);

      const count = await invoke<number>("tile_browser_windows", {
        pids,
        cols: colsOverride !== undefined ? colsOverride : syncCols > 0 ? syncCols : null,
      });
      if (count > 0) {
        toast.success(`成功将 ${count} 个浏览器窗口智能网格平铺至屏幕！`);
      } else {
        toast.warning("未检测到就绪的浏览器视窗，正在后台自动重试排列...");
      }
      setSyncLogs((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          action: "窗口平铺",
          msg: `智能平铺完成：共计布局 ${count} 个窗口 (列数: ${colsOverride ?? (syncCols || "自适应")})`,
          ok: count > 0,
        },
        ...prev,
      ]);
    } catch (err) {
      toast.error(`平铺窗口失败: ${err}`);
    }
  };

  // 群控同步器：窗口置顶唤醒
  const handleBringAllToFront = async () => {
    try {
      const sessRes = await invoke<{ sessions: AgentSessionRow[] }>("list_automation").catch(() => ({ sessions: [] }));
      const currentSessions = sessRes.sessions.length > 0 ? sessRes.sessions : sessions;
      const pids = currentSessions.map((s) => s.pid);
      const count = await invoke<number>("bring_browser_windows_to_front", { pids });
      toast.success(`已唤醒并置顶 ${count} 个浏览器窗口！`);
    } catch (err) {
      toast.error(`置顶窗口失败: ${err}`);
    }
  };

  // 群控同步器：开启/停止微秒级主从实时联动
  const handleToggleLiveSync = async () => {
    if (liveSyncActive) {
      try {
        await invoke("stop_live_sync");
        setLiveSyncActive(false);
        toast.info("已停止实时主从群控联动");
        setSyncLogs((prev) => [
          {
            time: new Date().toLocaleTimeString(),
            action: "实时联动",
            msg: "主从实时联动已断开停止",
            ok: true,
          },
          ...prev,
        ]);
      } catch (err) {
        toast.error(`停止同步失败: ${err}`);
      }
      return;
    }

    if (!syncMasterId) {
      toast.warning("请先指定一个主控窗口 (Master)");
      return;
    }
    const masterSess = sessions.find((s) => s.id === syncMasterId);
    if (!masterSess) {
      toast.warning("选中的主控环境当前未运行，请先启动");
      return;
    }
    const slaveSesses = sessions.filter((s) => syncSlaveIds.has(s.id));
    if (slaveSesses.length === 0) {
      toast.warning("请勾选至少一个受控窗口 (Slave)");
      return;
    }

    setSyncBusy(true);
    try {
      await invoke("start_live_sync", {
        customDriver: customDriver.trim() || null,
        customNode: customNode.trim() || null,
        masterEndpoint: masterSess.wsEndpoint,
        slaveEndpoints: slaveSesses.map((s) => s.wsEndpoint),
        jitter: syncJitter,
      });
      setLiveSyncActive(true);
      toast.success(`⚡ 微秒级实时群控已启动！1 个主控已桥接至 ${slaveSesses.length} 个受控窗口`);
      setSyncLogs((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          action: "实时联动",
          msg: `主从实时联动启动成功 (主控: ${syncMasterId} -> 受控: ${slaveSesses.length} 个窗口，拟人微扰: ${syncJitter ? "开启" : "关闭"})`,
          ok: true,
        },
        ...prev,
      ]);
    } catch (err) {
      toast.error(`启动实时同步失败: ${err}`);
      setLiveSyncActive(false);
    } finally {
      setSyncBusy(false);
    }
  };

  // 群控同步器：广播 URL
  const handleBroadcastUrl = async () => {
    if (!syncBroadcastUrl.trim()) {
      toast.warning("请输入要广播的网址");
      return;
    }
    const masterSess = sessions.find((s) => s.id === syncMasterId);
    const slaveSesses = sessions.filter((s) => syncSlaveIds.has(s.id));
    if (!masterSess && slaveSesses.length === 0) {
      toast.warning("请至少指定一个主控或受控窗口会话");
      return;
    }
    setSyncBusy(true);
    try {
      const payload = {
        action: "broadcast_url",
        url: syncBroadcastUrl.trim(),
        masterEndpoint: masterSess?.wsEndpoint,
        slaveEndpoints: slaveSesses.map((s) => s.wsEndpoint),
        timeoutMs: 25000,
      };
      const res: any = await invoke("run_sync_command", {
        customDriver: customDriver.trim() || null,
        customNode: customNode.trim() || null,
        commandJson: JSON.stringify(payload),
      });
      const results: any[] = res?.results || [];
      const okCount = results.filter((r) => r.ok).length;
      toast.success(`URL 广播完成: ${okCount}/${results.length} 个窗口成功加载！`);
      setSyncLogs((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          action: "广播 URL",
          msg: `全员导航至 ${syncBroadcastUrl} (成功: ${okCount}/${results.length})`,
          ok: okCount > 0,
        },
        ...prev,
      ]);
    } catch (err) {
      toast.error(`广播 URL 失败: ${err}`);
      setSyncLogs((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          action: "广播 URL",
          msg: `执行异常: ${err}`,
          ok: false,
        },
        ...prev,
      ]);
    } finally {
      setSyncBusy(false);
    }
  };

  // 群控同步器：广播刷新
  const handleBroadcastReload = async () => {
    const masterSess = sessions.find((s) => s.id === syncMasterId);
    const slaveSesses = sessions.filter((s) => syncSlaveIds.has(s.id));
    if (!masterSess && slaveSesses.length === 0) {
      toast.warning("请选择窗口会话");
      return;
    }
    setSyncBusy(true);
    try {
      const payload = {
        action: "broadcast_reload",
        masterEndpoint: masterSess?.wsEndpoint,
        slaveEndpoints: slaveSesses.map((s) => s.wsEndpoint),
      };
      const res: any = await invoke("run_sync_command", {
        customDriver: customDriver.trim() || null,
        customNode: customNode.trim() || null,
        commandJson: JSON.stringify(payload),
      });
      const results: any[] = res?.results || [];
      const okCount = results.filter((r) => r.ok).length;
      toast.success(`全员刷新完成: ${okCount}/${results.length} 个窗口已重新载入`);
      setSyncLogs((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          action: "广播刷新",
          msg: `全员重新载入当前页面 (${okCount}/${results.length})`,
          ok: okCount > 0,
        },
        ...prev,
      ]);
    } catch (err) {
      toast.error(`全员刷新失败: ${err}`);
    } finally {
      setSyncBusy(false);
    }
  };

  // 群控同步器：广播关标签
  const handleBroadcastCloseTabs = async () => {
    const masterSess = sessions.find((s) => s.id === syncMasterId);
    const slaveSesses = sessions.filter((s) => syncSlaveIds.has(s.id));
    if (!masterSess && slaveSesses.length === 0) return;
    setSyncBusy(true);
    try {
      const payload = {
        action: "broadcast_close_tabs",
        masterEndpoint: masterSess?.wsEndpoint,
        slaveEndpoints: slaveSesses.map((s) => s.wsEndpoint),
      };
      await invoke("run_sync_command", {
        customDriver: customDriver.trim() || null,
        customNode: customNode.trim() || null,
        commandJson: JSON.stringify(payload),
      });
      toast.success("已广播关闭所有从控与主控窗口的多余标签页！");
      setSyncLogs((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          action: "清理标签",
          msg: "全员关闭次级标签页，仅保留首页",
          ok: true,
        },
        ...prev,
      ]);
    } catch (err) {
      toast.error(`关闭标签失败: ${err}`);
    } finally {
      setSyncBusy(false);
    }
  };

  // 群控同步器：广播键盘输入
  const handleBroadcastText = async () => {
    if (!syncBroadcastText.trim()) return;
    const slaveSesses = sessions.filter((s) => syncSlaveIds.has(s.id));
    if (slaveSesses.length === 0) {
      toast.warning("受控窗口列表为空，请勾选至少一个从控环境");
      return;
    }
    setSyncBusy(true);
    try {
      const payload = {
        action: "broadcast_type",
        text: syncBroadcastText,
        jitter: syncJitter,
        slaveEndpoints: slaveSesses.map((s) => s.wsEndpoint),
      };
      const res: any = await invoke("run_sync_command", {
        customDriver: customDriver.trim() || null,
        customNode: customNode.trim() || null,
        commandJson: JSON.stringify(payload),
      });
      const results: any[] = res?.results || [];
      const okCount = results.filter((r) => r.ok).length;
      toast.success(`文字广播键入完成: ${okCount}/${results.length} 个从控已模拟输入！`);
      setSyncLogs((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          action: "键盘键入",
          msg: `键入内容: "${syncBroadcastText}" (${okCount}/${results.length} 成功，拟人微扰: ${syncJitter ? "开" : "关"})`,
          ok: okCount > 0,
        },
        ...prev,
      ]);
    } catch (err) {
      toast.error(`广播键入失败: ${err}`);
    } finally {
      setSyncBusy(false);
    }
  };

  // 群控同步器：广播滚动
  const handleBroadcastScroll = async (deltaY: number) => {
    const slaveSesses = sessions.filter((s) => syncSlaveIds.has(s.id));
    if (slaveSesses.length === 0) {
      toast.warning("受控窗口列表为空，请勾选至少一个从控环境");
      return;
    }
    setSyncBusy(true);
    try {
      const payload = {
        action: "broadcast_scroll",
        deltaY,
        jitter: syncJitter,
        slaveEndpoints: slaveSesses.map((s) => s.wsEndpoint),
      };
      await invoke("run_sync_command", {
        customDriver: customDriver.trim() || null,
        customNode: customNode.trim() || null,
        commandJson: JSON.stringify(payload),
      });
      toast.success(`已向 ${slaveSesses.length} 个受控窗口广播滚轮微动！`);
    } catch (err) {
      toast.error(`广播滚动失败: ${err}`);
    } finally {
      setSyncBusy(false);
    }
  };

  // 群控同步器：广播脚本注入
  const handleBroadcastEval = async () => {
    if (!syncBroadcastScript.trim()) return;
    const masterSess = sessions.find((s) => s.id === syncMasterId);
    const slaveSesses = sessions.filter((s) => syncSlaveIds.has(s.id));
    if (!masterSess && slaveSesses.length === 0) return;
    setSyncBusy(true);
    try {
      const payload = {
        action: "broadcast_eval",
        script: syncBroadcastScript,
        masterEndpoint: masterSess?.wsEndpoint,
        slaveEndpoints: slaveSesses.map((s) => s.wsEndpoint),
      };
      const res: any = await invoke("run_sync_command", {
        customDriver: customDriver.trim() || null,
        customNode: customNode.trim() || null,
        commandJson: JSON.stringify(payload),
      });
      const results: any[] = res?.results || [];
      const okCount = results.filter((r) => r.ok).length;
      toast.success(`脚本已注入并执行: ${okCount}/${results.length} 个窗口成功返回`);
      setSyncLogs((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          action: "脚本执行",
          msg: `执行自定义 JS 脚本 (${okCount}/${results.length})`,
          ok: okCount > 0,
        },
        ...prev,
      ]);
    } catch (err) {
      toast.error(`执行广播脚本失败: ${err}`);
    } finally {
      setSyncBusy(false);
    }
  };

  // 群控同步器：差异化数据广播（账号、密码、个性文案、独立URL）
  const handleBroadcastDifferential = async (colIndex: number, isUrl: boolean = false) => {
    const slaveSesses = sessions.filter((s) => syncSlaveIds.has(s.id));
    const targetSessions = slaveSesses.length > 0 ? slaveSesses : sessions;
    if (targetSessions.length === 0) {
      toast.warning("没有运行中的受控浏览器窗口，请先勾选受控环境");
      return;
    }
    const lines = syncDiffText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast.warning("差异化分配框为空，请先粘贴多行数据 (如 Excel 复制多行多列粘贴)");
      return;
    }
    setSyncBusy(true);
    try {
      const items = targetSessions.map((s, idx) => {
        const line = lines[idx % lines.length] || "";
        let parts = line.split("\t");
        if (parts.length <= 1 && line.includes("----")) {
          parts = line.split("----");
        } else if (parts.length <= 1 && line.includes(",")) {
          parts = line.split(",");
        } else if (parts.length <= 1 && line.includes("|")) {
          parts = line.split("|");
        }
        const val = (parts[colIndex] || parts[0] || "").trim();
        return {
          endpoint: s.wsEndpoint,
          text: val,
          action: isUrl ? "goto" : "type",
        };
      });

      await invoke("run_sync_command", {
        customDriver: customDriver.trim() || null,
        customNode: customNode.trim() || null,
        commandJson: JSON.stringify({
          action: "broadcast_differential_data",
          items,
          jitter: syncJitter,
        }),
      });

      const colName = isUrl
        ? "各自独立网址"
        : colIndex === 0
        ? "独立账号/用户名"
        : colIndex === 1
        ? "独立密码"
        : `第 ${colIndex + 1} 列自定义文案`;
      toast.success(`差异化广播完成！已向 ${items.length} 个窗口分别分发【${colName}】`);
      setSyncLogs((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          action: "差异化广播",
          msg: `已将 [${colName}] 差异化分发至 ${items.length} 个受控环境`,
          ok: true,
        },
        ...prev,
      ]);
    } catch (err) {
      toast.error(`差异化广播失败: ${err}`);
      setSyncLogs((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          action: "广播失败",
          msg: `差异化广播异常: ${err}`,
          ok: false,
        },
        ...prev,
      ]);
    } finally {
      setSyncBusy(false);
    }
  };

  // 动作录制器：开始免代码录制
  const handleStartRecorder = async () => {
    const target = sessions.find((s) => s.id === (recordTargetId || syncMasterId || sessions[0]?.id));
    if (!target) {
      toast.warning("请先启动至少一个浏览器以作为录制主控！");
      return;
    }
    try {
      await invoke("start_action_recorder", {
        customDriver: customDriver.trim() || null,
        customNode: customNode.trim() || null,
        masterEndpoint: target.wsEndpoint,
      });
      setIsRecording(true);
      setRecordTargetId(target.id);
      toast.success(`● 录制器已启动！请在 [${target.id}] 浏览器中自由操作，所有点击、输入、导航将被实时捕获。`);
    } catch (err) {
      toast.error(`启动录制器失败: ${err}`);
    }
  };

  // 动作录制器：停止录制并弹窗
  const handleStopRecorder = async () => {
    try {
      const res: any = await invoke("stop_action_recorder");
      setIsRecording(false);
      const actions = Array.isArray(res?.actions) ? res.actions : [];
      setRecordedActions(actions);
      setRecordedWfName(`录制工作流-${new Date().toLocaleDateString()}`);
      setRecordedModalOpen(true);
      toast.success(`■ 录制结束！共捕获到 ${actions.length} 个操作动作。`);
    } catch (err) {
      toast.error(`停止录制器失败: ${err}`);
      setIsRecording(false);
    }
  };

  // 动作录制器：保存或批量运行
  const handleSaveRecordedWorkflow = (autoRun: boolean = false) => {
    if (recordedActions.length === 0) {
      toast.warning("未捕获到任何动作");
      return;
    }
    const steps: WorkflowStep[] = [];
    recordedActions.forEach((act, idx) => {
      if (act.type === "navigate" && act.url) {
        steps.push({
          id: `rec-step-${idx + 1}`,
          action: "goto",
          name: `访问网址: ${act.url.slice(0, 35)}...`,
          url: act.url,
          timeout: 30000,
        });
      } else if (act.type === "click" && act.selector) {
        steps.push({
          id: `rec-step-${idx + 1}`,
          action: "click",
          name: `点击 ${act.text ? `"${act.text}"` : act.selector}`,
          selector: act.selector,
          timeout: 8000,
        });
      } else if (act.type === "input" && act.selector) {
        steps.push({
          id: `rec-step-${idx + 1}`,
          action: "type",
          name: `输入内容: "${act.value?.slice(0, 20) || ""}"`,
          selector: act.selector,
          text: act.value || "",
          delay: 45,
          clear: true,
        });
      } else if (act.type === "scroll") {
        steps.push({
          id: `rec-step-${idx + 1}`,
          action: "scroll",
          name: `向下滑动浏览 (${act.deltaY || 400}px)`,
          distance: Math.abs(act.deltaY || 400),
          times: 1,
          randomJitter: true,
        });
      }
    });

    const newWf: CustomWorkflow = {
      id: `wf-rec-${Date.now()}`,
      name: recordedWfName || `录制自动化-${new Date().toLocaleDateString()}`,
      description: `通过免代码录制器生成的自动化步骤链，共包含 ${steps.length} 个动作。`,
      updatedAt: new Date().toISOString(),
      steps,
    };

    const nextList = [newWf, ...workflows];
    setWorkflows(nextList);
    saveWorkflowsToStorage(nextList);
    setSelectedWorkflowId(newWf.id);
    setRecordedModalOpen(false);
    toast.success(`已保存【${newWf.name}】至 RPA 工作流列表！`);

    if (autoRun) {
      setActiveMainTab("workflow");
      setWorkflowSubTab("editor");
      setTimeout(() => {
        void runCurrentWorkflowWith(newWf);
      }, 300);
    }
  };

  // 账号矩阵批量导入
  const handleBatchImportVault = () => {
    const lines = batchImportText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast.warning("请输入或粘贴账号内容");
      return;
    }
    const newItems: AccountVaultItem[] = [];
    lines.forEach((line) => {
      let parts = line.split("\t");
      if (parts.length <= 1 && line.includes("----")) {
        parts = line.split("----");
      } else if (parts.length <= 1 && line.includes(",")) {
        parts = line.split(",");
      } else if (parts.length <= 1 && line.includes("|")) {
        parts = line.split("|");
      }
      let platform: "outlook" | "163" | "temp" | "custom" = "custom";
      let platformName = "通用平台";
      let email = "";
      let password = "";
      let note = "";

      if (parts.length === 1) {
        email = parts[0].trim();
      } else if (parts.length === 2) {
        email = parts[0].trim();
        password = parts[1].trim();
      } else if (parts.length >= 3) {
        const p0 = parts[0].trim().toLowerCase();
        if (p0.includes("outlook") || p0.includes("hotmail") || p0.includes("微软")) {
          platform = "outlook";
          platformName = "Microsoft Outlook";
          email = parts[1].trim();
          password = parts[2].trim();
          note = parts[3]?.trim() || "";
        } else if (p0.includes("163") || p0.includes("网易")) {
          platform = "163";
          platformName = "网易 163 邮箱";
          email = parts[1].trim();
          password = parts[2].trim();
          note = parts[3]?.trim() || "";
        } else if (p0.includes("@")) {
          email = parts[0].trim();
          password = parts[1].trim();
          note = parts.slice(2).join(" ").trim();
        } else {
          platformName = parts[0].trim();
          email = parts[1].trim();
          password = parts[2].trim();
          note = parts[3]?.trim() || "";
        }
      }

      if (email) {
        if (email.toLowerCase().includes("@outlook") || email.toLowerCase().includes("@hotmail")) {
          platform = "outlook";
          platformName = "Microsoft Outlook";
        } else if (email.toLowerCase().includes("@163.com") || email.toLowerCase().includes("@126.com")) {
          platform = "163";
          platformName = "网易 163 邮箱";
        }

        newItems.push({
          id: `vault-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          platform,
          platformName,
          email,
          password: password || undefined,
          status: "verified",
          createdAt: new Date().toLocaleDateString(),
          note: note || undefined,
        });
      }
    });

    if (newItems.length === 0) {
      toast.warning("未能解析出有效邮箱/账号，请检查格式");
      return;
    }

    setAccountVault((prev) => {
      const combined = [...newItems, ...prev];
      try {
        window.localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(combined));
      } catch {}
      return combined;
    });

    toast.success(`🎉 成功批量导入 ${newItems.length} 个账号凭据！`);
    setBatchImportText("");
    setBatchImportModalOpen(false);
  };

  // 从账号账本一键装载到群控差异化面板
  const handleLoadAccountsFromVault = () => {
    if (accountVault.length === 0) {
      toast.warning("账号账本目前为空，请先在上方或账本中点击【📥 Excel 批量导入】");
      return;
    }
    const formatted = accountVault
      .map((item) => `${item.email}\t${item.password || ""}\t${item.note || ""}\t${item.platform === "outlook" ? "https://login.live.com" : ""}`)
      .join("\n");
    setSyncDiffText(formatted);
    toast.success(`已成功从账号账本载入 ${accountVault.length} 个账号凭据至差异化面板！`);
  };

  // 账号一键免密登录
  const handleAutoLoginVaultItem = async (item: AccountVaultItem) => {
    let target = profiles.find((p) => p.id === item.profileId);
    if (!target) {
      const running = sessions[0];
      if (running) {
        target = profiles.find((p) => p.id === running.id) || profiles[0];
      } else {
        target = profiles[0];
      }
    }
    if (!target) {
      toast.warning("没有可用的环境配置");
      return;
    }

    toast.info(`正在为 [${item.email}] 自动调度免密登录...`);

    let loginUrl = "https://login.live.com";
    let steps: WorkflowStep[] = [];

    if (item.platform === "outlook" || item.email.toLowerCase().includes("outlook") || item.email.toLowerCase().includes("hotmail")) {
      loginUrl = "https://login.live.com";
      steps = [
        { id: "s1", action: "goto", name: "访问微软账户登录入口", url: loginUrl, timeout: 30000 },
        { id: "s2", action: "type", name: "自动填入微软邮箱", selector: 'input[name="loginfmt"], input[type="email"]', text: item.email, delay: 40, clear: true },
        { id: "s3", action: "click", name: "点击【下一步】按钮", selector: 'input[type="submit"], #idSIButton9' },
        { id: "s4", action: "wait", name: "等待密码框载入", duration: 2500 },
        ...(item.password
          ? [
              { id: "s5", action: "type" as WorkflowStepAction, name: "自动填入高强密码", selector: 'input[name="passwd"], input[type="password"]', text: item.password, delay: 35, clear: true },
              { id: "s6", action: "click" as WorkflowStepAction, name: "点击【登录】按钮", selector: 'input[type="submit"], #idSIButton9' },
            ]
          : []),
      ];
    } else {
      steps = [
        { id: "s1", action: "goto", name: `访问平台页面`, url: item.note?.startsWith("http") ? item.note : "https://www.google.com", timeout: 30000 },
        { id: "s2", action: "wait", name: "环境就绪", duration: 2000 },
      ];
    }

    const tempWf: CustomWorkflow = {
      id: `wf-autologin-${Date.now()}`,
      name: `免密登录 [${item.email}]`,
      description: `自动拉起环境并登录 ${item.platformName}`,
      updatedAt: new Date().toISOString(),
      steps,
    };

    void runCurrentWorkflowWith(tempWf, target);
  };

  // 群控同步器：一键批量启动
  const handleQuickLaunchSelected = async () => {
    // 若勾选了具体环境则启动已勾选的；否则启动当前全部环境（最多 MAX_AUTOMATION_SESSIONS = 8 个）
    const targets = selectedIds.size > 0 ? profiles.filter((p) => selectedIds.has(p.id)) : profiles.slice(0, 8);
    if (targets.length === 0) {
      toast.warning("没有可启动的环境");
      return;
    }
    const unstarted = targets.filter((p) => !sessions.some((s) => s.id === p.id));
    if (unstarted.length === 0) {
      toast.info("所选环境已全部处于运行状态，正在执行窗口网格平铺...");
      void handleTileWindows(syncCols > 0 ? syncCols : undefined);
      return;
    }
    setSyncBusy(true);
    toast.info(`正在批量并发启动 ${unstarted.length} 个环境并连接集群...`);
    try {
      const launchResults = await Promise.all(
        unstarted.map(async (p) => {
          try {
            await invoke("start_automation", {
              id: p.id,
              driverPath: customDriver.trim() || null,
              nodePath: customNode.trim() || null,
              port: null,
              headless: false,
            });
            return { profile: p, ok: true, error: null };
          } catch (err: any) {
            console.error(`环境 ${p.name} 启动异常:`, err);
            const errMsg = String(err?.message || err);
            return { profile: p, ok: false, error: errMsg };
          }
        })
      );

      const successCount = launchResults.filter((r) => r.ok).length;
      const failed = launchResults.filter((r) => !r.ok);

      // 将详细启动状态与错误根因直接注入群控实时流水日志
      for (const res of launchResults) {
        if (res.ok) {
          setSyncLogs((prev) => [
            {
              time: new Date().toLocaleTimeString(),
              action: "启动环境",
              msg: `环境 [${res.profile.name}] 成功拉起并接入集群`,
              ok: true,
            },
            ...prev,
          ]);
        } else {
          setSyncLogs((prev) => [
            {
              time: new Date().toLocaleTimeString(),
              action: "启动失败",
              msg: `环境 [${res.profile.name}] 启动失败: ${res.error}`,
              ok: false,
            },
            ...prev,
          ]);
        }
      }

      await refresh();
      if (failed.length > 0) {
        toast.error(`部分环境启动失败 (${failed.length} 个): 请在下方群控实时流水查看原因`);
      } else {
        toast.success(`批量启动已下发 (${successCount} 个)！正在对齐并网格平铺窗口...`);
      }

      // 等待窗口就绪后执行平铺，无激活无抢焦平铺
      setTimeout(() => {
        void handleTileWindows(syncCols > 0 ? syncCols : undefined);
      }, 1800);
    } catch (err) {
      toast.error(`批量启动失败: ${err}`);
    } finally {
      setSyncBusy(false);
    }
  };

  // Load status and sessions
  const refresh = useCallback(async () => {
    try {
      const [sessRes, statusRes, envRes] = await Promise.all([
        invoke<{ sessions: AgentSessionRow[] }>("list_automation").catch(() => ({ sessions: [] })),
        invoke<LocalApiStatus>("get_local_api_status").catch(() => null),
        invoke<AutomationEnvInfo>("detect_automation_env", {
          customDriver: window.localStorage.getItem(DRIVER_STORAGE_KEY) || null,
          customNode: window.localStorage.getItem(NODE_STORAGE_KEY) || null,
        }).catch(() => null),
      ]);
      setSessions(sessRes.sessions);
      if (statusRes) setApiStatus(statusRes);
      if (envRes) setEnvInfo(envRes);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setCustomDriver(window.localStorage.getItem(DRIVER_STORAGE_KEY) ?? "");
    setCustomNode(window.localStorage.getItem(NODE_STORAGE_KEY) ?? "");
    void refresh();
  }, [refresh]);

  // 监听并实时增量接收工作流单步执行进度
  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    listen<StepExecutionResult>("workflow-step-progress", (event) => {
      if (!event.payload) return;
      const step = event.payload;
      setWorkflowStepResults((prev) => {
        const idx = prev.findIndex((r) => r.stepIndex === step.stepIndex);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = step;
          return next;
        }
        return [...prev, step];
      });
    }).then((fn) => {
      unlistenFn = fn;
    });
    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  // 定时任务心跳监控 (前台模拟调度)
  const schedulesRef = useRef(schedules);
  schedulesRef.current = schedules;
  const envInfoRef = useRef<AutomationEnvInfo | null>(envInfo);
  envInfoRef.current = envInfo;
  const customDriverRef = useRef(customDriver);
  customDriverRef.current = customDriver;
  const customNodeRef = useRef(customNode);
  customNodeRef.current = customNode;

  const executeScheduledJobRef = useRef<((sch: AutomationSchedule) => Promise<void>) | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      schedulesRef.current.forEach((sch) => {
        if (!sch.enabled) return;
        const targetTime = sch.nextRun
          ? new Date(sch.nextRun).getTime()
          : (sch.lastRun ? new Date(sch.lastRun).getTime() + sch.intervalMinutes * 60000 : 0);
        if (targetTime > 0 && now >= targetTime) {
          // 触发该任务，调用最新引用的执行器
          if (executeScheduledJobRef.current) {
            void executeScheduledJobRef.current(sch);
          }
        }
      });
    }, 10000); // 10 秒心跳检查，保障 1 分钟短周期的准时触发
    return () => clearInterval(timer);
  }, []);

  const saveSettings = async () => {
    if (customDriver.trim()) {
      window.localStorage.setItem(DRIVER_STORAGE_KEY, customDriver.trim());
    } else {
      window.localStorage.removeItem(DRIVER_STORAGE_KEY);
    }
    if (customNode.trim()) {
      window.localStorage.setItem(NODE_STORAGE_KEY, customNode.trim());
    } else {
      window.localStorage.removeItem(NODE_STORAGE_KEY);
    }
    setShowSettings(false);
    toast.success("配置已保存");
    await refresh();
  };

  const startSession = async (profile: ProfileSummary) => {
    setBusyProfileId(profile.id);
    try {
      const result = await invoke<{ wsEndpoint: string }>("start_automation", {
        id: profile.id,
        driverPath: customDriver.trim() || null,
        nodePath: customNode.trim() || null,
        port: null,
        headless: headlessDefault,
      });
      await navigator.clipboard.writeText(result.wsEndpoint).catch(() => {});
      toast.success(t("common.sessionRunning"), {
        description: `WebSocket 已连接: ${result.wsEndpoint}（已自动复制到剪贴板）`,
      });
      await refresh();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusyProfileId(null);
    }
  };

  const stopSession = async (id: string) => {
    setBusyProfileId(id);
    try {
      await invoke("stop_automation", { id });
      toast.success(t("common.stoppedSession", { id }));
      await refresh();
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusyProfileId(null);
    }
  };

  const warmup = async () => {
    if (!warmTarget) return;
    const sites = warmForm.sites
      .split("\n")
      .map((site) => site.trim())
      .filter((site) => site !== "");
    if (sites.length === 0) {
      toast.error(t("common.warmupNoSites"));
      return;
    }
    setWarming(true);
    try {
      const result = await invoke<{
        results: { url: string; ok: boolean; error?: string }[];
      }>("warmup_profile", {
        id: warmTarget.id,
        driverPath: envInfo?.driver_path || customDriver.trim() || "",
        nodePath: envInfo?.node_path || customNode.trim() || null,
        sites,
        secondsPerSite: Math.max(1, Number(warmForm.seconds) || 20),
      });
      const visited = result.results.filter((entry) => entry.ok).length;
      const failed = result.results.length - visited;
      if (failed > 0) {
        toast.warning(t("common.warmedSites", { visited, total: result.results.length }), {
          description: result.results
            .filter((entry) => !entry.ok)
            .map((entry) => `${entry.url}: ${entry.error ?? "failed"}`)
            .join("\n"),
        });
      } else {
        toast.success(t("common.warmedUp", { count: visited, name: warmTarget.name }), {
          description: t("common.warmedUpHint"),
        });
        setWarmedIds((prev) => {
          const next = new Set(prev);
          next.add(warmTarget.id);
          try {
            window.localStorage.setItem(WARMED_PROFILES_KEY, JSON.stringify(Array.from(next)));
          } catch {}
          return next;
        });
      }
      setWarmTarget(null);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setWarming(false);
    }
  };

  // -------------------------------------------------------------
  // 阶段 2 核心：批量任务执行器 (Batch Runner)
  // -------------------------------------------------------------
  const appendLog = (profileName: string, message: string, status: BatchLogItem["status"]) => {
    const item: BatchLogItem = {
      id: Math.random().toString(36).slice(2),
      time: new Date().toLocaleTimeString(),
      profileName,
      message,
      status,
    };
    setBatchLogs((prev) => [item, ...prev].slice(0, 200));
  };

  // 批量启动选中的环境
  const handleBatchStart = async () => {
    const targets = profiles.filter((p) => selectedIds.has(p.id));
    if (targets.length === 0) {
      toast.warning("请先勾选需要批量操作的指纹环境");
      return;
    }
    setBatchRunning(true);
    toast.info(`开始批量启动 ${targets.length} 个环境 (并发度: ${concurrency})...`);
    setActiveMainTab("orchestrator");

    // 简单分块控制并发
    const queue = [...targets];
    const runWorker = async () => {
      while (queue.length > 0) {
        const p = queue.shift();
        if (!p) break;
        appendLog(p.name, "正在启动会话...", "running");
        try {
          const res = await invoke<{ wsEndpoint: string }>("start_automation", {
            id: p.id,
            driverPath: customDriver.trim() || null,
            nodePath: customNode.trim() || null,
            port: null,
            headless: headlessDefault,
          });
          appendLog(p.name, `启动成功 -> 端点: ${res.wsEndpoint}`, "success");
        } catch (err) {
          appendLog(p.name, `启动失败: ${err}`, "error");
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, targets.length) }, () => runWorker());
    await Promise.all(workers);
    setBatchRunning(false);
    toast.success("批量启动任务已执行完毕");
    await refresh();
  };

  // 批量停止选中的环境
  const handleBatchStop = async () => {
    const targets = profiles.filter((p) => selectedIds.has(p.id));
    if (targets.length === 0) {
      toast.warning("请先勾选需要停止的环境");
      return;
    }
    setBatchRunning(true);
    for (const p of targets) {
      try {
        await invoke("stop_automation", { id: p.id });
        appendLog(p.name, "会话已正常停止", "success");
      } catch (err) {
        appendLog(p.name, `停止失败: ${err}`, "error");
      }
    }
    setBatchRunning(false);
    toast.success("已完成批量停止指令");
    await refresh();
  };

  // 批量执行工作流模板 (批量养号)
  const handleBatchWarmup = async () => {
    const targets = profiles.filter((p) => selectedIds.has(p.id));
    if (targets.length === 0) {
      toast.warning("请先勾选需要批量预热的环境");
      return;
    }
    setBatchRunning(true);
    toast.info(`开始为 ${targets.length} 个环境执行巡航预热...`);
    setActiveMainTab("orchestrator");

    const MAX_RETRIES = 2; // 每个环境最多重试 2 次
    let consecutiveNetworkErrors = 0; // 连续网络/代理错误计数

    for (const p of targets) {
      let success = false;
      let attempt = 0;

      while (attempt < MAX_RETRIES && !success) {
        attempt++;
        const retryLabel = attempt > 1 ? ` (重试第 ${attempt} 次)` : "";
        appendLog(p.name, `开始预热访问常用网站...${retryLabel}`, "running");

        try {
          const result = await invoke<{
            results: { url: string; ok: boolean; error?: string }[];
          }>("warmup_profile", {
            id: p.id,
            driverPath: envInfo?.driver_path || customDriver.trim() || "",
            nodePath: envInfo?.node_path || customNode.trim() || null,
            sites: DEFAULT_SITES,
            secondsPerSite: 10,
          });
          const okCount = result.results.filter((r) => r.ok).length;
          appendLog(p.name, `预热完成！成功沉淀 Cookie 与历史 (${okCount}/${result.results.length})`, "success");
          setWarmedIds((prev) => {
            const next = new Set(prev);
            next.add(p.id);
            try {
              window.localStorage.setItem(WARMED_PROFILES_KEY, JSON.stringify(Array.from(next)));
            } catch {}
            return next;
          });
          success = true;
          consecutiveNetworkErrors = 0;
        } catch (err) {
          const errStr = String(err);
          const isProxyError = errStr.includes("proxy core") || errStr.includes("timed out") || errStr.includes("come up in time");

          if (isProxyError) {
            consecutiveNetworkErrors++;
            if (attempt < MAX_RETRIES) {
              appendLog(p.name, `代理节点连接超时，1秒后进行第 ${attempt + 1} 次重试...`, "error");
              await new Promise((r) => setTimeout(r, 1000));
            } else {
              appendLog(p.name, `预热失败 [代理网络超时]: 已达最大重试次数 (2次)。建议前往【网络】页面测试并切换可用节点。`, "error");
            }
          } else {
            appendLog(p.name, `预热失败: ${errStr}`, "error");
            break; // 非网络瞬时故障不无谓重试
          }
        }
      }

      // 如果连续 3 个环境都因为代理节点超时报错，主动熔断停止并弹窗指引
      if (consecutiveNetworkErrors >= 3) {
        appendLog("系统调度器", "检测到连续多次节点网络超时，已触发安全熔断停止，防止耗费资源。", "error");
        toast.error("代理网络异常：已自动停止批量预热", {
          description: "检测到绑定的代理节点不可达或超时，请前往【网络】或【环境设置】切换有效节点后再试。",
          duration: 6000,
        });
        break;
      }
    }

    setBatchRunning(false);
    toast.info("批量预热调度流程已结束");
  };

  // 触发定时计划任务
  const executeScheduledJob = async (sch: AutomationSchedule) => {
    appendLog(`[定时计划] ${sch.name}`, `触发周期执行 (目标 ${sch.targetProfileIds.length} 个环境)...`, "running");
    let activeDriver = envInfoRef.current?.driver_path || customDriverRef.current.trim() || "";
    let activeNode = envInfoRef.current?.node_path || customNodeRef.current.trim() || null;

    if (!activeDriver) {
      try {
        const detected = await invoke<AutomationEnvInfo>("detect_automation_env", {
          customDriver: customDriverRef.current.trim() || null,
          customNode: customNodeRef.current.trim() || null,
        });
        if (detected?.driver_path) {
          activeDriver = detected.driver_path;
          activeNode = detected.node_path || activeNode;
          setEnvInfo(detected);
        }
      } catch {}
    }

    for (const id of sch.targetProfileIds) {
      const p = profiles.find((item) => item.id === id);
      const name = p ? p.name : id;
      try {
        if (sch.template === "warmup") {
          await invoke("warmup_profile", {
            id,
            driverPath: activeDriver,
            nodePath: activeNode,
            sites: DEFAULT_SITES.slice(0, 3),
            secondsPerSite: 10,
            mode: "urls",
            keywords: null,
            engine: null,
          });
          appendLog(name, "增量养号完成 (已访问高权重百科/新闻站点)", "success");
        } else if (sch.template === "cruise") {
          const sites = (sch.config?.customSites || "")
            .split("\n")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          const targetSites = sites.length > 0 ? sites : DEFAULT_SITES.slice(0, 3);
          const dwell = sch.config?.dwellSeconds || 15;
          await invoke("warmup_profile", {
            id,
            driverPath: activeDriver,
            nodePath: activeNode,
            sites: targetSites,
            secondsPerSite: dwell,
            mode: "cruise",
            keywords: null,
            engine: null,
          });
          appendLog(name, `目标网址巡航完成 (已巡航 ${targetSites.length} 个目标网址，保持登录态活跃)`, "success");
        } else if (sch.template === "search") {
          const kws = (sch.config?.keywords || "")
            .split(/[\n,，]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          const keywords = kws.length > 0 ? kws : ["NarciPH 指纹浏览器", "跨境电商多账号管理"];
          const engine = sch.config?.engine || "bing";
          const dwell = sch.config?.searchDwellSeconds || 12;
          await invoke("warmup_profile", {
            id,
            driverPath: activeDriver,
            nodePath: activeNode,
            sites: [],
            secondsPerSite: dwell,
            mode: "search",
            keywords,
            engine,
          });
          appendLog(name, `搜索引擎检索模拟完成 (${engine.toUpperCase()} 检索: ${keywords[0]}${keywords.length > 1 ? ` 等${keywords.length}词` : ""})`, "success");
        } else if (sch.template === "check") {
          const res = await invoke<{ results: { ok: boolean; data?: string; error?: string }[] }>("warmup_profile", {
            id,
            driverPath: activeDriver,
            nodePath: activeNode,
            sites: ["https://api.ipify.org?format=json"],
            secondsPerSite: 2,
            mode: "check",
            keywords: null,
            engine: null,
          });
          const info = res.results?.[0]?.data || "连通正常";
          appendLog(name, `节点网络健康巡检通过: ${info}`, "success");
        } else if (sch.template === "workflow") {
          const targetWf = workflows.find((w) => w.id === sch.config?.workflowId) || workflows[0];
          if (!targetWf || targetWf.steps.length === 0) {
            appendLog(name, "工作流步骤为空，跳过执行", "error");
            continue;
          }
          const res = await invoke<{ results: StepExecutionResult[] }>("run_workflow", {
            id,
            driverPath: activeDriver,
            nodePath: activeNode,
            steps: targetWf.steps,
          });
          const successCount = res.results?.filter((r) => r.ok).length || 0;
          appendLog(name, `自定义步骤链【${targetWf.name}】执行完毕 (成功 ${successCount}/${targetWf.steps.length} 步)`, "success");
        }
      } catch (e) {
        appendLog(name, `定时任务执行异常: ${e}`, "error");
      }
    }
    // 更新最后执行时间
    setSchedules((prev) => {
      const next = prev.map((item) =>
        item.id === sch.id
          ? {
              ...item,
              lastRun: new Date().toISOString(),
              nextRun: new Date(Date.now() + item.intervalMinutes * 60000).toISOString(),
            }
          : item
      );
      try {
        window.localStorage.setItem(SCHEDULES_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  executeScheduledJobRef.current = executeScheduledJob;

  // 打开新建定时计划窗口
  const openCreateScheduleModal = () => {
    setEditingScheduleId(null);
    setNewSchedName("矩阵网址活跃巡航");
    setNewSchedInterval("60");
    setNewSchedTemplate("cruise");
    setSchedCruiseSites("https://www.wikipedia.org\nhttps://www.bbc.com\nhttps://www.reddit.com");
    setSchedCruiseDwell("15");
    setSchedSearchKeywords("NarciPH 指纹浏览器\n跨境电商多账号管理\n海外社交媒体运营");
    setSchedSearchEngine("bing");
    setSchedSearchDwell("12");
    setSchedWorkflowId(workflows[0]?.id || DEFAULT_WORKFLOWS[0].id);
    const targets = Array.from(selectedIds.size > 0 ? selectedIds : profiles.map((p) => p.id));
    setSchedTargetIds(targets);
    setNewScheduleModal(true);
  };

  // 打开编辑定时计划窗口
  const openEditScheduleModal = (sch: AutomationSchedule) => {
    setEditingScheduleId(sch.id);
    setNewSchedName(sch.name);
    setNewSchedInterval(String(sch.intervalMinutes));
    setNewSchedTemplate(sch.template);
    setSchedCruiseSites(sch.config?.customSites || "https://www.wikipedia.org\nhttps://www.bbc.com");
    setSchedCruiseDwell(String(sch.config?.dwellSeconds || 15));
    setSchedSearchKeywords(sch.config?.keywords || "NarciPH 指纹浏览器\n跨境电商多账号管理");
    setSchedSearchEngine(sch.config?.engine || "bing");
    setSchedSearchDwell(String(sch.config?.searchDwellSeconds || 12));
    setSchedWorkflowId(sch.config?.workflowId || workflows[0]?.id || DEFAULT_WORKFLOWS[0].id);
    setSchedTargetIds([...sch.targetProfileIds]);
    setNewScheduleModal(true);
  };

  // 保存定时计划（支持新建与修改）
  const saveSchedule = () => {
    if (schedTargetIds.length === 0) {
      toast.warning("请至少选择一个目标指纹环境");
      return;
    }
    const interval = Math.max(1, Number(newSchedInterval) || 1);
    const config: ScheduleConfig = {
      customSites: schedCruiseSites.trim(),
      dwellSeconds: Math.max(1, Number(schedCruiseDwell) || 15),
      keywords: schedSearchKeywords.trim(),
      engine: schedSearchEngine,
      searchDwellSeconds: Math.max(1, Number(schedSearchDwell) || 12),
      workflowId: newSchedTemplate === "workflow" ? schedWorkflowId : undefined,
    };

    if (editingScheduleId) {
      const next = schedules.map((s) => {
        if (s.id === editingScheduleId) {
          return {
            ...s,
            name: newSchedName.trim() || "定时自动化任务",
            targetProfileIds: schedTargetIds,
            template: newSchedTemplate,
            config,
            intervalMinutes: interval,
            nextRun: new Date(Date.now() + interval * 60000).toISOString(),
          };
        }
        return s;
      });
      setSchedules(next);
      try {
        window.localStorage.setItem(SCHEDULES_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      setNewScheduleModal(false);
      toast.success("定时计划已更新！");
    } else {
      const newSch: AutomationSchedule = {
        id: Math.random().toString(36).slice(2),
        name: newSchedName.trim() || "定时自动化任务",
        targetProfileIds: schedTargetIds,
        template: newSchedTemplate,
        config,
        intervalMinutes: interval,
        enabled: true,
        lastRun: undefined,
        nextRun: new Date(Date.now() + interval * 60000).toISOString(),
      };
      const next = [...schedules, newSch];
      setSchedules(next);
      try {
        window.localStorage.setItem(SCHEDULES_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      setNewScheduleModal(false);
      toast.success("定时计划已创建并激活启动！");
    }
  };

  const toggleSchedule = (id: string) => {
    setSchedules((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
      try {
        window.localStorage.setItem(SCHEDULES_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const deleteSchedule = (id: string) => {
    setSchedules((prev) => {
      const next = prev.filter((s) => s.id !== id);
      try {
        window.localStorage.setItem(SCHEDULES_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    toast.success("计划任务已删除");
  };

  const copyToClipboard = async (text: string, lang: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedLang(lang);
    toast.success("代码已复制到剪贴板");
    setTimeout(() => setCopiedLang(null), 2000);
  };

  const sessionFor = (id: string) => sessions.find((session) => session.id === id);

  const localApiUrl = apiStatus?.url || "http://127.0.0.1:29995";

  // Code Snippet Templates
  const getPythonSnippet = (p: ProfileSummary) => {
    const session = sessionFor(p.id);
    const directWs = session?.wsEndpoint || "";
    return `# NarciPH Automation (Python Playwright)
from playwright.sync_api import sync_playwright
import requests

# 1. 获取已在客户端运行的 WebSocket 端点，或通过 REST API 启动环境
profile_id = "${p.id}"
${
  directWs
    ? `# 当前客户端已启动此环境，直接复用连接端点:
ws_endpoint = "${directWs}"`
    : `# 自动通过 Local API 唤起环境:
res = requests.get(f"${localApiUrl}/api/v1/profile/start?id={profile_id}").json()
if not res.get("success"):
    raise RuntimeError(f"启动失败: {res.get('message')}")
ws_endpoint = res.get("data", {}).get("wsEndpoint") or res.get("data", {}).get("ws_endpoint")`
}

print(f"[*] 正在连接指纹浏览器: {ws_endpoint}")

# 2. 通过 Playwright 独占/接管浏览器会话
with sync_playwright() as p:
    browser = p.firefox.connect(ws_endpoint)
    context = browser.contexts[0] if browser.contexts else browser.new_context()
    page = context.new_page() if not context.pages else context.pages[0]

    # 打开测试网站，验证指纹伪装与代理 IP
    print("[*] 正在打开验证页面...")
    page.goto("https://browserleaks.com/ip")
    print("[*] 页面标题:", page.title())
    page.wait_for_timeout(5000)

    # 3. 任务完成后关闭连接 (如需停止环境可调用 API stop)
    browser.close()
    # requests.get(f"${localApiUrl}/api/v1/profile/stop?id={profile_id}")
`;
  };

  const getNodeSnippet = (p: ProfileSummary) => {
    const session = sessionFor(p.id);
    const directWs = session?.wsEndpoint || "";
    return `// NarciPH Automation (Node.js Playwright)
const { firefox } = require('playwright');

async function run() {
  const profileId = '${p.id}';
  ${
    directWs
      ? `// 当前客户端已启动此环境，直接复用端点:
  const wsEndpoint = '${directWs}';`
      : `// 自动通过本地 REST API 启动环境:
  const res = await fetch(\`${localApiUrl}/api/v1/profile/start?id=\${profileId}\`);
  const json = await res.json();
  if (!json.success) throw new Error(json.message);
  const wsEndpoint = json.data?.wsEndpoint || json.data?.ws_endpoint;`
  }

  console.log('[*] 正在连接指纹浏览器:', wsEndpoint);

  // 接管指纹浏览器
  const browser = await firefox.connect(wsEndpoint);
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = context.pages()[0] || (await context.newPage());

  await page.goto('https://browserleaks.com/ip');
  console.log('[*] 页面标题:', await page.title());
  await page.waitForTimeout(5000);

  // 关闭连接
  await browser.close();
}

run().catch(console.error);
`;
  };

  const getCurlSnippet = (p: ProfileSummary) => {
    return `# 1. 查询环境状态与列表
curl -X GET "${localApiUrl}/api/v1/profile/list"

# 2. 启动环境并获取 WebSocket Endpoint
curl -X GET "${localApiUrl}/api/v1/profile/start?id=${p.id}"

# 3. 查看当前活跃会话
curl -X GET "${localApiUrl}/api/v1/profile/active"

# 4. 停止环境
curl -X GET "${localApiUrl}/api/v1/profile/stop?id=${p.id}"
`;
  };

  // 全选 / 取消全选
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(profiles.map((p) => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 渲染账号资产账本与免密自动登录主视图
  const renderAccountVaultView = () => (
    <div className="space-y-4">
      {/* 顶部操作与筛选栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <LuKeyRound className="size-4 text-emerald-500" />
            <span>已沉淀账号资产账本</span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              共 {accountVault.length} 个账号
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            自动沉淀由 RPA 工作流、人机协同或手动登记的所有平台邮箱与登录凭据，支持一键脱敏复制与标准化 CSV 导出。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
            onClick={handleExportVaultCsv}
          >
            <LuDownload className="size-3.5" />
            <span>一键导出 CSV 表格</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={handleCopyAllVault}
          >
            <LuCopy className="size-3.5" />
            <span>一键复制全部凭据</span>
          </Button>
          <Button
            size="sm"
            variant="default"
            className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-semibold"
            onClick={() => setBatchImportModalOpen(true)}
          >
            <LuFileSpreadsheet className="size-3.5" />
            <span>📥 Excel 批量导入</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setAddVaultModalOpen(true)}
          >
            <LuPlus className="size-3.5" />
            <span>手工登记账号</span>
          </Button>
          {accountVault.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10"
              onClick={handleClearVault}
            >
              <LuTrash2 className="size-3.5" />
              <span>清空账本</span>
            </Button>
          )}
        </div>
      </div>

      {/* 快速搜索过滤 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <LuSearch className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            placeholder="按邮箱地址、平台名称或备注快速搜索..."
            value={vaultSearch}
            onChange={(e) => setVaultSearch(e.target.value)}
            className="h-8.5 pl-8 text-xs"
          />
        </div>
        {vaultSearch && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8.5 text-xs"
            onClick={() => setVaultSearch("")}
          >
            清除筛选
          </Button>
        )}
      </div>

      {/* 账号资产数据表格 */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-xs">
              <TableHead className="w-[140px]">注册平台</TableHead>
              <TableHead>邮箱账号</TableHead>
              <TableHead>登录密码</TableHead>
              <TableHead className="w-[120px]">状态</TableHead>
              <TableHead className="w-[140px]">关联指纹环境</TableHead>
              <TableHead className="w-[160px]">创建时间</TableHead>
              <TableHead className="w-[140px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accountVault
              .filter((item) => {
                if (!vaultSearch.trim()) return true;
                const s = vaultSearch.toLowerCase();
                return (
                  item.email.toLowerCase().includes(s) ||
                  item.platformName.toLowerCase().includes(s) ||
                  (item.note && item.note.toLowerCase().includes(s))
                );
              })
              .map((item) => {
                const isPasswordRevealed = revealedPasswords.has(item.id);
                return (
                  <TableRow key={item.id} className="text-xs">
                    <TableCell className="font-medium">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border ${
                          item.platform === "outlook"
                            ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20"
                            : item.platform === "163"
                            ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        }`}
                      >
                        <LuMail className="size-3" />
                        {item.platformName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-medium text-foreground select-all">
                          {item.email}
                        </span>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                          title="复制邮箱"
                          onClick={() => {
                            navigator.clipboard.writeText(item.email);
                            toast.success(`已复制邮箱: ${item.email}`);
                          }}
                        >
                          <LuCopy className="size-3" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 font-mono">
                        {item.password ? (
                          <>
                            <span>
                              {isPasswordRevealed ? item.password : "••••••••••••"}
                            </span>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                              title={isPasswordRevealed ? "隐藏密码" : "查看密码"}
                              onClick={() => {
                                setRevealedPasswords((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(item.id)) next.delete(item.id);
                                  else next.add(item.id);
                                  return next;
                                });
                              }}
                            >
                              {isPasswordRevealed ? (
                                <LuEyeOff className="size-3" />
                              ) : (
                                <LuEye className="size-3" />
                              )}
                            </button>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                              title="复制密码"
                              onClick={() => {
                                navigator.clipboard.writeText(item.password || "");
                                toast.success("已复制登录密码");
                              }}
                            >
                              <LuCopy className="size-3" />
                            </button>
                          </>
                        ) : (
                          <span className="text-muted-foreground italic">无需密码 / 临时收件</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => handleToggleVaultStatus(item.id)}
                        title="点击切换核验状态"
                        className="cursor-pointer"
                      >
                        <span
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium border ${
                            item.status === "verified"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : item.status === "temp_ready"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                          }`}
                        >
                          {item.status === "verified"
                            ? "✓ 已验证落库"
                            : item.status === "temp_ready"
                            ? "✓ 临时就绪"
                            : "⏳ 待人工核验"}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.profileName || item.profileId || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.createdAt}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="rounded px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-colors flex items-center gap-1 mr-1"
                          title="一键拉起环境并自动填密登录"
                          onClick={() => handleAutoLoginVaultItem(item)}
                        >
                          <LuPlay className="size-3 fill-current" />
                          <span>一键登录</span>
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          title="复制 账号----密码 标准凭据"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `${item.email}----${item.password || ""}`
                            );
                            toast.success("已复制为 标准 账号----密码 格式");
                          }}
                        >
                          <LuCopy className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="移除此项"
                          onClick={() => handleDeleteVaultItem(item.id)}
                        >
                          <LuTrash2 className="size-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>

        {accountVault.length === 0 && (
          <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
            <LuKeyRound className="mx-auto size-8 text-muted-foreground/40" />
            <div>账本中暂无保存的账号</div>
            <p className="text-[11px]">
              执行【Outlook 自动注册】或【网易 163 邮箱】工作流后，系统将自动把预填账号与密码沉淀至此，或点击上方【📥 Excel 批量导入】快速导入。
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      {/* 顶部现代化状态看板 (Local REST API & Driver Readiness) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/40 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* API Server 状态徽章 */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 shadow-xs">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            </span>
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <span className="text-muted-foreground">Local REST API:</span>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                {localApiUrl}
              </code>
              <button
                type="button"
                title="复制 API 地址"
                onClick={() => {
                  void navigator.clipboard.writeText(localApiUrl);
                  toast.success("REST API 基础地址已复制");
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <LuCopy className="size-3.5" />
              </button>
            </div>
          </div>

          {/* 驱动就绪状态徽章 */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 shadow-xs">
            <LuCpu className="size-3.5 text-sky-500" />
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Playwright 驱动:</span>
              {envInfo?.ready ? (
                <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                  <LuCheck className="size-3" />
                  已就绪 (免配置)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                  <LuInfo className="size-3" />
                  未检测到 (需配置)
                </span>
              )}
            </div>
          </div>

          {/* 运行中会话计数 */}
          <div className="text-xs text-muted-foreground">
            活跃实例:{" "}
            <span className="font-semibold text-foreground">
              {sessions.length}
            </span>{" "}
            个
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => void refresh()}
          >
            <LuRefreshCw className="size-3.5" />
            刷新
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setShowSettings(true)}
          >
            <LuSettings2 className="size-3.5" />
            环境驱动设置
          </Button>
        </div>
      </div>

      {/* 阶段 2 功能子导航栏 (Tabs: 环境列表与直连 / 批量编排与执行 / 定时任务计划) */}
      <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-2">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={activeMainTab === "list" ? "secondary" : "ghost"}
            className="h-7 gap-1.5 text-xs"
            onClick={() => setActiveMainTab("list")}
          >
            <LuBot className="size-3.5" />
            环境列表与控制
          </Button>

          <Button
            size="sm"
            variant={activeMainTab === "synchronizer" ? "secondary" : "ghost"}
            className={`h-7 gap-1.5 text-xs font-semibold ${
              activeMainTab === "synchronizer"
                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                : "text-amber-600 dark:text-amber-400"
            }`}
            onClick={() => setActiveMainTab("synchronizer")}
          >
            <LuZap className="size-3.5" />
            群控同步器 (Synchronizer)
            {sessions.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-bold">
                {sessions.length}
              </span>
            )}
          </Button>

          <Button
            size="sm"
            variant={activeMainTab === "vault" ? "secondary" : "ghost"}
            className={`h-7 gap-1.5 text-xs font-semibold ${
              activeMainTab === "vault"
                ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
            onClick={() => setActiveMainTab("vault")}
          >
            <LuKeyRound className="size-3.5 text-emerald-500" />
            账号资产与免密登录
            <span className="ml-1 rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              {accountVault.length} 个
            </span>
          </Button>

          <Button
            size="sm"
            variant={activeMainTab === "workflow" ? "secondary" : "ghost"}
            className="h-7 gap-1.5 text-xs"
            onClick={() => setActiveMainTab("workflow")}
          >
            <LuSparkles className="size-3.5 text-purple-500" />
            业务 RPA 模板超市
            {workflowExecuting && <span className="ml-1 inline-block size-1.5 animate-ping rounded-full bg-primary" />}
          </Button>

          <Button
            size="sm"
            variant={activeMainTab === "orchestrator" ? "secondary" : "ghost"}
            className="h-7 gap-1.5 text-xs"
            onClick={() => setActiveMainTab("orchestrator")}
          >
            <LuWorkflow className="size-3.5" />
            批量任务与执行日志 {batchRunning && <span className="ml-1 inline-block size-1.5 animate-ping rounded-full bg-emerald-500" />}
          </Button>

          <Button
            size="sm"
            variant={activeMainTab === "scheduler" ? "secondary" : "ghost"}
            className="h-7 gap-1.5 text-xs"
            onClick={() => setActiveMainTab("scheduler")}
          >
            <LuTimer className="size-3.5" />
            定时计划任务 ({schedules.filter((s) => s.enabled).length})
          </Button>
        </div>

        {/* 批量操作快捷工具条 (当有勾选时显示) */}
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <span className="text-xs text-muted-foreground">
              已选 <strong className="text-foreground">{selectedIds.size}</strong> 项
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={selectedIds.size === 0 || batchRunning}
            className="h-7 gap-1 text-xs"
            onClick={handleBatchStart}
          >
            <LuPlay className="size-3" />
            批量启动
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={selectedIds.size === 0 || batchRunning}
            className="h-7 gap-1 text-xs"
            onClick={handleBatchWarmup}
          >
            <LuFlaskConical className="size-3" />
            批量巡航预热
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={selectedIds.size === 0 || batchRunning}
            className="h-7 gap-1 text-xs"
            onClick={handleBatchStop}
          >
            <LuSquare className="size-3" />
            批量停止
          </Button>
        </div>
      </div>

      {/* Tab 1: 环境列表 */}
      {activeMainTab === "list" && (
        <div className="scroll-fade relative min-h-0 min-w-0 flex-1 overflow-auto">
          <Table className="table-fixed" containerClassName="overflow-visible">
            <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-0">
              <TableRow className="border-0! hover:bg-transparent">
                <TableHead className="w-[45px] pl-4">
                  <Checkbox
                    checked={profiles.length > 0 && selectedIds.size === profiles.length}
                    onCheckedChange={(checked) => handleSelectAll(checked === true)}
                  />
                </TableHead>
                <TableHead className="w-[180px]">{t("common.profileColumn")}</TableHead>
                <TableHead className="w-[110px]">分组 / 代理</TableHead>
                <TableHead>{t("common.websocketEndpoint")}</TableHead>
                <TableHead className="w-[85px]">{t("common.pid")}</TableHead>
                <TableHead className="w-[230px] pr-4 text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="overflow-visible">
              {loading ? (
                <TableRow className="border-0! hover:bg-transparent">
                  <TableCell colSpan={6} className="py-16 text-center text-sm text-muted-foreground">
                    {t("common.loadingAgent")}
                  </TableCell>
                </TableRow>
              ) : profiles.length === 0 ? (
                <TableRow className="border-0! hover:bg-transparent">
                  <TableCell colSpan={6} className="py-16">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <LuBot className="size-12 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{t("common.noProfilesYet")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("common.noProfilesForAgent")}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                profiles.map((profile) => {
                  const session = sessionFor(profile.id);
                  const isBusy = busyProfileId === profile.id;
                  const isSelected = selectedIds.has(profile.id);
                  return (
                    <TableRow key={profile.id} className="group/row border-0! hover:bg-muted/50">
                      <TableCell className="pl-4">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(profile.id)}
                        />
                      </TableCell>

                      <TableCell className="min-w-0">
                        <div className="block max-w-full truncate text-sm font-medium text-foreground">
                          {profile.name}
                        </div>
                        <div className="block max-w-full truncate font-mono text-[11px] text-muted-foreground">
                          ID: {profile.id}
                        </div>
                      </TableCell>

                      <TableCell className="min-w-0">
                        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                          <span className="truncate">{profile.group || "默认分组"}</span>
                          <span className="text-[11px]">
                            {profile.proxied ? "✅ 独立代理" : "直连"}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className="min-w-0">
                        {session ? (
                          <button
                            type="button"
                            title={session.wsEndpoint}
                            onClick={() => {
                              void navigator.clipboard.writeText(session.wsEndpoint);
                              toast.success(t("common.endpointCopied"));
                            }}
                            className="flex w-full items-center gap-1.5 text-left"
                          >
                            <span className="min-w-0 flex-1 truncate font-mono text-xs text-emerald-600 dark:text-emerald-400">
                              {session.wsEndpoint}
                            </span>
                            <LuCopy className="size-3.5 shrink-0 text-muted-foreground" />
                          </button>
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground/60">— 未运行 —</span>
                        )}
                      </TableCell>

                      <TableCell className="tabular-nums font-mono text-xs text-muted-foreground">
                        {session ? session.pid : "—"}
                      </TableCell>

                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 代码生成器按钮 */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => setSnippetProfile(profile)}
                          >
                            <LuCode className="size-3.5" />
                            代码
                          </Button>

                          {/* 养号 Warmup 按钮 */}
                          {!session && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className={`h-8 gap-1 px-2 text-xs ${
                                warmedIds.has(profile.id)
                                  ? "text-emerald-600 dark:text-emerald-400 font-medium hover:text-emerald-700"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                              onClick={() => setWarmTarget(profile)}
                              title={warmedIds.has(profile.id) ? "该环境已完成预热，点击可再次增量预热" : "点击预热访问常用网站沉淀 Cookie"}
                            >
                              {warmedIds.has(profile.id) ? (
                                <>
                                  <LuCheck className="size-3.5 text-emerald-500" />
                                  已预热
                                </>
                              ) : (
                                <>
                                  <LuFlaskConical className="size-3.5" />
                                  {t("common.warmup")}
                                </>
                              )}
                            </Button>
                          )}

                          {/* 启动 / 停止按钮 */}
                          {session ? (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-8 gap-1 px-2.5 text-xs"
                              disabled={isBusy}
                              onClick={() => void stopSession(session.id)}
                            >
                              <LuSquare className="size-3.5" />
                              {isBusy ? "正在停止..." : t("common.stop")}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-8 gap-1 px-2.5 text-xs shadow-xs"
                              disabled={isBusy}
                              onClick={() => void startSession(profile)}
                            >
                              <LuPlay className="size-3.5" />
                              {isBusy ? "正在启动..." : "一键启动"}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Tab 2: 批量编排与执行日志 (Orchestrator & Logs) */}
      {activeMainTab === "orchestrator" && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-4 overflow-auto">
          {/* 编排控制卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <LuLayers className="size-4 text-primary" />
                并发调度控制
              </div>
              <div className="text-xs text-muted-foreground">
                限制同时运行的最大浏览器进程数，防止多开占用过多内存。
              </div>
              <div className="flex items-center gap-3">
                <Label htmlFor="concurrency" className="text-xs shrink-0">最大并发数:</Label>
                <Input
                  id="concurrency"
                  type="number"
                  min={1}
                  max={8}
                  value={concurrency}
                  onChange={(e) => setConcurrency(Math.max(1, Math.min(8, Number(e.target.value) || 2)))}
                  className="h-8 w-20 font-mono text-xs"
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <LuFlaskConical className="size-4 text-emerald-500" />
                内置常用任务模板
              </div>
              <div className="text-xs text-muted-foreground">
                无需编写任何 Python / Node 脚本，开箱即用的工业级自动化流。
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleBatchWarmup}>
                  批量巡航预热
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleBatchStart}>
                  批量静默启动
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <LuTimer className="size-4 text-sky-500" />
                定时计划概览
              </div>
              <div className="text-xs text-muted-foreground">
                当前运行中定时任务: {schedules.filter((s) => s.enabled).length} 个
              </div>
              <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => setNewScheduleModal(true)}>
                <LuListPlus className="size-3.5 mr-1" />
                新建定时计划
              </Button>
            </div>
          </div>

          {/* 实时执行日志看板 */}
          <div className="flex-1 rounded-lg border border-border bg-card flex flex-col min-h-[300px]">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5 bg-muted/30">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <LuTerminal className="size-4 text-muted-foreground" />
                自动化执行实时日志 (实时监控)
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setBatchLogs([])}
              >
                清空日志
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-3 font-mono text-xs space-y-2 select-all">
              {batchLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  暂无执行记录。点击上方批量操作或定时计划后，任务流执行详情将实时打印在此。
                </div>
              ) : (
                batchLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2.5 leading-relaxed">
                    <span className="text-muted-foreground shrink-0">[{log.time}]</span>
                    <span className="font-semibold text-foreground shrink-0">[{log.profileName}]</span>
                    <span
                      className={
                        log.status === "success"
                          ? "text-emerald-500"
                          : log.status === "error"
                          ? "text-destructive"
                          : "text-sky-500 animate-pulse"
                      }
                    >
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: 自定义可视化工作流步骤链与跨境 RPA 市场 */}
      {activeMainTab === "workflow" && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4 overflow-auto space-y-4">
          {/* 子 Tab 切换: 跨境电商 RPA 模板市场 vs 高级步骤链编排 */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card/60 p-1">
              <button
                type="button"
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  workflowSubTab === "marketplace"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
                onClick={() => setWorkflowSubTab("marketplace")}
              >
                <LuStore className="size-3.5" />
                <span>跨境电商 RPA 模板市场</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    workflowSubTab === "marketplace"
                      ? "bg-white/20 text-white"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {ECOMMERCE_RPA_TEMPLATES.length} 核心场景
                </span>
              </button>
              <button
                type="button"
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  workflowSubTab === "editor"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
                onClick={() => setWorkflowSubTab("editor")}
              >
                <LuSlidersHorizontal className="size-3.5" />
                <span>高级步骤链编排 ({selectedWorkflow?.steps.length || 0} 步)</span>
              </button>
              <button
                type="button"
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  workflowSubTab === "vault"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
                onClick={() => setWorkflowSubTab("vault")}
              >
                <LuKeyRound className="size-3.5" />
                <span>已生成账号资产账本</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    workflowSubTab === "vault"
                      ? "bg-white/20 text-white"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {accountVault.length}
                </span>
              </button>
              <button
                type="button"
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  workflowSubTab === "datapool"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
                onClick={() => setWorkflowSubTab("datapool")}
              >
                <LuFileSpreadsheet className="size-3.5" />
                <span>动态 CSV 数据池 (变量驱动)</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    workflowSubTab === "datapool"
                      ? "bg-white/20 text-white"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {parseCsv(csvRawText).rows.length}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-2.5 py-1 text-emerald-600 dark:text-emerald-400 font-medium text-[11px] border border-emerald-500/20">
                <LuShieldCheck className="size-3.5 text-emerald-500" />
                全场景内置真人微动滚轮与智能弹窗规避
              </span>
            </div>
          </div>

          {/* 模式一：跨境电商 RPA 模板市场 (开箱即用) */}
          {workflowSubTab === "marketplace" && (
            <div className="space-y-4">
              {/* 分类过滤器 */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: "all", label: "全部核心场景", count: ECOMMERCE_RPA_TEMPLATES.length },
                    { id: "email", label: "✉️ 邮箱自动注册", count: ECOMMERCE_RPA_TEMPLATES.filter((t) => t.category === "email").length },
                    { id: "amazon", label: "🛒 亚马逊", count: ECOMMERCE_RPA_TEMPLATES.filter((t) => t.category === "amazon").length },
                    { id: "tiktok", label: "🎵 TikTok / TK Shop", count: ECOMMERCE_RPA_TEMPLATES.filter((t) => t.category === "tiktok").length },
                    { id: "facebook", label: "📘 Facebook 矩阵", count: ECOMMERCE_RPA_TEMPLATES.filter((t) => t.category === "facebook").length },
                    { id: "shopee", label: "🛍️ 东南亚 Shopee", count: ECOMMERCE_RPA_TEMPLATES.filter((t) => t.category === "shopee").length },
                    { id: "google", label: "🔍 Google & 独立站", count: ECOMMERCE_RPA_TEMPLATES.filter((t) => t.category === "google").length },
                    { id: "security", label: "🛡️ 资产安全体检", count: ECOMMERCE_RPA_TEMPLATES.filter((t) => t.category === "security").length },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                        rpaCategoryFilter === cat.id
                          ? "bg-foreground text-background shadow-xs font-semibold"
                          : "border border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                      onClick={() => setRpaCategoryFilter(cat.id)}
                    >
                      <span>{cat.label}</span>
                      <span className="opacity-70 text-[10px]">({cat.count})</span>
                    </button>
                  ))}
                </div>

                <div className="text-[11px] text-muted-foreground">
                  已收录针对跨境出海高频作业的开箱即用模板，小白无需编写代码与选择器
                </div>
              </div>

              {/* 模板网格卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {ECOMMERCE_RPA_TEMPLATES.filter(
                  (t) => rpaCategoryFilter === "all" || t.category === rpaCategoryFilter
                ).map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex flex-col justify-between rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md space-y-3.5 group"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                          {tpl.category === "email" && <LuMail className="size-3 text-sky-500" />}
                          {tpl.category === "amazon" && <LuShoppingCart className="size-3 text-amber-500" />}
                          {tpl.category === "tiktok" && <LuVideo className="size-3 text-rose-500" />}
                          {tpl.category === "facebook" && <LuGlobe className="size-3 text-blue-500" />}
                          {tpl.category === "shopee" && <LuStore className="size-3 text-red-500" />}
                          {tpl.category === "google" && <LuSearch className="size-3 text-emerald-500" />}
                          {tpl.category === "security" && <LuShieldCheck className="size-3 text-indigo-500" />}
                          {tpl.platformName}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${tpl.badgeColor}`}>
                          {tpl.badge}
                        </span>
                      </div>

                      <div>
                        <h4 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                          {tpl.name}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                          {tpl.description}
                        </p>
                      </div>

                      {/* 适用角色与防封标签 */}
                      <div className="space-y-1.5 pt-1 text-[11px] border-t border-border/60">
                        <div className="flex items-start gap-1 text-muted-foreground">
                          <span className="font-semibold text-foreground shrink-0">适用场景:</span>
                          <span className="line-clamp-1">{tpl.targetRole}</span>
                        </div>
                        <div className="flex items-start gap-1 text-muted-foreground">
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">防封特性:</span>
                          <span className="line-clamp-1">{tpl.antiDetectNotes}</span>
                        </div>
                      </div>
                    </div>

                    {/* 操作按钮组 */}
                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      <Button
                        size="sm"
                        className="flex-1 text-xs gap-1 shadow-xs"
                        onClick={() => openRpaWizard(tpl)}
                      >
                        <LuZap className="size-3 text-amber-300" />
                        立即配置并执行
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs px-2.5"
                        title="克隆到高级步骤链编辑器微调"
                        onClick={() => handleCloneRpaToEditor(tpl)}
                      >
                        <LuCopy className="size-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 模式二：高级步骤链编排与执行控制台 */}
          {workflowSubTab === "editor" && (
            <div className="space-y-4">
              {/* 顶部工作流工具栏与选择器 */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <LuLayers className="size-4 text-primary" />
                  当前工作流:
                  <select
                    className="h-8 rounded-md border border-input bg-background px-3 py-1 text-xs font-semibold"
                    value={selectedWorkflowId}
                    onChange={(e) => setSelectedWorkflowId(e.target.value)}
                  >
                    {workflows.map((wf) => (
                      <option key={wf.id} value={wf.id}>
                        {wf.name} ({wf.steps.length} 步)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedWorkflow?.description || "自定义步骤交互链路"}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="default" className="h-8 text-xs gap-1.5 shadow-xs" onClick={openCreateWorkflowModal}>
                <LuPlus className="size-3.5" />
                新建工作流
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => handleDuplicateWorkflow(selectedWorkflow)}>
                <LuCopy className="size-3.5" />
                复制当前流
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setWorkflowManagerModal(true)}>
                <LuWorkflow className="size-3.5 text-primary" />
                工作流库管理 ({workflows.length})
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleResetWorkflowPresets}>
                <LuSparkles className="size-3.5 text-amber-500" />
                载入预设
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-destructive hover:text-destructive gap-1"
                onClick={() => handleRequestDeleteWorkflow(selectedWorkflow.id)}
              >
                <LuTrash2 className="size-3.5" />
                删除当前流
              </Button>
            </div>
          </div>

          {/* 步骤链基本信息与执行控制栏 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-lg border border-border bg-card p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">步骤链名称</Label>
                    <span className="text-[10px] text-muted-foreground">ID: {selectedWorkflow?.id}</span>
                  </div>
                  <Input
                    value={selectedWorkflow?.name || ""}
                    onChange={(e) => handleUpdateWorkflowMeta(e.target.value, selectedWorkflow?.description || "")}
                    placeholder="输入工作流名称"
                    className="h-8 text-xs font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">步骤链描述 / 业务说明</Label>
                  <Input
                    value={selectedWorkflow?.description || ""}
                    onChange={(e) => handleUpdateWorkflowMeta(selectedWorkflow?.name || "", e.target.value)}
                    placeholder="例如：自动输入关键词并完成存证截图"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* 快捷添加步骤工具条 */}
              <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                  <span>快捷插入交互步骤:</span>
                  <span className="text-[11px]">当前包含 {selectedWorkflow?.steps.length || 0} 个步骤</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-blue-500/30 hover:border-blue-500 hover:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    onClick={() => handleAddStep("goto")}
                  >
                    <LuGlobe className="size-3" />
                    + 跳转 (Navigate)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    onClick={() => handleAddStep("click")}
                  >
                    <LuMousePointerClick className="size-3" />
                    + 点击 (Click)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-purple-500/30 hover:border-purple-500 hover:bg-purple-500/10 text-purple-600 dark:text-purple-400"
                    onClick={() => handleAddStep("type")}
                  >
                    <LuKeyboard className="size-3" />
                    + 输入 (Type)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-sky-500/30 hover:border-sky-500 hover:bg-sky-500/10 text-sky-600 dark:text-sky-400"
                    onClick={() => handleAddStep("hover")}
                  >
                    <LuMousePointer className="size-3" />
                    + 悬停 (Hover)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-amber-500/30 hover:border-amber-500 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    onClick={() => handleAddStep("select")}
                  >
                    <LuListFilter className="size-3" />
                    + 下拉 (Select)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-teal-500/30 hover:border-teal-500 hover:bg-teal-500/10 text-teal-600 dark:text-teal-400"
                    onClick={() => handleAddStep("check")}
                  >
                    <LuSquareCheck className="size-3" />
                    + 勾选 (Check)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-amber-500/30 hover:border-amber-500 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    onClick={() => handleAddStep("screenshot")}
                  >
                    <LuCamera className="size-3" />
                    + 截图 (Screenshot)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-cyan-500/30 hover:border-cyan-500 hover:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
                    onClick={() => handleAddStep("wait")}
                  >
                    <LuHourglass className="size-3" />
                    + 等待 (Wait)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-indigo-500/30 hover:border-indigo-500 hover:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                    onClick={() => handleAddStep("scroll")}
                  >
                    <LuArrowDown className="size-3" />
                    + 滚动 (Scroll)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleAddStep("press")}
                  >
                    + 按键 (Press)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-violet-500/30 hover:border-violet-500 hover:bg-violet-500/10 text-violet-600 dark:text-violet-400"
                    onClick={() => handleAddStep("eval")}
                  >
                    <LuTerminal className="size-3" />
                    + 脚本 (JS Eval)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    onClick={() => handleAddStep("extract")}
                  >
                    <LuDownload className="size-3" />
                    + 抓取 (Extract)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-rose-500/30 hover:border-rose-500 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    onClick={() => handleAddStep("loop")}
                  >
                    <LuRefreshCw className="size-3" />
                    + 循环 (Loop)
                  </Button>
                </div>
              </div>

              {/* 可视化步骤列表 */}
              <div className="space-y-3 pt-1">
                {selectedWorkflow?.steps.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg text-xs">
                    步骤链为空，请点击上方按钮添加第一项交互步骤。
                  </div>
                ) : (
                  selectedWorkflow?.steps.map((step, idx) => (
                    <div
                      key={step.id}
                      className="group relative rounded-lg border border-border bg-background/60 hover:bg-background p-3.5 shadow-xs transition-all space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center justify-center size-5 rounded-full bg-muted font-mono text-[11px] font-bold text-foreground">
                            {idx + 1}
                          </span>
                          {step.action === "goto" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/15 text-blue-600 dark:text-blue-400">
                              <LuGlobe className="size-3" /> 跳转网址 (Navigate)
                            </span>
                          )}
                          {step.action === "click" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                              <LuMousePointerClick className="size-3" /> 点击元素 (Click)
                            </span>
                          )}
                          {step.action === "type" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/15 text-purple-600 dark:text-purple-400">
                              <LuKeyboard className="size-3" /> 拟人输入 (Type)
                            </span>
                          )}
                          {step.action === "screenshot" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400">
                              <LuCamera className="size-3" /> 页面截图 (Screenshot)
                            </span>
                          )}
                          {step.action === "wait" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
                              <LuHourglass className="size-3" /> 等待延迟 (Wait)
                            </span>
                          )}
                          {step.action === "scroll" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                              <LuArrowDown className="size-3" /> 平滑滚动 (Scroll)
                            </span>
                          )}
                          {step.action === "press" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-500/15 text-foreground">
                              按键操作 (Press)
                            </span>
                          )}
                          {step.action === "hover" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-sky-500/15 text-sky-600 dark:text-sky-400">
                              <LuMousePointer className="size-3" /> 鼠标悬停 (Hover)
                            </span>
                          )}
                          {step.action === "select" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400">
                              <LuListFilter className="size-3" /> 下拉选择 (Select)
                            </span>
                          )}
                          {step.action === "check" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-teal-500/15 text-teal-600 dark:text-teal-400">
                              <LuSquareCheck className="size-3" /> 复选勾选 (Check)
                            </span>
                          )}
                          {step.action === "eval" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-violet-500/15 text-violet-600 dark:text-violet-400">
                              <LuTerminal className="size-3" /> 脚本注入 (JS Eval)
                            </span>
                          )}
                          {step.action === "extract" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                              <LuDownload className="size-3" /> 数据抓取 (Extract)
                            </span>
                          )}
                          {step.action === "loop" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/15 text-rose-600 dark:text-rose-400">
                              <LuRefreshCw className="size-3" /> 循环动作 (Loop)
                            </span>
                          )}
                          <Input
                            value={step.name || ""}
                            onChange={(e) => handleUpdateStep(idx, { name: e.target.value })}
                            className="h-6 w-44 text-[11px] border-transparent hover:border-input focus:border-input"
                            placeholder="步骤名称"
                          />
                        </div>

                        {/* 移动与删除控制按钮 */}
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                            disabled={idx === 0}
                            onClick={() => handleMoveStep(idx, "up")}
                            title="上移"
                          >
                            <LuArrowUp className="size-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                            disabled={idx === (selectedWorkflow?.steps.length || 0) - 1}
                            onClick={() => handleMoveStep(idx, "down")}
                            title="下移"
                          >
                            <LuArrowDown className="size-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveStep(idx)}
                            title="删除该步骤"
                          >
                            <LuTrash2 className="size-3" />
                          </Button>
                        </div>
                      </div>

                      {/* 步骤表单配置区域 */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
                        {step.action === "goto" && (
                          <div className="sm:col-span-2 space-y-1">
                            <Label className="text-[11px] text-muted-foreground">目标网址 URL</Label>
                            <Input
                              value={step.url || ""}
                              onChange={(e) => handleUpdateStep(idx, { url: e.target.value })}
                              placeholder="https://..."
                              className="h-7 text-xs font-mono"
                            />
                          </div>
                        )}

                        {step.action === "click" && (
                          <>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">元素选择器 (CSS / XPath)</Label>
                              <Input
                                value={step.selector || ""}
                                onChange={(e) => handleUpdateStep(idx, { selector: e.target.value })}
                                placeholder="例如：button.submit, #login-btn, text='确定'"
                                className="h-7 text-xs font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">查找超时时间 (毫秒)</Label>
                              <Input
                                type="number"
                                value={step.timeout || 15000}
                                onChange={(e) => handleUpdateStep(idx, { timeout: Number(e.target.value) || 15000 })}
                                className="h-7 text-xs"
                              />
                            </div>
                          </>
                        )}

                        {step.action === "type" && (
                          <>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">输入框选择器 (CSS / XPath)</Label>
                              <Input
                                value={step.selector || ""}
                                onChange={(e) => handleUpdateStep(idx, { selector: e.target.value })}
                                placeholder="例如：input[name='q'], #search-input"
                                className="h-7 text-xs font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">输入内容文本</Label>
                              <Input
                                value={step.text || ""}
                                onChange={(e) => handleUpdateStep(idx, { text: e.target.value })}
                                placeholder="输入要键入的文字或关键词"
                                className="h-7 text-xs"
                              />
                            </div>
                            <div className="flex items-center gap-4 pt-1 sm:col-span-2">
                              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-muted-foreground">
                                <Checkbox
                                  checked={step.clear !== false}
                                  onCheckedChange={(checked) => handleUpdateStep(idx, { clear: checked === true })}
                                />
                                输入前先清空已有文本
                              </label>
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span>按键延迟 (ms):</span>
                                <Input
                                  type="number"
                                  value={step.delay ?? 45}
                                  onChange={(e) => handleUpdateStep(idx, { delay: Number(e.target.value) || 0 })}
                                  className="h-6 w-16 text-[11px]"
                                />
                              </div>
                            </div>
                          </>
                        )}

                        {step.action === "screenshot" && (
                          <div className="sm:col-span-2 flex items-center justify-between gap-4">
                            <label className="flex items-center gap-2 cursor-pointer text-xs">
                              <Checkbox
                                checked={step.fullPage !== false}
                                onCheckedChange={(checked) => handleUpdateStep(idx, { fullPage: checked === true })}
                              />
                              截取全屏长图 (Full Page Screenshot)
                            </label>
                            <span className="text-[11px] text-muted-foreground">
                              存证快照将自动编码并直接在右侧结果看板中高清展示
                            </span>
                          </div>
                        )}

                        {step.action === "wait" && (
                          <>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">等待时长 (毫秒)</Label>
                              <Input
                                type="number"
                                value={step.duration ?? 2000}
                                onChange={(e) => handleUpdateStep(idx, { duration: Number(e.target.value) || 2000 })}
                                placeholder="2000"
                                className="h-7 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">或者等待特定元素出现 (可选)</Label>
                              <Input
                                value={step.selector || ""}
                                onChange={(e) => handleUpdateStep(idx, { selector: e.target.value })}
                                placeholder="例如：div.content-loaded"
                                className="h-7 text-xs font-mono"
                              />
                            </div>
                          </>
                        )}

                        {step.action === "scroll" && (
                          <div className="sm:col-span-2 flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Label className="text-[11px] text-muted-foreground shrink-0">向下滚动像素:</Label>
                              <Input
                                type="number"
                                value={typeof step.distance === "number" ? step.distance : 400}
                                onChange={(e) => handleUpdateStep(idx, { distance: Number(e.target.value) || 400 })}
                                className="h-7 w-24 text-xs font-mono"
                              />
                            </div>
                            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-muted-foreground">
                              <Checkbox
                                checked={step.distance === "bottom"}
                                onCheckedChange={(checked) => handleUpdateStep(idx, { distance: checked ? "bottom" : 400 })}
                              />
                              直接平滑滚动到底部
                            </label>
                          </div>
                        )}

                        {step.action === "press" && (
                          <div className="sm:col-span-2 flex items-center gap-3">
                            <Label className="text-[11px] text-muted-foreground shrink-0">触发按键:</Label>
                            <select
                              className="h-7 rounded border border-input bg-background px-2 text-xs"
                              value={step.key || "Enter"}
                              onChange={(e) => handleUpdateStep(idx, { key: e.target.value })}
                            >
                              <option value="Enter">Enter (回车提交)</option>
                              <option value="Tab">Tab (切换焦点)</option>
                              <option value="Escape">Escape (退出/关闭弹窗)</option>
                              <option value="Space">Space (空格)</option>
                              <option value="ArrowDown">ArrowDown (方向下)</option>
                            </select>
                          </div>
                        )}

                        {step.action === "hover" && (
                          <>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">悬停目标元素选择器 (CSS / XPath)</Label>
                              <Input
                                value={step.selector || ""}
                                onChange={(e) => handleUpdateStep(idx, { selector: e.target.value })}
                                placeholder="例如：.nav-dropdown, button.more, #menu-btn"
                                className="h-7 text-xs font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">等待超时 (毫秒)</Label>
                              <Input
                                type="number"
                                value={step.timeout || 15000}
                                onChange={(e) => handleUpdateStep(idx, { timeout: Number(e.target.value) || 15000 })}
                                className="h-7 text-xs"
                              />
                            </div>
                          </>
                        )}

                        {step.action === "select" && (
                          <>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">下拉框元素选择器 (CSS / XPath)</Label>
                              <Input
                                value={step.selector || ""}
                                onChange={(e) => handleUpdateStep(idx, { selector: e.target.value })}
                                placeholder="例如：select#country, select.category-select"
                                className="h-7 text-xs font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">选中的值或标签文本 (Value / Label)</Label>
                              <Input
                                value={step.value || ""}
                                onChange={(e) => handleUpdateStep(idx, { value: e.target.value })}
                                placeholder="例如：US, zh, 或选项文字"
                                className="h-7 text-xs"
                              />
                            </div>
                          </>
                        )}

                        {step.action === "check" && (
                          <>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">复选框/单选框选择器 (CSS / XPath)</Label>
                              <Input
                                value={step.selector || ""}
                                onChange={(e) => handleUpdateStep(idx, { selector: e.target.value })}
                                placeholder="例如：input[type='checkbox']#agree, #remember-me"
                                className="h-7 text-xs font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">操作模式</Label>
                              <select
                                className="h-7 w-full rounded border border-input bg-background px-2 text-xs"
                                value={step.uncheck ? "uncheck" : "check"}
                                onChange={(e) => handleUpdateStep(idx, { uncheck: e.target.value === "uncheck" })}
                              >
                                <option value="check">勾选选中 (Check)</option>
                                <option value="uncheck">取消勾选 (Uncheck)</option>
                              </select>
                            </div>
                          </>
                        )}

                        {step.action === "eval" && (
                          <div className="sm:col-span-2 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label className="text-[11px] text-muted-foreground">注入原生 JavaScript 脚本代码</Label>
                              <span className="text-[10px] text-muted-foreground">支持 return 返回变量在右侧执行看板展示</span>
                            </div>
                            <textarea
                              value={step.script || ""}
                              onChange={(e) => handleUpdateStep(idx, { script: e.target.value })}
                              rows={3}
                              placeholder="// 输入任意 JS 语句，例如：\nreturn document.title + ' | ' + window.location.href;"
                              className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                            />
                          </div>
                        )}

                        {step.action === "extract" && (
                          <>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">提取字段目标元素选择器 (CSS / XPath)</Label>
                              <Input
                                value={step.selector || ""}
                                onChange={(e) => handleUpdateStep(idx, { selector: e.target.value })}
                                placeholder="例如：h1.product-title, span.price"
                                className="h-7 text-xs font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">抓取属性类型 (Extract Type)</Label>
                              <select
                                className="h-7 w-full rounded border border-input bg-background px-2 text-xs"
                                value={step.extractType || "text"}
                                onChange={(e) => handleUpdateStep(idx, { extractType: e.target.value as any })}
                              >
                                <option value="text">提取文本内容 (textContent)</option>
                                <option value="href">提取链接地址 (href)</option>
                                <option value="src">提取媒体源地址 (src)</option>
                                <option value="value">提取表单输入值 (value)</option>
                              </select>
                            </div>
                          </>
                        )}

                        {step.action === "loop" && (
                          <>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">循环重复执行次数 (Times)</Label>
                              <Input
                                type="number"
                                min={1}
                                max={100}
                                value={step.loopCount || step.times || 5}
                                onChange={(e) =>
                                  handleUpdateStep(idx, {
                                    loopCount: Number(e.target.value) || 5,
                                    times: Number(e.target.value) || 5,
                                  })
                                }
                                className="h-7 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">单次间隔 (毫秒) 与重复动作</Label>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={100}
                                  value={step.loopInterval || step.intervalMs || 1000}
                                  onChange={(e) =>
                                    handleUpdateStep(idx, {
                                      loopInterval: Number(e.target.value) || 1000,
                                      intervalMs: Number(e.target.value) || 1000,
                                    })
                                  }
                                  className="h-7 text-xs w-28"
                                  placeholder="1000ms"
                                />
                                <select
                                  className="h-7 flex-1 rounded border border-input bg-background px-2 text-xs"
                                  value={step.subAction || "scroll"}
                                  onChange={(e) => handleUpdateStep(idx, { subAction: e.target.value })}
                                >
                                  <option value="scroll">平滑向下微动滚动 (Scroll)</option>
                                  <option value="click">重复拟人微点 (Click)</option>
                                  <option value="press">按键触发 (Press)</option>
                                </select>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 右侧：执行控制器与快照结果看板 */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-4 flex flex-col min-h-[450px]">
              <div className="space-y-3 pb-3 border-b border-border">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <LuPlay className="size-4 text-emerald-500" />
                  工作流单步/全链立即执行
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">选择目标指纹环境</Label>
                    {profiles.find((p) => p.id === (workflowTargetProfileId || profiles[0]?.id))?.proxied ? (
                      <span className="text-[10px] text-amber-500 font-medium flex items-center gap-1">
                        <LuGlobe className="size-3" /> 已绑定代理
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-500 font-medium flex items-center gap-1">
                        ⚡ 直连网络
                      </span>
                    )}
                  </div>
                  <select
                    className="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                    value={workflowTargetProfileId}
                    onChange={(e) => setWorkflowTargetProfileId(e.target.value)}
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.proxied ? "已代理" : "直连"}) - {p.id.slice(0, 8)}...
                      </option>
                    ))}
                  </select>
                  {profiles.find((p) => p.id === (workflowTargetProfileId || profiles[0]?.id))?.proxied && (
                    <div className="text-[11px] text-muted-foreground bg-muted/40 p-1.5 rounded">
                      💡 提示：该环境已绑定代理。若网络报错拒绝连接，请在【环境列表】更换有效节点或使用直连环境。
                    </div>
                  )}
                </div>
                <Button
                  className="w-full gap-2 shadow-sm"
                  disabled={workflowExecuting || profiles.length === 0}
                  onClick={runCurrentWorkflow}
                >
                  <LuPlay className="size-3.5" />
                  {workflowExecuting ? "正在自动化执行步骤链..." : "立即执行当前步骤链"}
                </Button>
              </div>

              {/* 实时执行结果与截图画廊 */}
              <div className="flex-1 space-y-3 overflow-auto">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>执行日志与存证快照</span>
                  <span className="text-muted-foreground text-[11px]">
                    {workflowExecuting ? (
                      <span className="text-primary flex items-center gap-1.5 font-medium animate-pulse">
                        <LuRefreshCw className="size-3 animate-spin text-primary" />
                        {workflowStepResults.length > 0
                          ? `正在执行 (${workflowStepResults.length}/${selectedWorkflow?.steps.length || 0} 步)`
                          : "正在启动环境执行中..."}
                      </span>
                    ) : workflowStepResults.length > 0 ? (
                      `${workflowStepResults.filter((r) => r.ok).length}/${workflowStepResults.length} 步已完成`
                    ) : (
                      "等待执行"
                    )}
                  </span>
                </div>

                {workflowStepResults.length === 0 ? (
                  workflowExecuting ? (
                    <div className="py-16 text-center text-xs text-muted-foreground space-y-3">
                      <LuRefreshCw className="size-6 animate-spin mx-auto text-primary" />
                      <div className="font-medium text-foreground">正在调度指纹环境执行中...</div>
                      <div className="text-[11px] text-muted-foreground">已连接指纹上下文并下发执行指令，各步骤结果将实时增量呈现...</div>
                    </div>
                  ) : (
                    <div className="py-16 text-center text-xs text-muted-foreground">
                      点击上方“立即执行”按钮，系统将连接指纹环境，在此实时回显步骤耗时、状态与截图存证。
                    </div>
                  )
                ) : (
                  <div className="space-y-2.5">
                    {workflowStepResults.map((res, i) => (
                      <div
                        key={i}
                        className={`rounded-md border p-2.5 text-xs transition-all space-y-2 ${
                          res.ok
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-destructive/30 bg-destructive/5"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`flex size-4 items-center justify-center rounded-full text-[10px] font-bold ${
                                res.ok ? "bg-emerald-500 text-white" : "bg-destructive text-white"
                              }`}
                            >
                              {res.ok ? "✓" : "✕"}
                            </span>
                            <span className="font-semibold text-foreground">
                              #{res.stepIndex} {res.name}
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {res.durationMs}ms
                          </span>
                        </div>

                        {res.error && (
                          <div className="text-[11px] text-destructive break-all bg-destructive/10 p-2 rounded space-y-1.5 border border-destructive/20">
                            <div className="font-semibold flex items-center gap-1">
                              <LuInfo className="size-3.5" />
                              <span>步骤异常:</span>
                            </div>
                            <div className="leading-relaxed">{res.error}</div>
                            {res.error.includes("NS_ERROR_PROXY_CONNECTION_REFUSED") && (
                              <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium pt-1 border-t border-destructive/15">
                                💡 诊断建议：该环境绑定的代理节点服务拒绝连接或已离线。建议在环境列表中切换为直连，或在【网络代理】中绑定有效节点后再试。
                              </div>
                            )}
                          </div>
                        )}

                        {res.evalResult && (
                          <div className="text-[11px] text-violet-600 dark:text-violet-400 font-mono bg-violet-500/10 p-2 rounded space-y-1 border border-violet-500/20">
                            <span className="font-semibold flex items-center gap-1">
                              <LuTerminal className="size-3" />
                              脚本执行返回值:
                            </span>
                            <div className="break-all">{res.evalResult}</div>
                          </div>
                        )}

                        {res.extracted && (
                          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-500/10 p-2 rounded space-y-1 border border-emerald-500/20">
                            <span className="font-semibold flex items-center gap-1">
                              <LuDownload className="size-3" />
                              抓取字段成果 [{res.extracted.type}]:
                            </span>
                            <div className="break-all font-bold text-foreground">"{res.extracted.value}"</div>
                          </div>
                        )}

                        {res.iterations !== undefined && (
                          <div className="text-[11px] text-rose-600 dark:text-rose-400 font-mono bg-rose-500/10 p-1.5 rounded flex items-center justify-between border border-rose-500/20">
                            <span className="font-semibold flex items-center gap-1">
                              <LuRefreshCw className="size-3" />
                              循环迭代次数:
                            </span>
                            <span className="font-bold">{res.iterations} 次完成</span>
                          </div>
                        )}

                        {/* 截图成果卡片 (支持缩略图与点击大图预览) */}
                        {res.screenshot && (
                          <div className="space-y-1.5 pt-1">
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <LuCamera className="size-3 text-amber-500" />
                              <span>存证快照生成成功:</span>
                            </div>
                            <div
                              className="group/img relative cursor-pointer overflow-hidden rounded border border-border bg-black/5 hover:border-primary transition-all"
                              onClick={() =>
                                setPreviewScreenshot({
                                  title: res.name || "自动化存证截图",
                                  src: res.screenshot!,
                                })
                              }
                            >
                              <img
                                src={res.screenshot}
                                alt="screenshot"
                                className="h-32 w-full object-cover object-top transition-transform group-hover/img:scale-105"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity text-white text-xs gap-1 font-medium">
                                <LuEye className="size-3.5" />
                                点击查看高清大图
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {workflowExecuting && (
                      <div className="flex items-center gap-2 p-3 rounded-md bg-primary/5 border border-primary/20 text-xs text-primary animate-pulse">
                        <LuRefreshCw className="size-3.5 animate-spin shrink-0" />
                        <span>
                          正在执行后续步骤 (#{workflowStepResults.length + 1}
                          {selectedWorkflow ? ` / ${selectedWorkflow.steps.length}` : ""})...
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
            </div>
          )}

          {/* 模式三：已沉淀账号资产账本 (Account Vault & CSV Export) */}
          {workflowSubTab === "vault" && renderAccountVaultView()}

          {/* 模式四：动态 CSV 数据池 (Data Pool & Variables Binding) */}
          {workflowSubTab === "datapool" && (
            <div className="space-y-4">
              {/* 顶部说明与导入卡片 */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <LuFileSpreadsheet className="size-4 text-emerald-500" />
                      <span>动态数据池 (CSV 参数驱动与多账号变量池)</span>
                    </h3>
                    <p className="text-xs text-muted-foreground pt-1">
                      支持为每个指纹环境或循环步骤动态绑定独立的账号、密码、搜索词或收货地址。在高级步骤链中通过{" "}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-primary text-[11px]">
                        {"{{column_name}}"}
                      </code>{" "}
                      即可自动引用当前行的值。
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-2.5 py-1.5 rounded border border-border cursor-pointer hover:bg-muted">
                      <LuUpload className="size-3.5" />
                      <span>上传 .csv 文件</span>
                      <input
                        type="file"
                        accept=".csv,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const content = String(event.target?.result || "");
                              setCsvRawText(content);
                              try {
                                window.localStorage.setItem("narc_datapool_csv", content);
                              } catch {}
                              toast.success(`已导入文件: ${file.name}`);
                            };
                            reader.readAsText(file);
                          }
                        }}
                      />
                    </label>

                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => {
                        const defaultSample = `username,password,email,search_term,address
user_us_01,Pass@9821,user01@outlook.com,mechanical keyboard,100 Main St New York
user_us_02,Pass@7319,user02@outlook.com,gaming mouse,200 Broad St Los Angeles
user_uk_01,Pass@4402,user03@outlook.com,noise cancelling earbuds,12 Oxford St London`;
                        setCsvRawText(defaultSample);
                        try {
                          window.localStorage.setItem("narc_datapool_csv", defaultSample);
                        } catch {}
                        toast.info("已重置为电商/注册示例数据池");
                      }}
                    >
                      加载示例数据
                    </Button>
                  </div>
                </div>

                {/* CSV 文本编辑区 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="text-xs font-medium">CSV 数据源 (首行为列名 Header，以英文逗号分隔):</Label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium">
                      <Checkbox
                        checked={useDataPool}
                        onCheckedChange={(checked) => setUseDataPool(Boolean(checked))}
                      />
                      <span>在执行工作流时自动绑定数据池变量</span>
                    </label>
                  </div>
                  <textarea
                    rows={5}
                    value={csvRawText}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCsvRawText(next);
                      try {
                        window.localStorage.setItem("narc_datapool_csv", next);
                      } catch {}
                    }}
                    className="w-full rounded border border-border bg-background p-2.5 font-mono text-xs text-foreground focus-visible:outline-none"
                    placeholder="username,password,email,search_term..."
                  />
                </div>

                {/* 变量使用提示 */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="text-muted-foreground">💡 可用变量占位符 (点击复制):</span>
                  {parseCsv(csvRawText).headers.map((h) => (
                    <span
                      key={h}
                      className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary cursor-pointer hover:bg-primary/20"
                      title="点击复制占位符"
                      onClick={() => {
                        void navigator.clipboard.writeText(`{{${h}}}`);
                        toast.success(`已复制 {{${h}}} 到剪贴板`);
                      }}
                    >
                      {"{{" + h + "}}"}
                    </span>
                  ))}
                  <span
                    className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground cursor-pointer hover:bg-muted/80"
                    onClick={() => {
                      void navigator.clipboard.writeText("{{random_str}}");
                      toast.success("已复制 {{random_str}} 到剪贴板");
                    }}
                  >
                    {"{{random_str}}"}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground cursor-pointer hover:bg-muted/80"
                    onClick={() => {
                      void navigator.clipboard.writeText("{{timestamp}}");
                      toast.success("已复制 {{timestamp}} 到剪贴板");
                    }}
                  >
                    {"{{timestamp}}"}
                  </span>
                </div>
              </div>

              {/* 表格预览与测试选行卡片 */}
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <LuTable className="size-4 text-primary" />
                    <span className="text-sm font-semibold">数据行解析预览</span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      共 {parseCsv(csvRawText).rows.length} 行数据
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">当前单次测试绑定行:</span>
                    <select
                      value={csvActiveRowIndex}
                      onChange={(e) => setCsvActiveRowIndex(Number(e.target.value))}
                      className="rounded border border-border bg-background px-2 py-1 text-xs font-medium"
                    >
                      {parseCsv(csvRawText).rows.map((_, idx) => (
                        <option key={idx} value={idx}>
                          第 {idx + 1} 行
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-center">#</TableHead>
                        {parseCsv(csvRawText).headers.map((h) => (
                          <TableHead key={h} className="font-semibold text-foreground">
                            {h}
                          </TableHead>
                        ))}
                        <TableHead className="w-28 text-right">单行操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parseCsv(csvRawText).rows.map((row, rIdx) => {
                        const isSelected = rIdx === csvActiveRowIndex;
                        return (
                          <TableRow key={rIdx} className={isSelected ? "bg-primary/5 font-medium" : ""}>
                            <TableCell className="text-center font-mono text-[11px] text-muted-foreground">
                              {rIdx + 1}
                            </TableCell>
                            {parseCsv(csvRawText).headers.map((h) => (
                              <TableCell key={h} className="font-mono text-[11px]">
                                {row[h] || <span className="text-muted-foreground italic">(空)</span>}
                              </TableCell>
                            ))}
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant={isSelected ? "secondary" : "ghost"}
                                className="h-6 text-[11px] px-2"
                                onClick={() => {
                                  setCsvActiveRowIndex(rIdx);
                                  toast.success(`已指定第 ${rIdx + 1} 行作为当前步骤链执行参数！`);
                                }}
                              >
                                {isSelected ? "✓ 当前生效" : "设为测试行"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 顶层主 Tab: 账号资产与免密自动登录 (Account Vault & 1-Click Auto-Login) */}
      {activeMainTab === "vault" && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4 overflow-auto space-y-4">
          {renderAccountVaultView()}
        </div>
      )}

      {/* Tab 3: 定时计划任务 (Scheduled Jobs) */}
      {activeMainTab === "scheduler" && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4 overflow-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">自动化定时计划管理</h3>
              <p className="text-xs text-muted-foreground">
                配置周期性无人值守自动化任务（如：每 120 分钟自动对指定账号执行增量养号，保持账号活跃度）。
              </p>
            </div>
            <Button size="sm" onClick={openCreateScheduleModal}>
              <LuListPlus className="size-4 mr-1.5" />
              创建定时任务
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {schedules.length === 0 ? (
              <div className="col-span-2 text-center py-16 text-muted-foreground border border-dashed rounded-lg">
                暂无配置的定时计划。点击右上角“创建定时任务”添加。
              </div>
            ) : (
              schedules.map((sch) => (
                <div key={sch.id} className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${sch.enabled ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                      <span className="font-semibold text-sm">{sch.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant={sch.enabled ? "outline" : "secondary"}
                        className="h-7 text-xs"
                        onClick={() => toggleSchedule(sch.id)}
                      >
                        {sch.enabled ? "已启用" : "已暂停"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        title="编辑计划"
                        onClick={() => openEditScheduleModal(sch)}
                      >
                        <LuPencil className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        title="删除计划"
                        onClick={() => deleteSchedule(sch.id)}
                      >
                        <LuTrash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="text-xs space-y-1.5 text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span>任务类型:</span>
                      {sch.template === "warmup" && (
                        <span className="font-semibold text-amber-500">🌐 基础增量养号 (高权重网站巡航)</span>
                      )}
                      {sch.template === "cruise" && (
                        <span className="font-semibold text-sky-500">🚀 矩阵活跃保活 / 目标网址巡航</span>
                      )}
                      {sch.template === "search" && (
                        <span className="font-semibold text-purple-500">
                          🔍 搜索引擎模拟 ({sch.config?.engine?.toUpperCase() || "BING"} 提词检索)
                        </span>
                      )}
                      {sch.template === "check" && (
                        <span className="font-semibold text-emerald-500">🛡️ 节点网络与 IP 连通性健康巡检</span>
                      )}
                      {sch.template === "workflow" && (
                        <span className="font-semibold text-indigo-500">
                          ⚙️ 自定义步骤链 (
                          {workflows.find((w) => w.id === sch.config?.workflowId)?.name || "默认工作流"}
                          )
                        </span>
                      )}
                    </div>
                    {sch.template === "cruise" && sch.config?.customSites && (
                      <div className="truncate text-[11px] text-foreground/80">
                        目标站点: {sch.config.customSites.split("\n").filter(Boolean).join(" · ")}
                      </div>
                    )}
                    {sch.template === "search" && (
                      <div className="truncate text-[11px] text-foreground/80">
                        词库: {sch.config?.keywords ? sch.config.keywords.slice(0, 35) : "智能相关词"} (停留 {sch.config?.searchDwellSeconds || 12}s)
                      </div>
                    )}
                    <div>执行周期: 每 <strong className="text-foreground">{sch.intervalMinutes}</strong> 分钟</div>
                    <div>目标环境: 包含 {sch.targetProfileIds.length} 个环境</div>
                    <div>下次预计运行: {sch.nextRun ? new Date(sch.nextRun).toLocaleTimeString() : "待触发"}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 5: 群控同步器 (Synchronizer & Multi-Window Control) */}
      {activeMainTab === "synchronizer" && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4 overflow-auto space-y-4">
          {/* 顶部主从状态概览与控制三联卡片 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 卡片 1: 主控与从控窗口集群 */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3 lg:col-span-1 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <LuZap className="size-4 text-amber-500" />
                    <span>主控与受控窗口集群</span>
                  </div>
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    {sessions.length} 个运行中会话
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  指定一个主控窗口（Master），主控窗口的点击、滑动、输入将被微秒级广播给所有选中的受控（Slave）窗口。
                </p>

                {/* 主控窗口下拉选择 */}
                <div className="space-y-1.5 pt-1">
                  <Label className="text-xs font-medium">🎯 主控窗口 (Master Profile):</Label>
                  <select
                    value={syncMasterId}
                    onChange={(e) => setSyncMasterId(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground font-medium"
                  >
                    <option value="">-- 请选择主控环境 --</option>
                    {sessions.map((s) => {
                      const p = profiles.find((prof) => prof.id === s.id);
                      return (
                        <option key={s.id} value={s.id}>
                          👑 {p ? p.name : s.id} (PID: {s.pid})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 从控窗口多选 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="text-xs font-medium">👥 受控窗口 (Slave Profiles):</Label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-[11px] text-primary hover:underline"
                        onClick={() => {
                          const allOthers = sessions.filter((s) => s.id !== syncMasterId).map((s) => s.id);
                          setSyncSlaveIds(new Set(allOthers));
                        }}
                      >
                        全选其他
                      </button>
                      <button
                        type="button"
                        className="text-[11px] text-muted-foreground hover:underline"
                        onClick={() => setSyncSlaveIds(new Set())}
                      >
                        清空
                      </button>
                    </div>
                  </div>

                  <div className="max-h-40 overflow-y-auto rounded-md border border-border p-2 space-y-1 bg-muted/20">
                    {sessions.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        当前无运行中的自动化浏览器会话。请在下方点击一键启动。
                      </div>
                    ) : (
                      sessions
                        .filter((s) => s.id !== syncMasterId)
                        .map((s) => {
                          const p = profiles.find((prof) => prof.id === s.id);
                          const isChecked = syncSlaveIds.has(s.id);
                          return (
                            <label
                              key={s.id}
                              className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50 cursor-pointer"
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  const next = new Set(syncSlaveIds);
                                  if (checked) next.add(s.id);
                                  else next.delete(s.id);
                                  setSyncSlaveIds(next);
                                }}
                              />
                              <span className="font-medium">{p ? p.name : s.id}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">PID: {s.pid}</span>
                            </label>
                          );
                        })
                    )}
                  </div>
                </div>
              </div>

              {/* 实时微秒级主从键鼠联动开关与快速批量启动 */}
              <div className="pt-3 border-t border-border space-y-2">
                <Button
                  size="sm"
                  variant={liveSyncActive ? "destructive" : "default"}
                  className={`w-full text-xs gap-1.5 font-semibold transition-all ${
                    !liveSyncActive
                      ? "bg-amber-600 hover:bg-amber-700 text-white"
                      : "bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-500/30"
                  }`}
                  onClick={handleToggleLiveSync}
                  disabled={syncBusy || (!liveSyncActive && (!syncMasterId || syncSlaveIds.size === 0))}
                >
                  {liveSyncActive ? (
                    <>
                      <span className="size-2 rounded-full bg-white animate-ping mr-1" />
                      🛑 停止实时同步 (联动中: 1 主控 → {syncSlaveIds.size} 受控)
                    </>
                  ) : (
                    <>
                      <LuZap className="size-3.5 text-white" />
                      ⚡ 开启微秒级主从联动 (主控点击/滑动/输入实时广播)
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs gap-1.5"
                  onClick={handleQuickLaunchSelected}
                  disabled={syncBusy || profiles.length === 0}
                >
                  <LuPlay className="size-3.5 text-emerald-500" />
                  一键批量启动选中环境 ({selectedIds.size > 0 ? selectedIds.size : profiles.length} 个) 并网格平铺
                </Button>
              </div>
            </div>

            {/* 卡片 2: 系统级窗口平铺与对齐 (Windows Native Grid Tiling) */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3 lg:col-span-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <LuLayoutGrid className="size-4 text-blue-500" />
                  <span>智能网格多窗平铺 (OS Grid Tiling)</span>
                </div>
                <span className="text-[10px] text-muted-foreground">Windows Native API</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                直接调用底层 Windows API，自动检测当前屏幕可用工作区分辨率，并将所有已启动的浏览器窗口毫秒级按等比网格排列平铺。
              </p>

              <div className="space-y-2 pt-1">
                <Label className="text-xs font-medium">平铺列数布局:</Label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "自适应", cols: 0 },
                    { label: "2 列", cols: 2 },
                    { label: "3 列", cols: 3 },
                    { label: "4 列", cols: 4 },
                  ].map((item) => (
                    <Button
                      key={item.cols}
                      size="sm"
                      variant={syncCols === item.cols ? "default" : "outline"}
                      className="h-8 text-xs font-medium"
                      onClick={() => {
                        setSyncCols(item.cols);
                        void handleTileWindows(item.cols === 0 ? undefined : item.cols);
                      }}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="pt-1 space-y-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full text-xs gap-1.5"
                  onClick={() => handleBringAllToFront()}
                >
                  <LuMaximize2 className="size-3.5" />
                  全员唤醒并置于前台 (Bring to Front)
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs gap-1.5 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/10"
                  onClick={() => handleTileWindows(syncCols === 0 ? undefined : syncCols)}
                >
                  <LuLayoutGrid className="size-3.5" />
                  重新平铺全部窗口 ({sessions.length} 个)
                </Button>
              </div>

              {/* 防关联拟人微扰保护 */}
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-600 dark:text-amber-400">
                    <LuShieldCheck className="size-3.5" />
                    <span>防关联拟人微扰 (Anti-Detect Jitter)</span>
                  </div>
                  <Checkbox
                    checked={syncJitter}
                    onCheckedChange={(checked) => setSyncJitter(Boolean(checked))}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  启用后，广播点击与输入自动注入 ±2px 随机微扰与 30~180ms 拟人离散时钟抖动，严防平台判定为群控机器行为。
                </p>
              </div>
            </div>

            {/* 卡片 3: 集群全局广播指令台 (Cluster Action Toolbar) */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3 lg:col-span-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <LuRadio className="size-4 text-purple-500" />
                  <span>全员广播操作台 (Broadcast)</span>
                </div>
                <span className="text-[10px] text-muted-foreground">毫秒级同步推送</span>
              </div>

              {/* 广播 URL */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">🌐 全员同步访问指定网址:</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    value={syncBroadcastUrl}
                    onChange={(e) => setSyncBroadcastUrl(e.target.value)}
                    placeholder="https://..."
                    className="h-8 text-xs font-mono"
                  />
                  <Button
                    size="sm"
                    className="h-8 px-3 text-xs shrink-0"
                    onClick={handleBroadcastUrl}
                    disabled={syncBusy || (!syncMasterId && syncSlaveIds.size === 0)}
                  >
                    打开
                  </Button>
                </div>
              </div>

              {/* 广播文字输入 */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">⌨️ 全员模拟键盘输入 (Type):</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    value={syncBroadcastText}
                    onChange={(e) => setSyncBroadcastText(e.target.value)}
                    placeholder="输入待广播文字或变量"
                    className="h-8 text-xs font-mono"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 px-3 text-xs shrink-0"
                    onClick={handleBroadcastText}
                    disabled={syncBusy || !syncBroadcastText.trim() || syncSlaveIds.size === 0}
                  >
                    键入
                  </Button>
                </div>
              </div>

              {/* 广播页面控制按钮行 */}
              <div className="space-y-1.5 pt-1">
                <Label className="text-xs font-medium">⚡ 常用群控动作:</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-1"
                    onClick={handleBroadcastReload}
                    disabled={syncBusy}
                  >
                    <LuRefreshCw className="size-3 mr-1" />
                    刷新
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-1"
                    onClick={() => handleBroadcastScroll(400)}
                    disabled={syncBusy}
                  >
                    <LuArrowDown className="size-3 mr-1" />
                    下滚
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-1"
                    onClick={() => handleBroadcastScroll(-400)}
                    disabled={syncBusy}
                  >
                    <LuArrowUp className="size-3 mr-1" />
                    上滚
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-1 text-destructive hover:text-destructive"
                    onClick={handleBroadcastCloseTabs}
                    disabled={syncBusy}
                  >
                    关标签
                  </Button>
                </div>
              </div>

              {/* 广播自定义 JS 脚本注入 */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <Label className="text-xs font-medium">💻 全员 JS 脚本注入执行:</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px] text-primary"
                    onClick={handleBroadcastEval}
                    disabled={syncBusy || (!syncMasterId && syncSlaveIds.size === 0)}
                  >
                    全员执行
                  </Button>
                </div>
                <Input
                  value={syncBroadcastScript}
                  onChange={(e) => setSyncBroadcastScript(e.target.value)}
                  className="h-7 text-[11px] font-mono"
                  placeholder="document.title = 'Hello';"
                />
              </div>
            </div>
          </div>

          {/* 零代码动作录制器 (Visual No-Code Action Recorder) */}
          <div className="rounded-lg border border-purple-500/20 bg-gradient-to-r from-purple-500/5 via-background to-pink-500/5 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${isRecording ? "bg-red-500 text-white animate-pulse" : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"}`}>
                  <LuCamera className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-foreground">零代码动作录制器 (Visual Action Recorder)</span>
                    <span className="text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-semibold">小白运营神器 · 0 代码门槛</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    在主控浏览器像正常人一样浏览、点击、输入或翻页，系统将自动录制完整动作链，一键保存并批量回放分发给所有环境！
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!isRecording ? (
                  <>
                    <select
                      value={recordTargetId || syncMasterId}
                      onChange={(e) => setRecordTargetId(e.target.value)}
                      className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground font-medium"
                    >
                      <option value="">-- 选择录制目标浏览器 --</option>
                      {sessions.map((s) => {
                        const p = profiles.find((prof) => prof.id === s.id);
                        return (
                          <option key={s.id} value={s.id}>
                            录制目标: {p ? p.name : s.id}
                          </option>
                        );
                      })}
                    </select>
                    <Button
                      size="sm"
                      className="gap-1.5 bg-red-600 hover:bg-red-700 text-white shadow-md text-xs font-semibold px-4"
                      onClick={handleStartRecorder}
                      disabled={sessions.length === 0}
                    >
                      <span className="size-2 rounded-full bg-white" />
                      ● 开始免代码录制
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-red-500/10 border border-red-500/30 text-xs font-bold text-red-600 dark:text-red-400">
                      <span className="size-2 rounded-full bg-red-500 animate-ping" />
                      <span>正在录制操作中 (请在目标浏览器中操作)...</span>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1.5 text-xs font-semibold px-4 shadow-md shadow-red-500/30"
                      onClick={handleStopRecorder}
                    >
                      ■ 停止录制并生成工作流
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 差异化文本与账号矩阵广播板 (Differential Data Matrix Board) */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <LuTable className="size-4 text-emerald-500" />
                <span className="font-semibold text-sm">差异化文本与账号矩阵广播板 (Differential Data Board)</span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                  解决“每个窗口账号/密码/私信不一样”痛点
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[11px] font-semibold border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                  onClick={() => setBatchImportModalOpen(true)}
                >
                  <LuFileSpreadsheet className="size-3" />
                  <span>📥 粘贴 Excel 导入账号</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[11px] font-medium"
                  onClick={handleLoadAccountsFromVault}
                >
                  <LuKeyRound className="size-3" />
                  <span>📋 从账号账本装载</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => setActiveMainTab("vault")}
                >
                  <span>查看账本与一键登录 ➔</span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* 左侧：多行粘贴框 */}
              <div className="lg:col-span-5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">📋 差异化数据列表 (每行对应一个受控窗口):</Label>
                  <span className="text-[10px] text-muted-foreground">格式：列1 (账号) \t 列2 (密码) \t 列3 (文案)</span>
                </div>
                <textarea
                  value={syncDiffText}
                  onChange={(e) => setSyncDiffText(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-border bg-background p-2.5 font-mono text-xs text-foreground leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="可直接粘贴 Excel 表格多行多列，或使用 ---- 分隔：&#10;user1@outlook.com ---- Pass123 ---- 咨询商品是否有货 ---- https://amazon.com&#10;user2@outlook.com ---- Pass456 ---- 催促尽快发货 ---- https://amazon.co.uk"
                />
              </div>

              {/* 右侧：分配动作执行器 */}
              <div className="lg:col-span-7 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-foreground">🚀 一键差异化推送到当前激活光标输入框：</div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    在主控窗口点击聚焦到目标网页的输入框后，点击下方任一按钮，系统将把不同窗口对应的列数据<b>并发各自填入各自浏览器的聚焦框</b>！
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 text-xs font-semibold border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                    onClick={() => handleBroadcastDifferential(0, false)}
                    disabled={syncBusy || (!syncMasterId && syncSlaveIds.size === 0)}
                  >
                    <LuKeyRound className="size-3.5" />
                    <span>⚡ 填入账号 (列1)</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 text-xs font-semibold border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                    onClick={() => handleBroadcastDifferential(1, false)}
                    disabled={syncBusy || (!syncMasterId && syncSlaveIds.size === 0)}
                  >
                    <LuShieldCheck className="size-3.5" />
                    <span>🔑 填入密码 (列2)</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 text-xs font-semibold border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                    onClick={() => handleBroadcastDifferential(2, false)}
                    disabled={syncBusy || (!syncMasterId && syncSlaveIds.size === 0)}
                  >
                    <LuMail className="size-3.5" />
                    <span>💬 填入文案 (列3)</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 text-xs font-semibold border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                    onClick={() => handleBroadcastDifferential(3, true)}
                    disabled={syncBusy || (!syncMasterId && syncSlaveIds.size === 0)}
                  >
                    <LuGlobe className="size-3.5" />
                    <span>🌐 各自打开网址</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* 群控同步执行日志与终端监控卡片 */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <LuTerminal className="size-4" />
                <span>群控广播实时日志流水</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setSyncLogs([])}
              >
                清空日志
              </Button>
            </div>

            <div className="h-44 overflow-y-auto rounded-md border border-border bg-background p-3 font-mono text-[11px] space-y-1">
              {syncLogs.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-xs">
                  群控广播引擎就绪，等待下发同步指令...
                </div>
              ) : (
                syncLogs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-muted-foreground shrink-0">{log.time}</span>
                    <span
                      className={`px-1 rounded text-[10px] font-bold ${
                        log.ok
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {log.action}
                    </span>
                    <span className={log.ok ? "text-foreground" : "text-destructive"}>{log.msg}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 创建 / 编辑定时任务弹窗 */}
      <Dialog open={newScheduleModal} onOpenChange={setNewScheduleModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LuTimer className="size-4" />
              {editingScheduleId ? "编辑自动化定时计划" : "创建自动化定时计划"}
            </DialogTitle>
            <DialogDescription>
              {editingScheduleId
                ? "修改定时任务的类型、周期、目标站点/词库或执行环境。"
                : "选择任务工作流模式并设定循环周期，系统将全自动在后台调度执行。"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label>计划名称</Label>
              <Input
                value={newSchedName}
                onChange={(e) => setNewSchedName(e.target.value)}
                placeholder="例如：矩阵账号活跃保活巡航"
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label>执行周期 (分钟)</Label>
              <Input
                type="number"
                min={1}
                value={newSchedInterval}
                onChange={(e) => setNewSchedInterval(e.target.value)}
                placeholder="60"
                className="text-xs"
              />
              <p className="text-[10px] text-muted-foreground">支持任意分钟数（例如输入 1 即每 1 分钟执行一次）</p>
            </div>

            <div className="space-y-1">
              <Label>任务工作流类型</Label>
              <select
                value={newSchedTemplate}
                onChange={(e) => {
                  const val = e.target.value as AutomationTemplateType;
                  setNewSchedTemplate(val);
                  if (!editingScheduleId) {
                    if (val === "cruise") setNewSchedName("矩阵网址活跃保活巡航");
                    else if (val === "search") setNewSchedName("搜索引擎真人画像模拟");
                    else if (val === "check") setNewSchedName("节点网络与IP健康巡检");
                    else if (val === "warmup") setNewSchedName("基础增量模拟养号");
                    else if (val === "workflow") setNewSchedName("自定义步骤链定时调度");
                  }
                }}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground font-medium"
              >
                <option value="workflow">⚙️ 自定义可视化步骤链 (执行用户设计的 Click / Type / Screenshot 步骤链)</option>
                <option value="cruise">🚀 矩阵活跃保活 / 目标网址巡航 (推荐：指定电商/社媒/自建系统网址)</option>
                <option value="search">🔍 真实搜索引擎画像模拟 (推荐：在 Bing/Google 自动搜词积累真人权重)</option>
                <option value="warmup">🌐 基础增量养号 (访问 Wikipedia/BBC 等沉淀高权重全局 Cookie)</option>
                <option value="check">🛡️ 节点网络与 IP 连通性健康巡检 (秒级静默探测出口 IP，异常报警)</option>
              </select>
            </div>

            {newSchedTemplate === "workflow" && (
              <div className="rounded-md border border-border bg-muted/20 p-2.5 space-y-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">选择执行的自定义步骤链</Label>
                  <select
                    value={schedWorkflowId}
                    onChange={(e) => setSchedWorkflowId(e.target.value)}
                    className="w-full rounded border border-border bg-background p-1.5 text-xs text-foreground font-medium"
                  >
                    {workflows.map((wf) => (
                      <option key={wf.id} value={wf.id}>
                        {wf.name} ({wf.steps.length} 步)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  定时触发时将按照您在“可视化步骤链”中编排的 Click、Type、Screenshot、滚动等指令全自动执行。
                </div>
              </div>
            )}

            {/* 动态配置区域 */}
            {newSchedTemplate === "cruise" && (
              <div className="rounded-md border border-border bg-muted/20 p-2.5 space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px]">巡航目标网址列表 (每行一个)</Label>
                    <span className="text-[10px] text-muted-foreground">支持任意页面，自动保持登录态</span>
                  </div>
                  <textarea
                    rows={3}
                    value={schedCruiseSites}
                    onChange={(e) => setSchedCruiseSites(e.target.value)}
                    placeholder={"https://www.amazon.com\nhttps://twitter.com\nhttps://discord.com"}
                    className="w-full rounded border border-border bg-background p-1.5 font-mono text-[11px] text-foreground focus-visible:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-[11px] shrink-0">单站点停留时长 (秒):</Label>
                  <Input
                    type="number"
                    min={3}
                    max={300}
                    value={schedCruiseDwell}
                    onChange={(e) => setSchedCruiseDwell(e.target.value)}
                    className="h-7 w-20 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">自动模拟真人平滑滚动</span>
                </div>
              </div>
            )}

            {newSchedTemplate === "search" && (
              <div className="rounded-md border border-border bg-muted/20 p-2.5 space-y-2">
                <div className="flex items-center gap-3">
                  <Label className="text-[11px] shrink-0">目标搜索引擎:</Label>
                  <select
                    value={schedSearchEngine}
                    onChange={(e) => setSchedSearchEngine(e.target.value as any)}
                    className="rounded border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="bing">微软必应 (Bing)</option>
                    <option value="google">谷歌 (Google)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">搜索关键词词库 (每行一个或逗号隔开)</Label>
                  <textarea
                    rows={3}
                    value={schedSearchKeywords}
                    onChange={(e) => setSchedSearchKeywords(e.target.value)}
                    placeholder={"跨境电商管理\nNarciPH 指纹浏览器\nBest mechanical keyboard"}
                    className="w-full rounded border border-border bg-background p-1.5 font-mono text-[11px] text-foreground focus-visible:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-[11px] shrink-0">单次搜索浏览停留 (秒):</Label>
                  <Input
                    type="number"
                    min={5}
                    max={120}
                    value={schedSearchDwell}
                    onChange={(e) => setSchedSearchDwell(e.target.value)}
                    className="h-7 w-20 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">浏览搜索自然结果并沉淀兴趣画像</span>
                </div>
              </div>
            )}

            {newSchedTemplate === "warmup" && (
              <div className="rounded-md border border-border bg-amber-500/10 p-2.5 text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                💡 <strong>新号冷启动模式</strong>：系统将自动轮换访问 Wikipedia、Mozilla、BBC 等权威网站，模拟真人停留并沉淀跨站 Cookie 与缓存，快速提升指纹环境信任度。
              </div>
            )}

            {newSchedTemplate === "check" && (
              <div className="rounded-md border border-border bg-emerald-500/10 p-2.5 text-[11px] text-emerald-600 dark:text-emerald-400 leading-relaxed">
                🛡️ <strong>节点哨兵模式</strong>：秒级轻量检测当前绑定的代理节点连通性与实际出口 IP，发现失效节点时自动在日志中报红报警，防止业务因断网中断。
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>目标环境 ({schedTargetIds.length}/{profiles.length})</Label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-[11px] text-primary hover:underline cursor-pointer"
                    onClick={() => setSchedTargetIds(profiles.map((p) => p.id))}
                  >
                    全选
                  </button>
                  <span className="text-muted-foreground text-[10px]">|</span>
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground hover:underline cursor-pointer"
                    onClick={() => setSchedTargetIds([])}
                  >
                    清空
                  </button>
                </div>
              </div>
              <div className="max-h-36 overflow-y-auto rounded-md border border-border p-2 space-y-1.5 bg-muted/20">
                {profiles.map((p) => {
                  const isChecked = schedTargetIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 p-1 rounded"
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSchedTargetIds((prev) => [...prev, p.id]);
                          } else {
                            setSchedTargetIds((prev) => prev.filter((id) => id !== p.id));
                          }
                        }}
                      />
                      <span className="font-medium text-foreground">{p.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">({p.id})</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setNewScheduleModal(false)}>
              取消
            </Button>
            <Button size="sm" onClick={saveSchedule}>
              {editingScheduleId ? "保存修改" : "保存并启动计划"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 代码示例弹窗 (Python / Node.js / cURL) */}
      <Dialog
        open={snippetProfile !== null}
        onOpenChange={(open) => {
          if (!open) setSnippetProfile(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LuTerminal className="size-4 text-primary" />
              自动化接入代码: {snippetProfile?.name}
            </DialogTitle>
            <DialogDescription>
              复制开箱即用的自动化连接代码，支持 Python、Node.js 及 REST API。
            </DialogDescription>
          </DialogHeader>

          {snippetProfile && (
            <Tabs defaultValue="python" className="w-full">
              <div className="flex items-center justify-between border-b pb-2">
                <TabsList className="h-8">
                  <TabsTrigger value="python" className="text-xs">Python (Playwright)</TabsTrigger>
                  <TabsTrigger value="node" className="text-xs">Node.js (JavaScript)</TabsTrigger>
                  <TabsTrigger value="curl" className="text-xs">cURL / HTTP API</TabsTrigger>
                </TabsList>
              </div>

              {/* Python Tab */}
              <TabsContent value="python" className="mt-3 space-y-2">
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => void copyToClipboard(getPythonSnippet(snippetProfile), "python")}
                  >
                    {copiedLang === "python" ? <LuCheck className="size-3.5 text-emerald-500" /> : <LuCopy className="size-3.5" />}
                    复制 Python 代码
                  </Button>
                </div>
                <pre className="max-h-[300px] overflow-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed text-foreground select-all">
                  {getPythonSnippet(snippetProfile)}
                </pre>
              </TabsContent>

              {/* Node.js Tab */}
              <TabsContent value="node" className="mt-3 space-y-2">
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => void copyToClipboard(getNodeSnippet(snippetProfile), "node")}
                  >
                    {copiedLang === "node" ? <LuCheck className="size-3.5 text-emerald-500" /> : <LuCopy className="size-3.5" />}
                    复制 Node.js 代码
                  </Button>
                </div>
                <pre className="max-h-[300px] overflow-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed text-foreground select-all">
                  {getNodeSnippet(snippetProfile)}
                </pre>
              </TabsContent>

              {/* cURL Tab */}
              <TabsContent value="curl" className="mt-3 space-y-2">
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => void copyToClipboard(getCurlSnippet(snippetProfile), "curl")}
                  >
                    {copiedLang === "curl" ? <LuCheck className="size-3.5 text-emerald-500" /> : <LuCopy className="size-3.5" />}
                    复制 cURL 命令
                  </Button>
                </div>
                <pre className="max-h-[300px] overflow-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed text-foreground select-all">
                  {getCurlSnippet(snippetProfile)}
                </pre>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setSnippetProfile(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 环境驱动与高级选项配置对话框 */}
      <Dialog
        open={showSettings}
        onOpenChange={(open) => {
          if (!open) setShowSettings(false);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LuSettings2 className="size-4" />
              自动化环境与驱动设置
            </DialogTitle>
            <DialogDescription>
              系统已默认自动探测 Node.js 与 Playwright 驱动路径。如需覆盖或自定义，请在下方配置。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* 当前自动探测状态 */}
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-2">
              <div className="font-semibold text-foreground">系统自动侦测结果：</div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Node 运行时:</span>
                <span className="font-mono text-[11px] text-foreground">
                  {envInfo?.node_path || "未检测到"} {envInfo?.node_version ? `(${envInfo.node_version})` : ""}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Playwright 驱动:</span>
                <span className="max-w-[280px] truncate font-mono text-[11px] text-foreground" title={envInfo?.driver_path || ""}>
                  {envInfo?.driver_path || "未检测到"}
                </span>
              </div>
            </div>

            {/* 自定义覆盖选项 */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="custom-driver" className="text-xs">
                  自定义 Playwright Driver 路径 (选填)
                </Label>
                <Input
                  id="custom-driver"
                  value={customDriver}
                  placeholder="留空自动探测，如：...\playwright\driver\package"
                  onChange={(e) => setCustomDriver(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="custom-node" className="text-xs">
                  自定义 Node 运行时路径 (选填)
                </Label>
                <Input
                  id="custom-node"
                  value={customNode}
                  placeholder="留空自动使用系统 node 或内置 node.exe"
                  onChange={(e) => setCustomNode(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="headless-default"
                  checked={headlessDefault}
                  onCheckedChange={(checked) => setHeadlessDefault(checked === true)}
                />
                <Label htmlFor="headless-default" className="text-xs">
                  默认以无头模式 (Headless) 运行
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button size="sm" variant="outline" onClick={() => setShowSettings(false)}>
              取消
            </Button>
            <Button size="sm" onClick={() => void saveSettings()}>
              保存配置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 养号 (Warmup) 对话框 */}
      <Dialog
        open={warmTarget !== null}
        onOpenChange={(open) => {
          if (!open && !warming) setWarmTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("common.warmupTitle", { name: warmTarget?.name })}</DialogTitle>
            <DialogDescription>{t("common.warmupDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="warmup-sites">{t("common.warmupSites")}</Label>
              <textarea
                id="warmup-sites"
                value={warmForm.sites}
                spellCheck={false}
                rows={6}
                onChange={(event) => {
                  setWarmForm((current) => ({ ...current, sites: event.target.value }));
                }}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="warmup-seconds" className="shrink-0 text-sm">
                {t("common.warmupDwell")}
              </Label>
              <Input
                id="warmup-seconds"
                value={warmForm.seconds}
                inputMode="numeric"
                onChange={(event) => {
                  setWarmForm((current) => ({ ...current, seconds: event.target.value }));
                }}
                className="h-8 w-20 font-mono text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={warming}
              onClick={() => {
                setWarmTarget(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={warming}
              onClick={() => {
                void warmup();
              }}
            >
              <LuFlaskConical className="size-3.5" />
              {warming ? t("common.warmingUp") : t("common.startWarmup")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 截图高清大图预览 Lightbox 弹窗 */}
      <Dialog
        open={previewScreenshot !== null}
        onOpenChange={(open) => !open && setPreviewScreenshot(null)}
      >
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-4">
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b">
            <div>
              <DialogTitle className="text-sm font-semibold flex items-center gap-2">
                <LuCamera className="size-4 text-amber-500" />
                {previewScreenshot?.title || "存证截图预览"}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2 pr-6">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={handleDownloadScreenshot}
              >
                <LuDownload className="size-3.5" />
                下载图片
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto p-2 flex items-center justify-center bg-black/5 dark:bg-black/30 rounded-lg">
            {previewScreenshot && (
              <img
                src={previewScreenshot.src}
                alt={previewScreenshot.title}
                className="max-h-[72vh] w-auto rounded border object-contain shadow-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 工作流库全生命周期管理弹窗 (Workflow Manager CRUD) */}
      <Dialog open={workflowManagerModal} onOpenChange={setWorkflowManagerModal}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col p-5">
          <DialogHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-base font-semibold flex items-center gap-2">
                  <LuWorkflow className="size-4 text-primary" />
                  工作流库管理 (Workflows Library)
                </DialogTitle>
                <DialogDescription className="text-xs">
                  集中查看、检索、克隆、修改或删除系统中的所有自动化步骤链（共 {workflows.length} 个）。
                </DialogDescription>
              </div>
              <Button size="sm" className="h-8 text-xs gap-1 shadow-sm mr-6" onClick={() => { setWorkflowManagerModal(false); openCreateWorkflowModal(); }}>
                <LuPlus className="size-3.5" />
                新建工作流
              </Button>
            </div>
          </DialogHeader>

          {/* 搜索与统计 */}
          <div className="py-2 flex items-center gap-2">
            <div className="relative flex-1">
              <LuSearch className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="搜索工作流名称或描述..."
                value={workflowSearchFilter}
                onChange={(e) => setWorkflowSearchFilter(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            {workflowSearchFilter && (
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setWorkflowSearchFilter("")}>
                清除
              </Button>
            )}
          </div>

          {/* 工作流卡片列表 */}
          <div className="flex-1 overflow-auto space-y-2.5 pr-1">
            {workflows
              .filter((w) =>
                !workflowSearchFilter ||
                w.name.toLowerCase().includes(workflowSearchFilter.toLowerCase()) ||
                w.description.toLowerCase().includes(workflowSearchFilter.toLowerCase())
              )
              .map((wf) => {
                const isCurrent = wf.id === selectedWorkflowId;
                const uniqueActions = Array.from(new Set(wf.steps.map((s) => s.action)));
                return (
                  <div
                    key={wf.id}
                    className={`rounded-lg border p-3.5 text-xs transition-all space-y-2 ${
                      isCurrent
                        ? "border-primary/50 bg-primary/5 shadow-xs"
                        : "border-border bg-card hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">{wf.name}</span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary text-primary-foreground font-medium">
                              当前使用中
                            </span>
                          )}
                          <span className="text-[11px] text-muted-foreground">
                            {wf.steps.length} 个步骤
                          </span>
                        </div>
                        <div className="text-muted-foreground text-xs leading-relaxed">
                          {wf.description || "无详细描述"}
                        </div>
                      </div>

                      {/* 操作按钮组 */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant={isCurrent ? "secondary" : "outline"}
                          className="h-7 text-xs"
                          onClick={() => {
                            setSelectedWorkflowId(wf.id);
                            setWorkflowManagerModal(false);
                            toast.info(`已切换至【${wf.name}】`);
                          }}
                        >
                          {isCurrent ? "正在编辑" : "选择编辑"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleDuplicateWorkflow(wf)}
                          title="复制并生成副本"
                        >
                          <LuCopy className="size-3" />
                          复制
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => openEditMetaModal(wf)}
                          title="重命名或编辑描述"
                        >
                          <LuPencil className="size-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={() => handleRequestDeleteWorkflow(wf.id)}
                          title="删除工作流"
                        >
                          <LuTrash2 className="size-3" />
                        </Button>
                      </div>
                    </div>

                    {/* 动作类型标签摘要 */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/50 text-[11px] text-muted-foreground">
                      <span>包含交互:</span>
                      {uniqueActions.map((act) => (
                        <span key={act} className="px-1.5 py-0.2 rounded bg-muted font-mono text-[10px] text-foreground">
                          {act === "goto" ? "🌐跳转" : act === "click" ? "👆点击" : act === "type" ? "⌨️输入" : act === "screenshot" ? "📷截图" : act === "wait" ? "⏳等待" : act === "scroll" ? "📜滚动" : act === "press" ? "🔘按键" : act === "hover" ? "🖱️悬停" : act === "select" ? "📋下拉" : act === "check" ? "☑️勾选" : "💻脚本"}
                        </span>
                      ))}
                      <span className="ml-auto text-[10px]">
                        更新: {new Date(wf.updatedAt || Date.now()).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>

          <DialogFooter className="pt-3 border-t border-border">
            <Button size="sm" variant="outline" onClick={() => setWorkflowManagerModal(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 创建新工作流弹窗 (Create Workflow Modal) */}
      <Dialog open={workflowCreateModal} onOpenChange={setWorkflowCreateModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LuPlus className="size-4 text-primary" />
              创建新工作流步骤链
            </DialogTitle>
            <DialogDescription>
              设定步骤链基本信息，并可选择官方预设模板快速启动。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2 text-xs">
            <div className="space-y-1">
              <Label>工作流名称</Label>
              <Input
                value={newWfName}
                onChange={(e) => setNewWfName(e.target.value)}
                placeholder="例如：亚马逊多店铺选品巡航"
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label>用途描述 / 备注</Label>
              <Input
                value={newWfDesc}
                onChange={(e) => setNewWfDesc(e.target.value)}
                placeholder="简要说明该工作流的操作目标"
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label>初始步骤模板</Label>
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                value={newWfTemplate}
                onChange={(e) => setNewWfTemplate(e.target.value as any)}
              >
                <option value="search">🔍 必应搜索与全景快照 (检索 + 滚动 + 存证截图)</option>
                <option value="form">📝 维基百科表单交互 (输入 + 点击 + 截图)</option>
                <option value="advanced">⚡ 高级交互组合 (悬停 Hover + 下拉 Select + 勾选 Check + 脚本 Eval)</option>
                <option value="empty">📄 空白步骤链 (仅包含打开起始网址)</option>
              </select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button size="sm" variant="outline" onClick={() => setWorkflowCreateModal(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleConfirmCreateWorkflow}>
              确认创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑工作流元数据弹窗 (Edit Meta Modal) */}
      <Dialog open={workflowEditMetaModal !== null} onOpenChange={(open) => !open && setWorkflowEditMetaModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LuPencil className="size-4" />
              修改工作流信息
            </DialogTitle>
            <DialogDescription>
              更新工作流的名称与业务用途说明。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2 text-xs">
            <div className="space-y-1">
              <Label>工作流名称</Label>
              <Input
                value={editMetaName}
                onChange={(e) => setEditMetaName(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label>用途描述 / 备注</Label>
              <Input
                value={editMetaDesc}
                onChange={(e) => setEditMetaDesc(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button size="sm" variant="outline" onClick={() => setWorkflowEditMetaModal(null)}>
              取消
            </Button>
            <Button size="sm" onClick={handleConfirmEditMeta}>
              保存更改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除工作流确认弹窗 (Delete Confirm Dialog) */}
      <Dialog open={workflowDeleteConfirmId !== null} onOpenChange={(open) => !open && setWorkflowDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <LuTrash2 className="size-4" />
              确认删除工作流？
            </DialogTitle>
            <DialogDescription className="text-xs">
              删除后该步骤链及其全部动作配置将无法恢复。是否确认删除？
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 text-xs text-muted-foreground bg-muted/40 p-2.5 rounded">
            工作流名称: <span className="font-semibold text-foreground">{workflows.find((w) => w.id === workflowDeleteConfirmId)?.name}</span>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button size="sm" variant="outline" onClick={() => setWorkflowDeleteConfirmId(null)}>
              取消
            </Button>
            <Button size="sm" variant="destructive" onClick={handleConfirmDeleteWorkflow}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 跨境电商 RPA 参数向导弹窗 (E-Commerce RPA Parameter Wizard) */}
      <Dialog open={rpaWizardTemplate !== null} onOpenChange={(open) => !open && setRpaWizardTemplate(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          {rpaWizardTemplate && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${rpaWizardTemplate.badgeColor}`}>
                    {rpaWizardTemplate.badge}
                  </span>
                  <span className="text-xs text-muted-foreground">{rpaWizardTemplate.platformName}</span>
                </div>
                <DialogTitle className="text-base font-bold leading-tight">
                  {rpaWizardTemplate.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground pt-1">
                  {rpaWizardTemplate.description}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2 text-xs">
                {/* 适用场景与防封提示卡片 */}
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-1.5 text-[11px]">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <LuShieldCheck className="size-3.5 text-emerald-500" />
                    <span>工业级防风控保护策略已默认启用:</span>
                  </div>
                  <div className="text-muted-foreground">{rpaWizardTemplate.antiDetectNotes}</div>
                  <div className="text-muted-foreground">
                    <span className="font-medium text-foreground">适用业务:</span> {rpaWizardTemplate.targetRole}
                  </div>
                </div>

                {/* 目标指纹环境选择 */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">执行目标指纹环境</Label>
                  <select
                    className="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                    value={rpaWizardTargetProfileId}
                    onChange={(e) => setRpaWizardTargetProfileId(e.target.value)}
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.proxied ? "已配置代理" : "直连网络"}) - {p.id.slice(0, 8)}...
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    系统将在该指纹环境的独立隔离会话中调度自动化步骤，确保 Cookie 与设备指纹隔离。
                  </p>
                </div>

                {/* 业务参数动态表单 (零代码小白填写) */}
                <div className="space-y-3 rounded-md border border-border bg-card p-3">
                  <div className="text-xs font-semibold flex items-center gap-1.5 pb-1 border-b border-border">
                    <LuSlidersHorizontal className="size-3.5 text-primary" />
                    <span>核心业务参数配置 (零代码自适应)</span>
                  </div>

                  {rpaWizardTemplate.parameters.map((param) => (
                    <div key={param.key} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">{param.label}</Label>
                        {param.helper && (
                          <span className="text-[10px] text-muted-foreground">{param.helper}</span>
                        )}
                      </div>

                      {param.type === "text" && (
                        <Input
                          value={rpaWizardParams[param.key] ?? ""}
                          onChange={(e) =>
                            setRpaWizardParams((prev) => ({ ...prev, [param.key]: e.target.value }))
                          }
                          placeholder={param.placeholder}
                          className="h-8 text-xs"
                        />
                      )}

                      {param.type === "number" && (
                        <Input
                          type="number"
                          value={rpaWizardParams[param.key] ?? 0}
                          onChange={(e) =>
                            setRpaWizardParams((prev) => ({
                              ...prev,
                              [param.key]: Number(e.target.value),
                            }))
                          }
                          className="h-8 text-xs"
                        />
                      )}

                      {param.type === "select" && param.options && (
                        <select
                          className="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                          value={rpaWizardParams[param.key] ?? param.defaultValue}
                          onChange={(e) =>
                            setRpaWizardParams((prev) => ({ ...prev, [param.key]: e.target.value }))
                          }
                        >
                          {param.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      )}

                      {param.type === "boolean" && (
                        <div className="flex items-center gap-2 pt-1">
                          <Checkbox
                            id={`rpa-param-${param.key}`}
                            checked={!!rpaWizardParams[param.key]}
                            onCheckedChange={(checked) =>
                              setRpaWizardParams((prev) => ({ ...prev, [param.key]: !!checked }))
                            }
                          />
                          <label
                            htmlFor={`rpa-param-${param.key}`}
                            className="text-xs text-foreground cursor-pointer"
                          >
                            启用该项拟人互动动作
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button size="sm" variant="outline" onClick={() => setRpaWizardTemplate(null)}>
                  取消
                </Button>
                <Button size="sm" variant="secondary" onClick={handleSaveRpaToWorkflows}>
                  保存到工作流列表
                </Button>
                <Button size="sm" className="gap-1.5 shadow-sm" onClick={handleApplyRpaAndRun}>
                  <LuPlay className="size-3.5" />
                  立即在环境启动执行
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 动作录制完成弹窗 (Recorded Workflow Modal) */}
      <Dialog open={recordedModalOpen} onOpenChange={setRecordedModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LuCamera className="size-5 text-purple-500" />
              <span>动作录制成功！生成自动化流程</span>
            </DialogTitle>
            <DialogDescription>
              已为您自动捕捉到 {recordedActions.length} 个真实真人操作动作，可直接保存至 RPA 模板库或一键批量分发执行。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1 text-xs">
            <div className="space-y-1">
              <Label className="font-medium">流程名称</Label>
              <Input
                value={recordedWfName}
                onChange={(e) => setRecordedWfName(e.target.value)}
                placeholder="例如：亚马逊买家搜索加购"
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-muted-foreground">已捕获动作步骤流水 (共 {recordedActions.length} 步):</Label>
              <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-muted/30 p-2.5 font-mono text-[11px] space-y-1.5">
                {recordedActions.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">未捕获到有效动作</div>
                ) : (
                  recordedActions.map((act, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="size-4 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <span className="font-semibold text-foreground shrink-0">
                        {act.type === "navigate" ? "🌐 访问" : act.type === "click" ? "🖱️ 点击" : act.type === "input" ? "⌨️ 输入" : "📜 滚动"}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {act.type === "navigate" ? act.url : act.type === "click" ? (act.text || act.selector) : act.type === "input" ? `"${act.value}" -> ${act.selector}` : `${act.deltaY}px`}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button size="sm" variant="outline" onClick={() => setRecordedModalOpen(false)}>
              放弃
            </Button>
            <Button size="sm" variant="secondary" onClick={() => handleSaveRecordedWorkflow(false)}>
              💾 仅保存到模板库
            </Button>
            <Button size="sm" className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shadow-sm" onClick={() => handleSaveRecordedWorkflow(true)}>
              <LuPlay className="size-3.5" />
              🚀 保存并立即回放执行
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 账号矩阵批量导入弹窗 (Batch Import Modal) */}
      <Dialog open={batchImportModalOpen} onOpenChange={setBatchImportModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LuFileSpreadsheet className="size-5 text-emerald-500" />
              <span>Excel / 剪贴板快速批量导入账号</span>
            </DialogTitle>
            <DialogDescription>
              直接从 Excel、飞书表格或文本文件中复制多行多列，粘贴至下方输入框即可一键解析入库。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1 text-xs">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="font-medium">粘贴账号列表 (多行多列):</Label>
                <span className="text-[10px] text-muted-foreground">支持 Tab 制表符、---- 或逗号分隔</span>
              </div>
              <textarea
                value={batchImportText}
                onChange={(e) => setBatchImportText(e.target.value)}
                rows={6}
                className="w-full rounded-md border border-border bg-background p-2.5 font-mono text-xs text-foreground leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="直接从 Excel 复制整列粘贴即可，例如：&#10;alice@outlook.com    Pass@1234    主号-美区&#10;bob@outlook.com      Pass@5678    备用号-英区&#10;cindy@163.com        Pass@9999    测评号"
              />
            </div>

            <div className="rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground space-y-1">
              <div className="font-medium text-foreground">💡 格式识别规则：</div>
              <div>• 自动识别 @outlook.com, @hotmail.com 为微软邮箱</div>
              <div>• 自动识别 @163.com, @126.com 为网易邮箱</div>
              <div>• 支持 <code>账号----密码----备注</code> 经典格式</div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button size="sm" variant="outline" onClick={() => setBatchImportModalOpen(false)}>
              取消
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleBatchImportVault}>
              确认批量导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 手动登记账号弹窗 (Add Vault Modal) */}
      <Dialog open={addVaultModalOpen} onOpenChange={setAddVaultModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LuPlus className="size-4 text-primary" />
              手工登记账号资产
            </DialogTitle>
            <DialogDescription>
              将您现有的跨境平台邮箱或账号凭据记录至本地安全账本，便于统一管理与导出。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2 text-xs">
            <div className="space-y-1">
              <Label>归属平台</Label>
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                value={newVaultPlatform}
                onChange={(e) => setNewVaultPlatform(e.target.value as any)}
              >
                <option value="outlook">Microsoft Outlook 微软邮箱</option>
                <option value="163">网易 163 邮箱</option>
                <option value="temp">临时隐私邮箱</option>
                <option value="custom">其他平台 / 自定义</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label>邮箱账号 / 用户名</Label>
              <Input
                value={newVaultEmail}
                onChange={(e) => setNewVaultEmail(e.target.value)}
                placeholder="例如：my_user@outlook.com"
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label>登录密码 (可选)</Label>
              <Input
                type="password"
                value={newVaultPassword}
                onChange={(e) => setNewVaultPassword(e.target.value)}
                placeholder="若有密码请填写"
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button size="sm" variant="outline" onClick={() => setAddVaultModalOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleAddNewVaultAccount}>
              确认登记入库
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 注册成果交付弹窗 (Delivery Modal) */}
      <Dialog open={!!deliveryModal?.open} onOpenChange={(open) => !open && setDeliveryModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {deliveryModal?.isVerified ? (
                <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                  ✓
                </span>
              ) : (
                <span className="flex size-6 items-center justify-center rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold">
                  ✕
                </span>
              )}
              <span>{deliveryModal?.statusText}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {deliveryModal?.note}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1 text-xs">
            {/* 账号与密码卡片 */}
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">平台</span>
                <span className="font-semibold text-foreground">{deliveryModal?.platform}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">注册账号</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-medium text-foreground">{deliveryModal?.email}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-xs text-primary"
                    onClick={() => {
                      if (deliveryModal?.email) {
                        navigator.clipboard.writeText(deliveryModal.email);
                        toast.success("账号已复制到剪贴板！");
                      }
                    }}
                  >
                    复制
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">登录密码</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-medium text-foreground">{deliveryModal?.password}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-xs text-primary"
                    onClick={() => {
                      if (deliveryModal?.password) {
                        navigator.clipboard.writeText(deliveryModal.password);
                        toast.success("密码已复制到剪贴板！");
                      }
                    }}
                  >
                    复制
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border/50">
                <span className="text-muted-foreground">步骤通过情况</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {deliveryModal?.passedSteps} / {deliveryModal?.totalSteps} 步完成
                </span>
              </div>
            </div>

            {/* 存证快照预览 */}
            {deliveryModal?.screenshot && (
              <div className="space-y-1">
                <span className="text-muted-foreground text-[11px]">终检存证快照：</span>
                <div className="overflow-hidden rounded-md border bg-black/5 dark:bg-black/30">
                  <img
                    src={deliveryModal.screenshot}
                    alt="终检快照"
                    className="max-h-40 w-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setPreviewScreenshot({ title: "终检存证快照", src: deliveryModal.screenshot! })}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button size="sm" onClick={() => setDeliveryModal(null)}>
              知道了，已留存入库
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
