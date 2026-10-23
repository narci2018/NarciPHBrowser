const driverDir = 'C:\\Users\\narci\\miniconda3\\Lib\\site-packages\\playwright\\driver\\package';
const { firefox } = require(driverDir);
const fs = require('fs');

(async () => {
  const browser = await firefox.launch({
    executablePath: 'C:\\Users\\narci\\camoufox\\camoufox.exe',
    headless: false
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('1. Going to signup page...');
  await page.goto('https://signup.live.com/signup', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(3000);

  // Skip cookie banner if present
  try {
    const cookieBtn = await page.waitForSelector('button[data-testid="secondaryButton"], #sp-cc-accept, .banner-actions button, button:has-text("Accept")', { timeout: 3000 });
    if (cookieBtn) await cookieBtn.click();
  } catch {}

  const rand = Math.random().toString(36).slice(2, 8);
  const email = `narc_${rand}@outlook.com`;
  console.log('Email to register:', email);

  // Fill MemberName / usernameInput
  const userSel = '#usernameInput, input[type="email"], input[name="MemberName"], #MemberName';
  await page.waitForSelector(userSel, { timeout: 25000 });
  await page.fill(userSel, email);
  console.log('Filled email, clicking next...');
  await page.click('#nextButton, button[type="submit"], input[type="submit"], #iSignupAction');
  
  // Wait for password
  const passSel = '#PasswordInput, input[type="password"], input[name="Password"]';
  await page.waitForSelector(passSel, { timeout: 25000 });
  await page.waitForTimeout(1000);
  console.log('Password input ready, filling password...');
  await page.fill(passSel, 'Narc!' + rand + '2026#');
  await page.waitForTimeout(500);

  console.log('Clicking next on password page...');
  await page.click('#nextButton, button[type="submit"], input[type="submit"], #iSignupAction');

  console.log('Submitted password! Waiting 6s to see where Microsoft navigates...');
  await page.waitForTimeout(6000);

  // Screenshot and DOM dump
  await page.screenshot({ path: 'after_password_page.png', fullPage: false });
  console.log('Saved screenshot after_password_page.png');
  console.log('Current URL:', page.url());

  const domDump = await page.evaluate(() => {
    return {
      title: document.title,
      url: window.location.href,
      bodyTextSnippet: document.body.innerText.slice(0, 500),
      elements: Array.from(document.querySelectorAll('input, select, button, div[role="alert"], span[id*="Error"]')).map(el => ({
        tag: el.tagName,
        id: el.id,
        name: el.name,
        type: el.type,
        ariaLabel: el.getAttribute('aria-label'),
        value: el.value,
        innerText: el.innerText?.slice(0, 100),
        visible: el.offsetWidth > 0 && el.offsetHeight > 0
      }))
    };
  });

  fs.writeFileSync('after_password_dump.json', JSON.stringify(domDump, null, 2));
  console.log('DOM Dump summary:', JSON.stringify({
    title: domDump.title,
    url: domDump.url,
    bodyTextSnippet: domDump.bodyTextSnippet
  }, null, 2));

  await page.waitForTimeout(5000);
  await browser.close();
  console.log('DONE!');
})();
