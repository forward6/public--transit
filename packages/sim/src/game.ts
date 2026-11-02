import { ECONOMY_2010, PERSONAS, type EconomyStart, type GameState, type Persona } from '@otc/shared';
import { addDays, advanceDay, openDecision } from './economy';
import { diaryEntry, routineMinutes, type PersonaTrips } from './diary';
import { advanceOpinion, startOpinion } from './opinion';
import { advanceCouncil, startCouncil } from './council';
import { advanceProjects } from './projects';
import { dayPosts, frontPage, isFirstOfMonth, type FeedWorld } from './press';

/**
 * One game day (M5 + M6): the books and the fleet (`advanceDay`), then public opinion, the
 * personas' diaries, the social feed and, at the turn of a month, the front page. The world holds
 * what the state doesn't: zones, the 2010 level of service, and the personas' trips on the network
 * in operation (computed by the game when the network changes).
 */
export interface GameWorld extends FeedWorld {
  personas?: Persona[];
  trips?: Record<string, PersonaTrips>;
  stopName?: (id: string) => string;
  routeName?: (id: string) => string;
  /** M7: ward id per zone (0: not in Ottawa) */
  wardOf?: number[];
}

const DIARY_DAYS = 28;

/** Add M6's opinion and press, and M7's council, to a game (new, or saved before them). */
export function withOpinion(s: GameState, world: GameWorld, start: EconomyStart = ECONOMY_2010): GameState {
  const council = s.council ?? startCouncil(s.date);
  if (s.opinion && s.opinion.service.length === world.zones.length) return s.council ? s : { ...s, council };
  return { ...s, opinion: startOpinion(s, world, start), diaries: s.diaries ?? {}, press: s.press ?? [], posts: s.posts ?? [], council };
}

/** Keep each persona's usual trip time, noting when a change to the network moves it. */
export function updateRoutines(s: GameState, world: GameWorld): GameState {
  if (!world.trips) return s;
  let routines = s.routines;
  for (const p of world.personas ?? PERSONAS) {
    const t = world.trips[p.id];
    if (!t) continue;
    const m = routineMinutes(t) ?? 999;
    const cur = routines?.[p.id];
    if (cur && Math.abs(cur.minutes - m) < 3) continue;
    routines = { ...routines, [p.id]: cur ? { minutes: m, prev: cur.minutes, since: s.date } : { minutes: m, since: s.date } };
  }
  return routines === s.routines ? s : { ...s, routines };
}

export function stepDay(prev: GameState, world: GameWorld, start: EconomyStart = ECONOMY_2010): GameState {
  if (openDecision(prev)) return prev;
  const ended = prev.date;
  const s = advanceDay(prev, start);
  if (s === prev || !s.opinion) return s;
  s.opinion = advanceOpinion(s.opinion, s, world, ended, start);
  let t = s;
  if (t.council && world.wardOf) t = advanceCouncil(t, { ...world, wardOf: world.wardOf }, ended, start);
  if (t.projects?.length) advanceProjects(t);
  return dayEnd(t, world, ended, start);
}

/** The personas' day, the feed and the front page. */
function dayEnd(s: GameState, world: GameWorld, ended: string, start: EconomyStart): GameState {
  // the personas' day
  const entries = [];
  if (world.trips) {
    const stopName = world.stopName ?? ((id: string) => id);
    const routeName = world.routeName ?? ((id: string) => id);
    s.diaries = { ...(s.diaries ?? {}) };
    for (const p of world.personas ?? PERSONAS) {
      const t = world.trips[p.id];
      if (!t) continue;
      const e = diaryEntry(p, ended, t, s, stopName, routeName);
      if (!e) continue;
      entries.push(e);
      s.diaries[p.id] = [...(s.diaries[p.id] ?? []), e].filter((x) => x.date > addDays(ended, -DIARY_DAYS));
    }
  }
  s.posts = [...(s.posts ?? []), ...dayPosts(s, world, ended, entries)].slice(-40);
  if (isFirstOfMonth(s.date)) s.press = [...(s.press ?? []), frontPage(s, world, ended.slice(0, 7), start)].slice(-24);
  return s;
}
