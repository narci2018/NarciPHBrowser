const driverDir = 'C:\\Users\\narci\\miniconda3\\Lib\\site-packages\\playwright\\driver\\package';
const { firefox } = require(driverDir);

(async () => {
  const browser = await firefox.launch({
    executablePath: 'C:\\Users\\narci\\camoufox\\camoufox.exe',
    headless: false
  });
  const page = await browser.newPage();
  await page.goto('https://signup.live.com/signup', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const email = 'narc_test99a@outlook.com';
  const pass = 'Narc!test99a2026';

  console.log('Testing Email:', email, 'Password:', pass);

  await page.waitForSelector('#usernameInput, input[type="email"]', { timeout: 15000 });
  await page.fill('#usernameInput, input[type="email"]', email);
  await page.click('#nextButton');
  await page.waitForTimeout(3000);

  await page.waitForSelector('#PasswordInput', { timeout: 15000 });
  await page.fill('#PasswordInput', pass);
  await page.click('#nextButton');
  await page.waitForTimeout(4000);

  const pageInfo = await page.evaluate(() => {
    const errorEl = document.querySelector('#PasswordError, [id*="Error"], [role="alert"]');
    return {
      title: document.title,
      error: errorEl ? errorEl.innerText : null,
      body: document.body.innerText.slice(0, 300)
    };
  });

  console.log('RESULT AFTER SUBMITTING PASSWORD:');
  console.log(JSON.stringify(pageInfo, null, 2));

  await browser.close();
})();
