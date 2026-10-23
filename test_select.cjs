const path = require('path');
const driverDir = 'C:\\Users\\narci\\miniconda3\\Lib\\site-packages\\playwright\\driver\\package';
const { firefox } = require(driverDir);

(async () => {
  const browser = await firefox.launch({
    executablePath: 'C:\\Users\\narci\\camoufox\\camoufox.exe',
    headless: true
  });
  const page = await browser.newPage();
  await page.setContent(`
    <html><body>
      <select id="BirthMonth">
        <option value="">月</option>
        <option value="1">1月</option>
        <option value="2">2月</option>
        <option value="3">3月</option>
        <option value="4">4月</option>
        <option value="5">5月</option>
      </select>
      <input id="BirthYear" type="number" />
    </body></html>
  `);

  const res = await page.evaluate(() => {
    const el = document.querySelector('#BirthMonth');
    const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    return {
      hasDesc: !!desc,
      hasSetter: !!(desc && desc.set),
      currVal: el.value,
      optionsLen: el.options.length
    };
  });
  console.log('Evaluate result:', JSON.stringify(res));

  // Test native selectOption
  await page.selectOption('#BirthMonth', '5');
  const afterNative = await page.evaluate(() => document.querySelector('#BirthMonth').value);
  console.log('After native selectOption:', afterNative);

  await browser.close();
})();
