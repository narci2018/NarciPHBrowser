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
      <select id="BirthMonth" name="BirthMonth">
        <option value="">月</option>
        <option value="1">1月</option>
        <option value="2">2月</option>
        <option value="3">3月</option>
        <option value="4">4月</option>
        <option value="5">5月</option>
      </select>
    </body></html>
  `);

  try {
    await page.selectOption('#BirthMonth, select[name="BirthMonth"]', '5');
    console.log('SUCCESS selectOption with comma selector');
  } catch (err) {
    console.log('ERROR selectOption with comma selector:', err.message);
  }

  await browser.close();
})();
