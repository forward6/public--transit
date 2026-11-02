// Where the load is: the morning peak hour's riders against the capacity scheduled on every stretch.
import type { Lang, LngLat, Network } from '@otc/shared';
import { loadLevel, type LoadReport, type SegmentLoad } from '@otc/sim';
import { LOAD_COLORS } from '../map/style';
import type { Palette } from '../map/palettes';
import type { Strings } from '../i18n/strings';
import { RouteBadge } from '../ui/Inspector';

export type LoadMode = 'crowding' | 'daily';

const loc = (lang: Lang) => (lang === 'fr' ? 'fr-CA' : 'en-CA');
const LEVELS = ['calm', 'busy', 'crowded', 'over'] as const;

function levelColor(lf: number, night: boolean): string {
  return (night ? LOAD_COLORS.night : LOAD_COLORS.day)[LEVELS.indexOf(loadLevel(lf))]!;
}

function Stretch({ x, net, t, lang, palette, onFocus, onRoute }: { x: SegmentLoad; net: Network; t: Strings; lang: Lang; palette: Palette;
  onFocus: (c: LngLat) => void; onRoute: (id: string) => void }) {
  const stop = (id: string) => net.stops.find((s) => s.id === id)?.name ?? id;
  // trunk routes first: rail, Transitway, frequent, then the rest by number
  const rank = { otrain: 0, commuter: 0, streetcar: 1, transitway: 1, frequent: 2, local: 3, peak: 4, sto: 5, rural: 6 } as const;
  const routes = x.routes.map((r) => net.routes.find((q) => q.id === r)).filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => rank[a.class] - rank[b.class] || a.shortName.localeCompare(b.shortName, undefined, { numeric: true })).slice(0, 3);
  const pct = `${Math.round(100 * x.lf)}${lang === 'fr' ? ' %' : '%'}`;
  return (
    <li>
      <button className="stretch" onClick={() => onFocus(x.coords[Math.floor(x.coords.length / 2)]!)}>
        <i className="lvl" style={{ background: levelColor(x.lf, palette.night) }} />
        <span><b>{t.ld.between(stop(x.from), stop(x.to))}</b>
          <small>{t.ld.perHour(Math.round(x.peakHour).toLocaleString(loc(lang)))} · {pct}</small></span>
      </button>
      <div className="badges">{routes.map((r) => <RouteBadge key={r.id} route={r} palette={palette} onClick={() => onRoute(r.id)} />)}
        {x.routes.length > 3 && <em className="muted small">+{x.routes.length - 3}</em>}</div>
    </li>
  );
}

export function LoadPanel({ report, byStop, scale, net, t, lang, palette, mode, setMode, onFocus, onSelect }: {
  report: LoadReport | null; byStop: Record<string, number> | null; scale: number; net: Network; t: Strings; lang: Lang; palette: Palette;
  mode: LoadMode; setMode: (m: LoadMode) => void; onFocus: (c: LngLat) => void; onSelect: (type: 'route' | 'stop', id: string) => void;
}) {
  const head = (
    <div className="ins-head"><div className="ins-icon" style={{ background: levelColor(1.2, palette.night) }} />
      <div><div className="ins-title">{t.ld.title}</div><div className="ins-sub">{t.ld.sub}</div></div></div>
  );
  const modes = (
    <div className="seg wide" role="radiogroup" aria-label={t.ld.title}>
      {(['crowding', 'daily'] as LoadMode[]).map((m) => (
        <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{t.ld.mode[m]}</button>
      ))}
    </div>
  );
  if (!report) return <div className="ins">{head}{modes}<p className="notice">{t.ld.measuring}</p></div>;
  const segs = report.segments;
  const busiest = [...segs].sort((a, b) => b.peakHour - a.peakHour).slice(0, 8);
  const crowded = segs.filter((x) => x.peakHour >= 150).sort((a, b) => b.lf - a.lf).slice(0, 8);
  const over = segs.filter((x) => loadLevel(x.lf) === 'over').length;
  const crowdedN = segs.filter((x) => loadLevel(x.lf) === 'crowded').length;
  const routes = report.routes.filter((r) => r.maxLf >= 0.9).slice(0, 8);
  const stations = Object.entries(byStop ?? {}).filter(([id]) => net.stops.find((x) => x.id === id)?.kind === 'station')
    .sort((a, b) => b[1] - a[1]).slice(0, 8);
  const stop = (id: string) => net.stops.find((s) => s.id === id)?.name ?? id;
  const n = (x: number) => Math.round(x).toLocaleString(loc(lang));
  const common = { net, t, lang, palette, onFocus, onRoute: (id: string) => onSelect('route', id) };
  return (
    <div className="ins">
      {head}
      {modes}
      <div className="grid3">
        <div><b>{n(over)}</b><span>{t.ld.over}</span></div>
        <div><b>{n(crowdedN)}</b><span>{t.ld.crowded}</span></div>
        <div><b>{n(busiest[0]?.peakHour ?? 0)}</b><span>{t.ld.busiestPeak}</span></div>
      </div>
      <ul className="load-legend">{LEVELS.map((l, i) => (
        <li key={l}><i style={{ background: (palette.night ? LOAD_COLORS.night : LOAD_COLORS.day)[i] }} />{t.ld.level[l]}</li>
      ))}</ul>
      <div className="sec">{t.ld.busiest}</div>
      <ul className="stretches">{busiest.map((x) => <Stretch key={`${x.from}|${x.to}`} x={x} {...common} />)}</ul>
      <div className="sec">{t.ld.mostCrowded}</div>
      <ul className="stretches">{crowded.map((x) => <Stretch key={`${x.from}|${x.to}`} x={x} {...common} />)}</ul>
      {routes.length > 0 && <>
        <div className="sec">{t.ld.routesUnderPressure}</div>
        <ul className="periods">{routes.map((r) => {
          const route = net.routes.find((q) => q.id === r.routeId);
          if (!route) return null;
          return (
            <li key={r.routeId}><span className="route-load"><RouteBadge route={route} palette={palette} onClick={() => onSelect('route', route.id)} />
              <small>{t.ld.between(stop(r.from), stop(r.to))}</small></span>
              <b style={{ color: levelColor(r.maxLf, palette.night) }}>{Math.round(100 * r.maxLf)}{lang === 'fr' ? ' %' : '%'}</b></li>
          );
        })}</ul>
      </>}
      {stations.length > 0 && <>
        <div className="sec">{t.ld.busiestStations}</div>
        <ul className="periods">{stations.map(([id, b]) => (
          <li key={id}><button className="link" onClick={() => onSelect('stop', id)}>{stop(id)}</button><b>{n(b * scale)} <small className="muted">{t.ld.perDay}</small></b></li>
        ))}</ul>
      </>}
      <p className="muted small">{t.ld.note}</p>
    </div>
  );
}
