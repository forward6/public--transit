import { describe, expect, it } from 'vitest';
import { createClock, isNight, seasonOf, sunTimes } from './clock';
import { serviceDayAt, tripRuns } from './service';

describe('clock', () => {
  it('advances by speed, runs through midnight and turns the calendar', () => {
    const c = createClock(7 * 3600, 2);
    c.tick(2);
    expect(c.now()).toBe(7 * 3600 + 120);
    c.setSpeed(0);
    c.tick(10);
    expect(c.now()).toBe(7 * 3600 + 120);
    let days = 0;
    c.onDayEnd(() => days++);
    c.setTime(86_400 - 10);
    c.setSpeed(1); // real time
    c.tick(15);
    expect(days).toBe(1);
    expect(c.now()).toBe(5);
    expect(c.serviceTime()).toBe(86_405); // 24:00:05 on the timetable: the previous service day
    c.setTime(5 * 3600);
    expect(c.serviceTime()).toBe(5 * 3600);
  });

  it('follows the sun and the seasons in Ottawa', () => {
    const dec = sunTimes('2010-12-01');
    expect(dec.sunrise / 3600).toBeCloseTo(7.35, 1); // about 07:21
    expect(dec.sunset / 3600).toBeCloseTo(16.37, 1); // about 16:22
    const jun = sunTimes('2011-06-21'); // daylight saving time
    expect(jun.sunset / 3600).toBeGreaterThan(20.8);
    expect(isNight('2010-12-01', 60)).toBe(true);
    expect(isNight('2010-12-01', 12 * 3600)).toBe(false);
    expect(isNight('2011-06-21', 21 * 3600)).toBe(false); // still dusk
    expect(seasonOf('2010-12-01')).toBe('winter');
    expect(seasonOf('2011-03-30')).toBe('winter');
    expect(seasonOf('2011-07-14')).toBe('summer');
    expect(seasonOf('2011-10-10')).toBe('autumn');
  });

  it('runs a thinner timetable at weekends and on holidays', () => {
    expect(serviceDayAt('2010-12-04', 12 * 3600)).toBe('saturday');
    expect(serviceDayAt('2010-12-04', 3600)).toBe('weekday'); // Friday's late trips
    expect(serviceDayAt('2010-12-25', 12 * 3600)).toBe('sunday'); // Christmas, a Saturday
    const ids = Array.from({ length: 2000 }, (_, i) => `trip-${i}`);
    const sat = ids.filter((id) => tripRuns(id, 'saturday')).length / ids.length;
    const sun = ids.filter((id) => tripRuns(id, 'sunday')).length / ids.length;
    expect(sat).toBeGreaterThan(0.55);
    expect(sat).toBeLessThan(0.65);
    expect(sun).toBeLessThan(sat);
    expect(ids.filter((id) => tripRuns(id, 'sunday')).every((id) => tripRuns(id, 'saturday'))).toBe(true);
  });
});
