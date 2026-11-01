import { useEffect, useMemo, useState } from 'react';
import type { Map as MLMap } from 'maplibre-gl';
import { LANGS, SEASONS, TIMES, type Lang, type Season, type TimeOfDay } from '@otc/shared';
import { MapView, type CameraPadding } from './map/MapView';
import { palette } from './map/palettes';
import { STRINGS } from './i18n/strings';
import { Hud, type Settings } from './ui/Hud';
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
  };
}

// ?safe=top,bottom simulates device safe areas (screenshots); real devices use env()
if (params.get('safe')) {
  const [top = '0', bottom = '0'] = params.get('safe')!.split(',');
  document.documentElement.style.setProperty('--safe-top', `${top}px`);
  document.documentElement.style.setProperty('--safe-bottom', `${bottom}px`);
}

function paddingFor(layout: Layout): CameraPadding {
  const safeTop = Number(params.get('safe')?.split(',')[0] ?? 0);
  if (layout === 'phone') return { top: 70 + safeTop, bottom: 190, left: 0, right: 0 };
  if (layout === 'tablet') return { top: 84, bottom: 0, left: 0, right: 0 };
  return { top: 92, bottom: 0, left: 0, right: 0 };
}

export function App() {
  const layout = useLayout(params.get('layout') as Layout | null);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [map, setMap] = useState<MLMap | null>(null);
  const pal = palette(settings.season, settings.time);
  const t = STRINGS[settings.lang];
  const still = params.has('still') || matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
  }, [settings, layout, pal.night, t.appName]);

  const baseUrl = useMemo(() => new URL(import.meta.env.BASE_URL, location.href).href, []);
  const padding = useMemo(() => paddingFor(layout), [layout]);

  return (
    <>
      <MapView style={{ palette: pal, lang: settings.lang, buildings3d: settings.buildings3d, terrain: true, baseUrl, history: params.has('history') }}
        padding={padding} onMap={setMap} />
      <Snow active={pal.snow} night={pal.night} still={still} />
      <div className="vignette" />
      <Hud layout={layout} t={t} settings={settings} map={map} onChange={(s) => setSettings((prev) => ({ ...prev, ...s }))} />
    </>
  );
}
