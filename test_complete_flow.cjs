const driverDir = 'C:\\Users\\narci\\miniconda3\\Lib\\site-packages\\playwright\\driver\\package';
const { firefox } = require(driverDir);

(async () => {
  const browser = await firefox.launch({
    executablePath: 'C:\\Users\\narci\\camoufox\\camoufox.exe',
    headless: false
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('--- Step 1: goto signup ---');
  await page.goto('https://signup.live.com/signup', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(2000);

  // Step 3: cookie
  try {
    const btn = await page.waitForSelector('button[data-testid="secondaryButton"], #sp-cc-accept, .banner-actions button, button:has-text("Accept")', { timeout: 3000 });
    if (btn) await btn.click();
  } catch {}

  const randStr = Math.random().toString(36).slice(2, 8);
  const email = `narc_${randStr}@outlook.com`;
  // Safe password that does NOT contain 'narc'
  const pass = `W!x9${Math.random().toString(36).slice(2, 6).toUpperCase()}Qz#2026`;
  console.log('Generated Email:', email);
  console.log('Generated Pass:', pass);

  console.log('--- Step 4-6: Email ---');
  const userSel = '#usernameInput, input[type="email"], input[name="MemberName"], #MemberName';
  await page.waitForSelector(userSel, { timeout: 25000 });
  await page.fill(userSel, email);
  await page.click('#nextButton, button[type="submit"], input[type="submit"], #iSignupAction');

  console.log('--- Step 7-9: Password ---');
  const passSel = '#PasswordInput, input[type="password"], input[name="Password"]';
  await page.waitForSelector(passSel, { timeout: 25000 });
  await page.waitForTimeout(800);
  await page.fill(passSel, pass);
  await page.waitForTimeout(800); // settle
  await page.click('#nextButton, button[type="submit"], input[type="submit"], #iSignupAction');
  console.log('Submitted password!');

  console.log('--- Step 10: Wait for Name or Birthday ---');
  await page.waitForSelector('#FirstNameInput, #firstNameInput, input[name="FirstName"], #BirthYear, #BirthMonth', { timeout: 25000 });
  console.log('SUCCESS: Name/Birthday page detected!');

  // Check if we are on Name page
  const hasName = await page.isVisible('#FirstNameInput, #firstNameInput, input[name="FirstName"]').catch(() => false);
  if (hasName) {
    console.log('--- Step 11-13: Fill Name ---');
    await page.fill('#FirstNameInput, #firstNameInput, input[name="FirstName"]', 'Alex');
    await page.fill('#LastNameInput, #lastNameInput, input[name="LastName"]', 'Miller');
    await page.click('#nextButton, button[type="submit"], input[type="submit"], #iSignupAction');
    console.log('Submitted Name!');
  } else {
    console.log('Skipped Name page directly to Birthday!');
  }

  console.log('--- Step 14: Wait for Birthday ---');
  await page.waitForSelector('#BirthYear, #BirthMonth', { timeout: 25000 });
  console.log('SUCCESS: Birthday inputs found!');

  console.log('--- Step 15: Fill Birthday (Year/Month/Day) ---');
  await page.fill('#BirthYear, input[name="BirthYear"]', '1997');
  await page.selectOption('#BirthMonth, select[name="BirthMonth"]', '5');
  await page.selectOption('#BirthDay, select[name="BirthDay"]', '16');
  console.log('SUCCESS: Filled Year (1997), Month (5), Day (16)!');

  await page.waitForTimeout(1200);
  console.log('--- Step 17: Click Next to submit Birthday ---');
  await page.click('#nextButton, button[type="submit"], input[type="submit"], #iSignupAction');
  console.log('Submitted Birthday! Waiting 5s for Captcha...');
  await page.waitForTimeout(5000);

  await page.screenshot({ path: 'final_verification_stage.png' });
  console.log('Current URL after birthday:', page.url());
  console.log('Page Title:', await page.title());
  console.log('ALL STEPS PASSED COMPLETELY!');

  await browser.close();
})();
