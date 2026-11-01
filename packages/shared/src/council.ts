// Council, elections and partners (M7, PLAN §7.1, §7.3–7.5). Councillors, the mayor, the union and
// the partners' people are fictional; wards, agencies and governments are real places and bodies.
import type { Edit } from './plan';

/** A ward of the 2006–2014 boundaries (approximated in the game from these centres; see sim/wards.ts). */
export interface WardInfo {
  id: number;
  name: { en: string; fr: string };
  /** a point near the ward's population centre */
  seed: [number, number];
  rural?: boolean;
}

export const WARDS_2010: WardInfo[] = [
  { id: 1, name: { en: 'Orléans', fr: 'Orléans' }, seed: [-75.505, 45.47] },
  { id: 2, name: { en: 'Innes', fr: 'Innes' }, seed: [-75.565, 45.452] },
  { id: 3, name: { en: 'Barrhaven', fr: 'Barrhaven' }, seed: [-75.745, 45.272] },
  { id: 4, name: { en: 'Kanata North', fr: 'Kanata-Nord' }, seed: [-75.905, 45.338] },
  { id: 5, name: { en: 'West Carleton-March', fr: 'West Carleton-March' }, seed: [-76.1, 45.4], rural: true },
  { id: 6, name: { en: 'Stittsville-Kanata West', fr: 'Stittsville-Kanata-Ouest' }, seed: [-75.925, 45.262] },
  { id: 7, name: { en: 'Bay', fr: 'Baie' }, seed: [-75.8, 45.357] },
  { id: 8, name: { en: 'College', fr: 'Collège' }, seed: [-75.768, 45.33] },
  { id: 9, name: { en: 'Knoxdale-Merivale', fr: 'Knoxdale-Merivale' }, seed: [-75.735, 45.338] },
  { id: 10, name: { en: 'Gloucester-Southgate', fr: 'Gloucester-Southgate' }, seed: [-75.625, 45.355] },
  { id: 11, name: { en: 'Beacon Hill-Cyrville', fr: 'Beacon Hill-Cyrville' }, seed: [-75.6, 45.437] },
  { id: 12, name: { en: 'Rideau-Vanier', fr: 'Rideau-Vanier' }, seed: [-75.678, 45.432] },
  { id: 13, name: { en: 'Rideau-Rockcliffe', fr: 'Rideau-Rockcliffe' }, seed: [-75.645, 45.443] },
  { id: 14, name: { en: 'Somerset', fr: 'Somerset' }, seed: [-75.704, 45.413] },
  { id: 15, name: { en: 'Kitchissippi', fr: 'Kitchissippi' }, seed: [-75.745, 45.396] },
  { id: 16, name: { en: 'River', fr: 'Rivière' }, seed: [-75.705, 45.365] },
  { id: 17, name: { en: 'Capital', fr: 'Capitale' }, seed: [-75.683, 45.397] },
  { id: 18, name: { en: 'Alta Vista', fr: 'Alta Vista' }, seed: [-75.655, 45.386] },
  { id: 19, name: { en: 'Cumberland', fr: 'Cumberland' }, seed: [-75.45, 45.455], rural: true },
  { id: 20, name: { en: 'Osgoode', fr: 'Osgoode' }, seed: [-75.56, 45.2], rural: true },
  { id: 21, name: { en: 'Rideau-Goulbourn', fr: 'Rideau-Goulbourn' }, seed: [-75.82, 45.17], rural: true },
  { id: 22, name: { en: 'Gloucester-South Nepean', fr: 'Gloucester-Nepean-Sud' }, seed: [-75.695, 45.286] },
  { id: 23, name: { en: 'Kanata South', fr: 'Kanata-Sud' }, seed: [-75.875, 45.293] },
];

export type Platform = 'transit' | 'lowTax' | 'rural' | 'centre';

/** A councillor (or the mayor, ward 0). Attitudes run −1..1. */
export interface Councillor {
  id: string;
  ward: number;
  name: string;
  /** −1 spend for better services … +1 hold the line on taxes and debt */
  fiscal: number;
  /** −1 roads first … +1 transit first */
  transit: number;
  /** how much their ward's mood moves them (0..1) */
  responsiveness: number;
  /** with you, the Chair: −50..50 */
  relationship: number;
  platform: Platform;
  since: number;
}

/** The council that took office on 1 December 2010: split, as the term begins. Fictional people. */
export const COUNCIL_2010: Councillor[] = [
  { id: 'mayor', ward: 0, name: 'Catherine Delorme', fiscal: 0.4, transit: 0.3, responsiveness: 0.5, relationship: 5, platform: 'centre', since: 2010 },
  { id: 'w1', ward: 1, name: 'Denis Lafrenière', fiscal: 0.3, transit: 0.2, responsiveness: 0.6, relationship: 0, platform: 'centre', since: 2006 },
  { id: 'w2', ward: 2, name: 'Karen Holloway', fiscal: 0, transit: 0.5, responsiveness: 0.6, relationship: 8, platform: 'transit', since: 2010 },
  { id: 'w3', ward: 3, name: 'Grant MacPherson', fiscal: 0.6, transit: 0.1, responsiveness: 0.5, relationship: -5, platform: 'lowTax', since: 2003 },
  { id: 'w4', ward: 4, name: 'Priyanka Dhillon', fiscal: 0.2, transit: 0.3, responsiveness: 0.6, relationship: 3, platform: 'centre', since: 2006 },
  { id: 'w5', ward: 5, name: 'Ed Brennan', fiscal: 0.7, transit: -0.5, responsiveness: 0.7, relationship: -10, platform: 'rural', since: 1997 },
  { id: 'w6', ward: 6, name: 'Shauna Kerr', fiscal: 0.5, transit: -0.1, responsiveness: 0.5, relationship: -3, platform: 'lowTax', since: 2006 },
  { id: 'w7', ward: 7, name: 'Marianne Côté', fiscal: -0.1, transit: 0.4, responsiveness: 0.5, relationship: 6, platform: 'transit', since: 2010 },
  { id: 'w8', ward: 8, name: 'Gord Delaney', fiscal: 0.5, transit: 0, responsiveness: 0.4, relationship: -4, platform: 'lowTax', since: 1997 },
  { id: 'w9', ward: 9, name: 'Andrew Tsang', fiscal: 0.2, transit: 0.2, responsiveness: 0.6, relationship: 0, platform: 'centre', since: 2010 },
  { id: 'w10', ward: 10, name: 'Hamid Rahimi', fiscal: 0, transit: 0.4, responsiveness: 0.6, relationship: 5, platform: 'transit', since: 2006 },
  { id: 'w11', ward: 11, name: 'Paul Gagnon', fiscal: 0.1, transit: 0.1, responsiveness: 0.6, relationship: 0, platform: 'centre', since: 2010 },
  { id: 'w12', ward: 12, name: 'Étienne Ouellette', fiscal: -0.6, transit: 0.8, responsiveness: 0.5, relationship: 10, platform: 'transit', since: 2010 },
  { id: 'w13', ward: 13, name: 'Hélène Desrochers', fiscal: -0.2, transit: 0.5, responsiveness: 0.5, relationship: 6, platform: 'transit', since: 2006 },
  { id: 'w14', ward: 14, name: 'Leah Goldberg', fiscal: -0.8, transit: 0.9, responsiveness: 0.4, relationship: 12, platform: 'transit', since: 1991 },
  { id: 'w15', ward: 15, name: 'Owen Fairbairn', fiscal: -0.4, transit: 0.7, responsiveness: 0.5, relationship: 8, platform: 'transit', since: 2010 },
  { id: 'w16', ward: 16, name: 'Margaret O’Neill', fiscal: 0.3, transit: 0.3, responsiveness: 0.5, relationship: 0, platform: 'centre', since: 2000 },
  { id: 'w17', ward: 17, name: 'Jonathan Pryce', fiscal: -0.5, transit: 0.8, responsiveness: 0.4, relationship: 9, platform: 'transit', since: 2010 },
  { id: 'w18', ward: 18, name: 'Martin Kowalczyk', fiscal: 0.4, transit: 0.2, responsiveness: 0.5, relationship: -2, platform: 'centre', since: 2003 },
  { id: 'w19', ward: 19, name: 'Louise Beauchamp', fiscal: 0.5, transit: 0, responsiveness: 0.6, relationship: -3, platform: 'lowTax', since: 2010 },
  { id: 'w20', ward: 20, name: 'Wayne Ferguson', fiscal: 0.8, transit: -0.6, responsiveness: 0.7, relationship: -12, platform: 'rural', since: 1997 },
  { id: 'w21', ward: 21, name: 'Bill Thornton', fiscal: 0.7, transit: -0.4, responsiveness: 0.7, relationship: -8, platform: 'rural', since: 2003 },
  { id: 'w22', ward: 22, name: 'Sanjay Mehta', fiscal: 0.3, transit: 0.3, responsiveness: 0.6, relationship: 2, platform: 'centre', since: 2006 },
  { id: 'w23', ward: 23, name: 'Allison Burke', fiscal: 0.4, transit: 0.1, responsiveness: 0.6, relationship: -1, platform: 'centre', since: 2006 },
];

/** The councillors on the Transit Commission with you (the Chair votes yes). */
export const COMMISSION_2010 = ['w2', 'w3', 'w4', 'w8', 'w10', 'w14', 'w15', 'w16'];

export const TERM = {
  start: '2010-12-01',
  /** Gatineau's municipal election (STO's board changes with it) */
  gatineauElection: '2013-11-03',
  /** Ottawa's municipal election; the new council takes office on 1 December */
  ottawaElection: '2014-10-27',
  nextGatineau: '2017-11-05',
  nextOttawa: '2018-10-22',
};

/** Decisions that go to a vote (only the big items; frequencies are staff decisions). */
export type ItemKind = 'budget' | 'plan' | 'garage' | 'order' | 'deficitLevy' | 'deficitCut' | 'deficitBorrow' | 'restoreRoute' | 'labourDeal';

export type Vote = 'yes' | 'no';

/** Why a councillor leans as they do (the whip count's reason). */
export type WhipReason = 'taxes' | 'fares' | 'service' | 'cost' | 'debt' | 'wardGain' | 'wardLoss' | 'wardHappy' | 'wardUnhappy' | 'ally' | 'rival'
  | 'mayor' | 'lobbied' | 'consulted' | 'study' | 'status' | 'rural' | 'labour';

export interface ItemEffects {
  /** levy change (%), fare change (%) */
  taxes?: number;
  fares?: number;
  /** citywide service change (% of bus-hours) */
  service?: number;
  /** capital and borrowing ($M) */
  capital?: number;
  debt?: number;
  /** per ward (by id): change in jobs within reach (%), and routes removed or added there */
  wards?: Record<number, { access: number; removed: string[]; added: string[] }>;
  /** a wage settlement (% a year) */
  wage?: number;
}

export interface AgendaItem {
  id: string;
  kind: ItemKind;
  /** the Commission (plans) or council */
  body: 'commission' | 'council';
  tabled: string;
  /** when it comes to a vote (consultations and studies push it back) */
  due: string;
  status: 'open' | 'waiting' | 'passed' | 'failed' | 'withdrawn';
  /** the Chair's proposal, or a motion against the Chair */
  byChair: boolean;
  /** what it does if it passes: kind-specific */
  payload: {
    budgetEvent?: string;
    levyChange?: number;
    fareChange?: number;
    maintenance?: number;
    edits?: Edit[];
    deficitEvent?: string;
    busType?: string;
    count?: number;
    routeId?: string;
    routeName?: string;
    wage?: number;
    scheduling?: 'keep' | 'reform';
    years?: number;
  };
  effects: ItemEffects;
  /** staff are still measuring a plan (no whip count yet) */
  measuring?: boolean;
  lobbied: string[];
  consulted?: boolean;
  studied?: boolean;
  amended?: boolean;
  votes?: Record<string, Vote>;
  result?: { yes: number; no: number };
}

export interface ElectionResult {
  ward: number;
  incumbent: string;
  winner: string;
  held: boolean;
  share: number;
  platform: Platform;
}

export interface ElectionRecord {
  city: 'ottawa' | 'gatineau';
  date: string;
  approval: number;
  wards: ElectionResult[];
  mayor?: ElectionResult;
  /** councillors leaning your way (transit over taxes, or friendly) before and after */
  allies: [number, number];
  /** Gatineau: the STO board's new stance */
  sto?: StoAgenda;
}

export type StoAgenda = 'integration' | 'rapibus' | 'taxFreeze';

export interface LabourState {
  /** wage increase a year (%) and when the contract ends */
  wage: number;
  until: string;
  scheduling: 'kept' | 'reformed';
  /** talks under way: the round and the union's demands */
  talks?: { round: number; demand: number; opened: string };
  /** the next round of talks */
  nextTalks?: string;
  /** your last offer (%) */
  offer?: number;
  /** a strike is called from this date */
  strikeFrom?: string;
  /** on strike since */
  strike?: string;
  nextStrikeCheck?: string;
  /** a settlement on its way (arbitration, or meeting the demand) */
  settle?: { date: string; wage: number };
}

export interface FundingOffer {
  id: 'provincialBuses' | 'federalGarage';
  status: 'offered' | 'accepted' | 'declined' | 'clawedBack' | 'done';
  until: string;
  /** grants received so far ($) */
  received: number;
}

export interface CouncilState {
  version: 1;
  councillors: Councillor[];
  commission: string[];
  /** Political Capital, 0..100 */
  capital: number;
  items: AgendaItem[];
  /** council directions you must carry out: restore a route at the next service change */
  directions: { date: string; routeId: string; routeName: string; done?: string }[];
  sto: { agenda: StoAgenda; relationship: number; next: string; agreements: string[]; unilateral?: string };
  funding: FundingOffer[];
  labour: LabourState;
  elections: ElectionRecord[];
  /** weekly Political Capital, for the chart */
  history: { date: string; capital: number }[];
  /** what the council engine last saw (to notice deliveries, garages, plans delivered) */
  seen: { events: string[]; applied: number; garages: number };
  /** routes you removed, the wards they served, and whether a motion came of it */
  removals?: { routeId: string; routeName: string; date: string; wards: number[]; motion?: boolean }[];
  mayorCooled?: string;
  reshuffled?: string;
}

/** The union and the 2011 talks (fictional local; real history: the 2008–09 strike). */
export const LABOUR_2010 = {
  union: { en: 'Transit Workers’ Union, Local 613', fr: 'Syndicat des travailleurs du transport, section locale 613' },
  contractEnds: '2011-03-31',
  talksOpen: '2011-02-01',
  demand: 2.9,
  /** share of operating costs that is wages */
  wageShare: 0.65,
  /** the baseline wage growth already in the inflation estimate (%) */
  baseline: 2.5,
  source: 'Estimates: the union, its demands and the strike risk are fictional; the 2008–09 strike is real history.',
};

export const STO_2010 = { agenda: 'integration' as StoAgenda, relationship: 5, firstProposal: '2011-05-02' };
