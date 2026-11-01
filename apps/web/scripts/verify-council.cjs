// M7 playthrough: the budget goes to council (whip count, lobbying, the vote), a plan with a new and
// a removed route goes to the Transit Commission (staff report by ward), and the February 2011
// contract talks. Writes screenshots and game.json to <outDir>.
// Usage: node scripts/verify-council.cjs <baseUrl> <outDir>
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
    localStorage.setItem('otc.plan.v1', JSON.stringify({ version: 1, edits: [{ kind: 'remove', routeId: 'oct-86' }] }));
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()); });
  const t0 = Date.now();
  const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);
  const ready = () => page.waitForFunction('window.__otc && window.__otc.ready === true && window.__otc.vehicles !== false', null, { timeout: 300000, polling: 500 });
  const game = () => page.evaluate(() => JSON.parse(localStorage.getItem('otc.game.v1') || 'null'));
  const dateNow = async () => (await game())?.date ?? '';

  await page.goto(`${base}?lang=en&speed=0&still&plan=1&draw=-75.7605,45.3478;-75.7155,45.3376;-75.6760,45.3842#view=12/45.36/-75.72`);
  await ready();
  // 1. the budget goes to council
  await page.getByRole('button', { name: 'Send to council' }).click();
  await page.waitForSelector('.whip', { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/vote-budget.jpg`, quality: 85 });
  log(`budget whip: ${await page.locator('p.tally').innerText()}`);
  const lobbyBtn = page.locator('ul.whip button').first();
  if (await lobbyBtn.count()) { await lobbyBtn.click(); log(`lobbied; now ${await page.locator('p.tally').innerText()}`); }
  await page.getByRole('button', { name: 'Call the vote' }).click();
  await page.waitForTimeout(500);
  log(`budget: ${JSON.stringify((await game()).council.items.map((i) => [i.kind, i.status, i.result]))}`);
  // 2. a plan with a new and a removed route goes to the Commission
  await page.getByRole('button', { name: 'Add route' }).click({ timeout: 60000 });
  await page.getByRole('button', { name: /^Schedule for/ }).click();
  await page.waitForSelector('.decision', { timeout: 30000 });
  log(`plan: ${await page.locator('.decision').innerText().then((x) => x.split('\n').slice(0, 3).join(' | '))}`);
  await page.waitForSelector('.whip', { timeout: 300000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/vote-plan.jpg`, quality: 85 });
  log(`plan whip: ${await page.locator('p.tally').innerText()} · effects: ${await page.locator('ul.effects').innerText().then((x) => x.replace(/\n/g, ' | '))}`);
  await page.getByRole('button', { name: 'Call the vote' }).click();
  await page.waitForTimeout(500);
  const g = await game();
  log(`plan: ${JSON.stringify(g.council.items.map((i) => [i.kind, i.status, i.result]))} pending ${g.pending.length} figures ${!!g.pendingFigures}`);
  await page.getByRole('button', { name: 'Done' }).first().click().catch(() => {});
  // 3. run to the contract talks, closing the papers on the way
  await page.getByRole('radio', { name: '1 day per second' }).click();
  while ((await dateNow()) < '2011-02-01' || !(await page.locator('.decision').count())) {
    if (await page.locator('.front-card').count()) await page.locator('.front-card .close').click();
    if ((await dateNow()) > '2011-02-10') break;
    await page.waitForTimeout(400);
  }
  log(`talks on ${await dateNow()}: ${await page.locator('.decision h2').innerText().catch(() => '(none)')}`);
  await page.screenshot({ path: `${out}/labour.jpg`, quality: 85 });
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+' }).first().click();
  await page.getByRole('button', { name: 'Make the offer' }).click();
  await page.waitForTimeout(500);
  if (await page.locator('.whip').count()) {
    log(`ratification: ${await page.locator('p.tally').innerText()}`);
    await page.getByRole('button', { name: 'Call the vote' }).click();
  }
  await page.waitForTimeout(500);
  const g2 = await game();
  log(`labour: wage ${g2.council.labour.wage} until ${g2.council.labour.until}; items ${JSON.stringify(g2.council.items.map((i) => [i.kind, i.status]))}`);
  // the Council panel (the month's paper may be up)
  if (await page.locator('.front-card').count()) await page.locator('.front-card .close').click();
  await page.getByRole('radio', { name: 'Pause' }).click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.locator('.status-chip.capital').first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/council-panel.jpg`, quality: 85 });
  fs.writeFileSync(`${out}/game.json`, JSON.stringify(await game()));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
