import type { LngLat, Network, RouteClass } from '@otc/shared';
import { prepareLine, sliceLine } from './geometry';
import type { Trip } from './timetable';

/**
 * Where the load is: riders in the morning peak hour against the capacity of the buses and trains
 * scheduled through each stop-to-stop segment in that hour, summed over every route that runs it
 * (a corridor like the Transitway is one segment carried by many routes).
 */

/** Planning capacity per vehicle (seated + comfortable standing), by route class. Estimates. */
export const VEHICLE_CAPACITY: Record<RouteClass, number> = {
  transitway: 100, // mostly 60-ft articulated buses
  frequent: 80,
  peak: 80,
  local: 65, // 40-ft buses
  rural: 60,
  sto: 70,
  otrain: 260, // a three-car Talent train
};

/**
 * Share of a segment's peak-period riders (both peaks, routed in the morning) in its busiest hour.
 * Calibrated so the central Transitway runs about half full on paper and the hotspots stand out:
 * the timetable is August 2011 (summer service), thinner than December's.
 */
export const PEAK_HOUR_SHARE = 0.3;
/** Without peak-period loads: share of daily riders in the busiest hour. Estimate. */
const DAILY_PEAK_HOUR_SHARE = 0.11;
/** Capacity is counted over the morning peak window and averaged per hour. */
const WINDOW: [number, number] = [7 * 3600, 9 * 3600];

export const CROWDING_SOURCE = 'Estimates: vehicle capacities by route class; 30% of a segment’s peak-period riders in its busiest hour; capacity from the trips scheduled 07:00–09:00. The timetable is August 2011 (summer service), so some suburban routes look more crowded than they would in December.';

export type LoadLevel = 'calm' | 'busy' | 'crowded' | 'over';

/** Calm below 65% of capacity, busy, crowded from 90%, over capacity (riders left behind) above 110%. */
export const loadLevel = (lf: number): LoadLevel => (lf >= 1.1 ? 'over' : lf >= 0.9 ? 'crowded' : lf >= 0.65 ? 'busy' : 'calm');

export interface SegmentLoad {
  /** stop ids */
  from: string;
  to: string;
  /** route ids running it */
  routes: string[];
  /** weekday riders, all day */
  daily: number;
  /** riders in the busiest morning hour */
  peakHour: number;
  /** places per hour in the morning peak */
  capacity: number;
  /** peakHour ÷ capacity */
  lf: number;
  coords: LngLat[];
}

export interface RouteLoad {
  routeId: string;
  /** the route's busiest segment (its own riders against its own buses) */
  maxLf: number;
  peakHour: number;
  from: string;
  to: string;
}

export interface LoadReport {
  segments: SegmentLoad[];
  routes: RouteLoad[];
}

/**
 * Loads on every segment of a network (`loads`, `peakLoads`: weekday riders per pattern segment from
 * the assignment), scaled by `scale` (season, growth, riders still settling after a change).
 */
export function loadReport(network: Network, trips: Trip[], loads: Record<string, number[]>,
  peakLoads: Record<string, number[]> | undefined, scale = 1, minDaily = 20): LoadReport {
  const routes = new Map(network.routes.map((r) => [r.id, r]));
  // trips per hour through each pattern position in the morning window
  const tph = new Map<string, Float64Array>();
  const hours = (WINDOW[1] - WINDOW[0]) / 3600;
  for (const t of trips) {
    let a = tph.get(t.patternId);
    if (!a) tph.set(t.patternId, (a = new Float64Array(t.dep.length)));
    for (let i = 0; i < t.dep.length; i++) if (t.dep[i]! >= WINDOW[0] && t.dep[i]! < WINDOW[1]) a[i]! += 1 / hours;
  }
  const seg = new Map<string, SegmentLoad>();
  const byRoute = new Map<string, RouteLoad>();
  for (const p of network.patterns) {
    const ld = loads[p.id];
    if (!ld) continue;
    const pl = peakLoads?.[p.id];
    const route = routes.get(p.routeId);
    const cap = VEHICLE_CAPACITY[route?.class ?? 'local'];
    const freq = tph.get(p.id);
    let line: ReturnType<typeof prepareLine> | null = null;
    for (let i = 0; i < ld.length; i++) {
      const daily = ld[i]! * scale;
      const peak = (pl ? pl[i]! * PEAK_HOUR_SHARE : ld[i]! * DAILY_PEAK_HOUR_SHARE) * scale;
      const capacity = (freq?.[i] ?? 0) * cap;
      const key = `${p.stops[i]}|${p.stops[i + 1]}`;
      let s = seg.get(key);
      if (!s) {
        line ??= p.shape.length >= 2 ? prepareLine(p.shape) : null;
        const coords = (line ? sliceLine(line, p.stopDist[i]!, p.stopDist[i + 1]!) : []) as LngLat[];
        seg.set(key, (s = { from: p.stops[i]!, to: p.stops[i + 1]!, routes: [], daily: 0, peakHour: 0, capacity: 0, lf: 0, coords }));
      }
      if (!s.routes.includes(p.routeId)) s.routes.push(p.routeId);
      s.daily += daily;
      s.peakHour += peak;
      s.capacity += capacity;
      // the route's own crowding
      if (capacity > 0 && peak >= 20) {
        const lf = peak / capacity;
        const cur = byRoute.get(p.routeId);
        if (!cur || lf > cur.maxLf) byRoute.set(p.routeId, { routeId: p.routeId, maxLf: lf, peakHour: peak, from: p.stops[i]!, to: p.stops[i + 1]! });
      }
    }
  }
  const segments = [...seg.values()].filter((s) => s.daily >= minDaily && s.coords.length >= 2);
  for (const s of segments) s.lf = s.capacity > 0 ? s.peakHour / s.capacity : s.peakHour >= 20 ? 1.5 : 0;
  return {
    segments: segments.sort((a, b) => a.lf - b.lf), // most crowded drawn last
    routes: [...byRoute.values()].sort((a, b) => b.maxLf - a.maxLf),
  };
}
