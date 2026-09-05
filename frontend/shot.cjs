const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('http://localhost:5174/login', { waitUntil: 'networkidle' });
  await page.waitForSelector('h1');
  await page.screenshot({ path: 'C:/Users/ASPIRE~1/AppData/Local/Temp/claude/c--Users-Aspire-3-OneDrive---frt-utn-edu-ar-Documentos-abuela/1dcf6223-de10-4cf9-87b9-f02a4aefbac9/scratchpad/login.png' });

  // read computed colors of key elements
  const info = await page.evaluate(() => {
    function cs(sel, prop) {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el)[prop] : 'NOT FOUND';
    }
    const body = document.body;
    return {
      bodyBg: getComputedStyle(body).backgroundColor,
      main: document.querySelector('main') ? getComputedStyle(document.querySelector('main')).backgroundColor : 'no main',
      submitBtnBg: cs('button[type=submit]', 'backgroundColor'),
      submitBtnColor: cs('button[type=submit]', 'color'),
      isotypeBg: (() => {
        const spans = [...document.querySelectorAll('span')];
        const iso = spans.find(s => s.textContent.trim() === 'CD');
        return iso ? getComputedStyle(iso).backgroundColor : 'CD not found';
      })(),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  console.log('CONSOLE ERRORS:', errors);

  await browser.close();
})();
