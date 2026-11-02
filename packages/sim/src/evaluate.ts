import { MODES, type Network, type TravelMode, type Zone } from '@otc/shared';
import {
  DEFAULT_PARAMS, assign, prepare, runModel, transitSkims, zoneAccess,
  type DemandParams, type Prepared, type Skims, type TransitSkim,
} from './demand';
import { Raptor, buildRaptor, distM, walkSec, type RaptorNetwork } from './raptor';
import { buildTimetable } from './timetable';

/**
 * Scorecard v1 (PLAN §8) and the evaluation the design tools run on a draft network:
 * skims → one model pass with the calibrated parameters → assignment → indicators.
 */

/** Operating cost per vehicle-hour and weekday-equivalents per year (estimates, 2011 dollars; as in ECONOMY_2010). */
export const COST_PER_VEHICLE_HOUR = 135;
export const WEEKDAYS_PER_YEAR = 300;
const LAYOVER = 1.12;

export interface Scorecard {
  trips: number;
  transitTrips: number;
  transitShare: number;
  boardings: number;
  /** share of residents within 400 m of a stop with weekday service */
  coverage: number;
  /** share of residents within 400 m of a stop served every 15 min or better, 9:00–15:00 */
  coverageFrequent: number;
  /** jobs reachable within 45 min by transit in the AM peak, averaged over residents */
  jobsIn45: number;
  vehicleHours: number;
  peakVehicles: number;
  annualCost: number;
  costPerBoarding: number;
  byDistrict: Record<string, [number, number]>;
  /** per zone (zones file order): jobs within 45 min by transit, and the average wait (min) */
  zoneAccess?: number[];
  zoneWait?: number[];
  /** weekday riders per segment (all day, and the peak period) per pattern, and boardings per stop */
  loads?: Record<string, number[]>;
  peakLoads?: Record<string, number[]>;
  byStop?: Record<string, number>;
  byRoute: Record<string, number>;
  byAgency: Record<string, number>;
}

/** Only one agency's routes (e.g. OC Transpo's, for its books). */
export function agencyOnly(network: Network, agency: 'octranspo' | 'sto'): Network {
  return { ...network, routes: network.routes.filter((r) => r.agency === agency) };
}

/** Vehicle-hours and the most vehicles in service at once on a weekday (with layover). */
export function serviceStats(network: Network): { vehicleHours: number; peakVehicles: number } {
  // new light-rail lines (M8) are costed by the line, not by the bus-hour
  const lrt = new Set(network.routes.filter((r) => r.mode === 'rail' && r.id.startsWith('line-')).map((r) => r.id));
  const trips = buildTimetable(network).filter((t) => !lrt.has(t.routeId));
  let hours = 0;
  const steps = new Float64Array(24 * 12 + 30);
  for (const t of trips) {
    const a = t.dep[0]!;
    const b = t.arr[t.arr.length - 1]!;
    hours += ((b - a) * LAYOVER) / 3600;
    for (let k = Math.ceil(a / 300); k * 300 <= b && k < steps.length; k++) steps[k]!++;
  }
  return { vehicleHours: hours, peakVehicles: Math.round(Math.max(...steps) * LAYOVER) };
}

/** Stops with any weekday service, and stops served every 15 min or better (in one direction) at midday. */
export function servedStops(network: Network): { any: Set<string>; frequent: Set<string> } {
  const any = new Set<string>();
  const counts = new Map<string, number>();
  const byId = new Map(network.patterns.map((p) => [p.id, p]));
  const heads = new Map(network.patterns.map((p) => [p.id, p.headsign]));
  for (const t of buildTimetable(network)) {
    const p = byId.get(t.patternId);
    if (!p) continue;
    for (let i = 0; i < p.stops.length - 1; i++) {
      any.add(p.stops[i]!);
      const d = t.dep[i]!;
      if (d >= 9 * 3600 && d < 15 * 3600) {
        const key = `${p.stops[i]}|${heads.get(p.id)}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  const frequent = new Set<string>();
  for (const [k, c] of counts) if (c >= 24) frequent.add(k.split('|')[0]!);
  return { any, frequent };
}

/** Share of residents within `radius` m of the given stops (zone-level, by the zone's size). */
export function coverageShare(zones: Zone[], network: Network, stops: Set<string>, radius = 400): number {
  const pts = network.stops.filter((s) => stops.has(s.id));
  let covered = 0;
  let pop = 0;
  for (const z of zones) {
    let d = Infinity;
    for (const s of pts) d = Math.min(d, distM(z.lon, z.lat, s.lon, s.lat));
    const R = Math.sqrt(z.areaKm2 / Math.PI) * 1000;
    const f = Math.min(1, Math.max(0, (radius + R * 0.6 - d) / (R * 1.2)));
    covered += f * z.pop;
    pop += z.pop;
  }
  return pop > 0 ? covered / pop : 0;
}

/** Average (over residents) jobs reachable within `minutes` by transit, from the peak skim. */
export function jobsWithin(zones: Zone[], skim: TransitSkim, minutes = 45): number {
  const n = zones.length;
  const jobs = zones.map((z) => (z.jobs.office ?? 0) + (z.jobs.retail ?? 0) + (z.jobs.institutional ?? 0) + (z.jobs.industrial ?? 0));
  let sum = 0;
  let pop = 0;
  for (let i = 0; i < n; i++) {
    const p = zones[i]!.pop;
    if (p <= 0) continue;
    let reach = jobs[i]!;
    for (let j = 0; j < n; j++) {
      const ij = i * n + j;
      const t = skim.ivt[ij]! + skim.wait[ij]! + skim.walk[ij]!;
      if (t === t && t <= minutes) reach += jobs[j]!;
    }
    sum += p * reach;
    pop += p;
  }
  return pop > 0 ? sum / pop : 0;
}

/**
 * Each zone's level of service (M6, what residents feel): jobs reachable within `minutes` by transit
 * at the peak (its own jobs included), and the average wait for those trips (job-weighted, minutes).
 * Zones with no transit get only their own jobs and a 30-minute wait.
 */
export function zoneLos(zones: Zone[], skim: TransitSkim, minutes = 45): { access: Float32Array; wait: Float32Array } {
  const n = zones.length;
  const jobs = zones.map((z) => (z.jobs.office ?? 0) + (z.jobs.retail ?? 0) + (z.jobs.institutional ?? 0) + (z.jobs.industrial ?? 0));
  const access = new Float32Array(n);
  const wait = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let reach = jobs[i]!;
    let w = 0;
    let wj = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const ij = i * n + j;
      const t = skim.ivt[ij]! + skim.wait[ij]! + skim.walk[ij]!;
      if (!(t === t) || t > minutes) continue;
      reach += jobs[j]!;
      w += jobs[j]! * skim.wait[ij]!;
      wj += jobs[j]!;
    }
    access[i] = reach;
    wait[i] = wj > 0 ? w / wj : 30;
  }
  return { access, wait };
}

export interface EvalInputs {
  zones: Zone[];
  car: Uint8Array;
  params: DemandParams;
  /** departure samples per period (2 in the game, 4 for the base-year run) */
  samples?: number;
  onProgress?: (stage: string, f: number) => void;
}

export interface Evaluation {
  score: Scorecard;
  skims: Skims;
  /** cumulative seconds at the end of each stage */
  timing: Record<string, number>;
}

/** Evaluate a (draft) network: skims, one model pass with the calibrated parameters, assignment, scorecard. */
export function evaluate(network: Network, inp: EvalInputs, prep?: Prepared): Evaluation {
  const { zones, car, params } = inp;
  const samples = inp.samples ?? 2;
  const say = inp.onProgress ?? (() => {});
  const t0 = Date.now();
  const lap = (label: string) => (timing[label] = (Date.now() - t0) / 1000);
  const timing: Record<string, number> = {};
  say('skims', 0);
  const skims = transitSkims(network, zones, params, samples, (f) => say('skims', f));
  lap('skims');
  say('model', 0);
  const res = runModel({ zones, car, skims }, params, prep ?? prepare({ zones, car, skims }));
  lap('model');
  say('assign', 0);
  const asg = assign(network, zones, res.transit, params, 0.01, samples, (f) => say('assign', f));
  lap('assign');
  say('score', 0);
  const trips = MODES.reduce((a, m) => a + res.byMode[m as TravelMode], 0);
  const agencyOf = new Map(network.routes.map((r) => [r.id, r.agency]));
  const served = servedStops(network);
  const svc = serviceStats(network);
  const annualCost = svc.vehicleHours * COST_PER_VEHICLE_HOUR * WEEKDAYS_PER_YEAR;
  const boardings = asg.totals.boardings;
  const los = zoneLos(zones, skims.peak);
  const score: Scorecard = {
    trips, transitTrips: res.byMode.transit, transitShare: res.byMode.transit / trips, boardings,
    coverage: coverageShare(zones, network, served.any),
    coverageFrequent: coverageShare(zones, network, served.frequent),
    jobsIn45: jobsWithin(zones, skims.peak),
    vehicleHours: svc.vehicleHours, peakVehicles: svc.peakVehicles, annualCost,
    costPerBoarding: annualCost / Math.max(1, boardings * WEEKDAYS_PER_YEAR),
    byDistrict: Object.fromEntries(Object.entries(res.district).map(([d, [t, tr]]) => [d, [t, tr / t]])),
    loads: Object.fromEntries([...asg.loads].map(([k, v]) => [k, Array.from(v, Math.round)])),
    peakLoads: Object.fromEntries([...asg.peakLoads].map(([k, v]) => [k, Array.from(v, Math.round)])),
    byStop: Object.fromEntries([...asg.boardingsByStop].filter(([, v]) => v >= 1).map(([k, v]) => [k, Math.round(v)])),
    zoneAccess: Array.from(los.access, Math.round),
    zoneWait: Array.from(los.wait, (w) => Math.round(w * 10) / 10),
    byRoute: Object.fromEntries(asg.boardingsByRoute),
    byAgency: [...asg.boardingsByRoute].reduce<Record<string, number>>((a, [rid, b]) => {
      const ag = agencyOf.get(rid) ?? '?';
      a[ag] = (a[ag] ?? 0) + b;
      return a;
    }, {}),
  };
  lap('score');
  say('done', 1);
  return { score, skims, timing };
}

// ------------------------------------------------------------------------------------------ isochrones

/** A reusable travel-time engine for one network at one departure time. */
export class Isochrones {
  readonly rn: RaptorNetwork;
  private readonly r: Raptor;
  private readonly acc;

  constructor(network: Network, private readonly zones: Zone[], readonly depart = 8 * 3600, params: DemandParams = DEFAULT_PARAMS) {
    this.rn = buildRaptor(network, depart, depart + 2.5 * 3600);
    this.r = new Raptor(this.rn);
    this.acc = zoneAccess(this.rn, zones, params.accessRadiusM);
  }

  /** Minutes from a point to every zone (by transit, or on foot when that is quicker); Infinity if unreachable. */
  from(lon: number, lat: number, maxWalkM = 900): Float32Array {
    const { rn, r, zones } = this;
    const src: { stop: number; time: number }[] = [];
    for (let s = 0; s < rn.nStops; s++) {
      const d = distM(lon, lat, rn.stopLon[s]!, rn.stopLat[s]!);
      if (d <= maxWalkM) src.push({ stop: s, time: this.depart + walkSec(d) });
    }
    const out = new Float32Array(zones.length).fill(Infinity);
    if (src.length) r.run(src, this.depart + 2.5 * 3600);
    zones.forEach((z, j) => {
      let best = walkSec(distM(lon, lat, z.lon, z.lat));
      const a = this.acc[j]!;
      if (src.length) for (let k = 0; k < a.stops.length; k++) best = Math.min(best, r.best[a.stops[k]!]! - this.depart + a.sec[k]!);
      out[j] = best / 60;
    });
    return out;
  }
}

export { DEFAULT_PARAMS };
