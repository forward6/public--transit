import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BusType, Edit, GameEvent, GameState, PendingFigures } from '@otc/shared';
import {
  Playback, advanceDay, agencyOnly, applyEdits, buildGarage, dismissEvent, newGame, openDecision, orderBuses, resolve, schedulePlan,
  serviceStats, setLevers, setPendingFigures, setService, type Resolution, type Scorecard,
} from '@otc/sim';
import type { NetworkState } from '../network/useNetwork';
import type { Clock } from '../sim/clock';

const STORE_KEY = 'otc.game.v1';

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

  const step = useCallback(() => setState((s) => (s ? advanceDay(s) : s)), []);
  useEffect(() => clock.onDayEnd(step), [clock, step]);

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

  /** What the network does once `added` joins `before`: OC Transpo's weekday figures and the routes to watch. */
  const figures = useCallback(async (before: Edit[], added: Edit[], g: GameState): Promise<Omit<PendingFigures, 'key'>> => {
    if (!base) throw new Error('network not loaded');
    const { baseline, plan } = await measure(before, added);
    // the model's absolute level differs a little between runs: scale to the game's current figures
    const k = g.service.boardings / Math.max(1, baseline.byAgency.octranspo ?? 0);
    const s = serviceStats(agencyOnly(applyEdits(base.network, [...before, ...added]), 'octranspo'));
    const watch = watchList(added, baseline, plan);
    return {
      service: { boardings: (plan.byAgency.octranspo ?? 0) * k, vehicleHours: s.vehicleHours, peakVehicles: s.peakVehicles },
      routes: Object.fromEntries(watch.map((r) => [r, Math.round((plan.byRoute[r] ?? 0) * k)])),
      routesBefore: Object.fromEntries(watch.map((r) => [r, Math.round((baseline.byRoute[r] ?? 0) * k)])),
    };
  }, [base, measure]);

  const busy = useRef(new Set<string>());
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

  // a plan in operation that was never measured (scheduled too late, or an older save): measure it now
  useEffect(() => {
    const g = stateRef.current;
    if (!g || !base?.demand || (g.serviceFor ?? 0) >= g.applied.length) return;
    const n = g.serviceFor ?? 0;
    run(`applied:${appliedKey}`, async () => {
      const f = await figures(g.applied.slice(0, n), g.applied.slice(n), g);
      setState((s) => (s && s.applied.length === g.applied.length ? setService(s, f.service, f.routes, f.routesBefore) : s));
    });
  }, [base, appliedKey, state?.serviceFor, figures, run]); // eslint-disable-line react-hooks/exhaustive-deps

  // recent news only: the last three weeks of game time
  const news = useMemo(() => {
    if (!state) return [];
    const since = new Date(new Date(`${state.date}T12:00:00Z`).getTime() - 21 * 86_400_000).toISOString().slice(0, 10);
    return state.events.filter((e) => !e.decision && e.date >= since).slice(-3);
  }, [state?.events, state?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    state, operation, decision, news, measuring: measuring > 0,
    resolve: (r) => setState((s) => (s && openDecision(s) ? resolve(s, openDecision(s)!.id, r) : s)),
    dismiss: (id) => setState((s) => (s ? dismissEvent(s, id) : s)),
    orderBuses: (type, count) => setState((s) => (s ? orderBuses(s, type, count) : s)),
    buildGarage: () => setState((s) => (s ? buildGarage(s) : s)),
    setLevers: (l) => setState((s) => (s ? setLevers(s, l) : s)),
    schedule: (edits) => setState((s) => (s ? schedulePlan(s, edits) : s)),
    unschedule: () => setState((s) => (s ? schedulePlan(s, []) : s)),
    restart: () => {
      if (startFigures) setState(newGame(startFigures));
      clock.setTime(60); // 00:01
    },
  };
}
