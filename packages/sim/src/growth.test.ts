import { describe, expect, it } from 'vitest';
import type { GameState, Project, Zone } from '@otc/shared';
import { addMonths, newGame } from './economy';
import { advanceGrowth, answerDeveloper, growthSummary, rezoningVoted, startGrowth, type GrowthWorld } from './growth';
import { callVote, openItem, type CouncilWorld } from './council';
import { withOpinion } from './game';

const zone = (id: number, district: Zone['district'], pop: number, jobs: number, lon: number, lat: number, areaKm2 = 1): Zone => ({
  id, cell: `c${id}`, lon, lat, areaKm2, city: 'ottawa', district, downtown: district === 'downtown', pop, seg: {} as Zone['seg'],
  jobs: { office: jobs * 0.6, retail: jobs * 0.4 }, enrol: { post: 0, school: 0 },
});
// downtown, an inner neighbourhood, two suburban edges (partly built), a village
const zones = [
  zone(0, 'downtown', 8000, 90000, -75.70, 45.42), zone(1, 'inner', 9000, 6000, -75.68, 45.41),
  zone(2, 'suburbs', 4000, 800, -75.75, 45.28, 5), zone(3, 'suburbs', 4000, 800, -75.50, 45.47, 5), zone(4, 'rural', 800, 100, -75.95, 45.25, 5),
];
const world: GrowthWorld & CouncilWorld = {
  zones, baseLos: { access: [300000, 200000, 40000, 40000, 2000], wait: [3, 5, 10, 10, 30] }, share: [0.35, 0.25, 0.08, 0.08, 0.02],
  wardOf: [14, 17, 3, 19, 5], places: [{ lon: -75.681, lat: 45.411, name: 'Hurdman' }],
};
const game = (): GameState => newGame({ boardings: 500_000, vehicleHours: 6900, peakVehicles: 814 });
/** `months` of growth. */
function grow(s0: GameState, months: number, w: GrowthWorld = world): GameState {
  let s = s0;
  for (let m = 0; m < months; m++) {
    const ended = s.date.slice(0, 7);
    s = { ...s, date: `${addMonths(s.date, 1).slice(0, 8)}01` };
    advanceGrowth(s, w, ended);
  }
  return s;
}

describe('growth', () => {
  it('adds about 1.3% residents a year, mostly where there is room, and records where they went', () => {
    const s = grow(game(), 12);
    const g = s.growth!;
    const sum = growthSummary(g);
    const pop0 = zones.reduce((a, z) => a + z.pop, 0);
    expect(sum.pop / pop0).toBeGreaterThan(0.009);
    expect(sum.pop / pop0).toBeLessThan(0.018);
    expect(sum.jobs).toBeGreaterThan(0);
    expect(Object.values(sum.where).reduce((a, x) => a + x, 0)).toBe(sum.pop);
    expect(g.history).toHaveLength(12);
    // the suburban edges have the room; the village barely grows
    expect(g.pop[2]! + g.pop[3]!).toBeGreaterThan(g.pop[0]! + g.pop[1]!);
    expect(g.pop[4]!).toBeLessThan(g.pop[2]!);
    expect(g.riders).toBeGreaterThan(1);
  });

  it('pulls growth towards the edge that transit serves better', () => {
    const s = grow({ ...game(), los: { access: [300000, 200000, 160000, 40000, 2000], wait: [3, 5, 4, 10, 30] } }, 24);
    expect(s.growth!.pop[2]!).toBeGreaterThan(s.growth!.pop[3]! * 1.3);
  });

  it('holds back homes and drives off some businesses beside a construction site', () => {
    const site = {
      id: 'line-1', phase: 'construction', estimate: { lengthKm: 3, tunnelKm: 0 },
      design: { mode: 'lrt', stations: [{ id: 'a', name: 'A', lon: -75.755, lat: 45.28 }, { id: 'b', name: 'B', lon: -75.745, lat: 45.28 }], structure: ['surface'] },
    } as unknown as Project;
    const quiet = grow(game(), 12);
    const torn = grow({ ...game(), projects: [site] }, 12);
    expect(torn.growth!.pop[2]!).toBeLessThan(quiet.growth!.pop[2]! * 0.8);
    expect(growthSummary(torn.growth).lost).toBeGreaterThan(0);
  });

  it('brings a developer offer near a station, and council decides the rezoning', () => {
    let s = withOpinion(game(), world);
    s = { ...s, growth: { ...startGrowth(zones.length, s.date), nextOffer: s.date } };
    s = grow(s, 1);
    const offer = s.events.find((e) => e.kind === 'developer' && e.decision);
    expect(offer).toBeDefined();
    expect(Number(offer!.data.homes)).toBeGreaterThanOrEqual(600);
    // backing it puts the rezoning to council
    s = answerDeveloper(s, offer!.id, true);
    const item = openItem(s);
    expect(item?.kind).toBe('rezoning');
    expect(s.growth!.rezonings[0]!.status).toBe('council');
    const before = s.capitalReserve;
    s = callVote(s, world, item!.id);
    const rz = s.growth!.rezonings[0]!;
    if (rz.status === 'approved') {
      expect(Object.keys(s.growth!.room).length).toBeGreaterThan(0);
      expect(s.capitalReserve).toBeGreaterThan(before);
    } else expect(rz.status).toBe('refused');
    expect(s.events.some((e) => e.kind === 'rezoned')).toBe(true);
  });

  it('builds on rezoned land', () => {
    let s: GameState = { ...game(), growth: startGrowth(zones.length, '2010-12-01') };
    s.growth!.rezonings.push({ id: 'rz-1', date: s.date, station: 'Hurdman', lon: -75.681, lat: 45.411, zones: [1], homes: 3000, jobs: 500, ward: 17, status: 'council' });
    const plain = grow({ ...game() }, 24);
    rezoningVoted(s, 'rz-1', true);
    expect(s.growth!.room[1]![0]).toBeGreaterThan(6000);
    s = grow(s, 24);
    // (a small town: some 35 new residents a month in all)
    expect(s.growth!.pop[1]!).toBeGreaterThan(plain.growth!.pop[1]! * 2.5);
    // turning one down leaves the land as it was
    const t = { ...game(), growth: startGrowth(zones.length, '2010-12-01') };
    t.growth!.rezonings.push({ id: 'rz-2', date: t.date, station: 'Hurdman', lon: -75.681, lat: 45.411, zones: [1], homes: 3000, jobs: 500, ward: 17, status: 'council' });
    rezoningVoted(t, 'rz-2', false);
    expect(t.growth!.room[1]).toBeUndefined();
    expect(t.growth!.rezonings[0]!.status).toBe('refused');
  });
});
