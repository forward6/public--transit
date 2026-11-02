// M9: growth in the game: the Growth view's map wash, the Growth panel, a zone's growth, a
// developer's offer, and the month in review (after skipping a month).
import { GROWTH_PLACES, RESIDENTS_PER_HOME, WARDS_2010, type GameEvent, type GameState, type Lang, type ZonesFile } from '@otc/shared';
import {
  GROWTH, constructionNear, growthStations, growthSummary, monthBoardings, opinionSummary, roomLeft, startGrowth, zoneNow, type GameWorld,
} from '@otc/sim';
import type { Strings } from '../i18n/strings';
import type { PolysFC } from '../network/geojson';
import { eventText, fmtDate, money } from './GameUI';
import { zonePlace } from './OpinionUI';
import type { GameApi, MonthSkip } from './useGame';

const loc = (lang: Lang) => (lang === 'fr' ? 'fr-CA' : 'en-CA');
const fmt = (x: number, lang: Lang) => Math.round(x).toLocaleString(loc(lang));
const signed = (x: number, lang: Lang) => `${x >= 0 ? '+' : '−'}${fmt(Math.abs(x), lang)}`;
const pct = (x: number, lang: Lang, digits = 0) => `${(100 * x).toLocaleString(loc(lang), { maximumFractionDigits: digits, minimumFractionDigits: digits })}${lang === 'fr' ? ' %' : '%'}`;
const jobsOf = (z: { jobs: Record<string, number | undefined> }) => Object.values(z.jobs).reduce<number>((a, x) => a + (x ?? 0), 0);

/**
 * The Growth view's wash: new residents and jobs per km² since 2010 (negative: jobs lost beside
 * construction); zones beside a street being torn up for a line are outlined.
 */
export function growthPolys(zones: ZonesFile | null, s: GameState | null, selected: number | null): PolysFC {
  const g = s?.growth;
  if (!zones || !s) return { type: 'FeatureCollection', features: [] };
  const building = constructionNear(s, zones.zones);
  const features: PolysFC['features'] = [];
  zones.zones.forEach((z, i) => {
    if (!z.ring) return;
    const d = (g?.pop[i] ?? 0) + (g?.jobs[i] ?? 0);
    const site = (building?.[i] ?? 0) > 0.25;
    const v = Math.round(d / Math.max(0.2, z.areaKm2));
    if (Math.abs(v) < 5 && !site && i !== selected) return; // a handful per km²: not worth a wash
    features.push({ type: 'Feature', properties: { i, v: Math.abs(v) < 5 ? 0 : v, coarse: z.areaKm2 > 2, selected: i === selected, building: site },
      geometry: { type: 'Polygon', coordinates: [[...z.ring, z.ring[0]!]] } });
  });
  features.sort((a, b) => Number(b.properties!.coarse) - Number(a.properties!.coarse));
  return { type: 'FeatureCollection', features };
}

/** The legend's ramp for the Growth view. */
export function GrowthLegend({ t }: { t: Strings }) {
  return (
    <div className="lg-growth">
      <div className="lg-title-sm">{t.gr.legend}</div>
      <div className="lg-ramp-row"><span>{t.gr.legendLow}</span><span className="lg-ramp growth" /><span>{t.gr.legendHigh}</span></div>
      <div className="lg-row small"><i className="sw sw-lost" />{t.gr.legendLost}</div>
      <div className="lg-row small"><i className="sw sw-building" />{t.gr.legendBuilding}</div>
    </div>
  );
}

/** Growth since 2010: how much, where, month by month, the fastest-growing places, developers' offers. */
export function GrowthPanel({ game, t, lang, onZone }: { game: GameApi; t: Strings; lang: Lang; onZone: (i: number) => void }) {
  const s = game.state;
  const w = game.world;
  if (!s || !w) return null;
  const gr = t.gr;
  const g = s.growth ?? startGrowth(w.zones.length, s.date);
  const sum = growthSummary(g);
  const pop0 = w.zones.reduce((a, z) => a + z.pop, 0);
  const jobs0 = w.zones.reduce((a, z) => a + jobsOf(z), 0);
  const months = g.history.slice(-24);
  const peak = Math.max(1, ...months.map((m) => m.pop));
  const W = 300, H = 60;
  const bw = W / Math.max(12, months.length);
  // the last twelve months' fastest-growing zones
  const year = new Map<number, [number, number]>();
  for (const m of g.history.slice(-12)) for (const [i, p, j] of m.top) {
    const cur = year.get(i) ?? [0, 0];
    year.set(i, [cur[0] + p, cur[1] + j]);
  }
  const top = [...year.entries()].sort((a, b) => b[1][0] + b[1][1] - a[1][0] - a[1][1]).slice(0, 5);
  const totalWhere = Math.max(1, GROWTH_PLACES.reduce((a, k) => a + sum.where[k], 0));
  return (
    <div className="ins growth">
      <div className="ins-head"><div className="ins-icon growth-icon" /><div>
        <div className="ins-title">{gr.title}</div><div className="ins-sub">{gr.sub}</div></div></div>
      <div className="grid3">
        <div><b>{fmt(pop0 + sum.pop, lang)}</b><span>{gr.residents}<br />{gr.since2010(signed(sum.pop, lang))}</span></div>
        <div><b>{fmt(jobs0 + sum.jobs, lang)}</b><span>{gr.jobs}<br />{gr.since2010(signed(sum.jobs, lang))}</span></div>
        <div><b>{g.riders >= 1 ? '+' : ''}{pct(g.riders - 1, lang, 1)}</b><span>{gr.ridersFromGrowth}</span></div>
      </div>

      <div className="sec">{gr.whereTitle}</div>
      <div className="growth-bar" role="img" aria-label={GROWTH_PLACES.map((k) => `${gr.place[k]} ${pct(sum.where[k] / totalWhere, lang)}`).join(', ')}>
        {GROWTH_PLACES.map((k) => <i key={k} className={`gp-${k}`} style={{ flex: sum.where[k] }} />)}
      </div>
      <ul className="periods growth-where">
        {GROWTH_PLACES.map((k) => (
          <li key={k}><span><i className={`dot gp-${k}`} />{gr.place[k]}</span><b>{sum.pop ? pct(sum.where[k] / totalWhere, lang) : '—'}</b></li>
        ))}
      </ul>
      {sum.lost > 0 && <p className="muted small">{gr.lost(fmt(sum.lost, lang))}</p>}

      <div className="sec">{gr.monthsTitle}</div>
      {months.length ? (
        <>
          <svg className="growth-months" viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label={gr.monthsHelp}>
            {months.map((m, k) => {
              const h = (m.pop / peak) * (H - 4);
              const hs = (m.where.station / peak) * (H - 4);
              return (
                <g key={m.month}>
                  <rect x={k * bw + 1} y={H - h} width={bw - 2} height={h} className="all" />
                  <rect x={k * bw + 1} y={H - hs} width={bw - 2} height={hs} className="station" />
                  {(m.month.endsWith('-01') || (k === 0 && !months[1]?.month.endsWith('-01'))) && <text x={k * bw + 1} y={H + 12} className="tick">{m.month.slice(0, 4)}</text>}
                </g>
              );
            })}
          </svg>
          <p className="muted small">{gr.monthsHelp}</p>
        </>
      ) : <p className="muted small">{gr.topNone}</p>}

      <div className="sec">{gr.topTitle}</div>
      {top.length ? (
        <ul className="periods">{top.map(([i, [p, j]]) => (
          <li key={i}><button className="link" onClick={() => onZone(i)}>{zonePlace(w, i, t)}</button>
            <b>{signed(p, lang)} · {signed(j, lang)} {gr.jobs}</b></li>
        ))}</ul>
      ) : <p className="muted small">{gr.topNone}</p>}

      <div className="sec">{gr.offersTitle}</div>
      {g.rezonings.length ? (
        <ul className="periods">{g.rezonings.slice(-6).reverse().map((r) => (
          <li key={r.id}><span>{gr.offer(fmt(r.homes, lang), r.station)} <small className="muted">{fmtDate(r.date, lang, 'mon')}</small></span>
            <b className={r.status === 'approved' ? 'up' : r.status === 'refused' || r.status === 'declined' ? 'down' : ''}>{gr.status[r.status]}</b></li>
        ))}</ul>
      ) : <p className="muted small">{gr.offersNone}</p>}

      <div className="sec">{gr.howTitle}</div>
      {gr.how.map((x, k) => <p key={k} className="muted small">{x}</p>)}
    </div>
  );
}

/** One zone's growth: then and now, room left, reach by transit and by car, and why it grows (or doesn't). */
export function GrowthZonePanel({ game, index, t, lang }: { game: GameApi; index: number; t: Strings; lang: Lang }) {
  const s = game.state;
  const w = game.world;
  if (!s || !w || !w.zones[index]) return null;
  const gr = t.gr;
  const z = w.zones[index]!;
  const g = s.growth ?? startGrowth(w.zones.length, s.date);
  const now = zoneNow(w, g, index);
  const { room } = roomLeft(s, w, g);
  const los = s.los && s.los.access.length === w.zones.length ? s.los : w.baseLos;
  const stations = growthStations(s, w);
  let near = { name: '', d: Infinity };
  for (const st of stations) {
    const d = Math.hypot((st.lon - z.lon) * 78_300, (st.lat - z.lat) * 111_100);
    if (d < near.d) near = { name: st.name, d };
  }
  const building = (constructionNear(s, w.zones)?.[index] ?? 0) > 0.25;
  const rz = g.room[index];
  const better = (los.access[index]! + 1e4) / (w.baseLos.access[index]! + 1e4);
  const why = building ? gr.why.building : room[index]! < 50 ? gr.why.full : near.d < GROWTH.stationM ? gr.why.station
    : better > 1.15 || los.access[index]! > 150_000 ? gr.why.transit : room[index]! > 500 ? gr.why.room : gr.why.quiet;
  const m = (d: number) => (d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toLocaleString(loc(lang), { maximumFractionDigits: 1 })} km`);
  return (
    <div className="ins growth">
      <div className="ins-head"><div className="ins-icon growth-icon" /><div>
        <div className="ins-title">{zonePlace(w, index, t)}</div><div className="ins-sub">{gr.zoneSub(gr.district[z.district] ?? z.district)}</div></div></div>
      <ul className="periods then-now">
        <li><span /><b className="muted">{gr.then}</b><b>{gr.now}</b></li>
        <li><span>{gr.residents}</span><b className="muted">{fmt(z.pop, lang)}</b><b>{fmt(now.pop, lang)} <small className={g.pop[index]! > 0 ? 'up' : ''}>{signed(g.pop[index] ?? 0, lang)}</small></b></li>
        <li><span>{gr.jobs}</span><b className="muted">{fmt(jobsOf(z), lang)}</b><b>{fmt(now.jobs, lang)} <small className={(g.jobs[index] ?? 0) < 0 ? 'down' : (g.jobs[index] ?? 0) > 0 ? 'up' : ''}>{signed(g.jobs[index] ?? 0, lang)}</small></b></li>
        <li><span>{gr.transitReach}</span><b className="muted">{fmt(w.baseLos.access[index]!, lang)}</b><b>{fmt(los.access[index]!, lang)}</b></li>
      </ul>
      <p className="riders-line">{why}</p>
      <ul className="periods">
        <li><span>{gr.roomLeft}</span><b>{gr.roomHomes(fmt(room[index]! / RESIDENTS_PER_HOME, lang))}</b></li>
        {w.carAccess && <li><span>{gr.carReach}</span><b>{fmt(w.carAccess[index]!, lang)}</b></li>}
        <li><span>{near.d < 2500 ? gr.station(near.name, m(near.d)) : gr.noStation}</span><b /></li>
      </ul>
      {building && <p className="muted small">{gr.building}</p>}
      {rz && <p className="muted small">{gr.rezoned(fmt(rz[0] / RESIDENTS_PER_HOME, lang))}</p>}
      <p className="muted small">{gr.reachHelp}</p>
    </div>
  );
}

export const GROWTH_KINDS = new Set(['developer']);

/** A developer's offer to build near a station if council rezones. */
export function DeveloperDecision({ game, d, t, lang }: { game: GameApi; d: GameEvent; t: Strings; lang: Lang }) {
  const gr = t.gr;
  const homes = Number(d.data.homes);
  const ward = WARDS_2010.find((x) => x.id === Number(d.data.ward))?.name[lang] ?? '';
  return (
    <>
      <h2>{gr.devTitle(String(d.data.station))}</h2>
      <p>{gr.devIntro(fmt(homes, lang), fmt(Number(d.data.jobs), lang), String(d.data.station))}{Number(d.data.newLine) ? ` ${gr.devNewLine}` : ''}</p>
      <ul className="effects">
        <li>{gr.devCharges(money(homes * GROWTH.chargePerHome, lang))}</li>
        {ward && <li>{gr.devWard(ward)}</li>}
      </ul>
      <div className="choices two">
        <button className="choice" onClick={() => game.answerDeveloper(d.id, true)}><b>{gr.devBack.title}</b><span>{gr.devBack.body}</span></button>
        <button className="choice" onClick={() => game.answerDeveloper(d.id, false)}><b>{gr.devDecline.title}</b><span>{gr.devDecline.body}</span></button>
      </div>
    </>
  );
}

/** Weekday riders this month: the network's level with the season, growth, fares and reliability (holidays aside). */
const weekdayRiders = (s: GameState) => monthBoardings(s);

function approvalOf(s: GameState, w: GameWorld | null): number | null {
  return s.opinion && w ? opinionSummary(s.opinion, w, s.date).approval : null;
}

/** After skipping a month: what changed, and what happened. */
export function MonthReview({ skip, game, t, lang, onClose, onAgain, onGrowth }: {
  skip: MonthSkip; game: GameApi; t: Strings; lang: Lang; onClose: () => void; onAgain: () => void; onGrowth: () => void;
}) {
  const gr = t.gr;
  const { before: a, after: b } = skip;
  const w = game.world;
  const newMonths = (b.growth?.history ?? []).filter((m) => m.month >= a.date.slice(0, 7) && !(a.growth?.history ?? []).some((x) => x.month === m.month));
  const pop = newMonths.reduce((x, m) => x + m.pop, 0);
  const jobs = newMonths.reduce((x, m) => x + m.jobs, 0);
  const station = newMonths.reduce((x, m) => x + m.where.station, 0);
  const edge = newMonths.reduce((x, m) => x + m.where.suburbs, 0);
  const top = newMonths.flatMap((m) => m.top).sort((x, y) => y[1] + y[2] - x[1] - x[2]).slice(0, 3);
  const ra = weekdayRiders(a), rb = weekdayRiders(b);
  const aa = approvalOf(a, w), ab = approvalOf(b, w);
  const news = b.events.filter((e) => !e.decision && e.date > a.date && e.date <= b.date && eventText(t, e, lang)).slice(-6);
  const row = (label: string, from: string, to: string, delta: number, tone: 'up' | 'down' | '' = delta > 0 ? 'up' : delta < 0 ? 'down' : '') => (
    <li><span>{label}</span><b className="muted">{from}</b><b>{to} <small className={tone}>{delta === 0 ? '' : delta > 0 ? '▲' : '▼'}</small></b></li>
  );
  return (
    <div className="decision-wrap" role="dialog" aria-modal="true" aria-label={gr.reviewTitle(fmtDate(b.date, lang))}>
      <section className="decision glass review">
        <div className="decision-kicker">{fmtDate(a.date, lang, 'short')} → {fmtDate(b.date, lang, 'short')}{skip.days < 28 ? ` · ${gr.reviewPartial(skip.days)}` : ''}</div>
        <h2>{gr.reviewTitle(fmtDate(b.date, lang, 'month'))}</h2>
        {skip.stopped && <p className="riders-line warn-line">{gr.reviewStopped}</p>}
        <ul className="periods then-now review-rows">
          {row(gr.rRiders, fmt(ra, lang), fmt(rb, lang), Math.round(rb - ra))}
          {aa !== null && ab !== null && row(gr.rApproval, pct(aa / 100, lang), pct(ab / 100, lang), Math.round((ab - aa) * 10))}
          {row(gr.rReserve, money(a.reserve, lang), money(b.reserve, lang), Math.round((b.reserve - a.reserve) / 1e5))}
          {row(gr.rCapital, money(a.capitalReserve, lang), money(b.capitalReserve, lang), Math.round((b.capitalReserve - a.capitalReserve) / 1e5))}
          {a.council && b.council && row(gr.rCapitalPC, fmt(a.council.capital, lang), fmt(b.council.capital, lang), Math.round(b.council.capital - a.council.capital))}
          {row(gr.rGrowthRiders, pct((a.growth?.riders ?? 1) - 1, lang, 1), pct((b.growth?.riders ?? 1) - 1, lang, 1), Math.round(((b.growth?.riders ?? 1) - (a.growth?.riders ?? 1)) * 1e4))}
        </ul>
        {pop > 0 && (
          <>
            <p className="riders-line">{gr.rResidents} <b>{signed(pop, lang)}</b> · {gr.rJobs} <b>{signed(jobs, lang)}</b></p>
            <p className="muted small">{gr.rWhere(pct(station / pop, lang), pct(edge / pop, lang))}{w && top.length ? ` · ${top.map(([i]) => zonePlace(w, i, t)).join(', ')}` : ''}</p>
          </>
        )}
        <div className="sec">{gr.rNews}</div>
        {news.length ? <ul className="review-news">{news.map((e) => <li key={e.id}><small className="muted">{fmtDate(e.date, lang, 'short')}</small> {eventText(t, e, lang)!(e.data, lang)}</li>)}</ul>
          : <p className="muted small">{gr.rNoNews}</p>}
        <div className="plan-actions review-actions">
          <button className="btn" onClick={onGrowth}>{gr.openGrowth}</button>
          <button className="btn" onClick={onClose}>{gr.close}</button>
          {!skip.stopped && <button className="btn primary" onClick={onAgain}>{gr.again}</button>}
        </div>
      </section>
    </div>
  );
}
