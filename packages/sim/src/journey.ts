import type { LngLat, Network, NetPattern } from '@otc/shared';
import { prepareLine, sliceLine, type PreparedLine } from './geometry';
import { Raptor, buildRaptor, distM, walkSec, type RaptorNetwork } from './raptor';

/** One step of a door-to-door journey (times are timetable seconds, 24:00+ after midnight). */
export interface JourneyLeg {
  kind: 'walk' | 'wait' | 'ride';
  from: number;
  to: number;
  /** ride: the route and pattern, and where it boards and alights */
  routeId?: string;
  patternId?: string;
  boardStop?: string;
  alightStop?: string;
  /** wait: the stop */
  stop?: string;
  /** the way it goes, for the map (lon/lat) */
  path: LngLat[];
}

export interface Journey {
  depart: number;
  arrive: number;
  legs: JourneyLeg[];
  waitMin: number;
  walkMin: number;
  rideMin: number;
  /** route ids in order */
  routes: string[];
  /** the first stop's id */
  firstStop: string;
}

const TRANSFER_PENALTY_SEC = 300;

/**
 * Door-to-door journeys on one network (the personas' daily trips): walk to a stop within reach,
 * RAPTOR through the timetable, walk from the last stop. Leaves at a fixed time, so waiting reflects
 * how often buses come.
 */
export class JourneyPlanner {
  readonly rn: RaptorNetwork;
  private readonly raptor: Raptor;
  private readonly patterns = new Map<string, NetPattern>();
  private readonly lines = new Map<string, PreparedLine>();

  constructor(readonly network: Network) {
    this.rn = buildRaptor(network);
    this.raptor = new Raptor(this.rn, 3);
    for (const p of network.patterns) this.patterns.set(p.id, p);
  }

  private line(p: NetPattern): PreparedLine {
    let l = this.lines.get(p.id);
    if (!l) this.lines.set(p.id, (l = prepareLine(p.shape)));
    return l;
  }

  private near(at: LngLat, maxM: number): { stop: number; sec: number }[] {
    const out: { stop: number; sec: number }[] = [];
    const { rn } = this;
    for (let s = 0; s < rn.nStops; s++) {
      const d = distM(at[0], at[1], rn.stopLon[s]!, rn.stopLat[s]!);
      if (d <= maxM) out.push({ stop: s, sec: walkSec(d) });
    }
    return out;
  }

  /** The best journey leaving `from` at `departAt` (seconds), or null if transit can't do it within 3 h. */
  plan(from: LngLat, to: LngLat, departAt: number, maxWalkM = 1000): Journey | null {
    const { rn, raptor } = this;
    const access = this.near(from, maxWalkM);
    const egress = this.near(to, maxWalkM);
    if (!access.length || !egress.length) return null;
    raptor.run(access.map((a) => ({ stop: a.stop, time: departAt + a.sec })), departAt + 3 * 3600);
    let best: { k: number; stop: number; eg: number; score: number } | null = null;
    for (let k = 1; k <= raptor.lastRound; k++) {
      for (const e of egress) {
        const t = raptor.arrival(k, e.stop);
        if (!(t < 1e8)) continue;
        const score = t + e.sec + TRANSFER_PENALTY_SEC * (k - 1);
        if (!best || score < best.score) best = { k, stop: e.stop, eg: e.sec, score };
      }
    }
    if (!best) return null;
    const j = raptor.journey(best.k, best.stop);
    if (!j || !j.legs.length) return null;
    const legs: JourneyLeg[] = [];
    const stopLL = (s: number): LngLat => [rn.stopLon[s]!, rn.stopLat[s]!];
    let t = departAt;
    let here: LngLat = from;
    const walkTo = (s: number) => {
      const at = stopLL(s);
      const sec = walkSec(distM(here[0], here[1], at[0], at[1]));
      if (sec >= 1) legs.push({ kind: 'walk', from: t, to: t + sec, path: [here, at] });
      t += sec;
      here = at;
    };
    for (const leg of j.legs) {
      const p = leg.pattern;
      const ps = rn.patternStart[p]!;
      const n = rn.patternStart[p + 1]! - ps;
      const ts = rn.timeStart[p]!;
      const board = rn.patternStops[ps + leg.board]!;
      const alight = rn.patternStops[ps + leg.alight]!;
      walkTo(board);
      const dep = rn.dep[ts + leg.trip * n + leg.board]!;
      const arr = rn.arr[ts + leg.trip * n + leg.alight]!;
      if (dep > t + 1) legs.push({ kind: 'wait', from: t, to: dep, stop: rn.stopIds[board], path: [here] });
      const pattern = this.patterns.get(rn.patternIds[p]!)!;
      const path = pattern.stopDist && pattern.shape.length >= 2
        ? sliceLine(this.line(pattern), pattern.stopDist[leg.board]!, pattern.stopDist[leg.alight]!)
        : [stopLL(board), stopLL(alight)];
      legs.push({ kind: 'ride', from: dep, to: arr, routeId: rn.patternRoute[p], patternId: pattern.id,
        boardStop: rn.stopIds[board], alightStop: rn.stopIds[alight], path });
      t = arr;
      here = stopLL(alight);
    }
    if (best.eg >= 1) legs.push({ kind: 'walk', from: t, to: t + best.eg, path: [here, to] });
    t += best.eg;
    const sum = (k: JourneyLeg['kind']) => legs.filter((l) => l.kind === k).reduce((a, l) => a + (l.to - l.from), 0) / 60;
    const rides = legs.filter((l) => l.kind === 'ride');
    return {
      depart: departAt, arrive: t, legs, waitMin: sum('wait'), walkMin: sum('walk'), rideMin: sum('ride'),
      routes: rides.map((l) => l.routeId!), firstStop: rides[0]!.boardStop!,
    };
  }
}

/** Where someone on this journey is at time t (service seconds): walking, waiting or riding. */
export function journeyPosition(j: Journey, t: number): { lonlat: LngLat; leg: JourneyLeg } | null {
  if (t < j.depart || t > j.arrive) return null;
  for (const leg of j.legs) {
    if (t > leg.to) continue;
    const f = leg.to > leg.from ? Math.max(0, Math.min(1, (t - leg.from) / (leg.to - leg.from))) : 1;
    return { lonlat: alongPath(leg.path, f), leg };
  }
  const last = j.legs.at(-1)!;
  return { lonlat: last.path.at(-1)!, leg: last };
}

function alongPath(path: LngLat[], f: number): LngLat {
  if (path.length === 1) return path[0]!;
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = distM(path[i - 1]![0], path[i - 1]![1], path[i]![0], path[i]![1]);
    seg.push(d);
    total += d;
  }
  let want = f * total;
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i]! || i === seg.length - 1) {
      const g = seg[i]! > 0 ? Math.min(1, want / seg[i]!) : 1;
      const a = path[i]!;
      const b = path[i + 1]!;
      return [a[0] + g * (b[0] - a[0]), a[1] + g * (b[1] - a[1])];
    }
    want -= seg[i]!;
  }
  return path.at(-1)!;
}
