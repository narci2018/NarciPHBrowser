const driverDir = 'C:\\Users\\narci\\miniconda3\\Lib\\site-packages\\playwright\\driver\\package';
const { chromium } = require(driverDir);
const path = require('path');

(async () => {
  console.log('======================================================');
  console.log('🚀 启动 Microsoft Edge 运行 Outlook 全自动注册与验证工作流');
  console.log('======================================================');

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

  const browser = await chromium.launch({
    executablePath: edgePath,
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-default-browser-check',
      '--window-size=1280,850',
      '--window-position=60,60'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 }
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  const page = await context.newPage();
  await page.bringToFront();

  console.log('\n[步骤 1/5] 打开注册页面: https://signup.live.com/signup');
  await page.goto('https://signup.live.com/signup', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);

  // 1. 数据出境/个人许可同意
  try {
    const agreeBtn = await page.waitForSelector('button#nextButton:has-text("同意并继续"), button:has-text("同意并继续"), button#nextButton', { timeout: 3500 });
    if (agreeBtn) {
      const text = await agreeBtn.innerText().catch(() => '');
      if (text.includes('同意') || (await page.title()).includes('许可')) {
        console.log('检测到个人数据导出许可，点击「同意并继续」...');
        await agreeBtn.click();
        await page.waitForTimeout(2500);
      }
    }
  } catch {}

  // 2. Cookie 弹窗放行
  try {
    const cookieBtn = await page.waitForSelector('button[data-testid="secondaryButton"], #sp-cc-accept, button:has-text("Accept"), button:has-text("接受")', { timeout: 2000 });
    if (cookieBtn) {
      await cookieBtn.click();
      console.log('放行 Cookie 提示');
      await page.waitForTimeout(1000);
    }
  } catch {}

  const randStr = Math.random().toString(36).slice(2, 8);
  const email = `narc_edg_${randStr}@outlook.com`;
  const pass = `E!dg${Math.random().toString(36).slice(2, 6).toUpperCase()}#2026`;

  console.log(`\n生成专属测试账号:`);
  console.log(`  邮箱: ${email}`);
  console.log(`  密码: ${pass}`);

  // 3. 填入邮箱
  console.log('\n[步骤 2/5] 填入注册邮箱...');
  const emailSel = 'input[type="email"], input[name="email"], input[name="MemberName"], #MemberName, #usernameInput';
  await page.waitForSelector(emailSel, { timeout: 25000 });
  await page.waitForTimeout(600);
  await page.fill(emailSel, email);
  await page.waitForTimeout(600);
  await page.click('button[type="submit"], #nextButton');
  console.log('已提交邮箱，等待密码页...');
  await page.waitForTimeout(3000);

  // 4. 填入密码
  console.log('\n[步骤 3/5] 填入账户密码...');
  const passSel = 'input[type="password"], #PasswordInput, input[name="Password"]';
  await page.waitForSelector(passSel, { timeout: 25000 });
  await page.waitForTimeout(600);
  await page.fill(passSel, pass);
  await page.waitForTimeout(600);
  await page.click('button[type="submit"], #nextButton');
  console.log('已提交密码，等待下一步...');
  await page.waitForTimeout(3500);

  // 5. 生日与姓名
  const currentTitle = await page.title();
  console.log(`当前页面标题: "${currentTitle}"`);

  async function fillBirthday() {
    console.log('开始填写出生日期...');
    await page.waitForSelector('#BirthYear, input[name="BirthYear"], #BirthMonthDropdown', { timeout: 15000 });
    await page.fill('input[name="BirthYear"], #BirthYear', '1997');
    await page.waitForTimeout(400);

    if (await page.$('#BirthMonthDropdown')) {
      await page.click('#BirthMonthDropdown');
      await page.waitForTimeout(800);
      const mayOpt = await page.$('[role="option"]:has-text("5"), [role="option"]:has-text("五月"), [role="option"]:has-text("May")');
      if (mayOpt) await mayOpt.click();
      else {
        const first = await page.$('[role="option"]');
        if (first) await first.click();
      }
    } else if (await page.$('select[name="BirthMonth"], #BirthMonth')) {
      await page.selectOption('select[name="BirthMonth"], #BirthMonth', '5');
    }
    await page.waitForTimeout(500);

    if (await page.$('#BirthDayDropdown')) {
      await page.click('#BirthDayDropdown');
      await page.waitForTimeout(800);
      const dayOpt = await page.$('[role="option"]:has-text("16"), li:has-text("16")');
      if (dayOpt) await dayOpt.click();
      else {
        const first = await page.$('[role="option"]');
        if (first) await first.click();
      }
    } else if (await page.$('select[name="BirthDay"], #BirthDay')) {
      await page.selectOption('select[name="BirthDay"], #BirthDay', '16');
    }
    await page.waitForTimeout(600);

    await page.click('button[type="submit"], #nextButton');
    console.log('已提交出生日期 (1997-05-16)');
    await page.waitForTimeout(3000);
  }

  async function fillName() {
    console.log('开始填写姓名...');
    await page.waitForSelector('#firstNameInput, input[name="firstNameInput"], input[name="FirstName"], #FirstNameInput', { timeout: 15000 });
    await page.fill('#firstNameInput, input[name="firstNameInput"], input[name="FirstName"], #FirstNameInput', 'Alex');
    await page.waitForTimeout(300);
    await page.fill('#lastNameInput, input[name="lastNameInput"], input[name="LastName"], #LastNameInput', 'Miller');
    await page.waitForTimeout(500);
    await page.click('button[type="submit"], #nextButton');
    console.log('已提交姓名 (Alex Miller)');
    await page.waitForTimeout(3000);
  }

  if ((await page.$('#BirthYear, input[name="BirthYear"]')) || currentTitle.includes('详细信息')) {
    console.log('\n[步骤 4/5] 进入生日信息页');
    await fillBirthday();
    if (await page.waitForSelector('#firstNameInput, input[name="firstNameInput"], input[name="FirstName"]', { timeout: 8000 }).catch(() => null)) {
      console.log('\n[步骤 4.5/5] 进入补充姓名页');
      await fillName();
    }
  } else {
    console.log('\n[步骤 4/5] 进入姓名信息页');
    await fillName();
    if (await page.waitForSelector('#BirthYear, input[name="BirthYear"]', { timeout: 8000 }).catch(() => null)) {
      console.log('\n[步骤 4.5/5] 进入补充生日页');
      await fillBirthday();
    }
  }

  console.log('\n======================================================');
  console.log('🤖 [步骤 5/5] 自动化填表完成，正在分析并自动执行人机验证...');
  console.log('======================================================');
  await page.waitForTimeout(3000);

  const shotPath = path.resolve(__dirname, 'verify_stage.png');
  await page.screenshot({ path: shotPath }).catch(() => {});
  console.log(`已截取验证阶段屏幕快照: ${shotPath}`);

  // 持续尝试自动寻找并长按按钮
  for (let attempt = 1; attempt <= 20; attempt++) {
    const curTitle = await page.title();
    const curUrl = page.url();
    console.log(`[验证轮询 #${attempt}] 标题: "${curTitle}", URL: ${curUrl}`);

    // 判断是否已经跳转到成功页面或保持登录页面
    if (curUrl.includes('kmsi') || curUrl.includes('privacynotice') || curUrl.includes('myaccount') || curUrl.includes('outlook.live.com') || curUrl.includes('account.microsoft.com')) {
      console.log('\n🎉🎉🎉 恭喜！已成功通过验证并登录 Microsoft 账户！🎉🎉🎉');
      // 处理 KMSI (保持登录)
      try {
        const kmsiBtn = await page.$('#acceptButton, input[type="submit"][value="是"], button:has-text("是"), button:has-text("Yes")');
        if (kmsiBtn) {
          console.log('点击「保持登录状态: 是」...');
          await kmsiBtn.click();
          await page.waitForTimeout(3000);
        }
      } catch {}
      console.log(`最终成功访问 URL: ${page.url()}`);
      console.log(`注册账号: ${email} | 密码: ${pass}`);
      return;
    }

    if (curTitle.includes('帐户创建已被阻止')) {
      console.log('⚠️ 检测到微软提示「帐户创建已被阻止」。');
      return;
    }

    // 搜索长按按钮
    let pressed = false;
    const allFrames = page.frames();
    for (const frame of allFrames) {
      try {
        // 查找可能包含长按的按钮
        const selectors = [
          'button',
          '[role="button"]',
          'div[id*="press"]',
          'div[class*="press"]',
          '#wrong-button',
          'button:has-text("长按")',
          'button:has-text("按住")',
          'button:has-text("Hold")'
        ];
        for (const sel of selectors) {
          const els = await frame.$$(sel);
          for (const el of els) {
            const isVis = await el.isVisible().catch(() => false);
            if (!isVis) continue;
            const text = (await el.innerText().catch(() => '')).trim();
            const aria = (await el.getAttribute('aria-label').catch(() => '')).trim();
            
            // 只要文本或 aria 含有长按/按住/hold/press，或者页面正在提示长按而它是当前主要大按钮
            if (text.includes('长按') || text.includes('按住') || text.includes('Hold') || aria.includes('长按') || aria.includes('按住') || aria.includes('Hold') || aria.includes('Press')) {
              console.log(`🎯 匹配到目标长按按钮: text="${text}", aria="${aria}" in ${frame.url()}`);
              const box = await el.boundingBox();
              if (box) {
                console.log(`定位到按钮坐标: (${box.x}, ${box.y}, ${box.width}x${box.height})`);
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                console.log('👇 鼠标按下，开始长按 9 秒...');
                await page.mouse.down();
                for (let s = 1; s <= 9; s++) {
                  await page.waitForTimeout(1000);
                  // 模拟微小的手指抖动 (加减 1 像素)
                  await page.mouse.move(box.x + box.width / 2 + (s % 2 === 0 ? 1 : -1), box.y + box.height / 2);
                }
                await page.mouse.up();
                console.log('👆 鼠标已释放！等待 4 秒观察响应...');
                await page.waitForTimeout(4000);
                pressed = true;
                break;
              }
            }
          }
          if (pressed) break;
        }
      } catch (err) {}
      if (pressed) break;
    }

    if (!pressed) {
      // 检查是否有任何 "下一步" 或 "继续" 按钮需要点击激活验证
      try {
        const nextBtn = await page.$('button#nextButton, button:has-text("下一步"), button:has-text("Next")');
        if (nextBtn && await nextBtn.isVisible()) {
          console.log('点击下一步激活人机验证...');
          await nextBtn.click();
          await page.waitForTimeout(2000);
        }
      } catch {}
      await page.waitForTimeout(3000);
    }
  }

  console.log('工作流执行完成。');
})();
