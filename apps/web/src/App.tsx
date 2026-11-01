import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapMouseEvent, Map as MLMap } from 'maplibre-gl';
import { LANGS, SEASONS, TIMES, parseClock, type Lang, type Season, type TimeOfDay } from '@otc/shared';
import { MapView, type CameraPadding } from './map/MapView';
import { palette } from './map/palettes';
import { OPINION_ZONES, PICKABLE, RIDER_PATH, RIDER_POS } from './map/style';
import { useStreamedSource } from './map/useStreamedSource';
import { STRINGS } from './i18n/strings';
import { draftFeatures, isoPolys, loadLines, networkLines, networkStops, opinionPolys, riderPath, zonePoints } from './network/geojson';
import { useNetwork } from './network/useNetwork';
import { useVehicleAnimation } from './network/useVehicleAnimation';
import { DAYS_SPEED, createClock, isNight, seasonOf, type SpeedIndex } from './sim/clock';
import { serviceDayAt, vehiclesNow } from './sim/service';
import { Hud, type Settings } from './ui/Hud';
import { Inspector, type Selection } from './ui/Inspector';
import { Snow } from './ui/Snow';
import { usePlan } from './plan/usePlan';
import { PlanDock, ScorecardPanel } from './plan/PlanUI';
import { loadGame, useGame, type Measure } from './game/useGame';
import { BudgetPanel, DailyRidersChip, DecisionCard, NewsToasts, TreasuryChip, fmtDate } from './game/GameUI';
import { PERSONAS } from '@otc/shared';
import { journeyPosition, nextServiceChange, serviceDay, temperatureAt, weatherOn } from '@otc/sim';
import { ApprovalChip, FrontPageCard, OpinionPanel, PersonaPanel, ZonePanel, opinionValues, type OpinionView } from './game/OpinionUI';
import { useLayout, type Layout } from './ui/useLayout';

const params = new URLSearchParams(location.search);
const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  const v = params.get(key);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
};

function initialSettings(): Settings {
  const navLang: Lang = navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  return {
    lang: pick<Lang>('lang', LANGS, navLang),
    buildings3d: params.get('3d') !== '0',
    riders: params.get('riders') === '1',
    opinion: params.get('opinion') === '1',
  };
}

// ?safe=top,bottom simulates device safe areas (screenshots); real devices use env()
if (params.get('safe')) {
  const [top = '0', bottom = '0'] = params.get('safe')!.split(',');
  document.documentElement.style.setProperty('--safe-top', `${top}px`);
  document.documentElement.style.setProperty('--safe-bottom', `${bottom}px`);
}

// The calendar and the sun set the look; ?season= and ?time= pin it (screenshots)
const seasonPin = params.get('season') && (SEASONS as readonly string[]).includes(params.get('season')!) ? params.get('season') as Season : null;
const timePin = params.get('time') && (TIMES as readonly string[]).includes(params.get('time')!) ? params.get('time') as TimeOfDay : null;

// The game clock: a new campaign starts at 00:01 on Wednesday 1 December 2010; a saved one resumes
// where it was. ?t=HH:MM sets the time, ?speed=0..5 the speed (default 15 min per second).
const CLOCK_KEY = 'otc.clock.v1';
function startTime(): number {
  if (params.get('t')) return parseClock(params.get('t')!);
  try {
    const saved = JSON.parse(localStorage.getItem(CLOCK_KEY) ?? 'null') as { date: string; t: number } | null;
    if (saved && saved.date === loadGame()?.date) return saved.t;
  } catch {
    /* no saved clock */
  }
  return 60;
}
const clock = createClock(startTime(), Math.min(5, Math.max(0, Math.round(Number(params.get('speed') ?? 3)) || 0)) as SpeedIndex);

function paddingFor(layout: Layout, inspecting: boolean): CameraPadding {
  const safeTop = Number(params.get('safe')?.split(',')[0] ?? 0);
  if (layout === 'phone') return { top: 70 + safeTop, bottom: inspecting ? 330 : 250, left: 0, right: 0 };
  if (layout === 'tablet') return { top: 84, bottom: 0, left: 0, right: inspecting ? 360 : 0 };
  return { top: 92, bottom: 0, left: 0, right: inspecting ? 400 : 0 };
}

/** Re-render a few times per second with the clock's time (the map animates independently). */
function useClockView() {
  const read = () => ({ time: clock.now(), service: clock.serviceTime(), speed: clock.speed() });
  const [view, setView] = useState(read);
  useEffect(() => {
    const id = setInterval(() => setView(read()), 250);
    const unsub = clock.subscribe(() => setView(read()));
    return () => {
      clearInterval(id);
      unsub();
    };
  }, []);
  return view;
}

export function App() {
  const layout = useLayout(params.get('layout') as Layout | null);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [map, setMap] = useState<MLMap | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  const [opinionView, setOpinionView] = useState<OpinionView>((['approval', 'service', 'value', 'trust'] as const).find((v) => v === params.get('ov')) ?? 'approval');
  const t = STRINGS[settings.lang];
  const still = params.has('still') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const baseUrl = useMemo(() => new URL(import.meta.env.BASE_URL, location.href).href, []);
  const base = useNetwork(baseUrl);
  // the campaign (M5): the network in operation is the 2010 network plus the plans that have taken effect
  const measureRef = useRef<Measure | null>(null);
  const measure = useCallback<Measure>((b, e) => (measureRef.current ? measureRef.current(b, e) : Promise.reject(new Error('planner not ready'))), []);
  const game = useGame(base, clock, measure);
  const plan = usePlan(game.operation, baseUrl, game.state?.applied);
  measureRef.current = plan.measure;
  const net = plan.view; // the 2010 network with the player's edits applied
  const view = useClockView();
  const date = game.state?.date ?? '2010-12-01';
  const dateRef = useRef(date);
  dateRef.current = date;
  const serviceDayNow = useCallback(() => serviceDayAt(dateRef.current, clock.now()), []);
  useVehicleAnimation(map, net?.playback ?? null, clock, serviceDayNow);

  // the look follows the calendar (season) and the sun (night), except when days fly by
  const night = timePin ? timePin === 'night' : view.speed < DAYS_SPEED && isNight(date, view.time);
  const pal = palette(seasonPin ?? seasonOf(date), night ? 'night' : 'day');

  // keep the time of day with the saved game
  useEffect(() => {
    const save = () => {
      if (clock.now() < 120) return; // just past midnight: the new date may not be saved yet
      try {
        localStorage.setItem(CLOCK_KEY, JSON.stringify({ date: dateRef.current, t: Math.floor(clock.now()) }));
      } catch {
        /* storage blocked */
      }
    };
    const id = setInterval(save, 2000);
    addEventListener('pagehide', save);
    return () => {
      clearInterval(id);
      removeEventListener('pagehide', save);
    };
  }, []);

  // Plan mode pauses the clock (and restores the speed afterwards)
  const speedBeforePlan = useRef<number | null>(null);
  useEffect(() => {
    if (plan.active) {
      speedBeforePlan.current = clock.speed();
      clock.setSpeed(0);
    } else if (speedBeforePlan.current !== null) {
      clock.setSpeed(speedBeforePlan.current as never);
      speedBeforePlan.current = null;
    }
  }, [plan.active]);
  // ?plan=1 opens Plan mode; &iso=lon,lat shows travel times; &draw=lon,lat;lon,lat sketches a route (links, screenshots)
  useEffect(() => {
    if (!base || !params.get('plan')) return;
    plan.setActive(true);
    const iso = params.get('iso')?.split(',').map(Number);
    if (iso?.length === 2) {
      plan.setTool('iso');
      setTimeout(() => plan.setIsoOrigin([iso[0]!, iso[1]!]), 0);
    }
    const draw = params.get('draw');
    if (draw) {
      plan.setTool('draw');
      setTimeout(() => draw.split(';').forEach((pt) => {
        const [x, y] = pt.split(',').map(Number);
        plan.addWaypoint([x!, y!]);
      }), 0);
    }
  }, [base]);
  const planRef = useRef(plan);
  planRef.current = plan;
  // the Riders and Opinion views are alternatives
  const changeSettings = (s: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...s, ...(s.opinion ? { riders: false } : {}),
    ...(s.riders ? { opinion: false } : {}) }));

  useEffect(() => {
    document.body.className = `theme-${pal.night ? 'night' : 'day'} layout-${layout}`;
    document.documentElement.lang = settings.lang;
    document.title = `${t.appName} — 2010`;
    const q = new URLSearchParams(location.search);
    q.set('lang', settings.lang);
    if (settings.buildings3d) q.delete('3d');
    else q.set('3d', '0');
    if (settings.riders) q.set('riders', '1');
    else q.delete('riders');
    if (settings.opinion) q.set('opinion', '1');
    else q.delete('opinion');
    history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
  }, [settings, layout, pal.night, t.appName]);

  // ?select=stop:carleton opens an inspector on load (handy for links and screenshots)
  useEffect(() => {
    const s = params.get('select');
    if (s && net) {
      const [type, id] = s.split(':') as [Exclude<Selection, null>['type'], string];
      if (type === 'vehicle') {
        const now = vehiclesNow(net.playback, clock.serviceTime(), serviceDayNow());
        const v = now.find((x) => x.routeId === id) ?? now[0];
        if (v) setSel({ type: 'vehicle', id: v.tripId });
      } else setSel({ type, id });
    }
  }, [net]);

  // pick vehicles, stations, routes and corridors
  useEffect(() => {
    if (!map) return;
    const onClick = (e: MapMouseEvent) => {
      const pl = planRef.current;
      if (pl.active && pl.tool === 'draw') return pl.addWaypoint([e.lngLat.lng, e.lngLat.lat]);
      if (pl.active && pl.tool === 'iso') return pl.setIsoOrigin([e.lngLat.lng, e.lngLat.lat]);
      const layers = PICKABLE.filter((l) => map.getLayer(l));
      const box: [[number, number], [number, number]] = [[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]];
      const f = map.queryRenderedFeatures(box, { layers })[0];
      if (!f) return setSel(null);
      const p = f.properties as Record<string, string>;
      if (f.layer.id === 'rider-pos') return;
      if (f.layer.id === 'op-zones') return setSel({ type: 'zone', id: String(p.i) });
      if (f.layer.id === 'net-vehicles' || f.layer.id === 'net-vehicle-dots') setSel({ type: 'vehicle', id: p.trip! });
      else if (f.layer.id === 'net-stations' || f.layer.id === 'net-stops') setSel({ type: 'stop', id: p.id! });
      else if (p.kind === 'route') setSel({ type: 'route', id: p.id! });
      else setSel({ type: 'corridor', id: p.id! });
    };
    const cursor = (on: boolean) => () => (map.getCanvas().style.cursor = on ? 'pointer' : '');
    map.on('click', onClick);
    for (const l of PICKABLE) {
      map.on('mouseenter', l, cursor(true));
      map.on('mouseleave', l, cursor(false));
    }
    return () => {
      map.off('click', onClick);
    };
  }, [map]);

  // follow the selected vehicle with the camera until the user drags the map
  const [follow, setFollow] = useState(false);
  useEffect(() => setFollow(sel?.type === 'vehicle' || sel?.type === 'persona'), [sel]);
  useEffect(() => {
    if (!map) return;
    const stop = () => setFollow(false);
    map.on('dragstart', stop);
    return () => {
      map.off('dragstart', stop);
    };
  }, [map]);
  // M6: the followed rider, their journey and where they are now
  const persona = sel?.type === 'persona' ? PERSONAS.find((p) => p.id === sel.id) ?? null : null;
  const personaTrips = persona ? game.world?.trips?.[persona.id] : undefined;
  const travelsToday = !!persona && persona.days.includes(new Date(`${date}T12:00:00Z`).getUTCDay());
  const riderNow = useMemo(() => {
    if (!personaTrips || !travelsToday) return null;
    for (const j of [personaTrips.out, personaTrips.back]) {
      const at = j && journeyPosition(j, view.service);
      if (at) return at.lonlat;
    }
    return null;
  }, [personaTrips, travelsToday, view.service]);
  const riderData = useMemo(() => {
    if (!persona || !personaTrips) return null;
    const { lines, ends } = riderPath([personaTrips.out, personaTrips.back]);
    const pos = { type: 'FeatureCollection' as const, features: [...ends,
      ...(riderNow ? [{ type: 'Feature' as const, properties: { kind: 'now', initial: persona.name[0] }, geometry: { type: 'Point' as const, coordinates: riderNow } }] : [])] };
    return { lines, pos };
  }, [persona, personaTrips, riderNow]);
  useStreamedSource(map, RIDER_PATH, riderData?.lines ?? null);
  useStreamedSource(map, RIDER_POS, riderData?.pos ?? null);
  useEffect(() => {
    if (!map || !follow || !riderNow || sel?.type !== 'persona') return;
    map.easeTo({ center: riderNow, duration: view.speed === 0 ? 0 : 260, easing: (x) => x });
  }, [map, follow, riderNow, sel, view.speed]);
  // the opinion wash
  const opinionOn = settings.opinion && !!game.state?.opinion;
  const values = useMemo(() => (opinionOn ? opinionValues(game.state, opinionView) : null), [opinionOn, game.state?.opinion, opinionView]); // eslint-disable-line react-hooks/exhaustive-deps
  const zoneSel = sel?.type === 'zone' ? Number(sel.id) : null;
  const opinionFc = useMemo(() => (values ? opinionPolys(base?.zones ?? null, values, zoneSel) : null), [values, base, zoneSel]);
  useStreamedSource(map, OPINION_ZONES, opinionFc);
  const wx = weatherOn(date, game.state?.seed ?? 2010);
  const tempC = game.state ? temperatureAt(wx, view.time) : undefined;
  const openOpinion = () => {
    setSel({ type: 'opinion', id: 'city' });
    changeSettings({ opinion: true });
  };

  useEffect(() => {
    if (!map || !net || !follow || sel?.type !== 'vehicle') return;
    const trip = net.playback.trips.find((x) => x.id === sel.id);
    const v = trip && net.playback.stateOf(trip, view.service);
    if (v) map.easeTo({ center: v.lonlat, duration: view.speed === 0 ? 0 : 260, easing: (x) => x });
  }, [map, net, follow, sel, view.service, view.speed]);

  const network = useMemo(() => (net ? { lines: networkLines(net.network, net.demand), stops: networkStops(net.network, net.playback),
    zones: zonePoints(net.zones, net.demand), loads: loadLines(net.network, net.demand) } : undefined), [net]);
  const padding = useMemo(() => paddingFor(layout, !!sel), [layout, sel]);
  const planLayers = useMemo(() => {
    if (!plan.active) return undefined;
    const d = draftFeatures(plan.draft, plan.waypoints);
    return { draftLine: d.line, draftPoints: d.points, iso: isoPolys(net?.zones ?? null, plan.isoMinutes), isoOrigin: plan.isoOrigin };
  }, [plan.active, plan.draft, plan.waypoints, plan.isoMinutes, plan.isoOrigin, net]);
  const routeNames = useMemo(() => new Map((base?.network.routes ?? []).map((r) => [r.id, r.shortName])), [base]);
  const nextChange = game.state ? fmtDate(nextServiceChange(game.state.date), settings.lang, 'short') : '';
  const schedule = game.state ? {
    label: t.schedulePlan(nextChange),
    onSchedule: () => {
      game.schedule([...game.state!.pending, ...plan.edits]);
      plan.reset();
    },
    pending: game.state.pending.length ? t.scheduledNote(game.state.pending.length, nextChange) : null,
    onCancel: game.unschedule,
  } : undefined;
  const dock = plan.active ? <PlanDock plan={plan} t={t} onOpenScorecard={() => setSel({ type: 'scorecard', id: 'plan' })} routeNames={routeNames}
    schedule={schedule} /> : null;
  const inService = useMemo(() => (net ? vehiclesNow(net.playback, view.service, serviceDayNow()).length : 0), [net, view.service, serviceDayNow]);
  const routeName = useCallback((id: string) => {
    const r = game.operation?.network.routes.find((x) => x.id === id) ?? base?.network.routes.find((x) => x.id === id);
    return r?.shortName ?? id.replace(/^oct-/, '');
  }, [game.operation, base]);
  const holiday = game.state && serviceDay(date) === 'sunday' && new Date(`${date}T12:00:00Z`).getUTCDay() !== 0;
  const openRidership = () => setSel({ type: 'ridership', id: '2011' });

  return (
    <>
      <MapView style={{ palette: pal, lang: settings.lang, buildings3d: settings.buildings3d, terrain: true, baseUrl, history: params.has('history'), network,
        riders: settings.riders, plan: planLayers, opinion: opinionOn, rider: persona?.color ?? null }}
        padding={padding} onMap={setMap} />
      <Snow active={pal.snow} night={pal.night} still={still} />
      <div className="vignette" />
      <Hud layout={layout} t={t} settings={settings} map={map} onChange={changeSettings}
        time={view.time} speed={view.speed} onSpeed={(s) => !game.decision && clock.setSpeed(s)} inService={inService}
        status={net?.network.status ?? null} statusNote={net?.network.statusNote}
        inspector={sel && net ? (sel.type === 'scorecard' ? <ScorecardPanel plan={plan} t={t} />
          : sel.type === 'budget' ? <BudgetPanel game={game} t={t} lang={settings.lang} />
          : sel.type === 'opinion' ? <OpinionPanel game={game} t={t} lang={settings.lang} view={opinionView} setView={(v) => { setOpinionView(v); changeSettings({ opinion: true }); }}
            onPersona={(id) => setSel({ type: 'persona', id })} />
          : sel.type === 'zone' ? <ZonePanel game={game} index={Number(sel.id)} t={t} lang={settings.lang} onPersona={(id) => setSel({ type: 'persona', id })} />
          : sel.type === 'persona' ? <PersonaPanel game={game} id={sel.id} t={t} lang={settings.lang} now={view.service} />
          : <Inspector sel={sel} net={net} t={view.service} s={t} lang={settings.lang} palette={pal} onSelect={setSel} plan={plan}
            game={game.state} routeName={routeName} day={serviceDayNow()} />) : null}
        planActive={plan.active} onTogglePlan={() => plan.setActive(!plan.active)} dock={dock}
        dateLabel={game.state ? fmtDate(game.state.date, settings.lang) : undefined}
        dateShort={game.state ? fmtDate(game.state.date, settings.lang, 'short') : undefined}
        dayNote={holiday ? t.holidayService : undefined}
        treasury={<TreasuryChip game={game} t={t} lang={settings.lang} onClick={() => setSel({ type: 'budget', id: 'books' })} />}
        onCloseInspector={() => setSel(null)} onOpenCatalogue={() => setSel({ type: 'catalogue', id: '2010' })}
        boardings={net?.demand?.summary.boardings ?? null}
        ridersChip={<DailyRidersChip game={game} t={t} lang={settings.lang} fallback={net?.demand?.summary.boardings ?? null} onClick={openRidership} />}
        approval={<ApprovalChip game={game} t={t} lang={settings.lang} onClick={openOpinion} />} hasOpinion={!!game.state?.opinion} tempC={tempC} />
      {!params.has('nodecision') && <DecisionCard game={game} t={t} lang={settings.lang} />}
      <NewsToasts game={game} t={t} lang={settings.lang} />
      {!params.has('nodecision') && <FrontPageCard game={game} t={t} lang={settings.lang} />}
    </>
  );
}
