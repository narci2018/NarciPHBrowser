/**
 * Matrix Publisher Rule Engine & Workflow Generator
 * Extracted and normalized from Fabuya (发布鸭) multi-platform locators.
 * Directly drives NarciPHBrowser's native Playwright automation engine without external tools.
 */

export interface PlatformRuleConfig {
  upload_page_url: string;
  upload_page_wait_url?: string;
  resource_upload_locator?: string;
  resource_upload_wait_locator?: string;
  title_locator?: string;
  summary_locator?: string;
  tag_locator?: string;
  publish_locator?: string;
  publish_wait_url?: string;
  publish_wait_locator?: string;
  set_original_locator?: string;
  thumbnail_locator?: string;
  content_locator?: string;
}

export interface PlatformPublishConfig {
  id: string;
  name: string;
  iconName: string;
  color: string;
  category: "domestic" | "crossborder";
  homeUrl: string;
  supports: Array<"video" | "image" | "article">;
  rules: {
    video?: PlatformRuleConfig;
    image?: PlatformRuleConfig;
    article?: PlatformRuleConfig;
  };
}

export const MATRIX_PLATFORMS: Record<string, PlatformPublishConfig> = {
  douyin: {
    id: "douyin",
    name: "抖音 (Douyin)",
    iconName: "Douyin",
    color: "#FE2C55",
    category: "domestic",
    homeUrl: "https://creator.douyin.com/",
    supports: ["video", "image"],
    rules: {
      video: {
        upload_page_url: "https://creator.douyin.com/creator-micro/content/upload",
        resource_upload_locator: "div[class^='container'] input, input[type='file'][accept*='video']",
        resource_upload_wait_locator: "div[class*='container-drag-title']:has-text('视频文件')",
        title_locator: "input.semi-input[placeholder*='填写作品标题']",
        summary_locator: ".zone-container",
        publish_locator: "button:text-is('发布'), button[class*='primary']:has-text('发布'):not(:has-text('作品发布')), button.primary-cECiOJ",
        publish_wait_locator: "text=发布成功, text=作品发布成功, text=审核中",
        publish_wait_url: "**/creator-micro/content/manage**",
      },
      image: {
        upload_page_url: "https://creator.douyin.com/creator-micro/content/upload",
        resource_upload_locator: "div[class^='container'] input[multiple], input[type='file'][multiple]",
        title_locator: "input.semi-input[placeholder*='添加作品标题']",
        summary_locator: ".zone-container",
        publish_locator: "button:text-is('发布'), button[class*='primary']:has-text('发布'):not(:has-text('作品发布'))",
        publish_wait_locator: "text=发布成功, text=作品发布成功",
        publish_wait_url: "**/creator-micro/content/manage**",
      },
    },
  },
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    iconName: "TikTok",
    color: "#000000",
    category: "crossborder",
    homeUrl: "https://www.tiktok.com/creator-center",
    supports: ["video"],
    rules: {
      video: {
        upload_page_url: "https://www.tiktok.com/tiktokstudio/upload",
        resource_upload_locator: "input[type='file'][accept*='video'], input[type='file']",
        resource_upload_wait_locator: ":has-text('Uploaded'), span.TUXText.TUXText--tiktok-sans",
        title_locator: "", // TikTok 标题与正文在同一个 DraftEditor，留空避免重复输入
        summary_locator: "div.public-DraftEditor-content, div.notranslate.public-DraftEditor-content, div[contenteditable='true']",
        publish_locator: "div.button-group button:first-child, div.button-group button:has-text('Post'), div[class*='btn-post'] button:first-child, button.TUXButton--primary:has-text('Post'), button:has-text('Post'), button:text-is('Post'), button:text-is('发布')",
        publish_wait_url: "https://www.tiktok.com/tiktokstudio/content**",
        publish_wait_locator: "text=Manage your posts, text=Your video has been uploaded, text=Uploaded to TikTok, text=View profile, text=Upload another video, text=Post another video",
      },
    },
  },
  weixin: {
    id: "weixin",
    name: "微信视频号 (Channels)",
    iconName: "Weixin",
    color: "#07C160",
    category: "domestic",
    homeUrl: "https://channels.weixin.qq.com/",
    supports: ["video", "image"],
    rules: {
      video: {
        upload_page_url: "https://channels.weixin.qq.com/platform/post/list",
        resource_upload_locator: "input[type='file'], .post-create-upload-container input",
        title_locator: "input[placeholder*='短标题'], input[placeholder*='填写短标题'], .post-create-title input, input.weui-desktop-form__input",
        summary_locator: "div[data-placeholder*='添加描述'], div.input-editor, div[contenteditable='true'], .post-description-content, textarea[placeholder*='描述']",
        publish_locator: "div.form-btns button:has-text('发表'), button.weui-desktop-btn_primary:has-text('发表'), button:has-text('发表'):not(:has-text('发表视频'))",
        publish_wait_locator: "text=发表成功, text=已发表",
        publish_wait_url: "**/platform/post/list**",
        set_original_locator: "div:has-text('声明原创'), label:has-text('声明原创')",
      },
      image: {
        upload_page_url: "https://channels.weixin.qq.com/platform/post/finderNewLifeCreate",
        resource_upload_locator: "input[type='file']",
        title_locator: "input.weui-desktop-form__input[placeholder^='填写标题']",
        summary_locator: "div.input-editor, div[contenteditable='true']",
      },
    },
  },
  xiaohongshu: {
    id: "xiaohongshu",
    name: "小红书 (Xiaohongshu)",
    iconName: "Xiaohongshu",
    color: "#FF2442",
    category: "domestic",
    homeUrl: "https://creator.xiaohongshu.com/",
    supports: ["video", "image"],
    rules: {
      video: {
        upload_page_url: "https://creator.xiaohongshu.com/publish/publish?from=menu",
        resource_upload_locator: "input[type='file'][accept*='video'], input[type='file']",
        resource_upload_wait_locator: "text=上传成功, span:has-text('重新上传'), div:has-text('重新上传'), button:has-text('重新上传')",
        title_locator: "div.edit-container input.d-text, input.d-text, input[placeholder*='填写标题']",
        summary_locator: ".editor-container .ProseMirror[contenteditable='true'], div[contenteditable='true']#post-textarea, .ProseMirror",
        publish_locator: "div.publish-setting button:has-text('发布'), button:has-text('发布')",
        publish_wait_locator: "text=发布成功, text=作品发布成功, text=查看笔记",
        set_original_locator: "div:has-text('声明原创') input, div:has-text('原创声明') input, +input[type=checkbox], label:has-text('声明原创')",
      },
      image: {
        upload_page_url: "https://creator.xiaohongshu.com/publish/publish?from=menu",
        resource_upload_locator: "input[type='file'][accept*='image'], input[type='file']",
        resource_upload_wait_locator: "text=上传成功, span:has-text('重新上传'), div:has-text('重新上传')",
        title_locator: "div.edit-container input.d-text, input.d-text, input[placeholder*='填写标题']",
        summary_locator: ".editor-container .ProseMirror[contenteditable='true'], div[contenteditable='true']#post-textarea, .ProseMirror",
        publish_locator: "div.publish-setting button:has-text('发布'), button:has-text('发布')",
        publish_wait_locator: "text=发布成功, text=作品发布成功, text=查看笔记",
      },
    },
  },
  bilibili: {
    id: "bilibili",
    name: "哔哩哔哩 (Bilibili)",
    iconName: "Bilibili",
    color: "#00A1D6",
    category: "domestic",
    homeUrl: "https://member.bilibili.com/platform/home",
    supports: ["video"],
    rules: {
      video: {
        upload_page_url: "https://member.bilibili.com/platform/upload/video/frame",
        resource_upload_locator: "div[class='bcc-upload-wrapper'] input, input[type='file'][accept*='video'], input[type='file']",
        resource_upload_wait_locator: "div[class='file-item-content-status']:has-text('上传完成'), text=上传完成, span:has-text('重新上传')",
        title_locator: "input[placeholder*='标题'], .video-title input.input-val, input.input-val",
        summary_locator: ".ql-editor[contenteditable='true'], div.ql-editor, textarea[placeholder*='简介']",
        tag_locator: "#tag-container input[type='text'], div.tag-container input, div.tag-input-wrp input",
        publish_locator: "xpath=//span[@class='submit-add' and text()='立即投稿'], button:has-text('立即投稿'), div.submit-add, .submit-add",
        publish_wait_locator: "text=稿件投递成功, text=投稿成功",
      },
    },
  },
  kuaishou: {
    id: "kuaishou",
    name: "快手 (Kuaishou)",
    iconName: "Kuaishou",
    color: "#FF4906",
    category: "domestic",
    homeUrl: "https://cp.kuaishou.com/",
    supports: ["video", "image"],
    rules: {
      video: {
        upload_page_url: "https://cp.kuaishou.com/article/publish/video",
        resource_upload_locator: "button[class^='_upload-btn'] input, div[class*='_cropper-upload-upload'] > input[type='file'], input[type='file']",
        resource_upload_wait_locator: "text=上传成功, text=重新上传, button:has-text('重新上传')",
        summary_locator: "#work-description-edit[contenteditable='true'], div[class*='work-description'] [contenteditable='true'], div.work-description-edit",
        publish_locator: "button:has-text('发布'), button[class*='_footer-btn_'] >> text=确认, div[class*='_button']:has-text('发布')",
        publish_wait_url: "**/article/manage/video**",
        publish_wait_locator: "text=发布成功, text=作品发布成功, text=审核中",
      },
      image: {
        upload_page_url: "https://cp.kuaishou.com/article/publish/video",
        resource_upload_locator: "button[class^='_upload-btn'] input, div[class*='_cropper-upload-upload'] > input[type='file'], input[type='file']",
        resource_upload_wait_locator: "text=上传成功, text=重新上传, button:has-text('重新上传')",
        summary_locator: "#work-description-edit[contenteditable='true'], div[class*='work-description'] [contenteditable='true'], div.work-description-edit",
        publish_locator: "button:has-text('发布'), button[class*='_footer-btn_'] >> text=确认, div[class*='_button']:has-text('发布')",
        publish_wait_url: "**/article/manage/video**",
        publish_wait_locator: "text=发布成功, text=作品发布成功, text=审核中",
      },
    },
  },
  toutiao: {
    id: "toutiao",
    name: "今日头条 / 西瓜视频",
    iconName: "Toutiao",
    color: "#ED4040",
    category: "domestic",
    homeUrl: "https://mp.toutiao.com/",
    supports: ["video", "image"],
    rules: {
      video: {
        upload_page_url: "https://mp.toutiao.com/profile_v4/xigua/upload-video",
        resource_upload_locator: "div[class^='upload-video'] input, input[type='file']",
        resource_upload_wait_locator: "text=上传成功, span:has-text('重新上传'), div:has-text('重新上传')",
        title_locator: "div[class*='article-title'] input, div[class*='publish-editor-title'] textarea, input[placeholder*='标题']",
        summary_locator: "div[class*='video-form-item'] textarea[placeholder*='视频简介'], textarea[placeholder*='视频简介']",
        publish_locator: "div.publish-footer button:has(span:has-text('确认发布')), div[class*='publish-footer'] button:has(span:has-text('发布')), button:has-text('发表'), button:has-text('发布')",
        publish_wait_locator: "text=发布成功, text=作品发布成功, text=发表成功",
        publish_wait_url: "**/profile_v4/graphic/articles**",
      },
      image: {
        upload_page_url: "https://mp.toutiao.com/profile_v4/graphic/publish",
        resource_upload_locator: "input[type='file']",
        title_locator: "div[class*='publish-editor-title'] textarea, input[placeholder*='标题']",
        summary_locator: "div[class*='publish-editor-content']",
        publish_locator: "div.publish-footer button:has(span:has-text('确认发布')), button:has-text('发表')",
        publish_wait_locator: "text=发布成功, text=作品发布成功",
      },
    },
  },
  weibo: {
    id: "weibo",
    name: "微博 (Weibo)",
    iconName: "Weibo",
    color: "#E6162D",
    category: "domestic",
    homeUrl: "https://weibo.com/",
    supports: ["video", "image"],
    rules: {
      video: {
        upload_page_url: "https://weibo.com/upload/channel",
        resource_upload_locator: "input[type='file']",
        resource_upload_wait_locator: "text=上传成功, span:has-text('重新上传'), text=上传完成",
        title_locator: "input[placeholder*='填写标题'], input[placeholder*='0～30个字']",
        summary_locator: "textarea[placeholder*='有什么新鲜事想分享给大家'], textarea[placeholder*='填写描述']",
        publish_locator: "button:has-text('发布'), button:has-text('发送')",
        publish_wait_locator: "text=视频已上传成功, text=发布成功",
        set_original_locator: "button.woo-button-main:has-text('完成'), div:has-text('声明原创')",
      },
      image: {
        upload_page_url: "https://weibo.com/",
        resource_upload_locator: "input[type='file']",
        summary_locator: "textarea[placeholder*='有什么新鲜事想分享给大家']",
        publish_locator: "button:has-text('发布'), button:has-text('发送')",
        publish_wait_locator: "text=发布成功",
      },
    },
  },
  baijiahao: {
    id: "baijiahao",
    name: "百家号 (Baijiahao)",
    iconName: "Baijiahao",
    color: "#2932E1",
    category: "domestic",
    homeUrl: "https://baijiahao.baidu.com/",
    supports: ["video", "image", "article"],
    rules: {
      video: {
        upload_page_url: "https://baijiahao.baidu.com/builder/rc/edit?type=videoV2&is_from_cms=1",
        resource_upload_locator: "div[class*='video-main-container'] input, input[type='file']",
        resource_upload_wait_locator: "text=上传成功, div:has-text('重新上传')",
        title_locator: "div[class*='title-input'] input, input[placeholder*='请输入标题']",
        summary_locator: "div[class*='video-desc'] textarea, textarea[placeholder*='请输入简介']",
        tag_locator: "div.cheetah-select:has(input) input, input[placeholder*='标签']",
        publish_locator: "div.op-btn-outter-content button, button:has-text('发布')",
        publish_wait_locator: "text=发布成功, text=视频发布成功",
      },
      image: {
        upload_page_url: "https://baijiahao.baidu.com/builder/rc/edit?type=events&is_from_cms=1",
        resource_upload_locator: "input[type='file']",
        content_locator: "div[class*='content-wrap'] textarea#content",
      },
      article: {
        upload_page_url: "https://baijiahao.baidu.com/builder/rc/edit?type=news&is_from_cms=1",
        title_locator: "div.input-box input",
        summary_locator: "textarea[placeholder='请输入摘要']",
        content_locator: "#ueditor_0",
      },
    },
  },
  pipix: {
    id: "pipix",
    name: "皮皮虾 (Pipix)",
    iconName: "Pipix",
    color: "#FF5000",
    category: "domestic",
    homeUrl: "https://creator.pipix.com/",
    supports: ["video"],
    rules: {
      video: {
        upload_page_url: "https://www.pipix.com/mp/upload",
        resource_upload_locator: "input[type='file']",
        summary_locator: "div[class^='titleBar']:has(div:text-is('视频描述')) +div textarea",
        publish_locator: "div[class^='btn']:text-is('立即投稿')",
        publish_wait_locator: "text=上传成功",
      },
    },
  },
  sohu: {
    id: "sohu",
    name: "搜狐号 (Sohu)",
    iconName: "Sohu",
    color: "#FFCC00",
    category: "domestic",
    homeUrl: "https://mp.sohu.com/",
    supports: ["article"],
    rules: {
      article: {
        upload_page_url: "https://mp.sohu.com/mpfe/v4/contentManagement/news/addarticle",
        title_locator: "input[placeholder*='请输入标题']",
        summary_locator: "textarea[placeholder*='请输入摘要']",
        publish_locator: "li.publish-report-btn:text-is('发布')",
      },
    },
  },
  weishi: {
    id: "weishi",
    name: "腾讯微视 (Weishi)",
    iconName: "Weishi",
    color: "#0066FF",
    category: "domestic",
    homeUrl: "https://media.weishi.qq.com/",
    supports: ["video"],
    rules: {
      video: {
        upload_page_url: "https://media.weishi.qq.com/",
        resource_upload_locator: "input[type='file']",
        summary_locator: "textarea[placeholder='这一刻的想法']",
        publish_wait_locator: "text=视频发布成功",
      },
    },
  },
};

export interface MatrixPublishPayload {
  platformId: string;
  contentType: "video" | "image" | "article";
  filePath: string;
  coverPath?: string;
  title: string;
  summary: string;
  tags?: string[];
  isOriginal?: boolean;
  poi?: string;
}

export interface WorkflowStep {
  action: string;
  name: string;
  url?: string;
  selector?: string;
  text?: string;
  value?: string;
  key?: string;
  file?: string;
  files?: string[];
  timeout?: number;
  duration?: number;
  optional?: boolean;
  clear?: boolean;
  distance?: number | string;
  times?: number;
  [key: string]: any;
}

/**
 * 视频号短标题格式化与过滤算法 (100% 逆向并对齐发布鸭 weixin_upload.cp312 format_str_for_short_title 底层逻辑)
 * 1. 允许白名单：中文、英文字母、数字，以及特定符号 '《》“”:+?%°'
 * 2. 逗号 ',' / '，' 替换为空格 ' '
 * 3. 其余所有特殊字符（包括但不限于 #, @, _, -, ., !, ~, *, &, ^, $, (, ), [, ], /, \, Emoji 等）一律剔除！
 * 4. 长度限制：
 *    - 视频号短标题严格要求 6 ~ 16 个字符之间；
 *    - 若过滤后字符数超过 16，截取前 16 个字符；
 *    - 短标题为选填项；若过滤后字数少于 6 个字，则直接返回空字符串 ""（不填短标题），避免触发平台“短标题不能少于6个字符”或“短标题不能包含特殊字符”的红字阻断！
 */
export function formatWeixinShortTitle(raw: string): string {
  if (!raw) return "";
  const allowedSpecialChars = new Set(["《", "》", "“", "”", ":", "+", "?", "%", "°"]);
  const filtered: string[] = [];

  for (const char of raw) {
    if (/[\u4e00-\u9fa5a-zA-Z0-9]/.test(char) || allowedSpecialChars.has(char)) {
      filtered.push(char);
    } else if (char === "," || char === "，") {
      filtered.push(" ");
    }
    // 所有其他特殊字符均直接忽略剔除
  }

  let clean = filtered.join("").replace(/\s+/g, " ").trim();
  if (clean.length > 16) {
    clean = clean.slice(0, 16).trim();
  }
  if (clean.length < 6) {
    return "";
  }
  return clean;
}

/**
 * Compiles high-level publishing payload into atomic Playwright workflow steps.
 */
export function compileMatrixPublishWorkflow(payload: MatrixPublishPayload): WorkflowStep[] {
  const p = MATRIX_PLATFORMS[payload.platformId];
  if (!p) throw new Error(`不支持的目标平台: ${payload.platformId}`);

  // 智能纠偏：检测文件扩展名与平台能力
  const videoExts = [".mp4", ".mov", ".mkv", ".flv", ".avi", ".webm", ".ts", ".m4v"];
  const isVideoFile = payload.filePath && videoExts.some((ext) => payload.filePath.toLowerCase().endsWith(ext));

  let targetContentType = payload.contentType;
  // 如果选中的素材是明确的视频格式，或者目标平台规则中仅有 video，自动校正为 video
  if (isVideoFile || (!p.rules[targetContentType] && p.rules.video)) {
    targetContentType = "video";
  }

  const rules = p.rules[targetContentType];
  if (!rules) throw new Error(`${p.name} 暂不支持 ${payload.contentType} 类型的发布`);

  const steps: WorkflowStep[] = [];

  // 1. 打开创作者上传页面
  steps.push({
    action: "goto",
    name: `访问 ${p.name} 创作者发布中心`,
    url: rules.upload_page_url,
    timeout: 30000,
  });

  // 2. 缓冲等待页面主元素
  steps.push({
    action: "wait",
    name: "等待发布页面初始化与登录态就绪",
    duration: 3500,
  });

  // 2.1 针对抖音：若存在上次未发布的草稿拦截提示，自动点击【放弃】以清理环境
  if (payload.platformId === "douyin") {
    steps.push({
      action: "click",
      name: "检测并清理上次未完成的草稿提示",
      selector: "span:has-text('放弃'), span.give-up-Tv8CCI",
      timeout: 2000,
      optional: true,
    });
  }

  // 2.2 针对微信视频号：若在作品列表页，点击【发表视频】进入发布工作台，并清理弹窗
  if (payload.platformId === "weixin") {
    steps.push({
      action: "click",
      name: "进入视频号发布工作台",
      selector: "button:has-text('发表视频'), a:has-text('发表视频'), .weui-desktop-btn_primary:has-text('发表视频'), div:text-is('发表视频')",
      timeout: 15000,
      optional: true,
    });
    steps.push({
      action: "click",
      name: "清理提示弹窗或切换提示 (如有)",
      selector: "button:has-text('我知道了'), button:has-text('取消'), div[class*='dialog'] button:has-text('确定')",
      timeout: 2500,
      optional: true,
    });
  }

  // 2.3 针对小红书：确保激活对应的工作台标签栏 (上传视频 vs 上传图文)
  if (payload.platformId === "xiaohongshu") {
    if (payload.contentType === "video") {
      steps.push({
        action: "click",
        name: "切换至小红书【上传视频】标签页",
        selector: "div[class*='tab']:has-text('上传视频'), div.publish-tab:has-text('上传视频'), span:has-text('上传视频'), div:text-is('上传视频')",
        timeout: 4000,
        optional: true,
      });
    } else {
      steps.push({
        action: "click",
        name: "切换至小红书【上传图文】标签页",
        selector: "div[class*='tab']:has-text('上传图文'), div.publish-tab:has-text('上传图文'), span:has-text('上传图文'), div:text-is('上传图文')",
        timeout: 4000,
        optional: true,
      });
    }
  }

  // 2.4 针对快手：确保切换至对应的创作类型 Tab
  if (payload.platformId === "kuaishou") {
    if (payload.contentType === "video") {
      steps.push({
        action: "click",
        name: "切换至快手【上传视频】标签页",
        selector: "div[class*='ant-tabs-tab']:has-text('上传视频'), div[class*='tab-item']:has-text('上传视频'), span:has-text('上传视频')",
        timeout: 4000,
        optional: true,
      });
    } else {
      steps.push({
        action: "click",
        name: "切换至快手【上传图文】标签页",
        selector: "div[class*='ant-tabs-tab']:has-text('上传图文'), div[class*='tab-item']:has-text('上传图文'), span:has-text('上传图文')",
        timeout: 4000,
        optional: true,
      });
    }
  }

  // 2.5 针对 TikTok：自动关闭 Cookie/权限询问横幅
  if (payload.platformId === "tiktok") {
    steps.push({
      action: "click",
      name: "清理 TikTok 提示与 Cookie 横幅",
      selector: "div.Button__content >> text=Allow, button:has-text('Allow'), button:has-text('Accept all')",
      timeout: 2500,
      optional: true,
    });
  }

  // 2.6 针对百家号：关闭新手引导遮罩
  if (payload.platformId === "baijiahao") {
    steps.push({
      action: "click",
      name: "关闭百家号新手引导气泡",
      selector: ".cheetah-tour-close, button:has-text('我知道了'), button:has-text('跳过'), div.cheetah-tour-footer button",
      timeout: 2000,
      optional: true,
    });
  }

  // 3. 上传核心视频/素材文件
  const uploadInput = rules.resource_upload_locator || "input[type='file']";
  steps.push({
    action: "upload",
    name: `上传${payload.contentType === "video" ? "视频" : "图片"}文件: ${payload.filePath.split(/[/\\]/).pop()}`,
    selector: uploadInput,
    file: payload.filePath,
    timeout: 35000,
  });

  // 4. 等待转码与分片上传
  steps.push({
    action: "wait",
    name: "等待素材上传与服务器转码解析...",
    duration: 6000,
  });

  // 4.1 针对抖音：等待视频切片上传与预审就绪，并自动关闭“视频预览功能”弹窗
  if (payload.platformId === "douyin") {
    steps.push({
      action: "wait",
      name: "等待视频切片上传与预审就绪...",
      selector: "span:has-text('重新上传'), div:has-text('重新上传'), text=上传成功, button:text-is('发布'):not([disabled])",
      timeout: 30000,
      optional: true,
    });
    steps.push({
      action: "click",
      name: "关闭视频预览功能/发文助手弹窗",
      selector: "button:has-text('我知道了'), div[class*='modal'] button:has-text('确定')",
      timeout: 2000,
      optional: true,
    });
  }

  // 4.2 针对微信视频号：等待视频切片上传解析完成
  if (payload.platformId === "weixin") {
    steps.push({
      action: "wait",
      name: "等待视频切片上传与预审就绪...",
      selector: "div.media-status-content div.tag-inner:has-text('删除'), div.media-status-content, text=更换封面, text=上传完成",
      timeout: 50000,
      optional: true,
    });
    steps.push({
      action: "click",
      name: "关闭视频号引导弹窗",
      selector: "button:has-text('我知道了'), button:has-text('取消'), div[class*='dialog'] button:has-text('确定')",
      timeout: 2000,
      optional: true,
    });
  }

  // 4.3 针对小红书：等待上传与服务器就绪
  if (payload.platformId === "xiaohongshu") {
    steps.push({
      action: "wait",
      name: "等待小红书素材上传与预审完成...",
      selector: "text=上传成功, span:has-text('重新上传'), div:has-text('重新上传'), button:has-text('重新上传')",
      timeout: 45000,
      optional: true,
    });
  }

  // 4.4 针对快手：等待上传成功
  if (payload.platformId === "kuaishou") {
    steps.push({
      action: "wait",
      name: "等待快手视频上传与转码完成...",
      selector: "text=上传成功, text=重新上传, button:has-text('重新上传')",
      timeout: 45000,
      optional: true,
    });
  }

  // 4.5 针对哔哩哔哩：等待视频上传转码完成
  if (payload.platformId === "bilibili") {
    steps.push({
      action: "wait",
      name: "等待 B 站视频上传与服务器转码完成...",
      selector: "div[class='file-item-content-status']:has-text('上传完成'), text=上传完成, span:has-text('重新上传')",
      timeout: 60000,
      optional: true,
    });
  }

  // 4.6 针对今日头条/西瓜视频：等待转码并关闭竖版视频完成裁剪弹窗
  if (payload.platformId === "toutiao") {
    steps.push({
      action: "wait",
      name: "等待今日头条视频转码完成...",
      selector: "text=上传成功, span:has-text('重新上传'), div:has-text('重新上传')",
      timeout: 45000,
      optional: true,
    });
    steps.push({
      action: "click",
      name: "响应竖版视频裁剪完成确认弹窗 (发布鸭对齐)",
      selector: "div.clip-btn:has-text('完成裁剪'), button:has-text('完成裁剪'), div[class*='footer'] button:has-text('确定'), button:has-text('我知道了')",
      timeout: 3000,
      optional: true,
    });
  }

  // 4.7 针对百家号：等待上传完成
  if (payload.platformId === "baijiahao") {
    steps.push({
      action: "wait",
      name: "等待百家号视频上传完成...",
      selector: "text=上传成功, div:has-text('重新上传')",
      timeout: 45000,
      optional: true,
    });
  }

  // 4.8 针对微博：等待上传完成
  if (payload.platformId === "weibo") {
    steps.push({
      action: "wait",
      name: "等待微博视频上传解析完成...",
      selector: "text=上传成功, span:has-text('重新上传'), text=上传完成",
      timeout: 45000,
      optional: true,
    });
  }

  // 4.9 针对 TikTok：等待上传完成
  if (payload.platformId === "tiktok") {
    steps.push({
      action: "wait",
      name: "等待 TikTok 视频上传完成...",
      selector: ":has-text('Uploaded'), text=Uploaded, span:has-text('Uploaded')",
      timeout: 60000,
      optional: true,
    });
  }

  const rawTitle = (payload.title || "").trim();
  const rawSummary = (payload.summary || "").trim();
  // 核心容错与联动：若用户只在界面输入了“作品标题”而描述留空，自动将标题作为正文描述注入，保证视频号等必须依赖描述的平台能够正常点亮发布按钮
  const effectiveSummary = rawSummary || rawTitle;
  const effectiveTitle = rawTitle || rawSummary;

  // 5. 填写标题 (若存在标题输入框) - 严格遵循发布鸭逆向的平台字数上限规则
  if (rules.title_locator && effectiveTitle) {
    let titleToType = effectiveTitle;
    if (payload.platformId === "weixin") {
      // 视频号短标题：6 ~ 16 个字符之间，严禁特殊字符
      titleToType = formatWeixinShortTitle(effectiveTitle);
    } else if (payload.platformId === "xiaohongshu") {
      // 小红书标题：严格不可超过 20 个汉字/字符，超长则截断，防止触发平台红字报错并禁用提交
      titleToType = effectiveTitle.slice(0, 20);
    } else if (payload.platformId === "toutiao" || payload.platformId === "weibo" || payload.platformId === "douyin") {
      // 头条、微博、抖音：标题上限为 30 个字
      titleToType = effectiveTitle.slice(0, 30);
    } else if (payload.platformId === "baijiahao") {
      // 百家号：标题上限为 40 个字
      titleToType = effectiveTitle.slice(0, 40);
    } else if (payload.platformId === "bilibili") {
      // B站：标题上限为 80 个字
      titleToType = effectiveTitle.slice(0, 80);
    }

    if (titleToType) {
      steps.push({
        action: "type",
        name: `填写作品标题: "${titleToType}"`,
        selector: rules.title_locator,
        text: titleToType,
        clear: true, // 确保先清空输入框，防止追加导致超长或遗留特殊符号
        timeout: 10000,
        optional: true,
      });
    }
  }

  // 6. 填写描述正文与话题标签 (各平台规范适配)
  if (rules.summary_locator && (effectiveSummary || payload.tags?.length)) {
    if (payload.platformId === "weixin") {
      // 微信视频号：清洗话题标签中的非法符号（-、#、@等），以空格结尾触发气泡
      const cleanTags = (payload.tags || [])
        .map((t) => t.replace(/[#@_\-\s]/g, "").trim())
        .filter((t) => t.length > 0);
      const tagTokens = cleanTags.map((t) => `#${t} `);
      const fullText = [effectiveSummary, ...tagTokens].filter(Boolean).join(" ");

      steps.push({
        action: "type",
        name: "填写正文描述与话题标签",
        selector: rules.summary_locator,
        text: fullText,
        timeout: 15000,
        optional: false,
      });
    } else if (payload.platformId === "xiaohongshu") {
      // 小红书：发布鸭逆向规则限制最多 10 个话题，以 #tag 格式注入 ProseMirror
      const cleanTags = (payload.tags || [])
        .slice(0, 10)
        .map((t) => `#${t.replace(/[#@_\-\s]/g, "").trim()} `)
        .filter((t) => t.trim().length > 1);
      const fullText = [effectiveSummary, ...cleanTags].filter(Boolean).join(" ");

      steps.push({
        action: "type",
        name: "填写小红书正文与话题标签 (最多10个)",
        selector: rules.summary_locator,
        text: fullText,
        timeout: 15000,
        optional: false,
      });
    } else if (payload.platformId === "bilibili") {
      // B站：正文简介与标签分立，正文仅填写描述文本
      steps.push({
        action: "type",
        name: "填写 B 站视频正文简介",
        selector: rules.summary_locator,
        text: effectiveSummary,
        timeout: 12000,
        optional: false,
      });

      // B站专用：将话题逐个注入独立标签输入框并回车确认生成 Tag Chip
      if (rules.tag_locator && payload.tags?.length) {
        for (const t of payload.tags.slice(0, 8)) {
          const cleanT = t.replace(/[#@_\-\s]/g, "").trim();
          if (!cleanT) continue;
          steps.push({
            action: "type",
            name: `注入 B 站视频标签: "${cleanT}"`,
            selector: rules.tag_locator,
            text: cleanT,
            timeout: 5000,
            optional: true,
          });
          steps.push({
            action: "press",
            name: `回车锁定 B 站标签: "${cleanT}"`,
            key: "Enter",
          });
        }
      }

      // B站核心必选项：分区自动选择 (发布鸭核心逻辑，若分区为空则无法提交立即投稿)
      steps.push({
        action: "click",
        name: "点击展开 B 站投稿分区选择器",
        selector: "div.select-box, div.drop-container, div:has-text('选择分区'), .drop-cascader, div.f-item:has-text('分区')",
        timeout: 4000,
        optional: true,
      });
      steps.push({
        action: "wait",
        name: "等待分区下拉就绪",
        duration: 600,
      });
      steps.push({
        action: "click",
        name: "选择推荐/默认稿件分区",
        selector: "div.drop-item:first-child, div.item-title:first-child, div.item-container:first-child, .drop-list-item:first-child, div.type-item:first-child",
        timeout: 4000,
        optional: true,
      });
    } else if (payload.platformId === "tiktok") {
      // TikTok 专属：100% 对齐发布鸭 DraftJS 复杂富文本输入规范 (add_title_tags 逆向算法)
      // 1. 点击激活 DraftJS 描述编辑器
      steps.push({
        action: "click",
        name: "聚焦 TikTok 描述编辑器 (DraftJS)",
        selector: rules.summary_locator,
        timeout: 10000,
        optional: false,
      });
      // 2. 清理已有内容 (End -> Ctrl+A -> Delete -> End)
      steps.push({ action: "press", name: "重置光标至末尾", key: "End" });
      steps.push({ action: "press", name: "全选旧文案", key: "Control+A" });
      steps.push({ action: "press", name: "清空旧文案", key: "Delete" });
      steps.push({ action: "press", name: "光标就绪", key: "End" });
      steps.push({ action: "wait", name: "缓冲等待富文本重置", duration: 800 });

      // 3. 注入正文描述
      if (effectiveSummary) {
        steps.push({
          action: "type",
          name: `填写 TikTok 正文描述: "${effectiveSummary.slice(0, 30)}..."`,
          selector: rules.summary_locator,
          text: effectiveSummary,
          timeout: 12000,
          optional: false,
        });
        steps.push({ action: "wait", name: "缓冲正文文本生效", duration: 800 });
        steps.push({ action: "press", name: "换行进入话题区", key: "Enter" });
      }

      // 4. 逐个将标签注入为 DraftJS Interactive Tag Chips (对齐发布鸭 '#tag ' -> Space -> Backspace)
      if (payload.tags?.length) {
        for (const rawTag of payload.tags) {
          const cleanTag = rawTag.replace(/[#@_\-\s]/g, "").trim();
          if (!cleanTag) continue;
          steps.push({ action: "wait", name: `缓冲输入标签 #${cleanTag}`, duration: 500 });
          steps.push({
            action: "type",
            name: `注入标签 #${cleanTag}`,
            selector: rules.summary_locator,
            text: `#${cleanTag} `,
            timeout: 5000,
            optional: true,
          });
          steps.push({ action: "press", name: "Space 触发 Tag 气泡转换", key: "Space" });
          steps.push({ action: "wait", name: "缓冲 Tag 锁定", duration: 400 });
          steps.push({ action: "press", name: "Backspace 清除多余空格", key: "Backspace" });
          steps.push({ action: "press", name: "移动光标至标签后", key: "End" });
        }
      }
    } else {
      const fullText = [
        effectiveSummary,
        ...(payload.tags || []).map((t) => (t.startsWith("#") ? t : `#${t}`)),
      ]
        .filter(Boolean)
        .join(" ");

      steps.push({
        action: "type",
        name: "填写正文描述与话题标签",
        selector: rules.summary_locator,
        text: fullText,
        timeout: 12000,
        optional: false, // 描述是发布的核心内容，不可忽略
      });
    }
  }

  // 7. 自定义封面 (如有指定)
  if (rules.thumbnail_locator && payload.coverPath) {
    steps.push({
      action: "upload",
      name: `上传自定义封面图: ${payload.coverPath.split(/[/\\]/).pop()}`,
      selector: rules.thumbnail_locator,
      file: payload.coverPath,
      timeout: 15000,
      optional: true,
    });
  }

  // 8. 原创声明 (根据用户策略：声明原创 vs 直接发表)
  if (payload.isOriginal) {
    if (payload.platformId === "weixin") {
      // 视频号声明原创精细化步骤 (对齐发布鸭底层逆向逻辑与原创权益弹窗交互)
      // 步骤 8.1: 点击展开原创声明面板/触发协议弹窗
      steps.push({
        action: "click",
        name: "点击展开视频号【声明原创】",
        selector: "div.declare-original-checkbox label.ant-checkbox-wrapper:has-text('声明后，作品将展示原创标记'), div.declare-original-checkbox, div.form-item.post-with-link:has-text('声明原创'), label.ant-checkbox-wrapper:has-text('声明后，作品将展示原创标记'), div:has-text('声明后，作品将展示原创标记') label",
        timeout: 4000,
        optional: true,
      });

      // 步骤 8.2: 等待【原创权益】协议弹窗平滑呈现
      steps.push({
        action: "wait",
        name: "等待【原创权益】协议弹窗呈现",
        duration: 800,
      });

      // 步骤 8.3: 勾选“我已阅读并同意《原创声明须知》和《使用条款》”复选框
      steps.push({
        action: "click",
        name: "勾选【我已阅读并同意《原创声明须知》和《使用条款》】",
        selector: "div.original-proto-wrapper input.ant-checkbox-input, div.declare-body-wrapper label:has-text('我已阅读'), div.original-proto-wrapper, div[class*='dialog'] label:has-text('我已阅读'), label:has-text('我已阅读并同意'), label:has-text('我已阅读')",
        timeout: 4000,
        optional: true,
      });

      // 步骤 8.4: 缓冲等待【声明原创】按钮解除禁用
      steps.push({
        action: "wait",
        name: "等待【声明原创】确认按钮解除禁用点亮",
        duration: 600,
      });

      // 步骤 8.5: 点击弹窗右下角【声明原创】确认提交
      steps.push({
        action: "click",
        name: "点击弹窗确认【声明原创】",
        selector: "div.declare-body-wrapper .weui-desktop-btn_primary:has-text('声明原创'):visible, div[class*='dialog'] button:has-text('声明原创'):visible, .weui-desktop-btn_primary:has-text('声明原创'):visible, button:has-text('声明原创'):visible",
        timeout: 4000,
        optional: true,
      });

      // 步骤 8.6: 等待弹窗平滑关闭
      steps.push({
        action: "wait",
        name: "等待原创协议弹窗平滑关闭",
        duration: 800,
      });
    } else if (rules.set_original_locator) {
      steps.push({
        action: "click",
        name: "勾选平台原创保护声明",
        selector: rules.set_original_locator,
        timeout: 8000,
        optional: true,
      });
    }
  }

  // 9. 最终点击发布/投稿按钮 (如果提供了选择器)
  if (rules.publish_locator) {
    if (payload.platformId === "douyin") {
      steps.push({
        action: "click",
        name: "确保浮层弹窗已关闭",
        selector: "button:has-text('我知道了')",
        timeout: 1500,
        optional: true,
      });
    } else if (payload.platformId === "weixin") {
      steps.push({
        action: "click",
        name: "确保视频号指引弹窗已关闭",
        selector: "button:has-text('我知道了')",
        timeout: 1500,
        optional: true,
      });
    }

    // 确保长页面表单（如 TikTok / B站 / 百家号等）自动滚动到底部显现完整控制栏
    steps.push({
      action: "scroll",
      name: "平滑滚动至页面底部显现发布按钮",
      distance: "bottom",
    });

    steps.push({
      action: "wait",
      name: "等待所有表单项与封面就绪",
      duration: 2500,
    });

    steps.push({
      action: "click",
      name: "点击【立即发布 / 立即投稿】",
      selector: rules.publish_locator,
      timeout: 20000,
      optional: false,
    });

    if (payload.platformId === "weixin") {
      if (payload.isOriginal) {
        // 用户选择【声明原创】模式：发表后若弹出“声明原创的视频有机会获得广告分成”弹窗或确认提示
        // 优先确认声明原创或直接发表，绝不阻塞流程
        steps.push({
          action: "click",
          name: "响应视频号发表弹窗 (声明原创/直接发表/确认发表)",
          selector: "button:has-text('声明原创'):visible, button:has-text('直接发表'), button:has-text('继续发表'), div[class*='dialog'] button:has-text('确定'), button:has-text('确认发表'), button:text-is('确定')",
          timeout: 6000,
          optional: true,
        });
        // 兜底：若点击【声明原创】后弹出《原创权益》协议弹窗，自动勾选并提交确认
        steps.push({
          action: "click",
          name: "勾选发表后弹窗中的【我已阅读并同意《原创声明须知》】",
          selector: "div.original-proto-wrapper input.ant-checkbox-input, div.declare-body-wrapper label:has-text('我已阅读'), label:has-text('我已阅读并同意'), label:has-text('我已阅读')",
          timeout: 3000,
          optional: true,
        });
        steps.push({
          action: "click",
          name: "确认发表后弹窗中的【声明原创】",
          selector: "div.declare-body-wrapper .weui-desktop-btn_primary:has-text('声明原创'):visible, div[class*='dialog'] button:has-text('声明原创'):visible, .weui-desktop-btn_primary:has-text('声明原创'):visible",
          timeout: 3000,
          optional: true,
        });
        // 若依然未完成，兜底点击【直接发表】完成最终提交
        steps.push({
          action: "click",
          name: "视频号发表兜底确认 (直接发表)",
          selector: "button:has-text('直接发表'), button:has-text('继续发表')",
          timeout: 3000,
          optional: true,
        });
      } else {
        // 用户选择【直接发表】模式：视频号将弹出“声明原创的视频有机会获得广告分成”或“该视频未声明原创，是否直接发表？”，自动点击【直接发表】或【继续发表】
        steps.push({
          action: "click",
          name: "响应视频号未声明原创弹窗并点击【直接发表 / 继续发表】",
          selector: "button:has-text('直接发表'), button:has-text('继续发表'), div[class*='dialog'] button:has-text('直接发表'), div[class*='dialog'] button:has-text('继续发表'), .weui-desktop-btn:has-text('直接发表')",
          timeout: 6000,
          optional: true,
        });
      }
    } else if (payload.platformId === "kuaishou") {
      steps.push({
        action: "click",
        name: "确认快手发表确认弹窗 (发布鸭对齐)",
        selector: "button[class*='_footer-btn_'] >> text=确认, button:has-text('确认'), button:has-text('我知道了')",
        timeout: 4000,
        optional: true,
      });
    } else if (payload.platformId === "toutiao") {
      steps.push({
        action: "click",
        name: "确认今日头条发表二次确认弹窗",
        selector: "div.publish-footer button:has(span:has-text('确认发布')), div.byte-modal-footer button:has(span:has-text('确定')), button:has-text('确定')",
        timeout: 4000,
        optional: true,
      });
    } else if (payload.platformId === "xiaohongshu") {
      steps.push({
        action: "click",
        name: "确认小红书发布引导/提示弹窗",
        selector: "button:has-text('我知道了'), button:has-text('确定'), div[class*='modal'] button:has-text('确定')",
        timeout: 3000,
        optional: true,
      });
    } else if (payload.platformId === "tiktok") {
      steps.push({
        action: "click",
        name: "响应 TikTok 二次确认/即时发布弹窗 (Post now / Confirm)",
        selector: "button:has-text('Post now'), button:has-text('Post anyway'), button.TUXButton--primary:has(div.TUXButton-label:text('Confirm')), div[role='dialog'] button.TUXButton--primary, div[role='dialog'] button:has-text('Post'), button:has-text('Confirm')",
        timeout: 5000,
        optional: true,
      });
      steps.push({
        action: "click",
        name: "兜底确认 TikTok 权限或提示弹窗 (Got it / Allow)",
        selector: "button:has-text('Got it'), button:has-text('Allow')",
        timeout: 2500,
        optional: true,
      });
    }

    // 10. 严格校验发布结果：必须真正成功落库或发生路由跳转，绝不能假阳性误报
    steps.push({
      action: "verify_publish",
      name: "严格核验最终发布落库状态",
      selector: rules.publish_wait_locator,
      url: rules.publish_wait_url,
      timeout: 30000,
      optional: false,
    });
  }

  // 11. 最终留存确保落库
  steps.push({
    action: "wait",
    name: "留存最终发布成功页面快照并持久化落库",
    duration: 3000,
  });

  return steps;
}
