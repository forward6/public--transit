// Riders on board, as the vehicle panel estimates them: a few routes at a few times of day.
// Usage: pnpm --filter @otc/sim onboard-demo
import { readFileSync } from 'node:fs';
import type { DemandFile, Network, ZonesFile } from '@otc/shared';
import { Playback } from '../src/playback';
import { VEHICLE_CAPACITY } from '../src/crowding';
import { SEATS, jobsShareAt, morningShares, patternPoints, routeRiders } from '../src/onboard';

const data = new URL('../../../apps/web/public/data/', import.meta.url);
const read = <T,>(f: string) => JSON.parse(readFileSync(new URL(f, data), 'utf8')) as T;
const net = read<Network>('network-2010.json');
const zones = read<ZonesFile>('zones-2011.json').zones;
const demand = read<DemandFile>('demand-2011.json');
const pb = new Playback(net);
const stops = new Map(net.stops.map((s) => [s.id, s]));
const morning: Record<string, number[]> = {};
for (const p of net.patterns) {
  const pl = demand.peakLoads?.[p.id];
  if (pl) morning[p.id] = morningShares(pl, jobsShareAt(patternPoints(p, (id) => stops.get(id)), zones));
}
const shares = Object.entries(morning).flatMap(([id, m]) => m.map((x, k) => [x, demand.peakLoads![id]![k]!] as const))
  .filter(([, l]) => l > 50).map(([x]) => x).sort((a, b) => a - b);
const q = (f: number) => shares[Math.floor(f * (shares.length - 1))]!.toFixed(2);
console.log('morning share of commuters on busy stretches, quantiles 0/10/25/50/75/90/100%:', [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map(q).join(' '));

const show = (short: string, hours: number[], weekend = false) => {
  const route = net.routes.find((r) => r.shortName === short && r.agency === 'octranspo');
  if (!route) return;
  const patterns = net.patterns.filter((x) => x.routeId === route.id);
  const hash = (id: string) => { let h = 2166136261; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619); return ((h >>> 0) % 1000) / 1000; };
  const trips = pb.trips.filter((t) => t.routeId === route.id && (!weekend || hash(t.id) < 0.6));
  const riders = routeRiders({ patterns, trips, loads: demand.loads, peakLoads: demand.peakLoads, morning, weekend, scale: 1 });
  const cap = VEHICLE_CAPACITY[route.class];
  const heads = [...new Set(patterns.map((p) => p.headsign))];
  for (const head of heads) {
    const main = patterns.filter((p) => p.headsign === head).sort((a, b) => trips.filter((t) => t.patternId === b.id).length - trips.filter((t) => t.patternId === a.id).length)[0];
    if (!main) continue;
    const mt = trips.filter((t) => t.patternId === main.id);
    const line = hours.map((h) => {
      const trip = mt.find((t) => t.dep[0]! >= h * 3600);
      if (!trip) return `${h}h –`;
      const l = riders(trip);
      const k = l.indexOf(Math.max(...l));
      return `${h}h ${Math.round(l[k]!)} (${stops.get(main.stops[k]!)?.name.slice(0, 14)})`;
    });
    console.log(`${weekend ? 'Sat ' : ''}${short} → ${main.headsign} (${mt.length} trips; seats ${SEATS[route.class]}, room for ${cap}): busiest stretch ${line.join(' · ')}`);
  }
};
for (const r of ['95', '97', '94', '96', '2', '7', '85', '14', '1', '118', '62', '161']) show(r, [6.5, 7.5, 8.25, 12, 16.5, 17.5, 21]);
show('95', [10, 14, 18], true);
show('2', [10, 14, 18], true);
