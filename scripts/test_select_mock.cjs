const driverDir = 'C:\\Users\\narci\\miniconda3\\Lib\\site-packages\\playwright\\driver\\package';
const { firefox } = require(driverDir);

(async () => {
  const browser = await firefox.launch({
    executablePath: 'C:\\Users\\narci\\camoufox\\camoufox.exe',
    headless: false,
  });
  const page = await browser.newPage();
  await page.setContent(`
    <form>
      <input id="BirthYear" name="BirthYear" type="number" value="" />
      <select id="BirthMonth" name="BirthMonth">
        <option value="">月</option>
        <option value="1">1月</option>
        <option value="5">5月</option>
      </select>
      <select id="BirthDay" name="BirthDay">
        <option value="">日</option>
        <option value="16">16日</option>
      </select>
    </form>
  `);
  
  console.log('Initial month value:', await page.$eval('#BirthMonth', el => el.value));
  
  await page.selectOption('#BirthMonth', '5');
  console.log('After selectOption value:', await page.$eval('#BirthMonth', el => el.value));
  console.log('After selectOption selectedIndex:', await page.$eval('#BirthMonth', el => el.selectedIndex));
  
  await page.selectOption('#BirthDay', '16');
  console.log('After selectOption day:', await page.$eval('#BirthDay', el => el.value));

  await browser.close();
  console.log('Done mock test.');
})();
