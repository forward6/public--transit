// OTC visual prototype — scene definitions (camera, labels, HUD content).
// All numbers in the HUD are illustrative placeholders, not simulation output.

const OTTAWA_DISTRICTS = [
  ['Centretown', [-75.6935, 45.4100]],
  ['ByWard Market', [-75.6905, 45.4290]],
  ['Lowertown', [-75.6835, 45.4335]],
  ['Sandy Hill', [-75.6765, 45.4228]],
  ['The Glebe', [-75.6895, 45.4012]],
  ['Old Ottawa South', [-75.6835, 45.3915]],
  ['Old Ottawa East', [-75.6735, 45.4085]],
  ['Hintonburg', [-75.7265, 45.4012]],
  ['Westboro', [-75.7575, 45.3895]],
  ['Little Italy', [-75.7115, 45.4045]],
  ['LeBreton Flats', [-75.7175, 45.4152]],
  ['Vanier', [-75.6625, 45.4370]],
  ['New Edinburgh', [-75.6865, 45.4435]],
  ['Rockcliffe Park', [-75.6705, 45.4490]],
  ['Overbrook', [-75.6535, 45.4245]],
  ['Alta Vista', [-75.6495, 45.3945]],
  ['Carlington', [-75.7375, 45.3800]],
  ['Civic Hospital', [-75.7225, 45.3935]],
  ['Riverview', [-75.6625, 45.4005]],
  ['Elmvale Acres', [-75.6355, 45.4040]],
  ['Mechanicsville', [-75.7310, 45.4085]],
];
const GATINEAU_DISTRICTS = [
  ['Vieux-Hull', [-75.7215, 45.4300]],
  ['Wrightville', [-75.7440, 45.4425]],
  ['Mont-Bleu', [-75.7570, 45.4545]],
  ['Val-Tétreau', [-75.7560, 45.4290]],
  ['Lac-Beauchamp', [-75.6320, 45.4800]],
];

const DAY_SKIP = ['Mont-Bleu'];
const dayLabels = [
  { kind: 'city', text: 'OTTAWA', at: [-75.6600, 45.3985], size: 30 },
  { kind: 'city', text: 'GATINEAU', at: [-75.7520, 45.4520], size: 26 },
  ...OTTAWA_DISTRICTS.filter(([t]) => !['Riverview', 'Alta Vista', 'Elmvale Acres'].includes(t)).map(([t, at]) => ({ kind: 'district', text: t, at })),
  ...GATINEAU_DISTRICTS.filter(([t]) => !DAY_SKIP.includes(t)).map(([t, at]) => ({ kind: 'district', text: t, at })),
  { kind: 'water', text: 'Ottawa River', at: [-75.7660, 45.4075], rotate: -38 },
  { kind: 'water', text: 'Rivière des Outaouais', at: [-75.6990, 45.4435], rotate: -14 },
  { kind: 'water', text: 'Rideau River', at: [-75.6705, 45.3960], rotate: -72 },
  { kind: 'water', text: 'Rideau Canal', at: [-75.6800, 45.4064], rotate: -77, size: 12 },
  { kind: 'water', text: 'Lac Leamy', at: [-75.7236, 45.4517], size: 12 },
  { kind: 'water', text: "Dow's Lake", at: [-75.7016, 45.3946], size: 11 },
  { kind: 'water', text: 'Rivière Gatineau', at: [-75.7180, 45.4720], rotate: -50, size: 12 },
  { kind: 'landmark', text: 'Parliament Hill', at: [-75.7005, 45.4243] },
  { kind: 'landmark', text: 'Carleton University', at: [-75.6975, 45.3820] },
  { kind: 'landmark', text: 'Experimental Farm', at: [-75.7140, 45.3845] },
  { kind: 'station', text: "Tunney's Pasture", at: [-75.73548, 45.40364], dx: 8, dy: -14 },
  { kind: 'station', text: 'Bayview', at: [-75.7216, 45.40905], dx: 10, dy: 12 },
  { kind: 'station', text: 'LeBreton', at: [-75.71359, 45.41253], dx: -6, dy: -15 },
  { kind: 'station', text: 'Campus', at: [-75.6832, 45.42099], dx: 30, dy: 10 },
  { kind: 'station', text: 'Hurdman', at: [-75.6646, 45.41217], dx: 6, dy: 16 },
  { kind: 'station', text: 'Lees', at: [-75.67048, 45.41634], dx: 0, dy: -15 },
  { kind: 'station', text: 'St-Laurent', at: [-75.63848, 45.42059], dx: 0, dy: -15 },
  { kind: 'station', text: 'Westboro', at: [-75.75228, 45.39648], dx: 0, dy: 15 },
  { kind: 'station', text: 'Billings Bridge', at: [-75.67648, 45.38478], dx: 46, dy: 0 },
  { kind: 'station', text: 'Carling', at: [-75.70921, 45.39689], dx: 32, dy: 0 },
  { kind: 'station', text: 'Carleton', at: [-75.69595, 45.38565], dx: 36, dy: 0 },
  { kind: 'station', text: 'Mackenzie King', at: [-75.69015, 45.424], dx: 50, dy: -6 },
];

const nightLabels = [
  { kind: 'landmark', text: 'Parliament Hill', at: [-75.7005, 45.4243] },
  { kind: 'water', text: 'Ottawa River · Rivière des Outaouais', at: [-75.7080, 45.4330], size: 15 },
  { kind: 'water', text: 'Rideau Canal Skateway', at: [-75.6915, 45.4232], size: 13 },
  { kind: 'district', text: 'Centretown', at: [-75.6975, 45.4170] },
  { kind: 'district', text: 'ByWard Market', at: [-75.6920, 45.4282] },
  { kind: 'district', text: 'Vieux-Hull', at: [-75.7190, 45.4295] },
  { kind: 'street', text: 'ALBERT ST', at: [-75.7008, 45.41980], dx: -78, dy: 0 },
  { kind: 'street', text: 'SLATER ST', at: [-75.7012, 45.41892], dx: 74, dy: 0 },
  { kind: 'street', text: 'WELLINGTON ST', at: [-75.7008, 45.42232], dx: -40, dy: 0 },
  { kind: 'station', text: 'Mackenzie King', at: [-75.69015, 45.424], dx: 0, dy: -16 },
];


const planLabels = [
  { kind: 'city', text: 'GATINEAU', at: [-75.7560, 45.4505], size: 24 },
  { kind: 'city', text: 'OTTAWA', at: [-75.6930, 45.4050], size: 24 },
  ...OTTAWA_DISTRICTS.filter(([t]) => ['Centretown', 'ByWard Market', 'Sandy Hill', 'Hintonburg', 'Little Italy', 'Lowertown', 'New Edinburgh', 'Westboro', 'Civic Hospital'].includes(t)).map(([t, at]) => ({ kind: 'district', text: t, at })),
  ...GATINEAU_DISTRICTS.filter(([t]) => t !== 'Lac-Beauchamp').map(([t, at]) => ({ kind: 'district', text: t, at })),
  { kind: 'water', text: 'Ottawa River · Rivière des Outaouais', at: [-75.7080, 45.4395], rotate: -18 },
  { kind: 'water', text: 'Lac Leamy', at: [-75.7236, 45.4517], size: 12 },
  { kind: 'landmark', text: 'Parliament Hill', at: [-75.7005, 45.4243] },
  { kind: 'landmark', text: 'Prince of Wales Bridge', at: [-75.7262, 45.4146], dx: -92, dy: 0 },
  { kind: 'draft', text: 'Bayview', at: [-75.7216, 45.40905], dx: 44, dy: 10 },
  { kind: 'draft', text: 'Taché <span>new</span>', at: [-75.731215, 45.420934], dx: -54, dy: 0 },
  { kind: 'draft', text: 'Montcalm <span>new · origin</span>', at: [-75.729727, 45.428701], dx: -94, dy: 0 },
  { kind: 'draft', text: 'Saint-Joseph <span>new</span>', at: [-75.728374, 45.438093], dx: 76, dy: 0 },
  { kind: 'station', text: "Tunney's Pasture", at: [-75.73548, 45.40364], dx: 0, dy: 15 },
  { kind: 'station', text: 'LeBreton', at: [-75.71359, 45.41253], dx: 4, dy: 15 },
  { kind: 'station', text: 'Mackenzie King', at: [-75.69015, 45.424], dx: 52, dy: 0 },
];

const bloomLegend = `
  <div class="tl-title">Travel-time bloom · from Montcalm <span>weekday 08:00</span></div>
  <div class="bloom-legend">
    <div class="bl-ramp">
      <div><i style="background:#0B6E78"></i>10 min</div>
      <div><i style="background:#1F9A94"></i>20 min</div>
      <div><i style="background:#6CC4A4"></i>30 min</div>
      <div><i style="background:#C9E7B8"></i>45 min</div>
    </div>
    <div class="bl-keys">
      <div><svg viewBox="0 0 40 10"><line x1="2" y1="5" x2="38" y2="5" stroke="#253552" stroke-width="1.8" stroke-dasharray="4 4"/></svg>30-min reach today</div>
      <div><svg viewBox="0 0 40 14"><path d="M12 2 L20 2 L24 7 L20 12 L12 12 L8 7 Z" fill="#6CC4A4" stroke="#E39A12" stroke-width="2"/></svg>newly within 30 min</div>
    </div>
  </div>`;

const scorecard = (rows, foot) => `
  <div class="panel-title">Capital Scorecard <span class="chip">Q4 2010</span></div>
  ${rows.map((r) => `
    <div class="sc-row">
      <div class="sc-head"><span class="sc-name">${r.name}</span><span class="sc-val">${r.value}<em class="${r.trend.startsWith('▲') ? 'up' : r.trend.startsWith('▼') ? 'down' : ''}">${r.trend}</em></span></div>
      <div class="sc-sub">${r.sub}</div>
      <div class="sc-bar"><i style="width:${r.pct}%;background:${r.color}"></i><b style="left:${r.goal}%"></b></div>
    </div>`).join('')}
  <div class="sc-foot">${foot}</div>`;

const SC_ROWS = [
  { name: 'Coverage', sub: 'Urban residents ≤ 400 m from a stop', value: '82%', trend: '▲0.4', pct: 82, goal: 90, color: 'var(--good)' },
  { name: 'Accessibility', sub: 'Step-free stations · Para trips denied 6.1%', value: '41%', trend: '—', pct: 41, goal: 70, color: 'var(--warn)' },
  { name: 'Cost', sub: 'Fare cost recovery', value: '52%', trend: '▼0.8', pct: 52, goal: 55, color: 'var(--ok)' },
  { name: 'Ridership', sub: 'Regional transit mode share', value: '13.5%', trend: '▲0.1', pct: 54, goal: 60, color: 'var(--ok)' },
  { name: 'Public support', sub: 'Approval of the Commission', value: '54%', trend: '▼3', pct: 54, goal: 60, color: 'var(--warn)' },
];

const loadProfile = (vals, names, hi) => `
  <div class="lp">
    ${vals.map((v, i) => `<div class="lp-col"><i style="height:${v}%" class="${v > 88 ? 'hot' : v > 70 ? 'warm' : ''}"></i><span>${names[i]}</span></div>`).join('')}
  </div>`;

export const SCENES = {
  // ---------------------------------------------------------------- DAY
  day: {
    theme: 'day',
    palette: 'winterDay',
    camera: { center: [-75.7000, 45.4155], zoom: 12.95, pitch: 42, bearing: -14 },
    style: { selected: 'Transitway — downtown (Albert/Slater)' },
    snow: { count: 220, maxR: 2.4, alpha: 0.95, shadow: true, bokeh: 6 },
    labels: dayLabels,
    callouts: [
      { at: [-75.7012, 45.4190], tone: 'warn', dir: 'down', html: '<b>Bus wall</b> · 172 buses/h<br><span>Albert & Slater at capacity</span>' },
    ],
    hud: {
      date: 'Monday 6 December 2010',
      time: '08:14',
      weather: '−9 °C · light snow',
      speed: 'play',
      tool: 'inspect',
      badges: { council: 2, news: 5 },
      timeNow: '08:14',
      kpis: [
        { label: 'Treasury', value: '$18.4 M' },
        { label: 'Boardings today', value: '212,940' },
        { label: 'Approval', value: '54%', delta: '▼3' },
        { label: 'Gatineau (STO)', value: 'Cordial', dot: '#0B97A3' },
        { label: 'Political capital', value: '◆ 12' },
      ],
      left: scorecard(SC_ROWS, '<b>Term goal</b> · Mode share 15% by Oct 2014<br><span>2 of 5 council goals on track</span>'),
      right: `
        <div class="ins-head">
          <div class="ins-badge" style="background:var(--brt)">BRT</div>
          <div><div class="ins-title">Downtown Transitway</div><div class="ins-sub">Albert &amp; Slater Streets · eastbound + westbound</div></div>
        </div>
        <div class="pill pill-hot">● At capacity · AM peak</div>
        <div class="big">
          <div class="big-num">172<span> buses / hour</span></div>
          <div class="cap"><i style="width:95.5%"></i><b style="left:100%"></b></div>
          <div class="cap-label"><span>0</span><span>practical capacity ≈ 180</span></div>
        </div>
        <div class="grid4">
          <div><b>8 km/h</b><span>avg. bus speed</span></div>
          <div><b>64%</b><span>on time</span></div>
          <div><b>11.2k</b><span>riders this hour</span></div>
          <div><b>38%</b><span>trips crowded</span></div>
        </div>
        <div class="sec">Load along the Transitway · eastbound</div>
        ${loadProfile([34, 52, 71, 93, 98, 90, 64, 47, 38], ["Tunney's", 'Bayview', 'LeBreton', 'Kent', 'Bank', 'Mackenzie K.', 'Campus', 'Lees', 'Hurdman'])}
        <div class="voice">
          <div class="voice-q">“It’s faster to walk from Bank to Kent than to wait for the 95 to clear the jam.”</div>
          <div class="voice-who"><i class="av">M</i> Marc · Orléans → Tunney’s Pasture · <span class="mood bad">frustrated</span></div>
        </div>
        <div class="sec">Options</div>
        <div class="opts">
          <button><b>Extend bus lanes</b><span>$1.8 M · 3 months · council: likely ✓</span></button>
          <button><b>Re-route peak expresses</b><span>no capital · −4% downtown buses</span></button>
          <button class="primary"><b>Fund rail tunnel study</b><span>$12 M · funding pledged · council vote</span></button>
        </div>`,
      news: {
        time: '07:58',
        headline: 'Snow and a wall of buses: downtown commute crawls along Albert and Slater',
        meta: 'Transit · 4 more stories ▸',
      },
      legendTitle: 'Network · December 2010',
    },
  },

  // ---------------------------------------------------------------- NIGHT
  night: {
    theme: 'night',
    palette: 'winterNight',
    camera: { center: [-75.6972, 45.4209], zoom: 15.55, pitch: 72, bearing: 58.4 },
    style: { windows: true, flow: true, buildingsOnTop: true },
    snow: { count: 650, maxR: 2.2, alpha: 0.8, bokeh: 14 },
    labels: nightLabels,
    callouts: [
      { at: [-75.69955, 45.42028], tone: 'hot', dir: 'right', html: '<b>14 min</b> for 1.6 km<br><span>Marc’s 95, stuck at Bank St</span>' },
    ],
    hud: {
      date: 'Thursday 16 December 2010',
      time: '17:42',
      weather: '−18 °C · clear · wind chill −27',
      speed: 'play',
      tool: 'layers',
      badges: { council: 3, news: 2 },
      timeNow: '17:42',
      kpis: [
        { label: 'Treasury', value: '$17.9 M' },
        { label: 'Boardings today', value: '301,552' },
        { label: 'Approval', value: '51%', delta: '▼3' },
        { label: 'Gatineau (STO)', value: 'Strained', dot: '#F5A524' },
        { label: 'Political capital', value: '◆ 9' },
      ],
      toast: `<div class="toast-tag">STO · Gatineau</div>
        <div class="toast-text"><b>STO board votes to move 6 routes off Rideau Street to Wellington.</b> Ottawa councillors are split; Gatineau wants an answer before its budget vote.</div>
        <div class="toast-btns"><button class="primary">Negotiate</button><button>Object</button><button>Defer</button></div>`,
      left: `
        <div class="panel-title">Overlays <span class="chip">Evening peak</span></div>
        <div class="ov">
          <div class="ov-row on"><i></i>Passenger flow<span>ribbon width = riders / h</span></div>
          <div class="ov-row on"><i></i>Crowding<span>amber ring = standing room only</span></div>
          <div class="ov-row"><i></i>Public opinion</div>
          <div class="ov-row"><i></i>Coverage &amp; walk-sheds</div>
          <div class="ov-row"><i></i>Travel-time bloom</div>
          <div class="ov-row"><i></i>Equity lens</div>
        </div>
        <div class="sec">Flow scale</div>
        <div class="flowscale">
          <div><svg viewBox="0 0 60 20"><line x1="4" y1="10" x2="56" y2="10" stroke="var(--brt)" stroke-width="2" stroke-linecap="round"/></svg><span>500</span></div>
          <div><svg viewBox="0 0 60 20"><line x1="4" y1="10" x2="56" y2="10" stroke="var(--brt)" stroke-width="6" stroke-linecap="round"/></svg><span>2,500</span></div>
          <div><svg viewBox="0 0 60 20"><line x1="4" y1="10" x2="56" y2="10" stroke="var(--brt)" stroke-width="12" stroke-linecap="round"/></svg><span>10,000+</span></div>
        </div>
        <div class="sc-foot"><b>Downtown cordon</b> · 61% of inbound peak trips by transit<br><span>Albert &amp; Slater carry 4 of 10 of them</span></div>`,
      right: `
        <div class="panel-title">Follow a rider</div>
        <div class="rider">
          <i class="av big">M</i>
          <div><div class="ins-title">Marc, 44</div><div class="ins-sub">Public servant · Tunney’s Pasture → Orléans</div></div>
          <div class="mood bad">frustrated</div>
        </div>
        <div class="trip">
          <div class="tr"><time>17:05</time><span>Leaves the office at Tunney’s Pasture</span></div>
          <div class="tr warn"><time>17:09</time><span>Waits 6 min in an unheated shelter <em>−27 wind chill</em></span></div>
          <div class="tr"><time>17:15</time><span>Boards the 95 eastbound · standing</span></div>
          <div class="tr hot"><time>17:28</time><span>Bus queue on Albert St <em>14 min for 1.6 km</em></span></div>
          <div class="tr now"><time>17:42</time><span><b>Now</b> · approaching Mackenzie King</span></div>
          <div class="tr ghost"><time>18:24</time><span>Expected home · scheduled 18:02</span></div>
        </div>
        <div class="grid4 g3">
          <div><b>38</b><span>satisfaction ▼6</span></div>
          <div><b>41%</b><span>may drive tomorrow</span></div>
          <div><b>Ward 1</b><span>Orléans · councillor wavering</span></div>
        </div>
        <div class="voice">
          <div class="voice-q">“Fifty minutes to get home, and half of it is downtown.”</div>
        </div>`,
      news: {
        time: '17:20',
        headline: 'Deep freeze: evening riders wait in −27 wind chill as downtown buses bunch',
        meta: 'Transit · Gatineau · 2 more stories ▸',
      },
      legendTitle: 'Network · evening peak',
    },
  },

  // ---------------------------------------------------------------- PLAN (summer)
  plan: {
    theme: 'day',
    palette: 'summerDay',
    camera: { center: [-75.7150, 45.4205], zoom: 13.45, pitch: 32, bearing: -6 },
    style: { muted: true, noVehicles: true, bloom: true, draft: true },
    labels: planLabels,
    callouts: [],
    hud: {
      date: 'Tuesday 14 June 2011',
      time: '10:20',
      weather: '24 °C · sunny',
      speed: 'pause',
      tool: 'route',
      badges: { council: 1, news: 3 },
      timeNow: '10:20',
      kpis: [
        { label: 'Treasury', value: '$22.6 M' },
        { label: 'Boardings today', value: '118,406' },
        { label: 'Approval', value: '57%', delta: '▲2' },
        { label: 'Gatineau (STO)', value: 'Wary', dot: '#E08A1E' },
        { label: 'Political capital', value: '◆ 15' },
      ],
      left: `
        <div class="panel-title">Draw a line <span class="chip">Draft · paused</span></div>
        <div class="seg">
          <button>Bus</button><button>BRT</button><button class="on">O-Train</button><button>LRT</button><button>Rail</button>
        </div>
        <div class="kv"><span>Alignment</span><b>Existing rail corridor</b></div>
        <div class="kv"><span>River crossing</span><b>Prince of Wales Bridge <em>disused · rehab needed</em></b></div>
        <div class="kv"><span>Length</span><b>3.7 km · 4 stations (1 existing)</b></div>
        <div class="kv"><span>Service</span><b>Every 12 min · 6:00–23:00</b></div>
        <div class="kv"><span>Fleet</span><b>2 diesel trainsets <em>shared with the O-Train</em></b></div>
        <div class="sec">Edit</div>
        <div class="chips">
          <span class="on">Snap to corridor</span><span>Auto-place stations</span><span>Add branch</span><span>Undo</span>
        </div>
        <div class="sc-foot"><b>Tip</b> · drag the amber handles to re-route; stations snap to walkable street access.</div>`,
      right: `
        <div class="ins-head">
          <div class="ins-badge" style="background:var(--good)">DRAFT</div>
          <div><div class="ins-title">O-Train to Hull</div><div class="ins-sub">Bayview → Hull via the Prince of Wales Bridge</div></div>
        </div>
        <div class="big">
          <div class="big-num">+9,800<span> riders / weekday</span></div>
        </div>
        <div class="grid4">
          <div><b>$165 M</b><span>capital · P50<br>range 140–210</span></div>
          <div><b>$5.2 M</b><span>operating / yr</span></div>
          <div><b>3–4 yrs</b><span>to open</span></div>
          <div><b>+0.6 pt</b><span>frequent-network coverage</span></div>
        </div>
        <div class="sec">Travel time · AM peak</div>
        <div class="tt">
          <div><span>Montcalm → Tunney’s Pasture</span><s>27</s><b>14 min</b></div>
          <div><span>Montcalm → Carleton University</span><s>46</s><b>21 min</b></div>
          <div><span>Jobs within 30 min of Montcalm</span><s>168k</s><b>241k</b></div>
        </div>
        <div class="sec">Approvals needed</div>
        <div class="appr">
          <div><span>Ottawa Transit Commission</span><b class="st ok">likely</b></div>
          <div><span>Ottawa council <em>11 yes · 6 no · 7 undecided</em></span><b class="st warn">close</b></div>
          <div><span>Gatineau council &amp; STO <em>“Rapibus comes first”</em></span><b class="st hot">opposed</b></div>
          <div><span>NCC <em>shoreline lands, bridge heritage</em></span><b class="st warn">consult</b></div>
          <div><span>Ontario · Quebec · federal funding</span><b class="st">window 2012</b></div>
        </div>
        <div class="opts row">
          <button><b>Commission a study</b><span>$2.5 M · 9 months</span></button>
          <button class="primary"><b>Send to Commission</b><span>needs ◆ 6</span></button>
        </div>`,
      news: {
        time: '09:45',
        headline: 'Gatineau cool on rail-bridge idea: “Rapibus comes first,” says STO chair',
        meta: 'Gatineau · Transit · 2 more stories ▸',
      },
      bottomCenter: bloomLegend,
      legendTitle: 'Network · June 2011',
      legendExtra: `<div class="lg-row"><svg viewBox="0 0 46 14" class="lg-sw"><line x1="3" y1="7" x2="43" y2="7" stroke="#fff" stroke-width="9" stroke-linecap="round"/><line x1="3" y1="7" x2="43" y2="7" stroke="var(--good)" stroke-width="5.5" stroke-linecap="round"/><line x1="5" y1="7" x2="41" y2="7" stroke="#fff" stroke-width="1.6" stroke-dasharray="3 3"/></svg><div class="lg-label">Your draft<span>not yet approved</span></div></div>`,
    },
  },
};
