const driverDir = 'C:\\Users\\narci\\miniconda3\\Lib\\site-packages\\playwright\\driver\\package';
const { chromium } = require(driverDir);

(async () => {
  console.log('=== Starting Outlook Signup with Microsoft Edge ===');
  
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  
  const browser = await chromium.launch({
    executablePath: edgePath,
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-default-browser-check',
      '--start-maximized'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });

  const context = await browser.newContext({
    viewport: null
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  const page = await context.newPage();

  console.log('--- Step 1: Navigating to signup.live.com ---');
  await page.goto('https://signup.live.com/signup', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);

  // Check for Personal Data Export Consent ("个人数据导出许可" / "同意并继续")
  try {
    const agreeBtn = await page.waitForSelector('button#nextButton:has-text("同意并继续"), button:has-text("同意并继续"), button#nextButton', { timeout: 3000 });
    if (agreeBtn) {
      const text = await agreeBtn.innerText().catch(() => '');
      if (text.includes('同意') || (await page.title()).includes('许可')) {
        console.log('Detected consent page: clicking "同意并继续"...');
        await agreeBtn.click();
        await page.waitForTimeout(2000);
      }
    }
  } catch {}

  // Handle cookie consent if shown
  try {
    const btn = await page.waitForSelector('button[data-testid="secondaryButton"], #sp-cc-accept, .banner-actions button, button:has-text("Accept"), button:has-text("接受")', { timeout: 2000 });
    if (btn) {
      await btn.click();
      console.log('Accepted cookie banner');
      await page.waitForTimeout(1000);
    }
  } catch {}

  const randStr = Math.random().toString(36).slice(2, 8);
  const email = `narc_edg_${randStr}@outlook.com`;
  const pass = `E!dg${Math.random().toString(36).slice(2, 6).toUpperCase()}#2026`;

  console.log('Generated Email:', email);
  console.log('Generated Pass:', pass);

  console.log('--- Step 2: Filling Email ---');
  const userSel = 'input[type="email"], input[name="email"], input[name="MemberName"], #MemberName, #usernameInput';
  await page.waitForSelector(userSel, { timeout: 25000 });
  await page.waitForTimeout(600);
  await page.fill(userSel, email);
  await page.waitForTimeout(500);
  await page.click('button[type="submit"], #nextButton, input[type="submit"], #iSignupAction');
  console.log('Submitted Email');

  console.log('--- Step 3: Filling Password ---');
  const passSel = 'input[type="password"], #PasswordInput, input[name="Password"]';
  await page.waitForSelector(passSel, { timeout: 25000 });
  await page.waitForTimeout(800);
  await page.fill(passSel, pass);
  await page.waitForTimeout(800);
  await page.click('button[type="submit"], #nextButton, input[type="submit"], #iSignupAction');
  console.log('Submitted Password');

  console.log('--- Step 4: Waiting for Name or Birthday ---');
  await page.waitForSelector('#FirstNameInput, #firstNameInput, input[name="FirstName"], #BirthYear, #BirthMonth', { timeout: 25000 });

  const hasName = await page.isVisible('#FirstNameInput, #firstNameInput, input[name="FirstName"]').catch(() => false);
  if (hasName) {
    console.log('--- Step 5: Filling Name ---');
    await page.fill('#FirstNameInput, #firstNameInput, input[name="FirstName"]', 'Alex');
    await page.waitForTimeout(300);
    await page.fill('#LastNameInput, #lastNameInput, input[name="LastName"]', 'Miller');
    await page.waitForTimeout(500);
    await page.click('button[type="submit"], #nextButton, input[type="submit"], #iSignupAction');
    console.log('Submitted Name');
  }

  console.log('--- Step 6: Filling Birthday ---');
  await page.waitForSelector('#BirthYear, #BirthMonth', { timeout: 25000 });
  await page.waitForTimeout(800);

  // Set birthday
  await page.evaluate(() => {
    function setSelect(sel, val) {
      const el = document.querySelector(sel);
      if (!el) return false;
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
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      if (setter) setter.call(el, chosenVal);
      else el.value = chosenVal;
      if (el._valueTracker) el._valueTracker.setValue('');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    function setInput(sel, val) {
      const el = document.querySelector(sel);
      if (!el) return false;
      const last = el.value;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(el, String(val));
      else el.value = String(val);
      if (el._valueTracker) el._valueTracker.setValue(last);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    setSelect('#BirthMonth, select[name="BirthMonth"]', '5');
    setSelect('#BirthDay, select[name="BirthDay"]', '16');
    setInput('#BirthYear, input[name="BirthYear"]', '1997');
  });

  console.log('Filled Birthday: 1997-05-16');
  await page.waitForTimeout(1000);

  console.log('--- Step 7: Submitting Birthday ---');
  await page.click('button[type="submit"], #nextButton, input[type="submit"], #iSignupAction');
  console.log('Submitted Birthday! Waiting for verification challenge...');

  await page.waitForTimeout(5000);
  console.log('Current URL:', page.url());
  console.log('Page Title:', await page.title());

  console.log('\n======================================================');
  console.log('【人机验证阶段已就绪】');
  console.log('Edge 浏览器窗口已全自动完成所有前置信息输入并到达人机验证页！');
  console.log('请直接在当前弹出的 Edge 窗口中完成人机验证。');
  console.log('脚本将在后台保持会话并监控放行结果（最长等待 3 分钟）...');
  console.log('======================================================\n');

  for (let i = 0; i < 36; i++) {
    await page.waitForTimeout(5000);
    const curUrl = page.url();
    if (curUrl.includes('privacynotice') || curUrl.includes('kmsi') || curUrl.includes('myaccount') || curUrl.includes('outlook.live.com') || curUrl.includes('account.microsoft.com')) {
      console.log('🎉 恭喜！检测到已成功通过并跳转进入账户页面：', curUrl);
      break;
    }
  }

  console.log('Workflow observation complete.');
})();
