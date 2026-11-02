// M9: growth after 2010. Each month the region adds residents and jobs, and a land-use model places
// them: where people can reach jobs (by car and by transit), where there is room to build, near
// rapid-transit stations if the land is zoned for it, and not beside a street torn up for construction.
// Developers offer to build near stations if council rezones.

/** Where growth lands, for the panel: near a rapid-transit station, in the core, on the suburban edge, in Gatineau, rural. */
export type GrowthPlace = 'station' | 'core' | 'suburbs' | 'gatineau' | 'rural';
export const GROWTH_PLACES: GrowthPlace[] = ['station', 'core', 'suburbs', 'gatineau', 'rural'];

export interface GrowthMonth {
  /** the month the growth was added in (YYYY-MM) */
  month: string;
  /** residents and jobs added (jobs net of businesses lost beside construction) */
  pop: number;
  jobs: number;
  /** residents added, by kind of place */
  where: Record<GrowthPlace, number>;
  /** jobs lost by businesses beside construction sites */
  lost: number;
  /** the zones that grew most: [zone index, residents, jobs] */
  top: [number, number, number][];
}

export type RezoningStatus = 'offered' | 'council' | 'approved' | 'refused' | 'declined';

/** A developer's offer to build near a station if council rezones the land. */
export interface Rezoning {
  id: string;
  date: string;
  /** the station it's beside, and where */
  station: string;
  lon: number;
  lat: number;
  /** the zones that get the room (zones file order) */
  zones: number[];
  homes: number;
  jobs: number;
  /** the ward councillor's ward (0: outside Ottawa) */
  ward: number;
  /** a new rapid-transit line's station (committed, under construction or open) */
  newLine?: boolean;
  status: RezoningStatus;
}

export interface GrowthState {
  /** residents and jobs added since 1 December 2010, per zone (zones file order); jobs can fall */
  pop: number[];
  jobs: number[];
  /** room council added by rezoning: zone index → [residents, jobs] */
  room: Record<number, [number, number]>;
  /** month by month */
  history: GrowthMonth[];
  /** the riders growth brings: a multiplier on 2010's weekday riders */
  riders: number;
  rezonings: Rezoning[];
  /** no developer offer before this date */
  nextOffer: string;
}

/** Residents per new home (new homes are smaller than the average household). */
export const RESIDENTS_PER_HOME = 2.1;
