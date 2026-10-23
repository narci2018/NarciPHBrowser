const driverDir = 'C:\\Users\\narci\\miniconda3\\Lib\\site-packages\\playwright\\driver\\package';
const { firefox } = require(driverDir);

(async () => {
  const browser = await firefox.launch({
    executablePath: 'C:\\Users\\narci\\camoufox\\camoufox.exe',
    headless: false
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to signup.live.com...');
  await page.goto('https://signup.live.com/signup', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const rand = Math.random().toString(36).slice(2, 8);
  const email = `narc_test_${rand}@outlook.com`;
  console.log('Email:', email);

  // Step 1: MemberName
  await page.waitForSelector('#MemberName, input[name="MemberName"]', { timeout: 15000 });
  await page.fill('#MemberName, input[name="MemberName"]', email);
  await page.click('#iSignupAction, button[type="submit"], #nextButton');
  console.log('Submitted MemberName');
  await page.waitForTimeout(3000);

  // Step 2: Password
  await page.waitForSelector('#PasswordInput, input[name="Password"]', { timeout: 15000 });
  await page.fill('#PasswordInput, input[name="Password"]', 'NarciBrowser#2026!');
  await page.click('#iSignupAction, button[type="submit"], #nextButton');
  console.log('Submitted Password');
  await page.waitForTimeout(3000);

  // Step 3: Name
  await page.waitForSelector('#FirstNameInput, input[name="FirstName"]', { timeout: 15000 });
  await page.fill('#FirstNameInput, input[name="FirstName"]', 'Alex');
  await page.fill('#LastNameInput, input[name="LastName"]', 'Miller');
  await page.click('#iSignupAction, button[type="submit"], #nextButton');
  console.log('Submitted Names');
  await page.waitForTimeout(3000);

  // Step 4: Birthday page
  console.log('Waiting for Birthday page elements...');
  await page.waitForSelector('#BirthYear, #BirthMonth', { timeout: 15000 });
  console.log('Found Birthday page elements!');

  // Now inspect elements and test setting them!
  const domInfo = await page.evaluate(() => {
    const yearEl = document.querySelector('#BirthYear');
    const monthEl = document.querySelector('#BirthMonth');
    const dayEl = document.querySelector('#BirthDay');
    return {
      yearTag: yearEl?.tagName,
      monthTag: monthEl?.tagName,
      monthOptions: Array.from(monthEl?.options || []).map(o => ({ v: o.value, t: o.text })),
      dayTag: dayEl?.tagName,
      dayOptions: Array.from(dayEl?.options || []).slice(0, 20).map(o => ({ v: o.value, t: o.text })),
    };
  });
  console.log('Birthday DOM Info:', JSON.stringify(domInfo, null, 2));

  // Now test s15_all eval!
  console.log('Running s15_all eval script...');
  const evalRes = await page.evaluate((year) => {
    function setSelect(sel, val) {
      const el = document.querySelector(sel);
      if (!el) return 'not found: ' + sel;
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
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      if (setter) setter.call(el, chosenVal);
      else el.value = chosenVal;
      if (el._valueTracker) el._valueTracker.setValue('');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      return 'set ' + sel + ' to ' + chosenVal + ' (index ' + targetIndex + ')';
    }
    function setInput(sel, val) {
      const el = document.querySelector(sel);
      if (!el) return 'not found: ' + sel;
      try { el.focus(); } catch (_) {}
      const last = el.value;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(el, String(val));
      else el.value = String(val);
      if (el._valueTracker) el._valueTracker.setValue(last);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      return 'set ' + sel + ' to ' + val;
    }
    const r1 = setInput('#BirthYear, input[name="BirthYear"], input[aria-label*="Year"], input[aria-label*="年"]', String(year));
    const r2 = setSelect('#BirthMonth, select[name="BirthMonth"], select[aria-label*="Month"], select[aria-label*="月"]', '5');
    const r3 = setSelect('#BirthDay, select[name="BirthDay"], select[aria-label*="Day"], select[aria-label*="日"]', '16');
    return { r1, r2, r3 };
  }, 1997);

  console.log('Eval result:', JSON.stringify(evalRes));
  await page.screenshot({ path: 'test_after_eval.png' });

  // Check element values in DOM
  const checkVals = await page.evaluate(() => {
    return {
      yearVal: document.querySelector('#BirthYear')?.value,
      monthVal: document.querySelector('#BirthMonth')?.value,
      monthIndex: document.querySelector('#BirthMonth')?.selectedIndex,
      dayVal: document.querySelector('#BirthDay')?.value,
      dayIndex: document.querySelector('#BirthDay')?.selectedIndex,
    };
  });
  console.log('Values after eval:', JSON.stringify(checkVals));

  // Now test clicking nextButton
  console.log('Clicking nextButton...');
  await page.click('#nextButton, button[type="submit"], #iSignupAction');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test_after_next.png' });

  const finalUrl = page.url();
  console.log('Final URL:', finalUrl);

  const errorText = await page.evaluate(() => {
    const err = document.querySelector('.alert-error, [role="alert"], .error, #BirthError, #BirthYearError');
    return err ? err.innerText : 'none';
  });
  console.log('Error text:', errorText);

  await browser.close();
})();
