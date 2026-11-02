import {
  LINE_COLORS, LINE_HEADWAYS, PROJECT_COSTS, type Corridor, type Edit, type GameEvent, type GameState, type ItemEffects, type LineDesign,
  type LineMode, type LineStation, type NetPattern, type NetRoute, type NetStop, type Network, type Procurement, type Project, type ProjectEstimate,
  type ProjectForecast, type Structure, type Zone,
} from '@otc/shared';
import { addDays, addMonths, payLine, toDate } from './economy';
import { currentHeadways, mainPatterns, periodsFromHeadways } from './plan';
import { rand } from './weather';
import { tableInto } from './agenda';

/**
 * Big projects (M8, PLAN §12): rapid-transit lines from proposal to opening day.
 *
 * You draw a line (light rail or a Transitway busway): stations in order, each stretch on the
 * surface, elevated or in a tunnel. It gets a cost and a timeline from per-km and per-station costs
 * (2011 dollars, calibrated on the Confederation Line's 2012 budget) and a forecast from the demand
 * model. Then:
 * 1. council votes to fund design and the environmental assessment;
 * 2. design: at the end, Ontario and the federal government each decide whether to pay up to a
 *    third (more likely for a line with more riders per dollar), the NCC reviews alignments on its
 *    parkways, and you choose how to build it: a public build (the city carries cost overruns) or a
 *    public-private partnership (a premium, but the consortium carries most of the risk);
 * 3. procurement: the bids come in and council votes to award the contract;
 * 4. construction: money goes out month by month (the city's share from the capital reserve, then
 *    borrowing); neighbourhoods along the line put up with detours and noise; setbacks happen:
 *    overruns (you choose how to deal with them), delays, a sinkhole in a tunnel;
 *    5. testing, then opening day: the line joins the network (the demand model measures it), with
 *    a smooth or a rough first few weeks.
 * Lines cost money to run once open (light rail by the line; busway buses by the bus-hour).
 */

export interface ProjectWorld {
  zones: Zone[];
  wardOf?: number[];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round1 = (x: number) => Math.round(x * 10) / 10;
const KX = 78.3; // km per degree of longitude at 45.4° N
const KY = 111.1;
const distM = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * KX, (a[1] - b[1]) * KY) * 1000;
const monthsBetween = (a: string, b: string) => (toDate(b).getTime() - toDate(a).getTime()) / (30.44 * 86_400_000);

// ------------------------------------------------------------------------------------------ design

const REUSE_STATION_M = 200;
const NAME_FROM_STOP_M = 350;

/** A station where you tap: an existing station nearby (so riders can transfer), or a new one named after the nearest stop. */
export function stationAt(lon: number, lat: number, stops: NetStop[], id: string): LineStation {
  let near: NetStop | undefined;
  let nd = Infinity;
  let station: NetStop | undefined;
  let sd = REUSE_STATION_M;
  for (const s of stops) {
    const d = distM([lon, lat], [s.lon, s.lat]);
    if (s.kind === 'station' && d < sd) (sd = d), (station = s);
    if (d < nd) (nd = d), (near = s);
  }
  if (station) return { id: station.id, name: station.name, lon: station.lon, lat: station.lat, existing: true };
  const name = near && nd < NAME_FROM_STOP_M ? near.name : 'New station';
  return { id, name, lon: +lon.toFixed(6), lat: +lat.toFixed(6) };
}

/** Metres between consecutive stations. */
export function stretches(design: LineDesign): number[] {
  return design.stations.slice(1).map((s, i) => distM([design.stations[i]!.lon, design.stations[i]!.lat], [s.lon, s.lat]) * 1.06);
}

/** Seconds to run a stretch: accelerate, cruise, brake (or never reach cruising speed on short ones). */
export function runSeconds(metres: number, structure: Structure, mode: LineMode): number {
  const c = PROJECT_COSTS[mode];
  const v = c.speed[structure] / 3.6;
  const a = c.accel;
  const dAccel = (v * v) / a; // accelerating and braking together
  return Math.round(metres >= dAccel ? metres / v + v / a : 2 * Math.sqrt(metres / a));
}

/** A station is underground between two tunnelled stretches (portal stations are at grade), elevated beside a viaduct. */
export function stationStructure(design: LineDesign, i: number): Structure {
  const sides = [design.structure[i - 1], design.structure[i]].filter(Boolean) as Structure[];
  if (sides.length && sides.every((x) => x === 'tunnel')) return 'tunnel';
  return sides.includes('elevated') ? 'elevated' : 'surface';
}

/** Trains needed at the busiest headway (round trip with turnaround, plus spares). */
function trainsNeeded(runMin: number, headways: LineDesign['headways']): number {
  const h = Math.min(...Object.values(headways).filter((x) => x > 0));
  if (!Number.isFinite(h)) return 0;
  return Math.ceil(((2 * runMin + 8) / h) * 1.15);
}

/** Cost, time and running cost of a line, in 2011 dollars (× the cost index of the day). */
export function estimateLine(design: LineDesign, costIndex = 1): ProjectEstimate {
  const c = PROJECT_COSTS[design.mode];
  const m = stretches(design);
  const lengthKm = m.reduce((a, b) => a + b, 0) / 1000;
  const km = (k: Structure) => m.reduce((a, x, i) => a + (design.structure[i] === k ? x : 0), 0) / 1000;
  const tunnelKm = km('tunnel');
  const elevatedKm = km('elevated');
  const surfaceKm = lengthKm - tunnelKm - elevatedKm;
  const st = design.stations.map((_, i) => stationStructure(design, i));
  const runSec = m.reduce((a, x, i) => a + runSeconds(x, design.structure[i] ?? 'surface', design.mode), 0) + Math.max(0, design.stations.length - 2) * c.dwell;
  const runMin = runSec / 60;
  const vehicles = design.mode === 'lrt' ? trainsNeeded(runMin, design.headways) : 0;
  const guideway = surfaceKm * c.guideway.surface + elevatedKm * c.guideway.elevated + tunnelKm * c.guideway.tunnel;
  const stations = st.reduce((a, k) => a + c.station[k], 0);
  const veh = vehicles * c.train;
  const depot = c.depot;
  const hard = guideway + stations + veh + depot;
  const soft = hard * PROJECT_COSTS.softShare;
  const contingency = (hard + soft) * PROJECT_COSTS.contingencyShare;
  const k = costIndex;
  const cost = { guideway: guideway * k, stations: stations * k, vehicles: veh * k, depot: depot * k, soft: soft * k, contingency: contingency * k,
    total: (hard + soft + contingency) * k };
  const lrt = design.mode === 'lrt';
  const months = {
    design: Math.round(clamp((lrt ? 12 : 9) + 1.5 * tunnelKm + 0.2 * lengthKm, 9, 22)),
    procurement: lrt ? 10 : 6,
    construction: Math.round(lrt ? 22 + 1.6 * lengthKm + 1.5 * elevatedKm + 8 * tunnelKm : 14 + 1.4 * lengthKm + 1.5 * elevatedKm + 6 * tunnelKm),
    testing: lrt ? 6 : 1,
  };
  return {
    lengthKm: round1(lengthKm), tunnelKm: round1(tunnelKm), elevatedKm: round1(elevatedKm), stations: design.stations.length,
    undergroundStations: st.filter((x) => x === 'tunnel').length, vehicles, runMin: round1(runMin), cost, months,
    opsPerYear: (lengthKm * c.opsPerKm + vehicles * c.opsPerTrain) * k,
  };
}

/** The edit that puts the line into service: a two-way route, its new stations, its right of way. */
export function lineEdit(design: LineDesign, id: string): Edit {
  const lrt = design.mode === 'lrt';
  const c = PROJECT_COSTS[design.mode];
  const m = stretches(design);
  const n = design.stations.length;
  const dist = [0];
  for (const x of m) dist.push(dist.at(-1)! + x);
  const shape = design.stations.map((s) => [s.lon, s.lat] as [number, number]);
  const runTimes = m.map((x, i) => runSeconds(x, design.structure[i] ?? 'surface', design.mode));
  const first = design.stations[0]!;
  const last = design.stations[n - 1]!;
  const pa: NetPattern = {
    id: `${id}-a`, routeId: id, direction: 0, headsign: last.name, stops: design.stations.map((s) => s.id),
    stopDist: dist.map((d) => Math.round(d)), shape, runTimes, dwell: design.stations.map((_, i) => (i === 0 || i === n - 1 ? 0 : c.dwell)),
  };
  const total = dist.at(-1)!;
  const pb: NetPattern = {
    ...pa, id: `${id}-b`, direction: 1, headsign: first.name, stops: [...pa.stops].reverse(), stopDist: dist.map((d) => Math.round(total - d)).reverse(),
    shape: [...shape].reverse(), runTimes: [...runTimes].reverse(), dwell: [...pa.dwell].reverse(),
  };
  const provenance = { source: 'Your project', confidence: 'high' as const, verified: false, note: `${design.name}: built in the game.` };
  const route: NetRoute = {
    id, agency: 'octranspo', shortName: design.shortName, longName: `${design.name}: ${first.name} ↔ ${last.name}`,
    mode: lrt ? 'rail' : 'brt', class: lrt ? 'otrain' : 'transitway', color: design.color, patterns: [pa.id, pb.id],
    weekday: periodsFromHeadways(design.headways), offPeakFactor: 1, provenance,
  };
  const stops: NetStop[] = design.stations.filter((s) => !s.existing).map((s) => ({
    id: s.id, name: s.name, lon: s.lon, lat: s.lat, kind: 'station', agencies: ['octranspo'], provenance,
  }));
  const corridor: Corridor = { id: `${id}-row`, name: design.name, kind: lrt ? 'rail' : 'busway', agency: 'octranspo', lines: [shape], color: design.color, provenance };
  return { kind: 'add', route, patterns: [pa, pb], stops, corridor };
}

/** A new line's starting design (no stations yet). */
export function newDesign(mode: LineMode, n: number): LineDesign {
  return { mode, name: `Line ${n}`, shortName: mode === 'lrt' ? `L${n}` : `T${n}`, color: LINE_COLORS[(n - 1) % LINE_COLORS.length]!, stations: [], structure: [],
    headways: { ...LINE_HEADWAYS[mode] } };
}

// ------------------------------------------------------------------------------------------ proposals and votes

const news = (s: GameState, data: GameEvent['data']) =>
  s.events.push({ id: `project-${s.date}-${s.events.length}`, kind: 'project', date: s.date, decision: false, data });
const decide = (s: GameState, kind: GameEvent['kind'], data: GameEvent['data']) =>
  s.events.push({ id: `${kind}-${s.date}-${s.events.length}`, kind, date: s.date, decision: true, data });

export const projectOf = (s: GameState, id: string) => s.projects?.find((p) => p.id === id);

/**
 * The riders a line is judged on: the trips it adds to transit, or a quarter of the riders it
 * carries (relief for crowded corridors, which the model doesn't price), whichever is more.
 */
export const ridersValue = (f?: ProjectForecast) => (f ? Math.max(f.newRiders, f.boardings / 4) : 3000);

/** The city's share if the partners each pay the third they usually do: what council weighs at first. */
const likelyCityShare = (total: number) => (total / 3) * (1 - PROJECT_COSTS.devCharges);

/** What the city pays from its own budget: the price less the partners' money and development charges. */
export function cityShare(p: Project, price = p.budget): number {
  return Math.max(0, price - p.funding.province - p.funding.federal) * (1 - PROJECT_COSTS.devCharges);
}

/** The new debt service a year the city's share will cost (30-year borrowing at 4.5%). */
export function yearlyDebtService(city: number): number {
  const r = 0.045;
  return city * (r / (1 - (1 + r) ** -30));
}

/** Ask a government that said no to think again (Political Capital; once a year each). */
export function askAgain(prev: GameState, projectId: string, gov: 'province' | 'federal'): GameState {
  const p0 = projectOf(prev, projectId);
  if (!p0 || p0.funding[`${gov}Status`] !== 'declined' || !prev.council || prev.council.capital < ASK_COST) return prev;
  if (p0.phase === 'open' || p0.phase === 'cancelled' || p0.phase === 'shelved') return prev;
  const last = p0.funding.asked?.[gov];
  if (last && addMonths(last, 12) > prev.date) return prev;
  const s = structuredClone(prev);
  const p = projectOf(s, projectId)!;
  s.council!.capital -= ASK_COST;
  (p.funding.asked ??= {})[gov] = s.date;
  const yes = rand(s.seed, `${p.id}:ask:${gov}:${s.date}`) < fundingChance(p) * 0.6;
  const amount = yes ? Math.min(600e6 * s.costIndex, Math.round(p.estimate.cost.total / 3 / 1e6) * 1e6) : 0;
  if (yes) {
    p.funding[gov] = amount;
    p.funding[`${gov}Status`] = 'committed';
  }
  news(s, { what: 'funding', project: p.id, name: p.design.name, gov, amount, again: 1 });
  return s;
}
export const ASK_COST = 10;

/** How likely a government is to pay its third: more riders per dollar, likelier. */
function fundingChance(p: Project): number {
  const perM = ridersValue(p.forecast) / Math.max(1, p.estimate.cost.total / 1e6);
  return clamp(0.2 + 0.07 * perM, 0.15, 0.85);
}

/**
 * Bus routes that mostly run alongside a line: with the line open, half their buses can go (or the
 * route, if it hardly leaves the line), and the money with them. Staff list them when the line is
 * proposed; you decide on opening day.
 */
export function busRework(network: Network, design: LineDesign, lineId: string): Project['rework'] {
  const pts = design.stations.map((x) => [x.lon, x.lat] as [number, number]);
  if (pts.length < 2) return undefined;
  const stops = new Map(network.stops.map((x) => [x.id, x]));
  const near = (lon: number, lat: number) => {
    let d = Infinity;
    for (let k = 0; k < pts.length - 1; k++) d = Math.min(d, segDistM([lon, lat], pts[k]!, pts[k + 1]!));
    return d <= 400;
  };
  const routes: NonNullable<Project['rework']>['routes'] = [];
  const edits: Edit[] = [];
  for (const r of network.routes) {
    if (r.agency !== 'octranspo' || r.mode === 'rail' || r.id === lineId || r.id.startsWith('line-')) continue;
    const main = mainPatterns(r, network)[0];
    if (!main || main.stops.length < 6) continue;
    const share = main.stops.filter((id) => {
      const x = stops.get(id);
      return x ? near(x.lon, x.lat) : false;
    }).length / main.stops.length;
    if (share < 0.45) continue;
    const action = share >= 0.85 ? 'retire' : 'halve';
    routes.push({ id: r.id, name: r.shortName, action, overlap: Math.round(share * 100) });
    if (action === 'retire') edits.push({ kind: 'remove', routeId: r.id });
    else {
      const h = currentHeadways(r, network);
      const doubled = Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v > 0 ? Math.min(60, v * 2) : 0])) as typeof h;
      edits.push({ kind: 'service', routeId: r.id, headways: doubled });
    }
  }
  return routes.length ? { routes, edits } : undefined;
}

/** Propose a line: council votes on funding design and the environmental assessment. */
export function proposeProject(prev: GameState, design: LineDesign, forecast?: ProjectForecast, network?: Network): GameState {
  if (design.stations.length < 2 || !prev.council) return prev;
  const s = structuredClone(prev);
  const n = (s.projects?.length ?? 0) + 1;
  const id = `line-${n}`;
  const estimate = estimateLine(design, s.costIndex);
  const p: Project = {
    id, design, estimate, forecast, phase: 'proposed', dates: { proposed: s.date }, budget: estimate.cost.total, spent: 0, citySpent: 0,
    overrun: 0, delayMonths: 0, funding: { province: 0, federal: 0, provinceStatus: 'none', federalStatus: 'none' }, happened: [],
    edit: lineEdit(design, id),
  };
  const rework = network ? busRework(network, design, id) : undefined;
  if (rework) p.rework = rework;
  (s.projects ??= []).push(p);
  tableProject(s, p);
  return s;
}

function tableProject(s: GameState, p: Project) {
  tableInto(s, 'project', 'council', { projectId: p.id, routeName: p.design.name },
    { project: { city: likelyCityShare(p.estimate.cost.total) / 1e6, riders: ridersValue(p.forecast) }, wards: stationWards(p) });
}

/** Wards with a station like a line through them. */
function stationWards(p: Project): NonNullable<ItemEffects['wards']> {
  const wards: NonNullable<ItemEffects['wards']> = {};
  for (const w of p.forecast?.wards ?? []) wards[w] = { access: 2, removed: [], added: [p.design.shortName] };
  return wards;
}

/** Council's decision on a line (called by `callVote`): design begins, the contract is awarded, or it's shelved. */
export function projectVoted(s: GameState, kind: 'project' | 'contract', projectId: string, passed: boolean, price?: number) {
  const p = projectOf(s, projectId);
  if (!p) return;
  if (!passed) {
    p.phase = 'shelved';
    p.dates.shelved = s.date;
    delete p.due;
    news(s, { what: 'shelved', project: p.id, name: p.design.name, stage: kind });
    return;
  }
  if (kind === 'project') {
    p.phase = 'design';
    p.dates.design = s.date;
    p.due = addMonths(s.date, p.estimate.months.design);
    news(s, { what: 'approved', project: p.id, name: p.design.name, cost: Math.round(p.estimate.cost.total) });
  } else {
    award(s, p, price ?? p.budget);
  }
}

/** You choose how to build it (end of design): procurement begins. */
export function chooseProcurement(prev: GameState, projectId: string, how: Procurement): GameState {
  const s = structuredClone(prev);
  const p = projectOf(s, projectId);
  if (!p || p.phase !== 'design') return prev;
  for (const e of s.events) if (e.decision && e.kind === 'procurement' && e.data.project === projectId) e.decision = false;
  p.procurement = how;
  p.phase = 'procurement';
  p.dates.procurement = s.date;
  p.due = addMonths(s.date, p.estimate.months.procurement + (how === 'p3' ? 4 : 0));
  return s;
}

/** The bids: the contract price, and a council vote to award it. */
function bids(s: GameState, p: Project) {
  const r = rand(s.seed, `${p.id}:bids:${s.date}`);
  const factor = (p.procurement === 'p3' ? 1 + PROJECT_COSTS.p3Premium : 1) * (0.92 + 0.16 * r);
  const price = Math.round((p.budget * factor) / 1e5) * 1e5;
  const city = cityShare(p, price);
  news(s, { what: 'bids', project: p.id, name: p.design.name, price, city });
  delete p.due;
  tableInto(s, 'contract', 'council', { projectId: p.id, routeName: p.design.name, price },
    { project: { city: city / 1e6, riders: ridersValue(p.forecast) }, wards: stationWards(p) });
}

/** Contract awarded: construction starts; the risks of this build are drawn now (hidden). */
function award(s: GameState, p: Project, price: number) {
  p.budget = price;
  p.phase = 'construction';
  p.dates.construction = s.date;
  p.due = addMonths(s.date, p.estimate.months.construction);
  const r = (k: string) => rand(s.seed, `${p.id}:risk:${k}`);
  const tunnelShare = p.estimate.lengthKm > 0 ? p.estimate.tunnelKm / p.estimate.lengthKm : 0;
  const p3 = p.procurement === 'p3';
  const growth = 0.03 + 0.25 * r('growth') ** 2 + 0.12 * tunnelShare;
  const delay = Math.round((p3 ? 14 : 12) * r('delay') ** 1.8 + (tunnelShare > 0 ? 2 : 0));
  const sinkhole = p.estimate.tunnelKm > 0 && r('sinkhole') < Math.min(0.6, 0.12 * p.estimate.tunnelKm);
  p.risk = { growth: round1(growth * 100) / 100, delay, ...(sinkhole ? { sinkholeAt: 0.3 + 0.4 * r('sinkholeAt') } : {}),
    rough: r('rough') < (p3 ? 0.42 : 0.35) + (p.design.mode === 'lrt' ? 0.05 : -0.15) };
  news(s, { what: 'construction', project: p.id, name: p.design.name, price, opens: addMonths(p.due, p.estimate.months.testing) });
}

/** Overrun choices: pay it, trim the scope (half the money, more risk of a rough opening), or pause and re-tender. */
export function answerOverrun(prev: GameState, projectId: string, choice: 'pay' | 'trim' | 'pause'): GameState {
  const s = structuredClone(prev);
  const p = projectOf(s, projectId);
  const e = s.events.find((x) => x.decision && x.kind === 'overrun' && x.data.project === projectId);
  if (!p || !e) return prev;
  e.decision = false;
  const amount = Number(e.data.amount);
  const added = amount * (choice === 'pay' ? 1 : choice === 'trim' ? 0.5 : 0.4);
  p.budget += added;
  p.overrun += added;
  if (choice === 'trim' && p.risk) p.risk.rough = p.risk.rough || rand(s.seed, `${p.id}:trim`) < 0.5;
  if (choice === 'pause') {
    p.delayMonths += 9;
    if (p.due) p.due = addMonths(p.due, 9);
  }
  news(s, { what: 'overrunAnswered', project: p.id, name: p.design.name, choice, amount: Math.round(amount) });
  return s;
}

/** Stop a project: what's spent is spent. */
export function cancelProject(prev: GameState, projectId: string): GameState {
  const s = structuredClone(prev);
  const p = projectOf(s, projectId);
  if (!p || p.phase === 'open' || p.phase === 'cancelled') return prev;
  const late = p.phase === 'construction' || p.phase === 'testing';
  p.phase = 'cancelled';
  p.dates.cancelled = s.date;
  delete p.due;
  for (const e of s.events) if (e.decision && (e.kind === 'procurement' || e.kind === 'overrun') && e.data.project === projectId) e.decision = false;
  if (late && s.council) s.council.capital = clamp(s.council.capital - 5, 0, 100);
  news(s, { what: 'cancelled', project: p.id, name: p.design.name, spent: Math.round(p.spent), late: late ? 1 : 0 });
  return s;
}

/** Try again with a shelved line: council votes again (on design, or on new bids if it got that far). */
export function reviveProject(prev: GameState, projectId: string): GameState {
  const s = structuredClone(prev);
  const p = projectOf(s, projectId);
  if (!p || p.phase !== 'shelved' || !s.council) return prev;
  if (p.dates.procurement) {
    p.phase = 'procurement';
    p.due = addMonths(s.date, 6);
    news(s, { what: 'retender', project: p.id, name: p.design.name });
  } else {
    p.phase = 'proposed';
    tableProject(s, p);
  }
  return s;
}

/** Opening day: rework the buses around the line (or keep them all), and close the card. */
export function openingDay(prev: GameState, eventId: string, rework: boolean): GameState {
  const s = structuredClone(prev);
  const e = s.events.find((x) => x.id === eventId);
  if (!e) return prev;
  e.decision = false;
  const p = projectOf(s, String(e.data.project));
  if (rework && p?.rework?.edits.length) {
    s.applied = [...s.applied, ...p.rework.edits];
    (s.changes ??= []).push({ date: s.date, label: `${p.design.shortName}: buses reworked` });
    news(s, { what: 'rework', project: p.id, name: p.design.name, routes: p.rework.routes.length });
  }
  return s;
}

// ------------------------------------------------------------------------------------------ the days

/** Share of a phase's money spent by progress f (0..1): a smooth S-curve. */
const sCurve = (f: number) => {
  const x = clamp(f, 0, 1);
  return x - Math.sin(2 * Math.PI * x) / (2 * Math.PI);
};
const DESIGN_SHARE = 0.04;
const PROCUREMENT_SHARE = 0.01;

/** What should have been spent by today (all partners). */
function spendTarget(p: Project, today: string): number {
  const est = p.estimate.cost.total;
  const design = est * DESIGN_SHARE;
  const proc = est * PROCUREMENT_SHARE;
  const prog = (from?: string, months?: number) => (from && months ? clamp(monthsBetween(from, today) / months, 0, 1) : 0);
  if (p.phase === 'design') return design * prog(p.dates.design, p.estimate.months.design);
  if (p.phase === 'procurement') return Math.max(p.spent, design + proc * prog(p.dates.procurement, p.estimate.months.procurement));
  if (p.phase === 'proposed' || p.phase === 'shelved' || p.phase === 'cancelled') return p.spent;
  const built = p.budget - design - proc;
  if (p.phase === 'construction') return design + proc + built * sCurve(constructionProgress(p, today));
  return design + proc + built; // testing, open
}

/** How far along construction is (0..1), delays included. */
export function constructionProgress(p: Project, today: string): number {
  if (p.phase !== 'construction' || !p.dates.construction) return p.phase === 'testing' || p.phase === 'open' ? 1 : 0;
  return clamp(monthsBetween(p.dates.construction, today) / (p.estimate.months.construction + p.delayMonths), 0, 1);
}

/** The month's bills: partners pay their committed shares as work is done; the city pays the rest (capital reserve, then borrowing). */
function payMonth(s: GameState, p: Project, today: string) {
  const target = spendTarget(p, today);
  const due = target - p.spent;
  if (due <= 0) return;
  const partners = p.funding.province + p.funding.federal;
  const paidByPartners = Math.min(due * (partners / Math.max(p.budget, 1)), Math.max(0, partners - (p.partnersSpent ?? 0)));
  p.partnersSpent = (p.partnersSpent ?? 0) + paidByPartners;
  // development charges pay a quarter of the rest
  const city = (due - paidByPartners) * (1 - PROJECT_COSTS.devCharges);
  const borrowed = payLine(s, city);
  p.spent += due;
  p.citySpent += city;
  const rec = s.ledger.at(-1);
  if (rec) {
    rec.capital += city;
    rec.borrowed += borrowed;
  }
}

/** Ontario and the federal government decide on a third each: likelier for more riders per dollar. */
function seekFunding(s: GameState, p: Project) {
  const cap = 600e6 * s.costIndex;
  for (const gov of ['province', 'federal'] as const) {
    const chance = fundingChance(p);
    const yes = rand(s.seed, `${p.id}:funding:${gov}`) < chance;
    const amount = yes ? Math.min(cap, Math.round(p.estimate.cost.total / 3 / 1e6) * 1e6) : 0;
    p.funding[gov] = amount;
    p.funding[`${gov}Status`] = yes ? 'committed' : 'declined';
    news(s, { what: 'funding', project: p.id, name: p.design.name, gov, amount });
  }
}

/** The NCC reviews alignments along its parkways and the river: conditions add time and money. */
function nccReview(s: GameState, p: Project) {
  const names = p.design.stations.map((x) => x.name).join(' ');
  if (!/parkway|promenade|driveway|colonel by|river|canal/i.test(names)) return;
  p.budget *= 1.04;
  p.estimate.months.construction += 3;
  news(s, { what: 'ncc', project: p.id, name: p.design.name });
}

/**
 * What the lines will cost the city over the coming year: debt service on what's borrowed and will
 * be borrowed, and running the lines open by then.
 */
export function lineCostsNextYear(s: GameState): number {
  const ahead = addMonths(s.date, 12);
  let borrow = 0;
  let ops = 0;
  for (const p of s.projects ?? []) {
    if (p.phase === 'open') ops += p.estimate.opsPerYear;
    if (!['design', 'procurement', 'construction', 'testing'].includes(p.phase)) continue;
    const due = Math.max(0, spendTarget(p, ahead) - p.spent);
    const partners = p.funding.province + p.funding.federal;
    const fromPartners = Math.min(due * (partners / Math.max(p.budget, 1)), Math.max(0, partners - (p.partnersSpent ?? 0)));
    borrow += (due - fromPartners) * (1 - PROJECT_COSTS.devCharges);
    const opens = p.due && p.phase === 'testing' ? p.due : undefined;
    if (opens && opens <= ahead) ops += p.estimate.opsPerYear;
  }
  return yearlyDebtService((s.lineDebt ?? 0) + borrow) + ops * s.costIndex;
}

/** Move the projects on to today (mutates `s`; called once a day after the books). */
export function advanceProjects(s: GameState) {
  const today = s.date;
  const monthEnd = toDate(today).getUTCDate() === 1;
  // the autumn budget: the lines' growing cost is spelled out, so council treats it as owed
  const budget = s.events.find((e) => e.kind === 'budget' && e.date === today && e.decision);
  if (budget && budget.data.committed === undefined && s.levy > 0) {
    const next = lineCostsNextYear(s);
    const committed = Math.max(0, next - (s.lineCharge ?? 0));
    if (committed > 0) {
      budget.data.committed = Math.round((committed / s.levy) * 1000) / 10;
      budget.data.lines = Math.round(next);
    }
    s.lineCharge = next;
  }
  for (const p of s.projects ?? []) {
    if (p.phase === 'design' && p.due && today >= p.due) {
      seekFunding(s, p);
      nccReview(s, p);
      delete p.due;
      decide(s, 'procurement', { project: p.id, name: p.design.name, cost: Math.round(p.budget) });
    } else if (p.phase === 'procurement' && p.due && today >= p.due) {
      bids(s, p);
    } else if (p.phase === 'construction') {
      setbacks(s, p, today);
      if (p.due && today >= p.due) {
        p.phase = 'testing';
        p.dates.testing = today;
        p.due = addMonths(today, p.estimate.months.testing);
        news(s, { what: 'testing', project: p.id, name: p.design.name });
      }
    } else if (p.phase === 'testing' && p.due && today >= p.due) {
      open(s, p, today);
    } else if (p.phase === 'open' && p.risk?.rough && p.opened && today >= addDays(p.opened, 3) && !p.happened.includes('trouble')) {
      // a rough start: doors, switches, software; the papers notice
      p.happened.push('trouble');
      news(s, { what: 'trouble', project: p.id, name: p.design.name });
    }
    if (monthEnd) payMonth(s, p, today);
  }
}

/** Overruns come to light at 35% and 70% of the way; delays at 55%; a sinkhole when it comes. */
function setbacks(s: GameState, p: Project, today: string) {
  const f = constructionProgress(p, today);
  const r = p.risk;
  if (!r) return;
  const once = (key: string, at: number, act: () => void) => {
    if (f >= at && !p.happened.includes(key)) {
      p.happened.push(key);
      act();
    }
  };
  const overrun = (key: string, share: number) => once(key, key === 'overrun1' ? 0.35 : 0.7, () => {
    const amount = p.budget * r.growth * share;
    if (amount < p.budget * 0.015) return;
    if (p.procurement === 'p3') {
      // the consortium carries most of it; the city pays for changes it asked for
      const city = amount * 0.15;
      p.budget += city;
      p.overrun += city;
      news(s, { what: 'overrunP3', project: p.id, name: p.design.name, amount: Math.round(amount), city: Math.round(city) });
    } else decide(s, 'overrun', { project: p.id, name: p.design.name, amount: Math.round(amount), share: Math.round((amount / p.budget) * 100) });
  });
  overrun('overrun1', 0.5);
  overrun('overrun2', 0.5);
  once('delay', 0.55, () => {
    if (r.delay <= 0) return;
    p.delayMonths += r.delay;
    if (p.due) p.due = addMonths(p.due, r.delay);
    const damages = p.procurement === 'p3' ? r.delay * 1.5e6 : 0;
    if (damages) s.capitalReserve += damages;
    news(s, { what: 'delay', project: p.id, name: p.design.name, months: r.delay, damages: Math.round(damages) });
  });
  if (r.sinkholeAt !== undefined) once('sinkhole', r.sinkholeAt, () => {
    p.delayMonths += 4;
    if (p.due) p.due = addMonths(p.due, 4);
    const cost = p.budget * 0.03 * (p.procurement === 'p3' ? 0.2 : 1);
    p.budget += cost;
    p.overrun += cost;
    news(s, { what: 'sinkhole', project: p.id, name: p.design.name, cost: Math.round(cost) });
  });
}

/** Opening day: the line joins the network in operation. */
function open(s: GameState, p: Project, today: string) {
  p.phase = 'open';
  p.opened = today;
  p.dates.open = today;
  delete p.due;
  s.applied = [...s.applied, p.edit];
  (s.changes ??= []).push({ date: today, label: `+${p.design.shortName}` });
  const rough = !!p.risk?.rough;
  decide(s, 'lineOpen', { project: p.id, name: p.design.name, km: p.estimate.lengthKm, stations: p.estimate.stations, rough: rough ? 1 : 0,
    cost: Math.round(p.spent), years: round1(monthsBetween(p.dates.proposed ?? today, today) / 12), rework: p.rework?.routes.length ?? 0 });
}

/**
 * Light rail's daily capacity in bus-hour equivalents (a two-car train carries about 3¼ busloads):
 * what riders feel as room when the opinion model weighs crowding (bus-hours alone would make a
 * line that replaces buses look like a cut).
 */
export function lineCapacityHours(s: GameState): number {
  let h = 0;
  for (const p of s.projects ?? []) if (p.phase === 'open' && p.design.mode === 'lrt') h += (p.estimate.vehicles / 1.15) * 17 * 3.25;
  return h;
}

// ------------------------------------------------------------------------------------------ neighbours

const constructionCache = new Map<string, Float32Array>();

/** Per zone, how much a line under construction nearby weighs on daily life (0..1, within ~700 m). */
export function constructionNear(s: GameState, zones: Zone[]): Float32Array | undefined {
  const active = (s.projects ?? []).filter((p) => p.phase === 'construction');
  if (!active.length || !zones.length) return undefined;
  const key = `${zones.length}:${active.map((p) => p.id).join(',')}`;
  const hit = constructionCache.get(key);
  if (hit) return hit;
  const out = new Float32Array(zones.length);
  for (const p of active) {
    const pts = p.design.stations.map((x) => [x.lon, x.lat] as [number, number]);
    zones.forEach((z, i) => {
      let d = Infinity;
      for (let k = 0; k < pts.length - 1; k++) {
        if (p.design.structure[k] === 'tunnel') continue; // tunnels are dug from the stations
        d = Math.min(d, segDistM([z.lon, z.lat], pts[k]!, pts[k + 1]!));
      }
      for (const q of pts) d = Math.min(d, distM([z.lon, z.lat], q)); // every station is a building site
      if (d < 700) out[i] = Math.max(out[i]!, 1 - d / 700);
    });
  }
  if (constructionCache.size > 20) constructionCache.clear();
  constructionCache.set(key, out);
  return out;
}

function segDistM(p: [number, number], a: [number, number], b: [number, number]): number {
  const ax = a[0] * KX, ay = a[1] * KY, bx = b[0] * KX, by = b[1] * KY, px = p[0] * KX, py = p[1] * KY;
  const dx = bx - ax, dy = by - ay;
  const t = dx || dy ? clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * 1000;
}
