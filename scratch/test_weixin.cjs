const { firefox } = require('C:/Users/narci/miniconda3/lib/site-packages/playwright/driver/package');

async function main() {
  const browser = await firefox.connect('ws://[::1]:60206/3791f658030de3a56a2b80f4a6347956');
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  console.log('Navigating to create page...');
  await page.goto('https://channels.weixin.qq.com/platform/post/create', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Check if "我知道了" or "取消" is present and click
  const ack = await page.$('button:has-text("我知道了")');
  if (ack) {
    console.log('Clicking 我知道了...');
    await ack.click();
    await page.waitForTimeout(1000);
  }

  const cancel = await page.$('button:has-text("取消")');
  if (cancel) {
    console.log('Clicking 取消...');
    await cancel.click();
    await page.waitForTimeout(1000);
  }

  console.log('Now checking frames...');
  const frames = page.frames();
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    console.log(`Frame [${i}]: ${f.url()}`);
    const text = await f.evaluate(() => document.body ? document.body.innerText.slice(0, 500) : '').catch(() => '');
    console.log(`Text in Frame [${i}]:\n`, text);
    const inputs = await f.evaluate(() => Array.from(document.querySelectorAll('input')).map(x => ({ type: x.type, class: x.className }))).catch(() => []);
    console.log(`Inputs in Frame [${i}]:`, JSON.stringify(inputs));
  }

  await browser.close();
}

main().catch(console.error);
