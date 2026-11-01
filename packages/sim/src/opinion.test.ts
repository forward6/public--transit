import { describe, expect, it } from 'vitest';
import type { Edit, GameState, Persona, Zone } from '@otc/shared';
import { newGame, openDecision, resolve } from './economy';
import { diaryEntry, highFloorShare } from './diary';
import type { Journey } from './journey';
import { advanceOpinion, explainZone, opinionSummary, startOpinion, type OpinionWorld } from './opinion';
import { frontPage } from './press';
import { stepDay, withOpinion, type GameWorld } from './game';

const zone = (id: number, city: 'ottawa' | 'gatineau', district: Zone['district'], pop: number): Zone => ({
  id, cell: `c${id}`, lon: -75.7 + id * 0.01, lat: 45.4, areaKm2: 1, city, district, downtown: district === 'downtown', pop,
  seg: {} as Zone['seg'], jobs: { office: 1000 }, enrol: { post: 0, school: 0 },
});
const world: OpinionWorld = {
  zones: [zone(0, 'ottawa', 'downtown', 5000), zone(1, 'ottawa', 'suburbs', 20000), zone(2, 'ottawa', 'rural', 3000), zone(3, 'gatineau', 'hull', 8000)],
  baseLos: { access: [300000, 90000, 8000, 150000], wait: [3, 6, 25, 6] },
  share: [0.35, 0.15, 0.02, 0.15],
};
const service = { boardings: 500_000, vehicleHours: 6900, peakVehicles: 814 };
const budgeted = (fareChange = 0): GameState => {
  const s = newGame(service);
  return resolve(s, openDecision(s)!.id, { kind: 'budget', choice: { levyChange: 0, fareChange, maintenance: 1 } });
};
const run = (s: GameState, n: number, w: GameWorld = world) => {
  for (let i = 0; i < n; i++) {
    for (let d = openDecision(s); d; d = openDecision(s)) {
      if (d.kind === 'budget') s = resolve(s, d.id, { kind: 'budget', choice: { levyChange: 0, fareChange: 0, maintenance: 1 } });
      else if (d.kind === 'deficit') s = resolve(s, d.id, { kind: 'deficit', choice: 'borrow' });
      else s = resolve(s, d.id, { kind: 'shortfall', choice: 'accept' });
    }
    s = stepDay(s, w);
  }
  return s;
};

describe('opinion', () => {
  it('starts near an even split, worse where buses rarely come, and explains itself', () => {
    const s = withOpinion(budgeted(), world);
    const o = s.opinion!;
    const city = opinionSummary(o, world, s.date);
    expect(city.approval).toBeGreaterThan(40);
    expect(city.approval).toBeLessThan(55);
    expect(o.service[2]!).toBeLessThan(o.service[0]! - 15); // rural: 25-minute waits
    // each axis is the sum of its reasons
    for (const axis of ['service', 'value', 'trust'] as const) {
      const sum = explainZone(s, world, 1).filter((r) => r.axis === axis).reduce((a, r) => a + r.value, 0);
      expect(sum).toBeCloseTo((o as unknown as Record<string, number[]>)[axis]![1]!, 0);
    }
  });

  it('rewards better service over weeks, then people get used to it', () => {
    let s = withOpinion(budgeted(), world);
    const before = s.opinion!.service[1]!;
    s = { ...s, los: { access: [300000, 160000, 8000, 150000], wait: [3, 3, 25, 6] } };
    const week = run(s, 7);
    const months = run(s, 75);
    const later = run(months, 300);
    const lift = (x: GameState) => x.opinion!.service[1]! - before;
    expect(lift(week)).toBeGreaterThan(2);
    expect(lift(months)).toBeGreaterThan(lift(week));
    // a year on, expectations have caught up: what remains is the better frequency
    expect(lift(later)).toBeLessThan(lift(months));
    expect(explainZone(later, world, 1).find((r) => r.key === 'reach')!.value).toBeLessThan(3);
  });

  it('punishes cuts faster than it rewards improvements', () => {
    const s = withOpinion(budgeted(), world);
    const o0 = s.opinion!.service[1]!;
    const up = run({ ...s, los: { access: [300000, 120000, 8000, 150000], wait: [3, 6, 25, 6] } }, 10).opinion!.service[1]! - o0;
    const down = run({ ...s, los: { access: [300000, 60000, 8000, 150000], wait: [3, 6, 25, 6] } }, 10).opinion!.service[1]! - o0;
    expect(-down).toBeGreaterThan(up);
  });

  it('notices a fare hike and a removed route, and forgets slowly', () => {
    const s0 = withOpinion(budgeted(), world);
    let s = { ...s0, fareIndex: 1.1, applied: [{ kind: 'remove', routeId: 'oct-86' } as Edit] };
    const o = advanceOpinion(s.opinion!, s, world, s.date);
    expect(o.shocks.map((k) => k.kind).sort()).toEqual(['fareHike', 'promiseKept', 'routeRemoved']);
    s = run({ ...s, opinion: o }, 30);
    const trustAfter = opinionSummary(s.opinion!, world, s.date).trust;
    expect(trustAfter).toBeLessThan(opinionSummary(run(s0, 30).opinion!, world, s.date).trust - 3);
    expect(opinionSummary(s.opinion!, world, s.date).value).toBeLessThan(opinionSummary(s0.opinion!, world, s0.date).value - 2);
    const year = run(s, 365);
    expect(opinionSummary(year.opinion!, world, year.date).trust).toBeGreaterThan(trustAfter);
  });

  it('keeps a weekly record and only counts Ottawa residents', () => {
    const s = run(withOpinion(budgeted(), world), 21);
    expect(s.opinion!.history.length).toBeGreaterThanOrEqual(3);
    const gat = opinionSummary(s.opinion!, world, s.date, (z) => z.city === 'gatineau');
    const ott = opinionSummary(s.opinion!, world, s.date);
    expect(gat.approval).not.toEqual(ott.approval);
    expect(startOpinion(budgeted(), world).service).toHaveLength(4);
  });
});

const journey = (minutes: number, wait: number): Journey => ({
  depart: 18 * 3600, arrive: 18 * 3600 + minutes * 60, waitMin: wait, walkMin: 5, rideMin: minutes - wait - 5, routes: ['oct-95'],
  firstStop: 'st-x', legs: [{ kind: 'wait', from: 18 * 3600 + 300, to: 18 * 3600 + 300 + wait * 60, path: [[-75.7, 45.4]] }],
});
const persona: Persona = {
  id: 'test', name: 'Test', age: 30, role: { en: '', fr: '' }, color: '#000', home: { lon: -75.7, lat: 45.4, name: 'A' },
  dest: { lon: -75.6, lat: 45.4, name: 'B' }, out: 18 * 3600, back: 7 * 3600, days: [0, 1, 2, 3, 4, 5, 6],
};

describe('diaries', () => {
  it('writes down the cold, the long trips and the good days', () => {
    const s = budgeted();
    // 19 Dec 2010: −28 °C in this campaign's weather
    const cold = diaryEntry(persona, '2010-12-19', { out: journey(40, 12), back: journey(40, 12) }, s, (id) => id, (id) => id)!;
    expect(cold.kind).toBe('cold');
    expect(cold.mood).toBeLessThan(0);
    expect(cold.out!.temp).toBeLessThan(-15);
    const none = diaryEntry(persona, '2011-05-11', { out: null, back: null }, s, (id) => id, (id) => id)!;
    expect(none.kind).toBe('noBus');
    const nice = diaryEntry(persona, '2011-06-15', { out: journey(30, 2), back: journey(30, 2) }, s, (id) => id, (id) => id)!;
    expect(['great', 'fine']).toContain(nice.kind);
    expect(diaryEntry({ ...persona, days: [1] }, '2011-06-15', { out: journey(30, 2), back: null }, s, (id) => id, (id) => id)).toBeNull();
    expect(highFloorShare(s)).toBeGreaterThan(0.04);
  });
});

describe('press', () => {
  it('leads with a new route, and plays it all day by day', () => {
    let s = withOpinion(budgeted(), world);
    s = { ...s, opinion: { ...s.opinion!, shocks: [{ date: '2010-12-19', kind: 'newRoute', amount: 3, label: 'N1' }] } };
    const fp = frontPage(s, world, '2010-12');
    expect(fp.stories[0]!.kind).toBe('routeLaunched');
    expect(fp.stories[0]!.params.route).toBe('N1');
    const w: GameWorld = { ...world, trips: { test: { out: journey(40, 6), back: journey(42, 4) } }, personas: [persona] };
    const later = run(s, 45, w);
    expect(later.press!.map((f) => f.month)).toEqual(['2010-12']);
    expect(later.diaries!.test!.length).toBeGreaterThan(20);
    expect(later.posts!.length).toBeGreaterThan(5);
    expect(JSON.stringify(later).length).toBeLessThan(200_000);
  });
});
