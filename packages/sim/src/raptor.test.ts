import { describe, expect, it } from 'vitest';
import type { Network, NetPattern, NetRoute, NetStop } from '@otc/shared';
import { Raptor, buildRaptor } from './raptor';

const stop = (id: string, lon: number): NetStop => ({ id, name: id, lon, lat: 45.4, kind: 'stop', agencies: ['octranspo'] });
const pattern = (id: string, routeId: string, stops: string[], hopSec: number): NetPattern => ({
  id, routeId, direction: 0, headsign: stops.at(-1)!, stops, stopDist: stops.map((_, i) => i * 1000),
  shape: [[0, 0], [1, 1]], runTimes: stops.slice(1).map(() => hopSec), dwell: stops.map(() => 0),
});
const route = (id: string, pid: string, deps: number[]): NetRoute => ({
  id, agency: 'octranspo', shortName: id, longName: id, mode: 'bus', class: 'local', color: '#000', patterns: [pid],
  departures: { [pid]: deps }, provenance: { source: 't', confidence: 'high', verified: true },
});
const H = (h: number, m = 0) => h * 3600 + m * 60;

// A -> B -> C on route 1; C -> D on route 2; E is 100 m from C (walkable transfer)
const net: Network = {
  version: 1, snapshot: '2010-12-01', generated: '', status: 'gtfs', statusNote: '', corridors: [],
  stops: [stop('A', -75.8), stop('B', -75.79), stop('C', -75.78), stop('D', -75.77), stop('E', -75.7787)],
  patterns: [pattern('p1', 'r1', ['A', 'B', 'C'], 300), pattern('p2', 'r2', ['C', 'D'], 300), pattern('p3', 'r3', ['E', 'D'], 60)],
  routes: [route('r1', 'p1', [H(8), H(8, 10)]), route('r2', 'p2', [H(8, 12), H(8, 30)]), route('r3', 'p3', [H(8, 15)])],
};

describe('RAPTOR', () => {
  const rn = buildRaptor(net);
  const r = new Raptor(rn);
  const s = (id: string) => rn.stopIndex.get(id)!;

  it('finds a one-transfer journey and respects the transfer slack', () => {
    r.run([{ stop: s('A'), time: H(7, 58) }]);
    // ride A->C (08:00-08:10), then the 08:15 from E (100 m walk) beats waiting for the 08:30 from C
    expect(r.arrival(1, s('C'))).toBe(H(8, 10));
    const viaE = H(8, 16);
    expect(r.best[s('D')]).toBe(viaE);
    const j = r.journey(r.rounds, s('D'))!;
    expect(j.legs.map((l) => rn.patternRoute[l.pattern])).toEqual(['r1', 'r3']);
    expect(j.transferWalkSec).toBeGreaterThan(60);
    expect(r.legTime(j.legs[0]!)).toBe(600);
  });

  it('catches a later trip when the origin time is later, and reruns cleanly', () => {
    r.run([{ stop: s('A'), time: H(8, 5) }]);
    expect(r.best[s('C')]).toBe(H(8, 20));
    expect(r.best[s('D')]).toBe(H(8, 35)); // the 08:15 from E is gone; the 08:30 from C remains
    r.run([{ stop: s('A'), time: H(7, 58) }]);
    expect(r.best[s('D')]).toBe(H(8, 16));
  });

  it('keeps only trips in the time window', () => {
    const late = buildRaptor(net, H(8, 20), H(9));
    expect(late.tripCount[late.patternIds.indexOf('p1')]).toBe(1);
  });
});
