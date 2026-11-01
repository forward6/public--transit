// Riders day by day (the campaign): the daily chart with service changes marked, the routes to watch
// after a change, and their trends.
import { useState } from 'react';
import type { DayRecord, GameState, Lang } from '@otc/shared';
import { rampValue, serviceDay } from '@otc/sim';
import { fmtK, type Strings } from '../i18n/strings';
import { fmtDate } from './GameUI';

const WINDOW = 84; // twelve weeks
const W = 340;
const H = 132;
const TOP = 16; // room for change labels
const BOTTOM = 16; // room for month ticks
const LEFT = 26; // room for the axis labels

function niceStep(max: number): number {
  for (const s of [10_000, 25_000, 50_000, 100_000, 200_000, 250_000, 500_000]) if (max / s <= 4) return s;
  return 1_000_000;
}

const weekBefore = (daily: DayRecord[], i: number) => daily[i - 7];

/** Change on the same day a week earlier, as a signed percentage (null if there is no such day). */
export function weekOnWeek(daily: DayRecord[]): number | null {
  const i = daily.length - 1;
  const a = daily[i];
  const b = weekBefore(daily, i);
  return a && b && b.boardings > 0 ? (100 * (a.boardings - b.boardings)) / b.boardings : null;
}

export function Delta({ pct, lang }: { pct: number | null; lang: Lang }) {
  if (pct === null || !Number.isFinite(pct) || Math.abs(pct) < 0.05) return null;
  const tone = Math.abs(pct) < 0.05 ? '' : pct > 0 ? 'up' : 'down';
  const txt = `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA', { maximumFractionDigits: 1 })}${lang === 'fr' ? ' %' : '%'}`;
  return <em className={`delta ${tone}`}>{tone === 'up' ? '▲' : tone === 'down' ? '▼' : ''}{txt}</em>;
}

/** OC Transpo boardings for each of the last twelve weeks of days; dashed lines mark service changes. */
export function DailyChart({ state, t, lang }: { state: GameState; t: Strings; lang: Lang }) {
  const daily = (state.daily ?? []).slice(-WINDOW);
  const [hover, setHover] = useState<number | null>(null);
  if (daily.length < 2) return <p className="muted small">{t.dailyEmpty}</p>;
  const slot = (W - LEFT) / Math.max(28, daily.length); // the chart fills up over the first weeks, then scrolls
  const x0 = W - daily.length * slot; // the newest day sits at the right edge
  const gap = slot > 6 ? 2 : 1;
  const max = Math.max(...daily.map((d) => d.boardings)) * 1.08;
  const step = niceStep(max);
  const y = (v: number) => TOP + (H - TOP - BOTTOM) * (1 - v / max);
  const index = new Map(daily.map((d, i) => [d.date, i]));
  const changes = (state.changes ?? []).filter((c) => index.has(c.date));
  const shown = hover ?? daily.length - 1;
  const cur = daily[shown]!;
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((((e.clientX - r.left) / r.width) * W - x0) / slot);
    setHover(i >= 0 && i < daily.length ? i : null);
  };
  return (
    <figure className="daily">
      <figcaption>
        <span>{fmtDate(cur.date, lang, 'day')}{serviceDay(cur.date) === 'sunday' && new Date(`${cur.date}T12:00:00Z`).getUTCDay() !== 0 ? ` · ${t.holiday}` : ''}</span>
        <b>{cur.boardings.toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}</b> {t.ridersWord}
        <Delta pct={weekBefore(daily, shown) ? (100 * (cur.boardings - weekBefore(daily, shown)!.boardings)) / weekBefore(daily, shown)!.boardings : null} lang={lang} />
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.dailyTitle} onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setHover(null)}>
        {Array.from({ length: Math.floor(max / step) }, (_, k) => (k + 1) * step).map((v) => (
          <g key={v} className="grid"><line x1={LEFT} x2={W} y1={y(v)} y2={y(v)} /><text x={LEFT - 3} y={y(v) + 3}>{fmtK(v)}</text></g>
        ))}
        {daily.map((d, i) => {
          const off = serviceDay(d.date) !== 'weekday';
          return <rect key={d.date} className={`bar${off ? ' off' : ''}${i === shown ? ' on' : ''}`} x={x0 + i * slot + gap / 2} width={Math.max(1, slot - gap)}
            y={y(d.boardings)} height={Math.max(0.5, y(0) - y(d.boardings))} rx={Math.min(1.5, slot / 3)} />;
        })}
        <line className="axis" x1={LEFT} x2={W} y1={y(0)} y2={y(0)} />
        {daily.filter((d) => d.date.endsWith('-01')).map((d) => (
          <text key={d.date} className="tick" x={x0 + index.get(d.date)! * slot} y={H - 3}>{fmtDate(d.date, lang, 'mon')}</text>
        ))}
        {changes.map((c) => {
          const cx = x0 + index.get(c.date)! * slot;
          return (
            <g key={c.date} className="change">
              <line x1={cx} x2={cx} y1={TOP - 4} y2={y(0)} />
              <text x={Math.min(cx + 3, W - 60)} y={TOP - 6}>{c.label.length > 18 ? `${c.label.slice(0, 17)}…` : c.label}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** A small trend line: weekday riders only, so weekends don't hide the trend. */
export function Sparkline({ values, className = '' }: { values: number[]; className?: string }) {
  if (values.length < 2) return <svg className={`spark ${className}`} viewBox="0 0 60 18" />;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(60 * i) / (values.length - 1)},${16 - (14 * v) / max}`).join(' ');
  return <svg className={`spark ${className}`} viewBox="0 0 60 18" aria-hidden><polyline points={pts} /></svg>;
}

/** Weekday riders on one route since it last changed. */
function routeSeries(state: GameState, routeId: string): number[] {
  const r = state.routeRamps?.[routeId];
  if (!r) return [];
  return (state.daily ?? []).filter((d) => d.date >= r.start && serviceDay(d.date) === 'weekday' && d.routes?.[routeId] !== undefined)
    .map((d) => d.routes![routeId]!);
}

/** How far a route has moved towards its new level (1 = settled). */
function progress(state: GameState, routeId: string): number {
  const r = state.routeRamps?.[routeId];
  if (!r || Math.abs(r.to - r.from) < 1) return 1;
  return Math.max(0, Math.min(1, (rampValue(r, state.date, r.to) - r.from) / (r.to - r.from)));
}

function lastRiders(state: GameState, routeId: string): number | undefined {
  const d = state.daily ?? [];
  for (let i = d.length - 1; i >= 0; i--) if (d[i]!.routes?.[routeId] !== undefined) return d[i]!.routes![routeId];
  return undefined;
}

/** The routes a service change touched (and the ones it pulled riders from): how they are settling. */
export function WatchedRoutes({ state, t, lang, routeName, onSelect }: {
  state: GameState; t: Strings; lang: Lang; routeName: (id: string) => string; onSelect: (routeId: string) => void;
}) {
  const ramps = Object.entries(state.routeRamps ?? {})
    .sort(([, a], [, b]) => (a.start === b.start ? Math.abs(b.to - b.from) - Math.abs(a.to - a.from) : a.start < b.start ? 1 : -1))
    .slice(0, 12);
  if (!ramps.length) return null;
  return (
    <>
      <div className="sec">{t.watchedRoutes}</div>
      <table className="watch">
        <thead><tr><th>{t.routeWord}</th><th>{t.yesterday}</th><th>{t.trend}</th><th>{t.settled}</th></tr></thead>
        <tbody>{ramps.map(([rid, r]) => {
          const gone = r.to === 0;
          const p = progress(state, rid);
          return (
            <tr key={rid}>
              <th>{gone ? routeName(rid) : <button className="link" onClick={() => onSelect(rid)}>{routeName(rid)}</button>}</th>
              <td>{gone ? '—' : (lastRiders(state, rid) ?? 0).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}</td>
              <td><Sparkline values={routeSeries(state, rid)} className={r.to >= r.from ? 'up' : 'down'} /></td>
              <td>{gone ? t.removed : `${Math.round(100 * p)}${lang === 'fr' ? ' %' : '%'}`}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <p className="muted small">{t.watchNote}</p>
    </>
  );
}

/** In a route's panel: its riders since the last change, if the game is following it. */
export function RouteTrend({ state, routeId, t, lang }: { state: GameState; routeId: string; t: Strings; lang: Lang }) {
  const r = state.routeRamps?.[routeId];
  if (!r) return null;
  const last = lastRiders(state, routeId);
  return (
    <div className="route-trend">
      <div className="sec">{t.sinceChange(fmtDate(r.start, lang, 'short'))}</div>
      <div className="trend-row">
        <Sparkline values={routeSeries(state, routeId)} className={r.to >= r.from ? 'up' : 'down'} />
        <p>{r.to === 0 ? t.removed : <>
          <b>{(last ?? Math.round(r.from)).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}</b> {t.ridersYesterdayShort}
          <span className="muted"> · {t.expectedWeekday(Math.round(r.to).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA'))}</span>
        </>}</p>
      </div>
    </div>
  );
}
