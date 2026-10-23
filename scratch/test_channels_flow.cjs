const { firefox } = require('C:/Users/narci/miniconda3/lib/site-packages/playwright/driver/package');

async function main() {
  const browser = await firefox.connect('ws://[::1]:54187/4f50a8cf84daf16f099bdcc18a2ee46f');
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();

  console.log('Visiting https://channels.weixin.qq.com/platform/post/list ...');
  await page.goto('https://channels.weixin.qq.com/platform/post/list', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  console.log('Current URL:', page.url());
  const title = await page.title();
  console.log('Title:', title);

  const text = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 1000) : '');
  console.log('Body Text:\n', text);

  // Check buttons
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a.weui-desktop-btn')).map(b => ({
      text: b.innerText.trim(),
      className: b.className
    }));
  });
  console.log('Buttons on post list:', JSON.stringify(buttons, null, 2));

  await browser.close();
}

main().catch(console.error);
