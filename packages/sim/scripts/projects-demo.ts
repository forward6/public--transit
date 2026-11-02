// A rapid-transit line from proposal to opening day, in fast-forward (needs the built data): a
// Confederation-like light-rail line, Tunney's Pasture to Blair with a downtown tunnel.
//   pnpm --filter @otc/sim projects-demo [public|p3] [pay|trim|pause]
//   MEASURE=1 also runs the demand model on the line (two evaluations, a minute or two)
import { readFileSync, writeFileSync } from 'node:fs';
import { type DemandFile, type DemandParams, type Network, type ProjectForecast, type ZonesFile } from '@otc/shared';
import {
  answerFunding, answerOverrun, answerSto, applyEdits, assignWards, callVote, openingDay, chooseProcurement, estimateLine, evaluate, lineEdit, lobby,
  negotiate, newDesign, newGame, openDecision, openItem, opinionSummary, prepare, proposeBudget, proposeDeficit, proposeProject, serviceStats,
  stationAt, stepDay, tally, wardsAt, whipCount, withOpinion, type GameState, type GameWorld,
} from '../src/index';
import { resolve } from '../src/economy';

const data = new URL('../../../apps/web/public/data/', import.meta.url);
const read = <T,>(f: string) => JSON.parse(readFileSync(new URL(f, data), 'utf8')) as T;
const net = read<Network>('network-2010.json');
const zones = read<ZonesFile>('zones-2011.json').zones;
const demand = read<DemandFile>('demand-2011.json');
const oc: Network = { ...net, routes: net.routes.filter((r) => r.agency === 'octranspo') };
const svc = serviceStats(oc);
const world: GameWorld = { zones, baseLos: demand.los!, share: zones.map((z) => demand.zones[String(z.id)]?.[1] ?? 0), wardOf: assignWards(zones) };
const cw = { ...world, wardOf: world.wardOf! };
const how = (process.argv[2] ?? 'public') as 'public' | 'p3';
const overrunChoice = (process.argv[3] ?? 'pay') as 'pay' | 'trim' | 'pause';
const M = (x: number) => `$${(x / 1e6).toFixed(0)}M`;

// the line: Tunney's Pasture → Blair, tunnelled from LeBreton to Campus
const pts: [number, number, string][] = [
  [-75.735181, 45.403725, 'surface'], [-75.721943, 45.409442, 'surface'], [-75.713435, 45.413737, 'tunnel'], [-75.7045, 45.4195, 'tunnel'],
  [-75.6964, 45.4216, 'tunnel'], [-75.6897, 45.424, 'tunnel'], [-75.682238, 45.420249, 'surface'], [-75.670482, 45.416345, 'surface'],
  [-75.664827, 45.411876, 'surface'], [-75.652216, 45.41743, 'surface'], [-75.637918, 45.420638, 'surface'], [-75.626579, 45.422545, 'surface'],
  [-75.60828, 45.431056, 'surface'],
];
const design = newDesign('lrt', 1);
design.name = 'Confederation Line';
design.stations = pts.map(([lon, lat], i) => stationAt(lon, lat, net.stops, `line-1-s${i}`));
design.structure = pts.slice(0, -1).map((p) => p[2] as 'surface' | 'tunnel');
const est = estimateLine(design);
console.log(`${design.name}: ${est.lengthKm} km (${est.tunnelKm} km tunnel), ${est.stations} stations (${est.undergroundStations} underground), ${est.vehicles} trains, ${est.runMin} min end to end`);
console.log(`  cost ${M(est.cost.total)} = guideway ${M(est.cost.guideway)} + stations ${M(est.cost.stations)} + trains ${M(est.cost.vehicles)} + depot ${M(est.cost.depot)} + soft ${M(est.cost.soft)} + contingency ${M(est.cost.contingency)}`);
console.log(`  months: design ${est.months.design}, procurement ${est.months.procurement}, construction ${est.months.construction}, testing ${est.months.testing}; O&M ${M(est.opsPerYear)}/yr`);
console.log(`  stations: ${design.stations.map((x) => `${x.name}${x.existing ? '*' : ''}`).join(', ')}`);

let forecast: ProjectForecast = { boardings: 0, newRiders: 15000, reach: 0, wards: wardsAt(design.stations.map((x) => [x.lon, x.lat]), zones, world.wardOf!) };
if (process.env.MEASURE) {
  const car = new Uint8Array(readFileSync(new URL('car-2011.bin', data)));
  const params = demand.params as unknown as DemandParams;
  const prep = prepare({ zones, car, skims: null as never });
  const t0 = Date.now();
  const base = evaluate(net, { zones, car, params, samples: 2 }, prep).score;
  const plan = evaluate(applyEdits(net, [lineEdit(design, 'line-1')]), { zones, car, params, samples: 2 }, prep).score;
  forecast = { ...forecast, boardings: Math.round(plan.byRoute['line-1'] ?? 0), newRiders: Math.round(plan.transitTrips - base.transitTrips),
    reach: Math.round((plan.jobsIn45 / base.jobsIn45 - 1) * 1000) / 10 };
  console.log(`  forecast (${((Date.now() - t0) / 1000).toFixed(0)} s): ${forecast.boardings} boardings a weekday on the line, +${forecast.newRiders} transit trips, jobs in 45 min ${forecast.reach}%; bus-hours ${Math.round(base.vehicleHours)} → ${Math.round(plan.vehicleHours)}`);
}
console.log(`  wards with a station: ${forecast.wards.join(', ')}`);

let s: GameState = withOpinion(newGame({ boardings: demand.summary.boardingsByAgency.octranspo!, vehicleHours: svc.vehicleHours, peakVehicles: svc.peakVehicles }), world);
if (process.env.SEED) s = { ...s, seed: Number(process.env.SEED) };
const log = (m: string) => console.log(`${s.date}  ${m}`);
// DUMP_DIR=dir saves the game at the moments worth a look: procurement, an overrun, mid-construction, opening day, a month in
const dumped = new Set<string>();
const dump = (name: string) => {
  if (!process.env.DUMP_DIR || dumped.has(name)) return;
  dumped.add(name);
  writeFileSync(`${process.env.DUMP_DIR}/${name}.json`, JSON.stringify(s));
};
let proposed = false;
const seen = new Set<string>();
for (let day = 0; day < 365 * 12 && s.date < '2023-01-01'; day++) {
  if (!proposed && s.date >= '2011-01-15' && !openDecision(s)) {
    s = proposeProject(s, design, forecast, net);
    const rw = s.projects![0]!.rework;
    if (rw) log(`  staff: ${rw.routes.map((r) => `${r.name} ${r.action} (${r.overlap}%)`).join(', ')}`);
    proposed = true;
    log(`PROPOSED ${design.name}: ${M(s.projects![0]!.estimate.cost.total)}`);
  }
  for (let d = openDecision(s), guard = 0; d && guard < 20; d = openDecision(s), guard++) {
    if (d.kind === 'budget') {
      // a careful Chair: the levy that balances next year (at least inflation, at most +12%)
      const need = Number(d.data.last) > 0 ? (Number(d.data.balancing) / Number(d.data.last) - 1) * 100 : 2.5;
      const committed = Number(d.data.committed ?? 0);
      const levyChange = Math.round(Math.min(12, Math.max(2.5 + committed, need)) * 10) / 10;
      log(`BUDGET ${d.data.year}: levy +${levyChange}% (lines committed +${committed}%)`);
      s = proposeBudget(s, d.id, { levyChange, fareChange: 0, maintenance: 1 });
    }
    else if (d.kind === 'deficit') s = proposeDeficit(s, d.id, 'borrow');
    else if (d.kind === 'shortfall') s = resolve(s, d.id, { kind: 'shortfall', choice: 'order' });
    else if (d.kind === 'vote') {
      const item = openItem(s)!;
      const t0 = tally(s, cw, item);
      for (const l of whipCount(s, cw, item).filter((x) => x.position !== 'yes').sort((a, b) => b.score - a.score)) {
        if (tally(s, cw, s.council!.items.find((i) => i.id === item.id)!).yes >= t0.needed) break;
        s = lobby(s, cw, item.id, l.id);
      }
      s = callVote(s, cw, item.id, net);
      const done = s.council!.items.find((i) => i.id === item.id)!;
      if (item.kind === 'project' || item.kind === 'contract' || done.status === 'failed')
        log(`VOTE ${item.kind}: ${done.status} ${done.result?.yes}-${done.result?.no} (whip had ${t0.yes}; lobbied ${done.lobbied.length}; PC ${s.council!.capital})`);
    } else if (d.kind === 'procurement') {
      dump('procurement');
      log(`PROCUREMENT for ${d.data.name}: ${how} (budget now ${M(Number(d.data.cost))})`);
      s = chooseProcurement(s, String(d.data.project), how);
    } else if (d.kind === 'overrun') {
      dump('overrun');
      log(`OVERRUN ${d.data.name}: ${M(Number(d.data.amount))} (${d.data.share}%) → ${overrunChoice}`);
      s = answerOverrun(s, String(d.data.project), overrunChoice);
    } else if (d.kind === 'lineOpen') {
      dump('opening');
      log(`OPENING DAY ${d.data.name}: ${d.data.km} km, ${d.data.stations} stations, ${M(Number(d.data.cost))}, ${d.data.years} years after the proposal${d.data.rough ? ' (a rough start)' : ''}`);
      s = openingDay(s, d.id, true);
    } else if (d.kind === 'labour') s = negotiate(s, cw, { wage: 2.8, scheduling: 'keep', years: 3 });
    else if (d.kind === 'sto') s = answerSto(s, true);
    else if (d.kind === 'funding') s = answerFunding(s, true);
    else s = { ...s, events: s.events.map((e) => (e.id === d.id ? { ...e, decision: false } : e)) };
  }
  for (const e of s.events) {
    if (e.kind !== 'project' || seen.has(e.id)) continue;
    seen.add(e.id);
    const { what, name: _n, project: _p, ...rest } = e.data;
    log(`  ${what} ${JSON.stringify(rest)}`);
  }
  s = stepDay(s, world);
  const p0 = s.projects?.[0];
  if (p0?.phase === 'construction' && p0.dates.construction && s.date >= addYear(addYear(p0.dates.construction))) dump('construction');
  if (p0?.opened && s.date >= addYear(p0.opened).replace(/^(\d{4})-(\d\d)/, (_m, y: string, mm: string) => `${Number(y) - 1}-${mm}`).slice(0, 7) + '-28' && s.date > p0.opened) {
    if (s.date >= monthAfter(p0.opened)) dump('open');
  }
  if (s.date.endsWith('-12-31')) {
    const p = s.projects?.[0];
    const o = s.opinion ? opinionSummary(s.opinion, world, s.date).approval : 0;
    log(`YEAR END: approval ${o.toFixed(1)}% · levy ${M(s.levy)} · reserve ${M(s.reserve)} · debt ${M(s.debt)} + lines ${M(s.lineDebt ?? 0)} · ${p ? `${p.phase}, spent ${M(p.spent)} (city ${M(p.citySpent)}), budget ${M(p.budget)}` : ''}`);
  }
  if (s.projects?.[0]?.phase === 'open' && s.date > addYear(s.projects[0].opened!)) break;
}
function monthAfter(d: string) {
  const [y, m] = d.split('-').map(Number);
  return m === 12 ? `${y! + 1}-01${d.slice(7)}` : `${y}-${String(m! + 1).padStart(2, '0')}${d.slice(7)}`;
}
function addYear(d: string) {
  return `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
}
const p = s.projects?.[0];
if (p) console.log(`\nfinal: ${p.phase}${p.opened ? ` on ${p.opened}` : ''}; spent ${M(p.spent)} (city ${M(p.citySpent)}, Ontario ${M(p.funding.province)}, federal ${M(p.funding.federal)}); overruns ${M(p.overrun)}; delays ${p.delayMonths} months`);
if (process.env.DUMP) writeFileSync(process.env.DUMP, JSON.stringify(s));
