import type { Network } from '@otc/shared';
import { buildTimetable } from './timetable';

/**
 * RAPTOR (Delling, Pajor & Werneck, 2012): round-based earliest-arrival transit routing.
 *
 * The network is flattened into typed arrays so a query touches no objects. Each pattern is a
 * RAPTOR "route": its trips run the same stops in the same order and never overtake (true for
 * OTC's timetables: one set of run times per pattern and period).
 */
export interface RaptorNetwork {
  nStops: number;
  stopIds: string[];
  stopIndex: Map<string, number>;
  stopLon: Float64Array;
  stopLat: Float64Array;
  nPatterns: number;
  patternIds: string[];
  patternRoute: string[];
  /** stops of pattern p: patternStops[patternStart[p] .. patternStart[p + 1]) */
  patternStart: Int32Array;
  patternStops: Int32Array;
  /** trips of pattern p, sorted by departure: times at [timeStart[p] + trip * nStopsOf(p) + pos] */
  tripCount: Int32Array;
  timeStart: Int32Array;
  arr: Float32Array;
  dep: Float32Array;
  /** (pattern, position) pairs serving stop s: [stopPatStart[s] .. stopPatStart[s + 1]) */
  stopPatStart: Int32Array;
  stopPat: Int32Array;
  stopPos: Int32Array;
  /** walking transfers from stop s: [footStart[s] .. footStart[s + 1]) */
  footStart: Int32Array;
  footTo: Int32Array;
  footSec: Float32Array;
}

export const WALK_MPS = 1.25;
export const WALK_DETOUR = 1.3;
const TRANSFER_RADIUS_M = 250;
const KX = 111_320 * Math.cos((45.4 * Math.PI) / 180);
const KY = 110_950;

export function distM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  return Math.hypot((lon2 - lon1) * KX, (lat2 - lat1) * KY);
}

export function walkSec(metres: number): number {
  return (metres * WALK_DETOUR) / WALK_MPS;
}

/** Flatten a network's weekday timetable; only trips that overlap [from, to] (seconds) are kept. */
export function buildRaptor(network: Network, from = 0, to = 30 * 3600): RaptorNetwork {
  const stopIds = network.stops.map((s) => s.id);
  const stopIndex = new Map(stopIds.map((id, i) => [id, i]));
  const nStops = stopIds.length;
  const stopLon = new Float64Array(network.stops.map((s) => s.lon));
  const stopLat = new Float64Array(network.stops.map((s) => s.lat));
  const patterns = network.patterns.filter((p) => p.stops.every((s) => stopIndex.has(s)) && p.stops.length >= 2);
  const pIndex = new Map(patterns.map((p, i) => [p.id, i]));
  const byPattern: { dep: Float64Array; arr: Float64Array }[][] = patterns.map(() => []);
  for (const t of buildTimetable(network)) {
    const p = pIndex.get(t.patternId);
    if (p === undefined) continue;
    if (t.arr[t.arr.length - 1]! < from || t.dep[0]! > to) continue;
    byPattern[p]!.push(t);
  }
  const patternStart = new Int32Array(patterns.length + 1);
  const tripCount = new Int32Array(patterns.length);
  const timeStart = new Int32Array(patterns.length + 1);
  patterns.forEach((p, i) => {
    patternStart[i + 1] = patternStart[i]! + p.stops.length;
    tripCount[i] = byPattern[i]!.length;
    timeStart[i + 1] = timeStart[i]! + p.stops.length * byPattern[i]!.length;
  });
  const patternStops = new Int32Array(patternStart[patterns.length]!);
  const arr = new Float32Array(timeStart[patterns.length]!);
  const dep = new Float32Array(timeStart[patterns.length]!);
  patterns.forEach((p, i) => {
    p.stops.forEach((s, k) => (patternStops[patternStart[i]! + k] = stopIndex.get(s)!));
    const n = p.stops.length;
    byPattern[i]!.sort((a, b) => a.dep[0]! - b.dep[0]!).forEach((t, j) => {
      for (let k = 0; k < n; k++) {
        arr[timeStart[i]! + j * n + k] = t.arr[k]!;
        dep[timeStart[i]! + j * n + k] = t.dep[k]!;
      }
    });
  });
  // stop -> (pattern, position)
  const counts = new Int32Array(nStops + 1);
  for (let k = 0; k < patternStops.length; k++) counts[patternStops[k]! + 1]!++;
  const stopPatStart = new Int32Array(nStops + 1);
  for (let s = 0; s < nStops; s++) stopPatStart[s + 1] = stopPatStart[s]! + counts[s + 1]!;
  const stopPat = new Int32Array(patternStops.length);
  const stopPos = new Int32Array(patternStops.length);
  const fill = stopPatStart.slice(0, nStops);
  for (let p = 0; p < patterns.length; p++) {
    for (let k = patternStart[p]!; k < patternStart[p + 1]!; k++) {
      const s = patternStops[k]!;
      stopPat[fill[s]!] = p;
      stopPos[fill[s]!] = k - patternStart[p]!;
      fill[s]!++;
    }
  }
  // walking transfers between nearby stops (grid bucketed)
  const cell = TRANSFER_RADIUS_M / KX;
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / (TRANSFER_RADIUS_M / KY))}`;
  for (let s = 0; s < nStops; s++) {
    const k = key(stopLon[s]!, stopLat[s]!);
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(s);
  }
  const footLists: [number, number][][] = Array.from({ length: nStops }, () => []);
  for (let s = 0; s < nStops; s++) {
    const cx = Math.floor(stopLon[s]! / cell);
    const cy = Math.floor(stopLat[s]! / (TRANSFER_RADIUS_M / KY));
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const o of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (o === s) continue;
          const d = distM(stopLon[s]!, stopLat[s]!, stopLon[o]!, stopLat[o]!);
          if (d <= TRANSFER_RADIUS_M) footLists[s]!.push([o, walkSec(d)]);
        }
      }
    }
  }
  const footStart = new Int32Array(nStops + 1);
  footLists.forEach((l, s) => (footStart[s + 1] = footStart[s]! + l.length));
  const footTo = new Int32Array(footStart[nStops]!);
  const footSec = new Float32Array(footStart[nStops]!);
  footLists.forEach((l, s) => l.forEach(([o, t], k) => ((footTo[footStart[s]! + k] = o), (footSec[footStart[s]! + k] = t))));
  return {
    nStops, stopIds, stopIndex, stopLon, stopLat, nPatterns: patterns.length, patternIds: patterns.map((p) => p.id),
    patternRoute: patterns.map((p) => p.routeId), patternStart, patternStops, tripCount, timeStart, arr, dep,
    stopPatStart, stopPat, stopPos, footStart, footTo, footSec,
  };
}

/** A ride on one trip of one pattern, boarding and alighting at pattern positions. */
export interface Leg {
  pattern: number;
  trip: number;
  board: number;
  alight: number;
}

const INF = 1e9;
const KIND_NONE = 0;
const KIND_ACCESS = 1;
const KIND_TRIP = 2;
const KIND_FOOT = 3;
const KIND_CARRY = 4;

/** Reusable query state: allocate once per network (and per worker), run many queries. */
export class Raptor {
  readonly rounds: number;
  /** arrival time per (round, stop) */
  readonly tau: Float32Array;
  readonly best: Float32Array;
  private readonly kind: Uint8Array;
  private readonly pA: Int32Array; // pattern (trip legs) or from-stop (footpaths)
  private readonly pB: Int32Array; // trip index
  private readonly pC: Int32Array; // boarding position
  private readonly marked: Uint8Array;
  private readonly queue: Int32Array;
  private readonly queued: Int32Array;
  private readonly qpos: Int32Array;
  private stamp = 0;
  /** the last round the latest query computed (later rounds would change nothing) */
  lastRound = 0;

  constructor(readonly net: RaptorNetwork, maxTransfers = 3, readonly transferSlackSec = 60) {
    this.rounds = maxTransfers + 1;
    const n = (this.rounds + 1) * net.nStops;
    this.tau = new Float32Array(n);
    this.best = new Float32Array(net.nStops);
    this.kind = new Uint8Array(n);
    this.pA = new Int32Array(n);
    this.pB = new Int32Array(n);
    this.pC = new Int32Array(n);
    this.marked = new Uint8Array(net.nStops);
    this.queue = new Int32Array(net.nPatterns);
    this.queued = new Int32Array(net.nPatterns);
    this.qpos = new Int32Array(net.nPatterns);
  }

  /** Earliest arrivals from access stops reached at the given times. */
  run(sources: { stop: number; time: number }[], horizon = INF): void {
    const { net, tau, best, kind, pA, pB, pC, marked, queue, queued } = this;
    const N = net.nStops;
    tau.fill(INF);
    best.fill(INF);
    kind.fill(KIND_NONE);
    marked.fill(0);
    for (const { stop, time } of sources) {
      if (time < tau[stop]!) {
        tau[stop] = time;
        best[stop] = time;
        kind[stop] = KIND_ACCESS;
        marked[stop] = 1;
      }
    }
    this.lastRound = 0;
    for (let k = 1; k <= this.rounds; k++) {
      this.lastRound = k;
      const base = k * N;
      const prev = (k - 1) * N;
      for (let s = 0; s < N; s++) {
        tau[base + s] = tau[prev + s]!;
        kind[base + s] = KIND_CARRY;
      }
      // collect patterns serving marked stops, from their earliest marked position
      const stamp = ++this.stamp;
      const qpos = this.qpos;
      let nq = 0;
      for (let s = 0; s < N; s++) {
        if (!marked[s]) continue;
        marked[s] = 0;
        for (let j = net.stopPatStart[s]!; j < net.stopPatStart[s + 1]!; j++) {
          const p = net.stopPat[j]!;
          const pos = net.stopPos[j]!;
          if (queued[p] !== stamp) {
            queued[p] = stamp;
            queue[nq++] = p;
            qpos[p] = pos;
          } else if (pos < qpos[p]!) qpos[p] = pos;
        }
      }
      let improved = false;
      const slack = k > 1 ? this.transferSlackSec : 0;
      for (let qi = 0; qi < nq; qi++) {
        const p = queue[qi]!;
        const ps = net.patternStart[p]!;
        const n = net.patternStart[p + 1]! - ps;
        const nt = net.tripCount[p]!;
        if (nt === 0) continue;
        const ts = net.timeStart[p]!;
        let trip = -1;
        let boardPos = -1;
        for (let i = qpos[p]!; i < n; i++) {
          const s = net.patternStops[ps + i]!;
          if (trip >= 0) {
            const a = net.arr[ts + trip * n + i]!;
            if (a < best[s]! && a <= horizon) {
              tau[base + s] = a;
              best[s] = a;
              kind[base + s] = KIND_TRIP;
              pA[base + s] = p;
              pB[base + s] = trip;
              pC[base + s] = boardPos;
              marked[s] = 1;
              improved = true;
            }
          }
          const ready = tau[prev + s]! + slack;
          if (ready < INF && (trip < 0 || ready <= net.dep[ts + trip * n + i]!)) {
            // earliest trip departing at or after `ready` (binary search; trips never overtake)
            let lo = 0;
            let hi = trip < 0 ? nt : trip;
            while (lo < hi) {
              const mid = (lo + hi) >> 1;
              if (net.dep[ts + mid * n + i]! >= ready) hi = mid;
              else lo = mid + 1;
            }
            if (lo < nt && (trip < 0 || lo < trip)) {
              trip = lo;
              boardPos = i;
            }
          }
        }
      }
      // walking transfers from stops improved by a trip this round
      for (let s = 0; s < N; s++) {
        if (!marked[s] || kind[base + s] !== KIND_TRIP) continue;
        const t0 = tau[base + s]!;
        for (let j = net.footStart[s]!; j < net.footStart[s + 1]!; j++) {
          const o = net.footTo[j]!;
          const t = t0 + net.footSec[j]!;
          if (t < best[o]! && t < tau[base + o]!) {
            tau[base + o] = t;
            best[o] = t;
            kind[base + o] = KIND_FOOT;
            pA[base + o] = s;
            marked[o] = 1;
          }
        }
      }
      if (!improved) break;
    }
  }

  /** Arrival at stop s after at most k rounds (INF if unreached). */
  arrival(k: number, s: number): number {
    return this.tau[Math.min(k, this.lastRound) * this.net.nStops + s]!;
  }

  /** The legs of the journey reaching stop s in round k (empty if reached on foot from the origin). */
  journey(k: number, s: number): { legs: Leg[]; transferWalkSec: number } | null {
    const { net, kind, pA, pB, pC } = this;
    const N = net.nStops;
    const legs: Leg[] = [];
    let walk = 0;
    let guard = 0;
    k = Math.min(k, this.lastRound);
    while (guard++ < 64) {
      const i = k * N + s;
      const kd = kind[i]!;
      if (kd === KIND_ACCESS) break;
      if (kd === KIND_NONE) return null;
      if (kd === KIND_CARRY) {
        k--;
        if (k < 0) return null;
        continue;
      }
      if (kd === KIND_FOOT) {
        const from = pA[i]!;
        walk += this.tau[i]! - this.tau[k * N + from]!;
        s = from;
        continue;
      }
      const p = pA[i]!;
      const ps = net.patternStart[p]!;
      const n = net.patternStart[p + 1]! - ps;
      // alighting position: the position of s on p at or after boarding
      let alight = pC[i]! + 1;
      while (alight < n && net.patternStops[ps + alight] !== s) alight++;
      legs.push({ pattern: p, trip: pB[i]!, board: pC[i]!, alight });
      s = net.patternStops[ps + pC[i]!]!;
      k--;
      if (k < 0) return null;
    }
    legs.reverse();
    return { legs, transferWalkSec: walk };
  }

  /** In-vehicle seconds of a leg. */
  legTime(l: Leg): number {
    const { net } = this;
    const n = net.patternStart[l.pattern + 1]! - net.patternStart[l.pattern]!;
    const ts = net.timeStart[l.pattern]! + l.trip * n;
    return net.arr[ts + l.alight]! - net.dep[ts + l.board]!;
  }
}
