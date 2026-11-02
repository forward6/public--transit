import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Edit, Headways, LonLat, PlanDraft } from '@otc/shared';
import { Isochrones, Playback, StreetGraph, applyEdits, draftToEdit, routeDraft, type Draft, type GraphMeta, type Scorecard } from '@otc/sim';
import type { NetworkState } from '../network/useNetwork';
import type { FromWorker, ToWorker } from './evaluator.worker';

const STORE_KEY = 'otc.plan.v1';
export type Tool = 'none' | 'draw' | 'iso' | 'line';

export const NEW_ROUTE_HEADWAYS: Headways = { am: 10, midday: 15, pm: 10, evening: 30 };

function loadEdits(): Edit[] {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as PlanDraft | null;
    return d?.version === 1 && Array.isArray(d.edits) ? d.edits : [];
  } catch {
    return [];
  }
}

function saveEdits(edits: Edit[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, edits } satisfies PlanDraft));
  } catch {
    /* private mode or full storage: the draft just isn't kept */
  }
}

export interface EvalState {
  status: 'idle' | 'running' | 'done' | 'error';
  stage?: string;
  progress?: number;
  baseline?: Scorecard;
  plan?: Scorecard;
  seconds?: number;
  error?: string;
  /** the edits the result was computed for */
  evaluatedEdits?: number;
}

export interface PlanState {
  active: boolean;
  setActive: (on: boolean) => void;
  edits: Edit[];
  addEdit: (e: Edit) => void;
  undo: () => void;
  reset: () => void;
  removeEdit: (i: number) => void;
  tool: Tool;
  setTool: (t: Tool) => void;
  graphReady: boolean;
  /** the network the game shows and runs: the base network with the edits applied */
  view: NetworkState | null;
  // drawing
  waypoints: LonLat[];
  draft: Draft | null;
  newHeadways: Headways;
  setNewHeadways: (h: Headways) => void;
  addWaypoint: (p: LonLat) => void;
  undoWaypoint: () => void;
  finishDraft: () => void;
  // travel times
  isoOrigin: LonLat | null;
  isoMinutes: Float32Array | null;
  setIsoOrigin: (p: LonLat | null) => void;
  // evaluation
  evalState: EvalState;
  runEvaluation: () => void;
  measure: (baseEdits: Edit[], edits: Edit[]) => Promise<{ baseline: Scorecard; plan: Scorecard }>;
}

/** The planning session: Plan mode, the player's edits (kept in this browser), drawing, travel times and evaluation. */
export function usePlan(base: NetworkState | null, baseUrl: string, baseEdits: Edit[] = []): PlanState {
  const [active, setActive] = useState(false);
  const [edits, setEdits] = useState<Edit[]>(loadEdits);
  const [tool, setTool] = useState<Tool>('none');
  const [graph, setGraph] = useState<StreetGraph | null>(null);
  const [waypoints, setWaypoints] = useState<LonLat[]>([]);
  const [newHeadways, setNewHeadways] = useState<Headways>(NEW_ROUTE_HEADWAYS);
  const [isoOrigin, setIsoOrigin] = useState<LonLat | null>(null);
  const [evalState, setEvalState] = useState<EvalState>({ status: 'idle' });
  const worker = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const measures = useRef(new Map<number, { resolve: (r: { baseline: Scorecard; plan: Scorecard }) => void; reject: (e: Error) => void }>());

  useEffect(() => saveEdits(edits), [edits]);

  // the street graph is only needed for drawing: load it the first time Plan mode opens
  useEffect(() => {
    if (!active || graph) return;
    let cancelled = false;
    Promise.all([
      fetch(`${baseUrl}data/graph-2010.bin`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`graph: ${r.status}`)))),
      fetch(`${baseUrl}data/graph-2010.json`).then((r) => r.json() as Promise<GraphMeta>),
    ]).then(([buf, meta]) => !cancelled && setGraph(new StreetGraph(buf, meta)))
      .catch((e) => console.warn('No street graph — run `uv run otc-pipeline network`.', e));
    return () => {
      cancelled = true;
    };
  }, [active, graph, baseUrl]);

  const view = useMemo<NetworkState | null>(() => {
    if (!base) return null;
    if (!edits.length || !active) return base; // drafts show only in Plan mode (they run once scheduled and in effect)
    const network = applyEdits(base.network, edits);
    return { ...base, network, playback: new Playback(network) };
  }, [base, edits, active]);

  const draft = useMemo(() => {
    if (!graph || !view || waypoints.length < 2) return null;
    return routeDraft(graph, waypoints, view.network.stops, `plan-${nextRouteNumber(edits)}`);
  }, [graph, view, waypoints, edits]);

  const iso = useMemo(() => (view?.zones && active ? new Isochrones(view.network, view.zones.zones) : null), [view, active]);
  const isoMinutes = useMemo(() => (iso && isoOrigin ? iso.from(isoOrigin[0], isoOrigin[1]) : null), [iso, isoOrigin]);

  const addEdit = useCallback((e: Edit) => setEdits((x) => [...x, e]), []);
  const undo = useCallback(() => {
    if (tool === 'draw' && waypoints.length) setWaypoints((w) => w.slice(0, -1));
    else setEdits((x) => x.slice(0, -1));
  }, [tool, waypoints.length]);
  const reset = useCallback(() => {
    setEdits([]);
    setWaypoints([]);
    setEvalState({ status: 'idle' });
  }, []);
  const removeEdit = useCallback((i: number) => setEdits((x) => x.filter((_, k) => k !== i)), []);

  const finishDraft = useCallback(() => {
    if (!draft) return;
    const n = nextRouteNumber(edits);
    addEdit(draftToEdit(draft, { id: `plan-${n}`, shortName: `N${n}`, headways: newHeadways, color: '#2856B8' }));
    setWaypoints([]);
    setTool('none');
  }, [draft, edits, newHeadways, addEdit]);

  const ensureWorker = useCallback(() => {
    if (typeof Worker === 'undefined') return null;
    if (!worker.current) {
      worker.current = new Worker(new URL('./evaluator.worker.ts', import.meta.url), { type: 'module' });
      worker.current.onmessage = (ev: MessageEvent<FromWorker>) => {
        const m = ev.data;
        const waiting = measures.current.get(m.id);
        if (waiting) {
          if (m.type === 'result') waiting.resolve({ baseline: m.baseline, plan: m.plan });
          else if (m.type === 'error') waiting.reject(new Error(m.message));
          if (m.type !== 'progress') measures.current.delete(m.id);
          return;
        }
        if (m.id !== reqId.current) return; // a newer request superseded this one
        if (m.type === 'progress') setEvalState((s) => ({ ...s, status: 'running', stage: m.baseline ? `baseline-${m.stage}` : m.stage, progress: m.f }));
        else if (m.type === 'result') setEvalState((s) => ({ ...s, status: 'done', baseline: m.baseline, plan: m.plan, seconds: m.seconds }));
        else setEvalState({ status: 'error', error: m.message });
      };
    }
    return worker.current;
  }, []);

  const runEvaluation = useCallback(() => {
    const w = ensureWorker();
    if (!w) return setEvalState({ status: 'error', error: 'Web Workers are not available' });
    const id = ++reqId.current;
    setEvalState((s) => ({ ...s, status: 'running', stage: 'load', progress: 0, evaluatedEdits: edits.length }));
    w.postMessage({ type: 'evaluate', id, baseUrl, baseEdits, edits } satisfies ToWorker);
  }, [baseUrl, edits, ensureWorker, baseEdits]);

  /** Score edits on top of other edits (used by the game to measure a scheduled plan against the network in operation). */
  const measure = useCallback((be: Edit[], e: Edit[]) => new Promise<{ baseline: Scorecard; plan: Scorecard }>((resolve, reject) => {
    const w = ensureWorker();
    if (!w) return reject(new Error('Web Workers are not available'));
    const id = -2 - measures.current.size - Math.floor(Math.random() * 1e6);
    measures.current.set(id, { resolve, reject });
    w.postMessage({ type: 'evaluate', id, baseUrl, baseEdits: be, edits: e } satisfies ToWorker);
  }), [baseUrl, ensureWorker]);

  // warm up: score the 2010 network in the background as soon as Plan mode opens (its result is cached in the worker)
  useEffect(() => {
    if (active) ensureWorker()?.postMessage({ type: 'evaluate', id: -1, baseUrl, baseEdits, edits: [] } satisfies ToWorker);
  }, [active, baseUrl, ensureWorker, baseEdits]);

  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => {
    if (!active) {
      setTool('none');
      setWaypoints([]);
      setIsoOrigin(null);
    }
  }, [active]);
  useEffect(() => {
    if (tool !== 'draw') setWaypoints([]);
    if (tool !== 'iso') setIsoOrigin(null);
  }, [tool]);

  return {
    active, setActive, edits, addEdit, undo, reset, removeEdit, tool, setTool, graphReady: !!graph, view,
    waypoints, draft, newHeadways, setNewHeadways,
    addWaypoint: (p) => setWaypoints((w) => [...w, p]),
    undoWaypoint: () => setWaypoints((w) => w.slice(0, -1)),
    finishDraft, isoOrigin, isoMinutes, setIsoOrigin, evalState, runEvaluation, measure,
  };
}

function nextRouteNumber(edits: Edit[]): number {
  let n = 0;
  for (const e of edits) if (e.kind === 'add') n = Math.max(n, Number(e.route.id.replace('plan-', '')) || 0);
  return n + 1;
}
