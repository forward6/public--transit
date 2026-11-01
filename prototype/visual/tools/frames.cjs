// Composite device screenshots (from render.cjs) into simple iPhone / iPad frames.
// Usage: node frames.cjs <rawDir> <outDir>
//   expects otc-{day,night,plan}-phone.png and otc-{day,plan}-ipad.png in rawDir
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FONT = path.resolve(__dirname, '../web/node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2');
const SERIF = path.resolve(__dirname, '../web/node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff2');

const css = `
@font-face { font-family: Inter; src: url('file://${FONT}') format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'Source Serif 4'; src: url('file://${SERIF}') format('woff2'); font-weight: 600; }
* { box-sizing: border-box; margin: 0; }
body { font-family: Inter, sans-serif; background: radial-gradient(ellipse at 30% 0%, #F4F1EA 0%, #E3E9EF 55%, #D5DEE8 100%); color: #14213A; }
.wrap { padding: 46px 56px 40px; }
h1 { font-family: 'Source Serif 4', serif; font-weight: 600; font-size: 30px; letter-spacing: 0.005em; }
h1 span { font-family: Inter; font-weight: 500; font-size: 15px; color: #66748B; margin-left: 12px; letter-spacing: 0.02em; }
.row { display: flex; gap: 46px; margin-top: 30px; align-items: flex-start; }
figure { display: flex; flex-direction: column; align-items: center; }
figcaption { margin-top: 18px; text-align: center; font-size: 15px; font-weight: 640; }
figcaption span { display: block; font-size: 12.5px; font-weight: 450; color: #66748B; margin-top: 3px; }
.phone { position: relative; width: 413px; height: 872px; border-radius: 64px; background: #0B0F17; padding: 10px; box-shadow: 0 30px 60px rgba(20,33,58,0.28), 0 0 0 2px #2A3140 inset; }
.phone .screen { position: relative; width: 393px; height: 852px; border-radius: 55px; overflow: hidden; background: #000; }
.phone img { width: 393px; height: 852px; display: block; }
.island { position: absolute; top: 11px; left: 50%; width: 124px; height: 36px; margin-left: -62px; border-radius: 20px; background: #000; }
.status { position: absolute; top: 0; left: 0; right: 0; height: 54px; display: flex; justify-content: space-between; align-items: center; padding: 6px 30px 0 46px; font-weight: 650; font-size: 16px; }
.status.dark { color: #fff; } .status.light { color: #0B0F17; }
.status svg { height: 13px; margin-left: 6px; }
.home { position: absolute; bottom: 8px; left: 50%; width: 134px; height: 5px; margin-left: -67px; border-radius: 3px; }
.home.dark { background: rgba(255,255,255,0.75); } .home.light { background: rgba(11,15,23,0.75); }
.ipad { position: relative; border-radius: 34px; background: #0B0F17; padding: 16px; box-shadow: 0 30px 60px rgba(20,33,58,0.28), 0 0 0 2px #2A3140 inset; }
.ipad .screen { border-radius: 20px; overflow: hidden; }
.ipad img { display: block; }
.cam { position: absolute; top: 50%; left: 6px; width: 6px; height: 6px; margin-top: -3px; border-radius: 50%; background: #1E2633; }
`;

const icons = (c) => `
  <svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="0.8" fill="${c}"/><rect x="5" y="5.5" width="3" height="6.5" rx="0.8" fill="${c}"/><rect x="10" y="3" width="3" height="9" rx="0.8" fill="${c}"/><rect x="15" y="0" width="3" height="12" rx="0.8" fill="${c}"/></svg>
  <svg viewBox="0 0 16 12"><path d="M8 11.5 L5.5 8.8 A3.6 3.6 0 0 1 10.5 8.8 Z M2.8 6.1 A7.4 7.4 0 0 1 13.2 6.1 L11.8 7.6 A5.4 5.4 0 0 0 4.2 7.6 Z M0 3.3 A11.3 11.3 0 0 1 16 3.3 L14.6 4.8 A9.2 9.2 0 0 0 1.4 4.8 Z" fill="${c}"/></svg>
  <svg viewBox="0 0 27 13"><rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="${c}" stroke-opacity="0.45"/><rect x="2.5" y="2.5" width="17" height="8" rx="2" fill="${c}"/><rect x="24.6" y="4.3" width="1.6" height="4.4" rx="0.8" fill="${c}" fill-opacity="0.5"/></svg>`;

function phone(src, tone, title, sub) {
  const c = tone === 'dark' ? '#fff' : '#0B0F17';
  return `<figure><div class="phone"><div class="screen"><img src="file://${src}"/>
    <div class="status ${tone}"><span>9:41</span><span>${icons(c)}</span></div><div class="island"></div><div class="home ${tone}"></div>
  </div></div><figcaption>${title}<span>${sub}</span></figcaption></figure>`;
}

function ipad(src, w, title, sub) {
  const h = Math.round((w * 834) / 1194);
  return `<figure><div class="ipad"><div class="cam"></div><div class="screen"><img src="file://${src}" style="width:${w}px;height:${h}px"/></div></div>
    <figcaption>${title}<span>${sub}</span></figcaption></figure>`;
}

(async () => {
  const [rawDir, outDir] = process.argv.slice(2).map((p) => path.resolve(p));
  const r = (n) => path.join(rawDir, n);
  const pages = {
    'otc-mobile.png': {
      width: 1500,
      html: `<div class="wrap"><h1>Ottawa Transit Commissioner on iPhone<span>portrait · one-hand play · bottom sheet + tab bar</span></h1>
        <div class="row">
          ${phone(r('otc-day-phone.png'), 'light', 'Inspect', 'winter morning · tap a corridor, the sheet explains it')}
          ${phone(r('otc-night-phone.png'), 'dark', 'Follow a rider', 'winter night · cinematic close-up when zoomed in')}
          ${phone(r('otc-plan-phone.png'), 'light', 'Plan', 'summer · draw with a finger, impact in the sheet')}
        </div></div>`,
    },
    'otc-ipad.png': {
      width: 1960,
      html: `<div class="wrap"><h1>Ottawa Transit Commissioner on iPad<span>landscape · sidebar + floating tool dock · Apple Pencil for drawing</span></h1>
        <div class="row">
          ${ipad(r('otc-day-ipad.png'), 860, 'Play', 'winter morning · scorecard folds into the tool rail')}
          ${ipad(r('otc-plan-ipad.png'), 860, 'Plan with Apple Pencil', 'summer · sketch a line, it snaps to streets and rail')}
        </div></div>`,
    },
  };
  const browser = await chromium.launch();
  for (const [name, p] of Object.entries(pages)) {
    const file = path.join(os_tmp(), `frame-${name}.html`);
    fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${p.html}</body></html>`);
    const page = await browser.newPage({ viewport: { width: p.width, height: 800 }, deviceScaleFactor: 2 });
    await page.goto(`file://${file}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, name), fullPage: true });
    console.log('wrote', name);
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

function os_tmp() { return require('os').tmpdir(); }
