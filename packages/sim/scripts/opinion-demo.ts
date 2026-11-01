// A year of public opinion in fast-forward (needs the built data): the 2010 network, the personas'
// trips, weather, budgets with a fare hike in 2012, and the press.
//   pnpm --filter @otc/sim opinion-demo [fare-change-% for 2012] [levy-change-%]
import { readFileSync } from 'node:fs';
import { PERSONAS, type DemandFile, type Network, type ZonesFile } from '@otc/shared';
import {
  JourneyPlanner, districtOpinion, explainCity, newGame, openDecision, opinionSummary, resolve, serviceStats, stepDay, withOpinion,
  type GameState, type GameWorld,
} from '../src/index';

const data = new URL('../../../apps/web/public/data/', import.meta.url);
const read = <T,>(f: string) => JSON.parse(readFileSync(new URL(f, data), 'utf8')) as T;
const net = read<Network>('network-2010.json');
const zones = read<ZonesFile>('zones-2011.json').zones;
const demand = read<DemandFile>('demand-2011.json');
if (!demand.los) throw new Error('demand-2011.json has no zone levels of service; rerun `pnpm --filter @otc/sim demand`');
const oc: Network = { ...net, routes: net.routes.filter((r) => r.agency === 'octranspo') };
const svc = serviceStats(oc);
const jp = new JourneyPlanner(net);
const trips = Object.fromEntries(PERSONAS.map((p) => [p.id, {
  out: jp.plan([p.home.lon, p.home.lat], [p.dest.lon, p.dest.lat], p.out),
  back: jp.plan([p.dest.lon, p.dest.lat], [p.home.lon, p.home.lat], p.back),
}]));
const routes = new Map(net.routes.map((r) => [r.id, r.shortName]));
const stops = new Map(net.stops.map((s) => [s.id, s.name]));
const world: GameWorld = {
  zones, baseLos: demand.los, share: zones.map((z) => demand.zones[String(z.id)]?.[1] ?? 0), trips,
  places: net.stops.filter((s) => s.kind === 'station').map((s) => ({ lon: s.lon, lat: s.lat, name: s.name })),
  routeName: (id) => routes.get(id) ?? id, stopName: (id) => stops.get(id) ?? id,
};
const fare = Number(process.argv[2] ?? 10);
const levy = Number(process.argv[3] ?? 0);
let s: GameState = withOpinion(newGame({ boardings: demand.summary.boardingsByAgency.octranspo!, vehicleHours: svc.vehicleHours,
  peakVehicles: svc.peakVehicles }), world);
const show = (label: string) => {
  const o = opinionSummary(s.opinion!, world, s.date);
  console.log(`${label} ${s.date}: approval ${o.approval}% (service ${o.service}, value ${o.value}, trust ${o.trust})`);
};
show('start');
const d0 = districtOpinion(s.opinion!, world, s.date);
console.log('  by district:', Object.entries(d0).map(([d, r]) => `${d} ${r.approval}%`).join(', '));
for (let day = 0; day < 430; day++) {
  for (let d = openDecision(s); d; d = openDecision(s)) {
    if (d.kind === 'budget') {
      const y = Number(d.data.year);
      s = resolve(s, d.id, { kind: 'budget', choice: { levyChange: y === 2011 ? 0 : levy, fareChange: y === 2012 ? fare : 0, maintenance: 1 } });
    } else if (d.kind === 'deficit') s = resolve(s, d.id, { kind: 'deficit', choice: 'borrow' });
    else s = resolve(s, d.id, { kind: 'shortfall', choice: 'order' });
  }
  s = stepDay(s, world);
  if (s.date.endsWith('-01')) {
    show('  ');
    const fp = s.press!.at(-1)!;
    console.log(`     front page ${fp.month}: ${fp.stories.map((x) => `${x.kind}(${x.tone},${x.salience})${JSON.stringify(x.params)}`).join(' | ')}`);
  }
}
show('end');
console.log('  why (citywide):', explainCity(s, world).filter((r) => Math.abs(r.value) >= 0.5).map((r) => `${r.axis}.${r.key} ${r.value}`).join(', '));
console.log('  by district:', Object.entries(districtOpinion(s.opinion!, world, s.date)).map(([d, r]) => `${d} ${r.approval}%`).join(', '));
console.log('  shocks:', s.opinion!.shocks.map((k) => `${k.date} ${k.kind} ${k.amount}`).join(', '));
for (const p of PERSONAS) {
  const es = s.diaries?.[p.id] ?? [];
  const kinds = new Map<string, number>();
  for (const e of es) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
  console.log(`  ${p.name}: ${es.length} days, mood ${(es.reduce((a, e) => a + e.mood, 0) / Math.max(1, es.length)).toFixed(2)}, ${[...kinds].map(([k, n]) => `${k}×${n}`).join(' ')}`);
}
console.log('  posts:', s.posts!.slice(-8).map((p) => `${p.date} ${p.kind}/${p.tone} ${p.author.name}@${p.author.place} ${JSON.stringify(p.params)}`).join('\n         '));
console.log(`  state size: ${(JSON.stringify(s).length / 1024).toFixed(0)} kB`);
