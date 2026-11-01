// Public opinion, riders' diaries and the press (M6, PLAN §4.6, §7.2, §7.6).
// The engine is in packages/sim (opinion.ts, journey.ts, diary.ts, press.ts); text is rendered by
// apps/web in English and French from the structured records below.

export type OpinionAxis = 'service' | 'value' | 'trust';
export const OPINION_AXES: OpinionAxis[] = ['service', 'value', 'trust'];

/** What moves opinion, for the "why?" drill-down. */
export type ReasonKey =
  | 'mood' // the 2010 baseline
  | 'frequency' // how long people wait for a bus where they live
  | 'reach' // jobs reachable within 45 minutes, against what people are used to
  | 'waits' // waits longer or shorter than people are used to
  | 'reliability' // trips missed for lack of buses or maintenance
  | 'crowding' // more riders per bus-hour than in 2010
  | 'weather' // cold waits and storm delays, fading over days
  | 'fares'
  | 'taxes'
  | 'cuts' // service cut to balance the budget
  | 'strike' // the memory of the 2008–09 strike, fading
  | 'events' // decisions and news: new routes, removed routes, deficits…
  | 'spillover'; // how service feels colours trust

export interface Reason {
  key: ReasonKey;
  axis: OpinionAxis;
  /** contribution to the axis, −100..100 scale */
  value: number;
}

export type ShockKind = 'newRoute' | 'routeRemoved' | 'serviceUp' | 'serviceDown' | 'promiseKept' | 'fareHike' | 'fareCut'
  | 'levyHike' | 'levyCut' | 'serviceCut' | 'deficit' | 'newBuses' | 'newGarage';

/** A citywide event that moves trust, fading over months. */
export interface TrustShock {
  date: string;
  kind: ShockKind;
  amount: number;
  /** e.g. the route's short name */
  label?: string;
}

export interface OpinionRecord {
  date: string;
  /** % of Ottawa residents approving of the Commission */
  approval: number;
  service: number;
  value: number;
  trust: number;
}

export interface OpinionState {
  version: 1;
  /** per zone, zones file order: −100..100 */
  service: number[];
  value: number[];
  trust: number[];
  /** what each zone is used to: jobs within 45 min, average wait (min); adapts over months */
  expAccess: number[];
  expWait: number[];
  /** what people are used to paying (fare index, annual levy) */
  expFare: number;
  expLevy: number;
  /** recent weather hardship, fading over ~10 days (cold waits, storm delays) */
  weather: number;
  shocks: TrustShock[];
  /** 2010 weekday boardings per bus-hour (the crowding reference) */
  crowdRef: number;
  /** what the opinion model last saw, to notice changes */
  seen: { fareIndex: number; levy: number; serviceLevel: number; applied: number; events: string[] };
  /** weekly, newest last */
  history: OpinionRecord[];
}

// ------------------------------------------------------------------------------------------ personas

export interface Place {
  lon: number;
  lat: number;
  name: string;
}

/** A fictional rider the player can follow (PLAN §4.6 starter personas). */
export interface Persona {
  id: string;
  name: string;
  age: number;
  role: { en: string; fr: string };
  home: Place;
  dest: Place;
  /** leaves home (seconds after midnight), and leaves for home */
  out: number;
  back: number;
  /** days of the week they travel (0 = Sunday) */
  days: number[];
  wheelchair?: boolean;
  /** feels the cold more (1 = typical) */
  coldSensitivity?: number;
  /** their colour on the map */
  color: string;
}

export interface TripNote {
  depart: number;
  arrive: number;
  minutes: number;
  /** minutes waiting outdoors, all stops */
  waitMin: number;
  /** °C at the first stop */
  temp: number;
  /** route short names */
  routes: string[];
  /** first stop's name */
  stop: string;
  /** minutes late because of weather */
  late: number;
  /** a scheduled bus never came (missed trip) */
  missed: boolean;
  /** a high-floor bus came and Sam couldn't board */
  highFloor: boolean;
  /** no transit trip was possible */
  none: boolean;
}

export type DiaryKind = 'great' | 'fine' | 'cold' | 'storm' | 'late' | 'missed' | 'highFloor' | 'noBus' | 'long' | 'better' | 'worse';

export interface DiaryEntry {
  date: string;
  persona: string;
  kind: DiaryKind;
  /** −2 (awful) … +2 (great) */
  mood: number;
  out?: TripNote;
  back?: TripNote;
}

// ------------------------------------------------------------------------------------------ press

export type StoryKind =
  | 'ridershipUp' | 'ridershipDown' | 'approvalUp' | 'approvalDown' | 'routeLaunched' | 'routeCut' | 'serviceBoost'
  | 'snowstorm' | 'coldSnap' | 'missedTrips' | 'fareHike' | 'levyHike' | 'deficit' | 'serviceCuts' | 'newBuses' | 'garage'
  | 'riderStory' | 'quiet';

export type Tone = 'good' | 'bad' | 'neutral';

export interface Story {
  kind: StoryKind;
  tone: Tone;
  salience: number;
  params: Record<string, string | number>;
}

/** The monthly front page of the city's (fictional) papers. */
export interface FrontPage {
  /** YYYY-MM of the month it covers */
  month: string;
  date: string;
  approval: number;
  stories: Story[];
}

export type PostKind = 'diary' | 'storm' | 'cold' | 'change' | 'riders' | 'fares' | 'taxes' | 'praise' | 'gripe';

/** A post on the (fictional) social feed. */
export interface Post {
  id: string;
  date: string;
  kind: PostKind;
  tone: Tone;
  /** a persona's id, or a generated resident */
  author: { persona?: string; name: string; place: string };
  params: Record<string, string | number>;
}
