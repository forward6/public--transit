// Which trips run today. The network has one representative weekday timetable; Saturdays and
// Sundays (and public holidays) run a thinner version of it.
import type { Playback, VehicleState } from '@otc/sim';
import { addDays, serviceDay } from '@otc/sim';
import { SERVICE_DAY_START } from './clock';

export type ServiceDay = ReturnType<typeof serviceDay> | 'none';

/** share of weekday trips that run */
const SHARE: Record<ServiceDay, number> = { weekday: 1, saturday: 0.6, sunday: 0.45, none: 0 };

/** A stable hash of the trip id in [0, 1): the same trips run every Saturday. */
function tripHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export function tripRuns(tripId: string, day: ServiceDay): boolean {
  return day === 'weekday' || tripHash(tripId) < SHARE[day];
}

/** The service day the clock is in: trips after midnight belong to the previous day's timetable. */
export function serviceDayAt(date: string, clockNow: number): ServiceDay {
  return serviceDay(clockNow < SERVICE_DAY_START ? addDays(date, -1) : date);
}

export function vehiclesNow(playback: Playback, serviceTime: number, day: ServiceDay): VehicleState[] {
  if (day === 'none') return []; // on strike
  const all = playback.vehiclesAt(serviceTime);
  return day === 'weekday' ? all : all.filter((v) => tripRuns(v.tripId, day));
}
