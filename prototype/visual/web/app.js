// OTC visual prototype — scene setup, HUD and effects.
// Open web/index.html?scene=day or ?scene=night (served from prototype/visual/).

import { PALETTES, makeStyle, lighten } from './style.js';
import { SCENES } from './scenes.js';

const params = new URLSearchParams(location.search);
const scene = SCENES[params.get('scene') || 'day'];
const P = PALETTES[scene.palette];
document.body.classList.add(`theme-${scene.theme}`);
window.__ready = false;

// ---------- vehicles recoloured for the palette ----------
const veh = await (await fetch('../data/vehicles.geojson')).json();
for (const f of veh.features) {
  const c = P.transit[f.properties.kind];
  f.properties.vcolor = c;
  f.properties.vcore = lighten(c, 0.65);
}

let draftHandles;
if (scene.style?.draft) {
  const d = await (await fetch('../data/draft.geojson')).json();
  const cs = d.features[0].geometry.coordinates;
  draftHandles = { type: 'FeatureCollection', features: cs.filter((_, i) => i > 0 && i < cs.length - 1 && i % 3 === 1)
    .map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })) };
}

const map = new maplibregl.Map({
  container: 'map',
  style: makeStyle(P, { ...scene.style, ...(params.get('nowin') ? { windows: false } : {}), vehiclesData: veh, draftHandles }),
  ...scene.camera,
  maxPitch: 75,
  attributionControl: false,
  canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
  pixelRatio: window.devicePixelRatio,
  fadeDuration: 0,
});

// Lit-window textures for night extrusions
map.on('styleimagemissing', (e) => {
  if (e.id.startsWith('veh-')) {
    const [, kind, crowd] = e.id.split('-');
    map.addImage(e.id, vehicleIcon(kind, crowd === 'c'), { pixelRatio: 2 });
    return;
  }
  const spec = { 'win-low': [0.22, 7], 'win-mid': [0.34, 11], 'win-high': [0.48, 17] }[e.id];
  if (spec) map.addImage(e.id, windowTexture(e.id, spec[0], spec[1]), { pixelRatio: 2 });
});

// Oriented vehicle silhouette: front (direction of travel) is the top of the image.
function vehicleIcon(kind, crowded) {
  const train = kind === 'otrain';
  const w = train ? 18 : kind === 'local' ? 14 : 16;
  const h = train ? 74 : kind === 'brt' ? 44 : kind === 'local' ? 30 : 36;
  const pad = 5;
  const c = document.createElement('canvas');
  c.width = w + pad * 2; c.height = h + pad * 2;
  const g = c.getContext('2d');
  const body = P.transit[kind];
  const rr = (x, y, ww, hh, r) => { g.beginPath(); g.roundRect(x, y, ww, hh, r); };
  if (crowded) { g.fillStyle = P.glow ? '#FFB347' : '#F08A24'; rr(pad - 3, pad - 3, w + 6, h + 6, 9); g.fill(); }
  g.fillStyle = P.glow ? '#0B1220' : '#FFFFFF';
  rr(pad - 1.5, pad - 1.5, w + 3, h + 3, 7.5); g.fill();
  g.fillStyle = body; rr(pad, pad, w, h, 6); g.fill();
  // roof highlight
  g.fillStyle = 'rgba(255,255,255,0.32)'; rr(pad + w * 0.28, pad + 6, w * 0.44, h - 12, 3); g.fill();
  // windscreen at the front
  g.fillStyle = P.glow ? 'rgba(255,250,225,0.95)' : 'rgba(20,33,58,0.55)';
  rr(pad + 2.5, pad + 2, w - 5, 5, 2); g.fill();
  if (kind === 'brt' && !train) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(pad + 1, pad + h * 0.55, w - 2, 1.6); } // articulation
  if (train) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(pad, pad + h / 2 - 1, w, 2); }
  return g.getImageData(0, 0, c.width, c.height);
}

function windowTexture(seed, litShare, s) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  let x = s * 9973;
  const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  g.fillStyle = seed === 'win-high' ? '#25324D' : seed === 'win-mid' ? '#1F2A41' : '#1B2537';
  g.fillRect(0, 0, size, size);
  for (let yy = 3; yy < size; yy += 8) {
    for (let xx = 2; xx < size; xx += 6) {
      const r = rnd();
      if (r < litShare) {
        const warm = rnd() < 0.8;
        g.fillStyle = warm ? `rgba(255,${200 + Math.floor(rnd() * 40)},${120 + Math.floor(rnd() * 60)},${0.55 + rnd() * 0.45})`
          : `rgba(170,210,255,${0.45 + rnd() * 0.4})`;
        g.fillRect(xx, yy, 3, 4);
      } else {
        g.fillStyle = 'rgba(90,110,150,0.18)';
        g.fillRect(xx, yy, 3, 4);
      }
    }
  }
  return g.getImageData(0, 0, size, size);
}

// ---------- HUD ----------
buildHud(scene.hud);

// ---------- labels (HTML overlay, positioned once the map is idle) ----------
const labelLayer = document.getElementById('labels');
function placeLabels() {
  labelLayer.innerHTML = '';
  const W = innerWidth, H = innerHeight;
  for (const l of scene.labels) {
    const pt = map.project(l.at);
    if (pt.x < -200 || pt.x > W + 200 || pt.y < 40 || pt.y > H + 50) continue;
    const el = document.createElement('div');
    el.className = `lbl lbl-${l.kind}`;
    el.innerHTML = l.text;
    el.style.left = `${pt.x + (l.dx || 0)}px`;
    el.style.top = `${pt.y + (l.dy || 0)}px`;
    if (l.rotate) el.style.transform = `translate(-50%,-50%) rotate(${l.rotate}deg)`;
    if (l.size) el.style.fontSize = `${l.size}px`;
    labelLayer.appendChild(el);
  }
  for (const c of scene.callouts || []) {
    const pt = map.project(c.at);
    const el = document.createElement('div');
    el.className = `callout callout-${c.tone || 'warn'} ${c.dir || 'up'}`;
    el.innerHTML = c.dir === 'down' || c.dir === 'right'
      ? `<div class="callout-dot"></div><div class="callout-stem"></div><div class="callout-body">${c.html}</div>`
      : `<div class="callout-body">${c.html}</div><div class="callout-stem"></div><div class="callout-dot"></div>`;
    el.style.left = `${pt.x}px`;
    el.style.top = `${pt.y}px`;
    labelLayer.appendChild(el);
  }
}

// ---------- snow ----------
function snow(cfg) {
  const cv = document.getElementById('snow');
  cv.width = innerWidth * devicePixelRatio;
  cv.height = innerHeight * devicePixelRatio;
  const g = cv.getContext('2d');
  g.scale(devicePixelRatio, devicePixelRatio);
  let s = 42;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < cfg.count; i++) {
    const x = rnd() * innerWidth, y = rnd() * innerHeight;
    const depth = rnd();
    const r = 0.6 + depth * depth * cfg.maxR;
    const a = cfg.alpha * (0.35 + depth * 0.65);
    const grd = g.createRadialGradient(x, y, 0, x, y, r * 1.8);
    grd.addColorStop(0, `rgba(255,255,255,${a})`);
    grd.addColorStop(0.5, `rgba(255,255,255,${a * 0.6})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    if (cfg.shadow) {
      g.fillStyle = `rgba(90,110,135,${a * 0.18})`;
      g.beginPath(); g.arc(x + 0.6, y + 0.8, r * 1.3, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r * 1.8, 0, Math.PI * 2); g.fill();
  }
  // a few large, out-of-focus flakes close to the camera
  for (let i = 0; i < (cfg.bokeh || 0); i++) {
    const x = rnd() * innerWidth, y = rnd() * innerHeight, r = 7 + rnd() * 12;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(255,255,255,${cfg.alpha * 0.22})`);
    grd.addColorStop(0.7, `rgba(255,255,255,${cfg.alpha * 0.12})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
}

map.once('idle', async () => {
  await document.fonts.ready;
  placeLabels();
  if (scene.snow) snow(scene.snow);
  setTimeout(() => { window.__ready = true; }, 400);
});

// =====================================================================
// HUD builder
// =====================================================================
function buildHud(h) {
  const $ = (id) => document.getElementById(id);

  $('topbar').innerHTML = `
    <div class="brand">
      ${logoSvg()}
      <div class="brand-text">
        <div class="brand-name">Ottawa Transit Commissioner</div>
        <div class="brand-sub">Transit Commission · Term 2010–2014</div>
      </div>
    </div>
    <div class="clock">
      <div class="clock-date">${h.date}</div>
      <div class="clock-row"><span class="clock-time">${h.time}</span><span class="clock-wx">${h.weather}</span></div>
    </div>
    <div class="speed">
      ${['pause', 'play', 'ff', 'fff'].map((k) => `<button class="${k === h.speed ? 'on' : ''}">${speedIcon(k)}</button>`).join('')}
    </div>
    <div class="kpis">
      ${h.kpis.map((k) => `
        <div class="kpi">
          <div class="kpi-label">${k.label}</div>
          <div class="kpi-value">${k.dot ? `<i class="dot" style="background:${k.dot}"></i>` : ''}${k.value}${k.delta ? `<span class="delta ${k.delta.startsWith('▼') ? 'down' : 'up'}">${k.delta}</span>` : ''}</div>
        </div>`).join('')}
    </div>`;

  $('rail').innerHTML = ['inspect', 'route', 'stop', 'build', 'layers', 'budget', 'council', 'news', 'score']
    .map((k) => `<button class="${k === h.tool ? 'on' : ''}" title="${k}">${toolIcon(k)}${h.badges?.[k] ? `<b class="badge">${h.badges[k]}</b>` : ''}</button>`).join('');

  $('left').innerHTML = h.left;
  $('right').innerHTML = h.right;
  $('news').innerHTML = `
    <div class="masthead">THE CAPITAL LEDGER <span>· ${h.news.time}</span></div>
    <div class="headline">${h.news.headline}</div>
    <div class="news-meta">${h.news.meta}</div>`;
  $('timeline').innerHTML = h.bottomCenter || timelineSvg(h.timeNow);
  $('legend').innerHTML = legendHtml(h.legendTitle, h.legendExtra);
  if (h.toast) {
    $('toast').innerHTML = h.toast;
    $('toast').hidden = false;
  }
  $('attrib').innerHTML = 'Prototype mock-up · illustrative data · 2010 routes approximate · Map data © OpenStreetMap contributors, Overture Maps Foundation';
}

function logoSvg() {
  return `<svg class="logo" viewBox="0 0 44 44" aria-label="OTC">
    <rect x="1" y="1" width="42" height="42" rx="11" fill="#13233D"/>
    <path d="M6 12 C 15 13, 18 19, 22 22" stroke="#E5394B" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path d="M6 33 C 14 31, 17 25, 22 22" stroke="#33B36B" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path d="M21 6 C 22 12, 21 17, 22 22" stroke="#22C2CF" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path d="M22 22 L 37 22" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
    <circle cx="22" cy="22" r="3.4" fill="#FFFFFF"/>
  </svg>`;
}

function speedIcon(k) {
  const p = {
    pause: '<rect x="5" y="4" width="3.2" height="12" rx="1"/><rect x="11.8" y="4" width="3.2" height="12" rx="1"/>',
    play: '<path d="M6 4 L16 10 L6 16 Z"/>',
    ff: '<path d="M3 4 L10 10 L3 16 Z"/><path d="M10 4 L17 10 L10 16 Z"/>',
    fff: '<path d="M1 5 L6.5 10 L1 15 Z"/><path d="M7 5 L12.5 10 L7 15 Z"/><path d="M13 5 L18.5 10 L13 15 Z"/>',
  }[k];
  return `<svg viewBox="0 0 20 20" fill="currentColor">${p}</svg>`;
}

function toolIcon(k) {
  const s = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  const p = {
    inspect: `<path ${s} d="M6 4 L18 12 L12.5 13.2 L15.5 19.5 L13 20.6 L10 14.3 L6 18 Z"/>`,
    route: `<path ${s} d="M4 19 C 8 19, 8 12, 12 12 S 16 5, 20 5"/><circle cx="4" cy="19" r="2" fill="currentColor"/><circle cx="20" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/>`,
    stop: `<path ${s} d="M12 21 V 10"/><rect ${s} x="7" y="3" width="10" height="7" rx="2"/><path ${s} d="M9 21 H 15"/>`,
    build: `<path ${s} d="M4 20 H 20"/><path ${s} d="M6 20 V 9 L 12 5 L 18 9 V 20"/><path ${s} d="M10 20 V 14 H 14 V 20"/>`,
    layers: `<path ${s} d="M12 4 L 21 9 L 12 14 L 3 9 Z"/><path ${s} d="M3 13.5 L 12 18.5 L 21 13.5"/>`,
    budget: `<circle ${s} cx="12" cy="12" r="8.5"/><path ${s} d="M14.8 8.6 C 13.8 7.6, 9.2 7.4, 9.2 10 C 9.2 12.6, 14.8 11.4, 14.8 14.1 C 14.8 16.6, 10.2 16.5, 9 15.3 M12 6.2 V 17.8"/>`,
    council: `<path ${s} d="M3 9 L 12 4 L 21 9 Z"/><path ${s} d="M5 10 V 18 M9.5 10 V 18 M14.5 10 V 18 M19 10 V 18 M3 20 H 21"/>`,
    news: `<rect ${s} x="3" y="5" width="15" height="15" rx="2"/><path ${s} d="M18 9 H 21 V 18 A 2 2 0 0 1 17 18"/><path ${s} d="M6.5 9 H 14.5 M6.5 12.5 H 14.5 M6.5 16 H 11"/>`,
    score: `<path ${s} d="M4 17 A 8 8 0 1 1 20 17"/><path ${s} d="M12 17 L 15.5 10.5"/><circle cx="12" cy="17" r="1.6" fill="currentColor"/>`,
  }[k];
  return `<svg viewBox="0 0 24 24">${p}</svg>`;
}

function timelineSvg(now) {
  // vehicles-in-service curve over the service day 04:00 -> 01:00 (21 h)
  const W = 520, H = 58;
  const t0 = 4, t1 = 25;
  const f = (t) => {
    const am = Math.exp(-((t - 7.9) ** 2) / 1.1);
    const pm = Math.exp(-((t - 16.6) ** 2) / 1.6);
    const mid = t > 6 && t < 23 ? 0.42 : 0.08 + 0.3 * Math.max(0, Math.min(1, (t - 4.5) / 1.5));
    const late = t > 22 ? Math.max(0.06, 0.42 - (t - 22) * 0.12) : mid;
    return Math.min(1, Math.max(am, pm * 0.95, t > 22 ? late : mid));
  };
  const pts = [];
  for (let t = t0; t <= t1; t += 0.1) pts.push([((t - t0) / (t1 - t0)) * W, H - 6 - f(t) * (H - 14)]);
  const d = 'M' + pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join(' L');
  const area = `${d} L ${W} ${H} L 0 ${H} Z`;
  const [hh, mm] = now.split(':').map(Number);
  const nx = (((hh < 4 ? hh + 24 : hh) + mm / 60 - t0) / (t1 - t0)) * W;
  const ticks = [6, 9, 12, 15, 18, 21, 24].map((t) => {
    const x = ((t - t0) / (t1 - t0)) * W;
    return `<text x="${x}" y="${H + 14}" class="tl-tick">${String(t % 24).padStart(2, '0')}:00</text>`;
  }).join('');
  return `<div class="tl-title">Vehicles in service · today <span>${now}</span></div>
  <svg viewBox="0 -2 ${W} ${H + 18}" class="tl">
    <defs><linearGradient id="tlg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity="0.45"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0.02"/></linearGradient>
    <clipPath id="past"><rect x="0" y="-2" width="${nx}" height="${H + 4}"/></clipPath></defs>
    <path d="${area}" fill="url(#tlg)" opacity="0.45"/>
    <path d="${area}" fill="url(#tlg)" clip-path="url(#past)"/>
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="1.6" opacity="0.5"/>
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.2" clip-path="url(#past)"/>
    <line x1="${nx}" x2="${nx}" y1="0" y2="${H}" stroke="var(--fg)" stroke-width="1.5"/>
    <circle cx="${nx}" cy="${H - 6 - f((hh < 4 ? hh + 24 : hh) + mm / 60) * (H - 14)}" r="4.2" fill="var(--fg)"/>
    ${ticks}
  </svg>`;
}

function legendHtml(title, extra = '') {
  const T = P.transit;
  const row = (svg, label, sub = '') => `<div class="lg-row">${svg}<div class="lg-label">${label}${sub ? `<span>${sub}</span>` : ''}</div></div>`;
  const line = (c, w, extra = '') => `<svg viewBox="0 0 46 14" class="lg-sw"><line x1="3" y1="7" x2="43" y2="7" stroke="${c}" stroke-width="${w}" stroke-linecap="round" ${extra}/></svg>`;
  const centre = (c, w, dash) => `<svg viewBox="0 0 46 14" class="lg-sw"><line x1="3" y1="7" x2="43" y2="7" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/><line x1="5" y1="7" x2="41" y2="7" stroke="#fff" stroke-width="1.4" ${dash ? 'stroke-dasharray="2.5 3.5"' : 'opacity="0.6"'}/></svg>`;
  const veh = `<svg viewBox="0 0 46 14" class="lg-sw"><circle cx="12" cy="7" r="4" fill="${T.frequent}" stroke="${P.vehicleStroke || T.frequent}" stroke-width="1.5"/><circle cx="32" cy="7" r="4" fill="${T.brt}"/><circle cx="32" cy="7" r="6.2" fill="none" stroke="${P.glow ? '#FFB347' : '#F08A24'}" stroke-width="1.6"/></svg>`;
  return `<div class="lg-title">${title}</div>
    ${row(centre(T.brt, 7), 'Transitway', 'bus rapid transit')}
    ${row(centre(T.otrain, 6.5, true), 'O-Train', 'Bayview – Greenboro')}
    ${row(line(T.frequent, 4.2), 'Frequent bus')}
    ${row(line(T.local, 2.2), 'Local bus')}
    ${row(line(T.sto, 4), 'STO · Gatineau', 'separate agency')}
    ${row(line(T.proposed_rail, 4, 'stroke-dasharray="6 5" stroke-linecap="butt"'), 'Proposed (2010)', 'rail tunnel · Rapibus')}
    ${extra || row(veh, 'Vehicles', 'ring = crowded')}`;
}
