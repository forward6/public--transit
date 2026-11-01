// The start screen: first visit (New game), a saved campaign (Continue, New game → confirm → a
// fresh campaign after the reload), and the phone layout in French. Writes screenshots to <outDir>.
// Usage: node scripts/verify-start.cjs <baseUrl> <outDir> <saved game.json>
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const [base = 'http://127.0.0.1:4173/', out = '.', savedFile] = process.argv.slice(2);
  const saved = savedFile ? fs.readFileSync(savedFile, 'utf8') : null;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ready = (page) => page.waitForFunction('window.__otc && window.__otc.ready === true', null, { timeout: 300000, polling: 500 });
  const game = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('otc.game.v1') || 'null'));
  const log = (m) => console.log(m);

  // 1. first visit: the start screen, then New game
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => log(`pageerror: ${e.message}`));
    await page.goto(`${base}?lang=en`);
    await page.waitForSelector('.start-wrap');
    await ready(page);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/start-first.jpg`, quality: 85, timeout: 120000 });
    log(`first visit buttons: ${await page.locator('.start-actions button').allInnerTexts()}`);
    await page.getByRole('button', { name: 'New game' }).click();
    await page.waitForTimeout(400);
    log(`after New game: start screen ${await page.locator('.start-wrap').count()}, date ${(await game(page))?.date}`);
    await ctx.close();
  }
  // 2. a saved campaign: Continue, then New game → confirm → reload into a fresh campaign
  if (saved) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript((g) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('otc.game.v1', g);
      localStorage.setItem('otc.clock.v1', JSON.stringify({ date: JSON.parse(g).date, t: 8 * 3600 + 600 }));
      localStorage.setItem('otc.press.seen', '2099-12');
    }, saved);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => log(`pageerror: ${e.message}`));
    await page.goto(`${base}?lang=en#view=11.2/45.38/-75.70`);
    await page.waitForSelector('.start-wrap');
    await ready(page);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/start-continue.jpg`, quality: 85, timeout: 120000 });
    log(`saved: ${await page.locator('.start-actions').innerText().then((x) => x.replace(/\n/g, ' | '))}`);
    await page.getByRole('button', { name: /^Continue/ }).click();
    await page.waitForTimeout(400);
    log(`continued: start screen ${await page.locator('.start-wrap').count()}, date ${(await game(page)).date}`);
    // the logo opens the menu again
    await page.locator('.logo-btn').first().click();
    await page.waitForSelector('.start-wrap');
    await page.getByRole('button', { name: 'New game' }).click();
    await page.waitForSelector('.confirm');
    await page.screenshot({ path: `${out}/start-confirm.jpg`, quality: 85, timeout: 120000 });
    log(`confirm: ${await page.locator('.confirm').innerText().then((x) => x.replace(/\n/g, ' | '))}`);
    await Promise.all([page.waitForNavigation(), page.getByRole('button', { name: 'Start over' }).click()]);
    await ready(page);
    await page.waitForTimeout(1500);
    const g = await game(page);
    log(`after Start over: start screen ${await page.locator('.start-wrap').count()}, date ${g?.date}, applied ${g?.applied.length}, council items ${g?.council?.items.length}, clock ${await page.evaluate(() => localStorage.getItem('otc.clock.v1'))}`);
    await page.screenshot({ path: `${out}/start-after-new.jpg`, quality: 85, timeout: 120000 });
    await ctx.close();
  }
  // 3. the phone, in French
  if (saved) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
    await ctx.addInitScript((g) => {
      localStorage.setItem('otc.game.v1', g);
      localStorage.setItem('otc.clock.v1', JSON.stringify({ date: JSON.parse(g).date, t: 8 * 3600 + 600 }));
      localStorage.setItem('otc.press.seen', '2099-12');
    }, saved);
    const page = await ctx.newPage();
    await page.goto(`${base}?lang=fr#view=10.6/45.37/-75.70`);
    await page.waitForSelector('.start-wrap');
    await ready(page);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/start-phone-fr.jpg`, quality: 85, timeout: 120000 });
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
