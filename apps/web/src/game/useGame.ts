import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BusType, Edit, GameEvent, GameState } from '@otc/shared';
import {
  Playback, advanceDay, agencyOnly, applyEdits, buildGarage, dismissEvent, newGame, openDecision, orderBuses, resolve, schedulePlan,
  serviceStats, setLevers, setService, type Resolution, type Scorecard,
} from '@otc/sim';
import type { NetworkState } from '../network/useNetwork';
import type { Clock } from '../sim/clock';

const STORE_KEY = 'otc.game.v1';
const FAST_DAY_MS = 800; // fast-forward: a month in ~25 s

function load(): GameState | null {
  try {
    const g = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as GameState | null;
    return g?.version === 1 ? g : null;
  } catch {
    return null;
  }
}

export interface GameApi {
  state: GameState | null;
  /** the 2010 network with every plan that has taken effect */
  operation: NetworkState | null;
  decision: GameEvent | undefined;
  /** news to show briefly (deliveries, service changes…) */
  news: GameEvent[];
  fast: boolean;
  setFast: (on: boolean) => void;
  resolve: (r: Resolution) => void;
  dismiss: (id: string) => void;
  orderBuses: (type: BusType, count: number) => void;
  buildGarage: () => void;
  setLevers: (l: Partial<{ maintenance: number; fareIndex: number }>) => void;
  schedule: (edits: Edit[]) => void;
  unschedule: () => void;
  restart: () => void;
  /** re-measuring ridership after a service change */
  measuring: boolean;
}

/**
 * The campaign (M5): the calendar, the books and the fleet, kept in this browser. A day passes when
 * the service day ends (or every 0.8 s in fast-forward); decisions pause the game.
 */
export function useGame(base: NetworkState | null, clock: Clock,
  measure: (edits: Edit[]) => Promise<{ baseline: Scorecard; plan: Scorecard }>, fastDayMs = FAST_DAY_MS): GameApi {
  const [state, setState] = useState<GameState | null>(load);
  const [fast, setFast] = useState(false);
  const [measuring, setMeasuring] = useState(false);
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
  useEffect(() => {
    if (!fast) return;
    clock.setSpeed(0);
    const id = setInterval(step, fastDayMs);
    return () => clearInterval(id);
  }, [fast, clock, step, fastDayMs]);

  const decision = state ? openDecision(state) : undefined;
  useEffect(() => {
    if (decision) {
      setFast(false);
      clock.setSpeed(0);
    }
  }, [decision?.id, clock]);

  // the network in operation, and its figures when it changes at a service change
  const appliedKey = JSON.stringify(state?.applied ?? []);
  const operation = useMemo<NetworkState | null>(() => {
    if (!base || !state) return base;
    if (!state.applied.length) return base;
    const network = applyEdits(base.network, state.applied);
    return { ...base, network, playback: new Playback(network) };
  }, [base, appliedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const measured = useRef(appliedKey);
  useEffect(() => {
    if (!operation || !state || !base?.demand || measured.current === appliedKey) return;
    measured.current = appliedKey;
    const s = serviceStats(agencyOnly(operation.network, 'octranspo'));
    const applied = state.applied;
    setMeasuring(true);
    measure(applied).then(({ baseline, plan }) => {
      const ratio = (plan.byAgency.octranspo ?? 0) / Math.max(1, baseline.byAgency.octranspo ?? 1);
      const boardings = (base.demand!.summary.boardingsByAgency.octranspo ?? 0) * ratio;
      setState((g) => (g ? setService(g, { boardings, vehicleHours: s.vehicleHours, peakVehicles: s.peakVehicles }) : g));
    }).catch((e) => console.warn('Could not re-measure ridership', e)).finally(() => setMeasuring(false));
    // costs and the fleet requirement change at once; ridership follows when measured
    setState((g) => (g ? setService(g, { ...g.service, vehicleHours: s.vehicleHours, peakVehicles: s.peakVehicles }) : g));
  }, [operation, appliedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // recent news only (fast-forward makes plenty): the last three weeks of game time
  const news = useMemo(() => {
    if (!state) return [];
    const since = new Date(new Date(`${state.date}T12:00:00Z`).getTime() - 21 * 86_400_000).toISOString().slice(0, 10);
    return state.events.filter((e) => !e.decision && e.date >= since).slice(-3);
  }, [state?.events, state?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    state, operation, decision, news, fast, measuring,
    setFast: (on) => setFast(on && !decision),
    resolve: (r) => setState((s) => (s && openDecision(s) ? resolve(s, openDecision(s)!.id, r) : s)),
    dismiss: (id) => setState((s) => (s ? dismissEvent(s, id) : s)),
    orderBuses: (type, count) => setState((s) => (s ? orderBuses(s, type, count) : s)),
    buildGarage: () => setState((s) => (s ? buildGarage(s) : s)),
    setLevers: (l) => setState((s) => (s ? setLevers(s, l) : s)),
    schedule: (edits) => setState((s) => (s ? schedulePlan(s, edits) : s)),
    unschedule: () => setState((s) => (s ? schedulePlan(s, []) : s)),
    restart: () => {
      if (startFigures) setState(newGame(startFigures));
      measured.current = '[]';
    },
  };
}
