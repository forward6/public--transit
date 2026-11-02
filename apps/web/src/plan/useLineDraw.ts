// M8: drawing a rapid-transit line in Plan mode: stations in order, how each stretch is built, a
// cost estimate as you go, and a ridership forecast from the demand model before you propose it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Lang, LineDesign, LineMode, LonLat, ProjectEstimate, ProjectForecast, Structure } from '@otc/shared';
import { annotateDesign, estimateLine, lineEdit, newDesign, stationAt, wardsAt } from '@otc/sim';
import type { GameApi } from '../game/useGame';
import type { NetworkState } from '../network/useNetwork';
import type { PlanState } from './usePlan';

export interface LineDraw {
  design: LineDesign | null;
  /** the 2010 railways (commuter rail runs on them), once loaded */
  rail: [number, number][][] | null;
  estimate: ProjectEstimate | null;
  forecast: ProjectForecast | null;
  measuring: boolean;
  error: boolean;
  start: (mode: LineMode) => void;
  setMode: (mode: LineMode) => void;
  addStation: (p: LonLat) => void;
  undo: () => void;
  setStructure: (i: number, k: Structure) => void;
  setName: (name: string) => void;
  setColor: (c: string) => void;
  measure: () => void;
  propose: () => void;
  clear: () => void;
}

export function useLineDraw(net: NetworkState | null, plan: PlanState, game: GameApi, lang: Lang, baseUrl: string): LineDraw {
  const [raw, setDesign] = useState<LineDesign | null>(null);
  const [rail, setRail] = useState<[number, number][][] | null>(null);
  useEffect(() => {
    if (!raw || rail) return;
    fetch(`${baseUrl}data/rail-2010.json`).then((r) => (r.ok ? r.json() : null))
      .then((d: { lines: { line: [number, number][] }[] } | null) => setRail(d ? d.lines.map((x) => x.line) : []))
      .catch(() => setRail([]));
  }, [!!raw, rail, baseUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  // what each stretch runs beside: existing railways, the river
  const zones = game.world?.zones;
  const design = useMemo(() => (raw && raw.stations.length >= 2 ? annotateDesign(raw, { rail: rail ?? undefined, zones }) : raw), [raw, rail, zones]);
  const [forecast, setForecast] = useState<ProjectForecast | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [error, setError] = useState(false);
  const n = (game.state?.projects?.length ?? 0) + 1;
  const estimate = useMemo(() => (design && design.stations.length >= 2 ? estimateLine(design, game.state?.costIndex ?? 1) : null),
    [design, game.state?.costIndex]);
  const change = (f: (d: LineDesign) => LineDesign) => {
    setDesign((d) => (d ? f(d) : d));
    setForecast(null);
  };
  const start = useCallback((mode: LineMode) => {
    const d = newDesign(mode, n);
    if (lang === 'fr') d.name = `Ligne ${n}`;
    setDesign(d);
    setForecast(null);
    plan.setTool('line');
  }, [n, lang, plan]);
  const addStation = useCallback((p: LonLat) => {
    if (!net) return;
    change((d) => {
      const st = stationAt(p[0], p[1], net.network.stops, `line-${n}-s${d.stations.length}`);
      if (d.stations.some((x) => x.id === st.id)) return d; // a station once
      return { ...d, stations: [...d.stations, st], structure: d.stations.length ? [...d.structure, 'surface'] : d.structure };
    });
  }, [net, n]);
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
  return {
    design, rail, estimate, forecast, measuring, error, start, addStation, measure,
    setMode: (mode) => change((d) => ({ ...newDesign(mode, n), name: d.name, color: d.color, stations: d.stations, structure: d.structure })),
    undo: () => change((d) => ({ ...d, stations: d.stations.slice(0, -1), structure: d.structure.slice(0, Math.max(0, d.stations.length - 2)) })),
    setStructure: (i, k) => change((d) => ({ ...d, structure: d.structure.map((x, j) => (j === i ? k : x)) })),
    setName: (name) => setDesign((d) => (d ? { ...d, name } : d)),
    setColor: (color) => setDesign((d) => (d ? { ...d, color } : d)),
    propose: () => {
      if (!design || design.stations.length < 2) return;
      game.proposeLine(design, forecast ?? undefined);
      setDesign(null);
      setForecast(null);
      plan.setTool('none');
      plan.setActive(false);
    },
    clear: () => {
      setDesign(null);
      setForecast(null);
      plan.setTool('none');
    },
  };
}
