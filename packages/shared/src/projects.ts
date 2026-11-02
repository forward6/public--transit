// The big-projects contract (M8): rapid-transit lines from proposal to opening day.
import type { Edit, Headways } from './plan';

export type LineMode = 'lrt' | 'busway' | 'commuter' | 'streetcar';
/** How a stretch between two stations is built (a bridge carries it over the Ottawa River). */
/** 'surface' is its own right of way (for a streetcar, its own lane); 'street' runs in traffic (streetcars). */
export type Structure = 'surface' | 'street' | 'elevated' | 'tunnel' | 'bridge';
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
  /** per stretch: the share that runs along an existing railway (commuter rail upgrades it instead of laying track) */
  onRail?: number[];
  /** per stretch: it crosses the Ottawa River between Ottawa and Gatineau */
  crosses?: boolean[];
  /** per stretch: the path along the streets (streetcars follow them; other lines run straight between stations) */
  paths?: [number, number][][];
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
  /** km along existing railway (upgraded), km over the river */
  railKm: number;
  bridgeKm: number;
  /** it crosses the Ottawa River (Quebec, the STO and the NCC have a say) */
  crossing: boolean;
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
  funding: {
    province: number; federal: number; provinceStatus: FundingStatus; federalStatus: FundingStatus;
    /** a river crossing: Quebec pays a share if Gatineau and the STO sign on */
    quebec?: number; quebecStatus?: FundingStatus;
    asked?: Record<string, string>;
  };
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
    guideway: { surface: 35e6, street: 30e6, elevated: 90e6, tunnel: 260e6, bridge: 150e6 },
    station: { surface: 12e6, street: 3e6, elevated: 25e6, tunnel: 90e6, bridge: 25e6 },
    /** along an existing railway: not shared with freight, so no saving */
    railUpgrade: 35e6,
    /** a two-car train */
    train: 10e6,
    depot: 120e6,
    /** operating and maintenance a year: per route-km and per train */
    opsPerKm: 3.5e6,
    opsPerTrain: 0.6e6,
    /** cruising speed (km/h) by structure, acceleration (m/s²), dwell (s) */
    speed: { surface: 55, street: 25, elevated: 80, tunnel: 80, bridge: 70 },
    accel: 1.0,
    dwell: 30,
  },
  busway: {
    guideway: { surface: 25e6, street: 2e6, elevated: 80e6, tunnel: 200e6, bridge: 120e6 },
    station: { surface: 6e6, street: 0.5e6, elevated: 15e6, tunnel: 60e6, bridge: 15e6 },
    railUpgrade: 25e6,
    train: 0,
    depot: 0,
    opsPerKm: 0.3e6,
    opsPerTrain: 0,
    speed: { surface: 70, street: 25, elevated: 80, tunnel: 70, bridge: 70 },
    accel: 1.2,
    dwell: 30,
  },
  /** diesel commuter trains (a locomotive and four bi-level coaches) on existing railways where they can */
  commuter: {
    guideway: { surface: 18e6, street: 30e6, elevated: 60e6, tunnel: 200e6, bridge: 120e6 },
    station: { surface: 8e6, street: 3e6, elevated: 20e6, tunnel: 60e6, bridge: 20e6 },
    /** upgrading an existing railway: signals, sidings, crossings; an old rail bridge rehabilitated */
    railUpgrade: 4e6,
    train: 25e6,
    depot: 50e6,
    opsPerKm: 0.8e6,
    opsPerTrain: 2.5e6,
    speed: { surface: 110, street: 25, elevated: 110, tunnel: 90, bridge: 80 },
    accel: 0.6,
    dwell: 45,
  },
  /**
   * A modern streetcar (a 30-metre, 150-place car) along the streets: in traffic, or in its own lane
   * (curb or median, with signal priority). Track in a street means moving the utilities under it.
   * Stops are platforms at the curb, every 400 m or so.
   */
  streetcar: {
    guideway: { surface: 20e6, street: 14e6, elevated: 80e6, tunnel: 220e6, bridge: 120e6 },
    station: { surface: 1.5e6, street: 0.8e6, elevated: 15e6, tunnel: 60e6, bridge: 10e6 },
    railUpgrade: 20e6,
    train: 4.5e6,
    depot: 25e6,
    opsPerKm: 1.2e6,
    opsPerTrain: 0.4e6,
    speed: { surface: 35, street: 22, elevated: 60, tunnel: 60, bridge: 40 },
    accel: 1.0,
    dwell: 20,
  },
  /** traffic lights and traffic: seconds lost a km in traffic, and in its own lane with signal priority */
  trafficDelay: { street: 30, lane: 10 },
  /** rehabilitating an existing rail bridge (the Prince of Wales Bridge), a km */
  railBridgeRehab: 60e6,
  /** engineering, project management, property; contingency */
  softShare: 0.15,
  contingencyShare: 0.1,
  /** a P3's premium over a public build (financing, the consortium's margin and risk) */
  p3Premium: 0.07,
  /** the part of the city's share that development charges pay (new growth along the line) */
  devCharges: 0.25,
  /**
   * Timelines run at this fraction of real ones (your choice: compressed), so a downtown light-rail
   * line proposed in 2011 opens within the first term.
   */
  pace: 0.42,
  source: 'Estimates: City of Ottawa Confederation Line budget (2012, $2.13B for 12.5 km, 2.5 km tunnel, 13 stations, 34 LRVs, a maintenance yard); Transitway extensions of the 2000s; modern North American streetcars of the 2010s (about $25–40M a km with utilities, cars about $5M)',
} as const;

/** Default service on a new line. */
export const LINE_HEADWAYS: Record<LineMode, Headways> = {
  lrt: { am: 5, midday: 6, pm: 5, evening: 10 },
  busway: { am: 5, midday: 10, pm: 5, evening: 15 },
  commuter: { am: 20, midday: 60, pm: 20, evening: 60 },
  streetcar: { am: 8, midday: 10, pm: 8, evening: 15 },
};

/** Line colours that stand apart from the Transitway's red, the O-Train's green and the bus blues. */
export const LINE_COLORS = ['#8E44C9', '#E0457B', '#E08A1E', '#0E9C9C', '#B8860B', '#D7263D'];
