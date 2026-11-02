// How a bus run, a route or a stop is doing: riders on a typical day like today (± how much days
// vary), yesterday against its typical day, the same day last week; for a route, riders per trip and
// per bus-hour, what a rider costs and how much the fares cover; for a stop, how it ranks.
// Riders come from the demand model on the network in operation, scaled day by day like the
// network's (season, growth, fares, reliability, the day of the week, the weather).
import { ECONOMY_2010, type DemandFile, type GameState, type Lang, type NetRoute } from '@otc/shared';
import { addDays, dayBoardings, dayFactor, monthBoardings, rampValue, routeDayBoardings, serviceDay, weatherOn, weatherRiders, type Playback, type Trip } from '@otc/sim';
import { useMemo } from 'react';
import type { Strings } from '../i18n/strings';
import type { OnBoardFn } from './onBoard';
import { tripRuns, type ServiceDay } from '../sim/service';
import { fmtDate } from './GameUI';
import type { OpLoads } from './useGame';

const loc = (lang: Lang) => (lang === 'fr' ? 'fr-CA' : 'en-CA');
const fmt = (x: number, lang: Lang) => Math.round(x).toLocaleString(loc(lang));
const pct = (x: number, lang: Lang) => `${Math.round(x * 100)}${lang === 'fr' ? ' %' : '%'}`;
const dollars = (x: number, lang: Lang) => (lang === 'fr' ? `${x.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`
  : `$${x.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** The network's day: what a typical day like this one carries, how days vary, and the days recorded. */
export interface DayStats {
  date: string;
  kind: 'weekday' | 'saturday' | 'sunday' | 'holiday';
  /** typical riders (no weather) on a day, as a multiple of the model's weekday riders */
  typicalK: (iso: string) => number;
  /** expected today, the weather included */
  todayK: number;
  /** how much a day like this one varies (share), from the recent weeks */
  spread: number;
  /** recorded riders on a day, as a multiple of the model's weekday riders (undefined: not recorded) */
  recordedK: (iso: string) => number | undefined;
  /** a typical weekday this month */
  weekdayK: number;
}

export function dayStats(s: GameState, oc: number, date: string): DayStats {
  const start = ECONOMY_2010;
  const typical = (iso: string) => monthBoardings(s, start, iso) * dayFactor(iso, start);
  const byDate = new Map((s.daily ?? []).map((r) => [r.date, r]));
  const sd = serviceDay(date);
  const kind = sd === 'sunday' && new Date(`${date}T12:00:00Z`).getUTCDay() !== 0 ? 'holiday' : sd;
  // how much days like this one varied lately (weather mostly)
  const ratios = (s.daily ?? []).filter((r) => r.date >= addDays(date, -56) && serviceDay(r.date) === sd).map((r) => r.boardings / Math.max(1, typical(r.date)));
  let spread = 0.05;
  if (ratios.length >= 3) {
    const m = ratios.reduce((a, x) => a + x, 0) / ratios.length;
    spread = Math.min(0.15, Math.max(0.02, Math.sqrt(ratios.reduce((a, x) => a + (x - m) ** 2, 0) / ratios.length)));
  }
  return {
    date, kind, spread,
    typicalK: (iso) => typical(iso) / Math.max(1, oc),
    todayK: dayBoardings(s, start, date) / Math.max(1, oc),
    recordedK: (iso) => {
      const r = byDate.get(iso);
      return r ? r.boardings / Math.max(1, oc) : undefined;
    },
    weekdayK: monthBoardings(s, start, date) / Math.max(1, oc),
  };
}

/** A route's or a stop's riders, day by day. */
interface Series {
  typical: (iso: string) => number;
  today: number;
  recorded: (iso: string) => number | undefined;
  weekday: number;
}

/** Riders on a share of the network (a route or a stop with `w` of the model's weekday riders). */
function shareSeries(d: DayStats, w: number): Series {
  return { typical: (iso) => w * d.typicalK(iso), today: w * d.todayK, recorded: (iso) => { const k = d.recordedK(iso); return k === undefined ? undefined : w * k; },
    weekday: w * d.weekdayK };
}

/** A route you changed: riders still settling towards the new level (followed day by day). */
function rampSeries(s: GameState, routeId: string, d: DayStats): Series {
  const typical = (iso: string) => routeDayBoardings(s, routeId, ECONOMY_2010, iso) / weatherRiders(weatherOn(iso, s.seed));
  const byDate = new Map((s.daily ?? []).map((r) => [r.date, r]));
  const r = s.routeRamps![routeId]!;
  return {
    typical, today: routeDayBoardings(s, routeId, ECONOMY_2010, d.date),
    recorded: (iso) => byDate.get(iso)?.routes?.[routeId],
    weekday: rampValue(r, d.date, r.to, ECONOMY_2010) * (monthBoardings(s, ECONOMY_2010, d.date) / Math.max(1, rampValue(s.ramp, d.date, s.service.boardings, ECONOMY_2010))),
  };
}

/** The model's weekday riders for the network in operation: per route, per stop, and in all (OC Transpo). */
export function modelBasis(loads: OpLoads | null, demand: DemandFile | null): { routes: Record<string, number>; stops: Record<string, number>; oc: number } | null {
  if (loads?.byRoute) return { routes: loads.byRoute, stops: loads.byStop, oc: loads.oc };
  if (demand) return { routes: demand.routes, stops: demand.stops, oc: demand.summary.boardingsByAgency.octranspo ?? 0 };
  return null;
}

function dayLabel(d: DayStats, t: Strings, lang: Lang): string {
  const name = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${d.date}T12:00:00Z`));
  return d.kind === 'weekday' ? t.pf.dayKind.weekday(name) : t.pf.dayKind[d.kind];
}

/** Typical today ± spread, yesterday against its typical day, the same day last week. */
function DayRows({ series, d, t, lang }: { series: Series; d: DayStats; t: Strings; lang: Lang }) {
  const pf = t.pf;
  const typ = series.typical(d.date);
  const yIso = addDays(d.date, -1);
  const lwIso = addDays(d.date, -7);
  const y = series.recorded(yIso);
  const yTyp = series.typical(yIso);
  const lw = series.recorded(lwIso);
  const dev = y !== undefined && yTyp > 0 ? y / yTyp - 1 : 0;
  return (
    <>
      <li><span>{pf.typical(dayLabel(d, t, lang))}</span><b>{fmt(typ, lang)} <small className="muted">± {fmt(typ * d.spread, lang)}</small></b></li>
      {Math.abs(series.today / Math.max(1, typ) - 1) >= 0.02 && <li><span>{pf.today}</span><b>{fmt(series.today, lang)}</b></li>}
      <li><span>{pf.yesterday(fmtDate(yIso, lang, 'day'))}</span>
        {y === undefined ? <b className="muted">—</b>
          : <b>{fmt(y, lang)} <small className={Math.abs(dev) < 0.02 ? 'muted' : dev > 0 ? 'up' : 'down'}>
            {Math.abs(dev) < 0.02 ? pf.asTypical : pf.vsTypical(pct(Math.abs(dev), lang), dev > 0)}</small></b>}</li>
      {lw !== undefined && <li><span>{pf.lastWeek(fmtDate(lwIso, lang, 'day'))}</span><b>{fmt(lw, lang)}</b></li>}
    </>
  );
}

/** Weekday hours of service and trips of a route. */
function routeService(playback: Playback, routeId: string): { trips: number; hours: number } {
  let trips = 0, hours = 0;
  for (const x of playback.trips) {
    if (x.routeId !== routeId || !tripRuns(x.id, 'weekday')) continue;
    trips++;
    hours += (x.arr[x.arr.length - 1]! - x.dep[0]!) / 3600;
  }
  return { trips, hours };
}

export function RoutePerf({ route, s, loads, demand, playback, date, tripsToday, t, lang }: {
  route: NetRoute; s: GameState; loads: OpLoads | null; demand: DemandFile | null; playback: Playback; date: string; tripsToday: number; t: Strings; lang: Lang;
}) {
  const pf = t.pf;
  const basis = modelBasis(loads, demand);
  if (!basis) return null;
  const d = dayStats(s, basis.oc, date);
  const ramped = !!s.routeRamps?.[route.id];
  const w = basis.routes[route.id] ?? 0;
  if (!ramped && w <= 0) return null;
  const series = ramped ? rampSeries(s, route.id, d) : shareSeries(d, w);
  const svc = routeService(playback, route.id);
  const bus = route.mode !== 'rail' && route.agency === 'octranspo';
  const cost = svc.hours * ECONOMY_2010.costPerVehicleHour.value * s.costIndex;
  const fares = series.weekday * ECONOMY_2010.revenuePerBoarding.value * s.fareIndex;
  const netPerHour = monthBoardings(s) / Math.max(1, s.service.vehicleHours);
  return (
    <>
      <div className="sec">{pf.title}</div>
      <ul className="periods perf">
        <DayRows series={series} d={d} t={t} lang={lang} />
        {tripsToday > 0 && <li><span>{pf.perTrip}</span><b>{fmt(series.typical(date) / tripsToday, lang)}</b></li>}
        {svc.hours > 0 && <li><span>{pf.perHour}</span><b>{fmt(series.weekday / svc.hours, lang)} <small className="muted">{pf.network(fmt(netPerHour, lang))}</small></b></li>}
        {bus && svc.hours > 0 && series.weekday > 0 && <>
          <li><span>{pf.costPerRider}</span><b>{dollars(cost / series.weekday, lang)}</b></li>
          <li><span>{pf.faresCover}</span><b className={fares / cost < 0.35 ? 'down' : fares / cost > 0.6 ? 'up' : ''}>{pct(fares / cost, lang)}</b></li>
        </>}
      </ul>
      <p className="muted small">{pf.help}</p>
    </>
  );
}

/** Stops ranked by weekday boardings, once per measurement: how many board more than `v`, and of how many. */
const ranks = new WeakMap<Record<string, number>, number[]>();
function rankOf(stops: Record<string, number>, v: number): { above: number; n: number } {
  let sorted = ranks.get(stops);
  if (!sorted) ranks.set(stops, (sorted = Object.values(stops).sort((a, b) => b - a)));
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (sorted[m]! > v) lo = m + 1;
    else hi = m;
  }
  return { above: lo, n: sorted.length };
}

export function StopPerf({ stopId, s, loads, demand, playback, date, day, t, lang }: {
  stopId: string; s: GameState; loads: OpLoads | null; demand: DemandFile | null; playback: Playback; date: string; day: ServiceDay; t: Strings; lang: Lang;
}) {
  const pf = t.pf;
  const basis = modelBasis(loads, demand);
  if (!basis) return null;
  const w = basis.stops[stopId] ?? 0;
  if (w <= 0) return null;
  const d = dayStats(s, basis.oc, date);
  const series = shareSeries(d, w);
  const deps = playback.departures(stopId, 0, 5000, (id) => tripRuns(id, day)).length;
  return (
    <>
      <div className="sec">{pf.title}</div>
      <ul className="periods perf">
        <DayRows series={series} d={d} t={t} lang={lang} />
        {(() => {
          const r = rankOf(basis.stops, w);
          return <li><span>{r.above < 50 ? pf.rank(r.above + 1, fmt(r.n, lang)) : pf.busier(pct(1 - r.above / Math.max(1, r.n), lang))}</span><b /></li>;
        })()}
        {deps > 0 && <li><span>{pf.departures}</span><b>{fmt(deps, lang)} <small className="muted">{pf.perDeparture(fmt(series.typical(date) / deps, lang))}</small></b></li>}
      </ul>
    </>
  );
}

/** Boardings along a run: everyone on at the start, and each rise in the load after (a lower bound: some get off where others get on). */
function runBoardings(riders: number[]): number {
  let b = riders[0] ?? 0;
  for (let i = 1; i < riders.length; i++) b += Math.max(0, riders[i]! - riders[i - 1]!);
  return b;
}

/** One run of a route: its riders today against the route's average run, how full it gets, yesterday. */
export function RunPerf({ trip, route, riders, capacity, stopName, s, loads, demand, playback, date, day, t, lang, onRoute, onBoard }: {
  trip: Trip; route: NetRoute; riders: number[]; capacity: number; stopName: (i: number) => string; s: GameState; loads: OpLoads | null; demand: DemandFile | null;
  playback: Playback; date: string; day: ServiceDay; t: Strings; lang: Lang; onRoute: () => void; onBoard: OnBoardFn;
}) {
  const pf = t.pf;
  const boardings = runBoardings(riders);
  // the route's average run today, counted the same way
  const avg = useMemo(() => {
    let sum = 0, n = 0;
    for (const x of playback.trips) {
      if (x.routeId !== route.id || !tripRuns(x.id, day)) continue;
      const ob = onBoard(x.id);
      if (!ob || ob === 'measuring') continue;
      sum += runBoardings(ob.riders);
      n++;
    }
    return n ? sum / n : 0;
  }, [playback, route.id, day, onBoard]);
  let peak = 0, at = 0;
  riders.forEach((n, i) => {
    if (n > peak) (peak = n), (at = i);
  });
  const basis = modelBasis(loads, demand);
  const d = basis ? dayStats(s, basis.oc, date) : null;
  const ramped = !!s.routeRamps?.[route.id];
  const w = basis?.routes[route.id] ?? 0;
  const series = d && (ramped || w > 0) ? (ramped ? rampSeries(s, route.id, d) : shareSeries(d, w)) : null;
  const vs = avg > 0 ? boardings / avg - 1 : 0;
  const yIso = addDays(date, -1);
  const ranYesterday = tripRuns(trip.id, serviceDay(yIso));
  const yk = d?.recordedK(yIso);
  const yesterday = yk !== undefined && d && d.todayK > 0 ? boardings * (yk / d.todayK) : undefined;
  const shown = Math.min(peak, capacity * 1.1);
  return (
    <>
      <div className="sec">{pf.run}</div>
      <ul className="periods perf">
        <li><span>{pf.runRiders}</span><b>{pf.about(fmt(boardings, lang))}</b></li>
        {avg > 0 && <li className="note"><small className={Math.abs(vs) < 0.05 ? 'muted' : vs > 0 ? 'up' : 'down'}>{pf.runVsRoute(pct(Math.abs(vs), lang), vs >= 0, fmt(avg, lang))}</small></li>}
        {peak > 0 && riders.length > 0 && <li className="note"><small className="muted">{pf.runFullest(fmt(shown, lang), fmt(capacity, lang), pct(shown / capacity, lang), stopName(at), stopName(at + 1))}</small></li>}
        <li><span>{pf.runYesterday}</span><b>{!ranYesterday ? <small className="muted">{pf.runNotYesterday}</small> : yesterday === undefined ? '—' : pf.about(fmt(yesterday, lang))}</b></li>
        {series && <li><span><button className="link" onClick={onRoute}>{pf.routeToday}</button></span><b>{fmt(series.today, lang)}</b></li>}
      </ul>
    </>
  );
}
