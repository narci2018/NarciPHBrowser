const driverDir = 'C:\\Users\\narci\\miniconda3\\Lib\\site-packages\\playwright\\driver\\package';
const { chromium } = require(driverDir);

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: false
  });
  const page = await browser.newPage();
  await page.goto('https://signup.live.com/signup', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // Consent
  try {
    const agree = await page.waitForSelector('button#nextButton, button:has-text("同意并继续")', { timeout: 3000 });
    if (agree) await agree.click();
  } catch {}

  await page.waitForTimeout(2000);
  const email = 'narc_edg_' + Math.floor(Math.random() * 900000 + 100000) + '@outlook.com';
  console.log('Email:', email);

  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.click('button[type="submit"], #nextButton');
  await page.waitForTimeout(3000);

  console.log('After email page Title:', await page.title());
  console.log('After email URL:', page.url());

  const passInputs = await page.evaluate(() => Array.from(document.querySelectorAll('input, button')).map(el => ({
    tag: el.tagName,
    id: el.id,
    name: el.name,
    type: el.type,
    text: (el.innerText || el.value || '').trim()
  })));
  console.log('Elements on password step:', JSON.stringify(passInputs, null, 2));

  await page.waitForSelector('input[type="password"]', { timeout: 10000 });
  await page.fill('input[type="password"]', 'TestEdgePass#2026!');
  await page.waitForTimeout(500);

  // Click submit on password page
  await page.click('button[type="submit"], #nextButton');
  await page.waitForTimeout(4000);

  console.log('Testing Birthday dropdowns on new layout...');
  await page.waitForSelector('#BirthMonthDropdown, #BirthYear, input[name="BirthYear"]', { timeout: 10000 });
  
  // Year
  await page.fill('input[name="BirthYear"]', '1997');
  console.log('Filled BirthYear: 1997');

  // Click Month dropdown
  await page.click('#BirthMonthDropdown');
  await page.waitForTimeout(1000);
  const monthItems = await page.evaluate(() => Array.from(document.querySelectorAll('[role="option"], li, button')).map(el => ({
    role: el.getAttribute('role'),
    id: el.id,
    text: el.innerText.trim()
  })).filter(x => x.text.length > 0 && x.text.length < 20));
  console.log('Dropdown items after clicking Month:', JSON.stringify(monthItems.slice(0, 20), null, 2));

  // Select month (e.g. May or 5月)
  const mayOpt = await page.$('[role="option"]:has-text("5"), [role="option"]:has-text("五月"), [role="option"]:has-text("May"), li:has-text("5")');
  if (mayOpt) {
    await mayOpt.click();
    console.log('Clicked May option');
  } else {
    console.log('May option not found directly, clicking first option');
    const firstOpt = await page.$('[role="option"]');
    if (firstOpt) await firstOpt.click();
  }
  await page.waitForTimeout(1000);

  // Click Day dropdown
  await page.click('#BirthDayDropdown');
  await page.waitForTimeout(1000);
  const dayOpt = await page.$('[role="option"]:has-text("16"), li:has-text("16")');
  if (dayOpt) {
    await dayOpt.click();
    console.log('Clicked Day 16 option');
  }
  await page.waitForTimeout(1000);

  console.log('Submitting birthday...');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);

  console.log('After birthday submit URL:', page.url());
  console.log('After birthday submit Title:', await page.title());
  await page.screenshot({ path: 'after_birthday_edge.png' });
  await browser.close();
})();
