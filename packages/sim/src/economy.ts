import {
  BUS_TYPES, ECONOMY_2010,
  type BudgetChoice, type BusType, type Edit, type EconomyStart, type FleetGroup, type GameEvent, type GameState, type MonthRecord,
} from '@otc/shared';

/**
 * Money and fleet (PLAN §6, M5): a pure, deterministic monthly simulation of OC Transpo's books
 * from 1 December 2010. The game calls `advanceDay` as days pass; decisions arrive as events.
 *
 * - Ridership comes from the demand model for the network in operation, times the season,
 *   population growth, the fare elasticity, reliability and any service cuts.
 * - Costs are bus-hours × cost per hour (with inflation), Para Transpo, fixed costs and debt.
 *   Maintenance is a lever: underfunding builds a backlog, the backlog causes missed trips.
 * - Fleet: buses age and retire; orders arrive after their lead time if a garage has room;
 *   if the peak needs more buses than are available, trips are missed.
 * - Plans take effect on the next service-change date.
 */

const DAY = 86_400_000;
export const toDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => isoDate(new Date(toDate(iso).getTime() + n * DAY));
export function addMonths(iso: string, n: number): string {
  const d = toDate(iso);
  d.setUTCMonth(d.getUTCMonth() + n);
  return isoDate(d);
}
const sundayOnOrBefore = (d: Date) => new Date(d.getTime() - d.getUTCDay() * DAY);
const sundayOnOrAfter = (d: Date) => new Date(d.getTime() + ((7 - d.getUTCDay()) % 7) * DAY);

/** OC Transpo-style service changes: late April, late June, the Sunday before Labour Day, mid-December. */
export function serviceChangeDates(year: number): string[] {
  const lastSun = (m: number) => sundayOnOrBefore(new Date(Date.UTC(year, m + 1, 0, 12)));
  const labourDay = (() => {
    const d = new Date(Date.UTC(year, 8, 1, 12));
    return new Date(d.getTime() + ((8 - d.getUTCDay()) % 7) * DAY); // first Monday of September
  })();
  return [lastSun(3), lastSun(5), sundayOnOrBefore(labourDay), sundayOnOrAfter(new Date(Date.UTC(year, 11, 15, 12)))].map(isoDate);
}

export function nextServiceChange(iso: string): string {
  const y = toDate(iso).getUTCFullYear();
  return [...serviceChangeDates(y), ...serviceChangeDates(y + 1)].find((d) => d > iso)!;
}

const annuity = (r: number, n: number) => r / (1 - (1 + r) ** -n);

// ------------------------------------------------------------------------------------------ fleet

export interface FleetStatus {
  byType: Record<BusType, { count: number; avgAge: number }>;
  buses: number;
  rail: number;
  avgAge: number;
  /** buses needed at the peak, with spares */
  required: number;
  shortfall: number;
  garageCapacity: number;
  /** buses ordered and not yet delivered */
  onOrder: number;
}

export function fleetStatus(s: GameState, start: EconomyStart = ECONOMY_2010): FleetStatus {
  const year = toDate(s.date).getUTCFullYear() + toDate(s.date).getUTCMonth() / 12;
  const byType = Object.fromEntries(Object.keys(BUS_TYPES).map((t) => [t, { count: 0, avgAge: 0 }])) as FleetStatus['byType'];
  let ageSum = 0;
  let buses = 0;
  for (const g of s.fleet) {
    const b = byType[g.type];
    b.avgAge = (b.avgAge * b.count + (year - g.year) * g.count) / Math.max(1, b.count + g.count);
    b.count += g.count;
    if (g.type !== 'rail') {
      buses += g.count;
      ageSum += (year - g.year) * g.count;
    }
  }
  const required = Math.ceil(s.service.peakVehicles * s.serviceLevel * (1 + start.spareRatio.value));
  const garageCapacity = s.garages.filter((g) => !g.opens || g.opens <= s.date).reduce((a, g) => a + g.capacity, 0);
  return {
    byType, buses, rail: byType.rail.count, avgAge: buses ? ageSum / buses : 0, required,
    shortfall: Math.max(0, required - buses), garageCapacity,
    onOrder: s.orders.filter((o) => o.type !== 'rail').reduce((a, o) => a + o.count, 0),
  };
}

/** Share of scheduled trips missed: breakdowns from the maintenance backlog and old buses, plus any fleet shortfall. */
export function missedShare(s: GameState, start: EconomyStart = ECONOMY_2010): number {
  const f = fleetStatus(s, start);
  const breakdowns = 0.004 + (s.backlog / 100_000_000) * 0.03 + Math.max(0, f.avgAge - 10) * 0.002;
  const shortfall = f.required > 0 ? f.shortfall / f.required : 0;
  return Math.min(0.5, breakdowns + shortfall);
}

// ------------------------------------------------------------------------------------------ the books

function yearsSince2011(iso: string): number {
  const d = toDate(iso);
  return d.getUTCFullYear() - 2011 + d.getUTCMonth() / 12;
}

/** The weekday boardings the network in operation carries this month. */
export function monthBoardings(s: GameState, start: EconomyStart = ECONOMY_2010, iso = s.date): number {
  const m = toDate(iso).getUTCMonth();
  return s.service.boardings * start.seasonal.values[m]! * (1 + start.ridershipGrowth.value) ** Math.max(0, yearsSince2011(iso))
    * s.fareIndex ** start.fareElasticity.value * (1 - missedShare(s, start)) * s.serviceLevel ** 0.6;
}

/** One month's revenues and costs (no deliveries or borrowing): the monthly part of the books. */
export function monthFlows(s: GameState, start: EconomyStart = ECONOMY_2010, iso = s.date) {
  const days = start.weekdaysPerYear.value / 12;
  const boardings = monthBoardings(s, start, iso);
  const fares = boardings * days * start.revenuePerBoarding.value * s.fareIndex;
  const f = fleetStatus(s, start);
  const mixFactor = f.buses ? s.fleet.filter((g) => g.type !== 'rail').reduce((a, g) => a + BUS_TYPES[g.type].costFactor * g.count, 0) / f.buses : 1;
  const busCost = s.service.vehicleHours * days * start.costPerVehicleHour.value * s.costIndex * s.serviceLevel * mixFactor;
  const maintenanceNeed = busCost * start.maintenanceShare.value;
  return {
    boardings, fares,
    levy: s.levy / 12, gasTax: start.gasTax.value / 12, other: (start.otherRevenue.value / 12) * s.costIndex,
    operations: busCost - maintenanceNeed, maintenance: maintenanceNeed * s.maintenance, maintenanceNeed,
    para: (start.paraTranspo.value / 12) * s.costIndex, fixed: (start.fixedCosts.value / 12) * s.costIndex,
    debtService: (s.debt * annuity(start.borrowingRate.value, start.borrowingYears.value)) / 12,
  };
}

export interface YearProjection {
  revenue: number;
  cost: number;
  balance: number;
  lines: Record<string, number>;
}

/** The coming 12 months at today's settings (what the budget is set against). */
export function projectYear(s: GameState, start: EconomyStart = ECONOMY_2010, from = s.date, levy = s.levy): YearProjection {
  const lines: Record<string, number> = { fares: 0, levy: 0, gasTax: 0, other: 0, operations: 0, maintenance: 0, para: 0, fixed: 0, debtService: 0 };
  const t = { ...s, levy };
  for (let k = 0; k < 12; k++) {
    const fl = monthFlows(t, start, addMonths(from, k));
    for (const key of Object.keys(lines)) lines[key]! += fl[key as keyof typeof fl] as number;
  }
  const revenue = lines.fares! + lines.levy! + lines.gasTax! + lines.other!;
  const cost = lines.operations! + lines.maintenance! + lines.para! + lines.fixed! + lines.debtService!;
  return { revenue, cost, balance: revenue - cost, lines };
}

/** The levy that balances the coming 12 months at today's settings. */
export function balancingLevy(s: GameState, start: EconomyStart = ECONOMY_2010, from = s.date): number {
  const p = projectYear(s, start, from, 0);
  return Math.max(0, p.cost - p.revenue);
}

// ------------------------------------------------------------------------------------------ the game

export interface ServiceFigures {
  /** weekday OC Transpo boardings (from the demand model) */
  boardings: number;
  /** weekday OC Transpo bus-hours */
  vehicleHours: number;
  /** most OC Transpo buses in service at once */
  peakVehicles: number;
}

const ev = (kind: GameEvent['kind'], date: string, decision: boolean, data: GameEvent['data'] = {}): GameEvent =>
  ({ id: `${kind}-${date}`, kind, date, decision, data });

/** A new campaign on 1 December 2010; the first task is the 2011 budget. */
export function newGame(service: ServiceFigures, start: EconomyStart = ECONOMY_2010): GameState {
  const orders: GameState['orders'] = [];
  for (const o of start.orders) {
    for (let k = 0, left = o.count; left > 0; k++, left -= o.perMonth) {
      orders.push({ type: o.type, model: o.model, count: Math.min(o.perMonth, left), due: addMonths(o.from, k), paid: true,
        ...(o.replaces ? { replaces: o.replaces } : {}) });
    }
  }
  const s: GameState = {
    version: 1, date: start.date, reserve: start.reserve.value, capitalReserve: 0, debt: 0, levy: 0, costIndex: 1, fareIndex: 1,
    maintenance: 1, serviceLevel: 1, backlog: 0, fleet: structuredClone(start.fleet), orders, garages: structuredClone(start.garages),
    applied: [], pending: [], service, ledger: [], events: [], seed: 2010,
  };
  s.levy = balancingLevy(s, start, '2011-01-01');
  s.events.push(ev('welcome', s.date, false), ev('budget', s.date, true, { year: 2011, balancing: Math.round(s.levy), last: Math.round(s.levy) }));
  return s;
}

export function openDecision(s: GameState): GameEvent | undefined {
  return s.events.find((e) => e.decision);
}

/** Advance one day: deliveries, service changes, the monthly books, the new year and the autumn budget. */
export function advanceDay(prev: GameState, start: EconomyStart = ECONOMY_2010): GameState {
  if (openDecision(prev)) return prev; // the game waits for the player
  const s: GameState = structuredClone(prev);
  const today = addDays(s.date, 1);
  const d = toDate(today);
  // news fades after two months (decisions stay until answered)
  s.events = s.events.filter((e) => e.decision || e.date >= addDays(today, -60));
  // a new month: close the books of the one that ended
  if (d.getUTCDate() === 1) closeMonth(s, start, s.date);
  s.date = today;
  if (d.getUTCMonth() === 0 && d.getUTCDate() === 1) newYear(s, start);
  // deliveries, if a garage has room
  const f = fleetStatus(s, start);
  let room = f.garageCapacity - f.buses;
  for (const o of s.orders.filter((x) => x.due <= today)) {
    if (o.type !== 'rail' && o.count > room) {
      o.due = addMonths(today, 1); // no room: the factory holds them
      s.events.push(ev('delivery', today, false, { count: o.count, model: o.model, held: 1 }));
      continue;
    }
    let retire = o.replaces ? o.count : 0;
    for (const model of o.replaces ?? []) {
      for (const g of s.fleet.filter((x) => x.model === model)) {
        const k = Math.min(retire, g.count);
        g.count -= k;
        retire -= k;
      }
    }
    s.fleet = s.fleet.filter((g) => g.count > 0);
    room -= o.type === 'rail' ? 0 : o.count - (o.replaces ? o.count - retire : 0);
    s.fleet.push({ type: o.type, model: o.model, year: d.getUTCFullYear(), count: o.count });
    if (!o.paid) payCapital(s, start, BUS_TYPES[o.type].price * o.count);
    s.orders = s.orders.filter((x) => x !== o);
    s.events.push(ev('delivery', today, false, { count: o.count, model: o.model }));
  }
  for (const g of s.garages) if (g.opens === today) s.events.push(ev('garageOpen', today, false, { name: g.name, capacity: g.capacity }));
  // service change: the scheduled plan goes into operation
  if (serviceChangeDates(d.getUTCFullYear()).includes(today) && s.pending.length) {
    s.applied = [...s.applied, ...s.pending];
    s.events.push(ev('serviceChange', today, false, { changes: s.pending.length }));
    s.pending = [];
  }
  // the autumn budget for next year
  if (d.getUTCMonth() === 10 && d.getUTCDate() === 1) {
    const y = d.getUTCFullYear() + 1;
    s.events.push(ev('budget', today, true, { year: y, balancing: Math.round(balancingLevy(s, start, `${y}-01-01`)), last: Math.round(s.levy) }));
  }
  return s;
}

function payCapital(s: GameState, start: EconomyStart, amount: number): number {
  const fromReserve = Math.min(Math.max(0, s.capitalReserve), amount);
  s.capitalReserve -= fromReserve;
  const borrowed = amount - fromReserve;
  s.debt += borrowed;
  return borrowed;
}

function closeMonth(s: GameState, start: EconomyStart, lastDay: string) {
  const fl = monthFlows(s, start, lastDay);
  s.capitalReserve += start.capitalEnvelope.value / 12;
  const debtBefore = s.debt;
  // maintenance below need builds a backlog; above need works it off
  s.backlog = Math.max(0, s.backlog + fl.maintenanceNeed - fl.maintenance);
  const revenue = fl.fares + fl.levy + fl.gasTax + fl.other;
  const cost = fl.operations + fl.maintenance + fl.para + fl.fixed + fl.debtService;
  s.reserve += revenue - cost;
  const rec: MonthRecord = {
    month: lastDay.slice(0, 7), boardings: Math.round(fl.boardings), fares: fl.fares, levy: fl.levy, gasTax: fl.gasTax, other: fl.other,
    operations: fl.operations, maintenance: fl.maintenance, para: fl.para, fixed: fl.fixed, debtService: fl.debtService,
    capital: 0, borrowed: s.debt - debtBefore, reserveEnd: s.reserve, missedTrips: missedShare(s, start),
  };
  s.ledger.push(rec);
  if (s.ledger.length > 240) s.ledger.shift();
  const today = addDays(lastDay, 1);
  const w = s.deficitWatch;
  const quiet = w && today < addMonths(w.date, 6) && -s.reserve < w.amount * 1.25;
  if (s.reserve < 0 && !quiet && !s.events.some((e) => e.kind === 'deficit' && e.decision)) {
    s.events.push(ev('deficit', today, true, { amount: Math.round(-s.reserve) }));
  }
  const f = fleetStatus(s, start);
  if (f.shortfall > 0 && !s.events.some((e) => e.kind === 'shortfall' && e.date.slice(0, 7) === today.slice(0, 7))) {
    s.events.push(ev('shortfall', today, true, { shortfall: f.shortfall, required: f.required, buses: f.buses }));
  }
}

function newYear(s: GameState, start: EconomyStart) {
  s.costIndex *= 1 + start.inflation.value;
  if (s.nextLevy !== undefined) {
    s.levy = s.nextLevy;
    delete s.nextLevy;
  }
  const y = toDate(s.date).getUTCFullYear();
  const keep: FleetGroup[] = [];
  let retired = 0;
  for (const g of s.fleet) {
    if (y - g.year >= BUS_TYPES[g.type].retireAge) retired += g.count;
    else keep.push(g);
  }
  s.fleet = keep;
  if (retired) s.events.push(ev('retirement', s.date, false, { count: retired }));
}

// ------------------------------------------------------------------------------------------ decisions

export type Resolution =
  | { kind: 'budget'; choice: BudgetChoice }
  | { kind: 'deficit'; choice: 'levy' | 'cut' | 'defer' | 'borrow' }
  | { kind: 'shortfall'; choice: 'order' | 'cut' | 'accept' };

/** Apply the player's decision on the open event. */
export function resolve(prev: GameState, eventId: string, r: Resolution, start: EconomyStart = ECONOMY_2010): GameState {
  const s: GameState = structuredClone(prev);
  const e = s.events.find((x) => x.id === eventId);
  if (!e) return prev;
  e.decision = false;
  if (r.kind === 'budget') {
    const levy = Number(e.data.last) * (1 + r.choice.levyChange / 100);
    // the first budget (December 2010) applies at once; later ones from 1 January
    if (e.date === start.date) s.levy = levy;
    else s.nextLevy = levy;
    s.fareIndex *= 1 + r.choice.fareChange / 100;
    s.maintenance = r.choice.maintenance;
    e.data = { ...e.data, levyChange: r.choice.levyChange, fareChange: r.choice.fareChange, maintenance: r.choice.maintenance };
  } else if (r.kind === 'deficit') {
    const gap = -s.reserve;
    s.deficitWatch = { date: s.date, amount: gap };
    if (r.choice === 'levy') {
      s.levy += gap * 1.1; // an in-year levy increase, recovered over the next 12 months
      s.reserve += 0; // the cash arrives month by month
    } else if (r.choice === 'cut') {
      s.serviceLevel = Math.max(0.6, s.serviceLevel * 0.92);
    } else if (r.choice === 'defer') {
      s.maintenance = Math.min(s.maintenance, 0.75);
    } else {
      s.debt += gap + 5_000_000;
      s.reserve += gap + 5_000_000;
    }
    e.data = { ...e.data, choice: r.choice };
  } else {
    const f = fleetStatus(s, start);
    if (r.choice === 'order' && f.shortfall > 0) s.orders.push(...orderOf(s, 'artic60', f.shortfall));
    else if (r.choice === 'cut' && f.required > 0) s.serviceLevel = Math.max(0.6, s.serviceLevel * (f.buses / f.required));
    e.data = { ...e.data, choice: r.choice };
  }
  return s;
}

function orderOf(s: GameState, type: BusType, count: number): GameState['orders'] {
  return [{ type, model: BUS_TYPES[type].label, count, due: addMonths(s.date, BUS_TYPES[type].leadMonths), paid: false }];
}

/** Order buses: delivered after the type's lead time, paid on delivery (capital money, then borrowing). */
export function orderBuses(prev: GameState, type: BusType, count: number): GameState {
  const s: GameState = structuredClone(prev);
  s.orders.push(...orderOf(s, type, count));
  return s;
}

/** Build a garage: paid now (capital money, then borrowing), opens after construction. */
export function buildGarage(prev: GameState, start: EconomyStart = ECONOMY_2010): GameState {
  const s: GameState = structuredClone(prev);
  payCapital(s, start, start.garageCost.value * s.costIndex);
  const n = s.garages.filter((g) => g.id.startsWith('new-')).length + 1;
  s.garages.push({ id: `new-${n}`, name: `New garage ${n}`, capacity: start.garageCapacity.value, opens: addMonths(s.date, start.garageMonths.value) });
  return s;
}

/** Schedule a plan for the next service change. */
export function schedulePlan(prev: GameState, edits: Edit[]): GameState {
  return { ...prev, pending: [...edits] };
}

/** The demand model has re-measured the network in operation. */
export function setService(prev: GameState, service: ServiceFigures): GameState {
  return { ...prev, service };
}

/** Change a running lever between budgets (maintenance funding, or fares from next month). */
export function setLevers(prev: GameState, levers: Partial<{ maintenance: number; fareIndex: number }>): GameState {
  return { ...prev, ...levers };
}

export function dismissEvent(prev: GameState, id: string): GameState {
  return { ...prev, events: prev.events.filter((e) => e.id !== id || e.decision) };
}
