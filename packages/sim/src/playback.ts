import type { LonLat, NetPattern, NetRoute, NetStop, Network } from '@otc/shared';
import { pointAt, prepareLine, sliceLine, type PreparedLine } from './geometry';
import { buildTimetable, type Trip } from './timetable';

export interface VehicleState {
  tripId: string;
  routeId: string;
  patternId: string;
  lonlat: LonLat;
  bearing: number;
  /** index of the stop the vehicle is at (dwelling) or heading to */
  stopIndex: number;
  dwelling: boolean;
  /** metres along the pattern */
  distance: number;
}

export interface Departure {
  routeId: string;
  patternId: string;
  headsign: string;
  time: number;
  tripId: string;
}

interface PreparedPattern {
  pattern: NetPattern;
  line: PreparedLine;
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * Plays a weekday timetable back: where every vehicle is at time t (seconds after midnight).
 * Pure and deterministic, so it can run in a Web Worker or in tests.
 */
export class Playback {
  readonly trips: Trip[];
  readonly routes: Map<string, NetRoute>;
  readonly stops: Map<string, NetStop>;
  private readonly patterns = new Map<string, PreparedPattern>();
  private readonly tripsByStop = new Map<string, { trip: Trip; index: number }[]>();
  private readonly ends: Float64Array;

  constructor(readonly network: Network) {
    for (const p of network.patterns) this.patterns.set(p.id, { pattern: p, line: prepareLine(p.shape) });
    this.routes = new Map(network.routes.map((r) => [r.id, r]));
    this.stops = new Map(network.stops.map((s) => [s.id, s]));
    this.trips = buildTimetable(network);
    this.ends = new Float64Array(this.trips.map((t) => t.arr[t.arr.length - 1]!));
    for (const trip of this.trips) {
      const p = this.patterns.get(trip.patternId)!.pattern;
      p.stops.forEach((s, index) => {
        let list = this.tripsByStop.get(s);
        if (!list) this.tripsByStop.set(s, (list = []));
        list.push({ trip, index });
      });
    }
    for (const list of this.tripsByStop.values()) list.sort((a, b) => a.trip.dep[a.index]! - b.trip.dep[b.index]!);
  }

  pattern(id: string): NetPattern | undefined {
    return this.patterns.get(id)?.pattern;
  }

  /** Vehicles in service at time t. */
  vehiclesAt(t: number): VehicleState[] {
    const out: VehicleState[] = [];
    for (let k = 0; k < this.trips.length; k++) {
      const trip = this.trips[k]!;
      if (trip.dep[0]! > t) break; // sorted by start
      if (this.ends[k]! < t) continue;
      const v = this.stateOf(trip, t);
      if (v) out.push(v);
    }
    return out;
  }

  stateOf(trip: Trip, t: number): VehicleState | null {
    const pp = this.patterns.get(trip.patternId);
    if (!pp) return null;
    const { pattern, line } = pp;
    const n = trip.arr.length;
    if (t < trip.dep[0]! || t > trip.arr[n - 1]!) return null;
    let i = 0;
    while (i < n - 1 && trip.arr[i + 1]! <= t) i++;
    const dwelling = t < trip.dep[i]!;
    let d: number;
    if (dwelling || i === n - 1) {
      d = pattern.stopDist[i]!;
    } else {
      const span = trip.arr[i + 1]! - trip.dep[i]!;
      const f = span > 0 ? (t - trip.dep[i]!) / span : 1;
      const ease = this.routes.get(trip.routeId)?.mode === 'rail' ? smooth(f) : f;
      d = pattern.stopDist[i]! + ease * (pattern.stopDist[i + 1]! - pattern.stopDist[i]!);
    }
    // heading: look slightly ahead so dwelling vehicles keep their direction
    const here = pointAt(line, d);
    const ahead = pointAt(line, Math.min(line.length, d + 8));
    return {
      tripId: trip.id, routeId: trip.routeId, patternId: trip.patternId, lonlat: here.lonlat,
      bearing: d + 8 <= line.length ? ahead.bearing : here.bearing,
      stopIndex: dwelling || i === n - 1 ? i : i + 1, dwelling, distance: d,
    };
  }

  /** A short trail behind a vehicle (for motion trails), `metres` long. */
  trail(v: VehicleState, metres: number): LonLat[] {
    const pp = this.patterns.get(v.patternId);
    return pp ? sliceLine(pp.line, v.distance - metres, v.distance) : [];
  }

  /** Next departures from a stop at or after t. */
  departures(stopId: string, t: number, limit = 6): Departure[] {
    const list = this.tripsByStop.get(stopId) ?? [];
    const out: Departure[] = [];
    for (const { trip, index } of list) {
      const time = trip.dep[index]!;
      const p = this.patterns.get(trip.patternId)!.pattern;
      if (time < t || index === p.stops.length - 1) continue;
      out.push({ routeId: trip.routeId, patternId: trip.patternId, headsign: p.headsign, time, tripId: trip.id });
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Routes serving a stop. */
  routesAt(stopId: string): NetRoute[] {
    const ids = new Set((this.tripsByStop.get(stopId) ?? []).map((x) => x.trip.routeId));
    for (const p of this.network.patterns) if (p.stops.includes(stopId)) ids.add(p.routeId);
    return [...ids].map((id) => this.routes.get(id)!).filter(Boolean);
  }

  /** Number of vehicles in service, sampled every `step` seconds over the service day. */
  serviceCurve(step = 300, from = 4 * 3600, to = 26 * 3600): number[] {
    const out: number[] = [];
    for (let t = from; t <= to; t += step) {
      let n = 0;
      for (let k = 0; k < this.trips.length; k++) {
        if (this.trips[k]!.dep[0]! > t) break;
        if (this.ends[k]! >= t) n++;
      }
      out.push(n);
    }
    return out;
  }

  /** Vehicles currently on a route. */
  countOnRoute(routeId: string, t: number): number {
    return this.vehiclesAt(t).filter((v) => v.routeId === routeId).length;
  }
}
