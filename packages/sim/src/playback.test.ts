import { describe, expect, it } from 'vitest';
import type { Network } from '@otc/shared';
import { distance, prepareLine } from './geometry';
import { Playback } from './playback';
import { departuresFromPeriods } from './timetable';

// Three stops ~1.1 km apart on a straight east-west line; 2 minutes between them, 30 s dwell.
const shape: [number, number][] = [[-75.72, 45.41], [-75.706, 45.41], [-75.692, 45.41]];
const cum = prepareLine(shape).cum;
const network: Network = {
  version: 1, snapshot: '2010-12-01', generated: 'test', status: 'infrastructure-only', statusNote: '',
  corridors: [],
  stops: [
    { id: 'a', name: 'A', lon: -75.72, lat: 45.41, kind: 'station', agencies: ['octranspo'] },
    { id: 'b', name: 'B', lon: -75.706, lat: 45.41, kind: 'station', agencies: ['octranspo'] },
    { id: 'c', name: 'C', lon: -75.692, lat: 45.41, kind: 'station', agencies: ['octranspo'] },
  ],
  routes: [{
    id: 'r', agency: 'octranspo', shortName: '1', longName: 'Test', mode: 'bus', class: 'frequent', color: '#000',
    patterns: ['p0'], weekday: [{ from: '07:00', to: '08:00', headwayMin: 10 }],
    provenance: { source: 'test', confidence: 'high', verified: true },
  }],
  patterns: [{
    id: 'p0', routeId: 'r', direction: 0, headsign: 'C', stops: ['a', 'b', 'c'],
    stopDist: [...cum], shape,
    runTimes: [120, 120], dwell: [0, 30, 0],
  }],
};

describe('timetable', () => {
  it('generates departures from headway periods, offsetting the return direction', () => {
    expect(departuresFromPeriods([{ from: '07:00', to: '08:00', headwayMin: 10 }], 0)).toEqual(
      [25200, 25800, 26400, 27000, 27600, 28200]);
    expect(departuresFromPeriods([{ from: '07:00', to: '07:30', headwayMin: 10 }], 1)).toEqual([25500, 26100, 26700]);
  });
});

describe('Playback', () => {
  const pb = new Playback(network);

  it('builds one trip per departure with arrivals, dwell and run times', () => {
    expect(pb.trips).toHaveLength(6);
    const t = pb.trips[0]!;
    expect([...t.arr]).toEqual([25200, 25320, 25470]);
    expect([...t.dep]).toEqual([25200, 25350, 25470]);
  });

  it('places vehicles between stops, dwelling at stops, and nowhere outside service', () => {
    expect(pb.vehiclesAt(25100)).toHaveLength(0);
    const mid = pb.vehiclesAt(25260)[0]!; // halfway between a and b
    expect(mid.distance).toBeCloseTo(cum[1]! / 2, 0);
    expect(mid.stopIndex).toBe(1);
    expect(mid.bearing).toBeCloseTo(90, 0);
    const dw = pb.vehiclesAt(25330)[0]!; // dwelling at b
    expect(dw.dwelling).toBe(true);
    expect(distance(dw.lonlat, [-75.706, 45.41])).toBeLessThan(1);
    expect(pb.vehiclesAt(25800 + 60)).toHaveLength(1);
  });

  it('lists next departures and a service curve', () => {
    const d = pb.departures('b', 25400, 3);
    expect(d.map((x) => x.time)).toEqual([25950, 26550, 27150]);
    expect(pb.departures('c', 0)).toHaveLength(0); // terminus
    const curve = pb.serviceCurve(600, 25200, 28800);
    expect(Math.max(...curve)).toBe(1);
  });

  it('draws a trail behind the vehicle', () => {
    const v = pb.vehiclesAt(25260)[0]!;
    const trail = pb.trail(v, 200);
    expect(trail.length).toBeGreaterThanOrEqual(2);
    expect(distance(trail[0]!, trail[trail.length - 1]!)).toBeCloseTo(200, -1);
  });
});
