import { parseClock, type Network, type NetPattern, type NetRoute, type ServicePeriod } from '@otc/shared';

/** A scheduled run of one pattern: arrival and departure time at every stop (seconds after midnight). */
export interface Trip {
  id: string;
  routeId: string;
  patternId: string;
  arr: Float64Array;
  dep: Float64Array;
}

export const PEAKS: [number, number][] = [
  [parseClock('06:30'), parseClock('09:00')],
  [parseClock('15:00'), parseClock('18:00')],
];

export function isPeak(t: number): boolean {
  return PEAKS.some(([a, b]) => t >= a && t < b);
}

/** Departure times generated from frequency periods; direction 1 is offset by half a headway. */
export function departuresFromPeriods(periods: ServicePeriod[], direction: 0 | 1): number[] {
  const out: number[] = [];
  for (const p of periods) {
    const from = parseClock(p.from);
    const to = parseClock(p.to);
    const h = p.headwayMin * 60;
    if (h <= 0) continue;
    for (let t = from + (direction === 1 ? h / 2 : 0); t < to; t += h) out.push(Math.round(t));
  }
  return out.sort((a, b) => a - b);
}

export function buildTrip(route: NetRoute, pattern: NetPattern, start: number, idx: number): Trip {
  const n = pattern.stops.length;
  const arr = new Float64Array(n);
  const dep = new Float64Array(n);
  const factor = isPeak(start) ? 1 : (route.offPeakFactor ?? 0.92);
  let t = start;
  for (let i = 0; i < n; i++) {
    arr[i] = t;
    t += i === 0 ? 0 : (pattern.dwell[i] ?? 0);
    dep[i] = t;
    if (i < n - 1) t += (pattern.runTimes[i] ?? 0) * factor;
  }
  return { id: `${pattern.id}#${idx}`, routeId: route.id, patternId: pattern.id, arr, dep };
}

/** Every trip of a representative weekday, sorted by start time. */
export function buildTimetable(network: Network): Trip[] {
  const patterns = new Map(network.patterns.map((p) => [p.id, p]));
  const trips: Trip[] = [];
  for (const route of network.routes) {
    for (const pid of route.patterns) {
      const pattern = patterns.get(pid);
      if (!pattern) continue;
      const starts = route.departures?.[pid] ?? departuresFromPeriods(route.weekday ?? [], pattern.direction);
      starts.forEach((s, i) => trips.push(buildTrip(route, pattern, s, i)));
    }
  }
  return trips.sort((a, b) => a.dep[0]! - b.dep[0]!);
}
