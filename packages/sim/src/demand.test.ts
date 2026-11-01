import { describe, expect, it } from 'vitest';
import { MODES, type Zone } from '@otc/shared';
import { DEFAULT_PARAMS, calibrate, calibrationRow, runModel, tripsPerResident, withTripRate, type Skims } from './demand';

// three zones in a row, 3 km apart: homes (0), downtown jobs (1), a mall (2)
const zone = (id: number, lon: number, pop: number, office: number, retail: number, downtown = false): Zone => ({
  id, cell: String(id), lon, lat: 45.4, areaKm2: 0.74, city: 'ottawa', district: downtown ? 'downtown' : 'suburbs', downtown, pop,
  seg: { worker_car: pop * 0.4, worker_nocar: pop * 0.12, post_car: 0, post_nocar: 0, school_car: pop * 0.1, school_nocar: pop * 0.05,
    other_car: pop * 0.25, other_nocar: pop * 0.08 },
  jobs: { office, retail }, enrol: { post: 0, school: pop > 0 ? 100 : 0 },
});
const zones = [zone(0, -75.80, 5000, 50, 20), zone(1, -75.76, 500, 8000, 500, true), zone(2, -75.72, 200, 100, 2000)];
const n = zones.length;
const car = new Uint8Array([2, 12, 15, 12, 2, 10, 15, 10, 2]);
const skim = () => {
  const s = { n, ivt: new Float32Array(n * n).fill(NaN), wait: new Float32Array(n * n).fill(NaN), walk: new Float32Array(n * n).fill(NaN),
    boardings: new Float32Array(n * n).fill(NaN) };
  for (const [i, j, ivt] of [[0, 1, 9], [1, 0, 9], [1, 2, 8], [2, 1, 8], [0, 2, 18], [2, 0, 18]] as const) {
    s.ivt[i * n + j] = ivt;
    s.wait[i * n + j] = 5;
    s.walk[i * n + j] = 8;
    s.boardings[i * n + j] = i + j === 2 ? 2 : 1;
  }
  return s;
};
const skims: Skims = { peak: skim(), offpeak: skim() };

describe('demand model', () => {
  it('generates the trips the rates imply and splits them across modes', () => {
    const p = withTripRate(zones, 2.5);
    expect(tripsPerResident(zones, p)).toBeCloseTo(2.5, 6);
    const r = runModel({ zones, car, skims }, p);
    const total = MODES.reduce((a, m) => a + r.byMode[m], 0);
    expect(total).toBeGreaterThan(0.95 * 2.5 * 5700);
    expect(r.byMode.transit).toBeGreaterThan(0);
    // most work trips from the homes go downtown (the jobs are there)
    expect(r.transit.peak[0 * n + 1]!).toBeGreaterThan(r.transit.peak[0 * n + 2]!);
  });

  it('calibrates mode constants to target shares', () => {
    const { result } = calibrate({ zones, car, skims }, { transit: 0.2, walk: 0.05, bike: 0.02, passenger: 0.12 }, DEFAULT_PARAMS, 30);
    const total = MODES.reduce((a, m) => a + result.byMode[m], 0);
    expect(result.byMode.transit / total).toBeCloseTo(0.2, 2);
    expect(result.byMode.walk / total).toBeCloseTo(0.05, 2);
  });

  it('judges calibration rows by absolute or relative tolerance', () => {
    expect(calibrationRow('a', 'a', 0.135, 0.005, 0.139, false, false, '').pass).toBe(true);
    expect(calibrationRow('b', 'b', 535600, 0.1, 470000, true, false, '').pass).toBe(false);
  });
});
