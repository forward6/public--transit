// Ten years of growth (needs the built data): where new residents and jobs go on the 2010 network,
// and with a Confederation-like light-rail line, Tunney's Pasture to Blair (MEASURE=1 runs the
// demand model for the line's level of service, a minute or two; otherwise the 2010 network only).
//   pnpm --filter @otc/sim growth-demo
import { readFileSync } from 'node:fs';
import { type DemandFile, type DemandParams, type Network, type ZoneLos, type ZonesFile } from '@otc/shared';
import {
  addMonths, advanceGrowth, roomLeft, startGrowth, applyEdits, assignWards, carAccessOf, evaluate, growthSummary, lineEdit, newDesign, newGame, prepare, serviceStats, stationAt,
  type GameState, type GrowthWorld,
} from '../src/index';

const data = new URL('../../../apps/web/public/data/', import.meta.url);
const read = <T,>(f: string) => JSON.parse(readFileSync(new URL(f, data), 'utf8')) as T;
const net = read<Network>('network-2010.json');
const zones = read<ZonesFile>('zones-2011.json').zones;
const demand = read<DemandFile>('demand-2011.json');
const car = new Uint8Array(readFileSync(new URL('car-2011.bin', data)));
const oc: Network = { ...net, routes: net.routes.filter((r) => r.agency === 'octranspo') };
const svc = serviceStats(oc);
const world: GrowthWorld = {
  zones, baseLos: demand.los!, share: zones.map((z) => demand.zones[String(z.id)]?.[1] ?? 0), wardOf: assignWards(zones),
  places: net.stops.filter((x) => x.kind === 'station').map((x) => ({ lon: x.lon, lat: x.lat, name: x.name })),
  carAccess: carAccessOf(zones, car),
};
const fmt = (x: number) => Math.round(x).toLocaleString('en');

function run(label: string, los?: ZoneLos) {
  let s: GameState = newGame({ boardings: demand.summary.boardingsByAgency.octranspo!, vehicleHours: svc.vehicleHours, peakVehicles: svc.peakVehicles });
  if (los) s = { ...s, los };
  const t0 = Date.now();
  for (let m = 0; m < 120; m++) {
    const ended = s.date.slice(0, 7);
    s = { ...s, date: addMonths(s.date, 1).slice(0, 8) + '01', events: s.events.filter((e) => !e.decision) };
    advanceGrowth(s, world, ended);
  }
  const g = s.growth!;
  const sum = growthSummary(g);
  const pct = (x: number) => `${((100 * x) / Math.max(1, sum.pop)).toFixed(0)}%`;
  console.log(`\n${label} — ten years to ${s.date} (${Date.now() - t0} ms)`);
  console.log(`  +${fmt(sum.pop)} residents, +${fmt(sum.jobs)} jobs; riders ×${g.riders.toFixed(3)}`);
  console.log(`  residents: near a station ${pct(sum.where.station)}, core ${pct(sum.where.core)}, suburban edge ${pct(sum.where.suburbs)}, Gatineau ${pct(sum.where.gatineau)}, rural ${pct(sum.where.rural)}`);
  const top = zones.map((z, i) => ({ i, d: g.pop[i]! + g.jobs[i]! })).sort((a, b) => b.d - a.d).slice(0, 8);
  console.log(`  top zones: ${top.map(({ i }) => `${zones[i]!.district}@${zones[i]!.lon.toFixed(3)},${zones[i]!.lat.toFixed(3)} +${g.pop[i]}/${g.jobs[i]}`).join('; ')}`);
  console.log(`  developer offers: ${g.rezonings.length} (${g.rezonings.map((r) => `${r.station} ${r.homes}`).join(', ')})`);
  return g;
}

const base = run('2010 network');
if (process.env.MEASURE) {
  const pts: [number, number, string][] = [
    [-75.735181, 45.403725, 'surface'], [-75.721943, 45.409442, 'surface'], [-75.713435, 45.413737, 'tunnel'], [-75.7045, 45.4195, 'tunnel'],
    [-75.6964, 45.4216, 'tunnel'], [-75.6897, 45.424, 'tunnel'], [-75.682238, 45.420249, 'surface'], [-75.670482, 45.416345, 'surface'],
    [-75.664827, 45.411876, 'surface'], [-75.652216, 45.41743, 'surface'], [-75.637918, 45.420638, 'surface'], [-75.626579, 45.422545, 'surface'],
    [-75.60828, 45.431056, 'surface'],
  ];
  const design = newDesign('lrt', 1);
  design.stations = pts.map(([lon, lat], i) => stationAt(lon, lat, net.stops, `line-1-s${i}`));
  design.structure = pts.slice(0, -1).map((p) => p[2] as 'surface' | 'tunnel');
  const params = demand.params as unknown as DemandParams;
  const prep = prepare({ zones, car, skims: null as never });
  const b = evaluate(net, { zones, car, params, samples: 2 }, prep).score;
  const p = evaluate(applyEdits(net, [lineEdit(design, 'line-1')]), { zones, car, params, samples: 2 }, prep).score;
  const los: ZoneLos = {
    access: demand.los!.access.map((a, i) => Math.round((a * (p.zoneAccess![i]! + 1)) / (b.zoneAccess![i]! + 1))),
    wait: demand.los!.wait,
  };
  const g = run('with the light-rail line', los);
  // where the line moved growth: zones within a km of its stations
  const near = zones.map((z) => design.stations.some((st) => Math.hypot((st.lon - z.lon) * 78_300, (st.lat - z.lat) * 111_100) < 1000));
  const sumNear = (x: number[]) => x.reduce((a, v, i) => a + (near[i] ? v : 0), 0);
  const idx = zones.map((_, i) => i).filter((i) => near[i]);
  const ratio = idx.map((i) => (los.access[i]! + 1) / (demand.los!.access[i]! + 1));
  console.log(`  access ratio near the line: mean ${(ratio.reduce((a, x) => a + x, 0) / ratio.length).toFixed(2)}, max ${Math.max(...ratio).toFixed(2)}; zones ${idx.length}`);
  const { room } = roomLeft({ ...newGame({ boardings: 1, vehicleHours: 1, peakVehicles: 1 }), date: '2010-12-01' }, world, startGrowth(zones.length, '2010-12-01'));
  console.log(`  room near the line in 2010: ${fmt(idx.reduce((a, i) => a + room[i]!, 0))} residents; filled by 2020: ${fmt(sumNear(g.pop))}`);
  console.log(`\n  within 1 km of the line: residents +${fmt(sumNear(base.pop))} → +${fmt(sumNear(g.pop))}, jobs +${fmt(sumNear(base.jobs))} → +${fmt(sumNear(g.jobs))}`);
}
