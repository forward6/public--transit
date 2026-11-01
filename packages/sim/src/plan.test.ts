import { describe, expect, it } from 'vitest';
import type { Network, NetPattern, NetRoute, NetStop } from '@otc/shared';
import { StreetGraph, type GraphMeta } from './streetgraph';
import { applyEdits, currentHeadways, draftToEdit, routeDraft } from './plan';
import { buildTimetable } from './timetable';

/** A 6 x 2 street grid: "Main Street" runs east-west (y=0), cross streets "1st".."6th" every 300 m. */
function gridGraph(): StreetGraph {
  const KX = 111_320 * Math.cos((45.4 * Math.PI) / 180);
  const lon = (x: number) => -75.7 + x / KX;
  const lat = (y: number) => 45.4 + y / 110_950;
  const nodes: [number, number][] = [];
  for (let i = 0; i < 6; i++) nodes.push([lon(i * 300), lat(0)], [lon(i * 300), lat(300)]);
  const edges: [number, number, number, number][] = []; // u, v, name, class
  for (let i = 0; i < 5; i++) edges.push([2 * i, 2 * i + 2, 1, 6], [2 * i + 1, 2 * i + 3, 8, 6]);
  for (let i = 0; i < 6; i++) edges.push([2 * i, 2 * i + 1, 2 + i, 6]);
  const n = nodes.length;
  const e = edges.length;
  const buf = new ArrayBuffer(32 + 8 * n + 16 * e + 4 * (e + 1) + 2 * e + e + 4);
  new Uint32Array(buf, 0, 8).set([0x4743544f, 1, n, e, 0, 0, 0, 0]);
  let o = 32;
  const f32 = (a: number[]) => (new Float32Array(buf, o, a.length).set(a), (o += 4 * a.length));
  const i32 = (a: number[]) => (new Int32Array(buf, o, a.length).set(a), (o += 4 * a.length));
  f32(nodes.map((p) => p[0]));
  f32(nodes.map((p) => p[1]));
  i32(edges.map((x) => x[0]));
  i32(edges.map((x) => x[1]));
  f32(edges.map(() => 300));
  i32(new Array(e + 1).fill(0));
  new Uint16Array(buf, o, e).set(edges.map((x) => x[2]));
  o += 2 * e;
  new Uint8Array(buf, o, e).set(edges.map((x) => x[3]));
  const meta: GraphMeta = {
    version: 1, classes: ['busway', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'link'],
    names: ['', 'Main Street', '1st', '2nd', '3rd', '4th', '5th', '6th', 'Back Street'],
    speedKmh: { minor: 20 }, routingCost: { minor: 2 }, downtown: { box: [0, 0, 0, 0], kmh: 12 },
  };
  return new StreetGraph(buf, meta);
}

const stop = (id: string, lon: number, lat: number): NetStop => ({ id, name: id, lon, lat, kind: 'stop', agencies: ['octranspo'] });
const pat = (id: string, routeId: string, headsign: string, stops: string[]): NetPattern => ({
  id, routeId, direction: 0, headsign, stops, stopDist: stops.map((_, i) => i * 500), shape: [[-75.7, 45.4], [-75.69, 45.4]],
  runTimes: stops.slice(1).map(() => 60), dwell: stops.map(() => 0),
});
const H = (h: number, m = 0) => h * 3600 + m * 60;

describe('planning', () => {
  const g = gridGraph();

  it('routes a drawn line along the streets and places named stops at cross streets', () => {
    const existing = [stop('old', g.lon[6]!, g.lat[6]!)]; // a stop already at Main / 4th
    const d = routeDraft(g, [[g.lon[0]!, g.lat[0]!], [g.lon[10]!, g.lat[10]!]], existing, 'plan-1')!;
    expect(d.lengthM).toBeCloseTo(1500, 0);
    expect(d.stops[0]!.name).toBe('Main Street / 1st');
    expect(d.stops.some((s) => s.id === 'old' && s.existing)).toBe(true);
    expect(d.stops.at(-1)!.name).toBe('Main Street / 6th');
    expect(d.runTimes.length).toBe(d.stops.length - 1);
    const e = draftToEdit(d, { id: 'plan-1', shortName: 'N1', headways: { am: 10, midday: 15, pm: 10, evening: 30 }, color: '#000' });
    if (e.kind !== 'add') throw new Error('expected add');
    expect(e.patterns.map((p) => p.headsign)).toEqual(['Main Street / 6th', 'Main Street / 1st']);
    expect(e.stops.every((s) => s.id !== 'old')).toBe(true); // reused stops aren't duplicated
    expect(e.route.class).toBe('frequent');
  });

  it('reads current headways and applies service, remove and add edits', () => {
    const route: NetRoute = {
      id: 'r', agency: 'octranspo', shortName: '9', longName: 'r', mode: 'bus', class: 'local', color: '#000', patterns: ['a', 'a2', 'b'],
      departures: { a: [H(7), H(7, 15), H(7, 30), H(7, 45), H(8), H(8, 15), H(8, 30), H(8, 45), H(12)], a2: [H(7, 50)], b: [H(7, 10), H(12, 10)] },
      provenance: { source: 't', confidence: 'high', verified: true },
    };
    const net: Network = {
      version: 1, snapshot: '', generated: '', status: 'gtfs', statusNote: '', corridors: [],
      stops: [stop('x', -75.7, 45.4), stop('y', -75.69, 45.4)],
      patterns: [pat('a', 'r', 'East', ['x', 'y']), pat('a2', 'r', 'East', ['x', 'y']), pat('b', 'r', 'West', ['y', 'x'])], routes: [route],
    };
    const h = currentHeadways(route, net);
    expect(h.am).toBe(15); // 10 eastbound trips in 2.5 h → every 15 min
    expect(h.evening).toBe(0);
    const doubled = applyEdits(net, [{ kind: 'service', routeId: 'r', headways: { ...h, am: 7.5 } }]);
    const r2 = doubled.routes[0]!;
    expect(r2.patterns.sort()).toEqual(['a', 'b']); // variants collapse to the busiest pattern each way
    expect(buildTimetable(doubled).filter((t) => t.patternId === 'a' && t.dep[0]! < H(9)).length).toBe(20);
    expect(net.routes[0]!.patterns).toHaveLength(3); // the base network is untouched
    const removed = applyEdits(net, [{ kind: 'remove', routeId: 'r' }]);
    expect(removed.routes).toHaveLength(0);
    expect(removed.patterns).toHaveLength(0);
  });
});
