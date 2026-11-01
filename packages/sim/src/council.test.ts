import { describe, expect, it } from 'vitest';
import type { GameState, Zone } from '@otc/shared';
import { addDays, newGame, nextServiceChange, openDecision } from './economy';
import {
  answerFunding, answerSto, callVote, isAlly, lobby, negotiate, openItem, proposeBudget, startCouncil, strikeChoice, tally, whipCount, delayFor,
  type CouncilWorld,
} from './council';
import { assignWards } from './wards';
import { stepDay, withOpinion, type GameWorld } from './game';

const zone = (id: number, city: 'ottawa' | 'gatineau', district: Zone['district'], pop: number, lon: number, lat: number): Zone => ({
  id, cell: `c${id}`, lon, lat, areaKm2: 1, city, district, downtown: false, pop, seg: {} as Zone['seg'], jobs: { office: 1000 }, enrol: { post: 0, school: 0 },
});
const zones = [zone(0, 'ottawa', 'downtown', 30000, -75.704, 45.413), zone(1, 'ottawa', 'suburbs', 30000, -75.745, 45.272),
  zone(2, 'ottawa', 'rural', 30000, -75.82, 45.17), zone(3, 'gatineau', 'hull', 30000, -75.73, 45.43)];
const world: GameWorld & CouncilWorld = {
  zones, baseLos: { access: [300000, 90000, 8000, 150000], wait: [3, 6, 25, 6] }, share: [0.3, 0.15, 0.02, 0.15], wardOf: [14, 3, 21, 0],
};
const service = { boardings: 500_000, vehicleHours: 6900, peakVehicles: 814 };
const fresh = () => withOpinion(newGame(service), world);
const budget = (s: GameState, levyChange: number) => proposeBudget(s, openDecision(s)!.id, { levyChange, fareChange: 0, maintenance: 1 });
/** Run days answering whatever comes up the simple way. */
const run = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) {
    for (let d = openDecision(s), g = 0; d && g < 10; d = openDecision(s), g++) {
      if (d.kind === 'budget') s = budget(s, 2.5);
      else if (d.kind === 'vote') s = callVote(s, world, openItem(s)!.id);
      else if (d.kind === 'labour') s = negotiate(s, world, { wage: 2.8, scheduling: 'keep', years: 3 });
      else if (d.kind === 'sto') s = answerSto(s, true);
      else if (d.kind === 'funding') s = answerFunding(s, true);
      else if (d.kind === 'strike') s = strikeChoice(s, 'arbitration');
      else s = { ...s, events: s.events.map((e) => (e.id === d.id ? { ...e, decision: false } : e)) };
    }
    s = stepDay(s, world);
  }
  return s;
};

describe('council', () => {
  it('starts split, and passes an inflation budget but not a big tax hike', () => {
    const s = fresh();
    expect(s.council!.councillors).toHaveLength(24);
    const allies = s.council!.councillors.filter(isAlly).length;
    expect(allies).toBeGreaterThanOrEqual(6);
    expect(allies).toBeLessThanOrEqual(10);
    const modest = budget(s, 2.5);
    const t = tally(modest, world, openItem(modest)!);
    expect(t.yes).toBeGreaterThanOrEqual(t.needed);
    const steep = budget(s, 7);
    const t2 = tally(steep, world, openItem(steep)!);
    expect(t2.yes).toBeLessThan(t2.needed);
    // fiscal hawks give their reason: taxes
    const hawk = whipCount(steep, world, openItem(steep)!).find((l) => l.id === 'w20')!;
    expect(hawk.position).toBe('no');
    expect(hawk.reason).toBe('taxes');
  });

  it('lobbying moves votes and costs Political Capital; a failed budget is rewritten by council', () => {
    let s = budget(fresh(), 5);
    const item = openItem(s)!;
    const target = whipCount(s, world, item).filter((l) => l.position !== 'yes').sort((a, b) => b.score - a.score)[0]!;
    const before = s.council!.capital;
    const lobbied = lobby(s, world, item.id, target.id);
    expect(lobbied.council!.capital).toBeLessThan(before);
    expect(whipCount(lobbied, world, openItem(lobbied)!).find((l) => l.id === target.id)!.score).toBeGreaterThan(target.score + 0.5);
    // without enough votes, council adopts its own budget (a smaller levy increase)
    s = budget(fresh(), 9);
    s = callVote(s, world, openItem(s)!.id);
    expect(s.council!.items[0]!.status).toBe('failed');
    expect(s.events.some((e) => e.kind === 'councilBudget')).toBe(true);
    expect(openDecision(s)).toBeUndefined();
  });

  it('consultations put a vote off a month', () => {
    let s = budget(fresh(), 3);
    const id = openItem(s)!.id;
    s = delayFor(s, id, 'consult');
    expect(openDecision(s)).toBeUndefined();
    expect(s.council!.items[0]!.status).toBe('waiting');
    s = run(s, 29);
    expect(s.council!.items[0]!.status).toBe('waiting');
    s = run(s, 2);
    expect(s.council!.items[0]!.status).toBe('passed');
  });

  it('opens contract talks in February 2011; a fair offer is ratified, a stingy one risks a strike', () => {
    let s = run(fresh(), 62); // to 1 February 2011
    expect(s.date).toBe('2011-02-01');
    expect(openDecision(s)?.kind).toBe('labour');
    const deal = negotiate(s, world, { wage: 2.8, scheduling: 'keep', years: 3 });
    expect(openItem(deal)?.kind).toBe('labourDeal');
    // a hard line: three rounds of nothing, and a scheduling fight
    let hard = s;
    for (let r = 0; r < 3; r++) {
      hard = negotiate(hard, world, { wage: 1, scheduling: 'reform', years: 4 });
      if (r < 2) hard = run(hard, 14);
    }
    const strike = hard.council!.labour.strikeFrom;
    if (strike) {
      hard = run(hard, Math.round((new Date(`${strike}T12:00:00Z`).getTime() - new Date(`${hard.date}T12:00:00Z`).getTime()) / 86_400_000) + 1);
      expect(hard.strike).toBe(true);
      expect(hard.daily!.at(-1)!.boardings).toBe(0);
      hard = run(hard, 30);
      expect(hard.strike).toBe(false);
    } else {
      expect(hard.events.some((e) => e.kind === 'labourDeal' && e.data.protest)).toBe(true);
    }
  });

  it('a removed route can come back by council motion, and is restored at the next service change', () => {
    let s = fresh();
    s = budget(s, 2.5);
    s = callVote(s, world, openItem(s)!.id);
    s = { ...s, council: { ...s.council!, removals: [{ routeId: 'oct-86', routeName: '86', date: '2010-12-01', wards: [21] }] },
      applied: [{ kind: 'remove', routeId: 'oct-86' }] };
    // the rural ward is unhappy (its residents wait 25 minutes): a motion follows within weeks
    let motion = s;
    for (let i = 0; i < 40 && !motion.council!.items.some((x) => x.kind === 'restoreRoute'); i++) motion = stepDay(motion, world);
    const item = motion.council!.items.find((x) => x.kind === 'restoreRoute');
    expect(item?.byChair).toBe(false);
    // force it through and watch the route come back
    let passed: GameState = { ...motion, council: { ...motion.council!, directions: [{ date: motion.date, routeId: 'oct-86', routeName: '86' }] } };
    passed = { ...passed, events: passed.events.map((e) => ({ ...e, decision: false })) };
    const change = nextServiceChange(passed.date);
    while (passed.date < change) passed = run(passed, 1);
    expect(passed.applied.some((e) => e.kind === 'remove' && e.routeId === 'oct-86')).toBe(false);
    expect(passed.council!.directions[0]!.done).toBe(change);
  });

  it('holds the 2014 election: ward results, a new council, election night', () => {
    let s = fresh();
    s = { ...s, date: '2014-10-20', council: { ...s.council!, seen: { ...s.council!.seen, events: s.events.map((e) => e.id) } },
      events: s.events.map((e) => ({ ...e, decision: false })) };
    s = run(s, 8);
    const rec = s.council!.elections.find((e) => e.city === 'ottawa');
    expect(rec).toBeTruthy();
    expect(rec!.wards).toHaveLength(23);
    expect(rec!.mayor).toBeTruthy();
    expect(s.council!.councillors).toHaveLength(24);
    expect(s.events.some((e) => e.kind === 'election')).toBe(true);
    expect(startCouncil().capital).toBe(35);
    expect(addDays(rec!.date, 0)).toBe('2014-10-27');
  });

  it('balances ward populations over the zones', () => {
    const many: Zone[] = [];
    // a dense core thinning out to the countryside, like the city
    for (let i = 0; i < 900; i++) {
      const lon = -76.15 + (i % 36) * 0.022;
      const lat = 45.15 + Math.floor(i / 36) * 0.0145;
      const km = Math.hypot((lon + 75.7) * 78, (lat - 45.41) * 111);
      many.push(zone(i, 'ottawa', 'suburbs', Math.round(6000 * Math.exp(-km / 7) + 80), lon, lat));
    }
    const w = assignWards(many);
    const pop = new Map<number, number>();
    many.forEach((z, i) => pop.set(w[i]!, (pop.get(w[i]!) ?? 0) + z.pop));
    const vals = [...pop.values()];
    expect(pop.size).toBe(23);
    expect(Math.max(...vals) / Math.min(...vals)).toBeLessThan(2.2); // coarse zones: the real wards come out within ±15%
  });
});
