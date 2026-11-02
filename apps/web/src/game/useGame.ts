import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PERSONAS, type BusType, type Edit, type GameEvent, type GameState, type LineDesign, type PendingFigures, type Procurement, type ProjectForecast, type ZoneLos } from '@otc/shared';
import {
  ORDER_VOTE_THRESHOLD, acknowledge, amend as amendItem, answerFunding, answerSto, assignWards, callVote as callVoteOn, delayFor, isBigPlan,
  lobby as lobbyOn, negotiate as negotiateOn, planEffects, proposeBudget, proposeDeficit, proposeGarage, proposeOrder, proposePlan, setPlanEffects,
  strikeChoice as strikeChoiceOn, withdraw as withdrawItem, type CouncilWorld,
  answerOverrun as answerOverrunOn, askAgain as askAgainOn, cancelProject as cancelProjectOn, chooseProcurement as chooseProcurementOn,
  openingDay as openingDayOn, proposeProject, reviveProject as reviveProjectOn,
  JourneyPlanner, Playback, agencyOnly, applyEdits, buildGarage, dismissEvent, newGame, openDecision, orderBuses, resolve, schedulePlan,
  serviceStats, setLevers, setPendingFigures, setService, stepDay, updateRoutines, withOpinion, type GameWorld, type PersonaTrips,
  type Resolution, type Scorecard,
} from '@otc/sim';
import type { NetworkState } from '../network/useNetwork';
import type { Clock } from '../sim/clock';

const STORE_KEY = 'otc.game.v1';
const EMPTY_WORLD: GameWorld = { zones: [], baseLos: { access: [], wait: [] }, share: [] };

export function loadGame(): GameState | null {
  try {
    const g = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as GameState | null;
    return g?.version === 1 ? g : null;
  } catch {
    return null;
  }
}

/** Score `edits` on top of `baseEdits` (the network in operation) with the demand model, off the main thread. */
export type Measure = (baseEdits: Edit[], edits: Edit[]) => Promise<{ baseline: Scorecard; plan: Scorecard }>;

export interface GameApi {
  state: GameState | null;
  /** the 2010 network with every plan that has taken effect */
  operation: NetworkState | null;
  decision: GameEvent | undefined;
  /** news to show briefly (deliveries, service changes…) */
  news: GameEvent[];
  resolve: (r: Resolution) => void;
  dismiss: (id: string) => void;
  orderBuses: (type: BusType, count: number) => void;
  buildGarage: () => void;
  setLevers: (l: Partial<{ maintenance: number; fareIndex: number }>) => void;
  schedule: (edits: Edit[]) => void;
  unschedule: () => void;
  restart: () => void;
  /** the demand model is measuring a plan (scheduled, or just put into operation) */
  measuring: boolean;
  /** M6: what the opinion model and the diaries need (null until the data is loaded) */
  world: GameWorld | null;
  /** riders per segment on the network in operation (null until measured; see requestLoads) */
  loads: OpLoads | null;
  requestLoads: () => void;
  /** M7: the council's world (wards), and what you can do in council, at the table and with partners */
  councilWorld: CouncilWorld | null;
  lobby: (itemId: string, councillorId: string) => void;
  delay: (itemId: string, how: 'consult' | 'study') => void;
  amend: (itemId: string) => void;
  withdraw: (itemId: string) => void;
  callVote: (itemId: string) => void;
  negotiate: (offer: { wage: number; scheduling: 'keep' | 'reform'; years: number }) => void;
  strikeChoice: (c: 'meet' | 'arbitration' | 'holdOut') => void;
  answerSto: (accept: boolean) => void;
  answerFunding: (accept: boolean) => void;
  acknowledge: (eventId: string) => void;
  /** M8: rapid-transit lines */
  proposeLine: (design: LineDesign, forecast?: ProjectForecast) => void;
  chooseProcurement: (projectId: string, how: Procurement) => void;
  answerOverrun: (projectId: string, choice: 'pay' | 'trim' | 'pause') => void;
  openingDay: (eventId: string, rework: boolean) => void;
  cancelProject: (projectId: string) => void;
  reviveProject: (projectId: string) => void;
  askAgain: (projectId: string, gov: 'province' | 'federal') => void;
}

/** The assignment's loads for one network, and the model's OC Transpo weekday boardings on it (to scale by). */
export interface OpLoads {
  loads: Record<string, number[]>;
  peakLoads?: Record<string, number[]>;
  byStop: Record<string, number>;
  oc: number;
}

const loadsOf = (sc: Scorecard): OpLoads | null => (sc.loads ? { loads: sc.loads, peakLoads: sc.peakLoads, byStop: sc.byStop ?? {},
  oc: sc.byAgency.octranspo ?? 0 } : null);

/** A zone's level of service once `plan` runs, from the current one and the model's before/after. */
function losAfter(cur: ZoneLos | undefined, baseline: Scorecard, plan: Scorecard): ZoneLos | undefined {
  const [bA, pA, bW, pW] = [baseline.zoneAccess, plan.zoneAccess, baseline.zoneWait, plan.zoneWait];
  if (!cur || !bA || !pA || !bW || !pW) return undefined;
  return {
    access: cur.access.map((a, i) => Math.round((a * (pA[i]! + 1)) / (bA[i]! + 1))),
    wait: cur.wait.map((w, i) => Math.round(Math.max(0.5, Math.min(30, w + pW[i]! - bW[i]!)) * 10) / 10),
  };
}

/** Routes to follow after a change: the ones it touches, and the few others whose riders move most. */
function watchList(added: Edit[], baseline: Scorecard, plan: Scorecard): string[] {
  const touched = new Set(added.map((e) => (e.kind === 'add' ? e.route.id : e.routeId)));
  const others = [...new Set([...Object.keys(baseline.byRoute), ...Object.keys(plan.byRoute)])]
    .filter((r) => !touched.has(r))
    .map((r) => ({ r, b: baseline.byRoute[r] ?? 0, d: (plan.byRoute[r] ?? 0) - (baseline.byRoute[r] ?? 0) }))
    .filter((x) => Math.abs(x.d) > Math.max(150, 0.04 * x.b))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 4)
    .map((x) => x.r);
  return [...touched, ...others];
}

/**
 * The campaign (M5): the calendar, the books and the fleet, kept in this browser. A day passes at
 * midnight on the game clock; decisions pause the game.
 */
export function useGame(base: NetworkState | null, clock: Clock, measure: Measure): GameApi {
  const [state, setState] = useState<GameState | null>(loadGame);
  const [measuring, setMeasuring] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  // a new game needs the 2010 network's weekday figures
  const startFigures = useMemo(() => {
    if (!base?.demand) return null;
    const s = serviceStats(agencyOnly(base.network, 'octranspo'));
    return { boardings: base.demand.summary.boardingsByAgency.octranspo ?? 0, vehicleHours: s.vehicleHours, peakVehicles: s.peakVehicles };
  }, [base]);
  useEffect(() => {
    if (!state && startFigures) setState(newGame(startFigures));
  }, [state, startFigures]);

  // keep it (the browser's storage; nothing leaves the device)
  useEffect(() => {
    if (!state) return;
    const id = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
      } catch {
        /* storage full or blocked: the game still runs */
      }
    }, 500);
    return () => clearTimeout(id);
  }, [state]);

  const decision = state ? openDecision(state) : undefined;
  useEffect(() => {
    if (decision) clock.setSpeed(0);
  }, [decision?.id, clock]); // eslint-disable-line react-hooks/exhaustive-deps

  // the network in operation
  const appliedKey = JSON.stringify(state?.applied ?? []);
  const operation = useMemo<NetworkState | null>(() => {
    if (!base || !state) return base;
    if (!state.applied.length) return base;
    const network = applyEdits(base.network, state.applied);
    return { ...base, network, playback: new Playback(network) };
  }, [base, appliedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const operationNetwork = operation?.network ?? null;

  // M6: the opinion model's world, and the personas' trips on the network in operation
  const baseWorld = useMemo<GameWorld | null>(() => {
    if (!base?.demand?.los || !base.zones) return null;
    const demand = base.demand;
    return {
      zones: base.zones.zones, baseLos: demand.los!, share: base.zones.zones.map((z) => demand.zones[String(z.id)]?.[1] ?? 0),
      places: base.network.stops.filter((x) => x.kind === 'station').map((x) => ({ lon: x.lon, lat: x.lat, name: x.name })),
    };
  }, [base]);
  const [trips, setTrips] = useState<Record<string, PersonaTrips> | undefined>();
  useEffect(() => {
    const network = operationNetwork;
    if (!network) return;
    // about a tenth of a second of work: let the map draw first
    const id = setTimeout(() => {
      const jp = new JourneyPlanner(network);
      setTrips(Object.fromEntries(PERSONAS.map((p) => [p.id, {
        out: jp.plan([p.home.lon, p.home.lat], [p.dest.lon, p.dest.lat], p.out),
        back: jp.plan([p.dest.lon, p.dest.lat], [p.home.lon, p.home.lat], p.back),
      }])));
    }, 300);
    return () => clearTimeout(id);
  }, [operationNetwork]);
  const world = useMemo<GameWorld | null>(() => {
    if (!baseWorld) return null;
    const network = operationNetwork ?? base!.network;
    const routes = new Map([...base!.network.routes, ...network.routes].map((r) => [r.id, r.shortName]));
    const stops = new Map(network.stops.map((x) => [x.id, x.name]));
    return { ...baseWorld, personas: PERSONAS, trips, routeName: (id) => routes.get(id) ?? id.replace(/^oct-/, ''),
      stopName: (id) => stops.get(id) ?? id };
  }, [baseWorld, trips, operationNetwork, base]);
  // M7: wards over the zones (once)
  const wardOf = useMemo(() => (base?.zones ? assignWards(base.zones.zones) : null), [base]);
  const councilWorld = useMemo<CouncilWorld | null>(() => (world && wardOf ? { ...world, wardOf } : null), [world, wardOf]);
  const worldRef = useRef<GameWorld | null>(world);
  worldRef.current = councilWorld ?? world;
  useEffect(() => {
    if (world && state && !state.opinion) setState((s) => (s ? withOpinion(s, world) : s));
  }, [world, state?.opinion]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (world?.trips) setState((s) => (s?.opinion ? updateRoutines(s, world) : s));
  }, [world?.trips]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = useCallback(() => setState((s) => (s ? (worldRef.current ? stepDay(s, worldRef.current) : stepDay(s, EMPTY_WORLD)) : s)), []);
  useEffect(() => clock.onDayEnd(step), [clock, step]);

  /** What the network does once `added` joins `before`: OC Transpo's weekday figures and the routes to watch. */
  const figures = useCallback(async (before: Edit[], added: Edit[], g: GameState): Promise<Omit<PendingFigures, 'key'>> => {
    if (!base) throw new Error('network not loaded');
    const { baseline, plan } = await measure(before, added);
    // keep both networks' loads for the Riders view
    const lb = loadsOf(baseline);
    const lp = loadsOf(plan);
    if (lb) loadsCache.current.set(JSON.stringify(before), lb);
    if (lp) loadsCache.current.set(JSON.stringify([...before, ...added]), lp);
    setLoadsTick((n) => n + 1);
    // the model's absolute level differs a little between runs: scale to the game's current figures
    // (measuring from the 2010 network, e.g. after a route was restored: scale to 2010's)
    const ref = before.length ? g.service.boardings : base.demand?.summary.boardingsByAgency.octranspo ?? g.service.boardings;
    const k = ref / Math.max(1, baseline.byAgency.octranspo ?? 0);
    const s = serviceStats(agencyOnly(applyEdits(base.network, [...before, ...added]), 'octranspo'));
    const watch = watchList(added, baseline, plan);
    const los = losAfter(before.length ? g.los ?? base.demand?.los : base.demand?.los, baseline, plan);
    return {
      ...(los ? { los } : {}),
      service: { boardings: (plan.byAgency.octranspo ?? 0) * k, vehicleHours: s.vehicleHours, peakVehicles: s.peakVehicles },
      routes: Object.fromEntries(watch.map((r) => [r, Math.round((plan.byRoute[r] ?? 0) * k)])),
      routesBefore: Object.fromEntries(watch.map((r) => [r, Math.round((baseline.byRoute[r] ?? 0) * k)])),
    };
  }, [base, measure]);

  const busy = useRef(new Set<string>());
  const loadsCache = useRef(new Map<string, OpLoads>());
  const [loadsTick, setLoadsTick] = useState(0);
  const run = useCallback((key: string, job: () => Promise<void>) => {
    if (busy.current.has(key)) return;
    busy.current.add(key);
    setMeasuring((n) => n + 1);
    job().catch((e) => console.warn('Could not measure ridership', e)).finally(() => {
      busy.current.delete(key);
      setMeasuring((n) => n - 1);
    });
  }, []);

  // a scheduled plan is measured straight away, so riders respond from the day it starts
  const pendingKey = JSON.stringify(state?.pending ?? []);
  useEffect(() => {
    const g = stateRef.current;
    if (!g || !base?.demand || !g.pending.length || g.pendingFigures?.key === pendingKey) return;
    run(`pending:${appliedKey}:${pendingKey}`, async () => {
      const f = await figures(g.applied, g.pending, g);
      setState((s) => (s ? setPendingFigures(s, { key: pendingKey, ...f }) : s));
    });
  }, [base, pendingKey, appliedKey, figures, run]);

  // a plan before the Commission: staff measure it (what each ward gains or loses)
  const planReports = useRef(new Map<string, Omit<PendingFigures, 'key'>>());
  const measuringItem = state?.council?.items.find((i) => i.kind === 'plan' && i.measuring);
  useEffect(() => {
    const g = stateRef.current;
    const item = measuringItem;
    if (!g || !item || !base?.demand || !councilWorld) return;
    run(`item:${item.id}`, async () => {
      const edits = item.payload.edits ?? [];
      const f = await figures(g.applied, edits, g);
      planReports.current.set(item.id, f);
      const net = applyEdits(base.network, g.applied);
      const before = serviceStats(agencyOnly(net, 'octranspo')).vehicleHours;
      const effects = planEffects(net, edits, councilWorld, g.los ?? base.demand!.los!, f.los, before, f.service.vehicleHours);
      setState((s) => (s ? setPlanEffects(s, item.id, effects) : s));
    });
  }, [measuringItem?.id, base, councilWorld]); // eslint-disable-line react-hooks/exhaustive-deps

  // a plan in operation that was never measured (scheduled too late, or an older save): measure it now
  useEffect(() => {
    const g = stateRef.current;
    if (!g || !base?.demand || (g.serviceFor ?? 0) >= g.applied.length) return;
    const n = g.serviceFor ?? 0;
    run(`applied:${appliedKey}`, async () => {
      const f = await figures(g.applied.slice(0, n), g.applied.slice(n), g);
      setState((s) => (s && s.applied.length === g.applied.length ? setService(s, f.service, f.routes, f.routesBefore, undefined, f.los) : s));
    });
  }, [base, appliedKey, state?.serviceFor, figures, run]); // eslint-disable-line react-hooks/exhaustive-deps

  // loads on the network in operation: the base year's from the demand file, otherwise measured
  const loads = useMemo<OpLoads | null>(() => {
    if (!state?.applied.length) {
      const d = base?.demand;
      return d ? { loads: d.loads, peakLoads: d.peakLoads, byStop: d.stops, oc: d.summary.boardingsByAgency.octranspo ?? 0 } : null;
    }
    return loadsCache.current.get(appliedKey) ?? null;
  }, [base, appliedKey, loadsTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const requestLoads = useCallback(() => {
    const g = stateRef.current;
    if (!g?.applied.length || loadsCache.current.has(appliedKey)) return;
    run(`loads:${appliedKey}`, async () => {
      const { baseline } = await measure(g.applied, []);
      const l = loadsOf(baseline);
      if (l) loadsCache.current.set(appliedKey, l);
      setLoadsTick((n) => n + 1);
    });
  }, [appliedKey, measure, run]);

  // recent news only: the last three weeks of game time
  const news = useMemo(() => {
    if (!state) return [];
    const since = new Date(new Date(`${state.date}T12:00:00Z`).getTime() - 21 * 86_400_000).toISOString().slice(0, 10);
    return state.events.filter((e) => !e.decision && e.date >= since).slice(-3);
  }, [state?.events, state?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    state, operation, decision, news, measuring: measuring > 0, world, loads, requestLoads,
    resolve: (r) => setState((s) => {
      const d = s ? openDecision(s) : undefined;
      if (!s || !d) return s;
      // with a council, the budget and most deficit answers go to a vote
      if (s.council && r.kind === 'budget') return proposeBudget(s, d.id, r.choice);
      if (s.council && r.kind === 'deficit' && r.choice !== 'defer') return proposeDeficit(s, d.id, r.choice);
      return resolve(s, d.id, r);
    }),
    dismiss: (id) => setState((s) => (s ? dismissEvent(s, id) : s)),
    orderBuses: (type, count) => setState((s) => (s ? (s.council && count >= ORDER_VOTE_THRESHOLD ? proposeOrder(s, type, count) : orderBuses(s, type, count)) : s)),
    buildGarage: () => setState((s) => (s ? (s.council ? proposeGarage(s) : buildGarage(s)) : s)),
    setLevers: (l) => setState((s) => (s ? setLevers(s, l) : s)),
    // new or removed routes go to the Transit Commission; frequency changes are scheduled directly
    schedule: (edits) => setState((s) => {
      if (!s) return s;
      const added = edits.slice(s.pending.length);
      if (s.council && isBigPlan(added)) return proposePlan(s, edits.slice(s.pending.length));
      return schedulePlan(s, edits);
    }),
    unschedule: () => setState((s) => (s ? schedulePlan(s, []) : s)),
    councilWorld,
    lobby: (itemId, id) => setState((s) => (s && councilWorld ? lobbyOn(s, councilWorld, itemId, id) : s)),
    delay: (itemId, how) => setState((s) => (s ? delayFor(s, itemId, how) : s)),
    amend: (itemId) => setState((s) => (s ? amendItem(s, itemId) : s)),
    withdraw: (itemId) => setState((s) => (s ? withdrawItem(s, itemId) : s)),
    callVote: (itemId) => setState((s) => {
      if (!s || !councilWorld || !base) return s;
      const item = s.council?.items.find((i) => i.id === itemId);
      let next = callVoteOn(s, councilWorld, itemId, applyEdits(base.network, s.applied));
      // a plan the Commission passed was measured for its report: carry the figures to the service change
      const report = item?.kind === 'plan' ? planReports.current.get(itemId) : undefined;
      if (report && next.pending.length === (item?.payload.edits ?? []).length) next = setPendingFigures(next, { key: JSON.stringify(next.pending), ...report });
      return next;
    }),
    negotiate: (offer) => setState((s) => (s && councilWorld ? negotiateOn(s, councilWorld, offer) : s)),
    strikeChoice: (c) => setState((s) => (s ? strikeChoiceOn(s, c) : s)),
    answerSto: (accept) => setState((s) => (s ? answerSto(s, accept) : s)),
    answerFunding: (accept) => setState((s) => (s ? answerFunding(s, accept) : s)),
    acknowledge: (eventId) => setState((s) => (s ? acknowledge(s, eventId) : s)),
    proposeLine: (design, forecast) => setState((s) => (s ? proposeProject(s, design, forecast, operation?.network) : s)),
    chooseProcurement: (id, how) => setState((s) => (s ? chooseProcurementOn(s, id, how) : s)),
    answerOverrun: (id, choice) => setState((s) => (s ? answerOverrunOn(s, id, choice) : s)),
    openingDay: (eventId, rework) => setState((s) => (s ? openingDayOn(s, eventId, rework) : s)),
    cancelProject: (id) => setState((s) => (s ? cancelProjectOn(s, id) : s)),
    reviveProject: (id) => setState((s) => (s ? reviveProjectOn(s, id) : s)),
    askAgain: (id, gov) => setState((s) => (s ? askAgainOn(s, id, gov) : s)),
    restart: () => {
      if (startFigures) setState(world ? withOpinion(newGame(startFigures), world) : newGame(startFigures));
      clock.setTime(60); // 00:01
    },
  };
}
