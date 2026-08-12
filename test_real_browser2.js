// Capture console + pageerror using CDP-style via chromium-headless-shell with a
// real driver. Use playwright-core (available in trade workspace) + system chromium.
const { chromium } = require('/root/workspace/node_modules/playwright-core');

(async () => {
  // system chromium-headless-shell is a standalone binary — point playwright at the dir
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/chromium-headless-shell',
    args: ['--no-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  const errors = [];
  const consoleMsgs = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleMsgs.push('CONSOLE: ' + m.text()); });
  page.on('requestfailed', (r) => errors.push('REQFAIL: ' + r.url() + ' ' + (r.failure() && r.failure().errorText)));

  await page.goto('https://gulshan1234g5.github.io/fabric-at-home/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  const titled = await page.title();
  const hero = await page.locator('.hero h2').textContent().catch(() => 'MISSING');
  const catCount = await page.locator('.cat-card').count();
  const shCount = await page.locator('.showroom-card').count();
  const scrollDims = await page.evaluate(() => {
    const v = document.getElementById('view');
    return { viewH: v ? v.getBoundingClientRect().height : -1, bodyH: document.body.scrollHeight, vw: window.innerWidth };
  });

  console.log('title:', titled);
  console.log('hero:', hero);
  console.log('category cards:', catCount);
  console.log('showroom cards:', shCount);
  console.log('viewport:', scrollDims.vw, 'bodyH:', scrollDims.bodyH, 'viewH:', scrollDims.viewH);
  console.log('--- console errors (' + consoleMsgs.length + ') ---');
  consoleMsgs.slice(0, 12).forEach((m) => console.log(m));
  console.log('--- page errors (' + errors.length + ') ---');
  errors.slice(0, 12).forEach((m) => console.log(m));

  await browser.close();
  process.exit((errors.length || hero === 'MISSING') ? 1 : 0);
})().catch((e) => { console.error('DRIVER FATAL:', e.message); process.exit(1); });