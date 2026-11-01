// M6 playthrough: a fresh campaign with the Opinion view, the first front page, two months of
// opinion, a zone's reasons and a rider to follow. Writes screenshots and game.json to <outDir>.
// Usage: node scripts/verify-opinion.cjs <baseUrl> <outDir>
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const [base = 'http://127.0.0.1:4173/', out = '.'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()); });
  const ready = () => page.waitForFunction('window.__otc && window.__otc.ready === true && window.__otc.vehicles !== false', null, { timeout: 300000, polling: 500 });
  const game = () => page.evaluate(() => JSON.parse(localStorage.getItem('otc.game.v1') || 'null'));
  const t0 = Date.now();
  const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);
  const until = (date) => page.waitForFunction((d) => (JSON.parse(localStorage.getItem('otc.game.v1') || '{}').date || '') >= d, date, { timeout: 600000, polling: 300 });

  await page.goto(`${base}?lang=en&speed=0&still&opinion=1#view=10.4/45.33/-75.72`);
  await ready();
  await page.getByRole('button', { name: 'Send to council' }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('otc.game.v1') || '{}').opinion, null, { timeout: 60000, polling: 500 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/opinion-map.jpg`, quality: 85 });
  log(`chip: ${await page.locator('.status-chip.approval').first().innerText()}`);

  // run to the first front page
  await page.getByRole('radio', { name: '1 day per second' }).click();
  await until('2011-01-01');
  await page.getByRole('radio', { name: 'Pause' }).click();
  await page.waitForSelector('.front-card', { timeout: 20000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/front-page.jpg`, quality: 85 });
  log(`front page: ${(await page.locator('.front-card h3').innerText())}`);
  await page.locator('.front-card .close').click();

  // two months on
  await page.getByRole('radio', { name: '1 day per second' }).click();
  await until('2011-02-08');
  await page.getByRole('radio', { name: 'Pause' }).click();
  if (await page.locator('.front-card .close').count()) await page.locator('.front-card .close').click();
  const g = await game();
  fs.writeFileSync(`${out}/game.json`, JSON.stringify(g));
  log(`now ${g.date}: history ${g.opinion.history.map((h) => h.approval).join(' ')}`);
  log(`press: ${g.press.map((p) => p.month + ':' + p.stories.map((s) => s.kind).join('+')).join(' | ')}`);
  log(`posts: ${g.posts.length}, diaries: ${Object.entries(g.diaries).map(([k, v]) => k + ':' + v.length).join(' ')}`);
  await page.locator('.status-chip.approval').first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/opinion-panel.jpg`, quality: 85 });
  // a zone: click the map near Barrhaven
  await page.mouse.click(560, 640);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/opinion-zone.jpg`, quality: 85 });
  log(`zone: ${await page.locator('.inspector .ins-title').first().innerText().catch(() => '(none)')}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
