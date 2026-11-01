import { describe, expect, it } from 'vitest';
import type { Network } from '@otc/shared';
import { prepareLine } from './geometry';
import { PEAK_HOUR_SHARE, VEHICLE_CAPACITY, loadLevel, loadReport } from './crowding';
import { buildTimetable } from './timetable';

// One frequent route A–B–C, every 10 minutes 07:00–09:00: 6 buses an hour.
const shape: [number, number][] = [[-75.72, 45.41], [-75.706, 45.41], [-75.692, 45.41]];
const network: Network = {
  version: 1, snapshot: '2010-12-01', generated: 'test', status: 'infrastructure-only', statusNote: '', corridors: [],
  stops: ['a', 'b', 'c'].map((id, i) => ({ id, name: id.toUpperCase(), lon: -75.72 + 0.014 * i, lat: 45.41, kind: 'stop' as const, agencies: ['octranspo'] })),
  routes: [{ id: 'r', agency: 'octranspo', shortName: '1', longName: 'Test', mode: 'bus', class: 'frequent', color: '#000', patterns: ['p0'],
    weekday: [{ from: '07:00', to: '09:00', headwayMin: 10 }], provenance: { source: 'test', confidence: 'high', verified: true } }],
  patterns: [{ id: 'p0', routeId: 'r', direction: 0, headsign: 'C', stops: ['a', 'b', 'c'], stopDist: [...prepareLine(shape).cum], shape,
    runTimes: [120, 120], dwell: [0, 30, 0] }],
};

describe('crowding', () => {
  it('compares peak-hour riders with the capacity scheduled through each segment', () => {
    const r = loadReport(network, buildTimetable(network), { p0: [3000, 1000] }, { p0: [1600, 400] });
    const ab = r.segments.find((s) => s.from === 'a')!;
    expect(ab.capacity).toBeCloseTo(6 * VEHICLE_CAPACITY.frequent, 5);
    expect(ab.peakHour).toBeCloseTo(1600 * PEAK_HOUR_SHARE, 5);
    expect(ab.lf).toBeCloseTo((1600 * PEAK_HOUR_SHARE) / (6 * VEHICLE_CAPACITY.frequent), 5);
    expect(loadLevel(ab.lf)).toBe('crowded');
    expect(loadLevel(r.segments.find((s) => s.from === 'b')!.lf)).toBe('calm');
    expect(r.routes[0]).toMatchObject({ routeId: 'r', from: 'a', to: 'b' });
    // more riders (a busier month): more crowding; the most crowded segment is drawn last
    const busier = loadReport(network, buildTimetable(network), { p0: [3000, 1000] }, { p0: [1600, 400] }, 1.3);
    expect(loadLevel(busier.segments.at(-1)!.lf)).toBe('over');
  });

  it('halves the crowding when the frequency doubles', () => {
    const twice = { ...network, routes: [{ ...network.routes[0]!, weekday: [{ from: '07:00', to: '09:00', headwayMin: 5 }] }] };
    const a = loadReport(network, buildTimetable(network), { p0: [3000, 1000] }, { p0: [1600, 400] }).segments.find((s) => s.from === 'a')!;
    const b = loadReport(twice, buildTimetable(twice), { p0: [3000, 1000] }, { p0: [1600, 400] }).segments.find((s) => s.from === 'a')!;
    expect(b.lf).toBeCloseTo(a.lf / 2, 1);
  });
});
