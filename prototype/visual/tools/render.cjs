// Render OTC prototype scenes to PNG with headless Chromium (software WebGL).
// Usage: node render.cjs <baseUrl> <outDir> <scene[,scene...]> [scale]
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const [base, outDir, scenesArg, scaleArg] = process.argv.slice(2);
  const scale = Number(scaleArg || 1);
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
  });
  for (const scene of scenesArg.split(',')) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log(`[${scene}] ${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => console.log(`[${scene}] pageerror: ${e.message}`));
    const t = Date.now();
    await page.goto(`${base}/web/index.html?scene=${scene}`);
    await page.waitForFunction('window.__ready === true', null, { timeout: 420000, polling: 500 });
    const file = path.join(outDir, `otc-${scene}.png`);
    await page.screenshot({ path: file });
    console.log(`${scene}: ${file} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
