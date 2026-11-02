// The planning contract (M4): the edits a player makes to the 2010 network, saved as a draft.
import type { Corridor, NetPattern, NetRoute, NetStop } from './network';

/** The service periods the planner edits (weekday). */
export const PLAN_PERIODS = [
  { id: 'am', from: '06:30', to: '09:00' },
  { id: 'midday', from: '09:00', to: '15:00' },
  { id: 'pm', from: '15:00', to: '18:30' },
  { id: 'evening', from: '18:30', to: '24:00' },
] as const;
export type PlanPeriodId = (typeof PLAN_PERIODS)[number]['id'];

/** Minutes between buses in each period; 0 = no service in that period. */
export type Headways = Record<PlanPeriodId, number>;

/** The headways a stepper moves through (frequent → rare), then "none". */
export const HEADWAY_STEPS = [5, 6, 7.5, 10, 12, 15, 20, 30, 60, 0] as const;

export type Edit =
  /** run a route at these headways (its busiest pattern each way; timetable generated) */
  | { kind: 'service'; routeId: string; headways: Headways }
  /** take a route out of service */
  | { kind: 'remove'; routeId: string }
  /** a new route drawn by the player, with its patterns and any new stops */
  | { kind: 'add'; route: NetRoute; patterns: NetPattern[]; stops: NetStop[]; corridor?: Corridor };

export interface PlanDraft {
  version: 1;
  edits: Edit[];
}
