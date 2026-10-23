const http = require('http');

async function main() {
  // 1. Start Profile-1
  console.log('1. Starting Profile-1...');
  const startRes = await fetch('http://127.0.0.1:29995/api/v1/profile/start?id=profile-1-d5843f44&headless=false');
  const startJson = await startRes.json();
  console.log('Start result:', JSON.stringify(startJson));

  if (!startJson.success) {
    throw new Error('Failed to start profile: ' + JSON.stringify(startJson));
  }

  // 2. Submit WeChat publish workflow job
  console.log('\n2. Submitting WeChat publish workflow job...');
  const publishPayload = {
    profile_id: 'profile-1-d5843f44',
    job: {
      mode: 'workflow',
      steps: [
        {
          action: 'goto',
          name: '访问 微信视频号 创作者中心',
          url: 'https://channels.weixin.qq.com/platform/post/list',
          timeout: 20000
        },
        {
          action: 'wait',
          name: '等待发布页面初始化与登录态就绪',
          duration: 3000
        },
        {
          action: 'click',
          name: '进入视频号发布工作台',
          selector: "button:has-text('发表视频'), a:has-text('发表视频'), div:text-is('发表视频')",
          timeout: 8000,
          optional: true
        },
        {
          action: 'upload',
          name: '上传测试视频文件',
          selector: "input[type='file']",
          file: 'F:\\BaiduNetdiskDownload\\fabuya_win_x64\\duck_data\\test.mp4',
          timeout: 15000
        }
      ]
    }
  };

  const jobRes = await fetch('http://127.0.0.1:29995/api/v1/automation/warmup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(publishPayload)
  });
  const jobJson = await jobRes.json();
  console.log('Job response:', JSON.stringify(jobJson, null, 2));
}

main().catch(console.error);
