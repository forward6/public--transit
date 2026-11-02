import type { NetPattern, RouteClass, Zone } from '@otc/shared';
import type { Trip } from './timetable';
import { rand } from './weather';

/**
 * Riders on board a bus or train right now, estimated from the demand model's weekday loads.
 *
 * The assignment gives each pattern's riders between consecutive stops over the day, and the
 * commute and school part of them ("peak" purposes). A route's riders between two stops are pooled
 * over its patterns and shared out between its trips by time of day and the gap each trip covers:
 * - commute trips are split both ways in the model, so a stretch carries its commuters in the
 *   morning where riders are heading towards jobs (inbound) and in the evening where they're heading
 *   home (`morningShares`);
 * - other trips follow a midday-heavy profile; weekends have no peaks.
 * Scaled to the day's riders (season, ramp-ups, weather, weekends). The model has no capacity
 * limit, so an estimate above capacity means riders left behind at stops.
 */

/** Seats per vehicle by route class (estimates; capacity is in `VEHICLE_CAPACITY`). */
export const SEATS: Record<RouteClass, number> = {
  transitway: 55, // 60-ft articulated
  frequent: 45,
  peak: 45,
  local: 38, // 40-ft low-floor
  rural: 38,
  sto: 40,
  otrain: 135, // three Talent cars
  commuter: 560, // four bi-level coaches
};

type Profile = number[];
/** Share of riders by hour of the service day (0–27), from a few points. */
const profile = (points: Record<number, number>): Profile => {
  const p = Array.from({ length: 28 }, (_, h) => points[h] ?? 0);
  const sum = p.reduce((a, b) => a + b, 0);
  return p.map((x) => x / sum);
};
/** Commuters heading to work and school. Estimates, after typical North American weekday curves. */
export const AM_PROFILE = profile({ 5: 0.02, 6: 0.1, 7: 0.33, 8: 0.31, 9: 0.12, 10: 0.06, 11: 0.04, 12: 0.02 });
/** Commuters heading home. */
export const PM_PROFILE = profile({ 13: 0.03, 14: 0.08, 15: 0.17, 16: 0.29, 17: 0.26, 18: 0.1, 19: 0.04, 20: 0.02, 21: 0.01 });
/** Shopping, errands, visits and other trips. */
export const OFFPEAK_PROFILE = profile({
  6: 0.02, 7: 0.04, 8: 0.05, 9: 0.06, 10: 0.07, 11: 0.08, 12: 0.09, 13: 0.085, 14: 0.08, 15: 0.08, 16: 0.08, 17: 0.075,
  18: 0.07, 19: 0.05, 20: 0.04, 21: 0.03, 22: 0.02, 23: 0.015, 24: 0.01, 25: 0.005,
});
/** Saturdays, Sundays and holidays. */
export const WEEKEND_PROFILE = profile({
  7: 0.02, 8: 0.04, 9: 0.06, 10: 0.08, 11: 0.09, 12: 0.1, 13: 0.1, 14: 0.1, 15: 0.09, 16: 0.08, 17: 0.07, 18: 0.06,
  19: 0.04, 20: 0.03, 21: 0.02, 22: 0.015, 23: 0.01, 24: 0.005,
});

/** A profile's weight at time t (s after midnight), interpolated between hour centres; never quite 0. */
export function profileAt(p: Profile, t: number): number {
  const h = t / 3600 - 0.5;
  const i = Math.floor(h);
  const f = h - i;
  const at = (k: number) => p[Math.max(0, Math.min(p.length - 1, k))]!;
  return Math.max(0.002, at(i) * (1 - f) + at(i + 1) * f);
}

/** How strongly riders' movement towards jobs turns into morning riders. Calibrated on the 2010 network. */
const DIRECTION_GAIN = 0.9;

/** Neighbourhood scale for the jobs share around a stop, km (a mall or a college shouldn't read as downtown). */
const JOBS_RADIUS_KM = 1.2;

/** The jobs share (jobs ÷ (jobs + residents)) around each point: zones weighted by distance. */
export function jobsShareAt(points: [number, number][], zones: Zone[]): number[] {
  const KX = 78.3; // km per degree of longitude at 45.4° N
  const KY = 111.1;
  const jobs = zones.map((z) => Object.values(z.jobs).reduce((a, b) => a + (b ?? 0), 0));
  const cut = (3 * JOBS_RADIUS_KM) ** 2;
  return points.map(([lon, lat]) => {
    let j = 0;
    let p = 0;
    zones.forEach((z, i) => {
      const d2 = ((z.lon - lon) * KX) ** 2 + ((z.lat - lat) * KY) ** 2;
      if (d2 > cut) return;
      const w = Math.exp(-d2 / (2 * JOBS_RADIUS_KM ** 2));
      j += w * jobs[i]!;
      p += w * z.pop;
    });
    return j + p > 0 ? j / (j + p) : 0.5;
  });
}

/**
 * The share of each segment's commuters who ride it in the morning (0.1–0.9): high where riders are
 * on their way from homes to jobs (inbound), low where they're heading away from jobs. A segment's
 * riders boarded upstream and get off downstream: compare the jobs share where people get off
 * downstream with where they got on upstream. A cross-town route through downtown is inbound on one
 * side and outbound on the other.
 */
export function morningShares(peakLoad: ArrayLike<number>, jobsShare: number[]): number[] {
  const n = peakLoad.length;
  const on = new Float64Array(n + 1);
  const off = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const before = i > 0 ? peakLoad[i - 1]! : 0;
    const after = i < n ? peakLoad[i]! : 0;
    on[i] = Math.max(0, after - before);
    off[i] = Math.max(0, before - after);
  }
  const out = new Array<number>(n);
  let onW = 0;
  let onJ = 0;
  let offW = 0;
  let offJ = 0;
  for (let i = 1; i <= n; i++) (offW += off[i]!), (offJ += off[i]! * (jobsShare[i] ?? 0.5));
  for (let k = 0; k < n; k++) {
    onW += on[k]!;
    onJ += on[k]! * (jobsShare[k] ?? 0.5);
    const score = onW > 0 && offW > 0 ? offJ / offW - onJ / onW : 0;
    out[k] = Math.max(0.1, Math.min(0.9, 0.5 + DIRECTION_GAIN * score));
    offW -= off[k + 1]!;
    offJ -= off[k + 1]! * (jobsShare[k + 1] ?? 0.5);
  }
  return out;
}

export interface RouteRidersInput {
  /** the route's patterns */
  patterns: NetPattern[];
  /** the route's trips that run today */
  trips: Trip[];
  /** weekday riders per segment over the day, per pattern id */
  loads: Record<string, ArrayLike<number>>;
  /** the commute and school part of `loads` */
  peakLoads?: Record<string, ArrayLike<number>>;
  /** per pattern id, from `morningShares` (default 0.5) */
  morning?: Record<string, number[]>;
  weekend: boolean;
  /** today's riders against the model's weekday */
  scale: number;
}

const MIN_HEADWAY = 120;
const MAX_HEADWAY = 3600;

/**
 * Riders on board each of a route's trips, between each pair of consecutive stops. The assignment
 * spreads riders between a route's patterns somewhat at random (it samples a few departure times),
 * so a route's riders between two stops are pooled over its patterns, then shared out between the
 * trips by the time of day and the gap each trip covers (riders turning up per hour × headway).
 */
export function routeRiders(inp: RouteRidersInput): (trip: Trip) => number[] {
  const { patterns, trips, loads, peakLoads, morning, weekend, scale } = inp;
  // pooled riders per stop pair: morning commute, evening commute, other
  const pool = new Map<string, { am: number; pm: number; off: number; times: number[] }>();
  const key = (p: NetPattern, k: number) => `${p.stops[k]}|${p.stops[k + 1]}`;
  for (const p of patterns) {
    const ld = loads[p.id];
    if (!ld) continue;
    const pl = peakLoads?.[p.id];
    const ms = morning?.[p.id];
    for (let k = 0; k < ld.length; k++) {
      const c = Math.min(pl?.[k] ?? 0, ld[k]!);
      const m = ms?.[k] ?? 0.5;
      let e = pool.get(key(p, k));
      if (!e) pool.set(key(p, k), (e = { am: 0, pm: 0, off: 0, times: [] }));
      e.am += c * m;
      e.pm += c * (1 - m);
      e.off += ld[k]! - c;
    }
  }
  const byId = new Map(patterns.map((p) => [p.id, p]));
  for (const t of trips) {
    const p = byId.get(t.patternId);
    if (!p) continue;
    for (let k = 0; k < p.stops.length - 1; k++) pool.get(key(p, k))?.times.push(t.dep[k]!);
  }
  for (const e of pool.values()) e.times.sort((a, b) => a - b);
  const headway = (times: number[], t: number) => {
    let lo = 0;
    let hi = times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid]! < t) lo = mid + 1;
      else hi = mid;
    }
    const prev = lo > 0 ? t - times[lo - 1]! : Infinity;
    const next = lo < times.length - 1 ? times[lo + 1]! - t : Infinity;
    const h = Number.isFinite(prev) && Number.isFinite(next) ? (prev + next) / 2 : Math.min(prev, next);
    return Math.max(MIN_HEADWAY, Math.min(MAX_HEADWAY, Number.isFinite(h) ? h : MAX_HEADWAY));
  };
  return (trip) => {
    const p = byId.get(trip.patternId);
    if (!p) return [];
    const noise = 0.85 + 0.3 * rand(7, trip.id); // no two trips quite alike
    return p.stops.slice(0, -1).map((_, k) => {
      const e = pool.get(key(p, k));
      if (!e) return 0;
      const t = trip.dep[k]!;
      const perHour = weekend
        ? (e.am + e.pm + e.off) * profileAt(WEEKEND_PROFILE, t)
        : e.am * profileAt(AM_PROFILE, t) + e.pm * profileAt(PM_PROFILE, t) + e.off * profileAt(OFFPEAK_PROFILE, t);
      return (perHour * headway(e.times, t)) / 3600 * scale * noise;
    });
  };
}

/** The segment a vehicle is on: leaving the stop it's at, or heading to its next stop. */
export function segmentNow(stopIndex: number, dwelling: boolean, stops: number): number {
  return Math.max(0, Math.min(stops - 2, dwelling ? stopIndex : stopIndex - 1));
}

/** Convenience: the pattern's stops as points. */
export function patternPoints(pattern: NetPattern, stop: (id: string) => { lon: number; lat: number } | undefined): [number, number][] {
  return pattern.stops.map((id) => {
    const s = stop(id);
    return s ? [s.lon, s.lat] : [0, 0];
  });
}
