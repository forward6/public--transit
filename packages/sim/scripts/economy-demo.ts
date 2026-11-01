// A campaign in fast-forward (needs the built data): the 2010 network, budgets that freeze the levy,
// and deficits covered by borrowing — to see where the money and the fleet go.
//   pnpm --filter @otc/sim economy-demo [levy-change-%]
import { readFileSync } from 'node:fs';
import type { DemandFile, Network } from '@otc/shared';
import { advanceDay, fleetStatus, newGame, openDecision, resolve, serviceStats, type GameState } from '../src/index';

const data = new URL('../../../apps/web/public/data/', import.meta.url);
const net = JSON.parse(readFileSync(new URL('network-2010.json', data), 'utf8')) as Network;
const demand = JSON.parse(readFileSync(new URL('demand-2011.json', data), 'utf8')) as DemandFile;
const oc: Network = { ...net, routes: net.routes.filter((r) => r.agency === 'octranspo') };
const svc = serviceStats(oc);
const service = { boardings: demand.summary.boardingsByAgency.octranspo!, vehicleHours: svc.vehicleHours, peakVehicles: svc.peakVehicles };
console.log('OC Transpo weekday:', service);
const levyPct = Number(process.argv[2] ?? 0);
let s: GameState = newGame(service);
const fmt = (x: number) => `$${(x / 1e6).toFixed(1)}M`;
console.log(`start ${s.date}: reserve ${fmt(s.reserve)}, 2011 levy (balancing) ${fmt(s.levy)}, fleet ${fleetStatus(s).buses} buses, needs ${fleetStatus(s).required}`);
for (let day = 0; day < 365 * 5 + 40; day++) {
  let d = openDecision(s);
  while (d) {
    if (d.kind === 'budget') s = resolve(s, d.id, { kind: 'budget', choice: { levyChange: d.data.year === 2011 ? 0 : levyPct, fareChange: 0, maintenance: 1 } });
    else if (d.kind === 'deficit') { console.log(`  ${d.date}: DEFICIT ${fmt(Number(d.data.amount))} -> borrow`); s = resolve(s, d.id, { kind: 'deficit', choice: 'borrow' }); }
    else { console.log(`  ${d.date}: SHORTFALL ${d.data.shortfall} buses (needs ${d.data.required}, has ${d.data.buses}) -> order`); s = resolve(s, d.id, { kind: 'shortfall', choice: 'order' }); }
    d = openDecision(s);
  }
  s = advanceDay(s);
  if (s.date.endsWith("-12-31") && s.ledger.length) {
    const y = s.ledger.slice(-11);
    const sum = (k: keyof (typeof y)[number]) => y.reduce((a, r) => a + (r[k] as number), 0);
    const f = fleetStatus(s);
    console.log(`${s.date}: reserve ${fmt(s.reserve)} debt ${fmt(s.debt)} levy ${fmt(s.levy)} | fares ${fmt(sum('fares'))} ops ${fmt(sum('operations') + sum('maintenance'))} | ` +
      `boardings ${Math.round(y.reduce((a, r) => a + r.boardings, 0) / y.length)} | fleet ${f.buses} (needs ${f.required}, age ${f.avgAge.toFixed(1)}) garages ${f.garageCapacity} | missed ${(100 * y.at(-1)!.missedTrips).toFixed(1)}% | ` +
      `events: ${s.events.filter((e) => !e.decision).map((e) => e.kind).join(',')}`);
    s = { ...s, events: s.events.filter((e) => e.decision) };
  }
}
