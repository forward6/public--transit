// Play the campaign headlessly: draw a route, schedule a plan, run the calendar past the service
// change at 1 day per second, and capture the ridership views.
// Usage: node scripts/verify-days.cjs <baseUrl> <outDir>
const { chromium } = require('playwright');

(async () => {
  const [base = 'http://127.0.0.1:4173/', out = '.'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('otc.plan.v1', JSON.stringify({ version: 1, edits: [
      { kind: 'service', routeId: 'oct-7', headways: { am: 5, midday: 7.5, pm: 5, evening: 10 } },
      { kind: 'remove', routeId: 'oct-86' },
    ] }));
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text()); });
  const ready = () => page.waitForFunction('window.__otc && window.__otc.ready === true && window.__otc.vehicles !== false', null, { timeout: 300000, polling: 500 });
  const game = () => page.evaluate(() => JSON.parse(localStorage.getItem('otc.game.v1') || 'null'));
  const t0 = Date.now();
  const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);

  // 1. the opening: Wednesday 1 December 2010, 00:01, the budget to set
  await page.goto(`${base}?lang=en&speed=0&still#view=11.6/45.39/-75.70`);
  await ready();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/opening.jpg`, quality: 85 });
  log(`opening: ${await page.locator('.clock-date').innerText()} ${await page.locator('.clock-time').innerText()}`);

  // 2. plan: draw a crosstown route, keep the two edits, schedule for the December service change
  await page.goto(`${base}?lang=en&speed=0&still&plan=1&draw=-75.7605,45.3478;-75.7155,45.3376;-75.6760,45.3842#view=12/45.36/-75.72`);
  await ready();
  await page.getByRole('button', { name: 'Send to council' }).click();
  await page.getByRole('button', { name: 'Add route' }).click({ timeout: 60000 });
  await page.getByRole('button', { name: /^Schedule for/ }).click();
  await page.getByRole('button', { name: 'Done' }).first().click();
  log(`scheduled: ${JSON.stringify((await game()).pending.map((e) => e.kind + ':' + (e.routeId || e.route.shortName)))}`);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('otc.game.v1') || '{}').pendingFigures, null, { timeout: 300000, polling: 1000 });
  const g = await game();
  log(`measured: ${Math.round(g.service.boardings)} -> ${Math.round(g.pendingFigures.service.boardings)}; routes ${JSON.stringify(g.pendingFigures.routes)} before ${JSON.stringify(g.pendingFigures.routesBefore)}`);

  // 3. watch the weeks go by
  await page.getByRole('radio', { name: '1 day per second' }).click();
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('otc.game.v1') || '{}').date || '') >= '2011-01-23', null, { timeout: 300000, polling: 500 });
  await page.getByRole('radio', { name: 'Pause' }).click();
  const g2 = await game();
  require('fs').writeFileSync(`${out}/game.json`, JSON.stringify(g2));
  log(`now ${g2.date}: applied ${g2.applied.length}, serviceFor ${g2.serviceFor}, changes ${JSON.stringify(g2.changes)}, days ${g2.daily.length}`);
  log(`last days: ${g2.daily.slice(-8).map((d) => `${d.date}:${d.boardings}`).join(' ')}`);
  log(`routes: ${JSON.stringify(g2.daily.at(-1).routes)}`);
  const decision = await page.locator('.decision').count();
  if (decision) log('a decision is open');
  await page.locator('.status-chip.riders').first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/ridership-daily.jpg`, quality: 85 });
  log(`chip: ${await page.locator('.status-chip.riders').first().innerText()}`);
  // a route the change touched
  await page.locator('table.watch tbody th button', { hasText: /^7$/ }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/route-trend.jpg`, quality: 85 });

  // 4. a winter afternoon in real time: the light follows the sun
  await page.evaluate(() => localStorage.setItem('otc.clock.v1', JSON.stringify({ date: JSON.parse(localStorage.getItem('otc.game.v1')).date, t: 16 * 3600 + 50 * 60 })));
  await page.goto(`${base}?lang=fr&speed=0&still#view=13/45.42/-75.69`);
  await ready();
  await page.getByRole('radio', { name: 'Temps réel' }).click(); // the map keeps moving: no waiting for idle
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/dusk-fr.jpg`, quality: 85 });
  log(`fr: ${await page.locator('.clock-date').innerText()} ${await page.locator('.clock-time').innerText()}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
