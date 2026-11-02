// M8 in the browser: draw a light-rail line (Tunney's Pasture to Blair, a downtown tunnel), read the
// estimate, forecast its riders with the demand model, and propose it to council.
// Usage: node scripts/verify-projects.cjs <baseUrl> <outDir>
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
  const t0 = Date.now();
  const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);
  const game = () => page.evaluate(() => JSON.parse(localStorage.getItem('otc.game.v1') || 'null'));
  const shot = (name) => page.screenshot({ path: `${out}/${name}`, quality: 85, timeout: 120000 });
  const pts = [[-75.735181, 45.403725], [-75.721943, 45.409442], [-75.713435, 45.413737], [-75.7045, 45.4195], [-75.6964, 45.4216], [-75.6897, 45.424],
    [-75.682238, 45.420249], [-75.670482, 45.416345], [-75.664827, 45.411876], [-75.652216, 45.41743], [-75.637918, 45.420638], [-75.626579, 45.422545],
    [-75.60828, 45.431056]].map((p) => p.join(',')).join(';');
  await page.goto(`${base}?lang=en&speed=0&still&plan=1&line=${pts}&tunnel=2,3,4,5&linename=${encodeURIComponent('Confederation Line')}#view=12.4/45.418/-75.672`);
  await page.waitForFunction('window.__otc && window.__otc.ready === true', null, { timeout: 300000, polling: 500 });
  // the 2011 budget first
  await page.getByRole('button', { name: 'Send to council' }).click();
  await page.getByRole('button', { name: 'Call the vote' }).click();
  await page.waitForSelector('.line-dock', { timeout: 60000 });
  await page.waitForTimeout(800);
  await shot('line-estimate.jpg');
  log(`estimate: ${await page.locator('.line-estimate').innerText().then((x) => x.replace(/\n/g, ' | ').slice(0, 400))}`);
  await page.getByRole('button', { name: 'Forecast riders' }).click();
  await page.waitForFunction(() => /boardings a weekday/.test(document.querySelector('.line-estimate')?.textContent ?? ''), null, { timeout: 600000, polling: 1000 });
  log(`forecast: ${await page.locator('.line-estimate .riders-line').last().innerText()}`);
  await page.locator('.line-dock').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(300);
  await shot('line-forecast.jpg');
  await page.getByRole('button', { name: 'Propose to council' }).click();
  await page.waitForSelector('.whip', { timeout: 30000 });
  await page.waitForTimeout(500);
  await shot('vote-line.jpg');
  log(`vote: ${await page.locator('p.tally').innerText()} · ${await page.locator('ul.effects').innerText().then((x) => x.replace(/\n/g, ' | '))}`);
  // lobby the closest undecided until it passes or capital runs out, then vote
  for (let i = 0; i < 6; i++) {
    const tally = await page.locator('p.tally').innerText();
    const m = tally.match(/(\d+) votes needed · (\d+) for/);
    if (m && Number(m[2]) >= Number(m[1])) break;
    const b = page.locator('ul.whip button:not([disabled])').first();
    if (!(await b.count())) break;
    await b.click();
    await page.waitForTimeout(200);
  }
  await page.getByRole('button', { name: 'Call the vote' }).click();
  await page.waitForTimeout(600);
  const g = await game();
  const p = g.projects?.[0];
  log(`after the vote: ${p?.phase} · items ${JSON.stringify(g.council.items.map((i) => [i.kind, i.status, i.result]))}`);
  await page.locator('.project-chip').first().click().catch(() => {});
  await page.waitForTimeout(600);
  await shot('project-panel-design.jpg');
  fs.writeFileSync(`${out}/game.json`, JSON.stringify(g));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
