with open(r'apps\desktop\src\lib\matrix-publisher.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Let's inspect all parts and cleanly restore and format
# 1. Under Xiaohongshu:
old_xhs = """  // 2.3 针对小红书：确保激活对应的工作台标签栏 (上传视频 vs 上传图文)
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
  }"""

# 2. Under Kuaishou:
old_ks = """  // 2.4 针对快手：确保切换至对应的创作类型 Tab
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
  }"""

# 3. Under Weixin publish:
old_wx = """    if (payload.platformId === "weixin") {
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
    }"""

print("Writing clean script...")
