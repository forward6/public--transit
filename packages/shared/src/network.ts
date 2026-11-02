// The transit-network contract: written by pipeline/ (network step, GTFS import),
// read by packages/sim (timetables, playback) and apps/web (map layers, inspectors).
// Serialised as apps/web/public/data/network-2010.json.

export type AgencyId = 'octranspo' | 'sto';
export type Mode = 'bus' | 'brt' | 'rail';
/** Visual / planning class; drives colour and line weight (VISUAL_DESIGN §3). */
export type RouteClass = 'transitway' | 'otrain' | 'frequent' | 'local' | 'peak' | 'rural' | 'sto' | 'commuter';
export type Confidence = 'high' | 'medium' | 'low';

/** Where a piece of network data came from, and how sure we are. */
export interface Provenance {
  source: string;
  confidence: Confidence;
  /** checked against a primary 2010 source (timetable, GTFS, archived map) */
  verified: boolean;
  note?: string;
}

export type LonLat = [number, number];

export interface NetStop {
  id: string;
  name: string;
  name_fr?: string;
  lon: number;
  lat: number;
  kind: 'station' | 'stop';
  agencies: AgencyId[];
  provenance?: Provenance;
}

/** Physical right-of-way that exists independently of any route (e.g. the Transitway). */
export interface Corridor {
  id: string;
  name: string;
  kind: 'busway' | 'rail';
  agency: AgencyId;
  lines: LonLat[][];
  /** a line's own colour (new rapid-transit lines, M8) */
  color?: string;
  provenance: Provenance;
}

export interface NetPattern {
  id: string;
  routeId: string;
  direction: 0 | 1;
  headsign: string;
  stops: string[];
  /** metres along `shape` at each stop */
  stopDist: number[];
  shape: LonLat[];
  /** AM-peak running time between consecutive stops, seconds (length = stops.length - 1) */
  runTimes: number[];
  /** dwell at each stop, seconds */
  dwell: number[];
}

/** Clock times are "HH:MM", may exceed 24:00 for after-midnight service. */
export interface ServicePeriod {
  from: string;
  to: string;
  headwayMin: number;
}

export interface NetRoute {
  id: string;
  agency: AgencyId;
  shortName: string;
  longName: string;
  longName_fr?: string;
  mode: Mode;
  class: RouteClass;
  color: string;
  patterns: string[];
  /** frequency-based service for a representative weekday */
  weekday?: ServicePeriod[];
  /** explicit departures (seconds after midnight) per pattern, e.g. from GTFS; overrides `weekday` */
  departures?: Record<string, number[]>;
  /** multiply AM-peak run times by this outside the peaks (default 0.92) */
  offPeakFactor?: number;
  provenance: Provenance;
}

export type NetworkStatus = 'infrastructure-only' | 'archive-reconstruction' | 'gtfs';

/** Fare/service class of a route in the 2010 route tables. */
export type CatalogueClass =
  | 'regular' | 'peak' | 'express' | 'event' | 'rural' | 'school' | 'early' | 'interzone' | 'partner';

/** One route as listed in a dated 2010 source, whether or not it is mapped yet. */
export interface CatalogueEntry {
  agency: AgencyId;
  number: string;
  class: CatalogueClass;
  termini: string[];
  /** URL of the dated source revision */
  source: string;
  mapped: boolean;
  routeId: string | null;
}

export interface Network {
  version: 1;
  snapshot: string;
  generated: string;
  status: NetworkStatus;
  /** human-readable explanation of what is and isn't included yet */
  statusNote: string;
  corridors: Corridor[];
  stops: NetStop[];
  routes: NetRoute[];
  patterns: NetPattern[];
  /** every 2010 route from the dated sources, with whether it is mapped (optional) */
  catalogue?: CatalogueEntry[];
}

export function parseClock(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 3600 + (m ?? 0) * 60;
}

export function formatClock(seconds: number, withSeconds = false): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600) % 24;
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const hm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return withSeconds ? `${hm}:${String(sec).padStart(2, '0')}` : hm;
}
