// The money-and-fleet contract (M5): the game's starting position on 1 December 2010, with a
// source for every number. "estimate: true" marks numbers still to check against a primary source
// (OC Transpo / City of Ottawa 2010–2011 budget documents). It's a game: estimates are fine, as long
// as they are labelled.
import type { Edit } from './plan';
import type { DiaryEntry, FrontPage, OpinionState, Post } from './opinion';

const WIKI_2010 = "Wikipedia 'OC Transpo' rev 399504447 (29 Nov 2010) https://en.wikipedia.org/w/index.php?oldid=399504447";

export type BusType = 'bus40' | 'hybrid40' | 'artic60' | 'double' | 'rail';

export interface BusTypeSpec {
  label: string;
  label_fr: string;
  /** places at the peak (seated + standing) */
  capacity: number;
  /** purchase price, 2011 dollars */
  price: number;
  /** months from order to delivery */
  leadMonths: number;
  /** relative cost per vehicle-hour (40-ft diesel = 1) */
  costFactor: number;
  retireAge: number;
  source: string;
  estimate?: boolean;
}

export const BUS_TYPES: Record<BusType, BusTypeSpec> = {
  bus40: { label: '40-ft diesel', label_fr: 'Diesel 40 pi', capacity: 75, price: 480_000, leadMonths: 12, costFactor: 1, retireAge: 18,
    source: 'Estimate: Canadian 40-ft low-floor diesel bus, 2011', estimate: true },
  hybrid40: { label: '40-ft hybrid', label_fr: 'Hybride 40 pi', capacity: 75, price: 700_000, leadMonths: 14, costFactor: 0.94, retireAge: 16,
    source: 'Estimate: Orion VII hybrid class, 2011', estimate: true },
  artic60: { label: '60-ft articulated', label_fr: 'Articulé 60 pi', capacity: 115, price: 780_000, leadMonths: 12, costFactor: 1.2, retireAge: 18,
    source: 'Estimate: New Flyer D60LFR class, 2011', estimate: true },
  double: { label: 'Double-decker', label_fr: 'Autobus à deux étages', capacity: 125, price: 1_000_000, leadMonths: 18, costFactor: 1.15, retireAge: 18,
    source: 'Estimate: Alexander Dennis Enviro500 class, 2011', estimate: true },
  rail: { label: 'O-Train railcar', label_fr: 'Voiture de l’O-Train', capacity: 285, price: 4_500_000, leadMonths: 30, costFactor: 2.5, retireAge: 30,
    source: 'Estimate: diesel light-rail railcar, 2011', estimate: true },
};

export interface FleetGroup {
  type: BusType;
  model: string;
  year: number;
  count: number;
}

export interface Garage {
  id: string;
  name: string;
  capacity: number;
  /** ISO date it opens (absent: open) */
  opens?: string;
}

export interface BudgetLine {
  value: number;
  source: string;
  estimate?: boolean;
}

export interface EconomyStart {
  date: string;
  fleet: FleetGroup[];
  /** deliveries already ordered (and paid for) */
  orders: { type: BusType; model: string; count: number; perMonth: number; from: string; replaces?: string[] }[];
  garages: Garage[];
  fares: { cash: number; express: number; rural: number; ticket: number; dayPass: number; source: string };
  /** average fare revenue per boarding (passes, transfers and concessions included) */
  revenuePerBoarding: BudgetLine;
  costPerVehicleHour: BudgetLine;
  /** share of the cost per vehicle-hour that is maintenance (the maintenance lever scales it) */
  maintenanceShare: BudgetLine;
  paraTranspo: BudgetLine;
  fixedCosts: BudgetLine;
  gasTax: BudgetLine;
  otherRevenue: BudgetLine;
  capitalEnvelope: BudgetLine;
  reserve: BudgetLine;
  inflation: BudgetLine;
  fareElasticity: BudgetLine;
  ridershipGrowth: BudgetLine;
  weekdaysPerYear: BudgetLine;
  borrowingRate: BudgetLine;
  borrowingYears: BudgetLine;
  spareRatio: BudgetLine;
  garageCost: BudgetLine;
  garageMonths: BudgetLine;
  garageCapacity: BudgetLine;
  /** ridership by month relative to the annual average (Jan..Dec) */
  seasonal: { values: number[]; source: string; estimate: true };
  /** ridership by day of the week relative to a weekday (Sun..Sat) */
  dayOfWeek: { values: number[]; source: string; estimate: true };
  /** days for riders to find a new or better service (time constant), and to leave a worse one */
  rampUpDays: BudgetLine;
  rampDownDays: BudgetLine;
}

export const ECONOMY_2010: EconomyStart = {
  date: '2010-12-01',
  fleet: [
    { type: 'bus40', model: 'NovaBus LFS', year: 1997, count: 20 },
    { type: 'bus40', model: 'Orion 05.501 (high floor)', year: 1998, count: 60 },
    { type: 'bus40', model: 'Orion 06.501', year: 1999, count: 140 },
    { type: 'bus40', model: 'New Flyer D40i Invero', year: 2005, count: 326 },
    { type: 'hybrid40', model: 'Orion VII NG HEV', year: 2008, count: 178 },
    { type: 'artic60', model: 'New Flyer D60LF', year: 2002, count: 180 },
    { type: 'artic60', model: 'New Flyer D60LFR', year: 2010, count: 141 },
    { type: 'double', model: 'Alexander Dennis Enviro500', year: 2008, count: 3 },
    { type: 'rail', model: 'Bombardier Talent BR643', year: 2000, count: 3 },
  ],
  // the D60LFR order replaced the high-floor (inaccessible) buses, then the oldest articulated ones, as it arrived
  orders: [{ type: 'artic60', model: 'New Flyer D60LFR', count: 165, perMonth: 15, from: '2011-01-01',
    replaces: ['Orion 05.501 (high floor)', 'New Flyer D60LF'] }],
  garages: [
    { id: 'st-laurent', name: 'St. Laurent', capacity: 450 },
    { id: 'merivale', name: 'Merivale (Colonnade)', capacity: 250 },
    { id: 'pinecrest', name: 'Pinecrest (Queensview)', capacity: 200 },
    { id: 'industrial', name: 'Industrial Avenue', capacity: 230 },
  ],
  fares: { cash: 3.25, express: 4.25, rural: 5.25, ticket: 1.25, dayPass: 7.5, source: WIKI_2010 },
  revenuePerBoarding: { value: 1.15, estimate: true, source: 'Estimate: fare revenue per boarding, with passes, transfers and concessions (cash fare $3.25, tickets $1.25, ' + WIKI_2010 + ')' },
  costPerVehicleHour: { value: 135, estimate: true, source: 'Estimate: fully loaded operating cost per bus-hour (drivers, fuel, maintenance), Canadian transit 2011' },
  maintenanceShare: { value: 0.22, estimate: true, source: 'Estimate: share of the operating cost that is vehicle maintenance' },
  paraTranspo: { value: 26_000_000, estimate: true, source: 'Estimate: Para Transpo (door-to-door service) a year' },
  fixedCosts: { value: 45_000_000, estimate: true, source: 'Estimate: administration, facilities, stations and security a year' },
  gasTax: { value: 36_000_000, estimate: true, source: 'Estimate: Ontario gas-tax transfer for transit operations a year' },
  otherRevenue: { value: 12_000_000, estimate: true, source: 'Estimate: advertising, park & ride and other revenue a year' },
  capitalEnvelope: { value: 55_000_000, estimate: true, source: 'Estimate: capital money for fleet and facilities a year (gas tax + levy), before borrowing' },
  reserve: { value: 25_000_000, estimate: true, source: 'Estimate: transit operating reserve on 1 Dec 2010' },
  inflation: { value: 0.028, estimate: true, source: 'Estimate: yearly cost growth (labour contracts, fuel)' },
  fareElasticity: { value: -0.3, source: 'Typical short-run transit fare elasticity (TCRP Report 95)' },
  ridershipGrowth: { value: 0.012, estimate: true, source: 'Estimate: yearly growth from population (Ottawa grew ~1.7%/yr 2006–2011)' },
  weekdaysPerYear: { value: 300, estimate: true, source: 'Estimate: weekday-equivalents a year (weekends at reduced service)' },
  borrowingRate: { value: 0.045, estimate: true, source: 'Estimate: municipal borrowing rate, 2011' },
  borrowingYears: { value: 20, estimate: true, source: 'Estimate: debenture term' },
  spareRatio: { value: 0.15, source: 'Typical spare-bus ratio (US FTA guidance: 20% maximum)' },
  garageCost: { value: 90_000_000, estimate: true, source: 'Estimate: a 250-bus garage, 2011' },
  garageMonths: { value: 30, estimate: true, source: 'Estimate: design and construction time' },
  garageCapacity: { value: 250, estimate: true, source: 'Estimate' },
  seasonal: { values: [1.05, 1.06, 1.02, 0.99, 0.95, 0.88, 0.8, 0.82, 1.06, 1.1, 1.08, 0.97], estimate: true,
    source: 'Estimate: typical northern-city seasonal pattern (students away in summer)' },
  dayOfWeek: { values: [0.42, 1, 1, 1, 1, 1.02, 0.58], estimate: true, source: 'Estimate: typical weekend share of weekday ridership' },
  rampUpDays: { value: 21, estimate: true, source: 'Estimate: riders discover new or improved service over several weeks' },
  rampDownDays: { value: 6, estimate: true, source: 'Estimate: riders leave a cut service within days' },
};

// ------------------------------------------------------------------------------------------ game state

export interface MonthRecord {
  /** YYYY-MM */
  month: string;
  boardings: number;
  fares: number;
  levy: number;
  gasTax: number;
  other: number;
  operations: number;
  maintenance: number;
  para: number;
  fixed: number;
  debtService: number;
  capital: number;
  borrowed: number;
  reserveEnd: number;
  missedTrips: number;
}

export type GameEventKind = 'budget' | 'deficit' | 'shortfall' | 'delivery' | 'serviceChange' | 'garageOpen' | 'retirement' | 'welcome';

export interface GameEvent {
  id: string;
  kind: GameEventKind;
  date: string;
  /** needs a decision (pauses the game) */
  decision: boolean;
  data: Record<string, number | string>;
}

export interface BudgetChoice {
  /** % change of the levy for the coming year */
  levyChange: number;
  /** % change of fares, from the next month */
  fareChange: number;
  /** maintenance funding, 1 = what the fleet needs */
  maintenance: number;
}

export interface DayRecord {
  date: string;
  /** OC Transpo boardings that day */
  boardings: number;
  /** boardings on routes the player has changed */
  routes?: Record<string, number>;
}

/** Riders move from one level to another after a service change (equilibrium from the demand model). */
export interface Ramp {
  from: number;
  to: number;
  start: string;
}

export interface GameState {
  version: 1;
  date: string;
  reserve: number;
  capitalReserve: number;
  debt: number;
  /** annual levy for the current year */
  levy: number;
  /** levy council approved for next year (applied on 1 January) */
  nextLevy?: number;
  /** the last deficit the player dealt with: no new alarm for 6 months unless it gets 25% worse */
  deficitWatch?: { date: string; amount: number };
  /** cost index (1 in 2011) */
  costIndex: number;
  fareIndex: number;
  maintenance: number;
  /** service level multiplier (cuts after a deficit) */
  serviceLevel: number;
  backlog: number;
  fleet: FleetGroup[];
  orders: { type: BusType; model: string; count: number; due: string; paid: boolean; replaces?: string[] }[];
  garages: Garage[];
  /** the network in operation: the 2010 network with these edits */
  applied: Edit[];
  /** edits scheduled for the next service change */
  pending: Edit[];
  /** weekday OC Transpo figures for the network in operation */
  service: { boardings: number; vehicleHours: number; peakVehicles: number };
  ledger: MonthRecord[];
  events: GameEvent[];
  seed: number;
  /** ridership day by day (the last ~400 days) */
  daily?: DayRecord[];
  /** weekday boardings moving to a new level after the last service change */
  ramp?: Ramp;
  /** the same, per route the player has changed (equilibrium weekday boardings) */
  routeRamps?: Record<string, Ramp>;
  /** service-change dates and what changed, for charts */
  changes?: { date: string; label: string }[];
  /** how many of `applied` the `service` figures account for (re-measure when it lags) */
  serviceFor?: number;
  /** the scheduled plan, measured when it was scheduled: applied on the service-change date */
  pendingFigures?: PendingFigures;
  /** each zone's level of service for the network in operation (absent: the 2010 network) */
  los?: ZoneLos;
  /** M6: public opinion, riders' diaries, front pages and the social feed */
  opinion?: OpinionState;
  diaries?: Record<string, DiaryEntry[]>;
  press?: FrontPage[];
  posts?: Post[];
  /** each persona's usual door-to-door minutes, to notice when a change makes it better or worse */
  routines?: Record<string, { minutes: number; prev?: number; since: string }>;
}

/** Per zone (zones file order): jobs within 45 min by transit, and the average wait (min). */
export interface ZoneLos {
  access: number[];
  wait: number[];
}

/** What the demand model expects once the scheduled plan is in operation. */
export interface PendingFigures {
  /** JSON of the `pending` edits these figures are for */
  key: string;
  service: { boardings: number; vehicleHours: number; peakVehicles: number };
  /** equilibrium weekday boardings of the routes to watch (0 = removed) */
  routes: Record<string, number>;
  /** their weekday boardings before the change */
  routesBefore: Record<string, number>;
  /** zones' level of service once the plan runs */
  los?: ZoneLos;
}
