import type { CalibrationRow, DemandFile, Network, TravelMode, Zone } from '@otc/shared';
import { MODES } from '@otc/shared';
import { Raptor, buildRaptor, distM, walkSec, type RaptorNetwork } from './raptor';

/**
 * The weekday demand model (PLAN §4.3), v1:
 *
 * 1. **Trip generation** per zone, by purpose and population segment (rates per resident).
 * 2. **Destination choice**: a logit on attraction size and the mode-choice logsum.
 * 3. **Mode choice**: multinomial logit over car, passenger, transit, walk and bike. Transit uses
 *    RAPTOR skims (in-vehicle, wait, walk, transfers) for the period the trip is made in.
 * 4. **Calibration**: mode constants are adjusted until regional shares meet the targets.
 * 5. **Assignment**: each origin's transit trips follow the RAPTOR journeys they were skimmed on,
 *    giving boardings per route and stop and loads per segment.
 *
 * Pure and deterministic; runs in Node (scripts/demand.ts) and, later, in Web Workers.
 */

export type Period = 'peak' | 'offpeak';
export const PERIOD_SAMPLES: Record<Period, number[]> = {
  peak: [7 * 3600, 7 * 3600 + 1200, 7 * 3600 + 2400, 8 * 3600],
  offpeak: [10.5 * 3600, 11 * 3600 + 600, 11 * 3600 + 3000, 12.5 * 3600],
};
const HORIZON_SEC = 2.5 * 3600;
// when picking the journey to a zone, each extra boarding "costs" this much:
// - riders' route choice (the assignment, which counts boardings): calibrated on Ottawa's transfer rate;
// - the skims mode choice sees: the model's own transfer penalty (coef.transfer / coef.ivt = 10 min), so a new
//   fast line that only saves time with an extra transfer doesn't make transit look worse (M8).
const ROUND_PENALTY_SEC = 150;
const SKIM_ROUND_PENALTY_SEC = 600;

export type Purpose = 'hbw' | 'hbu' | 'hbs' | 'hbo' | 'nhb';
export const PURPOSES: Purpose[] = ['hbw', 'hbu', 'hbs', 'hbo', 'nhb'];
const PURPOSE_PERIOD: Record<Purpose, Period> = { hbw: 'peak', hbu: 'peak', hbs: 'peak', hbo: 'offpeak', nhb: 'offpeak' };

export interface DemandParams {
  /** weekday trips per resident of the purpose's group (both directions) */
  rates: Record<Purpose, number>;
  /** destination-choice weight on the mode logsum (higher = shorter trips) */
  lambda: Record<Purpose, number>;
  coef: { ivt: number; wait: number; accessWalk: number; transfer: number; cost: number; walkMode: number; bikeMode: number };
  asc: Record<TravelMode, number>;
  /** extra utility for people without a car in the household */
  noCarBonus: Record<TravelMode, number>;
  fare: number;
  carCostPerKm: number;
  /** parking cost per trip at the destination, by district, for work and for other trips */
  parking: Record<string, [number, number]>;
  walkMaxKm: number;
  bikeMaxKm: number;
  accessRadiusM: [number, number];
}

export const DEFAULT_PARAMS: DemandParams = {
  rates: { hbw: 1.6, hbu: 1.4, hbs: 1.7, hbo: 0.8, nhb: 0.3 },
  lambda: { hbw: 1.6, hbu: 1.4, hbs: 3.0, hbo: 2.6, nhb: 2.6 },
  coef: { ivt: -0.03, wait: -0.06, accessWalk: -0.06, transfer: -0.3, cost: -0.2, walkMode: -0.07, bikeMode: -0.09 },
  asc: { car: 0, passenger: -1.6, transit: -0.8, walk: 0.2, bike: -2.4 },
  noCarBonus: { car: 0, passenger: 0.4, transit: 1.4, walk: 0.6, bike: 0.3 },
  fare: 1.9,
  carCostPerKm: 0.12,
  parking: { downtown: [5, 2.5], hull: [3, 1.5], inner: [0.5, 0] },
  walkMaxKm: 6,
  bikeMaxKm: 20,
  accessRadiusM: [900, 1500],
};

export interface TransitSkim {
  n: number;
  /** minutes; NaN where transit isn't a reasonable option */
  ivt: Float32Array;
  wait: Float32Array;
  walk: Float32Array;
  boardings: Float32Array;
}

interface Access {
  stops: Int32Array;
  sec: Float32Array;
}

/** Stops within walking distance of each zone centroid (larger zones reach further). */
export function zoneAccess(rn: RaptorNetwork, zones: Zone[], radius: [number, number]): Access[] {
  return zones.map((z) => {
    const r = z.areaKm2 > 2 ? radius[1] : radius[0];
    const stops: number[] = [];
    const sec: number[] = [];
    for (let s = 0; s < rn.nStops; s++) {
      const d = distM(z.lon, z.lat, rn.stopLon[s]!, rn.stopLat[s]!);
      if (d <= r) {
        stops.push(s);
        sec.push(walkSec(d));
      }
    }
    return { stops: Int32Array.from(stops), sec: Float32Array.from(sec) };
  });
}

/** Per-stop best (round-penalised) arrival from the latest query, and the round it came from. */
function bestByStop(r: Raptor, cost: Float32Array, round: Int8Array, penalty = ROUND_PENALTY_SEC) {
  const N = r.net.nStops;
  cost.fill(1e9);
  round.fill(-1);
  for (let k = 1; k <= r.lastRound; k++) {
    const base = k * N;
    for (let s = 0; s < N; s++) {
      const t = r.tau[base + s]! + k * penalty;
      if (t < cost[s]!) {
        cost[s] = t;
        round[s] = k;
      }
    }
  }
}

/** For each destination zone, the egress stop and round of the best journey (or -1). */
function pickEgress(acc: Access[], cost: Float32Array, out: Int32Array, outRound: Int8Array, round: Int8Array) {
  for (let j = 0; j < acc.length; j++) {
    const a = acc[j]!;
    let best = 1e9;
    let bs = -1;
    for (let k = 0; k < a.stops.length; k++) {
      const s = a.stops[k]!;
      const c = cost[s]! + a.sec[k]!;
      if (c < best) {
        best = c;
        bs = s;
      }
    }
    out[j] = bs;
    outRound[j] = bs >= 0 ? round[bs]! : -1;
  }
}

export interface Skims {
  peak: TransitSkim;
  offpeak: TransitSkim;
}

/** The departure samples to use: all four, or an evenly spread subset (faster, for the game). */
export function samplesFor(period: Period, count = 4): number[] {
  const all = PERIOD_SAMPLES[period];
  if (count >= all.length) return all;
  return Array.from({ length: count }, (_, i) => all[Math.floor(((i + 0.5) * all.length) / count)]!);
}

/** RAPTOR transit skims for both periods: averages over the period's departure samples. */
export function transitSkims(network: Network, zones: Zone[], params: DemandParams = DEFAULT_PARAMS, samplesPerPeriod = 4,
  onProgress?: (f: number) => void): Skims {
  const out = {} as Skims;
  const js = { ivt: 0, walk: 0, legs: 0, firstStop: -1 };
  let pi = 0;
  for (const period of ['peak', 'offpeak'] as Period[]) {
    const samples = samplesFor(period, samplesPerPeriod);
    const rn = buildRaptor(network, samples[0]!, samples.at(-1)! + HORIZON_SEC);
    const r = new Raptor(rn);
    const acc = zoneAccess(rn, zones, params.accessRadiusM);
    const n = zones.length;
    const sum = { ivt: new Float32Array(n * n), wait: new Float32Array(n * n), walk: new Float32Array(n * n), b: new Float32Array(n * n) };
    const hits = new Uint8Array(n * n);
    const cost = new Float32Array(rn.nStops);
    const round = new Int8Array(rn.nStops);
    const egress = new Int32Array(n);
    const egRound = new Int8Array(n);
    const accessAt = new Float32Array(rn.nStops).fill(-1);
    for (let i = 0; i < n; i++) {
      const a = acc[i]!;
      if (!a.stops.length) continue;
      for (const t0 of samples) {
        r.run(Array.from(a.stops, (s, k) => ({ stop: s, time: t0 + a.sec[k]! })), t0 + HORIZON_SEC);
        a.stops.forEach((s, k) => (accessAt[s] = a.sec[k]!));
        bestByStop(r, cost, round, SKIM_ROUND_PENALTY_SEC);
        pickEgress(acc, cost, egress, egRound, round);
        for (let j = 0; j < n; j++) {
          if (j === i || egress[j]! < 0) continue;
          const e = egress[j]!;
          if (!r.journeyStats(egRound[j]!, e, js)) continue;
          const eg = acc[j]!;
          let egSec = 0;
          for (let k = 0; k < eg.stops.length; k++) if (eg.stops[k] === e) egSec = eg.sec[k]!;
          const accSec = accessAt[js.firstStop]! >= 0 ? accessAt[js.firstStop]! : 0;
          const total = r.arrival(egRound[j]!, e) + egSec - t0;
          const walk = accSec + js.walk + egSec;
          const ij = i * n + j;
          sum.ivt[ij]! += js.ivt / 60;
          sum.walk[ij]! += walk / 60;
          sum.wait[ij]! += Math.max(0, total - js.ivt - walk) / 60;
          sum.b[ij]! += js.legs;
          hits[ij]!++;
        }
        a.stops.forEach((s) => (accessAt[s] = -1));
      }
      if (onProgress && i % 50 === 0) onProgress((pi + i / n) / 2);
    }
    pi++;
    const half = samples.length / 2;
    const skim: TransitSkim = { n, ivt: new Float32Array(n * n).fill(NaN), wait: new Float32Array(n * n).fill(NaN),
      walk: new Float32Array(n * n).fill(NaN), boardings: new Float32Array(n * n).fill(NaN) };
    for (let ij = 0; ij < n * n; ij++) {
      const h = hits[ij]!;
      if (h < half) continue; // not a reasonable option if it fails at most times
      skim.ivt[ij] = sum.ivt[ij]! / h;
      skim.walk[ij] = sum.walk[ij]! / h;
      // missed samples count as a long wait
      skim.wait[ij] = sum.wait[ij]! / h + ((samples.length - h) / samples.length) * 30;
      skim.boardings[ij] = sum.b[ij]! / h;
    }
    out[period] = skim;
  }
  return out;
}

// ------------------------------------------------------------------------------------------ the model

export interface ModelInputs {
  zones: Zone[];
  /** uint8 car minutes, row-major origin x destination; 255 = no road path */
  car: Uint8Array;
  skims: Skims;
}

export interface Prepared {
  n: number;
  distKm: Float32Array;
  carMin: Float32Array;
}

export function prepare(inp: ModelInputs): Prepared {
  const { zones, car } = inp;
  const n = zones.length;
  const distKm = new Float32Array(n * n);
  const carMin = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    const a = zones[i]!;
    for (let j = 0; j < n; j++) {
      const b = zones[j]!;
      const ij = i * n + j;
      distKm[ij] = i === j ? 0.5 * Math.sqrt(a.areaKm2) : (distM(a.lon, a.lat, b.lon, b.lat) * 1.3) / 1000;
      const c = car[ij]!;
      carMin[ij] = c === 255 ? NaN : i === j ? 3 : c;
    }
  }
  return { n, distKm, carMin };
}

const GROUP: Record<Purpose, 'worker' | 'post' | 'school' | 'all'> = { hbw: 'worker', hbu: 'post', hbs: 'school', hbo: 'all', nhb: 'all' };

function sizeTerm(z: Zone, p: Purpose): number {
  const j = z.jobs;
  const jobs = (j.office ?? 0) + (j.retail ?? 0) + (j.institutional ?? 0) + (j.industrial ?? 0);
  switch (p) {
    case 'hbw': return jobs;
    case 'hbu': return z.enrol.post;
    case 'hbs': return z.enrol.school;
    case 'hbo': return 2.5 * (j.retail ?? 0) + 0.6 * (j.institutional ?? 0) + 0.15 * jobs + 0.25 * z.pop;
    case 'nhb': return 2 * (j.retail ?? 0) + jobs + 0.1 * z.pop;
  }
}

export interface ModelResult {
  /** weekday trips by mode */
  byMode: Record<TravelMode, number>;
  /** transit trips by period, origin x destination */
  transit: Record<Period, Float32Array>;
  /** per zone: trips by residents, transit trips by residents */
  zoneTrips: Float64Array;
  zoneTransit: Float64Array;
  /** per home district: [trips, transit trips] */
  district: Record<string, [number, number]>;
  /** average car-driver trip minutes by purpose */
  avgCarMin: Record<Purpose, number>;
}

/** One full model pass: generation, destination choice and mode choice for every origin. */
export function runModel(inp: ModelInputs, params: DemandParams = DEFAULT_PARAMS, prep: Prepared = prepare(inp)): ModelResult {
  const { zones } = inp;
  const { n, distKm, carMin } = prep;
  const c = params.coef;
  const byMode: Record<TravelMode, number> = { car: 0, passenger: 0, transit: 0, walk: 0, bike: 0 };
  const transit = { peak: new Float32Array(n * n), offpeak: new Float32Array(n * n) };
  const zoneTrips = new Float64Array(n);
  const zoneTransit = new Float64Array(n);
  const district: Record<string, [number, number]> = {};
  const carMinSum: Record<Purpose, [number, number]> = { hbw: [0, 0], hbu: [0, 0], hbs: [0, 0], hbo: [0, 0], nhb: [0, 0] };
  const size = PURPOSES.map((p) => Float64Array.from(zones, (z) => sizeTerm(z, p)));
  const V = new Float64Array(5);
  const util = new Float64Array(n * 5);
  const ls = new Float64Array(n);
  const w = new Float64Array(n);
  const totalPop = zones.reduce((a, z) => a + z.pop, 0);
  const nhbProd = Float64Array.from(zones, (z) => sizeTerm(z, 'nhb'));
  const nhbScale = (params.rates.nhb * totalPop) / nhbProd.reduce((a, b) => a + b, 0);

  for (let pi = 0; pi < PURPOSES.length; pi++) {
    const p = PURPOSES[pi]!;
    const sk = inp.skims[PURPOSE_PERIOD[p]];
    const tm = transit[PURPOSE_PERIOD[p]];
    const sz = size[pi]!;
    const lambda = params.lambda[p];
    const work = p === 'hbw' ? 0 : 1;
    for (let i = 0; i < n; i++) {
      const zi = zones[i]!;
      // productions by car availability
      const g = GROUP[p];
      let prodCar: number;
      let prodNo: number;
      if (p === 'nhb') {
        const shareNo = zi.pop > 0 ? sumNoCar(zi) / zi.pop : 0.1;
        prodCar = nhbProd[i]! * nhbScale * (1 - shareNo);
        prodNo = nhbProd[i]! * nhbScale * shareNo;
      } else if (g === 'all') {
        prodCar = (zi.pop - sumNoCar(zi)) * params.rates[p];
        prodNo = sumNoCar(zi) * params.rates[p];
      } else {
        prodCar = zi.seg[`${g}_car`] * params.rates[p];
        prodNo = zi.seg[`${g}_nocar`] * params.rates[p];
      }
      if (prodCar + prodNo <= 0) continue;
      for (const [noCar, prod] of [[0, prodCar], [1, prodNo]] as const) {
        if (prod <= 0) continue;
        // utilities and logsums to every destination
        let wsum = 0;
        for (let j = 0; j < n; j++) {
          if (sz[j]! <= 0) {
            w[j] = 0;
            continue;
          }
          const ij = i * n + j;
          const zj = zones[j]!;
          const d = distKm[ij]!;
          const cm = carMin[ij]!;
          const park = params.parking[zj.district]?.[work] ?? 0;
          const terminal = zj.downtown ? 5 : 2;
          // car (driver): needs a car in the household and isn't open to pupils
          V[0] = !noCar && p !== 'hbs' && cm === cm
            ? params.asc.car + c.ivt * cm + c.accessWalk * terminal + c.cost * (d * params.carCostPerKm + park) : -Infinity;
          V[1] = cm === cm ? params.asc.passenger + params.noCarBonus.passenger * noCar + (p === 'hbs' ? 1.2 : 0)
            + c.ivt * cm + c.accessWalk * 1 : -Infinity;
          const tiv = sk.ivt[ij]!;
          V[2] = tiv === tiv && i !== j
            ? params.asc.transit + params.noCarBonus.transit * noCar + c.ivt * tiv + c.wait * sk.wait[ij]!
              + c.accessWalk * sk.walk[ij]! + c.transfer * Math.max(0, sk.boardings[ij]! - 1) + c.cost * params.fare : -Infinity;
          V[3] = d <= params.walkMaxKm ? params.asc.walk + params.noCarBonus.walk * noCar + c.walkMode * (d / 4.8) * 60 : -Infinity;
          V[4] = d <= params.bikeMaxKm && p !== 'hbs' ? params.asc.bike + params.noCarBonus.bike * noCar + c.bikeMode * (d / 15) * 60 : -Infinity;
          let mx = -Infinity;
          for (let m = 0; m < 5; m++) if (V[m]! > mx) mx = V[m]!;
          if (mx === -Infinity) {
            w[j] = 0;
            continue;
          }
          let s = 0;
          for (let m = 0; m < 5; m++) {
            const e = V[m] === -Infinity ? 0 : Math.exp(V[m]! - mx);
            util[j * 5 + m] = e;
            s += e;
          }
          for (let m = 0; m < 5; m++) util[j * 5 + m]! /= s;
          ls[j] = mx + Math.log(s);
          w[j] = sz[j]! * Math.exp(lambda * ls[j]!);
          wsum += w[j]!;
        }
        if (wsum <= 0) continue;
        const dist = zi.district;
        const dRow = (district[dist] ??= [0, 0]);
        for (let j = 0; j < n; j++) {
          if (w[j]! <= 0) continue;
          const t = (prod * w[j]!) / wsum;
          for (let m = 0; m < 5; m++) {
            const tm_ = t * util[j * 5 + m]!;
            byMode[MODES[m]!] += tm_;
          }
          const tr = t * util[j * 5 + 2]!;
          if (tr > 0) {
            // home-based trips go out in the morning and back in the evening: half each way
            if (p === 'nhb') tm[i * n + j]! += tr;
            else {
              tm[i * n + j]! += tr / 2;
              tm[j * n + i]! += tr / 2;
            }
          }
          if (p !== 'nhb') {
            zoneTrips[i]! += t;
            zoneTransit[i]! += tr;
            dRow[0] += t;
            dRow[1] += tr;
          }
          const carShare = util[j * 5]!;
          const cm = carMin[i * n + j]!;
          if (carShare > 0 && cm === cm) {
            carMinSum[p][0] += t * carShare * cm;
            carMinSum[p][1] += t * carShare;
          }
        }
      }
    }
  }
  const avgCarMin = Object.fromEntries(PURPOSES.map((p) => [p, carMinSum[p][1] > 0 ? carMinSum[p][0] / carMinSum[p][1] : 0])) as Record<Purpose, number>;
  return { byMode, transit, zoneTrips, zoneTransit, district, avgCarMin };
}

/** Weekday trips the rates generate (before destination choice), per resident. */
export function tripsPerResident(zones: Zone[], params: DemandParams = DEFAULT_PARAMS): number {
  let trips = 0;
  let pop = 0;
  for (const z of zones) {
    const s = z.seg;
    trips += (s.worker_car + s.worker_nocar) * params.rates.hbw + (s.post_car + s.post_nocar) * params.rates.hbu
      + (s.school_car + s.school_nocar) * params.rates.hbs + z.pop * (params.rates.hbo + params.rates.nhb);
    pop += z.pop;
  }
  return pop > 0 ? trips / pop : 0;
}

/** The same parameters with every trip rate scaled so residents make `target` weekday trips each. */
export function withTripRate(zones: Zone[], target: number, params: DemandParams = DEFAULT_PARAMS): DemandParams {
  const f = target / tripsPerResident(zones, params);
  const rates = Object.fromEntries(Object.entries(params.rates).map(([k, v]) => [k, v * f])) as Record<Purpose, number>;
  return { ...params, rates };
}

function sumNoCar(z: Zone): number {
  return z.seg.worker_nocar + z.seg.post_nocar + z.seg.school_nocar + z.seg.other_nocar;
}

export interface ShareTargets {
  transit: number;
  walk: number;
  bike: number;
  passenger: number;
}

/** Adjust mode constants until the regional shares meet the targets (or `maxIter` passes). */
export function calibrate(inp: ModelInputs, targets: ShareTargets, params: DemandParams = DEFAULT_PARAMS, maxIter = 20,
  log: (s: string) => void = () => {}) {
  const prep = prepare(inp);
  const p: DemandParams = structuredClone(params);
  let res = runModel(inp, p, prep);
  for (let it = 0; it < maxIter; it++) {
    const tot = MODES.reduce((a, m) => a + res.byMode[m], 0);
    const share = (m: TravelMode) => res.byMode[m] / tot;
    log(`  pass ${it + 1}: ${MODES.map((m) => `${m} ${(100 * share(m)).toFixed(1)}%`).join(', ')}`);
    const off = (Object.keys(targets) as (keyof ShareTargets)[]).map((m) => Math.abs(share(m) - targets[m]));
    if (Math.max(...off) < 0.002) break;
    for (const m of Object.keys(targets) as (keyof ShareTargets)[]) {
      p.asc[m] += Math.log(targets[m] / Math.max(share(m), 1e-6)) * 0.9;
    }
    res = runModel(inp, p, prep);
  }
  return { params: p, result: res };
}

// ------------------------------------------------------------------------------------------ assignment

export interface Assignment {
  boardingsByRoute: Map<string, number>;
  boardingsByStop: Map<string, number>;
  loads: Map<string, Float64Array>;
  /** the peak period's share of `loads` (for crowding: peak-hour riders against peak-hour capacity) */
  peakLoads: Map<string, Float64Array>;
  totals: { trips: number; boardings: number; ivtMin: number; waitMin: number; walkMin: number };
}

/** Load each period's transit trips onto the journeys RAPTOR finds (all-or-nothing per departure sample). */
export function assign(network: Network, zones: Zone[], transit: Record<Period, Float32Array>,
  params: DemandParams = DEFAULT_PARAMS, minTrips = 0.01, samplesPerPeriod = 4, onProgress?: (f: number) => void): Assignment {
  const n = zones.length;
  const boardingsByRoute = new Map<string, number>();
  const boardingsByStop = new Map<string, number>();
  const loads = new Map<string, Float64Array>();
  const peakLoads = new Map<string, Float64Array>();
  const totals = { trips: 0, boardings: 0, ivtMin: 0, waitMin: 0, walkMin: 0 };
  let pi = 0;
  for (const period of ['peak', 'offpeak'] as Period[]) {
    const samples = samplesFor(period, samplesPerPeriod);
    const rn = buildRaptor(network, samples[0]!, samples.at(-1)! + HORIZON_SEC);
    const r = new Raptor(rn);
    const acc = zoneAccess(rn, zones, params.accessRadiusM);
    const cost = new Float32Array(rn.nStops);
    const round = new Int8Array(rn.nStops);
    const egress = new Int32Array(n);
    const egRound = new Int8Array(n);
    const accessAt = new Float32Array(rn.nStops).fill(-1);
    const T = transit[period];
    for (let i = 0; i < n; i++) {
      const a = acc[i]!;
      let any = false;
      for (let j = 0; j < n; j++) if (T[i * n + j]! >= minTrips) any = true;
      if (!any || !a.stops.length) continue;
      for (const t0 of samples) {
        r.run(Array.from(a.stops, (s, k) => ({ stop: s, time: t0 + a.sec[k]! })), t0 + HORIZON_SEC);
        a.stops.forEach((s, k) => (accessAt[s] = a.sec[k]!));
        bestByStop(r, cost, round);
        pickEgress(acc, cost, egress, egRound, round);
        for (let j = 0; j < n; j++) {
          const trips = T[i * n + j]! / samples.length;
          if (trips * samples.length < minTrips || egress[j]! < 0) continue;
          const jr = r.journey(egRound[j]!, egress[j]!);
          if (!jr || !jr.legs.length) continue;
          let ivt = 0;
          for (const l of jr.legs) {
            const pid = rn.patternIds[l.pattern]!;
            const rid = rn.patternRoute[l.pattern]!;
            const ps = rn.patternStart[l.pattern]!;
            const stopId = rn.stopIds[rn.patternStops[ps + l.board]!]!;
            boardingsByRoute.set(rid, (boardingsByRoute.get(rid) ?? 0) + trips);
            boardingsByStop.set(stopId, (boardingsByStop.get(stopId) ?? 0) + trips);
            let ld = loads.get(pid);
            if (!ld) loads.set(pid, (ld = new Float64Array(rn.patternStart[l.pattern + 1]! - ps - 1)));
            for (let k = l.board; k < l.alight; k++) ld[k]! += trips;
            if (period === 'peak') {
              let pl = peakLoads.get(pid);
              if (!pl) peakLoads.set(pid, (pl = new Float64Array(rn.patternStart[l.pattern + 1]! - ps - 1)));
              for (let k = l.board; k < l.alight; k++) pl[k]! += trips;
            }
            ivt += r.legTime(l);
          }
          const first = rn.patternStops[rn.patternStart[jr.legs[0]!.pattern]! + jr.legs[0]!.board]!;
          const e = egress[j]!;
          const eg = acc[j]!;
          let egSec = 0;
          for (let k = 0; k < eg.stops.length; k++) if (eg.stops[k] === e) egSec = eg.sec[k]!;
          const walk = (accessAt[first]! >= 0 ? accessAt[first]! : 0) + jr.transferWalkSec + egSec;
          const total = r.arrival(egRound[j]!, e) + egSec - t0;
          totals.trips += trips;
          totals.boardings += trips * jr.legs.length;
          totals.ivtMin += (trips * ivt) / 60;
          totals.walkMin += (trips * walk) / 60;
          totals.waitMin += (trips * Math.max(0, total - ivt - walk)) / 60;
        }
        a.stops.forEach((s) => (accessAt[s] = -1));
      }
      if (onProgress && i % 50 === 0) onProgress((pi + i / n) / 2);
    }
    pi++;
  }
  return { boardingsByRoute, boardingsByStop, loads, peakLoads, totals };
}

// ------------------------------------------------------------------------------------------ report

export function calibrationRow(id: string, label: string, target: number, tolerance: number, model: number, relative: boolean,
  estimate: boolean, source: string): CalibrationRow {
  const pass = relative ? Math.abs(model - target) <= tolerance * target : Math.abs(model - target) <= tolerance;
  return { id, label, target, tolerance, model, pass, relative, estimate, source };
}

export type { DemandFile };
