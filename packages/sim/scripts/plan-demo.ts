// A demo of the design tools in Node (needs the built data): draw a route, change service, evaluate.
//   pnpm --filter @otc/sim plan-demo
import { readFileSync } from 'node:fs';
import type { DemandFile, Network, ZonesFile } from '@otc/shared';
import { StreetGraph, applyEdits, currentHeadways, draftToEdit, evaluate, routeDraft, Isochrones, type DemandParams } from '../src/index';

const data = new URL('../../../apps/web/public/data/', import.meta.url);
const read = (f: string) => readFileSync(new URL(f, data));
const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const net = JSON.parse(read('network-2010.json').toString()) as Network;
const zones = (JSON.parse(read('zones-2011.json').toString()) as ZonesFile).zones;
const car = new Uint8Array(read('car-2011.bin'));
const demand = JSON.parse(read('demand-2011.json').toString()) as DemandFile;
const params = demand.params as unknown as DemandParams;
let t = performance.now();
const graph = new StreetGraph(ab(read('graph-2010.bin')), JSON.parse(read('graph-2010.json').toString()));
console.log(`graph load ${(performance.now() - t).toFixed(0)} ms`);
t = performance.now();
// a crosstown route: Terry Fox station -> Kanata Centrum -> March Road
const draft = routeDraft(graph, [[-75.9300, 45.3090], [-75.9100, 45.3120], [-75.9000, 45.3390]], net.stops, 'plan-1');
console.log(`draft ${(performance.now() - t).toFixed(0)} ms:`, draft && { km: (draft.lengthM / 1000).toFixed(1), min: (draft.runSec / 60).toFixed(1),
  stops: draft.stops.map((s) => `${s.existing ? '*' : ''}${s.name}`) });
const r95 = net.routes.find((r) => r.id === 'oct-95')!;
const h95 = currentHeadways(r95, net);
console.log('route 95 headways now:', h95);
const edits = [
  draftToEdit(draft!, { id: 'plan-1', shortName: 'N1', headways: { am: 10, midday: 15, pm: 10, evening: 30 }, color: '#2856B8' }),
  { kind: 'service' as const, routeId: 'oct-95', headways: { ...h95, am: Math.max(5, h95.am / 2) } },
  { kind: 'remove' as const, routeId: 'oct-118' },
];
const scen = applyEdits(net, edits);
console.log(`scenario: ${scen.routes.length} routes, ${scen.patterns.length} patterns`);
for (const [label, n] of [['base', net], ['plan', scen]] as const) {
  t = performance.now();
  const ev = evaluate(n, { zones, car, params, samples: 2 });
  const s = ev.score;
  console.log(`${label}: ${((performance.now() - t) / 1000).toFixed(1)} s | boardings ${Math.round(s.boardings)} | share ${(100 * s.transitShare).toFixed(2)}% | ` +
    `coverage ${(100 * s.coverage).toFixed(1)}% / frequent ${(100 * s.coverageFrequent).toFixed(1)}% | jobs45 ${Math.round(s.jobsIn45)} | ` +
    `${JSON.stringify(ev.timing)} | veh-h ${Math.round(s.vehicleHours)} | peak veh ${s.peakVehicles} | $${(s.annualCost / 1e6).toFixed(0)}M/yr | N1 ${Math.round(s.byRoute['plan-1'] ?? 0)} | 95 ${Math.round(s.byRoute['oct-95'] ?? 0)}`);
}
t = performance.now();
const iso = new Isochrones(scen, zones);
const mins = iso.from(-75.6972, 45.4215);
console.log(`isochrone ${(performance.now() - t).toFixed(0)} ms; zones within 30 min of Parliament: ${Array.from(mins).filter((m) => m <= 30).length}`);
