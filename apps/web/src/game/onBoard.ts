// Riders on board the vehicle you tap: the demand model's loads on the network in operation,
// shared out between the route's trips that run today and scaled to today's riders.
import { useCallback, useMemo } from 'react';
import type { RouteClass, Zone } from '@otc/shared';
import { SEATS, VEHICLE_CAPACITY, jobsShareAt, morningShares, patternPoints, routeRiders, type Playback, type Trip } from '@otc/sim';
import { tripRuns, type ServiceDay } from '../sim/service';
import type { OpLoads } from './useGame';

export interface OnBoard {
  /** riders on board between each pair of consecutive stops of the trip */
  riders: number[];
  seats: number;
  capacity: number;
}

/** 'measuring' while the network in operation's loads are being measured. */
export type OnBoardFn = (tripId: string) => OnBoard | 'measuring' | null;

export function useOnBoard(playback: Playback | undefined, loads: OpLoads | null, zones: Zone[] | undefined, day: ServiceDay, scale: number): OnBoardFn {
  // per pattern: the share of its commuters riding each stretch in the morning (needs only the loads)
  const scaleKey = Math.round(scale * 100) / 100;
  const morning = useMemo(() => new Map<string, number[]>(), [loads, zones]);
  // per route: riders on each of its trips today
  const routes = useMemo(() => new Map<string, (trip: Trip) => number[]>(), [playback, loads, zones, day, scaleKey]);

  return useCallback((tripId: string) => {
    if (!playback) return null;
    if (!loads) return 'measuring';
    const trip = playback.trips.find((t) => t.id === tripId);
    if (!trip) return null;
    const route = playback.routes.get(trip.routeId);
    let riders = routes.get(trip.routeId);
    if (!riders) {
      const patterns = playback.network.patterns.filter((p) => p.routeId === trip.routeId);
      // a route's riders are pooled over its patterns: a variant the model gave no riders of its own still has some
      if (!patterns.some((p) => loads.loads[p.id])) return null;
      const m: Record<string, number[]> = {};
      for (const p of patterns) {
        const pl = loads.peakLoads?.[p.id];
        if (!pl || !zones?.length) continue;
        let ms = morning.get(p.id);
        if (!ms) morning.set(p.id, (ms = morningShares(pl, jobsShareAt(patternPoints(p, (id) => playback.stops.get(id)), zones))));
        m[p.id] = ms;
      }
      riders = routeRiders({
        patterns, trips: playback.trips.filter((t) => t.routeId === trip.routeId && tripRuns(t.id, day)),
        loads: loads.loads, peakLoads: loads.peakLoads, morning: m, weekend: day !== 'weekday', scale: scaleKey,
      });
      routes.set(trip.routeId, riders);
    }
    const cls: RouteClass = route?.class ?? 'local';
    return { riders: riders(trip), seats: SEATS[cls], capacity: VEHICLE_CAPACITY[cls] };
  }, [playback, loads, zones, day, scaleKey, morning, routes]);
}

export type Crowd = 'seats' | 'fewSeats' | 'standing' | 'full';

/** How it feels on board. */
export function crowdOf(n: number, seats: number, capacity: number): Crowd {
  if (n > capacity * 1.05) return 'full';
  if (n > seats) return 'standing';
  if (n > seats * 0.7) return 'fewSeats';
  return 'seats';
}

/** What to show: estimates above capacity mean riders left behind, not a bigger bus. */
export const shownRiders = (n: number, capacity: number) => Math.max(0, Math.min(Math.round(n), Math.round(capacity * 1.1)));
