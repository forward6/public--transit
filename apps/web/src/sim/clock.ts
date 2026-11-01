// The game clock: simulated seconds after midnight, advanced by the animation loop.

export const SPEEDS = [0, 60, 300, 900] as const; // simulated seconds per real second (pause, 1 min/s, 5 min/s, 15 min/s)
export type SpeedIndex = 0 | 1 | 2 | 3;

export interface Clock {
  now(): number;
  speed(): SpeedIndex;
  setSpeed(s: SpeedIndex): void;
  setTime(t: number): void;
  /** advance by `realSeconds` of wall time */
  tick(realSeconds: number): void;
  subscribe(fn: () => void): () => void;
  /** called when the service day ends (the clock loops back to 04:00): the calendar moves a day */
  onDayEnd(fn: () => void): () => void;
}

export const DAY_START = 4 * 3600;
export const DAY_END = 26 * 3600;

export function createClock(start: number, speed: SpeedIndex): Clock {
  let t = start;
  let s: SpeedIndex = speed;
  const subs = new Set<() => void>();
  const dayEnd = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  return {
    now: () => t,
    speed: () => s,
    setSpeed(v) {
      s = v;
      emit();
    },
    setTime(v) {
      t = Math.min(Math.max(v, DAY_START), DAY_END);
      emit();
    },
    tick(dt) {
      if (s === 0) return;
      t += dt * SPEEDS[s];
      if (t > DAY_END) {
        t = DAY_START; // loop the service day
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
