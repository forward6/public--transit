// The demand contract (M3): zones written by pipeline/ (`zones` step), demand results written by
// packages/sim (scripts/demand.ts), both read by apps/web.
// Serialised as apps/web/public/data/zones-2011.json (+ car-2011.bin) and demand-2011.json.

export type District = 'downtown' | 'inner' | 'suburbs' | 'rural' | 'hull' | 'gatineau';

/** Population segments: group × whether the household has a car. */
export const SEGMENTS = ['worker_car', 'worker_nocar', 'post_car', 'post_nocar', 'school_car', 'school_nocar',
  'other_car', 'other_nocar'] as const;
export type Segment = (typeof SEGMENTS)[number];

export interface Zone {
  id: number;
  /** H3 cell (resolution 8, or 7 where activity is sparse) */
  cell: string;
  /** activity-weighted centroid */
  lon: number;
  lat: number;
  areaKm2: number;
  /** outline of the zone's H3 cell (lon/lat), for maps */
  ring?: [number, number][];
  city: 'ottawa' | 'gatineau';
  district: District;
  downtown: boolean;
  pop: number;
  seg: Record<Segment, number>;
  jobs: { office?: number; retail?: number; institutional?: number; industrial?: number };
  enrol: { post: number; school: number };
}

export interface ZonesFile {
  version: 1;
  year: number;
  generated: string;
  note: string;
  carSkim: { file: string; format: string };
  zones: Zone[];
}

export type TravelMode = 'car' | 'passenger' | 'transit' | 'walk' | 'bike';
export const MODES: TravelMode[] = ['car', 'passenger', 'transit', 'walk', 'bike'];

export interface CalibrationRow {
  id: string;
  label: string;
  target: number;
  tolerance: number;
  model: number;
  /** |model − target| ≤ tolerance (tolerance is absolute for shares, relative for counts) */
  pass: boolean;
  relative: boolean;
  estimate: boolean;
  source: string;
}

export interface DemandFile {
  version: 1;
  year: number;
  generated: string;
  note: string;
  /** weekday totals */
  summary: {
    residents: number;
    trips: number;
    tripsByMode: Record<TravelMode, number>;
    transitTrips: number;
    boardings: number;
    boardingsByAgency: Record<string, number>;
    /** average transit trip: minutes in vehicle, waiting, walking; boardings per trip */
    transitTrip: { ivtMin: number; waitMin: number; walkMin: number; boardingsPerTrip: number };
  };
  calibration: CalibrationRow[];
  /** weekday boardings per route id */
  routes: Record<string, number>;
  /** weekday boardings per stop id */
  stops: Record<string, number>;
  /** weekday riders on board between consecutive stops, per pattern id */
  loads: Record<string, number[]>;
  /** per zone id: [weekday trips made by residents, transit share of them] */
  zones: Record<string, [number, number]>;
  /** per home district: [weekday trips made by residents, transit share of them] */
  districts: Record<string, [number, number]>;
  /** the calibrated model parameters (packages/sim DemandParams), so the game can re-run the model */
  params?: Record<string, unknown>;
}
