// A full council term in fast-forward (needs the built data): budgets go to council, the 2011
// contract talks, STO's offers, funding, and the October 2014 election.
//   pnpm --filter @otc/sim council-demo [levy-% each year] [wage-% offered]
import { readFileSync } from 'node:fs';
import { PERSONAS, type DemandFile, type Network, type ZonesFile } from '@otc/shared';
import {
  JourneyPlanner, acknowledge, answerFunding, answerSto, assignWards, callVote, isAlly, lobby, negotiate, newGame, openDecision, openItem,
  opinionSummary, proposeBudget, proposeDeficit, serviceStats, stepDay, strikeChoice, tally, whipCount, withOpinion, type GameState, type GameWorld,
} from '../src/index';

const data = new URL('../../../apps/web/public/data/', import.meta.url);
const read = <T,>(f: string) => JSON.parse(readFileSync(new URL(f, data), 'utf8')) as T;
const net = read<Network>('network-2010.json');
const zones = read<ZonesFile>('zones-2011.json').zones;
const demand = read<DemandFile>('demand-2011.json');
const oc: Network = { ...net, routes: net.routes.filter((r) => r.agency === 'octranspo') };
const svc = serviceStats(oc);
const jp = new JourneyPlanner(net);
const world: GameWorld = {
  zones, baseLos: demand.los!, share: zones.map((z) => demand.zones[String(z.id)]?.[1] ?? 0), wardOf: assignWards(zones),
  trips: Object.fromEntries(PERSONAS.map((p) => [p.id, { out: jp.plan([p.home.lon, p.home.lat], [p.dest.lon, p.dest.lat], p.out),
    back: jp.plan([p.dest.lon, p.dest.lat], [p.home.lon, p.home.lat], p.back) }])),
};
const cw = { ...world, wardOf: world.wardOf! };
const levy = Number(process.argv[2] ?? 2.5);
const wage = Number(process.argv[3] ?? 2.5);
let s: GameState = withOpinion(newGame({ boardings: demand.summary.boardingsByAgency.octranspo!, vehicleHours: svc.vehicleHours, peakVehicles: svc.peakVehicles }), world);
const log = (m: string) => console.log(`${s.date}  ${m}`);
const name = (id: string) => s.council!.councillors.find((c) => c.id === id)?.name ?? id;
log(`council: ${s.council!.councillors.filter(isAlly).length} of 24 lean your way; Political Capital ${s.council!.capital}`);
for (let day = 0; day < 365 * 4 + 40 && s.date < '2015-01-10'; day++) {
  for (let d = openDecision(s), guard = 0; d && guard < 20; d = openDecision(s), guard++) {
    if (d.kind === 'budget') {
      s = proposeBudget(s, d.id, { levyChange: levy, fareChange: 0, maintenance: 1 });
    } else if (d.kind === 'deficit') {
      s = proposeDeficit(s, d.id, 'borrow');
    } else if (d.kind === 'shortfall') {
      const { resolve } = await import('../src/economy');
      s = resolve(s, d.id, { kind: 'shortfall', choice: 'order' });
    } else if (d.kind === 'vote') {
      const item = openItem(s)!;
      const t0 = tally(s, cw, item);
      // lobby the undecided closest to yes until it passes or capital runs out
      for (const l of whipCount(s, cw, item).filter((x) => x.position !== 'yes').sort((a, b) => b.score - a.score)) {
        if (tally(s, cw, s.council!.items.find((i) => i.id === item.id)!).yes >= t0.needed) break;
        s = lobby(s, cw, item.id, l.id);
      }
      const before = tally(s, cw, s.council!.items.find((i) => i.id === item.id)!);
      s = callVote(s, cw, item.id, net);
      const done = s.council!.items.find((i) => i.id === item.id)!;
      log(`VOTE ${item.kind}${item.byChair ? '' : ' (motion)'}: ${done.status} ${done.result?.yes}-${done.result?.no} (whip had ${t0.yes} yes; lobbied ${done.lobbied.length}; PC ${s.council!.capital})`);
      void before;
    } else if (d.kind === 'labour') {
      log(`LABOUR round ${d.data.round}: union asks ${d.data.demand}%, we offer ${wage}%`);
      s = negotiate(s, cw, { wage, scheduling: 'keep', years: 3 });
    } else if (d.kind === 'strike') {
      log(`STRIKE day ${d.data.days}: going to arbitration`);
      s = strikeChoice(s, 'arbitration');
    } else if (d.kind === 'sto') {
      log(`STO proposes ${d.data.proposal}: accept`);
      s = answerSto(s, true);
    } else if (d.kind === 'funding') {
      log(`FUNDING offer ${d.data.offer}: accept`);
      s = answerFunding(s, true);
    } else if (d.kind === 'election') {
      const rec = s.council!.elections.at(-1)!;
      log(`ELECTION: approval ${rec.approval}%, allies ${rec.allies[0]} -> ${rec.allies[1]}; mayor ${rec.mayor?.held ? 'held' : 'defeated'} (${rec.mayor?.winner}); seats changed: ${rec.wards.filter((w) => !w.held).map((w) => `${w.ward}:${w.platform}`).join(' ')}`);
      s = acknowledge(s, d.id);
    } else {
      s = acknowledge(s, d.id);
    }
  }
  const prevEvents = new Set(s.events.map((e) => e.id));
  s = stepDay(s, world);
  for (const e of s.events.filter((x) => !prevEvents.has(x.id) && !x.decision)) {
    if (['voteResult', 'delivery', 'serviceChange', 'welcome'].includes(e.kind)) continue;
    log(`  news ${e.kind} ${JSON.stringify(e.data)}`);
  }
  if (s.date.endsWith('-12-31')) {
    const o = opinionSummary(s.opinion!, world, s.date);
    log(`YEAR END: approval ${o.approval}% · PC ${s.council!.capital} · reserve $${(s.reserve / 1e6).toFixed(1)}M · strike ${!!s.strike} · wage ${s.council!.labour.wage}% · STO ${s.council!.sto.agenda}/${s.council!.sto.relationship}`);
  }
}
const c = s.council!;
console.log(`\nnew council: ${c.councillors.filter(isAlly).length} allies; commission ${c.commission.map(name).join(', ')}`);
console.log(`state size ${(JSON.stringify(s).length / 1024).toFixed(0)} kB`);
