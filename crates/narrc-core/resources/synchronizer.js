// Synchronizer engine for NarciPHBrowser (Multi-Window Cluster Controller)
// Run with: node synchronizer.js <driverDir> <commandJson>

const driverDir = process.argv[2];
if (!driverDir) {
  console.error(JSON.stringify({ ok: false, error: "Missing driver directory" }));
  process.exit(1);
}

const rawCmd = process.argv[3];
if (!rawCmd) {
  console.error(JSON.stringify({ ok: false, error: "Missing command payload" }));
  process.exit(1);
}

let cmd;
try {
  cmd = JSON.parse(rawCmd);
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: `Invalid command JSON: ${e.message}` }));
  process.exit(1);
}

const playwright = require(driverDir);
const { firefox } = playwright;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getActivePage(browser) {
  const context = browser.contexts()[0] || (await browser.newContext());
  const pages = context.pages();
  return pages.length > 0 ? pages[0] : await context.newPage();
}

(async () => {
  const action = String(cmd.action || "").toLowerCase();
  const slaveEndpoints = Array.isArray(cmd.slaveEndpoints) ? cmd.slaveEndpoints : [];
  const jitterEnabled = !!cmd.jitter;
  const timeoutMs = Math.max(3000, Number(cmd.timeoutMs || 15000));

  // 1. 广播打开指定 URL
  if (action === "broadcast_url") {
    const targetUrl = cmd.url;
    if (!targetUrl) throw new Error("缺少广播目标 URL");

    const allEndpoints = cmd.masterEndpoint ? [cmd.masterEndpoint, ...slaveEndpoints] : slaveEndpoints;
    const tasks = allEndpoints.map(async (ep) => {
      let b;
      try {
        b = await firefox.connect(ep, { timeout: timeoutMs });
        const p = await getActivePage(b);
        await p.goto(targetUrl, { timeout: timeoutMs, waitUntil: "domcontentloaded" });
        return { endpoint: ep, ok: true, url: p.url(), title: await p.title() };
      } catch (err) {
        return { endpoint: ep, ok: false, error: err.message };
      } finally {
        if (b) await b.close().catch(() => {});
      }
    });

    const results = await Promise.all(tasks);
    console.log(JSON.stringify({ ok: true, action, results }));
    return;
  }

  // 2. 广播页面刷新
  if (action === "broadcast_reload") {
    const allEndpoints = cmd.masterEndpoint ? [cmd.masterEndpoint, ...slaveEndpoints] : slaveEndpoints;
    const tasks = allEndpoints.map(async (ep) => {
      let b;
      try {
        b = await firefox.connect(ep, { timeout: timeoutMs });
        const p = await getActivePage(b);
        await p.reload({ timeout: timeoutMs, waitUntil: "domcontentloaded" });
        return { endpoint: ep, ok: true };
      } catch (err) {
        return { endpoint: ep, ok: false, error: err.message };
      } finally {
        if (b) await b.close().catch(() => {});
      }
    });
    const results = await Promise.all(tasks);
    console.log(JSON.stringify({ ok: true, action, results }));
    return;
  }

  // 3. 广播拟人鼠标点击
  if (action === "broadcast_click") {
    const { x, y } = cmd;
    if (typeof x !== "number" || typeof y !== "number") {
      throw new Error("缺少点击坐标 x, y");
    }

    const tasks = slaveEndpoints.map(async (ep) => {
      let b;
      try {
        b = await firefox.connect(ep, { timeout: timeoutMs });
        const p = await getActivePage(b);

        // 拟人抖动：时间随机延迟 30~180ms，坐标随机微偏移 ±2px
        let clickX = x;
        let clickY = y;
        if (jitterEnabled) {
          await sleep(Math.floor(30 + Math.random() * 150));
          clickX += (Math.random() - 0.5) * 4;
          clickY += (Math.random() - 0.5) * 4;
        }

        await p.mouse.click(clickX, clickY);
        return { endpoint: ep, ok: true, clickedX: clickX, clickedY: clickY };
      } catch (err) {
        return { endpoint: ep, ok: false, error: err.message };
      } finally {
        if (b) await b.close().catch(() => {});
      }
    });

    const results = await Promise.all(tasks);
    console.log(JSON.stringify({ ok: true, action, results }));
    return;
  }

  // 4. 广播键盘输入
  if (action === "broadcast_type") {
    const text = String(cmd.text ?? "");
    const tasks = slaveEndpoints.map(async (ep) => {
      let b;
      try {
        b = await firefox.connect(ep, { timeout: timeoutMs });
        const p = await getActivePage(b);
        const delay = jitterEnabled ? Math.floor(35 + Math.random() * 40) : Number(cmd.delay || 30);
        await p.keyboard.type(text, { delay });
        return { endpoint: ep, ok: true };
      } catch (err) {
        return { endpoint: ep, ok: false, error: err.message };
      } finally {
        if (b) await b.close().catch(() => {});
      }
    });

    const results = await Promise.all(tasks);
    console.log(JSON.stringify({ ok: true, action, results }));
    return;
  }

  // 5. 广播页面滚动
  if (action === "broadcast_scroll") {
    const deltaY = Number(cmd.deltaY || 300);
    const tasks = slaveEndpoints.map(async (ep) => {
      let b;
      try {
        b = await firefox.connect(ep, { timeout: timeoutMs });
        const p = await getActivePage(b);
        if (jitterEnabled) {
          await sleep(Math.floor(20 + Math.random() * 100));
        }
        await p.mouse.wheel(0, deltaY);
        return { endpoint: ep, ok: true };
      } catch (err) {
        return { endpoint: ep, ok: false, error: err.message };
      } finally {
        if (b) await b.close().catch(() => {});
      }
    });

    const results = await Promise.all(tasks);
    console.log(JSON.stringify({ ok: true, action, results }));
    return;
  }

  // 6. 广播关闭多余标签页
  if (action === "broadcast_close_tabs") {
    const allEndpoints = cmd.masterEndpoint ? [cmd.masterEndpoint, ...slaveEndpoints] : slaveEndpoints;
    const tasks = allEndpoints.map(async (ep) => {
      let b;
      try {
        b = await firefox.connect(ep, { timeout: timeoutMs });
        const context = b.contexts()[0];
        if (context) {
          const pages = context.pages();
          for (let i = 1; i < pages.length; i++) {
            await pages[i].close().catch(() => {});
          }
        }
        return { endpoint: ep, ok: true };
      } catch (err) {
        return { endpoint: ep, ok: false, error: err.message };
      } finally {
        if (b) await b.close().catch(() => {});
      }
    });

    const results = await Promise.all(tasks);
    console.log(JSON.stringify({ ok: true, action, results }));
    return;
  }

  // 7. 广播执行自定义脚本
  if (action === "broadcast_eval") {
    const script = String(cmd.script || "");
    const allEndpoints = cmd.masterEndpoint ? [cmd.masterEndpoint, ...slaveEndpoints] : slaveEndpoints;
    const tasks = allEndpoints.map(async (ep) => {
      let b;
      try {
        b = await firefox.connect(ep, { timeout: timeoutMs });
        const p = await getActivePage(b);
        const evalRes = await p.evaluate(script);
        return { endpoint: ep, ok: true, result: evalRes };
      } catch (err) {
        return { endpoint: ep, ok: false, error: err.message };
      } finally {
        if (b) await b.close().catch(() => {});
      }
    });

    const results = await Promise.all(tasks);
    console.log(JSON.stringify({ ok: true, action, results }));
    return;
  }

  // 8. 实时主从群控监听与广播 (Live Synchronizer Mode)
  if (action === "live_sync") {
    const masterEp = cmd.masterEndpoint;
    if (!masterEp) throw new Error("缺少主控 Master Endpoint");
    if (slaveEndpoints.length === 0) throw new Error("至少需要指定一个从控 Slave Endpoint");

    console.log(JSON.stringify({ status: "connecting", message: "正在连接主控与从控浏览器集群..." }));

    const masterBrowser = await firefox.connect(masterEp);
    const masterPage = await getActivePage(masterBrowser);

    const slaveBrowsers = [];
    const slavePages = [];
    for (const ep of slaveEndpoints) {
      try {
        const sb = await firefox.connect(ep);
        const sp = await getActivePage(sb);
        slaveBrowsers.push(sb);
        slavePages.push({ endpoint: ep, page: sp });
      } catch (err) {
        console.error(JSON.stringify({ warning: `连接从控 ${ep} 失败: ${err.message}` }));
      }
    }

    console.log(
      JSON.stringify({
        status: "ready",
        message: `群控同步引擎已就绪！成功桥接 1 个主控与 ${slavePages.length} 个受控窗口。`,
        activeSlaves: slavePages.length,
      })
    );

    // 暴露回调函数供主控页面注入的事件监听器调用
    await masterPage.exposeFunction("__narrcBroadcastEvent", async (event) => {
      const { type, x, y, key, deltaY, rx, ry } = event;
      
      const broadcastTasks = slavePages.map(async ({ page, endpoint }) => {
        try {
          if (type === "click" && cmd.config?.syncClick !== false) {
            let targetX = x;
            let targetY = y;
            if (rx && ry) {
              const vp = page.viewportSize();
              if (vp) {
                targetX = Math.round(vp.width * rx);
                targetY = Math.round(vp.height * ry);
              }
            }
            if (jitterEnabled) {
              await sleep(Math.floor(20 + Math.random() * 80));
              targetX += (Math.random() - 0.5) * 3;
              targetY += (Math.random() - 0.5) * 3;
            }
            await page.mouse.click(targetX, targetY);
          } else if (type === "keydown" && cmd.config?.syncType !== false) {
            if (jitterEnabled) {
              await sleep(Math.floor(15 + Math.random() * 40));
            }
            if (key) await page.keyboard.press(key);
          } else if (type === "scroll" && cmd.config?.syncScroll !== false) {
            await page.mouse.wheel(0, deltaY || 100);
          }
        } catch {}
      });

      await Promise.allSettled(broadcastTasks);
    });

    // 导航实时镜像：主控跳转任意网址，所有从控同步跳转
    let lastNavigatedUrl = "";
    masterPage.on("framenavigated", (frame) => {
      if (frame === masterPage.mainFrame()) {
        const url = frame.url();
        if (url && url !== "about:blank" && url !== lastNavigatedUrl) {
          lastNavigatedUrl = url;
          for (const { page } of slavePages) {
            if (page.url() !== url) {
              page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
            }
          }
        }
      }
    });

    const hookFunction = () => {
      if (window.__narrcHooked) return;
      window.__narrcHooked = true;
      window.addEventListener("click", (e) => {
        if (!e.isTrusted) return;
        try {
          const rx = e.clientX / window.innerWidth;
          const ry = e.clientY / window.innerHeight;
          window.__narrcBroadcastEvent({ type: "click", x: e.clientX, y: e.clientY, rx, ry });
        } catch {}
      }, true);

      window.addEventListener("keydown", (e) => {
        if (!e.isTrusted) return;
        try {
          if (e.key && (e.key.length === 1 || ["Enter", "Backspace", "Tab", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key))) {
            window.__narrcBroadcastEvent({ type: "keydown", key: e.key, code: e.code });
          }
        } catch {}
      }, true);

      let scrollTimeout;
      window.addEventListener("wheel", (e) => {
        if (!e.isTrusted) return;
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          try {
            window.__narrcBroadcastEvent({ type: "scroll", deltaY: e.deltaY });
          } catch {}
        }, 100);
      }, { passive: true });
    };

    // 在主控页面注入捕获脚本 (针对后续导航与当前页面同时生效)
    await masterPage.addInitScript(hookFunction);
    await masterPage.evaluate(hookFunction).catch(() => {});

    // 保持进程持续运行，直到父进程或 stdin 挂断
    const duration = Math.max(60000, Number(cmd.durationMs || 3600000));
    await sleep(duration);

    // 清理连接
    await masterBrowser.close().catch(() => {});
    for (const sb of slaveBrowsers) {
      await sb.close().catch(() => {});
    }
    return;
  }

  // 9. 广播差异化数据（矩阵账号、独立密码、个性化文案、不同网址）
  if (action === "broadcast_differential_data") {
    const items = Array.isArray(cmd.items) ? cmd.items : [];
    if (items.length === 0) throw new Error("缺少差异化分配项列表");

    const tasks = items.map(async (item) => {
      const ep = item.endpoint;
      if (!ep) return { ok: false, error: "缺少 endpoint" };
      let b;
      try {
        b = await firefox.connect(ep, { timeout: timeoutMs });
        const p = await getActivePage(b);
        const text = String(item.text ?? "");
        const itemAction = item.action || "type";

        if (itemAction === "goto") {
          await p.goto(text, { timeout: timeoutMs, waitUntil: "domcontentloaded" });
          return { endpoint: ep, ok: true, action: "goto", url: text };
        }

        if (item.selector) {
          await p.waitForSelector(item.selector, { timeout: 4000 });
          if (itemAction === "type") {
            await p.fill(item.selector, text);
          } else {
            await p.click(item.selector);
            await p.keyboard.type(text, { delay: jitterEnabled ? 30 : 10 });
          }
        } else {
          // 在当前聚焦元素上输入，或者通过 activeElement 设值
          const setRes = await p.evaluate((val) => {
            const el = document.activeElement;
            if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
              if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
                el.value = val;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
                return { success: true, tag: el.tagName };
              } else {
                el.innerText = val;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                return { success: true, tag: "contenteditable" };
              }
            }
            return { success: false, reason: "No active input element focused" };
          }, text);

          // 若 activeElement 设值未生效且指定了 type 键盘输入，尝试通过键盘输入
          if (!setRes || !setRes.success) {
            await p.keyboard.type(text, { delay: jitterEnabled ? 30 : 10 });
          }
        }
        return { endpoint: ep, ok: true, textPreview: text.slice(0, 15) };
      } catch (err) {
        return { endpoint: ep, ok: false, error: err.message };
      } finally {
        if (b) await b.close().catch(() => {});
      }
    });

    const results = await Promise.all(tasks);
    console.log(JSON.stringify({ ok: true, action, results }));
    return;
  }

  // 10. 零代码动作录制器 (Visual No-Code Action Recorder)
  if (action === "record_session") {
    const masterEp = cmd.masterEndpoint;
    if (!masterEp) throw new Error("缺少主控 Master Endpoint");
    const outputFile = cmd.outputFile;
    const fs = require("fs");

    let recordedActions = [];
    const saveActions = () => {
      if (outputFile) {
        try {
          fs.writeFileSync(outputFile, JSON.stringify(recordedActions, null, 2), "utf8");
        } catch {}
      }
    };

    console.log(JSON.stringify({ status: "recording_ready", message: "动作录制器已就绪，正在主控页面捕获动作..." }));

    const masterBrowser = await firefox.connect(masterEp);
    const masterPage = await getActivePage(masterBrowser);

    await masterPage.exposeFunction("__narrcRecordAction", (actionData) => {
      recordedActions.push(actionData);
      saveActions();
      console.log(JSON.stringify({ event: "recorded_action", data: actionData }));
    });

    const recordHook = () => {
      if (window.__narrcRecordHooked) return;
      window.__narrcRecordHooked = true;

      const getSelector = (el) => {
        if (!el || el === document || el === window) return "";
        if (el.id) return `#${CSS.escape(el.id)}`;
        if (el.name && ["input", "textarea", "select"].includes(el.tagName.toLowerCase())) {
          return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
        }
        if (el.getAttribute("data-testid")) {
          return `[data-testid="${CSS.escape(el.getAttribute("data-testid"))}"]`;
        }
        if (el.getAttribute("aria-label")) {
          return `[aria-label="${CSS.escape(el.getAttribute("aria-label"))}"]`;
        }
        let selector = el.tagName.toLowerCase();
        if (el.className && typeof el.className === "string") {
          const classes = el.className.trim().split(/\s+/).filter(c => !c.includes(":") && !c.includes("[") && c.length < 30).slice(0, 2);
          if (classes.length > 0) {
            selector += "." + classes.join(".");
          }
        }
        return selector;
      };

      // 捕获点击
      window.addEventListener("click", (e) => {
        if (!e.isTrusted) return;
        const target = e.target;
        const selector = getSelector(target);
        const text = (target.innerText || target.value || "").trim().slice(0, 40);
        window.__narrcRecordAction({
          type: "click",
          selector,
          text,
          tagName: target.tagName,
          timestamp: Date.now()
        });
      }, true);

      // 捕获输入
      window.addEventListener("change", (e) => {
        if (!e.isTrusted) return;
        const target = e.target;
        if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
          window.__narrcRecordAction({
            type: "input",
            selector: getSelector(target),
            value: target.value,
            tagName: target.tagName,
            timestamp: Date.now()
          });
        }
      }, true);

      // 捕获滚动
      let scrollTimer;
      window.addEventListener("wheel", (e) => {
        if (!e.isTrusted) return;
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          window.__narrcRecordAction({
            type: "scroll",
            deltaY: Math.round(e.deltaY),
            timestamp: Date.now()
          });
        }, 300);
      }, { passive: true });
    };

    await masterPage.addInitScript(recordHook);
    await masterPage.evaluate(recordHook).catch(() => {});

    masterPage.on("framenavigated", (frame) => {
      if (frame === masterPage.mainFrame()) {
        const url = frame.url();
        if (url && !url.startsWith("about:")) {
          recordedActions.push({ type: "navigate", url, timestamp: Date.now() });
          saveActions();
        }
      }
    });

    const duration = Math.max(60000, Number(cmd.durationMs || 3600000));
    await sleep(duration);
    await masterBrowser.close().catch(() => {});
    return;
  }

  throw new Error(`未知动作指令: ${action}`);
})().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
