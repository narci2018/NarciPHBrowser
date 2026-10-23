// The warm-up driver: connects to a running automation server and visits a
// list of sites so cookies, cache and history accumulate in the profile's
// real browser data. This file is the app's own, not upstream code.
//
// Usage (one process per warm-up):
//   node warmup.js <driverDir> <wsEndpoint> <jobJson>
// where jobJson is
//   {"sites": ["https://…"], "secondsPerSite": 20, "gotoTimeoutMs": 30000}
//
// Progress is one JSON line per site on stdout:
//   {"progress":{"url":"…","ok":true}}
// and the last line carries the whole run:
//   {"results":[…]}
// A connect failure is one line {"error":"…"} and exit code 1. Per-site
// failures are entries with ok:false and a short error, never a crash: one
// dead site must not strand the rest of the run.

const driverDir = process.argv[2];
const endpoint = process.argv[3];
let job;
try {
  job = JSON.parse(process.argv[4]);
} catch (error) {
  process.stdout.write(
    JSON.stringify({ error: `the warm-up job is not valid JSON: ${error}` }) + "\n",
  );
  process.exit(1);
}

const sites = Array.isArray(job.sites) ? job.sites : [];
const secondsPerSite = Math.max(0, Number(job.secondsPerSite ?? 20));
const gotoTimeoutMs = Math.max(1000, Number(job.gotoTimeoutMs ?? 30000));

const { firefox } = require(driverDir);

function formatPlaywrightError(error) {
  const raw = String(error && error.message ? error.message : error)
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/Call log:[\s\S]*/, "")
    .trim();
  if (raw.includes("[登录态失效]")) {
    return raw;
  }
  if (raw.includes("NS_ERROR_PROXY_CONNECTION_REFUSED") || raw.includes("PROXY_CONNECTION_FAILED")) {
    return "代理节点连接被拒绝 (NS_ERROR_PROXY_CONNECTION_REFUSED): 当前环境绑定的代理节点无法建立连接或已离线。请在【网络代理】或【环境列表】更换有效节点，或切换为直连环境后重试。";
  }
  if (raw.includes("NS_ERROR_NET_TIMEOUT") || raw.includes("Timeout") || raw.includes("timeout")) {
    return `页面访问或元素定位超时: 目标网站未响应，可能是代理延迟过高或网络较慢。详情: ${raw.slice(0, 140)}`;
  }
  if (raw.includes("NS_ERROR_UNKNOWN_HOST") || raw.includes("NAME_NOT_RESOLVED")) {
    return `域名解析失败 (DNS Lookup Failed): 无法解析目标网址，请检查网络或节点连通性。详情: ${raw.slice(0, 140)}`;
  }
  return raw.slice(0, 260);
}

(async () => {
  let browser;
  try {
    browser = await firefox.connect(endpoint);
    // The profile's own context is where its cookies live; a fresh context
    // would be a separate cookie jar and the warm-up would write nothing the
    // profile keeps. The server has exactly one.
    const context = browser.contexts()[0] || (await browser.newContext());
    const contexts = browser.contexts();
    for (let i = 1; i < contexts.length; i++) {
      try {
        await contexts[i].close();
      } catch {}
    }
    const existingPages = context.pages();
    const page = existingPages.length > 0 ? existingPages[0] : (await context.newPage());
    for (let i = 1; i < existingPages.length; i++) {
      try {
        await existingPages[i].close();
      } catch {}
    }

    const results = [];
    const mode = job.mode || "urls";

    if (mode === "workflow") {
      const vars = Object.assign({}, job.variables || {}, job.dataRow || {});
      function interpolate(str) {
        if (typeof str !== "string") return str;
        return str.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
          if (vars[key] !== undefined) return String(vars[key]);
          if (key === "random_str") return Math.random().toString(36).slice(2, 8);
          if (key === "random_num") return String(Math.floor(1000 + Math.random() * 9000));
          if (key === "timestamp") return String(Date.now());
          return `{{${key}}}`;
        });
      }

      const rawSteps = Array.isArray(job.steps) ? job.steps : [];
      const steps = rawSteps.map(s => ({
        ...s,
        url: interpolate(s.url),
        text: interpolate(s.text),
        value: interpolate(s.value),
        name: interpolate(s.name)
      }));

      function checkSessionExpired(p) {
        if (!p) return;
        const u = (typeof p.url === "function" ? p.url() : "") || "";
        // WeChat Channels
        if (u.includes("channels.weixin.qq.com/login") || u.includes("channels.weixin.qq.com/login.html")) {
          throw new Error("[登录态失效] 微信视频号未登录或登录会话已过期（当前处于扫码登录页）。请在自媒体账号列表中点击【扫码登录】，手机微信扫码授权后即可重新发布。");
        }
        // Douyin
        if (u.includes("passport.douyin.com") || (u.includes("creator.douyin.com") && u.includes("/login"))) {
          throw new Error("[登录态失效] 抖音创作者中心登录态已失效（跳转至登录验证页）。请在自媒体账号列表中点击【登录/刷新】后重试。");
        }
        // Xiaohongshu
        if (u.includes("creator.xiaohongshu.com/login") || (u.includes("xiaohongshu.com") && u.includes("/login"))) {
          throw new Error("[登录态失效] 小红书创作者中心登录态已失效。请在自媒体账号列表中重新登录后重试。");
        }
        // Bilibili
        if (u.includes("passport.bilibili.com/login")) {
          throw new Error("[登录态失效] 哔哩哔哩创作中心登录态已失效。请在自媒体账号列表中重新登录后重试。");
        }
        // Kuaishou
        if (u.includes("cp.kuaishou.com/profile/login") || u.includes("cp.kuaishou.com/login")) {
          throw new Error("[登录态失效] 快手创作者中心登录态已失效。请在自媒体账号列表中重新登录后重试。");
        }
      }

      async function resolveTargetContext(p, selector, timeoutMs, stateType = "attached") {
        checkSessionExpired(p);
        const frames = (typeof p.frames === "function") ? p.frames() : [];
        if (!frames || frames.length <= 1) {
          await p.waitForSelector(selector, { timeout: timeoutMs, state: stateType });
          return p;
        }

        // 页面存在微前端或 iframe（例如微信视频号 /micro/content/ 或 B 站投稿 frame）
        // 1. 先在主页面进行快速探测
        const probeMs = Math.min(2500, timeoutMs);
        try {
          const el = await p.waitForSelector(selector, { timeout: probeMs, state: stateType });
          if (el) return p;
        } catch {}

        checkSessionExpired(p);

        // 2. 遍历所有子 frame 探测匹配项
        for (const frame of frames) {
          if (frame === p.mainFrame()) continue;
          try {
            const el = await frame.waitForSelector(selector, { timeout: probeMs, state: stateType });
            if (el) return frame;
          } catch {}
        }

        checkSessionExpired(p);

        // 3. 若快速探测均未命中，定位可能承载内容的微前端 Frame 进行兜底等待
        const microFrame = frames.find(f => {
          try {
            const curUrl = f.url() || "";
            return curUrl.includes("micro") || curUrl.includes("finder") || curUrl.includes("creator") || curUrl.includes("content");
          } catch { return false; }
        });
        const finalTarget = microFrame || p;
        const remainMs = Math.max(1000, timeoutMs - probeMs * 2);
        await finalTarget.waitForSelector(selector, { timeout: remainMs, state: stateType });
        return finalTarget;
      }

      let stepIndex = 0;
      for (const step of steps) {
        stepIndex++;
        const startTime = Date.now();
        const action = String(step.action || "goto").toLowerCase();
        const stepName = step.name || `${action} (#${stepIndex})`;
        const entry = {
          stepIndex,
          action,
          name: stepName,
          ok: false,
          durationMs: 0,
        };

        try {
          const timeout = Math.max(1000, Number(step.timeout ?? 15000));
          if (action === "goto" || action === "navigate") {
            const url = String(step.url || "https://www.google.com");
            try {
              await page.goto(url, { timeout: Math.max(timeout, gotoTimeoutMs), waitUntil: "domcontentloaded" });
            } catch (err) {
              // 容错重试：若因第三方分析脚本导致 domcontentloaded 超时，降级采用 commit 流式加载并结合元素就绪
              try {
                await page.goto(url, { timeout: 15000, waitUntil: "commit" });
              } catch {
                throw err;
              }
            }
            checkSessionExpired(page);
            entry.url = url;
            entry.ok = true;
          } else if (action === "click") {
            const selector = String(step.selector || "");
            if (!selector) throw new Error("缺少选择器 (selector)");
            if (step.optional) {
              const optTimeout = Math.max(3000, Number(step.timeout || 8000));
              try {
                const target = await resolveTargetContext(page, selector, optTimeout);
                let clicked = false;
                try {
                  await target.click(selector, { timeout: optTimeout });
                  clicked = true;
                } catch (_) {
                  try {
                    await target.click(selector, { timeout: 2000, force: true });
                    clicked = true;
                  } catch (_) {
                    try {
                      await target.$eval(selector, (el) => {
                        if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", inline: "center" });
                        if (typeof el.focus === "function") el.focus();
                        if (typeof el.click === "function") el.click();
                        if (el.tagName === "INPUT" && el.type === "checkbox") {
                          if (!el.checked) {
                            el.checked = true;
                            el.dispatchEvent(new Event("change", { bubbles: true }));
                            el.dispatchEvent(new Event("input", { bubbles: true }));
                          }
                        }
                      });
                      clicked = true;
                    } catch (_) {}
                  }
                }
                if (clicked) {
                  entry.selector = selector;
                  entry.ok = true;
                } else {
                  entry.selector = selector;
                  entry.ok = true;
                  entry.skipped = true;
                  entry.durationMs = Date.now() - startTime;
                  entry.note = "可选点击项尝试未成功，自动跳过并顺延";
                }
              } catch (clickErr) {
                if (String(clickErr).includes("[登录态失效]")) throw clickErr;
                entry.selector = selector;
                entry.ok = true;
                entry.skipped = true;
                entry.durationMs = Date.now() - startTime;
                entry.note = "可选点击项未出现，自动跳过并顺延";
              }
            } else {
              const target = await resolveTargetContext(page, selector, timeout);

              // 使用 Playwright 原生定位器检查目标按钮是否处于禁用状态（支持 :has-text() 等原生与扩展伪类）
              const elHandle = await target.$(selector).catch(() => null);
              if (elHandle) {
                let isDisabled = await elHandle.evaluate((el) => {
                  return !!(
                    el.disabled ||
                    el.getAttribute("aria-disabled") === "true" ||
                    el.classList.contains("disabled") ||
                    el.classList.contains("weui-desktop-btn_disabled") ||
                    el.classList.contains("semi-button-disabled")
                  );
                }).catch(() => false);

                if (isDisabled) {
                  // 等待最多 15 秒看其是否随着素材转码或表单字段输入完成而解除禁用
                  const waitStart = Date.now();
                  while (Date.now() - waitStart < Math.min(timeout, 15000)) {
                    await page.waitForTimeout(1000);
                    const freshHandle = await target.$(selector).catch(() => null);
                    if (!freshHandle) break;
                    isDisabled = await freshHandle.evaluate((el) => {
                      return !!(
                        el.disabled ||
                        el.getAttribute("aria-disabled") === "true" ||
                        el.classList.contains("disabled") ||
                        el.classList.contains("weui-desktop-btn_disabled") ||
                        el.classList.contains("semi-button-disabled")
                      );
                    }).catch(() => false);
                    if (!isDisabled) break;
                  }

                  if (isDisabled) {
                    const pageErrors = await page.evaluate(() => {
                      const nodes = document.querySelectorAll(
                        ".weui-desktop-form__tips, .error, .tips-error, [class*='error-tip'], [role='alert'], .weui-desktop-tips_warn, .semi-form-field-error-message, .alert-error"
                      );
                      return Array.from(nodes).map(n => n.innerText.trim()).filter(Boolean);
                    }).catch(() => []);
                    const errDetail = pageErrors.length > 0 ? ` [表单现场校验报错: ${pageErrors.join("; ")}]` : "";
                    throw new Error(`目标操作按钮处于禁用置灰状态 (disabled)，无法执行提交${errDetail}`);
                  }
                }
              }

              if (elHandle) {
                await elHandle.evaluate((el) => {
                  if (typeof el.scrollIntoView === "function") {
                    el.scrollIntoView({ block: "center", inline: "center" });
                  }
                }).catch(() => {});
                await page.waitForTimeout(200);
              }

              let clickSuccess = false;
              if (elHandle) {
                try {
                  await elHandle.click({ timeout: Math.min(timeout, 5000) });
                  clickSuccess = true;
                } catch (_) {}
              }

              if (!clickSuccess) {
                try {
                  await target.click(selector, { timeout });
                  clickSuccess = true;
                } catch (clickErr) {
                  // 如果遭遇浮层/联想下拉遮挡 (intercepts pointer events)，降级使用 force: true 或原生 DOM focus/click
                  try {
                    await target.click(selector, { timeout: 4000, force: true });
                    clickSuccess = true;
                  } catch {
                    await target.$eval(selector, (el) => {
                      if (typeof el.scrollIntoView === "function") {
                        el.scrollIntoView({ block: "center", inline: "center" });
                      }
                      if (typeof el.focus === "function") el.focus();
                      if (typeof el.click === "function") el.click();
                    });
                    clickSuccess = true;
                  }
                }
              }
              entry.selector = selector;
              entry.ok = true;
            }
          } else if (action === "check") {
            const selector = String(step.selector || "");
            if (!selector) throw new Error("缺少选择器 (selector)");
            try {
              const chkTimeout = Math.max(3000, Number(step.timeout || 10000));
              const target = await resolveTargetContext(page, selector, chkTimeout);
              const el = await target.$(selector);
              if (el) {
                const tag = await el.evaluate(e => e.tagName.toUpperCase()).catch(() => "");
                const type = await el.evaluate(e => e.getAttribute("type")).catch(() => "");
                if (tag === "INPUT" && type === "checkbox") {
                  if (step.uncheck) {
                    await el.uncheck({ force: true }).catch(() => el.click({ force: true }));
                  } else {
                    await el.check({ force: true }).catch(() => el.click({ force: true }));
                  }
                } else {
                  // 自定义复选框 (如 div.m-agree, span.checkbox)
                  await el.click({ force: true });
                }
              }
              entry.selector = selector;
              entry.ok = true;
            } catch (chkErr) {
              if (String(chkErr).includes("[登录态失效]")) throw chkErr;
              if (step.optional) {
                entry.selector = selector;
                entry.ok = true;
                entry.skipped = true;
                entry.durationMs = Date.now() - startTime;
                entry.note = "可选勾选项未出现，已跳过";
              } else {
                throw chkErr;
              }
            }
          } else if (action === "type" || action === "fill") {
            const selector = String(step.selector || "");
            if (!selector) throw new Error("缺少选择器 (selector)");
            const text = String(step.text ?? "");
            let target;
            if (step.optional) {
              const optTimeout = Math.max(3000, Number(step.timeout || 8000));
              try {
                target = await resolveTargetContext(page, selector, optTimeout);
              } catch (typeErr) {
                if (String(typeErr).includes("[登录态失效]")) throw typeErr;
                entry.selector = selector;
                entry.ok = true;
                entry.skipped = true;
                entry.durationMs = Date.now() - startTime;
                entry.note = "可选输入项未出现，自动跳过并顺延";
                results.push(entry);
                process.stdout.write(JSON.stringify({ progress: entry }) + "\n");
                continue;
              }
            } else {
              target = await resolveTargetContext(page, selector, timeout);
            }

            // 智能元素适配：如果是 <select> 下拉框，则自动转为下拉选项选择，防止 Playwright 报错
            const tag = await target.$eval(selector, (el) => el.tagName.toUpperCase()).catch(() => "");
            if (tag === "SELECT") {
              const rawVal = text;
              let selected = false;
              try {
                await target.selectOption(selector, rawVal, { timeout: 4000 });
                selected = true;
              } catch {
                const num = parseInt(rawVal, 10);
                if (!isNaN(num)) {
                  try {
                    await target.selectOption(selector, { index: num }, { timeout: 3000 });
                    selected = true;
                  } catch {}
                }
              }
              await target.evaluate(({ sel, val }) => {
                const el = document.querySelector(sel);
                if (!el || el.tagName !== "SELECT") return;
                try { el.focus(); } catch (_) {}
                let targetIndex = -1;
                if (el.options && el.options.length > 0) {
                  for (let i = 0; i < el.options.length; i++) {
                    const opt = el.options[i];
                    if (opt.value === String(val) || opt.text === String(val) || opt.text.startsWith(String(val))) {
                      targetIndex = i;
                      break;
                    }
                  }
                  if (targetIndex < 0) {
                    const num = parseInt(val, 10);
                    if (!isNaN(num) && num < el.options.length) targetIndex = num;
                  }
                }
                const chosenVal = (targetIndex >= 0 && el.options[targetIndex]) ? el.options[targetIndex].value : String(val);
                if (targetIndex >= 0) el.selectedIndex = targetIndex;
                const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
                if (setter) setter.call(el, chosenVal);
                else el.value = chosenVal;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
                el.dispatchEvent(new Event("blur", { bubbles: true }));
              }, { sel: selector, val: rawVal }).catch(() => {});
              entry.selector = selector;
              entry.text = text;
              entry.ok = true;
            } else {
              try {
                await target.click(selector, { timeout: 3000 }).catch(() => {});
              } catch {}

              const elHandle = await target.$(selector).catch(() => null);
              const isContentEditable = elHandle ? await elHandle.evaluate((el) => {
                return !!(el.isContentEditable || el.getAttribute("contenteditable") === "true" || el.classList.contains("input-editor"));
              }).catch(() => false) : false;

              if (isContentEditable) {
                // 富文本编辑器专项适配 (针对微信视频号 input-editor, 抖音 zone-container, 小红书 ProseMirror)
                // 必须通过真实受信任键盘按键输入，触发 React onBeforeInput/onInput，进而点亮发布按钮
                try {
                  if (elHandle) await elHandle.focus().catch(() => {});
                  if (step.clear !== false) {
                    await page.keyboard.press("Control+A").catch(() => {});
                    await page.keyboard.press("Backspace").catch(() => {});
                    await page.waitForTimeout(200);
                  }
                  // 使用 pressSequentially 或 keyboard.type 注入真实用户键盘事件
                  if (typeof target.locator === "function") {
                    try {
                      await target.locator(selector).pressSequentially(text, { delay: 30 });
                    } catch {
                      await page.keyboard.type(text, { delay: 30 });
                    }
                  } else {
                    await page.keyboard.type(text, { delay: 30 });
                  }
                  await page.waitForTimeout(400);
                } catch (typeRichErr) {
                  // 兜底 DOM 注入
                  if (elHandle) {
                    await elHandle.evaluate((el, t) => {
                      document.execCommand("insertText", false, t);
                      el.dispatchEvent(new Event("input", { bubbles: true }));
                    }, text).catch(() => {});
                  }
                }
              } else {
                if (step.clear) {
                  try {
                    await target.fill(selector, "");
                  } catch (_) {
                    try {
                      await target.click(selector);
                      await page.keyboard.press("Control+A");
                      await page.keyboard.press("Backspace");
                    } catch (_) {}
                  }
                  await page.waitForTimeout(100);
                }
                const delay = Number(step.delay ?? 50);
                if (delay > 0) {
                  if (typeof target.locator === "function") {
                    try {
                      await target.locator(selector).pressSequentially(text, { delay });
                    } catch {
                      await target.type(selector, text, { delay });
                    }
                  } else {
                    await target.type(selector, text, { delay });
                  }
                } else {
                  await target.fill(selector, text).catch(() => target.type(selector, text));
                }
              }
              entry.selector = selector;
              entry.text = text;
              entry.ok = true;
            }
          } else if (action === "screenshot") {
            const fullPage = !!step.fullPage;
            const buffer = await page.screenshot({ fullPage });
            entry.screenshot = `data:image/png;base64,${buffer.toString("base64")}`;
            entry.fullPage = fullPage;
            entry.ok = true;
          } else if (action === "wait") {
            if (step.selector) {
              const sel = String(step.selector);
              try {
                const target = await resolveTargetContext(page, sel, timeout);
                entry.selector = sel;
              } catch (waitErr) {
                if (String(waitErr).includes("[登录态失效]")) throw waitErr;
                const inDom = await page.evaluate((s) => {
                  try { return !!document.querySelector(s); } catch { return false; }
                }, sel).catch(() => false);
                if (!inDom && !step.optional) throw waitErr;
              }
              entry.selector = sel;
            } else {
              const minMs = Number(step.minDuration || step.min || 0);
              const maxMs = Number(step.maxDuration || step.max || 0);
              let ms = Math.max(100, Number(step.duration ?? 2000));
              if (minMs > 0 && maxMs >= minMs) {
                ms = Math.floor(minMs + Math.random() * (maxMs - minMs));
              }
              await page.waitForTimeout(ms);
              entry.duration = ms;
            }
            entry.ok = true;
          } else if (action === "scroll") {
            const times = Math.max(1, Math.min(10, Number(step.times || 1)));
            for (let t = 0; t < times; t++) {
              const distance = step.distance === "bottom" ? "bottom" : Number(step.distance ?? 400);
              if (distance === "bottom") {
                await page.evaluate(() => {
                  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                  if (document.documentElement) document.documentElement.scrollTop = document.documentElement.scrollHeight;
                  if (document.body) document.body.scrollTop = document.body.scrollHeight;
                  const scrollables = Array.from(document.querySelectorAll("div, main, section, [class*='container'], [class*='content'], [class*='form']"));
                  for (const el of scrollables) {
                    if (el.scrollHeight > el.clientHeight + 40) {
                      el.scrollTop = el.scrollHeight;
                    }
                  }
                });
              } else {
                const jitter = step.randomJitter ? Math.floor(Math.random() * 80 - 40) : 0;
                await page.evaluate((d) => {
                  window.scrollBy({ top: d, behavior: "smooth" });
                }, distance + jitter);
              }
              if (times > 1 && t < times - 1) {
                const interval = Number(step.intervalMs || (800 + Math.random() * 600));
                await page.waitForTimeout(interval);
              }
            }
            entry.distance = step.distance ?? 400;
            entry.ok = true;
          } else if (action === "press") {
            const key = String(step.key || "Enter");
            await page.keyboard.press(key);
            entry.key = key;
            entry.ok = true;
          } else if (action === "upload" || action === "setinputfiles" || action === "file") {
            const selector = String(step.selector || "input[type='file']");
            let files = [];
            if (Array.isArray(step.files)) files = step.files;
            else if (step.file) files = [step.file];
            else if (step.value) files = [step.value];
            else if (step.path) files = [step.path];
            if (files.length === 0) throw new Error("缺少待上传文件路径 (files)");

            // 智能前置路由保护：针对微信视频号等平台，若当前页面仍在作品列表页 (post/list) 且无文件上传框
            const curUrl = page.url() || "";
            if (curUrl.includes("channels.weixin.qq.com") && curUrl.includes("platform/post/list")) {
              const hasFileInList = await page.$("input[type='file']").catch(() => null);
              if (!hasFileInList) {
                // 尝试定位并点击【发表视频】按钮
                try {
                  const enterBtn = await page.waitForSelector("button:has-text('发表视频'), a:has-text('发表视频'), .weui-desktop-btn_primary:has-text('发表视频'), div:text-is('发表视频')", { timeout: 8000 });
                  if (enterBtn) {
                    await enterBtn.click();
                    await page.waitForTimeout(3000);
                  }
                } catch (_) {}

                // 若仍未进入 post/create 发布编辑工作台，直接进行前端路由导航
                if (!page.url().includes("post/create")) {
                  await page.goto("https://channels.weixin.qq.com/platform/post/create", { timeout: 25000, waitUntil: "domcontentloaded" }).catch(() => {});
                  await page.waitForTimeout(3000);
                }
              }
            }

            let target = null;
            try {
              target = await resolveTargetContext(page, selector, Math.max(timeout, 30000), "attached");
              await target.setInputFiles(selector, files);
            } catch (firstErr) {
              // 兜底重试：遍历所有 Frame 查找任何已挂载的 input[type='file']
              let fallbackSuccess = false;
              const frames = (typeof page.frames === "function") ? page.frames() : [page];
              for (const f of frames) {
                try {
                  const hasInput = await f.$("input[type='file']");
                  if (hasInput) {
                    await f.setInputFiles("input[type='file']", files);
                    target = f;
                    fallbackSuccess = true;
                    break;
                  }
                } catch (_) {}
              }
              if (!fallbackSuccess) {
                throw firstErr;
              }
            }
            entry.selector = selector;
            entry.files = files;
            entry.ok = true;
          } else if (action === "hover") {
            const selector = String(step.selector || "");
            if (!selector) throw new Error("缺少选择器 (selector)");
            const target = await resolveTargetContext(page, selector, timeout);
            await target.hover(selector, { timeout });
            entry.selector = selector;
            entry.ok = true;
          } else if (action === "select" || action === "selectoption") {
            const selector = String(step.selector || "");
            if (!selector) throw new Error("缺少选择器 (selector)");
            const rawVal = String(step.value ?? step.text ?? "");
            const selTimeout = Math.max(5000, Number(step.timeout || timeout || 15000));

            // 1. 等待下拉框元素在 DOM 中可见可用
            const target = await resolveTargetContext(page, selector, selTimeout);

            // 智能元素适配：如果是 <input> 或 <textarea>，自动转为填值
            const tag = await target.$eval(selector, (el) => el.tagName.toUpperCase()).catch(() => "");
            if (tag === "INPUT" || tag === "TEXTAREA") {
              await target.fill(selector, rawVal);
              entry.selector = selector;
              entry.value = rawVal;
              entry.ok = true;
            } else {
              // 2. 优先执行 Playwright 原生 selectOption (触发受信任的用户操作事件)
              let selected = false;
              try {
                await target.selectOption(selector, rawVal, { timeout: 4000 });
                selected = true;
              } catch {
                const num = parseInt(rawVal, 10);
                if (!isNaN(num)) {
                  try {
                    await target.selectOption(selector, { index: num }, { timeout: 3000 });
                    selected = true;
                  } catch {}
                }
              }

              // 3. 原型链级 DOM 兜底 (确保 React Fluent UI / SyntheticEvent 100% 捕获变更)
              await target.evaluate(({ sel, val }) => {
                const el = document.querySelector(sel);
                if (!el || el.tagName !== "SELECT") return;
                try { el.focus(); } catch (_) {}
                let targetIndex = -1;
                if (el.options && el.options.length > 0) {
                  for (let i = 0; i < el.options.length; i++) {
                    const opt = el.options[i];
                    if (opt.value === String(val) || opt.text === String(val) || opt.text.startsWith(String(val))) {
                      targetIndex = i;
                      break;
                    }
                  }
                  if (targetIndex < 0) {
                    const num = parseInt(val, 10);
                    if (!isNaN(num) && num < el.options.length) targetIndex = num;
                  }
                }
                const chosenVal = (targetIndex >= 0 && el.options[targetIndex]) ? el.options[targetIndex].value : String(val);
                if (targetIndex >= 0) el.selectedIndex = targetIndex;
                const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
                if (setter) setter.call(el, chosenVal);
                else el.value = chosenVal;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
                el.dispatchEvent(new Event("blur", { bubbles: true }));
              }, { sel: selector, val: rawVal }).catch(() => {});

              entry.selector = selector;
              entry.value = rawVal;
              entry.ok = true;
            }
          } else if (action === "check") {
            const selector = String(step.selector || "");
            if (!selector) throw new Error("缺少选择器 (selector)");
            await page.waitForSelector(selector, { timeout });
            if (step.uncheck) {
              await page.uncheck(selector, { timeout });
              entry.checked = false;
            } else {
              await page.check(selector, { timeout });
              entry.checked = true;
            }
            entry.selector = selector;
            entry.ok = true;
          } else if (action === "verify_publish" || action === "verifypublish") {
            const successSelector = String(step.selector || "text=发表成功, text=已发表, text=发布成功, text=作品发布成功, text=审核中, text=稿件投递成功, text=视频已上传成功");
            const targetUrlPattern = String(step.url || step.waitUrl || "");
            const verifyTimeout = Math.max(8000, Number(step.timeout || 25000));
            const startVerifyTime = Date.now();
            let verified = false;
            let verifyReason = "";

            while (Date.now() - startVerifyTime < verifyTimeout) {
              const currentUrl = page.url() || "";

              // 1. 检查目标 URL 跳转
              if (targetUrlPattern && currentUrl.includes(targetUrlPattern.replace(/\*/g, ""))) {
                verified = true;
                verifyReason = `页面已成功跳转至发布管理后台: ${currentUrl}`;
                break;
              }

              // 针对微信视频号：如果从 post/create 成功离开跳回 post/list 或 platform 其它路由
              if (currentUrl.includes("/platform/post/list") || (!currentUrl.includes("/post/create") && currentUrl.includes("channels.weixin.qq.com/platform/"))) {
                verified = true;
                verifyReason = `视频号已成功提交并跳转至作品列表管理页: ${currentUrl}`;
                break;
              }

              // 针对抖音：跳转至 creator-micro/content/manage
              if (currentUrl.includes("/creator-micro/content/manage")) {
                verified = true;
                verifyReason = "抖音作品已成功提交并进入内容管理页";
                break;
              }

              // 针对快手：跳转至 manage/video 或 manage
              if (currentUrl.includes("/article/manage/video") || currentUrl.includes("/manage/video") || currentUrl.includes("cp.kuaishou.com/article/manage")) {
                verified = true;
                verifyReason = "快手作品已成功提交并跳转至管理后台";
                break;
              }

              // 针对今日头条/西瓜：跳转至 articles 或 content-manage
              if (currentUrl.includes("/graphic/articles") || currentUrl.includes("/xigua/content-manage") || currentUrl.includes("mp.toutiao.com/profile_v4/")) {
                verified = true;
                verifyReason = "今日头条/西瓜作品已成功提交并进入内容管理页";
                break;
              }

              // 针对小红书：跳转至 notes 或离开 publish
              if (currentUrl.includes("/creator/notes") || (!currentUrl.includes("/publish/publish") && currentUrl.includes("creator.xiaohongshu.com/creator/"))) {
                verified = true;
                verifyReason = "小红书笔记已成功发布并进入内容列表";
                break;
              }

              // 针对哔哩哔哩：跳转至 upload-manager 或 home
              if (currentUrl.includes("member.bilibili.com/platform/upload-manager") || currentUrl.includes("member.bilibili.com/platform/home")) {
                verified = true;
                verifyReason = "B 站视频已成功投递并返回创作服务平台";
                break;
              }

              // 针对 TikTok：跳转至 tiktokstudio/content 或任何非 upload 页面
              if (currentUrl.includes("/tiktokstudio/content") || (!currentUrl.includes("/upload") && currentUrl.includes("/tiktokstudio/"))) {
                // 严密核验：确认并非误触发 Discard / Cancel 导致的异常退出
                const isDiscardModal = await page.evaluate(() => {
                  const modalText = document.body ? document.body.innerText : "";
                  return modalText.includes("Discard changes") || modalText.includes("Discard this video") || modalText.includes("Discard edits");
                }).catch(() => false);

                if (!isDiscardModal) {
                  verified = true;
                  verifyReason = `TikTok 视频已成功提交发布并跳转: ${currentUrl}`;
                  break;
                }
              }

              // 2. 检查页面或 Frame 是否出现明确的成功文本或提示框
              const frames = (typeof page.frames === "function") ? page.frames() : [page];
              for (const f of frames) {
                try {
                  const hasSuccessText = await f.evaluate(() => {
                    const text = document.body ? document.body.innerText : "";
                    const successKeywords = [
                      "发表成功", "发布成功", "作品发布成功", "已发表", "投稿成功",
                      "稿件投递成功", "审核中", "正在审核", "发布中", "视频已上传成功",
                      // TikTok & 海外平台成功反馈
                      "Manage your posts", "Your video has been uploaded", "Your video is being uploaded",
                      "Uploaded to TikTok", "View profile", "Upload another video", "Video uploaded",
                      "Post succeeded", "Post another video"
                    ];
                    for (const kw of successKeywords) {
                      if (text.includes(kw)) return kw;
                    }
                    const toast = document.querySelector(".weui-desktop-toast, .semi-toast, .ant-message, [class*='toast'], [class*='success-message']");
                    if (toast && (toast.innerText.includes("成功") || toast.innerText.includes("发表") || toast.innerText.includes("发布") || toast.innerText.includes("Uploaded"))) {
                      return toast.innerText.trim();
                    }
                    return null;
                  });

                  if (hasSuccessText) {
                    verified = true;
                    verifyReason = `捕获到平台发布成功提示: "${hasSuccessText}"`;
                    break;
                  }
                } catch {}
              }

              if (verified) break;

              // 3. 自动探测并点击发布后弹出的二次确认/原创声明模态窗（例如“未声明原创，是否直接发表？”、“创作分成计划/直接发表”、“确认发表作品？”等）
              for (const f of frames) {
                try {
                  const clickedBtn = await f.evaluate(() => {
                    // 3.1 优先检查是否存在【原创权益】或《原创声明须知》条款复选框未勾选
                    const protoCheckboxes = Array.from(document.querySelectorAll(
                      "div.original-proto-wrapper input.ant-checkbox-input, div.declare-body-wrapper input[type='checkbox'], input.ant-checkbox-input"
                    ));
                    for (const cb of protoCheckboxes) {
                      if (!cb.checked) {
                        cb.checked = true;
                        cb.dispatchEvent(new Event("change", { bubbles: true }));
                        cb.dispatchEvent(new Event("input", { bubbles: true }));
                        const parentLabel = cb.closest("label");
                        if (parentLabel) parentLabel.click();
                      }
                    }

                    // 3.2 收集页面所有可见的操作按钮（排除底部主提交按钮容器 .form-btns）
                    const allButtons = Array.from(document.querySelectorAll("button, div[role='button'], a[role='button'], a, .weui-desktop-btn, .ant-btn, .TUXButton"));
                    const targetTexts = [
                      "直接发表", "继续发表", "声明原创", "确认发表", "确定", "确认", "我知道了", "同意并继续", "确认提交",
                      // TikTok & 海外平台弹窗按钮
                      "Post now", "Post anyway", "Confirm", "Got it", "Allow", "Publish now", "Continue", "Proceed"
                    ];

                    for (const txt of targetTexts) {
                      for (const btn of allButtons) {
                        if (btn.classList.contains("form-btns") || btn.closest(".form-btns")) continue;
                        const bTxt = (btn.innerText || btn.textContent || "").trim();
                        const isDis = btn.disabled || btn.getAttribute("aria-disabled") === "true" || btn.classList.contains("disabled") || btn.classList.contains("weui-desktop-btn_disabled") || btn.classList.contains("ant-btn-disabled") || btn.classList.contains("TUXButton--disabled");
                        if (!isDis && (bTxt.toLowerCase() === txt.toLowerCase() || (txt.length >= 4 && bTxt.toLowerCase().includes(txt.toLowerCase())))) {
                          btn.click();
                          return `${txt} (弹窗自动确认响应)`;
                        }
                      }
                    }

                    // 3.3 专项适配 TikTok 对齐弹窗确认按钮 (杜绝原生 querySelector 使用非标准 :has-text 伪类抛 SyntaxError 阻断)
                    const tuxConfirm = Array.from(document.querySelectorAll("div[role='dialog'] button, div[class*='modal'] button, div.TUXModal button, div[role='dialog'] .TUXButton")).find(btn => {
                      if (btn.disabled || btn.getAttribute("aria-disabled") === "true") return false;
                      const t = (btn.innerText || btn.textContent || "").trim();
                      const isPrimary = btn.classList.contains("TUXButton--primary") || btn.classList.contains("primary");
                      return /^(Post now|Post anyway|Confirm|Got it|Allow)$/i.test(t) || (isPrimary && !/^(Cancel|Discard|Keep waiting)$/i.test(t));
                    });
                    if (tuxConfirm) {
                      tuxConfirm.click();
                      return `TikTok 模态窗确认 [${(tuxConfirm.innerText || "").trim()}]`;
                    }

                    // 3.4 针对 TikTok / 矩阵各平台：若仍停留在 upload 且页面存在尚未提交的 Post / 发布 按钮，自动定位并重击提交 (100% 对齐发布鸭 while True 循环)
                    const allCandidateButtons = Array.from(document.querySelectorAll("div.button-group button, div[class*='btn-post'] button, button.TUXButton--primary, button, .weui-desktop-btn, .ant-btn"));
                    const postAgainBtn = allCandidateButtons.find(b => {
                      const txt = (b.innerText || b.textContent || "").trim();
                      return /^Post$/i.test(txt) || /^Post now$/i.test(txt) || /^发布$/i.test(txt) || /^立即投稿$/i.test(txt);
                    });
                    if (postAgainBtn && !postAgainBtn.disabled && postAgainBtn.getAttribute("aria-disabled") !== "true") {
                      postAgainBtn.scrollIntoView({ block: "center", inline: "center" });
                      postAgainBtn.focus();
                      postAgainBtn.click();
                      return `底部发布按钮 [${(postAgainBtn.innerText || "").trim()}] 已触发补击提交`;
                    }

                    return null;
                  });

                  if (clickedBtn) {
                    process.stdout.write(JSON.stringify({ progress: { name: `自动响应平台二次确认弹窗: [${clickedBtn}]`, ok: true } }) + "\n");
                    await page.waitForTimeout(2000);
                    break;
                  }
                } catch {}
              }

              await page.waitForTimeout(1000);
            }

            if (!verified) {
              // 提取当前界面上的报错提示与按钮状态
              const formIssues = await page.evaluate(() => {
                const errors = Array.from(document.querySelectorAll(
                  ".weui-desktop-form__tips, .error, .tips-error, [class*='error-tip'], [role='alert'], .weui-desktop-tips_warn, .semi-form-field-error-message, .alert-error"
                ))
                  .map(el => el.innerText.trim())
                  .filter(Boolean);

                const allButtons = Array.from(document.querySelectorAll("button, .weui-desktop-btn, .ant-btn, .TUXButton"));
                const publishBtn = allButtons.find(b => {
                  const t = (b.innerText || b.textContent || "").trim();
                  return /发表|发布|投稿|^Post$/i.test(t);
                });
                let btnState = "";
                if (publishBtn) {
                  const isDisabled = publishBtn.disabled || publishBtn.getAttribute("aria-disabled") === "true" || publishBtn.classList.contains("disabled") || publishBtn.classList.contains("weui-desktop-btn_disabled") || publishBtn.classList.contains("TUXButton--disabled");
                  btnState = isDisabled ? "【发布按钮仍处于禁用置灰状态】" : "【发布按钮未触发提交或网络阻塞】";
                }
                return { errors, btnState };
              }).catch(() => ({ errors: [], btnState: "" }));

              const errMsg = formIssues.errors.length > 0
                ? `发布未达成，页面存在表单校验阻断: ${formIssues.errors.join("; ")}`
                : `未能捕获发布成功状态，且页面未完成跳转提交。${formIssues.btnState || "请检查必填信息是否已完整填写。"}`;

              throw new Error(errMsg);
            }

            entry.note = verifyReason;
            entry.ok = true;
          } else if (action === "eval" || action === "evaluate") {
            const script = String(step.script || "");
            if (!script) throw new Error("缺少要执行的 JavaScript 脚本 (script)");
            const evalResult = await page.evaluate((code) => {
              try {
                const fn = new Function(code);
                return fn();
              } catch {
                // eslint-disable-next-line no-eval
                return window.eval(code);
              }
            }, script);
            entry.evalResult = evalResult !== undefined ? String(evalResult).slice(0, 300) : "执行成功 (无返回值)";
            entry.ok = true;
          } else if (action === "takeover" || action === "interactive") {
            const maxWaitMs = Math.max(15000, Number(step.timeout || step.duration || 120000));
            const checkIntervalMs = 1000;
            const startTimeWait = Date.now();
            let solved = false;
            let finalStatus = "TIMEOUT";
            let holdAttempts = 0;
            const maxHoldAttempts = 30; // 只要有长按按钮，不限次数连续自动执行，直到彻底通关

            try {
              await page.bringToFront().catch(() => {});
            } catch {}

            while (Date.now() - startTimeWait < maxWaitMs) {
              const currentUrl = page.url() || "";

              // 1. 优先扫描并执行长按挑战（优先级最高：只要按钮还在，就代表挑战未结束！）
              let foundHoldButton = false;
              if (holdAttempts < maxHoldAttempts) {
                try {
                  const frames = page.frames();
                  let holdButtonHandle = null;

                  let targetFrame = page;

                  for (const f of frames) {
                    try {
                      const btn = await f.$(
                        'button:has-text("按住"), button:has-text("Hold"), button:has-text("長按"), button:has-text("长按"), button:has-text("Press and hold"), [aria-label*="按住"], [aria-label*="Hold"], [aria-label*="Press and hold"], button#home_children_button'
                      );
                      if (btn && await btn.isVisible().catch(() => false)) {
                        holdButtonHandle = btn;
                        targetFrame = f;
                        break;
                      }
                    } catch {}
                  }

                  if (!holdButtonHandle) {
                    const mainBtn = await page.$(
                      'button:has-text("按住"), button:has-text("Hold"), button:has-text("長按"), button:has-text("长按"), button:has-text("Press and hold"), [aria-label*="按住"], [aria-label*="Hold"]'
                    );
                    if (mainBtn && await mainBtn.isVisible().catch(() => false)) {
                      holdButtonHandle = mainBtn;
                      targetFrame = page;
                    }
                  }

                  if (holdButtonHandle) {
                    foundHoldButton = true;
                    const box = await holdButtonHandle.boundingBox().catch(() => null);
                    if (box && box.width > 0 && box.height > 0) {
                      holdAttempts++;
                      const targetX = box.x + box.width / 2;
                      const targetY = box.y + box.height / 2;
                      await page.mouse.move(targetX, targetY, { steps: 5 }).catch(() => {});
                      await page.mouse.down().catch(() => {});

                      // 动态检测进度条：按住直到进度条 100% 满圈才放手
                      const holdStartTime = Date.now();
                      const minHoldMs = 7800; // Arkose 环形进度条官方动画通常需要 7.0 ~ 7.5 秒才能 100% 闭环
                      const maxHoldMs = 11000; // 最长保护时长 11 秒

                      const checkProgressFn = () => {
                        // 1. 检查 progressbar 角色或进度类
                        const pbars = document.querySelectorAll('[role="progressbar"], .progress-bar, .progress, [class*="progress"]');
                        for (const pb of pbars) {
                          const now = pb.getAttribute('aria-valuenow');
                          const max = pb.getAttribute('aria-valuemax') || 100;
                          if (now !== null) {
                            const val = parseFloat(now);
                            const maxVal = parseFloat(max);
                            if (val >= maxVal || val >= 99) return { is100: true, reason: 'aria-valuenow-100' };
                          }
                          const w = pb.style.width || '';
                          if (w.includes('100%')) return { is100: true, reason: 'style-width-100' };
                        }

                        // 2. 检查 SVG 环形进度条 (circle / path 的 stroke-dashoffset)
                        const svgs = document.querySelectorAll('svg circle, svg path');
                        for (const el of svgs) {
                          const offset = el.style.strokeDashoffset || el.getAttribute('stroke-dashoffset');
                          if (offset !== null && offset !== undefined && offset !== '') {
                            const offVal = parseFloat(offset);
                            if (Math.abs(offVal) < 1.0) return { is100: true, reason: 'svg-stroke-0' };
                          }
                        }

                        // 3. 检查是否出现成功对勾 / 完成指示器 (Checkmark)
                        const successIcons = document.querySelectorAll(
                          'svg[class*="success"], svg[class*="check"], [class*="checkmark"], [class*="completed"], [class*="success-icon"], [data-theme*="success"], .fc-success, [aria-label*="成功"], [aria-label*="Complete"], [aria-label*="Passed"]'
                        );
                        for (const icon of successIcons) {
                          const r = icon.getBoundingClientRect();
                          if (r.width > 0 && r.height > 0) return { is100: true, reason: 'checkmark-visible' };
                        }

                        // 4. 检查提示文本
                        const text = document.body ? document.body.innerText : '';
                        if (text.includes('已完成') || text.includes('Verification complete') || text.includes('已驗證') || text.includes('通過') || text.includes('通过')) {
                          return { is100: true, reason: 'text-complete' };
                        }

                        // 5. 检查长按按钮是否已不可用或隐藏
                        const btn = Array.from(document.querySelectorAll('button, [aria-label*="按住"], [aria-label*="Hold"], button#home_children_button')).find(el => {
                          const t = el.innerText || el.textContent || el.getAttribute("aria-label") || "";
                          return /按住|Hold|長按|长按|Press and hold/i.test(t) || el.id === 'home_children_button';
                        });
                        if (btn) {
                          const r = btn.getBoundingClientRect();
                          if (r.width === 0 || r.height === 0 || btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
                            return { is100: true, reason: 'btn-disabled-or-hidden' };
                          }
                        }

                        return { is100: false };
                      };

                      while (Date.now() - holdStartTime < maxHoldMs) {
                        await page.waitForTimeout(150);
                        const elapsed = Date.now() - holdStartTime;

                        // 在 targetFrame 和 page 两个作用域中探测
                        let status = await targetFrame.evaluate(checkProgressFn).catch(() => null);
                        if (!status || !status.is100) {
                          if (targetFrame !== page) {
                            status = await page.evaluate(checkProgressFn).catch(() => null);
                          }
                        }

                        if (status && status.is100) {
                          if (status.reason === 'checkmark-visible' || status.reason === 'text-complete') {
                            // 对勾/成功标识已显现，巩固 300ms 后放手
                            await page.waitForTimeout(300);
                            break;
                          }
                          if (elapsed >= minHoldMs) {
                            // 进度条满 100% 且已满基础动画周期，多按 400ms 保证触发放手
                            await page.waitForTimeout(400);
                            break;
                          }
                        } else {
                          // 若未捕获到特定 DOM 属性，按压时长达到 8.8 秒（超过标准动画周期 1.3 秒）确保环形进度已 100% 充满
                          if (elapsed >= minHoldMs + 1000) {
                            await page.waitForTimeout(300);
                            break;
                          }
                        }
                      }

                      // 确认进度条 100% 满格后放开鼠标按键
                      await page.mouse.up().catch(() => {});
                      // 等待 2.2 秒让对勾动画结算并等待下一题或完成跳转
                      await page.waitForTimeout(2200);
                      continue; // 立即进行下一轮检测
                    }
                  }
                } catch (holdErr) {
                  // 继续检查
                }
              }

              // 2. 如果当前没有长按按钮，检测微软「保持登录？」弹窗并自动点击「是 / Yes」
              let hasKmsiPrompt = false;
              try {
                hasKmsiPrompt = await page.isVisible('#kmsiDescription, #idBtn_Back, input[value="Yes"], input[value="保持登入"], button:has-text("保持登录"), button:has-text("Yes"), button:has-text("是")').catch(() => false);
                if (hasKmsiPrompt) {
                  await page.click('#idBtn_Back, input[value="Yes"], button:has-text("保持登录"), button:has-text("Yes"), button:has-text("是")', { timeout: 3000 }).catch(() => {});
                  await page.waitForTimeout(2500);
                }
              } catch {}

              // 3. 严格核验是否已经进入官方成功页面 (确定性判定)
              const updatedUrl = page.url() || currentUrl;
              const isInboxReached = updatedUrl.includes("outlook.live.com") || updatedUrl.includes("/mail");
              const isAccountReached = updatedUrl.includes("account.microsoft.com") || updatedUrl.includes("privacynotice.account.microsoft.com");
              const isSuccessLanding = isInboxReached || isAccountReached || (!foundHoldButton && !updatedUrl.includes("signup.live.com") && (updatedUrl.includes("login.live.com/oauth") || updatedUrl.includes("landing")));

              if (isSuccessLanding) {
                solved = true;
                finalStatus = isInboxReached ? "SUCCESS_INBOX" : isAccountReached ? "SUCCESS_ACCOUNT" : "SUCCESS_LANDING";
                break;
              }

              // 4. 严格核验是否被微软风控拦截报错
              const hasBlockedError = await page.evaluate(() => {
                const text = document.body ? document.body.innerText : "";
                const alert = document.querySelector('#PasswordError, #MemberNameError, [role="alert"], .alert-error');
                const alertText = alert ? alert.innerText.trim() : "";
                if (alertText) return alertText;
                if (text.includes("无法完成注册") || text.includes("服务暂时不可用") || text.includes("暂时遇到问题") || text.includes("Too many requests")) {
                  return text.slice(0, 100);
                }
                return null;
              }).catch(() => null);

              if (hasBlockedError) {
                solved = false;
                finalStatus = "FAILED_BLOCKED";
                entry.blockError = hasBlockedError;
                break;
              }

              await page.waitForTimeout(checkIntervalMs);
            }

            if (solved) {
              entry.ok = true;
              entry.solved = true;
              entry.verified = true;
              entry.finalStatus = finalStatus;
              entry.note = `🎉 官方确认注册成功！微软已正式下发并落库该账号 (自动完成 ${holdAttempts} 轮长按验证并进入收件箱/个人中心)。`;
            } else {
              entry.ok = false;
              entry.solved = false;
              entry.verified = false;
              entry.finalStatus = finalStatus;
              if (finalStatus === "FAILED_BLOCKED") {
                entry.error = `❌ 微软注册被拦截: ${entry.blockError || "页面显示错误"}`;
                entry.note = `❌ 微软注册被拦截: ${entry.blockError || "未能完成注册"}`;
              } else {
                entry.error = `⚠️ 人机验证未通过或未完成最终跳转 (已自动尝试长按 ${holdAttempts} 次)。`;
                entry.note = `⚠️ 人机验证未通过或未完成最终跳转 (已自动尝试长按 ${holdAttempts} 次)。`;
              }
            }
          } else if (action === "adaptive_profile" || action === "smart_profile") {
            const fName = String(step.firstName || "Alex");
            const lName = String(step.lastName || "Miller");
            const year = String(step.birthYear || "1997");
            const month = Math.max(1, Math.min(12, Number(step.birthMonth || 5)));
            const day = Math.max(1, Math.min(31, Number(step.birthDay || 16)));
            const maxWaitMs = Math.max(15000, Number(step.timeout || 50000));
            const startTimeWait = Date.now();
            let bdaySubmitted = false;
            let nameSubmitted = false;
            let finalState = "IN_PROGRESS";

            while (Date.now() - startTimeWait < maxWaitMs) {
              // 1. 检查人机验证 / Arkose / Enforcement
              const hasArkose = await page.evaluate(() => {
                return !!document.querySelector('iframe[src*="arkoselabs"], iframe[src*="enforcement"], #enforcementFrame, [data-testid="arkose"]');
              }).catch(() => false);

              if (hasArkose) {
                finalState = "CAPTCHA_REACHED";
                break;
              }

              // 2. 检查生日/地区表单 (无论屏幕上是 年-月-日、日-月-年 还是 月-日-年，按字段唯一属性精确匹配)
              const bdayCheck = await page.evaluate(() => {
                const y = document.querySelector('input[name="BirthYear"], #BirthYear, [data-testid="BirthYear"]');
                const m = document.querySelector('button[name="BirthMonth"], #BirthMonthDropdown, select#BirthMonth, select[name="BirthMonth"]');
                const d = document.querySelector('button[name="BirthDay"], #BirthDayDropdown, select#BirthDay, select[name="BirthDay"]');
                if (y || m || d) {
                  return {
                    hasYear: !!y,
                    yearVal: y ? y.value : '',
                    hasMonth: !!m,
                    monthTag: m ? m.tagName : '',
                    monthText: m ? m.innerText.trim() : '',
                    hasDay: !!d,
                    dayTag: d ? d.tagName : '',
                    dayText: d ? d.innerText.trim() : ''
                  };
                }
                return null;
              }).catch(() => null);

              if (bdayCheck && !bdaySubmitted) {
                // A. 填写年份 (无论位置在第1、第2还是第3位)
                if (bdayCheck.hasYear && bdayCheck.yearVal !== String(year)) {
                  const ySel = 'input[name="BirthYear"], #BirthYear, [data-testid="BirthYear"]';
                  await page.fill(ySel, String(year)).catch(async () => {
                    await page.click(ySel);
                    await page.keyboard.type(String(year));
                  });
                  await page.waitForTimeout(250);
                }

                // B. 填写月份 (无论位置在第1、第2还是第3位，兼容 Fluent UI Combobox Button 与标准 Select)
                if (bdayCheck.hasMonth) {
                  if (bdayCheck.monthTag === 'BUTTON') {
                    const needsMonth = !bdayCheck.monthText || bdayCheck.monthText === '' || (!bdayCheck.monthText.match(/\d+/) && !bdayCheck.monthText.includes('月') && !bdayCheck.monthText.match(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i));
                    if (needsMonth) {
                      await page.click('button[name="BirthMonth"], #BirthMonthDropdown');
                      await page.waitForTimeout(400);
                      await page.evaluate((mIdx) => {
                        const options = document.querySelectorAll('[role="option"]');
                        if (options.length > mIdx) options[mIdx].click();
                        else if (options.length > 0) options[Math.min(mIdx, options.length - 1)].click();
                      }, month);
                      await page.waitForTimeout(400);
                    }
                  } else if (bdayCheck.monthTag === 'SELECT') {
                    await page.selectOption('select#BirthMonth, select[name="BirthMonth"]', String(month)).catch(() => {});
                  }
                }

                // C. 填写日/天 (无论位置在第1、第2还是第3位，兼容 Fluent UI Combobox Button 与标准 Select)
                if (bdayCheck.hasDay) {
                  if (bdayCheck.dayTag === 'BUTTON') {
                    const needsDay = !bdayCheck.dayText || bdayCheck.dayText === '' || (!bdayCheck.dayText.match(/\d+/) && !bdayCheck.dayText.includes('日') && !bdayCheck.dayText.includes('天'));
                    if (needsDay) {
                      await page.click('button[name="BirthDay"], #BirthDayDropdown');
                      await page.waitForTimeout(400);
                      await page.evaluate((dVal) => {
                        const options = document.querySelectorAll('[role="option"]');
                        let clicked = false;
                        for (const opt of options) {
                          const txt = opt.innerText.trim();
                          if (txt === String(dVal) || txt === `${dVal}日` || txt === String(dVal).padStart(2, '0')) {
                            opt.click();
                            clicked = true;
                            break;
                          }
                        }
                        if (!clicked && options.length > Number(dVal)) {
                          options[Number(dVal)].click();
                        }
                      }, day);
                      await page.waitForTimeout(400);
                    }
                  } else if (bdayCheck.dayTag === 'SELECT') {
                    await page.selectOption('select#BirthDay, select[name="BirthDay"]', String(day)).catch(() => {});
                  }
                }

                // 校验三个字段是否均已完整就绪
                const verified = await page.evaluate(() => {
                  const y = document.querySelector('input[name="BirthYear"], #BirthYear');
                  const m = document.querySelector('button[name="BirthMonth"], #BirthMonthDropdown, select#BirthMonth');
                  const d = document.querySelector('button[name="BirthDay"], #BirthDayDropdown, select#BirthDay');
                  const yOk = y && y.value && y.value.length === 4;
                  const mOk = m ? (m.tagName === 'BUTTON' ? (m.innerText && m.innerText.trim() !== '') : !!m.value) : false;
                  const dOk = d ? (d.tagName === 'BUTTON' ? (d.innerText && d.innerText.trim() !== '') : !!d.value) : false;
                  return { yOk, mOk, dOk };
                }).catch(() => ({ yOk: false, mOk: false, dOk: false }));

                if (verified.yOk && verified.mOk && verified.dOk) {
                  bdaySubmitted = true;
                  await page.click('#nextButton, button[type="submit"], input[type="submit"], #iSignupAction');
                  await page.waitForTimeout(1800);
                  continue;
                }
              }

              // 3. 检查姓名表单 (无论姓名在生日之前还是生日之后)
              const nameCheck = await page.evaluate(() => {
                const f = document.querySelector('#firstNameInput, #FirstNameInput, input[name="FirstName"]');
                const l = document.querySelector('#lastNameInput, #LastNameInput, input[name="LastName"]');
                if (f && f.offsetParent !== null) {
                  return { hasName: true, fVal: f.value, lVal: l ? l.value : '' };
                }
                return null;
              }).catch(() => null);

              if (nameCheck && !nameSubmitted) {
                if (!nameCheck.fVal || nameCheck.fVal !== fName) {
                  await page.fill('#firstNameInput, #FirstNameInput, input[name="FirstName"]', fName);
                }
                const lInput = await page.$('#lastNameInput, #LastNameInput, input[name="LastName"]');
                if (lInput && (!nameCheck.lVal || nameCheck.lVal !== lName)) {
                  await lInput.fill(lName);
                }
                nameSubmitted = true;
                await page.waitForTimeout(300);
                await page.click('#nextButton, button[type="submit"], input[type="submit"], #iSignupAction');
                await page.waitForTimeout(1800);
                continue;
              }

              // 4. 如果两个表单都已提交，或者已脱离 registration 表单页
              if ((bdaySubmitted || nameSubmitted) && !bdayCheck && !nameCheck) {
                finalState = "COMPLETED_TO_NEXT_STAGE";
                break;
              }

              await page.waitForTimeout(800);
            }

            entry.ok = true;
            entry.note = `自适应填写已完成 (状态: ${finalState}, 生日: ${year}-${month}-${day}, 姓名: ${fName} ${lName})`;
          } else if (action === "extract") {
            const selector = String(step.selector || "");
            if (!selector) throw new Error("缺少提取选择器 (selector)");
            await page.waitForSelector(selector, { timeout });
            const prop = String(step.property || "text").toLowerCase();
            const extracted = await page.$$eval(selector, (els, p) => {
              return els.map(el => {
                if (p === "href") return el.href || el.getAttribute("href");
                if (p === "src") return el.src || el.getAttribute("src");
                if (p === "value") return el.value;
                return el.innerText ? el.innerText.trim() : (el.textContent?.trim() || "");
              });
            }, prop);
            entry.selector = selector;
            entry.extracted = extracted;
            entry.note = `成功提取 ${extracted.length} 项数据`;
            entry.ok = true;
          } else if (action === "loop") {
            const loopTimes = Math.max(1, Math.min(50, Number(step.times || 3)));
            const subAction = String(step.subAction || "scroll").toLowerCase();
            for (let l = 0; l < loopTimes; l++) {
              if (subAction === "scroll") {
                await page.evaluate(() => window.scrollBy({ top: 350, behavior: "smooth" }));
              }
              await page.waitForTimeout(Number(step.intervalMs || 800));
            }
            entry.note = `已循环执行 ${loopTimes} 次`;
            entry.ok = true;
          } else {
            throw new Error(`不支持的步骤类型: ${action}`);
          }
        } catch (error) {
          if (step.optional) {
            entry.ok = true;
            entry.skipped = true;
            entry.note = "可选步骤执行受阻已自动跳过";
          } else {
            let errorDetail = formatPlaywrightError(error);
            try {
              const domError = await page.evaluate(() => {
                const err = document.querySelector('#PasswordError, #MemberNameError, [role="alert"], [id*="Error"], .alert-error');
                return err ? err.innerText.trim() : "";
              }).catch(() => "");
              if (domError) {
                errorDetail += ` [表单现场报错: ${domError}]`;
              } else {
                const title = await page.title().catch(() => "");
                const url = page.url() || "";
                if (title) errorDetail += ` [当前停留在: ${title} (${url.slice(0, 80)})]`;
              }
              const failScreenshot = await page.screenshot({ fullPage: false }).catch(() => null);
              if (failScreenshot) {
                entry.screenshot = `data:image/png;base64,${failScreenshot.toString("base64")}`;
                try {
                  const fs = require("fs");
                  fs.writeFileSync("C:\\Tools2\\fingerBrowsers2\\NarciPHBrowser\\last_workflow_failure.png", failScreenshot);
                } catch (_) {}
              }
            } catch (_) {}
            entry.error = errorDetail;
            entry.ok = false;
          }
        }

        entry.durationMs = Date.now() - startTime;
        results.push(entry);
        process.stdout.write(JSON.stringify({ progress: entry }) + "\n");

        if (!entry.ok && step.stopOnError !== false) {
          break;
        }
      }
    } else if (mode === "search") {
      const keywords = (Array.isArray(job.keywords) && job.keywords.length > 0)
        ? job.keywords
        : ["NarciPH 指纹浏览器", "跨境电商多账号管理", "浏览器指纹检测"];
      const engine = job.engine === "google" ? "google" : "bing";
      const engineUrl = engine === "google" ? "https://www.google.com" : "https://www.bing.com";

      for (const kw of keywords) {
        const entry = { url: `${engineUrl} [${kw}]`, ok: false };
        try {
          await page.goto(engineUrl, { timeout: gotoTimeoutMs, waitUntil: "domcontentloaded" });
          await page.waitForTimeout(1500);

          const inputSelector = engine === "google"
            ? 'textarea[name="q"], input[name="q"]'
            : '#sb_form_q, input[name="q"]';
          await page.waitForSelector(inputSelector, { timeout: 10000 });
          await page.fill(inputSelector, String(kw));
          await page.keyboard.press("Enter");
          await page.waitForTimeout(3000);

          // 模拟真人平滑滚动浏览自然搜索结果
          await page.evaluate(() => {
            window.scrollBy({ top: 400, behavior: "smooth" });
          });
          await page.waitForTimeout(secondsPerSite * 1000);
          entry.ok = true;
        } catch (error) {
          entry.error = formatPlaywrightError(error);
        }
        results.push(entry);
        process.stdout.write(JSON.stringify({ progress: entry }) + "\n");
      }
    } else if (mode === "check") {
      const checkUrls = Array.isArray(job.sites) && job.sites.length > 0
        ? job.sites
        : ["https://api.ipify.org?format=json"];
      for (const checkUrl of checkUrls) {
        const entry = { url: String(checkUrl), ok: false };
        try {
          const resp = await page.goto(entry.url, { timeout: gotoTimeoutMs, waitUntil: "domcontentloaded" });
          await page.waitForTimeout(1500);
          const bodyText = (await page.innerText("body").catch(() => "")) || "";
          entry.data = bodyText.trim().slice(0, 150);
          entry.status = resp ? resp.status() : 200;
          entry.ok = entry.status >= 200 && entry.status < 400;
        } catch (error) {
          entry.error = formatPlaywrightError(error);
        }
        results.push(entry);
        process.stdout.write(JSON.stringify({ progress: entry }) + "\n");
      }
    } else {
      for (const site of sites) {
        const entry = { url: String(site), ok: false };
        try {
          await page.goto(entry.url, { timeout: gotoTimeoutMs, waitUntil: "domcontentloaded" });
          if (job.randomScroll !== false) {
            await page.waitForTimeout(1000);
            await page.evaluate(() => {
              window.scrollBy({ top: 350, behavior: "smooth" });
            });
          }
          await page.waitForTimeout(secondsPerSite * 1000);
          entry.ok = true;
        } catch (error) {
          entry.error = formatPlaywrightError(error);
        }
        results.push(entry);
        process.stdout.write(JSON.stringify({ progress: entry }) + "\n");
      }
    }

    await page.close();
    process.stdout.write(JSON.stringify({ results }) + "\n");
    // A connected browser is disconnected here, not killed: the automation
    // server owns the process and shuts it down cleanly, flushing the
    // profile's data to disk.
    await browser.close();
    process.exit(0);
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        error: formatPlaywrightError(error),
      }) + "\n",
    );
    process.exit(1);
  }
})();
