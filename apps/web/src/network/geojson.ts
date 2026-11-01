import type { FeatureCollection, LineString, Point } from 'geojson';
import type { DemandFile, Network, RouteClass, ZonesFile } from '@otc/shared';
import { prepareLine, sliceLine, type Playback, type VehicleState } from '@otc/sim';

export type LinesFC = FeatureCollection<LineString>;
export type PointsFC = FeatureCollection<Point>;

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
        properties: { kind: 'corridor', corridor: c.kind, id: c.id, name: c.name },
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
    points.push({
      type: 'Feature',
      properties: { trip: v.tripId, route: v.routeId, cls, bearing: v.bearing, dwelling: v.dwelling },
      geometry: { type: 'Point', coordinates: v.lonlat },
    });
    const trail = playback.trail(v, TRAIL_M[r?.mode ?? 'bus'] ?? 180);
    if (trail.length >= 2 && !v.dwelling) {
      trails.push({ type: 'Feature', properties: { cls }, geometry: { type: 'LineString', coordinates: trail } });
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
