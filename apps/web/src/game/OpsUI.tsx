// The Operations panel: the fleet and the network right now — vehicles in service, riders on
// board, capacity running against the whole fleet's, buses spare or in the shop, trains by line,
// missed trips, the fullest vehicles, and the day's curve of vehicles on the road.
import { useMemo } from 'react';
import { BUS_TYPES, formatClock, type GameState, type Lang, type NetRoute } from '@otc/shared';
import { TYPE_CAPACITY, VEHICLE_CAPACITY, fleetNow, segmentNow, type Playback } from '@otc/sim';
import type { Strings } from '../i18n/strings';
import type { Palette } from '../map/palettes';
import { tripRuns, vehiclesNow, type ServiceDay } from '../sim/service';
import { RouteBadge } from '../ui/Inspector';
import { money } from './GameUI';
import { crowdOf, shownRiders, type OnBoardFn } from './onBoard';

const fmt = (x: number, lang: Lang) => Math.round(x).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA');
const pct = (x: number, lang: Lang) => `${Math.round(x * 100)}${lang === 'fr' ? ' %' : '%'}`;
const pct1 = (x: number, lang: Lang) => `${(x * 100).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA', { maximumFractionDigits: 1 })}${lang === 'fr' ? ' %' : '%'}`;

interface Props {
  state: GameState;
  playback: Playback;
  /** service time (s after the service day's midnight) */
  t: number;
  day: ServiceDay;
  onBoard: OnBoardFn;
  s: Strings;
  lang: Lang;
  palette: Palette;
  onVehicle: (tripId: string) => void;
}

export function OpsPanel({ state, playback, t, day, onBoard, s, lang, palette, onVehicle }: Props) {
  const o = s.ops;
  const fleet = fleetNow(state);
  // the day's curve of vehicles on the road (weekday timetable), once per network
  const curve = useMemo(() => playback.serviceCurve(600), [playback]);
  const tripsToday = useMemo(() => playback.trips.filter((x) => playback.routes.get(x.routeId)?.agency === 'octranspo' && tripRuns(x.id, day)).length,
    [playback, day]);
  const now = useMemo(() => {
    const vs = vehiclesNow(playback, t, day);
    let buses = 0;
    let sto = 0;
    let cap = 0;
    let riders = 0;
    let measuring = false;
    const lines = new Map<string, { route: NetRoute; running: number }>();
    const full: { tripId: string; route: NetRoute; headsign: string; riders: number; cap: number; seats: number }[] = [];
    for (const v of vs) {
      const r = playback.routes.get(v.routeId);
      if (!r) continue;
      if (r.agency !== 'octranspo') {
        sto++;
        continue;
      }
      const c = VEHICLE_CAPACITY[r.class];
      cap += c;
      if (r.mode === 'rail') {
        const l = lines.get(r.id) ?? { route: r, running: 0 };
        l.running++;
        lines.set(r.id, l);
      } else buses++;
      const ob = onBoard(v.tripId);
      if (ob === 'measuring') measuring = true;
      else if (ob) {
        const p = playback.pattern(v.patternId);
        const n = ob.riders[segmentNow(v.stopIndex, v.dwelling, p?.stops.length ?? 2)] ?? 0;
        riders += n;
        full.push({ tripId: v.tripId, route: r, headsign: p?.headsign ?? '', riders: n, cap: ob.capacity, seats: ob.seats });
      }
    }
    full.sort((a, b) => b.riders / b.cap - a.riders / a.cap);
    return { buses, sto, cap, riders, measuring, lines: [...lines.values()], full: full.slice(0, 5) };
  }, [playback, t, day, onBoard]);
  const trainsOwned = (routeId: string) => (routeId.startsWith('line-')
    ? state.projects?.find((p) => p.id === routeId)?.estimate.vehicles ?? 0 : fleet.trains);
  const linesCap = (state.projects ?? []).filter((p) => p.phase === 'open' && p.design.mode !== 'busway')
    .reduce((a, p) => a + p.estimate.vehicles * (p.design.mode === 'commuter' ? VEHICLE_CAPACITY.commuter : VEHICLE_CAPACITY.otrain), 0);
  const maxCap = fleet.maxCapacity + fleet.trains * TYPE_CAPACITY.rail + linesCap;
  const trainsRunning = now.lines.reduce((a, l) => a + l.running, 0);
  const trainRoutes = playback.network.routes.filter((r) => r.mode === 'rail' && r.agency === 'octranspo');
  const spare = Math.max(0, fleet.available - now.buses);
  const short = Math.max(0, fleet.peakNeed - fleet.available);
  const peak = Math.max(...curve);
  const nowIdx = Math.round((t - 4 * 3600) / 600);
  const W = 300;
  const H = 54;
  const x = (i: number) => (i / Math.max(1, curve.length - 1)) * W;
  const y = (v: number) => H - 4 - (v / Math.max(1, peak)) * (H - 8);
  const path = curve.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const load = now.cap ? now.riders / now.cap : 0;
  return (
    <div className="ins ops">
      <div className="ins-head"><div className="ins-icon ops-icon" /><div>
        <div className="ins-title">{o.title}</div><div className="ins-sub">{o.sub(formatClock(t))}</div></div></div>
      <div className="grid3">
        <div><b>{fmt(now.buses + trainsRunning, lang)}</b><span>{o.inService}<br />{o.buses(fmt(now.buses, lang))}{trainsRunning ? ` · ${o.trains(fmt(trainsRunning, lang))}` : ''}</span></div>
        <div><b>{now.measuring ? '…' : fmt(now.riders, lang)}</b><span>{o.onBoard}</span></div>
        <div><b>{fmt(now.cap, lang)}</b><span>{o.capacityNow}{!now.measuring && now.cap ? <><br />{o.load(pct(load, lang))}</> : null}</span></div>
      </div>
      {now.measuring && <p className="muted small">{o.measuring}</p>}

      <div className="sec">{o.capacity}</div>
      <div className="ops-bar" role="img" aria-label={o.capacityBar(fmt(now.cap, lang), fmt(maxCap, lang))}>
        <i className="cap" style={{ width: `${Math.min(100, (100 * now.cap) / Math.max(1, maxCap))}%` }} />
        <i className="ride" style={{ width: `${Math.min(100, (100 * now.riders) / Math.max(1, maxCap))}%` }} />
      </div>
      <p className="muted small">{o.capacityBar(fmt(now.cap, lang), fmt(maxCap, lang))}. {o.capacityHelp}</p>

      <div className="sec">{o.fleet}</div>
      <div className="fleet-bar" role="img" aria-label={`${o.running} ${now.buses} · ${o.spare} ${spare} · ${o.shop} ${fleet.inShop}`}>
        <i className="running" style={{ flex: now.buses }} /><i className="spare" style={{ flex: spare }} /><i className="shop" style={{ flex: fleet.inShop }} />
      </div>
      <ul className="periods fleet-list">
        <li><span><i className="dot running" />{o.running}</span><b>{fmt(now.buses, lang)}</b></li>
        <li><span><i className="dot spare" />{o.spare}</span><b>{fmt(spare, lang)}</b></li>
        <li><span><i className="dot shop" />{o.shop}</span><b className={fleet.shopShare > 0.1 ? 'down' : ''}>{fmt(fleet.inShop, lang)}</b></li>
        <li><span>{o.owned}</span><b>{fmt(fleet.buses, lang)}</b></li>
        {fleet.onOrder > 0 && <li><span>{o.onOrder}</span><b>{fmt(fleet.onOrder, lang)}</b></li>}
      </ul>
      <p className="muted small">{o.shopHelp(pct(fleet.shopShare, lang))} {o.peakNeed(fmt(fleet.peakNeed, lang), fmt(fleet.required, lang))}{' '}
        <b className={short ? 'down' : 'up'}>{short ? o.short(fmt(short, lang)) : o.enough}</b></p>
      <ul className="periods">{fleet.byType.map((b) => (
        <li key={b.type}><span>{lang === 'fr' ? BUS_TYPES[b.type].label_fr : BUS_TYPES[b.type].label} · {o.age(String(b.avgAge).replace('.', lang === 'fr' ? ',' : '.'))}</span><b>{fmt(b.count, lang)}</b></li>
      ))}</ul>

      <div className="sec">{o.trainsTitle}</div>
      <ul className="periods">
        {trainRoutes.map((route) => ({ route, running: now.lines.find((l) => l.route.id === route.id)?.running ?? 0 })).map((l) => (
          <li key={l.route.id}><span><RouteBadge route={l.route} palette={palette} /> {l.route.id.startsWith('line-') ? l.route.longName.split(':')[0] : ''}</span>
            <b>{o.of(fmt(l.running, lang), fmt(trainsOwned(l.route.id), lang))}</b></li>
        ))}
      </ul>

      <div className="sec">{o.reliability}</div>
      <p className="riders-line">{o.missed(pct1(fleet.missed, lang), fmt(fleet.missed * tripsToday, lang))}</p>
      <p className="muted small">{fleet.backlog > 0 ? o.backlog(money(fleet.backlog, lang)) : o.noBacklog} · {o.avgAge(String(fleet.avgAge).replace('.', lang === 'fr' ? ',' : '.'))}</p>

      <div className="sec">{o.busiest}</div>
      {now.full.length ? (
        <ul className="periods busiest">{now.full.map((v) => {
          const crowd = crowdOf(v.riders, v.seats, v.cap);
          return (
            <li key={v.tripId}><button className="link" onClick={() => onVehicle(v.tripId)}>
              <RouteBadge route={v.route} palette={palette} /> <span>→ {v.headsign}</span></button>
              <b className={`crowd-${crowd}`}>{fmt(shownRiders(v.riders, v.cap), lang)} / {fmt(v.cap, lang)}</b></li>
          );
        })}</ul>
      ) : <p className="muted small">{now.measuring ? o.measuring : o.none}</p>}
      {now.full.length > 0 && <p className="muted small">{o.busiestHelp}</p>}

      <div className="sec">{o.day}</div>
      <svg className="ops-curve" viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label={o.dayHelp(fmt(peak, lang))}>
        <path d={`${path} L${W},${H} L0,${H} Z`} className="area" />
        <path d={path} className="line" />
        {nowIdx >= 0 && nowIdx < curve.length && <><line x1={x(nowIdx)} x2={x(nowIdx)} y1={0} y2={H} className="now" />
          <circle cx={x(nowIdx)} cy={y(curve[nowIdx] ?? 0)} r={3.5} className="dot" /></>}
        {[6, 9, 12, 15, 18, 21, 24].map((h) => <text key={h} x={x((h - 4) * 6)} y={H + 12} className="tick">{h % 24}h</text>)}
      </svg>
      <p className="muted small">{o.dayHelp(fmt(peak, lang))}{now.sto ? ` · ${o.sto(fmt(now.sto, lang))}` : ''}</p>
    </div>
  );
}

