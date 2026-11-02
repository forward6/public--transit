import {
  HEADWAY_STEPS, PLAN_PERIODS, parseClock,
  type Edit, type Headways, type LonLat, type NetPattern, type NetRoute, type NetStop, type Network, type ServicePeriod,
} from '@otc/shared';
import { distM } from './raptor';
import type { StreetGraph } from './streetgraph';
import { departuresFromPeriods } from './timetable';

/**
 * The design tools' engine (M4): apply a player's edits to the 2010 network, read a route's
 * current headways, and turn waypoints tapped on the map into a new route that follows the
 * streets, with stops named after their cross streets.
 */

export function periodsFromHeadways(h: Headways): ServicePeriod[] {
  return PLAN_PERIODS.filter((p) => h[p.id] > 0).map((p) => ({ from: p.from, to: p.to, headwayMin: h[p.id] }));
}

function snapHeadway(min: number): number {
  let best: number = HEADWAY_STEPS[0];
  for (const s of HEADWAY_STEPS) if (s > 0 && Math.abs(s - min) < Math.abs(best - min)) best = s;
  return best;
}

/** Departures of each of a route's patterns on a weekday. */
function routeDepartures(route: NetRoute, patterns: Map<string, NetPattern>): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const pid of route.patterns) {
    const p = patterns.get(pid);
    if (!p) continue;
    out.set(pid, route.departures?.[pid] ?? departuresFromPeriods(route.weekday ?? [], p.direction));
  }
  return out;
}

/** The busiest pattern per destination (headsign): what a planner's "the route" runs. */
export function mainPatterns(route: NetRoute, network: Network): NetPattern[] {
  const patterns = new Map(network.patterns.map((p) => [p.id, p]));
  const deps = routeDepartures(route, patterns);
  const byHead = new Map<string, NetPattern>();
  for (const pid of route.patterns) {
    const p = patterns.get(pid);
    if (!p) continue;
    const cur = byHead.get(p.headsign);
    const score = (x: NetPattern) => (deps.get(x.id)?.length ?? 0) * 1000 + x.stops.length;
    if (!cur || score(p) > score(cur)) byHead.set(p.headsign, p);
  }
  // keep the two busiest directions
  return [...byHead.values()].sort((a, b) => (deps.get(b.id)?.length ?? 0) - (deps.get(a.id)?.length ?? 0)).slice(0, 2);
}

/** A route's current headway in each planning period (busiest direction), snapped to the stepper's values. */
export function currentHeadways(route: NetRoute, network: Network): Headways {
  const patterns = new Map(network.patterns.map((p) => [p.id, p]));
  const deps = routeDepartures(route, patterns);
  const byHead = new Map<string, number[]>();
  for (const [pid, d] of deps) {
    const head = patterns.get(pid)?.headsign ?? pid;
    byHead.set(head, [...(byHead.get(head) ?? []), ...d]);
  }
  const out = {} as Headways;
  for (const per of PLAN_PERIODS) {
    const a = parseClock(per.from);
    const b = parseClock(per.to);
    let most = 0;
    for (const d of byHead.values()) most = Math.max(most, d.filter((t) => t >= a && t < b).length);
    out[per.id] = most === 0 ? 0 : snapHeadway((b - a) / 60 / most);
  }
  return out;
}

/** The network with the player's edits applied (the base network is not modified). */
export function applyEdits(base: Network, edits: Edit[]): Network {
  let routes = base.routes.map((r) => ({ ...r }));
  let patterns = base.patterns;
  let stops = base.stops;
  let corridors = base.corridors;
  for (const e of edits) {
    if (e.kind === 'remove') {
      const r = routes.find((x) => x.id === e.routeId);
      routes = routes.filter((x) => x.id !== e.routeId);
      if (r) {
        const drop = new Set(r.patterns);
        patterns = patterns.filter((p) => !drop.has(p.id));
      }
    } else if (e.kind === 'service') {
      const r = routes.find((x) => x.id === e.routeId);
      if (!r) continue;
      const net = { ...base, routes, patterns, stops };
      const keep = mainPatterns(r, net);
      const keepIds = new Set(keep.map((p) => p.id));
      const drop = new Set(r.patterns.filter((id) => !keepIds.has(id)));
      patterns = patterns.filter((p) => !drop.has(p.id)).map((p) =>
        keepIds.has(p.id) ? { ...p, direction: (keep.indexOf(p) === 1 ? 1 : 0) as 0 | 1 } : p);
      Object.assign(r, { patterns: keep.map((p) => p.id), departures: undefined, weekday: periodsFromHeadways(e.headways) });
    } else {
      routes = [...routes.filter((x) => x.id !== e.route.id), { ...e.route }];
      const have = new Set(stops.map((s) => s.id));
      stops = [...stops, ...e.stops.filter((s) => !have.has(s.id))];
      patterns = [...patterns.filter((p) => p.routeId !== e.route.id), ...e.patterns];
      // a new rapid-transit line brings its own right of way (M8)
      if (e.corridor) corridors = [...corridors.filter((c) => c.id !== e.corridor!.id), e.corridor];
    }
  }
  return { ...base, routes, patterns, stops, corridors };
}

// ------------------------------------------------------------------------------------------ drawing

export interface DraftStop {
  id: string;
  name: string;
  lon: number;
  lat: number;
  /** an existing stop reused (so transfers work), or a new one */
  existing: boolean;
  /** metres along the route */
  dist: number;
}

export interface Draft {
  waypoints: LonLat[];
  shape: LonLat[];
  lengthM: number;
  /** AM-peak running seconds end to end (excluding dwell) */
  runSec: number;
  stops: DraftStop[];
  /** seconds between consecutive stops */
  runTimes: number[];
}

const STOP_SPACING_M = 400;
const REUSE_STOP_M = 60;
const REUSE_STATION_M = 180;
const SHARE_STOP_M = 250;
const DWELL_SEC = 20;

/**
 * Route a draft through `waypoints` on the street graph and place stops: every ~400 m at
 * intersections, reusing existing stops nearby. On the Transitway, buses stop only at stations.
 */
export function routeDraft(graph: StreetGraph, waypoints: LonLat[], existing: NetStop[], prefix: string,
  kind: 'local' | 'express' = 'local'): Draft | null {
  if (waypoints.length < 2) return null;
  const nodes = waypoints.map(([lon, lat]) => graph.nearestNode(lon, lat));
  if (nodes.some((n) => n < 0)) return null;
  // walk the path: node sequence, cumulative metres and seconds, incoming edge
  const seq: { node: number; dist: number; sec: number; edge: number }[] = [{ node: nodes[0]!, dist: 0, sec: 0, edge: -1 }];
  const shape: LonLat[] = [[graph.lon[nodes[0]!]!, graph.lat[nodes[0]!]!]];
  for (let i = 1; i < nodes.length; i++) {
    const leg = graph.path(nodes[i - 1]!, nodes[i]!, kind);
    if (leg === null) return null;
    let at = nodes[i - 1]!;
    for (const e of leg) {
      const c = graph.edgeCoords(e, at);
      shape.push(...c.slice(1));
      at = graph.other(e, at);
      const last = seq[seq.length - 1]!;
      seq.push({ node: at, dist: last.dist + graph.len[e]!, sec: last.sec + graph.sec[e]!, edge: e });
    }
  }
  if (seq.length < 2) return null;
  const busway = graph.meta.classes.indexOf('busway');
  const near = (lon: number, lat: number, maxM: number, stationsOnly: boolean) => {
    let best: NetStop | null = null;
    let bd = maxM;
    for (const s of existing) {
      if (stationsOnly && s.kind !== 'station') continue;
      const d = distM(lon, lat, s.lon, s.lat);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  };
  const stops: DraftStop[] = [];
  const stopSec: number[] = [];
  let sinceDist = -Infinity;
  for (let i = 0; i < seq.length; i++) {
    const { node, dist, sec, edge } = seq[i]!;
    const lon = graph.lon[node]!;
    const lat = graph.lat[node]!;
    const end = i === 0 || i === seq.length - 1;
    const next = i + 1 < seq.length ? seq[i + 1]!.edge : -1;
    const onBusway = edge >= 0 && graph.cls[edge] === busway && (next < 0 || graph.cls[next] === busway);
    // no stops along highways; on the Transitway, only at stations
    const fast = edge >= 0 && graph.fastClasses.has(graph.cls[edge]!) && (next < 0 || graph.fastClasses.has(graph.cls[next]!));
    const station = near(lon, lat, REUSE_STATION_M, true);
    const streetHere = edge >= 0 ? graph.streetName(edge) : next >= 0 ? graph.streetName(next) : null;
    let want = false;
    if (onBusway || fast) want = !!station && (!stops.length || stops[stops.length - 1]!.id !== station.id);
    const nearby = station ?? near(lon, lat, REUSE_STOP_M, false);
    if (!(onBusway || fast)) want = end || (dist - sinceDist >= STOP_SPACING_M && graph.degree(node) >= 3 && !!graph.crossName(node, streetHere))
      || (!!nearby && dist - sinceDist >= SHARE_STOP_M); // pass an existing stop: use it, so transfers work
    if (!want) continue;
    const reuse = nearby;
    if (reuse && stops.some((s) => s.id === reuse.id)) continue;
    const street = streetHere;
    const cross = graph.crossName(node, street);
    stops.push(reuse
      ? { id: reuse.id, name: reuse.name, lon: reuse.lon, lat: reuse.lat, existing: true, dist }
      : { id: `${prefix}-s${stops.length}`, name: street && cross ? `${street} / ${cross}` : street ?? cross ?? 'New stop', lon, lat,
        existing: false, dist });
    stopSec.push(sec);
    sinceDist = dist;
  }
  if (stops.length < 2) return null;
  const last = seq[seq.length - 1]!;
  return {
    waypoints, shape, lengthM: last.dist, runSec: last.sec, stops,
    runTimes: stopSec.slice(1).map((t, i) => Math.max(20, Math.round(t - stopSec[i]!))),
  };
}

/** The 'add' edit for a finished draft: a two-way route with both patterns and its new stops. */
export function draftToEdit(d: Draft, opts: { id: string; shortName: string; headways: Headways; color: string; agency?: 'octranspo' | 'sto' }): Edit {
  const first = d.stops[0]!;
  const last = d.stops[d.stops.length - 1]!;
  const n = d.stops.length;
  const pa: NetPattern = {
    id: `${opts.id}-a`, routeId: opts.id, direction: 0, headsign: last.name, stops: d.stops.map((s) => s.id),
    stopDist: d.stops.map((s) => Math.round(s.dist)), shape: d.shape.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]),
    runTimes: d.runTimes, dwell: d.stops.map((_, i) => (i === 0 || i === n - 1 ? 0 : DWELL_SEC)),
  };
  const pb: NetPattern = {
    ...pa, id: `${opts.id}-b`, direction: 1, headsign: first.name, stops: [...pa.stops].reverse(),
    stopDist: d.stops.map((s) => Math.round(d.lengthM - s.dist)).reverse(), shape: [...pa.shape].reverse(),
    runTimes: [...pa.runTimes].reverse(), dwell: [...pa.dwell].reverse(),
  };
  const allDay = (['am', 'midday', 'pm'] as const).every((k) => opts.headways[k] > 0 && opts.headways[k] <= 15);
  const route: NetRoute = {
    id: opts.id, agency: opts.agency ?? 'octranspo', shortName: opts.shortName, longName: `${first.name} ↔ ${last.name}`,
    mode: 'bus', class: allDay ? 'frequent' : 'local', color: opts.color, patterns: [pa.id, pb.id],
    weekday: periodsFromHeadways(opts.headways),
    provenance: { source: 'Your plan', confidence: 'high', verified: false, note: 'Drawn in Plan mode.' },
  };
  const stops: NetStop[] = d.stops.filter((s) => !s.existing).map((s) => ({
    id: s.id, name: s.name, lon: +s.lon.toFixed(6), lat: +s.lat.toFixed(6), kind: 'stop', agencies: [route.agency],
  }));
  return { kind: 'add', route, patterns: [pa, pb], stops };
}
