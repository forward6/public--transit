import { formatClock, type Lang, type NetRoute, type Provenance } from '@otc/shared';
import type { NetworkState } from '../network/useNetwork';
import type { Strings } from '../i18n/strings';
import type { Palette } from '../map/palettes';

export type Selection = { type: 'stop' | 'route' | 'vehicle' | 'corridor'; id: string } | null;

interface Props {
  sel: Exclude<Selection, null>;
  net: NetworkState;
  t: number;
  s: Strings;
  lang: Lang;
  palette: Palette;
  onSelect: (sel: Selection) => void;
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

export function Inspector({ sel, net, t, s, palette, onSelect }: Props) {
  const { network, playback } = net;

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
    const deps = playback.departures(stop.id, t, 6);
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
        <ProvenanceNote p={stop.provenance} s={s} />
      </div>
    );
  }

  if (sel.type === 'route') {
    const route = playback.routes.get(sel.id);
    if (!route) return <Empty s={s} text={sel.id} />;
    const pats = route.patterns.map((id) => playback.pattern(id)!).filter(Boolean);
    const now = playback.vehiclesAt(t).filter((v) => v.routeId === route.id).length;
    const tripsToday = playback.trips.filter((x) => x.routeId === route.id).length;
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
        {route.weekday && <>
          <div className="sec">{s.weekdayService}</div>
          <ul className="periods">{route.weekday.map((p) => (
            <li key={p.from}><span>{p.from}–{p.to}</span><b>{s.every} {p.headwayMin} min</b></li>
          ))}</ul>
        </>}
        <div className="sec">{s.directions}</div>
        <ul className="periods">{pats.map((p) => (
          <li key={p.id}><span>→ {p.headsign}</span><b>{p.stops.length} {s.stopsWord}</b></li>
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

function Empty({ s, text }: { s: Strings; text: string }) {
  return <div className="ins"><p className="muted">{text || s.vehicleGone}</p></div>;
}

