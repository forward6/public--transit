// Render the OTC mark (public/icons/icon.svg) to the PNG sizes PWAs and iOS need.
// Usage: node scripts/make-icons.cjs   (needs Playwright; outputs are committed)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '../public/icons');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
const jobs = [
  ['icon-192.png', 192, 0, 'transparent'],
  ['icon-512.png', 512, 0, 'transparent'],
  ['icon-512-maskable.png', 512, 0.12, '#13233D'],
  ['apple-touch-icon.png', 180, 0.06, '#13233D'],
];

(async () => {
  const browser = await chromium.launch();
  for (const [name, size, pad, bg] of jobs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const inner = Math.round(size * (1 - 2 * pad));
    await page.setContent(`<html><body style="margin:0;background:${bg};display:grid;place-items:center;width:${size}px;height:${size}px">
      <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
    await page.screenshot({ path: path.join(dir, name), omitBackground: bg === 'transparent' });
    await page.close();
    console.log('wrote', name);
  }
  await browser.close();
})();
