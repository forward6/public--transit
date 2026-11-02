import {
  ECONOMY_2010,
  type EconomyStart, type GameState, type OpinionAxis, type OpinionRecord, type OpinionState, type Reason, type ReasonKey, type ShockKind,
  type TrustShock, type Zone, type ZoneLos,
} from '@otc/shared';
import { missedShare, monthBoardings, toDate } from './economy';
import { constructionNear, lineCapacityHours } from './projects';
import { weatherDelay, weatherOn } from './weather';

/**
 * Public opinion (M6, PLAN §7.2). Every Ottawa zone holds three opinions of the Commission:
 * **service** (how riding feels), **value for money** (fares and taxes) and **trust**. Each day they
 * move towards a target made of named reasons, so every number can be explained:
 *
 * - service: how often buses come where you live; how many jobs you can reach compared with what
 *   you are used to (expectations adapt over months); reliability; crowding; cold waits and storm
 *   delays (fading over days); service cuts;
 * - value: fares and the transit levy compared with what people are used to paying;
 * - trust: the memory of the 2008–09 strike, events (new routes, removed routes, deficits, fare and
 *   tax hikes, promises kept), fading over months; and how service feels.
 *
 * Opinion falls faster than it rises. Approval = 50% + half the weighted mean (Ottawa residents).
 */
export const OPINION_2010 = {
  mood: 8,
  valueBase: -6,
  trustBase: -4,
  strike: -10,
  weights: { service: 0.45, value: 0.3, trust: 0.25 } as Record<OpinionAxis, number>,
  tau: { up: 28, down: 12, value: 30, trust: 45, expectations: 150, prices: 365, weather: 8, shocks: 180, strike: 500 },
  source: 'Estimates: weights, memory lengths and the 2010 starting mood (trust still low after the 2008–09 strike) are game-design choices.',
};

export interface OpinionWorld {
  zones: Zone[];
  /** the 2010 network's level of service */
  baseLos: ZoneLos;
  /** each zone's transit share of trips (riders care more about service and fares) */
  share: number[];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round1 = (x: number) => Math.round(x * 10) / 10;
const days = (a: string, b: string) => (toDate(b).getTime() - toDate(a).getTime()) / 86_400_000;

/** Citywide inputs of the day's targets. */
interface Context {
  los: ZoneLos;
  missed: number;
  crowding: number;
  fares: number;
  taxes: number;
  cuts: number;
  strike: number;
  events: number;
  weather: number;
  strikeNow: boolean;
  /** M8: per zone, a line being built nearby (0..1) */
  construction?: Float32Array;
}

function context(s: GameState, o: OpinionState, world: OpinionWorld, start: EconomyStart, date = s.date): Context {
  const crowd = monthBoardings(s, start, date) / Math.max(1, s.service.vehicleHours + lineCapacityHours(s)) / Math.max(1e-6, o.crowdRef);
  const events = o.shocks.reduce((a, k) => a + k.amount * Math.exp(-Math.max(0, days(k.date, date)) / OPINION_2010.tau.shocks), 0);
  const startDate = o.history[0]?.date ?? date;
  return {
    los: s.los ?? world.baseLos,
    missed: missedShare(s, start),
    crowding: Math.max(0, crowd - 1.02),
    fares: Math.log(s.fareIndex / o.expFare),
    taxes: Math.log(Math.max(1, s.levy) / Math.max(1, o.expLevy)),
    cuts: 1 - s.serviceLevel,
    strike: OPINION_2010.strike * Math.exp(-Math.max(0, days(startDate, date)) / OPINION_2010.tau.strike),
    events,
    weather: o.weather,
    strikeNow: !!s.strike,
    construction: constructionNear(s, world.zones),
  };
}

/** The reasons behind zone i's targets (each axis's target is the sum of its reasons). */
function reasonsFor(i: number, o: OpinionState, world: OpinionWorld, c: Context, serviceNow?: number): Reason[] {
  const access = c.los.access[i]!;
  const wait = c.los.wait[i]!;
  const share = world.share[i] ?? 0.1;
  const riderWeight = clamp(0.4 + 2 * share, 0.4, 1.4);
  const r = (key: ReasonKey, axis: OpinionAxis, value: number): Reason => ({ key, axis, value });
  const service = [
    r('mood', 'service', OPINION_2010.mood),
    r('frequency', 'service', clamp(-1.4 * (wait - 5), -28, 5)),
    r('reach', 'service', clamp(22 * Math.log(Math.max(1, access) / Math.max(1, o.expAccess[i]!)), -25, 25)),
    r('waits', 'service', clamp(-2.2 * (wait - o.expWait[i]!), -20, 20)),
    r('reliability', 'service', -700 * c.missed),
    r('crowding', 'service', -60 * c.crowding),
    r('weather', 'service', -clamp(c.weather * clamp(wait / 6, 0.4, 2) * 0.6, 0, 25)),
    r('cuts', 'service', -150 * c.cuts),
    ...(c.strikeNow ? [r('strike', 'service', -45)] : []),
    ...(c.construction?.[i] ? [r('construction', 'service', -10 * c.construction[i]!)] : []),
  ];
  const s = serviceNow ?? service.reduce((a, x) => a + x.value, 0);
  return [
    ...service,
    r('mood', 'value', OPINION_2010.valueBase),
    r('fares', 'value', clamp(-80 * c.fares * riderWeight, -40, 25)),
    r('taxes', 'value', clamp(-60 * c.taxes, -35, 20)),
    r('cuts', 'value', -60 * c.cuts),
    r('mood', 'trust', OPINION_2010.trustBase),
    r('strike', 'trust', c.strike),
    r('events', 'trust', clamp(c.events, -40, 30)),
    r('spillover', 'trust', 0.25 * (s - OPINION_2010.mood)),
  ];
}

const targetOf = (reasons: Reason[], axis: OpinionAxis) => clamp(reasons.reduce((a, x) => a + (x.axis === axis ? x.value : 0), 0), -100, 100);

/** A zone's approval, −100..100. */
export function zoneScore(o: OpinionState, i: number): number {
  const w = OPINION_2010.weights;
  return w.service * o.service[i]! + w.value * o.value[i]! + w.trust * o.trust[i]!;
}

export const toApproval = (score: number) => clamp(50 + score / 2, 2, 98);

/** Citywide (Ottawa residents) approval and axes; optionally only the zones `keep` accepts. */
export function opinionSummary(o: OpinionState, world: OpinionWorld, date: string, keep: (z: Zone) => boolean = (z) => z.city === 'ottawa'): OpinionRecord {
  let pop = 0;
  const sum = { service: 0, value: 0, trust: 0, score: 0 };
  world.zones.forEach((z, i) => {
    if (!keep(z) || z.pop <= 0) return;
    pop += z.pop;
    sum.service += z.pop * o.service[i]!;
    sum.value += z.pop * o.value[i]!;
    sum.trust += z.pop * o.trust[i]!;
    sum.score += z.pop * zoneScore(o, i);
  });
  const p = Math.max(1, pop);
  return { date, approval: round1(toApproval(sum.score / p)), service: round1(sum.service / p), value: round1(sum.value / p), trust: round1(sum.trust / p) };
}

/** Opinion on the first day: every zone at its target. */
export function startOpinion(s: GameState, world: OpinionWorld, start: EconomyStart = ECONOMY_2010): OpinionState {
  const los = s.los ?? world.baseLos;
  const n = world.zones.length;
  const o: OpinionState = {
    version: 1, service: [], value: [], trust: [], expAccess: [...los.access], expWait: [...los.wait],
    expFare: s.fareIndex, expLevy: Math.max(1, s.levy), weather: 0, shocks: [],
    // the weekday level before seasons: autumn and winter crowding shows against it
    crowdRef: s.service.boardings / Math.max(1, s.service.vehicleHours),
    seen: { fareIndex: s.fareIndex, levy: s.levy, serviceLevel: s.serviceLevel, applied: s.applied.length, events: s.events.map((e) => e.id) },
    history: [],
  };
  o.history.push({ date: s.date, approval: 50, service: 0, value: 0, trust: 0 });
  const c = context(s, o, world, start);
  for (let i = 0; i < n; i++) {
    const rs = reasonsFor(i, o, world, c);
    o.service.push(round1(targetOf(rs, 'service')));
    o.value.push(round1(targetOf(rs, 'value')));
    o.trust.push(round1(targetOf(rs, 'trust')));
  }
  o.history[0] = opinionSummary(o, world, s.date);
  return o;
}

/** Changes the public notices: plans that took effect, fares, the levy, cuts, deficits, deliveries. */
function notice(o: OpinionState, s: GameState, date: string): TrustShock[] {
  const out: TrustShock[] = [];
  const add = (kind: ShockKind, amount: number, label?: string) => out.push({ date, kind, amount: round1(amount), ...(label ? { label } : {}) });
  const fresh = s.applied.slice(o.seen.applied);
  if (fresh.length) {
    let up = 0;
    for (const e of fresh) {
      if (e.kind === 'add') add('newRoute', 3, e.route.shortName);
      else if (e.kind === 'remove') add('routeRemoved', -4, e.routeId.replace(/^oct-/, ''));
      else up++;
    }
    if (up) add('serviceUp', Math.min(3, up));
    add('promiseKept', 2);
  }
  if (s.fareIndex > o.seen.fareIndex * 1.001) add('fareHike', -150 * Math.log(s.fareIndex / o.seen.fareIndex));
  else if (s.fareIndex < o.seen.fareIndex * 0.999) add('fareCut', 100 * Math.log(o.seen.fareIndex / s.fareIndex));
  if (o.seen.levy > 0) {
    const g = s.levy / o.seen.levy - 1;
    if (g > 0.025) add('levyHike', -80 * (g - 0.02));
    else if (g < -0.005) add('levyCut', 60 * -g);
  }
  if (s.serviceLevel < o.seen.serviceLevel - 0.001) add('serviceCut', -200 * (o.seen.serviceLevel - s.serviceLevel));
  if (s.strike && !o.seen.strike) add('strike', -15);
  const seen = new Set(o.seen.events);
  for (const e of s.events) {
    if (seen.has(e.id)) continue;
    if (e.kind === 'deficit') add('deficit', -3);
    else if (e.kind === 'delivery' && !e.data.held) add('newBuses', 0.6, String(e.data.count));
    else if (e.kind === 'garageOpen') add('newGarage', 2, String(e.data.name));
    else if (e.kind === 'councilBudget' || e.kind === 'directive') add('councilOverrule', -2);
    else if (e.kind === 'labourDeal' && !s.strike) add('promiseKept', 1);
    // M8: big projects
    else if (e.kind === 'lineOpen') add('lineOpen', 7, String(e.data.name));
    else if (e.kind === 'project') {
      const w = e.data.what;
      const name = String(e.data.name);
      if (w === 'approved') add('projectApproved', 2, name);
      else if (w === 'shelved' || w === 'cancelled') add('projectShelved', e.data.late ? -6 : -2, name);
      else if (w === 'funding' && e.data.amount) add('projectApproved', 1, name);
      else if (w === 'construction') add('projectApproved', 1, name);
      else if (w === 'delay') add('projectDelay', -2.5, name);
      else if (w === 'sinkhole') add('sinkhole', -5, name);
      else if (w === 'overrunAnswered') add('overrun', e.data.choice === 'pause' ? -4 : e.data.choice === 'trim' ? -2 : -3, name);
      else if (w === 'overrunP3') add('overrun', -1, name);
      else if (w === 'trouble') add('lineTrouble', -5, name);
    }
  }
  return out;
}

/**
 * Move opinion through the day that ended (`ended`), with the game state as it stands after that
 * day (decisions taken, plans in operation).
 */
export function advanceOpinion(prev: OpinionState, s: GameState, world: OpinionWorld, ended: string, start: EconomyStart = ECONOMY_2010): OpinionState {
  const o: OpinionState = structuredClone(prev);
  o.shocks = [...o.shocks, ...notice(o, s, ended)]
    .filter((k) => Math.abs(k.amount) * Math.exp(-days(k.date, ended) / OPINION_2010.tau.shocks) >= 0.2)
    .slice(-60);
  o.seen = { fareIndex: s.fareIndex, levy: s.levy, serviceLevel: s.serviceLevel, applied: s.applied.length,
    events: s.events.map((e) => e.id), strike: !!s.strike };
  // the day's hardship: cold waits and storm delays, remembered for a week or two
  const w = weatherOn(ended, s.seed);
  const hardship = Math.max(0, -w.low - 15) * 0.6 + weatherDelay(w) * 0.8;
  o.weather = round1(o.weather * Math.exp(-1 / OPINION_2010.tau.weather) + 0.5 * hardship);
  const c = context(s, o, world, start, ended);
  const k = (tau: number) => 1 - Math.exp(-1 / tau);
  const T = OPINION_2010.tau;
  for (let i = 0; i < world.zones.length; i++) {
    const rs = reasonsFor(i, o, world, c, o.service[i]);
    const step = (cur: number, target: number, up: number, down: number) => round1(cur + (target - cur) * k(target >= cur ? up : down));
    o.service[i] = step(o.service[i]!, targetOf(rs, 'service'), T.up, T.down);
    o.value[i] = step(o.value[i]!, targetOf(rs, 'value'), T.value, T.value / 2);
    o.trust[i] = step(o.trust[i]!, targetOf(rs, 'trust'), T.trust, T.trust / 2);
    // people get used to the service they have
    o.expAccess[i] = Math.round(o.expAccess[i]! + (c.los.access[i]! - o.expAccess[i]!) * k(T.expectations));
    o.expWait[i] = round1(o.expWait[i]! + (c.los.wait[i]! - o.expWait[i]!) * k(T.expectations));
  }
  o.expFare = o.expFare + (s.fareIndex - o.expFare) * k(T.prices);
  o.expLevy = o.expLevy + (Math.max(1, s.levy) - o.expLevy) * k(T.prices);
  // a weekly record, on Sundays
  if (toDate(ended).getUTCDay() === 0) {
    o.history.push(opinionSummary(o, world, ended));
    if (o.history.length > 260) o.history.shift();
  }
  return o;
}

/** Why zone i feels as it does (its targets, reason by reason). */
export function explainZone(s: GameState, world: OpinionWorld, i: number, start: EconomyStart = ECONOMY_2010): Reason[] {
  const o = s.opinion;
  if (!o) return [];
  return reasonsFor(i, o, world, context(s, o, world, start), o.service[i]).map((r) => ({ ...r, value: round1(r.value) }));
}

/** Why the city feels as it does: zone reasons averaged over residents (Ottawa). */
export function explainCity(s: GameState, world: OpinionWorld, keep: (z: Zone) => boolean = (z) => z.city === 'ottawa',
  start: EconomyStart = ECONOMY_2010): Reason[] {
  const o = s.opinion;
  if (!o) return [];
  const c = context(s, o, world, start);
  const acc = new Map<string, Reason>();
  let pop = 0;
  world.zones.forEach((z, i) => {
    if (!keep(z) || z.pop <= 0) return;
    pop += z.pop;
    for (const r of reasonsFor(i, o, world, c, o.service[i])) {
      const key = `${r.axis}:${r.key}`;
      const a = acc.get(key) ?? { ...r, value: 0 };
      a.value += z.pop * r.value;
      acc.set(key, a);
    }
  });
  return [...acc.values()].map((r) => ({ ...r, value: round1(r.value / Math.max(1, pop)) }));
}

/** Approval by district (Ottawa's districts and Gatineau's, for the map legend and panels). */
export function districtOpinion(o: OpinionState, world: OpinionWorld, date: string): Record<string, OpinionRecord> {
  const out: Record<string, OpinionRecord> = {};
  for (const d of new Set(world.zones.map((z) => z.district))) out[d] = opinionSummary(o, world, date, (z) => z.district === d);
  return out;
}

/** Days since the last weekly record (for the "this week" deltas). */
export function lastWeekApproval(o: OpinionState): number | null {
  return o.history.length >= 2 ? o.history.at(-2)!.approval : null;
}

