import { describe, expect, it } from 'vitest';
import { OTTAWA_NORMALS, temperatureAt, weatherDelay, weatherOn, weatherRiders } from './weather';

const days = (from: string, n: number) => Array.from({ length: n }, (_, i) =>
  new Date(new Date(`${from}T12:00:00Z`).getTime() + i * 86_400_000).toISOString().slice(0, 10));

describe('weather', () => {
  it('is the same every time for a date and seed', () => {
    expect(weatherOn('2011-01-24')).toEqual(weatherOn('2011-01-24'));
    expect(weatherOn('2011-01-24', 7)).not.toEqual(weatherOn('2011-01-24'));
  });

  it('follows Ottawa normals over thirty years', () => {
    const all = days('1991-01-01', 30 * 365).map((d) => weatherOn(d));
    for (const m of [0, 6]) {
      const inMonth = all.filter((w) => Number(w.date.slice(5, 7)) === m + 1);
      const high = inMonth.reduce((a, w) => a + w.high, 0) / inMonth.length;
      const low = inMonth.reduce((a, w) => a + w.low, 0) / inMonth.length;
      expect(Math.abs(high - OTTAWA_NORMALS.high[m]!)).toBeLessThan(1.5);
      expect(Math.abs(low - OTTAWA_NORMALS.low[m]!)).toBeLessThan(1.5);
    }
    const snow = all.reduce((a, w) => a + w.snowCm, 0) / 30;
    const normal = OTTAWA_NORMALS.snowCm.reduce((a, b) => a + b, 0);
    expect(snow).toBeGreaterThan(0.75 * normal);
    expect(snow).toBeLessThan(1.25 * normal);
    // a few snowstorms and deep-cold days a winter, no snow in July
    const winters = all.filter((w) => ['12', '01', '02'].includes(w.date.slice(5, 7)));
    expect(winters.filter((w) => w.kind === 'snowstorm').length / 30).toBeGreaterThan(0.8);
    expect(winters.filter((w) => w.low <= -25).length / 30).toBeGreaterThan(1);
    expect(all.filter((w) => w.date.slice(5, 7) === '07' && w.snowCm > 0)).toEqual([]);
  });

  it('comes in spells: tomorrow is like today', () => {
    const jan = days('2000-01-01', 3000).map((d) => weatherOn(d)).filter((w) => w.date.slice(5, 7) === '01');
    let same = 0;
    let pairs = 0;
    for (let i = 1; i < jan.length; i++) {
      if (jan[i]!.date.slice(0, 4) !== jan[i - 1]!.date.slice(0, 4)) continue;
      pairs++;
      if (Math.abs(jan[i]!.low - jan[i - 1]!.low) < 6) same++;
    }
    expect(same / pairs).toBeGreaterThan(0.7);
  });

  it('is coldest at dawn, and storms slow buses and keep riders home', () => {
    const w = { date: '2011-01-24', high: -12, low: -27, snowCm: 0, rainMm: 0, kind: 'cold' as const };
    expect(temperatureAt(w, 6 * 3600)).toBe(-27);
    expect(temperatureAt(w, 15 * 3600)).toBe(-12);
    expect(temperatureAt(w, 8 * 3600)).toBeLessThan(-22);
    const storm = { date: '2011-02-02', high: -6, low: -11, snowCm: 30, rainMm: 0, kind: 'snowstorm' as const };
    expect(weatherRiders(storm)).toBeLessThan(0.9);
    expect(weatherDelay(storm)).toBeGreaterThan(10);
    expect(weatherDelay(w)).toBe(3);
  });
});
