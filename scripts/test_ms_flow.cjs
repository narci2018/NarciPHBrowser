const driverDir = 'C:\\Users\\narci\\miniconda3\\Lib\\site-packages\\playwright\\driver\\package';
const { firefox } = require(driverDir);

(async () => {
  const server = await firefox.launchServer({
    executablePath: 'C:\\Users\\narci\\camoufox\\camoufox.exe',
    headless: false,
    _sharedBrowser: true,
    _userDataDir: 'C:\\Users\\narci\\AppData\\Roaming\\NarciPHBrowser\\profiles\\abc-ecfb7767\\browser'
  });
  console.log('wsEndpoint:', server.wsEndpoint());
  const browser = await firefox.connect(server.wsEndpoint());
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  console.log('Navigating to signup...');
  await page.goto('https://signup.live.com/signup', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  const email = 'narc_test_' + Math.floor(Math.random() * 900000 + 100000) + '@outlook.com';
  console.log('Filling email:', email);
  await page.waitForSelector('input[name="MemberName"], #MemberName', { timeout: 10000 });
  await page.fill('input[name="MemberName"], #MemberName', email);
  await page.click('#nextButton, button[type="submit"]');

  console.log('Waiting for password...');
  await page.waitForSelector('input[type="password"], #PasswordInput', { timeout: 15000 });
  await page.fill('input[type="password"], #PasswordInput', 'TestPassword123!@#');
  await page.click('#nextButton, button[type="submit"]');

  console.log('Waiting for name...');
  await page.waitForSelector('#firstNameInput, input[name="FirstName"]', { timeout: 15000 });
  await page.fill('#firstNameInput, input[name="FirstName"]', 'John');
  await page.fill('#lastNameInput, input[name="LastName"]', 'Doe');
  await page.click('#nextButton, button[type="submit"]');

  console.log('Waiting for birthday page...');
  await page.waitForSelector('#BirthYear, #BirthMonth', { timeout: 15000 });
  console.log('Birthday page reached successfully!');

  // Inspect elements and run the fill
  const domInfo = await page.evaluate(() => {
    const y = document.querySelector('#BirthYear');
    const m = document.querySelector('#BirthMonth');
    const d = document.querySelector('#BirthDay');
    return {
      hasYear: !!y,
      yearVal: y ? y.value : null,
      hasMonth: !!m,
      monthOpts: m ? Array.from(m.options).map(o => ({ v: o.value, t: o.text })).slice(0, 8) : null,
      hasDay: !!d,
      dayOpts: d ? Array.from(d.options).map(o => ({ v: o.value, t: o.text })).slice(0, 8) : null,
    };
  });
  console.log('DOM info:', JSON.stringify(domInfo, null, 2));

  // Now test filling Month: 5, Day: 16, Year: 1997
  console.log('Testing filling month 5, day 16, year 1997...');
  const fillResult = await page.evaluate(() => {
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
    const mOk = setSelect('#BirthMonth, select[name="BirthMonth"]', '5');
    const dOk = setSelect('#BirthDay, select[name="BirthDay"]', '16');
    const yOk = setInput('#BirthYear, input[name="BirthYear"]', '1997');
    return {
      mOk, dOk, yOk,
      monthVal: document.querySelector('#BirthMonth')?.value,
      dayVal: document.querySelector('#BirthDay')?.value,
      yearVal: document.querySelector('#BirthYear')?.value,
    };
  });
  console.log('Fill result:', JSON.stringify(fillResult, null, 2));

  // Now click next button to see if it advances without error!
  console.log('Clicking Next button...');
  await page.click('#nextButton, button[type="submit"]');

  await page.waitForTimeout(3000);
  console.log('Current URL after next:', page.url());

  const hasError = await page.isVisible('#BirthDateError, .alert-error, div[role="alert"]').catch(() => false);
  console.log('Has error on page:', hasError);

  await browser.close();
  await server.close();
  console.log('Test completed successfully!');
})().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
