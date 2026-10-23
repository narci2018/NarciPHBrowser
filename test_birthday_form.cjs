const driverDir = 'C:\\Users\\narci\\miniconda3\\Lib\\site-packages\\playwright\\driver\\package';
const { firefox } = require(driverDir);

(async () => {
  const browser = await firefox.launch({
    executablePath: 'C:\\Users\\narci\\camoufox\\camoufox.exe',
    headless: true
  });
  const page = await browser.newPage();
  
  // Load real Microsoft markup from birthday_dom.json
  await page.setContent(`
    <html><body>
      <input id="BirthYear" name="BirthYear" type="number" />
      <select id="BirthMonth" name="BirthMonth">
        <option value="">月</option>
        <option value="1">1月</option>
        <option value="2">2月</option>
        <option value="3">3月</option>
        <option value="4">4月</option>
        <option value="5">5月</option>
        <option value="6">6月</option>
        <option value="7">7月</option>
        <option value="8">8月</option>
        <option value="9">9月</option>
        <option value="10">10月</option>
        <option value="11">11月</option>
        <option value="12">12月</option>
      </select>
      <select id="BirthDay" name="BirthDay">
        <option value="">日</option>
        <option value="1">1日</option>
        <option value="2">2日</option>
        <option value="3">3日</option>
        <option value="4">4日</option>
        <option value="5">5日</option>
        <option value="6">6日</option>
        <option value="7">7日</option>
        <option value="8">8日</option>
        <option value="9">9日</option>
        <option value="10">10日</option>
        <option value="11">11日</option>
        <option value="12">12日</option>
        <option value="13">13日</option>
        <option value="14">14日</option>
        <option value="15">15日</option>
        <option value="16">16日</option>
      </select>
      <button id="nextButton" type="submit">次へ</button>
    </body></html>
  `);

  console.log('Testing Playwright fill and selectOption...');
  await page.fill('#BirthYear', '1997');
  console.log('Year filled:', await page.$eval('#BirthYear', el => el.value));

  await page.selectOption('#BirthMonth', '5');
  console.log('Month selected:', await page.$eval('#BirthMonth', el => el.value));

  await page.selectOption('#BirthDay', '16');
  console.log('Day selected:', await page.$eval('#BirthDay', el => el.value));

  await browser.close();
  console.log('DONE!');
})();
