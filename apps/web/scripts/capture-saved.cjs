// Capture the app with a saved campaign (from verify-days.cjs's game.json) at a given time of day.
// Usage: node scripts/capture-saved.cjs <url> <game.json> <HH:MM> <out.jpg> [WIDTHxHEIGHT] [scale]
// (WAIT_MS=n waits longer before the shot, e.g. for election night's results to come in)
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const [url, gameFile, hhmm, out, size = '1440x900', scale = '1'] = process.argv.slice(2);
  const [width, height] = size.split('x').map(Number);
  const game = fs.readFileSync(gameFile, 'utf8');
  const [h, m] = hhmm.split(':').map(Number);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: Number(scale), hasTouch: width < 1300 });
  await ctx.addInitScript(([g, t]) => {
    localStorage.setItem('otc.game.v1', g);
    localStorage.setItem('otc.clock.v1', JSON.stringify({ date: JSON.parse(g).date, t }));
    const press = JSON.parse(g).press || [];
    if (press.length) localStorage.setItem('otc.press.seen', press[press.length - 1].month); // don't pop the paper up
  }, [game, h * 3600 + m * 60]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(url);
  await page.waitForFunction('window.__otc && window.__otc.ready === true && window.__otc.vehicles !== false', null, { timeout: 300000, polling: 500 });
  await page.waitForTimeout(Number(process.env.WAIT_MS ?? 800));
  await page.screenshot({ path: out, quality: 85 });
  console.log(out);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
