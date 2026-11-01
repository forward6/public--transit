import { useEffect, useMemo, useState } from 'react';
import type { MapMouseEvent, Map as MLMap } from 'maplibre-gl';
import { LANGS, SEASONS, TIMES, parseClock, type Lang, type Season, type TimeOfDay } from '@otc/shared';
import { MapView, type CameraPadding } from './map/MapView';
import { palette } from './map/palettes';
import { PICKABLE } from './map/style';
import { STRINGS } from './i18n/strings';
import { loadLines, networkLines, networkStops, zonePoints } from './network/geojson';
import { useNetwork } from './network/useNetwork';
import { useVehicleAnimation } from './network/useVehicleAnimation';
import { createClock, type SpeedIndex } from './sim/clock';
import { Hud, type Settings } from './ui/Hud';
import { Inspector, type Selection } from './ui/Inspector';
import { Snow } from './ui/Snow';
import { useLayout, type Layout } from './ui/useLayout';

const params = new URLSearchParams(location.search);
const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  const v = params.get(key);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
};

function initialSettings(): Settings {
  const navLang: Lang = navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  return {
    season: pick<Season>('season', SEASONS, 'winter'),
    time: pick<TimeOfDay>('time', TIMES, 'day'),
    lang: pick<Lang>('lang', LANGS, navLang),
    buildings3d: params.get('3d') !== '0',
    riders: params.get('riders') === '1',
  };
}

// ?safe=top,bottom simulates device safe areas (screenshots); real devices use env()
if (params.get('safe')) {
  const [top = '0', bottom = '0'] = params.get('safe')!.split(',');
  document.documentElement.style.setProperty('--safe-top', `${top}px`);
  document.documentElement.style.setProperty('--safe-bottom', `${bottom}px`);
}

// The game clock: ?t=HH:MM sets the start time (default: the AM peak), ?speed=0..3
const clock = createClock(parseClock(params.get('t') ?? '07:15'), Math.min(3, Math.max(0, Number(params.get('speed') ?? 1))) as SpeedIndex);

function paddingFor(layout: Layout, inspecting: boolean): CameraPadding {
  const safeTop = Number(params.get('safe')?.split(',')[0] ?? 0);
  if (layout === 'phone') return { top: 70 + safeTop, bottom: inspecting ? 330 : 250, left: 0, right: 0 };
  if (layout === 'tablet') return { top: 84, bottom: 0, left: 0, right: inspecting ? 360 : 0 };
  return { top: 92, bottom: 0, left: 0, right: inspecting ? 400 : 0 };
}

/** Re-render a few times per second with the clock's time (the map animates independently). */
function useClockView() {
  const [view, setView] = useState({ time: clock.now(), speed: clock.speed() });
  useEffect(() => {
    const id = setInterval(() => setView({ time: clock.now(), speed: clock.speed() }), 250);
    const unsub = clock.subscribe(() => setView({ time: clock.now(), speed: clock.speed() }));
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
  const pal = palette(settings.season, settings.time);
  const t = STRINGS[settings.lang];
  const still = params.has('still') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const baseUrl = useMemo(() => new URL(import.meta.env.BASE_URL, location.href).href, []);
  const net = useNetwork(baseUrl);
  const view = useClockView();
  useVehicleAnimation(map, net?.playback ?? null, clock);

  useEffect(() => {
    document.body.className = `theme-${pal.night ? 'night' : 'day'} layout-${layout}`;
    document.documentElement.lang = settings.lang;
    document.title = `${t.appName} — 2010`;
    const q = new URLSearchParams(location.search);
    q.set('season', settings.season);
    q.set('time', settings.time);
    q.set('lang', settings.lang);
    if (settings.buildings3d) q.delete('3d');
    else q.set('3d', '0');
    if (settings.riders) q.set('riders', '1');
    else q.delete('riders');
    history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
  }, [settings, layout, pal.night, t.appName]);

  // ?select=stop:carleton opens an inspector on load (handy for links and screenshots)
  useEffect(() => {
    const s = params.get('select');
    if (s && net) {
      const [type, id] = s.split(':') as [Exclude<Selection, null>['type'], string];
      if (type === 'vehicle') {
        const v = net.playback.vehiclesAt(clock.now()).find((x) => x.routeId === id) ?? net.playback.vehiclesAt(clock.now())[0];
        if (v) setSel({ type: 'vehicle', id: v.tripId });
      } else setSel({ type, id });
    }
  }, [net]);

  // pick vehicles, stations, routes and corridors
  useEffect(() => {
    if (!map) return;
    const onClick = (e: MapMouseEvent) => {
      const layers = PICKABLE.filter((l) => map.getLayer(l));
      const box: [[number, number], [number, number]] = [[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]];
      const f = map.queryRenderedFeatures(box, { layers })[0];
      if (!f) return setSel(null);
      const p = f.properties as Record<string, string>;
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
  useEffect(() => setFollow(sel?.type === 'vehicle'), [sel]);
  useEffect(() => {
    if (!map) return;
    const stop = () => setFollow(false);
    map.on('dragstart', stop);
    return () => {
      map.off('dragstart', stop);
    };
  }, [map]);
  useEffect(() => {
    if (!map || !net || !follow || sel?.type !== 'vehicle') return;
    const trip = net.playback.trips.find((x) => x.id === sel.id);
    const v = trip && net.playback.stateOf(trip, view.time);
    if (v) map.easeTo({ center: v.lonlat, duration: view.speed === 0 ? 0 : 260, easing: (x) => x });
  }, [map, net, follow, sel, view.time, view.speed]);

  const network = useMemo(() => (net ? { lines: networkLines(net.network, net.demand), stops: networkStops(net.network, net.playback),
    zones: zonePoints(net.zones, net.demand), loads: loadLines(net.network, net.demand) } : undefined), [net]);
  const padding = useMemo(() => paddingFor(layout, !!sel), [layout, sel]);
  const inService = useMemo(() => net?.playback.vehiclesAt(view.time).length ?? 0, [net, view.time]);

  return (
    <>
      <MapView style={{ palette: pal, lang: settings.lang, buildings3d: settings.buildings3d, terrain: true, baseUrl, history: params.has('history'), network,
        riders: settings.riders }}
        padding={padding} onMap={setMap} />
      <Snow active={pal.snow} night={pal.night} still={still} />
      <div className="vignette" />
      <Hud layout={layout} t={t} settings={settings} map={map} onChange={(s) => setSettings((prev) => ({ ...prev, ...s }))}
        time={view.time} speed={view.speed} onSpeed={(s) => clock.setSpeed(s)} inService={inService}
        status={net?.network.status ?? null} statusNote={net?.network.statusNote}
        inspector={sel && net ? <Inspector sel={sel} net={net} t={view.time} s={t} lang={settings.lang} palette={pal} onSelect={setSel} /> : null}
        onCloseInspector={() => setSel(null)} onOpenCatalogue={() => setSel({ type: 'catalogue', id: '2010' })}
        boardings={net?.demand?.summary.boardings ?? null} onOpenRidership={() => setSel({ type: 'ridership', id: '2011' })} />
    </>
  );
}
