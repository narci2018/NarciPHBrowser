const driverDir = 'C:\\Users\\narci\\miniconda3\\Lib\\site-packages\\playwright\\driver\\package';
const { firefox } = require(driverDir);
const path = require('path');
const fs = require('fs');

(async () => {
  const profileDir = 'C:\\Tools2\\fingerBrowsers2\\NarciPHBrowser\\profiles\\profile-1-d5843f44\\browser';
  console.log('Launching browser with profile:', profileDir);

  const context = await firefox.launchPersistentContext(profileDir, {
    executablePath: 'C:\\Users\\narci\\camoufox\\camoufox.exe',
    headless: false,
    viewport: { width: 1280, height: 800 }
  });

  const page = context.pages()[0] || await context.newPage();
  console.log('Navigating to channels create page...');
  await page.goto('https://channels.weixin.qq.com/platform/post/create', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(3000);

  console.log('Current URL:', page.url());

  // Check frames
  const frames = page.frames();
  console.log(`Found ${frames.length} frames`);
  for (let i = 0; i < frames.length; i++) {
    console.log(`Frame ${i}: ${frames[i].url()}`);
  }

  // Find file input across frames
  let uploadTarget = null;
  for (const f of frames) {
    const inp = await f.$('input[type="file"]');
    if (inp) {
      uploadTarget = f;
      console.log('Found input[type="file"] in frame:', f.url());
      break;
    }
  }

  const videoFile = 'F:\\videowork\\#satisfyingvideo_#gl-20260415203427.mp4';
  if (uploadTarget && fs.existsSync(videoFile)) {
    console.log('Uploading video file:', videoFile);
    await uploadTarget.setInputFiles('input[type="file"]', videoFile);
    console.log('Upload call completed. Waiting 12 seconds for processing...');
    await page.waitForTimeout(12000);
  } else {
    console.log('Upload input or video file not found!');
  }

  // Dump form information
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const info = await f.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, textarea, div[contenteditable="true"]')).map(el => ({
        tag: el.tagName,
        type: el.type,
        placeholder: el.placeholder || el.getAttribute('placeholder') || el.getAttribute('data-placeholder'),
        className: el.className,
        id: el.id,
        value: el.value || el.innerText,
        contentEditable: el.contentEditable,
        isVisible: el.offsetParent !== null
      }));

      const buttons = Array.from(document.querySelectorAll('button, div[role="button"], a[role="button"]')).map(b => ({
        tag: b.tagName,
        text: b.innerText.trim(),
        className: b.className,
        disabled: b.disabled || b.getAttribute('aria-disabled') === 'true' || b.classList.contains('weui-desktop-btn_disabled') || b.classList.contains('disabled'),
        isVisible: b.offsetParent !== null
      })).filter(b => b.text.includes('发表') || b.text.includes('发布') || b.text.includes('保存'));

      // Check any error messages or warnings
      const errors = Array.from(document.querySelectorAll('.error, .warning, .weui-desktop-form__tips, .tips, [class*="error"], [class*="warn"]')).map(e => e.innerText.trim()).filter(Boolean);

      return { inputs, buttons, errors };
    }).catch(() => null);

    if (info) {
      console.log(`=== FRAME ${i} (${f.url()}) ===`);
      console.log('Inputs:', JSON.stringify(info.inputs, null, 2));
      console.log('Buttons:', JSON.stringify(info.buttons, null, 2));
      console.log('Errors/Tips:', JSON.stringify(info.errors, null, 2));
    }
  }

  await page.screenshot({ path: 'channels_post_inspect.png', fullPage: true });
  console.log('Saved screenshot to channels_post_inspect.png');

  await page.waitForTimeout(2000);
  await context.close();
  console.log('Done.');
})();
