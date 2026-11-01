import { MODES, formatClock, type CatalogueClass, type District, type GameState, type Lang, type NetRoute, type Provenance } from '@otc/shared';
import type { NetworkState } from '../network/useNetwork';
import { fmtK, type Strings } from '../i18n/strings';
import type { Palette } from '../map/palettes';
import type { PlanState } from '../plan/usePlan';
import { RouteServiceEditor } from '../plan/PlanUI';
import { DailyChart, RouteTrend, WatchedRoutes } from '../game/Ridership';
import { tripRuns, vehiclesNow, type ServiceDay } from '../sim/service';

export type Selection = { type: 'stop' | 'route' | 'vehicle' | 'corridor' | 'catalogue' | 'ridership' | 'scorecard' | 'budget' | 'opinion' | 'zone' | 'persona';
  id: string } | null;

interface Props {
  sel: Exclude<Selection, null>;
  net: NetworkState;
  t: number;
  s: Strings;
  lang: Lang;
  palette: Palette;
  onSelect: (sel: Selection) => void;
  plan?: PlanState;
  /** the campaign: riders day by day */
  game?: GameState | null;
  routeName?: (id: string) => string;
  /** today's timetable (weekends run fewer trips) */
  day?: ServiceDay;
}

export function RouteBadge({ route, palette, onClick }: { route: NetRoute; palette: Palette; onClick?: () => void }) {
  return (
    <button className="route-badge" style={{ background: palette.transit[route.class] }} onClick={onClick} title={route.longName}>
      {route.shortName}
    </button>
  );
}

function ProvenanceNote({ p, s }: { p?: Provenance; s: Strings }) {
  if (!p) return null;
  return (
    <div className={`prov prov-${p.verified ? 'ok' : p.confidence}`}>
      <b>{p.verified ? s.verified : s.unverified}</b> · {s.confidence[p.confidence]}
      <span>{p.source}</span>
      {p.note && <span>{p.note}</span>}
    </div>
  );
}

const minutesUntil = (from: number, to: number) => Math.max(0, Math.round((to - from) / 60));

export function Inspector({ sel, net, t, s, lang, palette, onSelect, plan, game, routeName, day = 'weekday' }: Props) {
  const { network, playback } = net;
  const runs = (tripId: string) => tripRuns(tripId, day);

  if (sel.type === 'vehicle') {
    const trip = playback.trips.find((x) => x.id === sel.id);
    const v = trip && playback.stateOf(trip, t);
    if (!trip || !v) return <Empty s={s} text={s.vehicleGone} />;
    const route = playback.routes.get(trip.routeId)!;
    const pattern = playback.pattern(trip.patternId)!;
    const upcoming = pattern.stops.map((id, i) => ({ id, i, time: trip.arr[i]! })).filter((x) => x.i >= v.stopIndex).slice(0, 6);
    const at = playback.stops.get(pattern.stops[v.stopIndex]!)?.name ?? '';
    return (
      <div className="ins">
        <div className="ins-head"><RouteBadge route={route} palette={palette} onClick={() => onSelect({ type: 'route', id: route.id })} />
          <div><div className="ins-title">→ {pattern.headsign}</div><div className="ins-sub">{route.longName}</div></div></div>
        <div className="pill">{v.dwelling ? `${s.atStop} ${at}` : `${s.nextStop} ${at} · ${minutesUntil(t, trip.arr[v.stopIndex]!)} min`}</div>
        <div className="sec">{s.schedule}</div>
        <ol className="timeline">
          {upcoming.map((u) => (
            <li key={u.id} className={u.i === v.stopIndex ? 'now' : ''}>
              <time>{formatClock(u.time)}</time>
              <button className="link" onClick={() => onSelect({ type: 'stop', id: u.id })}>{playback.stops.get(u.id)?.name ?? u.id}</button>
            </li>
          ))}
        </ol>
        <ProvenanceNote p={route.provenance} s={s} />
      </div>
    );
  }

  if (sel.type === 'stop') {
    const stop = playback.stops.get(sel.id);
    if (!stop) return <Empty s={s} text={sel.id} />;
    const routes = playback.routesAt(stop.id);
    const deps = playback.departures(stop.id, t, 6, runs);
    return (
      <div className="ins">
        <div className="ins-head"><div className="ins-icon station" /><div><div className="ins-title">{stop.name}</div>
          <div className="ins-sub">{stop.kind === 'station' ? s.station : s.stop} · OC Transpo</div></div></div>
        {routes.length > 0 && <div className="badges">{routes.map((r) => <RouteBadge key={r.id} route={r} palette={palette} onClick={() => onSelect({ type: 'route', id: r.id })} />)}</div>}
        <div className="sec">{s.nextDepartures}</div>
        {deps.length ? (
          <ul className="deps">
            {deps.map((d) => {
              const r = playback.routes.get(d.routeId)!;
              return (
                <li key={d.tripId}>
                  <time>{formatClock(d.time)}</time>
                  <RouteBadge route={r} palette={palette} onClick={() => onSelect({ type: 'route', id: r.id })} />
                  <span>{d.headsign}</span>
                  <em>{minutesUntil(t, d.time)} min</em>
                </li>
              );
            })}
          </ul>
        ) : <p className="muted">{routes.length ? s.noMoreToday : s.awaitingRoutes}</p>}
        {net.demand && <p className="riders-line"><b>{(net.demand.stops[stop.id] ?? 0).toLocaleString()}</b> {s.stopBoardings}</p>}
        <ProvenanceNote p={stop.provenance} s={s} />
      </div>
    );
  }

  if (sel.type === 'ridership') {
    return <Ridership net={net} s={s} daily={game ? <>
      <div className="sec">{s.dailyTitle}</div>
      <DailyChart state={game} t={s} lang={lang} />
      <p className="muted small">{s.dailyNote}</p>
      <WatchedRoutes state={game} t={s} lang={lang} routeName={routeName ?? ((id) => id)} onSelect={(id) => onSelect({ type: 'route', id })} />
    </> : null} />;
  }

  if (sel.type === 'catalogue') return <Catalogue net={net} s={s} palette={palette} onSelect={onSelect} />;

  if (sel.type === 'route') {
    const route = playback.routes.get(sel.id);
    if (!route) return <Empty s={s} text={sel.id} />;
    const pats = route.patterns.map((id) => playback.pattern(id)!).filter(Boolean);
    const now = vehiclesNow(playback, t, day).filter((v) => v.routeId === route.id).length;
    const tripsToday = playback.trips.filter((x) => x.routeId === route.id && runs(x.id)).length;
    const km = Math.max(...pats.map((p) => p.stopDist[p.stopDist.length - 1] ?? 0)) / 1000;
    return (
      <div className="ins">
        <div className="ins-head"><RouteBadge route={route} palette={palette} />
          <div><div className="ins-title">{route.longName}</div><div className="ins-sub">{s.routeClass[route.class]} · {route.agency === 'sto' ? 'STO' : 'OC Transpo'}</div></div></div>
        <div className="grid3">
          <div><b>{now}</b><span>{s.inServiceNow}</span></div>
          <div><b>{tripsToday}</b><span>{s.tripsToday}</span></div>
          <div><b>{km.toFixed(1)} km</b><span>{s.length}</span></div>
        </div>
        {game?.routeRamps?.[route.id] ? <RouteTrend state={game} routeId={route.id} t={s} lang={lang} />
          : net.demand && <p className="riders-line"><b>{(net.demand.routes[route.id] ?? 0).toLocaleString()}</b> {s.routeBoardings}</p>}
        {plan?.active && <RouteServiceEditor route={route} net={net} plan={plan} t={s} />}
        {route.weekday && <>
          <div className="sec">{s.weekdayService}</div>
          <ul className="periods">{route.weekday.map((p) => (
            <li key={p.from}><span>{p.from}–{p.to}</span><b>{s.every} {p.headwayMin} min</b></li>
          ))}</ul>
        </>}
        <div className="sec">{s.directions}</div>
        <ul className="periods">{[...pats.reduce((m, p) => m.set(p.headsign, [...(m.get(p.headsign) ?? []), p]), new Map<string, typeof pats>())].map(([head, ps]) => (
          <li key={head}><span>→ {head}{ps.length > 1 && <em className="muted"> · {ps.length} {s.variants}</em>}</span>
            <b>{Math.max(...ps.map((p) => p.stops.length))} {s.stopsWord}</b></li>
        ))}</ul>
        <ProvenanceNote p={route.provenance} s={s} />
      </div>
    );
  }

  const c = network.corridors.find((x) => x.id === sel.id);
  if (!c) return <Empty s={s} text={sel.id} />;
  return (
    <div className="ins">
      <div className="ins-head"><div className="ins-icon" style={{ background: c.kind === 'rail' ? palette.transit.otrain : palette.transit.transitway }} />
        <div><div className="ins-title">{c.name}</div><div className="ins-sub">{c.kind === 'rail' ? s.railCorridor : s.busway} · OC Transpo</div></div></div>
      {network.status === 'infrastructure-only' && c.kind === 'busway' && <p className="notice">{s.awaitingRoutes}</p>}
      <ProvenanceNote p={c.provenance} s={s} />
    </div>
  );
}

const CLASS_ORDER: CatalogueClass[] = ['regular', 'peak', 'express', 'interzone', 'rural', 'event', 'early', 'school', 'partner'];

/** Every 2010 route from the dated sources: which are on the map, which are listed only. */
function Catalogue({ net, s, palette, onSelect }: { net: NetworkState; s: Strings; palette: Palette; onSelect: (sel: Selection) => void }) {
  const { network, playback } = net;
  const cat = network.catalogue ?? [];
  const mapped = network.routes.filter((r) => r.mode !== 'rail');
  const sources = [...new Set(cat.map((c) => c.source))];
  const group = (agency: string) => CLASS_ORDER.map((cls) => ({ cls, items: cat.filter((c) => c.agency === agency && c.class === cls) })).filter((g) => g.items.length);
  return (
    <div className="ins">
      <div className="ins-head"><div className="ins-icon" style={{ background: palette.transit.transitway }} />
        <div><div className="ins-title">{s.catalogueTitle}</div><div className="ins-sub">{network.statusNote}</div></div></div>
      <div className="grid3">
        <div><b>{mapped.length}</b><span>{s.catalogueMapped}</span></div>
        <div><b>{cat.filter((c) => c.agency === 'octranspo').length}</b><span>OC Transpo · {s.catalogueListed}</span></div>
        <div><b>{cat.filter((c) => c.agency === 'sto').length}</b><span>STO · {s.catalogueListed}</span></div>
      </div>
      <div className="sec">{s.catalogueOnMap}</div>
      <div className="badges">
        {network.routes.map((r) => <RouteBadge key={r.id} route={r} palette={palette} onClick={() => onSelect({ type: 'route', id: r.id })} />)}
      </div>
      {(['octranspo', 'sto'] as const).map((agency) => (
        <div key={agency}>
          <div className="sec">{agency === 'sto' ? 'STO' : 'OC Transpo'} · {s.catalogueListedLong}</div>
          {group(agency).map(({ cls, items }) => (
            <div key={cls} className="cat-row">
              <span className="cat-cls">{s.catalogueClass[cls]} <em>{items.length}</em></span>
              <span className="cat-nums">
                {items.map((c) => (
                  <i key={c.number} className={c.mapped ? 'on' : ''} title={c.termini.join(' ↔ ')}
                    onClick={c.mapped && c.routeId ? () => onSelect({ type: 'route', id: c.routeId! }) : undefined}>{c.number}</i>
                ))}
              </span>
            </div>
          ))}
        </div>
      ))}
      <div className="prov prov-medium"><b>{s.catalogueSources}</b>
        {sources.map((u) => <span key={u}>{u}</span>)}
        <span>{s.catalogueWayback}</span>
      </div>
      {playback.trips.length > 0 && <p className="muted">{playback.trips.length.toLocaleString()} {s.tripsToday}</p>}
    </div>
  );
}

const MODE_COLOR: Record<string, string> = { car: '#8A94A6', passenger: '#B7BFCC', transit: '#2D6CC0', walk: '#3FA66B', bike: '#E0A43A' };
const DISTRICT_ORDER: District[] = ['downtown', 'inner', 'hull', 'suburbs', 'gatineau', 'rural'];

/** M3: the weekday the demand model produces, and how it compares with 2011. */
function Ridership({ net, s, daily }: { net: NetworkState; s: Strings; daily: React.ReactNode }) {
  const d = net.demand;
  if (!d) return <Empty s={s} text={s.ridershipNote} />;
  const sm = d.summary;
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
  const val = (relative: boolean, x: number) => (relative ? (x >= 100 ? Math.round(x).toLocaleString() : x.toFixed(2)) : pct(x));
  return (
    <div className="ins">
      <div className="ins-head"><div className="ins-icon" style={{ background: MODE_COLOR.transit }} />
        <div><div className="ins-title">{s.ridershipTitle}</div><div className="ins-sub">{s.ridershipSub}</div></div></div>
      {daily}
      {daily && <div className="sec">{s.modelWeekday}</div>}
      <div className="grid3">
        <div><b>{fmtK(sm.trips)}</b><span>{s.tripsWeekday}</span></div>
        <div><b>{pct(sm.transitTrips / sm.trips)}</b><span>{s.byTransit}</span></div>
        <div><b>{fmtK(sm.boardings)}</b><span>{s.boardingsWeekday}</span></div>
      </div>
      <div className="sec">{s.howPeopleTravel}</div>
      <div className="modebar" role="img" aria-label={s.howPeopleTravel}>
        {MODES.map((m) => <i key={m} style={{ flexGrow: sm.tripsByMode[m], background: MODE_COLOR[m] }} />)}
      </div>
      <ul className="periods">{MODES.map((m) => (
        <li key={m}><span><i className="dot" style={{ background: MODE_COLOR[m] }} />{s.modeName[m]}</span><b>{pct(sm.tripsByMode[m] / sm.trips)}</b></li>
      ))}</ul>
      <div className="sec">{s.byAgency}</div>
      <ul className="periods">{Object.entries(sm.boardingsByAgency).map(([a, b]) => (
        <li key={a}><span>{a === 'sto' ? 'STO' : 'OC Transpo'}</span><b>{Math.round(b).toLocaleString()}</b></li>
      ))}</ul>
      <div className="sec">{s.avgTripTitle}</div>
      <p className="muted">{s.avgTripText(sm.transitTrip.ivtMin, sm.transitTrip.waitMin, sm.transitTrip.walkMin, sm.transitTrip.boardingsPerTrip)}</p>
      <div className="sec">{s.byDistrict}</div>
      <ul className="bars">{DISTRICT_ORDER.filter((k) => d.districts[k]).map((k) => {
        const share = d.districts[k]![1];
        return <li key={k}><span>{s.districtName[k]}</span><i style={{ width: `${Math.min(100, share * 250)}%` }} /><b>{pct(share)}</b></li>;
      })}</ul>
      <div className="sec">{s.calibrationTitle}</div>
      <ul className="calib">{d.calibration.map((r) => (
        <li key={r.id} className={r.pass ? 'pass' : 'fail'} title={r.source}>
          <span>{r.label}{r.estimate && <em> · {s.estimatedTarget}</em>}</span>
          <b>{val(r.relative, r.model)}</b>
          <small>{s.targetWord} {val(r.relative, r.target)} ± {r.relative ? pct(r.tolerance) : `${(100 * r.tolerance).toFixed(1)} pts`} {r.pass ? '✓' : '✗'}</small>
        </li>
      ))}</ul>
      <p className="muted small">{s.ridershipNote}</p>
    </div>
  );
}

function Empty({ s, text }: { s: Strings; text: string }) {
  return <div className="ins"><p className="muted">{text || s.vehicleGone}</p></div>;
}

