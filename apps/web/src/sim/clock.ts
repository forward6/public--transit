// The game clock: the time of day, running continuously across midnight. The calendar date lives
// in the game state (M5); the clock tells it when a day ends.

/** simulated seconds per real second: pause, real time, 1 min/s, 15 min/s, 2 h/s, 1 day/s */
export const SPEEDS = [0, 1, 60, 900, 7200, 86400] as const;
export type SpeedIndex = 0 | 1 | 2 | 3 | 4 | 5;
/** at this speed and above, days fly by: vehicles aren't drawn and the light stays on */
export const DAYS_SPEED: SpeedIndex = 5;

export interface Clock {
  /** seconds after midnight, 0 ≤ t < 86 400 */
  now(): number;
  /** the time on the service timetable: trips after midnight belong to the previous service day (24:00+) */
  serviceTime(): number;
  speed(): SpeedIndex;
  setSpeed(s: SpeedIndex): void;
  setTime(t: number): void;
  /** advance by `realSeconds` of wall time */
  tick(realSeconds: number): void;
  subscribe(fn: () => void): () => void;
  /** called at midnight: the calendar moves a day */
  onDayEnd(fn: () => void): () => void;
}

const DAY = 86_400;
/** the service day starts at 04:00; earlier trips are the previous day's late service */
export const SERVICE_DAY_START = 4 * 3600;

export function createClock(start: number, speed: SpeedIndex): Clock {
  let t = ((start % DAY) + DAY) % DAY;
  let s: SpeedIndex = speed;
  const subs = new Set<() => void>();
  const dayEnd = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  return {
    now: () => t,
    serviceTime: () => (t < SERVICE_DAY_START ? t + DAY : t),
    speed: () => s,
    setSpeed(v) {
      s = v;
      emit();
    },
    setTime(v) {
      t = ((v % DAY) + DAY) % DAY;
      emit();
    },
    tick(dt) {
      if (s === 0) return;
      t += dt * SPEEDS[s];
      while (t >= DAY) {
        t -= DAY;
        dayEnd.forEach((f) => f());
      }
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    onDayEnd(fn) {
      dayEnd.add(fn);
      return () => dayEnd.delete(fn);
    },
  };
}

/**
 * Sunrise and sunset in Ottawa (seconds after local midnight) for a date: NOAA's approximation,
 * with daylight saving time from the second Sunday of March to the first Sunday of November.
 */
export function sunTimes(iso: string): { sunrise: number; sunset: number } {
  const d = new Date(`${iso}T12:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const n = Math.floor((d.getTime() - start) / 86_400_000);
  const g = ((2 * Math.PI) / 365) * (n - 1);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const lat = (45.42 * Math.PI) / 180;
  const ha = Math.acos(Math.cos((90.833 * Math.PI) / 180) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl));
  const lon = -75.7;
  const noonUtcMin = 720 - 4 * lon - eqtime;
  const y = d.getUTCFullYear();
  const nthSunday = (month: number, k: number) => {
    const first = new Date(Date.UTC(y, month, 1, 12));
    return 1 + ((7 - first.getUTCDay()) % 7) + 7 * (k - 1);
  };
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const dst = (m > 2 && m < 10) || (m === 2 && day >= nthSunday(2, 2)) || (m === 10 && day < nthSunday(10, 1));
  const offsetMin = (dst ? -4 : -5) * 60;
  const haMin = (4 * ha * 180) / Math.PI;
  return { sunrise: (noonUtcMin - haMin + offsetMin) * 60, sunset: (noonUtcMin + haMin + offsetMin) * 60 };
}

/** The season the map shows on a date (Ottawa: snow from December to March). */
export function seasonOf(iso: string): 'winter' | 'spring' | 'summer' | 'autumn' {
  const m = Number(iso.slice(5, 7));
  return m === 12 || m <= 3 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn';
}

/** Night on the map: from dusk (sunset + 25 min) to dawn (sunrise − 25 min). */
export function isNight(iso: string, t: number): boolean {
  const { sunrise, sunset } = sunTimes(iso);
  return t < sunrise - 1500 || t > sunset + 1500;
}
