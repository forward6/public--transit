// The big-projects contract (M8): rapid-transit lines from proposal to opening day.
import type { Edit, Headways } from './plan';

export type LineMode = 'lrt' | 'busway';
/** How a stretch between two stations is built. */
export type Structure = 'surface' | 'elevated' | 'tunnel';
export type ProjectPhase = 'proposed' | 'design' | 'procurement' | 'construction' | 'testing' | 'open' | 'shelved' | 'cancelled';
/** Public build (design-bid-build: the city carries the risk) or a public-private partnership (design-build-finance-maintain). */
export type Procurement = 'public' | 'p3';

export interface LineStation {
  id: string;
  name: string;
  lon: number;
  lat: number;
  /** an existing stop or station reused, so riders can transfer */
  existing?: boolean;
}

/** What the player draws: stations in order, how each stretch is built, and how often it runs. */
export interface LineDesign {
  mode: LineMode;
  /** e.g. "Line 1" */
  name: string;
  /** the route badge, e.g. "L1" */
  shortName: string;
  color: string;
  stations: LineStation[];
  /** one per stretch between consecutive stations */
  structure: Structure[];
  headways: Headways;
}

/** 2011 dollars. */
export interface CostBreakdown {
  guideway: number;
  stations: number;
  vehicles: number;
  depot: number;
  /** engineering, project management, property */
  soft: number;
  contingency: number;
  total: number;
}

export interface ProjectEstimate {
  lengthKm: number;
  tunnelKm: number;
  elevatedKm: number;
  stations: number;
  undergroundStations: number;
  /** trains (2-car) or nothing (busway: buses come from the fleet) */
  vehicles: number;
  /** end to end, minutes */
  runMin: number;
  cost: CostBreakdown;
  /** months per phase */
  months: { design: number; procurement: number; construction: number; testing: number };
  /** operating and maintenance a year once open (busway: the corridor only; its buses are bus-hours) */
  opsPerYear: number;
}

/** The demand model's forecast for the line, on the network in operation when it was measured. */
export interface ProjectForecast {
  /** weekday boardings on the line */
  boardings: number;
  /** weekday transit trips gained across the network */
  newRiders: number;
  /** jobs within 45 min by transit, average change (%) */
  reach: number;
  /** wards with a station */
  wards: number[];
}

export interface Project {
  id: string;
  design: LineDesign;
  estimate: ProjectEstimate;
  forecast?: ProjectForecast;
  phase: ProjectPhase;
  procurement?: Procurement;
  /** when each phase began */
  dates: Partial<Record<ProjectPhase, string>>;
  /** when the current phase is due to end */
  due?: string;
  /** the approved budget (the contract once awarded), $ of the day */
  budget: number;
  /** spent so far (all partners), and the city's part of it */
  spent: number;
  citySpent: number;
  partnersSpent?: number;
  /** cost growth and delay so far */
  overrun: number;
  delayMonths: number;
  funding: { province: number; federal: number; provinceStatus: FundingStatus; federalStatus: FundingStatus; asked?: Record<string, string> };
  /** risks drawn when the contract is awarded (hidden from the player): cost growth, delay, a sinkhole, a rough opening */
  risk?: { growth: number; delay: number; sinkholeAt?: number; rough: boolean };
  /** setbacks that have happened (ids), so each comes once */
  happened: string[];
  /** the edit that puts the line into service on opening day */
  edit: Edit;
  /** bus routes running alongside the line, and what reworking them around it would do (offered on opening day) */
  rework?: { routes: { id: string; name: string; action: 'halve' | 'retire'; overlap: number }[]; edits: Edit[] };
  opened?: string;
}

export type FundingStatus = 'none' | 'committed' | 'declined';

export interface CostLine {
  value: number;
  estimate: boolean;
  source: string;
}

/**
 * Capital and operating costs, 2011 dollars. Estimates calibrated so a line like Ottawa's
 * Confederation Line (12.5 km, 2.5 km in tunnel, 13 stations) comes to about its $2.1 billion
 * budget of 2012, and a suburban Transitway extension to about $35–45M a kilometre.
 */
export const PROJECT_COSTS = {
  lrt: {
    guideway: { surface: 35e6, elevated: 90e6, tunnel: 260e6 },
    station: { surface: 12e6, elevated: 25e6, tunnel: 90e6 },
    /** a two-car train */
    train: 10e6,
    depot: 120e6,
    /** operating and maintenance a year: per route-km and per train */
    opsPerKm: 3.5e6,
    opsPerTrain: 0.6e6,
    /** cruising speed (km/h) by structure, acceleration (m/s²), dwell (s) */
    speed: { surface: 55, elevated: 80, tunnel: 80 },
    accel: 1.0,
    dwell: 30,
  },
  busway: {
    guideway: { surface: 25e6, elevated: 80e6, tunnel: 200e6 },
    station: { surface: 6e6, elevated: 15e6, tunnel: 60e6 },
    train: 0,
    depot: 0,
    opsPerKm: 0.3e6,
    opsPerTrain: 0,
    speed: { surface: 70, elevated: 80, tunnel: 70 },
    accel: 1.2,
    dwell: 30,
  },
  /** engineering, project management, property; contingency */
  softShare: 0.15,
  contingencyShare: 0.1,
  /** a P3's premium over a public build (financing, the consortium's margin and risk) */
  p3Premium: 0.07,
  /** the part of the city's share that development charges pay (new growth along the line) */
  devCharges: 0.25,
  source: 'Estimates: City of Ottawa Confederation Line budget (2012, $2.13B for 12.5 km, 2.5 km tunnel, 13 stations, 34 LRVs, a maintenance yard); Transitway extensions of the 2000s',
} as const;

/** Default service on a new line. */
export const LINE_HEADWAYS: Record<LineMode, Headways> = {
  lrt: { am: 5, midday: 6, pm: 5, evening: 10 },
  busway: { am: 5, midday: 10, pm: 5, evening: 15 },
};

/** Line colours that stand apart from the Transitway's red, the O-Train's green and the bus blues. */
export const LINE_COLORS = ['#8E44C9', '#E0457B', '#E08A1E', '#0E9C9C', '#B8860B', '#D7263D'];
