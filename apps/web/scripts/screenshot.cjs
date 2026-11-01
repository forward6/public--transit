// Capture the running app headlessly (software WebGL) once the map reports ready.
// Usage: node scripts/screenshot.cjs <url> <out.png> [WIDTHxHEIGHT] [scale]
//   e.g. node scripts/screenshot.cjs "http://127.0.0.1:4173/?season=winter&still&capture#view=12/45.42/-75.70" out.png 1920x1080
const { chromium } = require('playwright');

(async () => {
  const [url, out, size = '1920x1080', scaleArg = '1'] = process.argv.slice(2);
  const [width, height] = size.split('x').map(Number);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(scaleArg), hasTouch: width < 1300 });
  page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()); });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  const t = Date.now();
  await page.goto(url);
  // ready = base map idle; vehicles = first vehicle frame rendered (undefined when there is no network)
  await page.waitForFunction('window.__otc && window.__otc.ready === true && window.__otc.vehicles !== false', null, { timeout: 300000, polling: 500 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: out });
  console.log(`${out} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
