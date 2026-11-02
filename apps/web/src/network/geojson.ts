import type { FeatureCollection, LineString, Point, Polygon } from 'geojson';
import type { DemandFile, LineDesign, Network, Project, RouteClass, ZonesFile } from '@otc/shared';
import { prepareLine, sliceLine, type Draft, type Journey, type LoadReport, type Playback, type VehicleState } from '@otc/sim';

export type LinesFC = FeatureCollection<LineString>;
export type PointsFC = FeatureCollection<Point>;
export type PolysFC = FeatureCollection<Polygon>;

export const EMPTY_POINTS: PointsFC = { type: 'FeatureCollection', features: [] };
export const EMPTY_LINES: LinesFC = { type: 'FeatureCollection', features: [] };

/** Corridors (infrastructure) and route patterns (one direction each) as map lines. */
export function networkLines(network: Network, demand?: DemandFile | null): LinesFC {
  const features: LinesFC['features'] = [];
  for (const c of network.corridors) {
    c.lines.forEach((line, i) =>
      features.push({
        type: 'Feature',
        id: `${c.id}-${i}`,
        properties: { kind: 'corridor', corridor: c.kind, id: c.id, name: c.name, ...(c.color ? { color: c.color } : {}) },
        geometry: { type: 'LineString', coordinates: line },
      }),
    );
  }
  const routes = new Map(network.routes.map((r) => [r.id, r]));
  for (const p of network.patterns) {
    const r = routes.get(p.routeId);
    if (!r || p.direction !== 0) continue;
    // weekday riders on board, averaged along the pattern (M3 demand model)
    const loads = demand?.loads[p.id];
    const riders = loads?.length ? Math.round(loads.reduce((a, b) => a + b, 0) / loads.length) : 0;
    features.push({
      type: 'Feature',
      properties: { kind: 'route', id: r.id, cls: r.class, mode: r.mode, name: r.shortName, riders },
      geometry: { type: 'LineString', coordinates: p.shape },
    });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * M8: lines not yet open (proposed, designed, tendered, being built) and the one being drawn:
 * a feature per stretch (how it's built), and the stations.
 */
export function projectFeatures(projects: Project[], draft: LineDesign | null): FeatureCollection<LineString | Point> {
  const features: FeatureCollection<LineString | Point>['features'] = [];
  const add = (d: LineDesign, id: string, phase: string) => {
    d.stations.forEach((s, i) => {
      const next = d.stations[i + 1];
      if (next) features.push({ type: 'Feature', properties: { id, phase, color: d.color, structure: d.structure[i] ?? 'surface', kind: 'stretch' },
        geometry: { type: 'LineString', coordinates: [[s.lon, s.lat], [next.lon, next.lat]] } });
      features.push({ type: 'Feature', properties: { id, phase, color: d.color, name: s.name, existing: !!s.existing, kind: 'station' },
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] } });
    });
  };
  for (const p of projects) if (!['open', 'shelved', 'cancelled'].includes(p.phase)) add(p.design, p.id, p.phase === 'construction' || p.phase === 'testing' ? 'building' : 'planned');
  if (draft) add(draft, 'draft', 'draft');
  return { type: 'FeatureCollection', features };
}

/** Stations and stops, tagged with the most prominent class serving them. */
export function networkStops(network: Network, playback: Playback): PointsFC {
  const rank: RouteClass[] = ['otrain', 'transitway', 'frequent', 'sto', 'local', 'peak', 'rural'];
  return {
    type: 'FeatureCollection',
    features: network.stops.map((s) => {
      const classes = new Set(playback.routesAt(s.id).map((r) => r.class));
      const top = rank.find((c) => classes.has(c)) ?? (s.kind === 'station' ? 'transitway' : 'local');
      const rail = classes.has('otrain');
      return {
        type: 'Feature',
        properties: { id: s.id, name: s.name, kind: s.kind, cls: top, rail, transfer: rail && classes.size > 1 },
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      };
    }),
  };
}

const TRAIL_M: Record<string, number> = { rail: 380, brt: 240, bus: 180 };

/** Moving vehicles and their trails at one moment. */
export function vehicleFeatures(playback: Playback, vehicles: VehicleState[]): { points: PointsFC; trails: LinesFC } {
  const points: PointsFC['features'] = [];
  const trails: LinesFC['features'] = [];
  for (const v of vehicles) {
    const r = playback.routes.get(v.routeId);
    const cls = r?.class ?? 'local';
    // M8: a new line's trains wear its colour
    const own = r && r.id.startsWith('line-') ? { color: r.color } : {};
    points.push({
      type: 'Feature',
      properties: { trip: v.tripId, route: v.routeId, cls, bearing: v.bearing, dwelling: v.dwelling, ...own },
      geometry: { type: 'Point', coordinates: v.lonlat },
    });
    const trail = playback.trail(v, TRAIL_M[r?.mode ?? 'bus'] ?? 180);
    if (trail.length >= 2 && !v.dwelling) {
      trails.push({ type: 'Feature', properties: { cls, ...own }, geometry: { type: 'LineString', coordinates: trail } });
    }
  }
  return { points: { type: 'FeatureCollection', features: points }, trails: { type: 'FeatureCollection', features: trails } };
}

/** Demand zones as points: weekday trips by residents and the transit share of them (M3). */
export function zonePoints(zones: ZonesFile | null, demand: DemandFile | null): PointsFC {
  if (!zones || !demand) return EMPTY_POINTS;
  return {
    type: 'FeatureCollection',
    features: zones.zones.flatMap((z) => {
      const [trips, share] = demand.zones[String(z.id)] ?? [0, 0];
      if (trips < 50) return [];
      return [{ type: 'Feature' as const, properties: { id: z.id, trips, share, district: z.district },
        geometry: { type: 'Point' as const, coordinates: [z.lon, z.lat] } }];
    }),
  };
}

/**
 * Weekday riders per stop-to-stop segment, summed over every route that runs it (a "bandwidth"
 * map for the Riders view). Segments carrying fewer than `min` riders are left out.
 */
export function loadLines(network: Network, demand: DemandFile | null, min = 30): LinesFC {
  if (!demand) return EMPTY_LINES;
  const seg = new Map<string, { load: number; coords: [number, number][] }>();
  for (const p of network.patterns) {
    const loads = demand.loads[p.id];
    if (!loads) continue;
    let line: ReturnType<typeof prepareLine> | null = null;
    for (let i = 0; i < loads.length; i++) {
      const load = loads[i]!;
      if (load < 1) continue;
      const key = `${p.stops[i]}|${p.stops[i + 1]}`;
      const cur = seg.get(key);
      if (cur) cur.load += load;
      else {
        line ??= prepareLine(p.shape);
        seg.set(key, { load, coords: sliceLine(line, p.stopDist[i]!, p.stopDist[i + 1]!) as [number, number][] });
      }
    }
  }
  const features: LinesFC['features'] = [];
  for (const { load, coords } of seg.values()) {
    if (load < min || coords.length < 2) continue;
    features.push({ type: 'Feature', properties: { load: Math.round(load) }, geometry: { type: 'LineString', coordinates: coords } });
  }
  features.sort((a, b) => (a.properties!.load as number) - (b.properties!.load as number)); // busiest drawn last
  return { type: 'FeatureCollection', features };
}

/** The route being drawn: its street path, and its stops (new or reused). */
export function draftFeatures(draft: Draft | null, waypoints: [number, number][]): { line: LinesFC; points: PointsFC } {
  const points: PointsFC['features'] = waypoints.map((w, i) => ({ type: 'Feature', properties: { kind: 'waypoint', i },
    geometry: { type: 'Point', coordinates: w } }));
  if (!draft) return { line: EMPTY_LINES, points: { type: 'FeatureCollection', features: points } };
  for (const s of draft.stops) {
    points.push({ type: 'Feature', properties: { kind: 'stop', name: s.name, existing: s.existing },
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] } });
  }
  return {
    line: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: draft.shape } }] },
    points: { type: 'FeatureCollection', features: points },
  };
}

/** Zone hexagons with travel minutes from the chosen point ("travel-time bloom"). */
export function isoPolys(zones: ZonesFile | null, minutes: Float32Array | null): PolysFC {
  if (!zones || !minutes) return { type: 'FeatureCollection', features: [] };
  const features: PolysFC['features'] = [];
  zones.zones.forEach((z, i) => {
    const t = minutes[i]!;
    if (!z.ring || !(t <= 60)) return;
    features.push({ type: 'Feature', properties: { t: Math.round(t), coarse: z.areaKm2 > 2 },
      geometry: { type: 'Polygon', coordinates: [[...z.ring, z.ring[0]!]] } });
  });
  // coarse (resolution-7) cells first, so the finer cells inside them draw on top
  features.sort((a, b) => Number(b.properties!.coarse) - Number(a.properties!.coarse));
  return { type: 'FeatureCollection', features };
}

// ------------------------------------------------------------------------------------------ M6

/** Ottawa's zones for the opinion wash: `v` = approval points around 50% (or an axis ÷ 2). */
export function opinionPolys(zones: ZonesFile | null, values: number[] | null, selected: number | null): PolysFC {
  if (!zones || !values) return { type: 'FeatureCollection', features: [] };
  const features: PolysFC['features'] = [];
  zones.zones.forEach((z, i) => {
    if (!z.ring || z.city !== 'ottawa' || z.pop <= 0) return;
    features.push({ type: 'Feature', properties: { i, v: Math.round(values[i]! * 10) / 10, coarse: z.areaKm2 > 2, selected: i === selected },
      geometry: { type: 'Polygon', coordinates: [[...z.ring, z.ring[0]!]] } });
  });
  features.sort((a, b) => Number(b.properties!.coarse) - Number(a.properties!.coarse));
  return { type: 'FeatureCollection', features };
}

/** A rider's journeys as lines (walk / ride) and end points. */
export function riderPath(journeys: (Journey | null)[]): { lines: LinesFC; ends: PointsFC['features'] } {
  const lines: LinesFC = { type: 'FeatureCollection', features: [] };
  const ends: PointsFC['features'] = [];
  for (const j of journeys) {
    if (!j) continue;
    for (const leg of j.legs) {
      if (leg.kind === 'wait' || leg.path.length < 2) continue;
      lines.features.push({ type: 'Feature', properties: { kind: leg.kind }, geometry: { type: 'LineString', coordinates: leg.path } });
    }
    const first = j.legs[0]?.path[0];
    const last = j.legs.at(-1)?.path.at(-1);
    for (const c of [first, last]) if (c) ends.push({ type: 'Feature', properties: { kind: 'end' }, geometry: { type: 'Point', coordinates: c } });
  }
  return { lines, ends };
}

/** The Riders view's lines: every segment with its riders per day, peak-hour riders and load factor. */
export function loadFeatures(report: LoadReport | null): LinesFC {
  if (!report) return EMPTY_LINES;
  return {
    type: 'FeatureCollection',
    features: report.segments.map((x) => ({ type: 'Feature' as const, properties: { load: Math.round(x.daily), peak: Math.round(x.peakHour),
      lf: Math.round(x.lf * 100) / 100 }, geometry: { type: 'LineString' as const, coordinates: x.coords } })),
  };
}
