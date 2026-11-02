// M8: drawing a rapid-transit line in Plan mode: stations in order, how each stretch is built, a
// cost estimate as you go, and a ridership forecast from the demand model before you propose it.
// Every change can be undone (and redone); closing keeps the draft (in this browser) for later,
// discarding it asks first.
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { Lang, LineDesign, LineMode, LonLat, ProjectEstimate, ProjectForecast, Structure } from '@otc/shared';
import { annotateDesign, estimateLine, lineEdit, newDesign, stationAt, streetPath, wardsAt, type StreetGraph } from '@otc/sim';
import type { GameApi } from '../game/useGame';
import type { NetworkState } from '../network/useNetwork';
import type { PlanState } from './usePlan';

export const LINE_DRAFT_KEY = 'otc.linedraft.v1';

export interface LineDraw {
  design: LineDesign | null;
  /** the 2010 railways (commuter rail runs on them), once loaded */
  rail: [number, number][][] | null;
  estimate: ProjectEstimate | null;
  forecast: ProjectForecast | null;
  measuring: boolean;
  error: boolean;
  /** a draft is waiting (the line tool was closed with stations on it) */
  hasDraft: boolean;
  draftName: string;
  canUndo: boolean;
  canRedo: boolean;
  start: (mode: LineMode) => void;
  /** reopen the draft */
  resume: () => void;
  setMode: (mode: LineMode) => void;
  addStation: (p: LonLat) => void;
  undo: () => void;
  redo: () => void;
  setStructure: (i: number, k: Structure) => void;
  setName: (name: string) => void;
  setColor: (c: string) => void;
  measure: () => void;
  propose: () => void;
  /** leave the line tool, keeping the draft */
  close: () => void;
  /** throw the draft away */
  discard: () => void;
}

/** A streetcar follows the streets between its stops (straight where they don't connect). */
function withPaths(d: LineDesign, graph: StreetGraph | null): LineDesign {
  if (d.mode !== 'streetcar' || !graph || d.stations.length < 2) return d;
  const st = d.stations;
  const paths = st.slice(1).map((b, i) => {
    const a = st[i]!;
    const old = d.paths?.[i];
    // keep a path already found between the same two stops
    if (old && old.length >= 2 && old[0]![0] === a.lon && old[0]![1] === a.lat && old.at(-1)![0] === b.lon && old.at(-1)![1] === b.lat) return old;
    return streetPath(graph, [a.lon, a.lat], [b.lon, b.lat]) ?? [[a.lon, a.lat], [b.lon, b.lat]] as [number, number][];
  });
  return { ...d, paths };
}

function loadDraft(): LineDesign | null {
  try {
    const d = JSON.parse(localStorage.getItem(LINE_DRAFT_KEY) ?? 'null') as LineDesign | null;
    return d?.stations ? d : null;
  } catch {
    return null;
  }
}

export function useLineDraw(net: NetworkState | null, plan: PlanState, game: GameApi, lang: Lang, baseUrl: string): LineDraw {
  const [raw, setRaw] = useState<LineDesign | null>(loadDraft);
  const past = useRef<LineDesign[]>([]);
  const future = useRef<LineDesign[]>([]);
  const [, setTick] = useState(0);
  const [rail, setRail] = useState<[number, number][][] | null>(null);
  const open = plan.tool === 'line';
  useEffect(() => {
    if (!open || rail) return;
    fetch(`${baseUrl}data/rail-2010.json`).then((r) => (r.ok ? r.json() : null))
      .then((d: { lines: { line: [number, number][] }[] } | null) => setRail(d ? d.lines.map((x) => x.line) : []))
      .catch(() => setRail([]));
  }, [open, rail, baseUrl]);
  // keep the draft in this browser
  useEffect(() => {
    try {
      if (raw && raw.stations.length) localStorage.setItem(LINE_DRAFT_KEY, JSON.stringify(raw));
      else localStorage.removeItem(LINE_DRAFT_KEY);
    } catch {
      /* storage blocked */
    }
  }, [raw]);
  // a streetcar drawn before the street graph loaded (or a resumed draft): route it along the streets now
  useEffect(() => {
    if (!plan.graph || raw?.mode !== 'streetcar' || raw.stations.length < 2) return;
    const routed = withPaths(raw, plan.graph);
    if (routed.paths?.some((p, i) => p !== raw.paths?.[i])) setRaw(routed);
  }, [plan.graph, raw]);
  // what each stretch runs beside: existing railways, the river
  const zones = game.world?.zones;
  const design = useMemo(() => (raw && raw.stations.length >= 2 ? annotateDesign(raw, { rail: rail ?? undefined, zones }) : raw), [raw, rail, zones]);
  const [forecast, setForecast] = useState<ProjectForecast | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [error, setError] = useState(false);
  const n = (game.state?.projects?.length ?? 0) + 1;
  const estimate = useMemo(() => (design && design.stations.length >= 2 ? estimateLine(design, game.state?.costIndex ?? 1) : null),
    [design, game.state?.costIndex]);
  /** A change you can undo. */
  const change = useCallback((f: (d: LineDesign) => LineDesign) => {
    setRaw((d) => {
      if (!d) return d;
      const next = f(d);
      if (next === d) return d;
      past.current = [...past.current.slice(-99), d];
      future.current = [];
      return next;
    });
    setForecast(null);
    setTick((x) => x + 1);
  }, []);
  const start = useCallback((mode: LineMode) => {
    const d = newDesign(mode, n);
    if (lang === 'fr') d.name = `Ligne ${n}`;
    past.current = [];
    future.current = [];
    setRaw(d);
    setForecast(null);
    plan.setTool('line');
  }, [n, lang, plan]);
  const addStation = useCallback((p: LonLat) => {
    if (!net) return;
    change((d) => {
      const st = stationAt(p[0], p[1], net.network.stops, `line-${n}-s${d.stations.length}`);
      if (d.stations.some((x) => x.id === st.id)) return d; // a station once
      const next = { ...d, stations: [...d.stations, st], structure: d.stations.length ? [...d.structure, d.mode === 'streetcar' ? 'street' as const : 'surface' as const] : d.structure };
      return withPaths(next, plan.graph);
    });
  }, [net, n, change, plan.graph]);
  const step = useCallback((from: MutableRefObject<LineDesign[]>, to: MutableRefObject<LineDesign[]>) => {
    setRaw((d) => {
      const prev = from.current.at(-1);
      if (!d || !prev) return d;
      from.current = from.current.slice(0, -1);
      to.current = [...to.current, d];
      return prev;
    });
    setForecast(null);
    setTick((x) => x + 1);
  }, []);
  const undo = useCallback(() => step(past, future), [step]);
  const redo = useCallback(() => step(future, past), [step]);
  // ⌘Z / Ctrl+Z undoes, ⇧⌘Z / Ctrl+Y redoes, while drawing
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, undo, redo]);
  const measure = useCallback(() => {
    if (!design || design.stations.length < 2 || !game.state) return;
    setMeasuring(true);
    setError(false);
    const cw = game.councilWorld;
    plan.measure(game.state.applied, [lineEdit(design, 'line-draft')]).then(({ baseline, plan: after }) => {
      setForecast({
        boardings: Math.round(after.byRoute['line-draft'] ?? 0),
        newRiders: Math.round(after.transitTrips - baseline.transitTrips),
        reach: Math.round((after.jobsIn45 / Math.max(1, baseline.jobsIn45) - 1) * 1000) / 10,
        wards: cw ? wardsAt(design.stations.map((x) => [x.lon, x.lat]), cw.zones, cw.wardOf) : [],
      });
    }).catch(() => setError(true)).finally(() => setMeasuring(false));
  }, [design, game.state, game.councilWorld, plan]);
  const clear = () => {
    past.current = [];
    future.current = [];
    setRaw(null);
    setForecast(null);
  };
  return {
    design: open ? design : null, rail, estimate: open ? estimate : null, forecast, measuring, error,
    hasDraft: !open && !!raw?.stations.length, draftName: raw?.name ?? '',
    canUndo: past.current.length > 0, canRedo: future.current.length > 0,
    start, addStation, measure, undo, redo,
    resume: () => plan.setTool('line'),
    // switching to a streetcar puts it in traffic along the streets; switching away runs straight, on the surface
    setMode: (mode) => change((d) => (d.mode === mode ? d
      : withPaths({ ...newDesign(mode, n), name: d.name, color: d.color, stations: d.stations,
        structure: d.structure.map((k) => (mode === 'streetcar' ? (k === 'surface' || k === 'elevated' ? 'street' : k) : k === 'street' ? 'surface' : k)) }, plan.graph))),
    setStructure: (i, k) => change((d) => (d.structure[i] === k ? d : { ...d, structure: d.structure.map((x, j) => (j === i ? k : x)) })),
    setName: (name) => setRaw((d) => (d ? { ...d, name } : d)),
    setColor: (color) => change((d) => (d.color === color ? d : { ...d, color })),
    propose: () => {
      if (!design || design.stations.length < 2) return;
      game.proposeLine(design, forecast ?? undefined);
      clear();
      plan.setTool('none');
      plan.setActive(false);
    },
    close: () => plan.setTool('none'),
    discard: () => {
      clear();
      plan.setTool('none');
    },
  };
}
