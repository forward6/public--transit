import { describe, expect, it } from 'vitest';
import type { NetPattern } from '@otc/shared';
import { morningShares, routeRiders, segmentNow } from './onboard';
import type { Trip } from './timetable';

const pattern = (id: string, stops: string[]): NetPattern => ({
  id, routeId: 'r', direction: 0, headsign: 'x', stops, stopDist: stops.map((_, i) => i * 500), shape: [], runTimes: stops.slice(1).map(() => 90), dwell: stops.map(() => 20),
});
const tripsEvery = (p: NetPattern, minutes: number, from = 5, to = 24): Trip[] => {
  const out: Trip[] = [];
  for (let t = from * 3600; t < to * 3600; t += minutes * 60) {
    const dep = Float64Array.from(p.stops, (_, i) => t + i * 110);
    out.push({ id: `${p.id}-${t}`, routeId: 'r', patternId: p.id, dep, arr: dep });
  }
  return out;
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('riders on board', () => {
  // suburb (few jobs) → downtown (mostly jobs); riders build up towards downtown
  const inbound = [0.1, 0.15, 0.3, 0.8, 0.9];
  const load = [100, 300, 500, 200];
  const peak = [60, 180, 300, 120];

  it('puts inbound commuters in the morning and outbound ones in the evening', () => {
    expect(Math.min(...morningShares(peak, inbound))).toBeGreaterThan(0.6);
    expect(Math.max(...morningShares([...peak].reverse(), [...inbound].reverse()))).toBeLessThan(0.4);
    // through downtown: inbound on the way in, outbound on the way out
    const through = morningShares([100, 200, 100, 150, 50], [0.1, 0.2, 0.9, 0.9, 0.3, 0.1]);
    expect(through[0]!).toBeGreaterThan(0.5);
    expect(through[4]!).toBeLessThan(0.5);
  });

  it('shares a day of riders out between the trips', () => {
    const p = pattern('in', ['a', 'b', 'c', 'd', 'e']);
    const trips = tripsEvery(p, 10);
    const riders = routeRiders({ patterns: [p], trips, loads: { in: load }, peakLoads: { in: peak }, morning: { in: morningShares(peak, inbound) }, weekend: false, scale: 1 });
    const all = trips.map(riders);
    // all-day service carries about the whole day's riders (some ride before 5:00 or after midnight)
    for (let k = 0; k < load.length; k++) expect(sum(all.map((r) => r[k]!)) / load[k]!).toBeGreaterThan(0.85);
    for (let k = 0; k < load.length; k++) expect(sum(all.map((r) => r[k]!)) / load[k]!).toBeLessThan(1.15);
    const at = (h: number) => riders(trips.find((t) => t.dep[0]! >= h * 3600)!)[2]!;
    expect(at(8)).toBeGreaterThan(2 * at(17.5)); // inbound: busier in the morning
    expect(at(8)).toBeGreaterThan(2 * at(13));
    expect(at(23)).toBeLessThan(at(13));
    // half the buses: twice the riders on each
    const half = tripsEvery(p, 20);
    const r2 = routeRiders({ patterns: [p], trips: half, loads: { in: load }, peakLoads: { in: peak }, morning: { in: morningShares(peak, inbound) }, weekend: false, scale: 1 });
    const at2 = r2(half.find((t) => t.dep[0]! >= 13 * 3600)!)[2]!;
    expect(at2 / at(13)).toBeGreaterThan(1.5);
    // weekends have no rush hours; today's riders scale it all
    const sat = routeRiders({ patterns: [p], trips, loads: { in: load }, peakLoads: { in: peak }, weekend: true, scale: 0.5 });
    const satAt = (h: number) => sat(trips.find((t) => t.dep[0]! >= h * 3600)!)[2]!;
    expect(satAt(13)).toBeGreaterThan(satAt(8));
    expect(sum(trips.map((t) => sat(t)[2]!)) / load[2]!).toBeCloseTo(0.5, 1);
  });

  it('knows which stretch a vehicle is on', () => {
    expect(segmentNow(0, true, 5)).toBe(0); // at the first stop
    expect(segmentNow(3, false, 5)).toBe(2); // heading to stop 3
    expect(segmentNow(4, true, 5)).toBe(3); // at the last stop
  });
});
