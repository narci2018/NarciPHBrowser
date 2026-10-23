const { firefox } = require('C:/Users/narci/miniconda3/lib/site-packages/playwright/driver/package');
const path = require('path');
const fs = require('fs');

async function main() {
  const profileDir = 'C:\\Tools2\\fingerBrowsers2\\NarciPHBrowser\\profiles\\profile-1-d5843f44\\browser';
  const camoufoxBin = 'C:\\Users\\narci\\camoufox\\camoufox.exe';

  for (const lock of ['parent.lock', 'lock']) {
    const lp = path.join(profileDir, lock);
    if (fs.existsSync(lp)) {
      try { fs.unlinkSync(lp); } catch {}
    }
  }

  const browser = await firefox.launchPersistentContext(profileDir, {
    executablePath: camoufoxBin,
    headless: true,
    args: ['-no-remote']
  });

  const page = browser.pages()[0] || await browser.newPage();
  console.log('1. Navigating to https://channels.weixin.qq.com/platform/post/list ...');
  await page.goto('https://channels.weixin.qq.com/platform/post/list', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  console.log('List URL:', page.url());
  console.log('List Title:', await page.title());

  // Click 发表视频
  const pubBtn = await page.$("button:has-text('发表视频'), a:has-text('发表视频'), div:text-is('发表视频')");
  if (pubBtn) {
    console.log('Found 发表视频 button, clicking...');
    await pubBtn.click();
    await page.waitForTimeout(5000);
  } else {
    console.log('发表视频 button not found on list page!');
  }

  console.log('Now at URL:', page.url());
  console.log('Now Title:', await page.title());

  // Inspect frames
  const frames = page.frames();
  console.log('Total frames:', frames.length);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    console.log(`\n--- Frame [${i}] URL: ${f.url()} ---`);

    // Find ALL input[type="file"]
    const fileInputs = await f.evaluate(() => {
      return Array.from(document.querySelectorAll('input[type="file"]')).map(el => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          id: el.id,
          name: el.name,
          className: el.className,
          accept: el.getAttribute('accept'),
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          width: rect.width,
          height: rect.height,
          outerHTML: el.outerHTML
        };
      });
    }).catch(e => [{ error: e.message }]);
    console.log(`File inputs in frame [${i}]:`, JSON.stringify(fileInputs, null, 2));

    // Find the dashed box container
    const uploadDashedBox = await f.evaluate(() => {
      const box = document.querySelector('.post-create-upload-container, .upload-container, [class*="upload"]');
      if (box) {
        return {
          className: box.className,
          outerHTML: box.outerHTML.slice(0, 400)
        };
      }
      return null;
    }).catch(() => null);
    console.log(`Upload container in frame [${i}]:`, uploadDashedBox);

    // Find publish buttons
    const buttons = await f.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.innerText.trim(),
        className: b.className,
        disabled: b.disabled
      })).filter(b => b.text.length > 0);
    }).catch(() => []);
    console.log(`Buttons in frame [${i}]:`, JSON.stringify(buttons, null, 2));
  }

  // TEST UPLOADING FILE NOW
  const testVideo = 'F:\\videowork\\Count_it_-20260417173430.mp4';
  console.log('\n--- ATTEMPTING FILE UPLOAD ---');
  let uploadDone = false;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    try {
      const input = await f.$('input[type="file"]');
      if (input) {
        console.log(`Setting input files on frame [${i}] via f.setInputFiles('input[type="file"]', ...)...`);
        await f.setInputFiles('input[type="file"]', testVideo);
        console.log('setInputFiles succeeded!');
        uploadDone = true;
        break;
      }
    } catch (e) {
      console.log(`frame [${i}] setInputFiles error:`, e.message);
    }
  }

  if (uploadDone) {
    console.log('Waiting 6s to see upload response in DOM...');
    await page.waitForTimeout(6000);
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const afterUpload = await f.evaluate(() => {
        const text = document.body ? document.body.innerText.slice(0, 500) : '';
        const video = document.querySelector('video');
        const progress = document.querySelector('[class*="progress"]');
        return {
          videoSrc: video ? video.src : null,
          hasProgress: !!progress,
          textSample: text
        };
      }).catch(() => null);
      console.log(`State in frame [${i}] after upload:`, afterUpload);
    }
  }

  await browser.close();
}

main().catch(console.error);
