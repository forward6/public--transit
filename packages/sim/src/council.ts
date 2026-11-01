import {
  BUS_TYPES, COMMISSION_2010, COUNCIL_2010, ECONOMY_2010, LABOUR_2010, STO_2010, TERM, WARDS_2010,
  type AgendaItem, type BudgetChoice, type BusType, type CouncilState, type Councillor, type EconomyStart, type Edit, type ElectionRecord,
  type ElectionResult, type GameEvent, type GameState, type ItemEffects, type ItemKind, type Network, type Platform, type StoAgenda,
  type WhipReason, type ZoneLos,
} from '@otc/shared';
import { addDays, addMonths, buildGarage, orderBuses, resolve, schedulePlan, serviceChangeDates, toDate } from './economy';
import { opinionSummary, toApproval, zoneScore, type OpinionWorld } from './opinion';
import { rand } from './weather';
import { wardsAt } from './wards';

/**
 * Council, elections and partners (M7, PLAN §7.1, §7.3–7.5).
 *
 * Only the big items go to a vote: budgets, new and removed routes (the Transit Commission),
 * garages, large bus orders, in-year levy hikes, cuts and borrowing, labour deals. Each councillor
 * leans by their attitudes (taxes, transit), what the item does to their ward, how their ward feels
 * about transit, their relationship with you and the mayor's lead; you can lobby (Political
 * Capital), consult, commission a study, amend or withdraw before calling the vote. Losing has soft
 * consequences: council writes its own budget, imposes its choice in a deficit, or passes a motion
 * to restore a route you removed. Political Capital grows with approval and delivered promises.
 */

export interface CouncilWorld extends OpinionWorld {
  /** ward id per zone (0: not in Ottawa) */
  wardOf: number[];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Share of Political Capital above (or below) 35 that fades each week. */
export const CAPITAL_FADE = 0.02;

export function startCouncil(date = TERM.start): CouncilState {
  return {
    version: 1, councillors: structuredClone(COUNCIL_2010), commission: [...COMMISSION_2010], capital: 35, items: [], directions: [],
    sto: { agenda: STO_2010.agenda, relationship: STO_2010.relationship, next: STO_2010.firstProposal, agreements: [] },
    funding: [], labour: { wage: LABOUR_2010.baseline, until: LABOUR_2010.contractEnds, scheduling: 'kept' }, elections: [],
    history: [{ date, capital: 35 }], seen: { events: [], applied: 0, garages: 0 },
  };
}

// ------------------------------------------------------------------------------------------ wards

export interface WardMood {
  approval: number;
  service: number;
  value: number;
  trust: number;
  pop: number;
}

/** Each ward's mood (from the zones' opinion), and the city's (key 0). */
export function wardMoods(s: GameState, world: CouncilWorld): Record<number, WardMood> {
  const sums = new Map<number, { pop: number; score: number; service: number; value: number; trust: number }>();
  const o = s.opinion;
  world.zones.forEach((z, i) => {
    const w = world.wardOf[i]!;
    if (w <= 0 || z.pop <= 0) return;
    for (const k of [w, 0]) {
      const a = sums.get(k) ?? { pop: 0, score: 0, service: 0, value: 0, trust: 0 };
      a.pop += z.pop;
      if (o) {
        a.score += z.pop * zoneScore(o, i);
        a.service += z.pop * o.service[i]!;
        a.value += z.pop * o.value[i]!;
        a.trust += z.pop * o.trust[i]!;
      }
      sums.set(k, a);
    }
  });
  const out: Record<number, WardMood> = {};
  for (const w of [0, ...WARDS_2010.map((x) => x.id)]) {
    const a = sums.get(w);
    const p = Math.max(1, a?.pop ?? 1);
    out[w] = o && a ? { approval: round1(toApproval(a.score / p)), service: round1(a.service / p), value: round1(a.value / p), trust: round1(a.trust / p), pop: a.pop }
      : { approval: 50, service: 0, value: 0, trust: 0, pop: a?.pop ?? 0 };
  }
  return out;
}

// ------------------------------------------------------------------------------------------ the whip

export interface Lean {
  id: string;
  score: number;
  position: 'yes' | 'no' | 'undecided';
  reason: WhipReason;
}

/** Who votes on an item: the Commission (with you) or the whole council (with the mayor). */
export function members(c: CouncilState, item: AgendaItem): Councillor[] {
  return item.body === 'commission' ? c.councillors.filter((x) => c.commission.includes(x.id)) : c.councillors;
}

function terms(c: Councillor, item: AgendaItem, moods: Record<number, WardMood>, mayorLean: number, seed: number): { score: number; t: Partial<Record<WhipReason, number>> } {
  const t: Partial<Record<WhipReason, number>> = {};
  const add = (k: WhipReason, v: number) => (t[k] = (t[k] ?? 0) + v);
  const e = item.effects;
  const dir = item.byChair ? 1 : -1;
  const rural = !!WARDS_2010.find((w) => w.id === c.ward)?.rural;
  if (e.taxes !== undefined) {
    add('taxes', -c.fiscal * 0.45 * (e.taxes - 2));
    if (rural && e.taxes > 2) add('rural', -0.15 * (e.taxes - 2));
  }
  if (e.fares) add('fares', -0.12 * e.fares * (c.transit + 1) / 2 + c.fiscal * 0.05 * e.fares);
  if (e.service) {
    add('service', c.transit * 0.3 * e.service);
    if (e.service > 0) add('cost', -c.fiscal * 0.08 * e.service);
  }
  if (e.capital) {
    add('cost', -c.fiscal * 0.008 * e.capital);
    add('service', c.transit * 0.005 * e.capital);
  }
  if (e.debt) add('debt', -c.fiscal * 0.03 * e.debt);
  if (e.wage !== undefined) add('labour', -c.fiscal * 0.35 * (e.wage - LABOUR_2010.baseline) + c.transit * 0.15);
  const w = e.wards?.[c.ward];
  if (w) {
    const k = 0.5 + c.responsiveness;
    if (w.access) add(w.access >= 0 ? 'wardGain' : 'wardLoss', 0.06 * w.access * k);
    if (w.removed.length) add('wardLoss', -0.9 * w.removed.length * k);
    if (w.added.length) add('wardGain', 0.5 * w.added.length * k);
  }
  // council has to adopt a budget and usually ratifies a negotiated deal; optional items face inertia
  if (item.kind === 'budget') add('status', 0.25);
  else if (item.kind === 'labourDeal') add('status', 0.4);
  else if (item.kind.startsWith('deficit')) add('status', 0.2);
  else add('status', item.amended ? -0.05 : -0.15);
  // how their ward feels about transit (against the starting mood), and about you
  const mood = moods[c.ward]?.approval ?? 50;
  add(mood >= 47 ? 'wardHappy' : 'wardUnhappy', dir * c.responsiveness * (mood - 47) / 12);
  add(c.relationship >= 0 ? 'ally' : 'rival', dir * c.relationship / 25);
  if (c.ward !== 0) add('mayor', mayorLean * 0.3 * (1 - Math.min(1, Math.abs(c.transit - c.fiscal) / 1.5)));
  if (item.lobbied.includes(c.id)) add('lobbied', 0.9 * dir);
  if (item.consulted) add('consulted', 0.5 * Math.sign(mood - 47) * dir);
  if (item.studied) add('study', c.fiscal > 0 ? 0.35 : 0.1);
  const noise = (rand(seed, `${item.id}:${c.id}`) - 0.5) * 0.5;
  return { score: Object.values(t).reduce((a, x) => a + (x ?? 0), 0) + noise, t };
}

/** Each member's lean on an item, with their main reason. Scores > 0 support the item. */
export function whipCount(s: GameState, world: CouncilWorld, item: AgendaItem): Lean[] {
  const c = s.council!;
  const moods = wardMoods(s, world);
  const mayor = c.councillors.find((x) => x.ward === 0);
  const mayorLean = mayor ? terms(mayor, item, moods, 0, s.seed).score : 0;
  return members(c, item).map((m) => {
    const { score, t } = terms(m, item, moods, mayorLean, s.seed);
    const sign = Math.sign(score) || 1;
    const reason = (Object.entries(t) as [WhipReason, number][]).filter(([k]) => k !== 'status')
      .sort((a, b) => b[1] * sign - a[1] * sign)[0]?.[0] ?? 'status';
    return { id: m.id, score: round1(score), position: score >= 0.35 ? 'yes' : score <= -0.35 ? 'no' : 'undecided', reason };
  });
}

/** Votes needed and the count if it were held now (undecided members break by lean). */
export function tally(s: GameState, world: CouncilWorld, item: AgendaItem): { yes: number; no: number; needed: number; votes: Record<string, 'yes' | 'no'> } {
  const leans = whipCount(s, world, item);
  const votes: Record<string, 'yes' | 'no'> = {};
  for (const l of leans) votes[l.id] = l.score + (rand(s.seed, `${item.id}:${l.id}:vote`) - 0.5) * 0.3 > 0 ? 'yes' : 'no';
  let yes = Object.values(votes).filter((v) => v === 'yes').length;
  let no = leans.length - yes;
  // the Chair votes on the Commission
  if (item.body === 'commission') {
    if (item.byChair) yes++;
    else no++;
  }
  const total = yes + no;
  return { yes, no, needed: Math.floor(total / 2) + 1, votes };
}

// ------------------------------------------------------------------------------------------ proposals

const voteEvent = (item: AgendaItem, date: string): GameEvent => ({ id: `vote-${item.id}-${date}`, kind: 'vote', date, decision: true, data: { item: item.id } });

function table(prev: GameState, kind: ItemKind, body: AgendaItem['body'], payload: AgendaItem['payload'], effects: ItemEffects, byChair = true,
  measuring = false): GameState {
  const s = structuredClone(prev);
  tableInto(s, kind, body, payload, effects, byChair, measuring);
  return s;
}

/** Put an item on the agenda (mutates `s`). */
function tableInto(s: GameState, kind: ItemKind, body: AgendaItem['body'], payload: AgendaItem['payload'], effects: ItemEffects, byChair = true,
  measuring = false): AgendaItem {
  const c = s.council!;
  const item: AgendaItem = { id: `${kind}-${s.date}-${c.items.length}`, kind, body, tabled: s.date, due: s.date, status: 'open', byChair, payload, effects,
    lobbied: [], ...(measuring ? { measuring } : {}) };
  c.items.push(item);
  s.events.push(voteEvent(item, s.date));
  return item;
}

/** The current agenda item awaiting you (the open vote event's item). */
export function openItem(s: GameState): AgendaItem | undefined {
  const e = s.events.find((x) => x.decision && x.kind === 'vote');
  return e ? s.council?.items.find((i) => i.id === e.data.item) : undefined;
}

/** Your budget goes to council instead of taking effect. */
export function proposeBudget(prev: GameState, eventId: string, choice: BudgetChoice): GameState {
  const s = structuredClone(prev);
  const e = s.events.find((x) => x.id === eventId);
  if (!e || !s.council) return prev;
  e.decision = false;
  return table(s, 'budget', 'council', { budgetEvent: eventId, levyChange: choice.levyChange, fareChange: choice.fareChange, maintenance: choice.maintenance },
    { taxes: choice.levyChange, fares: choice.fareChange, service: (choice.maintenance - 1) * 10 });
}

/** In a deficit: a levy hike, cuts or borrowing need council; deferring maintenance doesn't. */
export function proposeDeficit(prev: GameState, eventId: string, choice: 'levy' | 'cut' | 'borrow'): GameState {
  const s = structuredClone(prev);
  const e = s.events.find((x) => x.id === eventId);
  if (!e || !s.council) return prev;
  e.decision = false;
  const gap = Math.max(1, -s.reserve);
  const effects: ItemEffects = choice === 'levy' ? { taxes: (100 * gap * 1.1) / Math.max(1, s.levy) + 2.5 } : choice === 'cut' ? { service: -8 } : { debt: gap / 1e6 + 5 };
  return table(s, choice === 'levy' ? 'deficitLevy' : choice === 'cut' ? 'deficitCut' : 'deficitBorrow', 'council', { deficitEvent: eventId }, effects);
}

/** The wards a route's stops are in. */
export function routeWards(network: Network, routeId: string, world: CouncilWorld): number[] {
  const r = network.routes.find((x) => x.id === routeId);
  const pts = (r?.patterns ?? []).flatMap((pid) => network.patterns.find((p) => p.id === pid)?.stops ?? [])
    .map((sid) => network.stops.find((x) => x.id === sid)).filter(Boolean).map((x) => [x!.lon, x!.lat] as [number, number]);
  return wardsAt(pts.filter((_, i) => i % 3 === 0), world.zones, world.wardOf);
}

/** Plans with new or removed routes go to the Commission; frequency changes are staff decisions. */
export const isBigPlan = (edits: Edit[]) => edits.some((e) => e.kind === 'add' || e.kind === 'remove');

export function proposePlan(prev: GameState, edits: Edit[]): GameState {
  return table(prev, 'plan', 'commission', { edits }, {}, true, true);
}

/** Staff's report on a plan: citywide service change and what each ward gains or loses. */
export function planEffects(network: Network, edits: Edit[], world: CouncilWorld, losBefore: ZoneLos, losAfter: ZoneLos | undefined,
  hoursBefore: number, hoursAfter: number): ItemEffects {
  const wards: NonNullable<ItemEffects['wards']> = {};
  const get = (w: number) => (wards[w] ??= { access: 0, removed: [], added: [] });
  for (const e of edits) {
    if (e.kind === 'remove') for (const w of routeWards(network, e.routeId, world)) get(w).removed.push(network.routes.find((x) => x.id === e.routeId)?.shortName ?? e.routeId);
    if (e.kind === 'add') {
      const pts = e.patterns.flatMap((p) => p.stops).map((sid) => e.stops.find((x) => x.id === sid) ?? network.stops.find((x) => x.id === sid))
        .filter(Boolean).map((x) => [x!.lon, x!.lat] as [number, number]);
      for (const w of wardsAt(pts, world.zones, world.wardOf)) get(w).added.push(e.route.shortName);
    }
  }
  if (losAfter) {
    const acc = new Map<number, [number, number]>();
    world.zones.forEach((z, i) => {
      const w = world.wardOf[i]!;
      if (w <= 0 || z.pop <= 0) return;
      const a = acc.get(w) ?? [0, 0];
      acc.set(w, [a[0] + z.pop * losBefore.access[i]!, a[1] + z.pop * losAfter.access[i]!]);
    });
    for (const [w, [b, a]] of acc) {
      const pct = b > 0 ? (100 * (a - b)) / b : 0;
      if (Math.abs(pct) >= 0.5) get(w).access = round1(pct);
    }
  }
  return { service: round1((100 * (hoursAfter - hoursBefore)) / Math.max(1, hoursBefore)), wards };
}

export function setPlanEffects(prev: GameState, itemId: string, effects: ItemEffects): GameState {
  const s = structuredClone(prev);
  const item = s.council?.items.find((i) => i.id === itemId);
  if (!item) return prev;
  item.effects = effects;
  delete item.measuring;
  return s;
}

export function proposeGarage(prev: GameState, start: EconomyStart = ECONOMY_2010): GameState {
  return table(prev, 'garage', 'council', {}, { capital: (start.garageCost.value * prev.costIndex) / 1e6, service: 1 });
}

/** Orders of 50 buses or more go to council. */
export const ORDER_VOTE_THRESHOLD = 50;
export function proposeOrder(prev: GameState, type: BusType, count: number): GameState {
  return table(prev, 'order', 'council', { busType: type, count }, { capital: (BUS_TYPES[type].price * count) / 1e6 });
}

// ------------------------------------------------------------------------------------------ persuasion

export const LOBBY_COST = (score: number) => clamp(Math.round(3 + 6 * Math.max(0, 0.35 - score)), 2, 12);
export const CONSULT_COST = 250_000;
export const STUDY_COST = 150_000;

/** Make the case to one member (or, against a motion, ask them to vote it down): Political Capital. */
export function lobby(prev: GameState, world: CouncilWorld, itemId: string, councillorId: string): GameState {
  const item = prev.council?.items.find((i) => i.id === itemId);
  if (!item || item.lobbied.includes(councillorId)) return prev;
  const lean = whipCount(prev, world, item).find((l) => l.id === councillorId);
  if (!lean) return prev;
  const cost = LOBBY_COST(item.byChair ? lean.score : -lean.score);
  if (prev.council!.capital < cost) return prev;
  const s = structuredClone(prev);
  const c = s.council!;
  c.capital -= cost;
  c.items.find((i) => i.id === itemId)!.lobbied.push(councillorId);
  const m = c.councillors.find((x) => x.id === councillorId);
  if (m) m.relationship = clamp(m.relationship + 2, -50, 50);
  return s;
}

/** Hold consultations (or commission a study): a month's delay and some money; it comes back to you then. */
export function delayFor(prev: GameState, itemId: string, how: 'consult' | 'study'): GameState {
  const s = structuredClone(prev);
  const item = s.council?.items.find((i) => i.id === itemId);
  if (!item || (how === 'consult' ? item.consulted : item.studied)) return prev;
  if (how === 'consult') item.consulted = true;
  else item.studied = true;
  item.status = 'waiting';
  item.due = addDays(s.date, 30);
  s.reserve -= how === 'consult' ? CONSULT_COST : STUDY_COST;
  for (const e of s.events) if (e.decision && e.kind === 'vote' && e.data.item === itemId) e.decision = false;
  return s;
}

/** A softer version: half the levy and fare change; phase a plan or a garage; a smaller order. Once. */
export function amend(prev: GameState, itemId: string): GameState {
  const s = structuredClone(prev);
  const item = s.council?.items.find((i) => i.id === itemId);
  if (!item || item.amended || !item.byChair) return prev;
  item.amended = true;
  const p = item.payload;
  const e = item.effects;
  if (item.kind === 'budget') {
    p.levyChange = round1((p.levyChange ?? 0) / 2);
    p.fareChange = round1((p.fareChange ?? 0) / 2);
    e.taxes = p.levyChange;
    e.fares = p.fareChange;
  } else if (item.kind === 'garage') e.capital = (e.capital ?? 0) / 2;
  else if (item.kind === 'order') {
    p.count = Math.max(1, Math.round((p.count ?? 0) / 2));
    e.capital = (e.capital ?? 0) / 2;
  }
  return s;
}

/** Pull it from the agenda (budgets can't be withdrawn: council would write its own). */
export function withdraw(prev: GameState, itemId: string): GameState {
  const s = structuredClone(prev);
  const item = s.council?.items.find((i) => i.id === itemId);
  if (!item || item.kind === 'budget' || !item.byChair) return prev;
  item.status = 'withdrawn';
  s.council!.capital = clamp(s.council!.capital - 2, 0, 100);
  for (const e of s.events) if (e.decision && e.kind === 'vote' && e.data.item === itemId) e.decision = false;
  return s;
}

// ------------------------------------------------------------------------------------------ the vote

const news = (s: GameState, kind: GameEvent['kind'], data: GameEvent['data'] = {}) =>
  s.events.push({ id: `${kind}-${s.date}-${s.events.length}`, kind, date: s.date, decision: false, data });

/** What council does with a budget it rejects: the median member's levy, milder fare changes. */
function councilBudget(c: CouncilState, item: AgendaItem): BudgetChoice {
  const ideal = c.councillors.map((m) => clamp(2.5 - 3 * m.fiscal, 0, 6)).sort((a, b) => a - b);
  const levyChange = round1(ideal[Math.floor(ideal.length / 2)]!);
  const fare = item.payload.fareChange ?? 0;
  return { levyChange, fareChange: fare > 2.5 ? round1(fare / 2) : fare, maintenance: 1 };
}

export function callVote(prev: GameState, world: CouncilWorld, itemId: string, network?: Network, start: EconomyStart = ECONOMY_2010): GameState {
  const item0 = prev.council?.items.find((i) => i.id === itemId);
  if (!item0 || item0.measuring) return prev;
  const t = tally(prev, world, item0);
  let s = structuredClone(prev);
  const c = s.council!;
  const item = c.items.find((i) => i.id === itemId)!;
  const passed = t.yes >= t.needed;
  item.status = passed ? 'passed' : 'failed';
  item.votes = t.votes;
  item.result = { yes: t.yes, no: t.no };
  for (const e of s.events) if (e.decision && e.kind === 'vote' && e.data.item === itemId) e.decision = false;
  const won = passed === item.byChair;
  c.capital = clamp(c.capital + (won ? 1 : item.byChair ? -6 : -4), 0, 100);
  // members remember how it went
  for (const m of c.councillors) {
    const v = t.votes[m.id];
    if (!v) continue;
    if (won && (v === 'yes') !== item.byChair) m.relationship = clamp(m.relationship - 1, -50, 50);
    const w = item.effects.wards?.[m.ward];
    if (passed && w) m.relationship = clamp(m.relationship + (w.removed.length ? -6 : 0) + (w.added.length || w.access > 1 ? 4 : 0), -50, 50);
  }
  news(s, 'voteResult', { item: item.id, kind: item.kind, passed: passed ? 1 : 0, yes: t.yes, no: t.no, byChair: item.byChair ? 1 : 0,
    route: item.payload.routeName ?? '' });
  const p = item.payload;
  if (item.kind === 'budget') {
    const choice = passed ? { levyChange: p.levyChange ?? 0, fareChange: p.fareChange ?? 0, maintenance: p.maintenance ?? 1 } : councilBudget(c, item);
    s = resolve(s, p.budgetEvent!, { kind: 'budget', choice }, start);
    if (!passed) news(s, 'councilBudget', { levyChange: choice.levyChange, fareChange: choice.fareChange });
  } else if (item.kind === 'plan' && passed) {
    s = passPlan(s, p.edits ?? [], world, network);
  } else if (item.kind === 'garage' && passed) {
    s = buildGarage(s, start);
  } else if (item.kind === 'order' && passed) {
    s = orderBuses(s, p.busType as BusType, p.count ?? 0);
  } else if (item.kind.startsWith('deficit')) {
    const asked = item.kind === 'deficitLevy' ? 'levy' : item.kind === 'deficitCut' ? 'cut' : 'borrow';
    const fiscal = [...c.councillors.map((m) => m.fiscal)].sort((a, b) => a - b)[12]!;
    const choice = passed ? asked : fiscal > 0.2 ? (asked === 'cut' ? 'borrow' : 'cut') : asked === 'levy' ? 'borrow' : 'levy';
    s = resolve(s, p.deficitEvent!, { kind: 'deficit', choice }, start);
    if (!passed) news(s, 'directive', { choice });
  } else if (item.kind === 'restoreRoute' && passed) {
    c.directions.push({ date: s.date, routeId: p.routeId!, routeName: p.routeName ?? '' });
    news(s, 'directive', { choice: 'restore', route: p.routeName ?? '' });
  } else if (item.kind === 'labourDeal') {
    s = settleLabour(s, passed, p.wage ?? LABOUR_2010.baseline, p.scheduling ?? 'keep', p.years ?? 3);
  }
  return s;
}

/** A plan the Commission passed: scheduled; routes on federal parkways need the NCC's approval. */
function passPlan(prev: GameState, edits: Edit[], world: CouncilWorld, network?: Network): GameState {
  let s = prev;
  const kept: Edit[] = [];
  for (const e of edits) {
    if (e.kind === 'add') {
      const names = [e.route.longName, ...e.stops.map((x) => x.name)].join(' ');
      if (/parkway|promenade|driveway|colonel by/i.test(names)) {
        const ok = rand(s.seed, `ncc:${e.route.id}`) < 0.7;
        news(s, 'nccReview', { route: e.route.shortName, approved: ok ? 1 : 0 });
        if (!ok) continue;
      }
    }
    if (e.kind === 'remove') {
      const name = network?.routes.find((r) => r.id === e.routeId)?.shortName ?? e.routeId.replace(/^oct-/, '');
      const wards = network ? routeWards(network, e.routeId, world) : [];
      (s.council!.removals ??= []).push({ routeId: e.routeId, routeName: name, date: s.date, wards });
    }
    kept.push(e);
  }
  s = schedulePlan(s, [...s.pending, ...kept]);
  return s;
}

// ------------------------------------------------------------------------------------------ labour

/** Your offer to the union. Close enough (and no scheduling fight): a deal for council to ratify. */
export function negotiate(prev: GameState, world: CouncilWorld, offer: { wage: number; scheduling: 'keep' | 'reform'; years: number }): GameState {
  const s0 = prev.council?.labour.talks;
  if (!s0) return prev;
  let s = structuredClone(prev);
  const c = s.council!;
  for (const e of s.events) if (e.decision && e.kind === 'labour') e.decision = false;
  const talks = c.labour.talks!;
  const reform = offer.scheduling === 'reform';
  const accepts = reform ? offer.wage >= talks.demand + 0.5 : offer.wage >= talks.demand - 0.3;
  if (accepts) {
    delete c.labour.talks;
    return table(s, 'labourDeal', 'council', { wage: offer.wage, scheduling: offer.scheduling, years: offer.years }, { wage: offer.wage });
  }
  if (talks.round < 3) {
    talks.round++;
    talks.demand = round1(talks.demand - 0.2);
    c.labour.nextTalks = addDays(s.date, 14);
    news(s, 'labour', { round: talks.round - 1, rejected: 1 });
    return s;
  }
  // no deal: a strike, or the union grudgingly signs
  const approval = s.opinion ? opinionSummary(s.opinion, world, s.date).approval : 50;
  const p = clamp(0.35 + 0.35 * (talks.demand - offer.wage) + (reform ? 0.3 : 0) - (approval - 50) / 100, 0.1, 0.9);
  delete c.labour.talks;
  if (rand(s.seed, `strike:${s.date}`) < p) {
    c.labour.strikeFrom = s.date > c.labour.until ? s.date : c.labour.until;
    c.labour.offer = offer.wage;
    news(s, 'labour', { strikeVote: 1, from: c.labour.strikeFrom });
  } else {
    s = settleLabour(s, true, offer.wage, 'keep', offer.years, true);
  }
  return s;
}

function settleLabour(prev: GameState, ratified: boolean, wage: number, scheduling: 'keep' | 'reform', years: number, protest = false): GameState {
  const s = structuredClone(prev);
  settleInto(s, ratified, wage, scheduling, years, protest);
  return s;
}

/** Settle (or fail to ratify) a contract (mutates `s`). */
function settleInto(s: GameState, ratified: boolean, wage: number, scheduling: 'keep' | 'reform', years: number, protest = false) {
  const c = s.council!;
  if (!ratified) {
    // council won't ratify: back to the table, the union angrier
    c.labour.talks = { round: 2, demand: round1((c.labour.offer ?? LABOUR_2010.demand) + 0.3), opened: s.date };
    c.labour.nextTalks = addDays(s.date, 7);
    return;
  }
  c.labour.wage = wage;
  c.labour.until = addMonths(c.labour.until > s.date ? c.labour.until : s.date, years * 12);
  if (scheduling === 'reform') {
    c.labour.scheduling = 'reformed';
    s.costIndex *= 0.97;
  }
  if (c.labour.strike) {
    delete c.labour.strike;
    s.strike = false;
    news(s, 'strikeEnds', { wage });
  }
  delete c.labour.strikeFrom;
  delete c.labour.offer;
  news(s, 'labourDeal', { wage, years, protest: protest ? 1 : 0, reform: scheduling === 'reform' ? 1 : 0 });
}

/** During a strike: meet the union's demand (it ends in days), go to arbitration (two weeks), or hold out. */
export function strikeChoice(prev: GameState, choice: 'meet' | 'arbitration' | 'holdOut'): GameState {
  const s = structuredClone(prev);
  const c = s.council!;
  if (!c.labour.strike) return prev;
  for (const e of s.events) if (e.decision && e.kind === 'strike') e.decision = false;
  if (choice === 'meet') c.labour.settle = { date: addDays(s.date, 2), wage: round1((c.labour.offer ?? LABOUR_2010.baseline) + 0.6) };
  else if (choice === 'arbitration') c.labour.settle = { date: addDays(s.date, 14), wage: round1((c.labour.offer ?? LABOUR_2010.baseline) + 0.4) };
  else c.labour.nextStrikeCheck = addDays(s.date, 10);
  return s;
}

// ------------------------------------------------------------------------------------------ partners

export type StoProposal = 'fareIntegration' | 'sharedStops' | 'downtownLayover' | 'costRecovery' | 'rapibusLink';

const STO_PROPOSALS: Record<StoAgenda, StoProposal[]> = {
  integration: ['fareIntegration', 'sharedStops', 'downtownLayover'],
  rapibus: ['rapibusLink', 'sharedStops'],
  taxFreeze: ['costRecovery', 'downtownLayover'],
};

/** STO's offer: yes or no (light-touch: no vote). */
export function answerSto(prev: GameState, accept: boolean): GameState {
  const ev = prev.events.find((e) => e.decision && e.kind === 'sto');
  if (!ev) return prev;
  const s = structuredClone(prev);
  const c = s.council!;
  s.events.find((e) => e.id === ev.id)!.decision = false;
  const k = ev.data.proposal as StoProposal;
  if (accept) {
    c.sto.agreements.push(k);
    c.sto.relationship = clamp(c.sto.relationship + 8, -50, 50);
    if (k === 'fareIntegration') s.service = { ...s.service, boardings: s.service.boardings * 1.005 };
    if (k === 'sharedStops') s.reserve -= 300_000;
    if (k === 'rapibusLink') s.reserve -= 1_500_000;
  } else {
    c.sto.relationship = clamp(c.sto.relationship - 10, -50, 50);
    if (k === 'downtownLayover') c.sto.unilateral = addDays(s.date, 75);
  }
  return s;
}

const FUNDING = {
  provincialBuses: { offered: '2011-06-15', until: '2013-12-31', perBus: 200_000, maxFareRise: 2.5 },
  federalGarage: { offered: '2012-04-16', until: '2013-06-30', amount: 30_000_000 },
};

export function answerFunding(prev: GameState, accept: boolean): GameState {
  const ev = prev.events.find((e) => e.decision && e.kind === 'funding');
  if (!ev) return prev;
  const s = structuredClone(prev);
  s.events.find((e) => e.id === ev.id)!.decision = false;
  const f = s.council!.funding.find((x) => x.id === ev.data.offer);
  if (f) f.status = accept ? 'accepted' : 'declined';
  return s;
}

/** Election night and other notices that only need acknowledging. */
export function acknowledge(prev: GameState, eventId: string): GameState {
  return { ...prev, events: prev.events.map((e) => (e.id === eventId ? { ...e, decision: false } : e)) };
}

// ------------------------------------------------------------------------------------------ elections

const FIRST = ['Alex', 'Brigitte', 'Carlos', 'Diane', 'Émile', 'Fiona', 'Guy', 'Hannah', 'Isaac', 'Josée', 'Kevin', 'Lina', 'Marc-André', 'Nadia',
  'Oliver', 'Patricia', 'Rémi', 'Sarah', 'Thomas', 'Uma', 'Victor', 'Wendy', 'Yves', 'Zara'];
const LAST = ['Arsenault', 'Bergeron', 'Campbell', 'Dubé', 'Ellis', 'Fortin', 'Grant', 'Hébert', 'Iqbal', 'Jensen', 'Kaur', 'Lavoie', 'Murray', 'Nguyen',
  'Okafor', 'Paquette', 'Quinn', 'Rossi', 'Simard', 'Taylor', 'Vachon', 'Walsh', 'Young', 'Zhou'];

const PLATFORM_ATTITUDES: Record<Platform, { fiscal: number; transit: number; relationship: number }> = {
  transit: { fiscal: -0.3, transit: 0.7, relationship: 6 },
  lowTax: { fiscal: 0.7, transit: -0.1, relationship: -6 },
  rural: { fiscal: 0.6, transit: -0.4, relationship: -8 },
  centre: { fiscal: 0.2, transit: 0.2, relationship: 0 },
};

/** Leaning your way: transit over taxes, or on good terms with you. */
export const isAlly = (m: Councillor) => m.transit - m.fiscal > 0.2 || m.relationship >= 15;

function runElection(s: GameState, world: CouncilWorld): ElectionRecord {
  const c = s.council!;
  const moods = wardMoods(s, world);
  const city = moods[0]!.approval;
  const before = c.councillors.filter(isAlly).length;
  const results: ElectionResult[] = [];
  const next: Councillor[] = [];
  for (const m of c.councillors) {
    const mood = moods[m.ward] ?? moods[0]!;
    const r = (k: string) => rand(s.seed, `elect:${s.date}:${m.ward}:${k}`);
    const retires = r('retire') < (m.since < 2000 ? 0.3 : 0.1);
    const align = clamp((m.transit - m.fiscal) / 2 + m.relationship / 60, -1, 1);
    const rural = !!WARDS_2010.find((w) => w.id === m.ward)?.rural;
    const platform: Platform = mood.service < -8 ? 'transit' : mood.value < -8 ? 'lowTax' : rural ? 'rural' : r('plat') < 0.5 ? 'centre' : 'lowTax';
    const share = clamp(0.5 + (retires ? 0 : 0.08) + align * (mood.approval - 50) / 100 * 1.5 + (r('swing') - 0.5) * 0.16, 0.2, 0.85);
    const held = !retires && share >= 0.5;
    let winner = m;
    if (!held) {
      const att = PLATFORM_ATTITUDES[platform];
      const name = `${FIRST[Math.floor(r('first') * FIRST.length)]} ${LAST[Math.floor(r('last') * LAST.length)]}`;
      winner = { id: `${m.ward === 0 ? 'mayor' : `w${m.ward}`}-${s.date.slice(0, 4)}`, ward: m.ward, name, fiscal: att.fiscal, transit: att.transit,
        responsiveness: 0.55, relationship: att.relationship, platform, since: Number(s.date.slice(0, 4)) };
    }
    next.push(winner);
    const res = { ward: m.ward, incumbent: m.name, winner: winner.name, held, share: round1(100 * (held ? share : 1 - share)), platform: winner.platform };
    if (m.ward === 0) results.unshift(res);
    else results.push(res);
  }
  c.commission = c.commission.map((id) => {
    const old = c.councillors.find((x) => x.id === id);
    return next.find((x) => x.ward === old?.ward)?.id ?? id;
  });
  c.councillors = next;
  const after = next.filter(isAlly).length;
  c.capital = clamp(c.capital + (after >= before ? 8 : -8), 0, 100);
  const mayor = results.find((r) => r.ward === 0);
  return { city: 'ottawa', date: s.date, approval: city, wards: results.filter((r) => r.ward !== 0), ...(mayor ? { mayor } : {}), allies: [before, after] };
}

// ------------------------------------------------------------------------------------------ the day

const decisionEvent = (s: GameState, kind: GameEvent['kind'], data: GameEvent['data'] = {}) =>
  s.events.push({ id: `${kind}-${s.date}-${s.events.length}`, kind, date: s.date, decision: true, data });

/** Council business for the day that ended (`ended`), with the state as it stands after it. */
export function advanceCouncil(prev: GameState, world: CouncilWorld, ended: string, start: EconomyStart = ECONOMY_2010): GameState {
  if (!prev.council) return prev;
  const s = structuredClone(prev);
  const c = s.council!;
  const today = s.date;
  const d = toDate(today);
  const approval = s.opinion ? opinionSummary(s.opinion, world, today).approval : 50;
  // items that were consulted on or studied come back
  for (const item of c.items) {
    if (item.status === 'waiting' && item.due <= today) {
      item.status = 'open';
      s.events.push(voteEvent(item, today));
    }
  }
  // Political Capital follows approval, week by week, and fades back toward 35 unless it's used
  // (unspent goodwill doesn't keep: at 47% approval it settles near 50); delivered plans earn more
  if (toDate(ended).getUTCDay() === 0) {
    c.capital = round1(clamp(c.capital + clamp(0.15 * (approval - 45), -1.5, 1.5) - CAPITAL_FADE * (c.capital - 35), 0, 100));
    c.history.push({ date: ended, capital: c.capital });
    if (c.history.length > 260) c.history.shift();
  }
  if (s.applied.length > c.seen.applied) c.capital = clamp(c.capital + 4, 0, 100);
  const newEvents = s.events.filter((e) => !c.seen.events.includes(e.id));
  // funding: grants on deliveries and garages; a fare hike above the cap breaks the provincial deal
  const prov = c.funding.find((f) => f.id === 'provincialBuses' && f.status === 'accepted');
  if (prov) {
    for (const e of newEvents) {
      if (e.kind === 'delivery' && !e.data.held && today <= prov.until) {
        const g = Number(e.data.count) * FUNDING.provincialBuses.perBus;
        s.capitalReserve += g;
        prov.received += g;
      }
    }
    if (today > prov.until) prov.status = 'done';
  }
  const fed = c.funding.find((f) => f.id === 'federalGarage' && f.status === 'accepted');
  if (fed && s.garages.length > c.seen.garages) {
    s.capitalReserve += FUNDING.federalGarage.amount;
    fed.received = FUNDING.federalGarage.amount;
    fed.status = 'done';
    news(s, 'fundingNews', { offer: 'federalGarage', received: 1 });
  } else if (fed && today > fed.until) {
    fed.status = 'done';
  }
  for (const e of newEvents) {
    if (e.kind === 'budget' || e.kind === 'vote') continue;
    if (e.kind === 'voteResult' && prov && e.data.kind === 'budget') {
      const item = c.items.find((i) => i.id === e.data.item);
      const fare = e.data.passed ? item?.payload.fareChange ?? 0 : 0;
      if (fare > FUNDING.provincialBuses.maxFareRise) {
        s.reserve -= prov.received;
        prov.status = 'clawedBack';
        news(s, 'fundingNews', { offer: 'provincialBuses', clawedBack: Math.round(prov.received) });
      }
    }
  }
  for (const [id, f] of Object.entries(FUNDING) as [keyof typeof FUNDING, (typeof FUNDING)[keyof typeof FUNDING]][]) {
    if (today === f.offered && !c.funding.some((x) => x.id === id)) {
      c.funding.push({ id, status: 'offered', until: f.until, received: 0 });
      decisionEvent(s, 'funding', { offer: id });
    }
  }
  // motions: a removed route's wards unhappy months later
  if (d.getUTCDay() === 1) {
    const moods = wardMoods(s, world);
    for (const r of c.removals ?? []) {
      if (r.motion || r.date < addDays(today, -200)) continue;
      const wards = r.wards.length ? r.wards : [];
      const unhappy = wards.find((w) => (moods[w]?.approval ?? 50) < 46);
      if (unhappy && r.date <= addDays(today, -21)) {
        r.motion = true;
        const mover = c.councillors.find((m) => m.ward === unhappy);
        const effects: ItemEffects = { service: 0.5, wards: Object.fromEntries(wards.map((w) => [w, { access: 2, removed: [], added: [r.routeName] }])) };
        tableInto(s, 'restoreRoute', 'council', { routeId: r.routeId, routeName: r.routeName }, effects, false);
        news(s, 'motion', { route: r.routeName, mover: mover?.name ?? '', ward: unhappy });
      }
    }
  }
  // directions: restored at the next service change
  if (serviceChangeDates(d.getUTCFullYear()).includes(today)) {
    for (const dir of c.directions.filter((x) => !x.done)) {
      s.applied = s.applied.filter((e) => !(e.kind === 'remove' && e.routeId === dir.routeId));
      s.serviceFor = 0; // the game re-measures the network
      dir.done = today;
      news(s, 'routeRestored', { route: dir.routeName });
    }
  }
  // the mayor and the Commission
  const mayor = c.councillors.find((m) => m.ward === 0);
  if (mayor && mayor.relationship < -20 && !c.mayorCooled) {
    c.mayorCooled = today;
    news(s, 'mayorCools', { name: mayor.name });
  }
  if (d.getUTCDate() === 1 && c.capital < 8 && approval < 42 && (!c.reshuffled || c.reshuffled < addDays(today, -365))) {
    const outgoing = c.commission.map((id) => c.councillors.find((m) => m.id === id)!).filter(Boolean).sort((a, b) => b.transit - a.transit).slice(0, 2);
    const incoming = c.councillors.filter((m) => !c.commission.includes(m.id) && m.ward !== 0).sort((a, b) => b.fiscal - a.fiscal).slice(0, 2);
    c.commission = [...c.commission.filter((id) => !outgoing.some((o) => o.id === id)), ...incoming.map((m) => m.id)];
    c.reshuffled = today;
    news(s, 'reshuffle', { out: outgoing.map((m) => m.name).join(', '), in: incoming.map((m) => m.name).join(', ') });
  }
  // labour: talks, strike votes, strikes and settlements; wage costs from January
  const L = c.labour;
  if (today === LABOUR_2010.talksOpen || (!L.talks && !L.strike && !L.strikeFrom && today === addDays(L.until, -60) && today > LABOUR_2010.talksOpen)) {
    L.talks = { round: 1, demand: today === LABOUR_2010.talksOpen ? LABOUR_2010.demand : round1(LABOUR_2010.demand + 0.2), opened: today };
    decisionEvent(s, 'labour', { round: 1, demand: L.talks.demand });
  } else if (L.talks && L.nextTalks === today) {
    decisionEvent(s, 'labour', { round: L.talks.round, demand: L.talks.demand });
  }
  if (L.strikeFrom && today >= L.strikeFrom && !L.strike) {
    L.strike = today;
    s.strike = true;
    L.nextStrikeCheck = addDays(today, 10);
    news(s, 'strike', { started: 1 });
    decisionEvent(s, 'strike', { days: 0 });
  } else if (L.strike) {
    if (L.settle && today >= L.settle.date) {
      const wage = L.settle.wage;
      delete L.settle;
      settleInto(s, true, wage, 'keep', 3);
    } else if (!L.settle && today >= addDays(L.strike, 21) && rand(s.seed, `cave:${today}`) < 0.03) {
      settleInto(s, true, round1((L.offer ?? LABOUR_2010.baseline) + 0.3), 'keep', 3);
    } else if (!L.settle && L.nextStrikeCheck === today) {
      decisionEvent(s, 'strike', { days: Math.round((d.getTime() - toDate(L.strike).getTime()) / 86_400_000) });
    }
  }
  if (d.getUTCMonth() === 0 && d.getUTCDate() === 1) s.costIndex *= 1 + LABOUR_2010.wageShare * (c.labour.wage - LABOUR_2010.baseline) / 100;
  // STO: proposals now and then; acting on its own when refused; Gatineau's election
  const sto = c.sto;
  if (today === sto.next) {
    const list = STO_PROPOSALS[sto.agenda];
    const k = list.find((x) => !sto.agreements.includes(x)) ?? list[Math.floor(rand(s.seed, `sto:${today}`) * list.length)]!;
    decisionEvent(s, 'sto', { proposal: k });
    sto.next = addDays(today, 180 + Math.floor(rand(s.seed, `stonext:${today}`) * 90));
  }
  if (sto.unilateral === today) {
    news(s, 'stoNews', { kind: 'unilateral' });
    delete sto.unilateral;
  }
  if (today === '2013-10-19' && sto.agenda !== 'taxFreeze') news(s, 'stoNews', { kind: 'rapibus' });
  if (today === TERM.gatineauElection) {
    const gat = s.opinion ? opinionSummary(s.opinion, world, today, (z) => z.city === 'gatineau').approval : 50;
    sto.agenda = gat < 46 ? 'taxFreeze' : 'integration';
    sto.relationship = clamp(sto.relationship + (sto.agenda === 'taxFreeze' ? -10 : 5), -50, 50);
    c.elections.push({ city: 'gatineau', date: today, approval: gat, wards: [], allies: [0, 0], sto: sto.agenda });
    news(s, 'stoNews', { kind: 'election', agenda: sto.agenda });
  }
  // Ottawa votes
  if (today === TERM.ottawaElection || today === TERM.nextOttawa) {
    const rec = runElection(s, world);
    c.elections.push(rec);
    decisionEvent(s, 'election', { allies: rec.allies[1], before: rec.allies[0], approval: rec.approval });
  }
  c.seen = { events: s.events.map((e) => e.id), applied: s.applied.length, garages: s.garages.length };
  return s;
}

