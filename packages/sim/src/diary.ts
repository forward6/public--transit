import type { DiaryEntry, DiaryKind, GameState, Persona, TripNote } from '@otc/shared';
import { addDays, missedShare, serviceDay, toDate } from './economy';
import type { Journey } from './journey';
import { rand, temperatureAt, weatherDelay, weatherOn } from './weather';

export interface PersonaTrips {
  out: Journey | null;
  back: Journey | null;
}

/** Share of the bus fleet that is high-floor (Sam can't board those). */
export function highFloorShare(s: GameState): number {
  const total = s.fleet.filter((g) => g.type !== 'rail').reduce((a, g) => a + g.count, 0);
  const high = s.fleet.filter((g) => /high floor/i.test(g.model)).reduce((a, g) => a + g.count, 0);
  return total > 0 ? high / total : 0;
}

const WEEKEND_SHARE = { weekday: 1, saturday: 0.6, sunday: 0.45 };

/** How one trip went on a date: the timetable's journey, plus the weekend, the weather and breakdowns. */
function tripNote(p: Persona, j: Journey | null, date: string, leg: 'out' | 'back', s: GameState,
  stopName: (id: string) => string, routeName: (id: string) => string): TripNote {
  const w = weatherOn(date, s.seed);
  const r = (k: string) => rand(s.seed, `${date}:${p.id}:${leg}:${k}`);
  const at = leg === 'out' ? p.out : p.back;
  if (!j) {
    return { depart: at, arrive: at, minutes: 0, waitMin: 0, temp: temperatureAt(w, at), routes: [], stop: '', late: 0, missed: false,
      highFloor: false, none: true };
  }
  // weekends and holidays run fewer trips: longer waits
  const share = WEEKEND_SHARE[serviceDay(date)];
  let extra = share < 1 ? (j.waitMin + 6) * (1 / share - 1) * (0.4 + r('wk')) : 0;
  const missed = r('miss') < missedShare(s) * 4;
  if (missed) extra += 10 + 10 * r('missw');
  const highFloor = !!p.wheelchair && r('hf') < highFloorShare(s) * 2;
  if (highFloor) extra += 12 + 10 * r('hfw');
  const late = Math.round(weatherDelay(w) * (0.5 + r('late')));
  const firstWait = j.legs.find((l) => l.kind === 'wait');
  const tStop = firstWait?.from ?? j.depart;
  const minutes = Math.round((j.arrive - j.depart) / 60 + extra + late);
  return {
    depart: j.depart, arrive: j.depart + minutes * 60, minutes, waitMin: Math.round(j.waitMin + extra + late),
    temp: temperatureAt(w, tStop), routes: j.routes.map(routeName), stop: stopName(j.firstStop), late, missed, highFloor, none: false,
  };
}

const ORDER: DiaryKind[] = ['noBus', 'highFloor', 'missed', 'worse', 'cold', 'storm', 'late', 'long', 'better', 'great', 'fine'];

/** A persona's day: null if they don't travel that day. `routine` tells whether a recent change made the trip better or worse. */
export function diaryEntry(p: Persona, date: string, trips: PersonaTrips, s: GameState, stopName: (id: string) => string,
  routeName: (id: string) => string): DiaryEntry | null {
  if (!p.days.includes(toDate(date).getUTCDay())) return null;
  const out = tripNote(p, trips.out, date, 'out', s, stopName, routeName);
  const back = trips.out ? tripNote(p, trips.back, date, 'back', s, stopName, routeName) : undefined;
  const notes = [out, ...(back ? [back] : [])];
  const kinds: DiaryKind[] = [];
  let mood = 0;
  const flag = (k: DiaryKind, dm: number) => {
    kinds.push(k);
    mood += dm;
  };
  const sens = p.coldSensitivity ?? 1;
  const snowy = weatherOn(date, s.seed).snowCm >= 5;
  for (const n of notes) {
    if (n.none) {
      flag('noBus', -2);
      continue;
    }
    if (n.highFloor) flag('highFloor', -2);
    if (n.missed) flag('missed', -2);
    if (n.temp <= -15 && n.waitMin * sens >= 8) flag('cold', n.temp <= -25 ? -2 : -1);
    if (n.late >= 8) flag(snowy ? 'storm' : 'late', -1);
    if (n.minutes >= 75 && !kinds.includes('long')) flag('long', -1);
    if (n.waitMin <= 5 && n.late <= 2 && n.minutes <= 50 && !n.missed && !n.highFloor) flag('great', 1);
  }
  // a recent change to their usual trip
  const rt = s.routines?.[p.id];
  if (rt?.prev !== undefined && date <= addDays(rt.since, 21)) {
    const d = rt.minutes - rt.prev;
    if (d <= -6) flag('better', 1);
    else if (d >= 6) flag('worse', -1);
  }
  const kind = ORDER.find((k) => kinds.includes(k)) ?? 'fine';
  return { date, persona: p.id, kind, mood: Math.max(-2, Math.min(2, mood)), out, ...(back ? { back } : {}) };
}

/** Door-to-door minutes of a persona's usual weekday round trip on this network (null: no transit). */
export function routineMinutes(trips: PersonaTrips): number | null {
  if (!trips.out) return null;
  return Math.round((trips.out.arrive - trips.out.depart + (trips.back ? trips.back.arrive - trips.back.depart : 0)) / 60);
}
