import type { FeatureCollection, LineString, Point } from 'geojson';
import type { Network, RouteClass } from '@otc/shared';
import type { Playback, VehicleState } from '@otc/sim';

export type LinesFC = FeatureCollection<LineString>;
export type PointsFC = FeatureCollection<Point>;

export const EMPTY_POINTS: PointsFC = { type: 'FeatureCollection', features: [] };
export const EMPTY_LINES: LinesFC = { type: 'FeatureCollection', features: [] };

/** Corridors (infrastructure) and route patterns (one direction each) as map lines. */
export function networkLines(network: Network): LinesFC {
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
    features.push({
      type: 'Feature',
      properties: { kind: 'route', id: r.id, cls: r.class, mode: r.mode, name: r.shortName },
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
