// Render OTC prototype scenes to PNG with headless Chromium (software WebGL).
// Usage: node render.cjs <baseUrl> <outDir> <scene[,scene...]> [scale] [WIDTHxHEIGHT] [suffix] [extraQuery]
//   desktop: node render.cjs http://127.0.0.1:8765 out day,night,plan
//   iPhone:  node render.cjs http://127.0.0.1:8765 out day 3 393x852 -phone "safe=59,34"
//   iPad:    node render.cjs http://127.0.0.1:8765 out day 2 1194x834 -ipad "safe=24,20"
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const [base, outDir, scenesArg, scaleArg, sizeArg, suffix = '', extra = ''] = process.argv.slice(2);
  const scale = Number(scaleArg || 1);
  const [width, height] = (sizeArg || '1920x1080').split('x').map(Number);
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
  });
  for (const scene of scenesArg.split(',')) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale, hasTouch: width < 1300 });
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log(`[${scene}] ${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => console.log(`[${scene}] pageerror: ${e.message}`));
    const t = Date.now();
    await page.goto(`${base}/web/index.html?scene=${scene}${extra ? `&${extra}` : ''}`);
    await page.waitForFunction('window.__ready === true', null, { timeout: 420000, polling: 500 });
    const file = path.join(outDir, `otc-${scene}${suffix}.png`);
    await page.screenshot({ path: file });
    console.log(`${scene}: ${file} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
