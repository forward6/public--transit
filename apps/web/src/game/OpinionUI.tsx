// M6: public opinion, riders you can follow, the front page and the social feed.
import { useMemo, useState } from 'react';
import { PERSONAS, type GameState, type Lang, type OpinionAxis, type Persona, type Post, type Reason } from '@otc/shared';
import {
  OPINION_2010, districtOpinion, explainCity, explainZone, journeyPosition, opinionSummary, toApproval, weatherOn, zoneScore, type GameWorld,
  type Journey,
} from '@otc/sim';
import { fmtK, type Strings } from '../i18n/strings';
import { fmtDate } from './GameUI';
import type { GameApi } from './useGame';

export type OpinionView = 'approval' | OpinionAxis;

const loc = (lang: Lang) => (lang === 'fr' ? 'fr-CA' : 'en-CA');
const pctText = (x: number, lang: Lang, digits = 0) => `${x.toLocaleString(loc(lang), { maximumFractionDigits: digits, minimumFractionDigits: digits })}${lang === 'fr' ? ' %' : '%'}`;
const hhmm = (t: number) => `${String(Math.floor(t / 3600) % 24).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`;

/** Per zone: the value the map shows (approval points around 50%, or an axis ÷ 2). */
export function opinionValues(s: GameState | null, view: OpinionView): number[] | null {
  const o = s?.opinion;
  if (!o) return null;
  return o.service.map((_, i) => (view === 'approval' ? toApproval(zoneScore(o, i)) - 50 : o[view][i]! / 2));
}

/** The nearest station's name (within 2.5 km), else the district. */
export function zonePlace(world: GameWorld, i: number, t: Strings): string {
  const z = world.zones[i];
  if (!z) return '';
  let best = '';
  let bd = 2500;
  for (const p of world.places ?? []) {
    const d = Math.hypot((p.lon - z.lon) * 78_000, (p.lat - z.lat) * 111_000);
    if (d < bd) (bd = d), (best = p.name);
  }
  return best || t.districtName[z.district];
}

const placeText = (place: string, t: Strings) => (place.startsWith('district:') ? t.districtName[place.slice(9) as keyof Strings['districtName']] : place);

export function ApprovalChip({ game, t, lang, onClick }: { game: GameApi; t: Strings; lang: Lang; onClick: () => void }) {
  const s = game.state;
  const w = game.world;
  if (!s?.opinion || !w) return null;
  const now = opinionSummary(s.opinion, w, s.date).approval;
  const prev = s.opinion.history.length >= 2 ? s.opinion.history.at(-2)!.approval : null;
  const tone = now >= 52 ? 'good' : now <= 42 ? 'bad' : 'warn';
  return (
    <button className={`status-chip approval ${tone}`} onClick={onClick} title={t.op.title}>
      <i />{t.op.approvalChip(pctText(now, lang))}<PointsDelta now={now} prev={prev} lang={lang} />
    </button>
  );
}

/** Change in approval points since last week. */
function PointsDelta({ now, prev, lang }: { now: number; prev: number | null; lang: Lang }) {
  if (prev === null || Math.abs(now - prev) < 0.1) return null;
  return <em className={`delta ${now > prev ? 'up' : 'down'}`}>{now > prev ? '▲' : '▼'}{Math.abs(now - prev).toLocaleString(loc(lang), { maximumFractionDigits: 1, minimumFractionDigits: 1 })}</em>;
}

/** Weekly approval, with a 50% line and the service changes marked. */
function ApprovalChart({ s, t, lang }: { s: GameState; t: Strings; lang: Lang }) {
  const h = s.opinion?.history ?? [];
  const [hover, setHover] = useState<number | null>(null);
  if (h.length < 2) return null;
  const W = 340;
  const H = 110;
  const L = 30;
  const vals = h.map((x) => x.approval);
  let lo = Math.floor(Math.min(...vals, 50) / 5) * 5 - 2;
  let hi = Math.ceil(Math.max(...vals, 50) / 5) * 5 + 2;
  if (hi - lo < 14) (lo -= 3), (hi += 3);
  const x = (i: number) => L + ((W - L - 4) * i) / Math.max(1, h.length - 1);
  const y = (v: number) => 8 + ((H - 24) * (hi - v)) / (hi - lo);
  const shown = hover ?? h.length - 1;
  const cur = h[shown]!;
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (((e.clientX - r.left) / r.width) * W - L) / (W - L - 4);
    setHover(Math.max(0, Math.min(h.length - 1, Math.round(fx * (h.length - 1)))));
  };
  const ticks = [];
  for (let v = Math.ceil(lo / 5) * 5; v <= hi; v += 5) ticks.push(v);
  const changes = (s.changes ?? []).map((c) => ({ c, i: h.findIndex((r) => r.date >= c.date) })).filter((x) => x.i > 0);
  return (
    <figure className="daily approval-chart">
      <figcaption><span>{fmtDate(cur.date, lang, 'short')}</span><b>{pctText(cur.approval, lang, 1)}</b></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.op.history} onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setHover(null)}>
        {ticks.map((v) => <g key={v} className="grid"><line x1={L} x2={W} y1={y(v)} y2={y(v)} className={v === 50 ? 'mid' : ''} />
          <text x={L - 3} y={y(v) + 3}>{v}%</text></g>)}
        {changes.map(({ c, i }) => <g key={c.date} className="change"><line x1={x(i)} x2={x(i)} y1={6} y2={H - 16} /></g>)}
        <polyline className="line" points={h.map((r, i) => `${x(i)},${y(r.approval)}`).join(' ')} />
        <circle className="dot" cx={x(shown)} cy={y(cur.approval)} r={3.5} />
        <text className="tick" x={L} y={H - 3}>{fmtDate(h[0]!.date, lang, 'mon')}</text>
        <text className="tick end" x={W - 2} y={H - 3}>{fmtDate(h.at(-1)!.date, lang, 'mon')}</text>
      </svg>
    </figure>
  );
}

/** Diverging bars for reasons, in approval points. */
function ReasonBars({ reasons, t, lang }: { reasons: Reason[]; t: Strings; lang: Lang }) {
  const w = OPINION_2010.weights;
  const rows = reasons.filter((r) => r.key !== 'mood').map((r) => ({ ...r, pts: (w[r.axis] * r.value) / 2 }))
    .filter((r) => Math.abs(r.pts) >= 0.05).sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts)).slice(0, 9);
  const max = Math.max(4, ...rows.map((r) => Math.abs(r.pts)));
  return (
    <ul className="reasons">{rows.map((r) => (
      <li key={`${r.axis}:${r.key}`} title={t.op.reasonHelp[r.key]}>
        <span>{t.op.reason[r.key]}<small>{t.op.axis[r.axis]}</small></span>
        <i className="track"><i className={r.pts >= 0 ? 'pos' : 'neg'} style={{ width: `${(50 * Math.abs(r.pts)) / max}%`, [r.pts >= 0 ? 'left' : 'right']: '50%' }} /></i>
        <b className={r.pts >= 0 ? 'up' : 'down'}>{r.pts >= 0 ? '+' : '−'}{Math.abs(r.pts).toLocaleString(loc(lang), { maximumFractionDigits: 1, minimumFractionDigits: 1 })}</b>
      </li>
    ))}</ul>
  );
}

function AxisBars({ values, t, lang }: { values: Record<OpinionAxis, number>; t: Strings; lang: Lang }) {
  return (
    <ul className="reasons axes">{(['service', 'value', 'trust'] as OpinionAxis[]).map((a) => (
      <li key={a} title={t.op.axisHelp[a]}>
        <span>{t.op.axis[a]}</span>
        <i className="track"><i className={values[a] >= 0 ? 'pos' : 'neg'} style={{ width: `${Math.min(50, Math.abs(values[a]))}%`, [values[a] >= 0 ? 'left' : 'right']: '50%' }} /></i>
        <b>{values[a] >= 0 ? '+' : '−'}{Math.abs(values[a]).toLocaleString(loc(lang), { maximumFractionDigits: 0 })}</b>
      </li>
    ))}</ul>
  );
}

export function PersonaCard({ p, s, t, lang, onClick }: { p: Persona; s: GameState; t: Strings; lang: Lang; onClick: () => void }) {
  const last = s.diaries?.[p.id]?.at(-1);
  return (
    <li><button className="persona-card" onClick={onClick}>
      <i className="avatar" style={{ background: p.color }}>{p.name[0]}</i>
      <span><b>{p.name}, {p.age}</b><small>{p.role[lang]}</small>
        {last && <em className={`mood m${Math.sign(last.mood)}`}>{diaryLine(last, p, s, t)}</em>}</span>
    </button></li>
  );
}

function diaryLine(e: NonNullable<GameState['diaries']>[string][number], p: Persona, s: GameState, t: Strings): string {
  const rt = s.routines?.[p.id];
  const delta = rt?.prev !== undefined ? rt.minutes - rt.prev : 0;
  const pickNote = e.out?.none ? e.out : [e.out, e.back].filter(Boolean).sort((a, b) => (b!.waitMin + b!.late) - (a!.waitMin + a!.late))[0];
  return t.op.diary[e.kind](pickNote, p, delta);
}

export function postText(post: Post, t: Strings): { author: string; place: string; text: string; color?: string } {
  const persona = post.author.persona ? PERSONAS.find((p) => p.id === post.author.persona) : undefined;
  const reason = String(post.params.reason ?? '');
  const reasonText = (post.kind === 'praise' ? t.op.reasonGood : t.op.reasonBad)[reason as keyof Strings['op']['reasonBad']] ?? '';
  return {
    author: persona?.name ?? post.author.name,
    place: persona ? persona.home.name : placeText(post.author.place, t),
    text: t.op.post(post, persona, reasonText),
    color: persona?.color,
  };
}

export function Feed({ posts, t, lang, limit = 8 }: { posts: Post[]; t: Strings; lang: Lang; limit?: number }) {
  const items = posts.slice(-limit).reverse().map((p) => ({ p, ...postText(p, t) })).filter((x) => x.text);
  if (!items.length) return <p className="muted small">{t.op.feedEmpty}</p>;
  return (
    <ul className="feed">{items.map(({ p, author, place, text, color }) => (
      <li key={p.id} className={p.tone}>
        <i className="avatar" style={{ background: color ?? '#8794AB' }}>{author[0]}</i>
        <div><b>{author}</b><small> · {place} · {fmtDate(p.date, lang, 'day')}</small><p>{text}</p></div>
      </li>
    ))}</ul>
  );
}

export function FrontPageView({ page, t, lang, compact = false }: { page: NonNullable<GameState['press']>[number]; t: Strings; lang: Lang; compact?: boolean }) {
  const persona = (id: unknown) => PERSONAS.find((p) => p.id === id);
  const [lead, ...rest] = page.stories;
  if (!lead) return null;
  const L = t.op.story[lead.kind](lead.params, persona(lead.params.persona));
  return (
    <article className={`front-page ${compact ? 'compact' : ''}`} lang={lang}>
      <header><b>{t.op.outlet}</b><span>{t.op.pageDate(page.month)}</span></header>
      <h3 className={lead.tone}>{L.head}</h3>
      <p className="deck">{L.deck}</p>
      {!compact && rest.length > 0 && <ul>{rest.map((st, i) => {
        const x = t.op.story[st.kind](st.params, persona(st.params.persona));
        return <li key={i} className={st.tone}><b>{x.head}</b><span>{x.deck}</span></li>;
      })}</ul>}
      <footer>{t.op.approvalBox(pctText(page.approval, lang, 1))}</footer>
    </article>
  );
}

const SEEN_KEY = 'otc.press.seen';

/** The month's front page, once, when it comes out (dismissable; it waits behind decisions). */
export function FrontPageCard({ game, t, lang }: { game: GameApi; t: Strings; lang: Lang }) {
  const page = game.state?.press?.at(-1);
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY) ?? '';
    } catch {
      return '';
    }
  });
  if (!page || page.month <= seen || game.decision) return null;
  const close = () => {
    setSeen(page.month);
    try {
      localStorage.setItem(SEEN_KEY, page.month);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="front-wrap" role="dialog" aria-label={t.op.outlet}>
      <div className="front-card">
        <button className="close" aria-label={t.op.dismiss} onClick={close}>×</button>
        <FrontPageView page={page} t={t} lang={lang} />
      </div>
    </div>
  );
}

const OTTAWA_DISTRICTS = ['downtown', 'inner', 'suburbs', 'rural'] as const;

export function OpinionPanel({ game, t, lang, view, setView, onPersona }: {
  game: GameApi; t: Strings; lang: Lang; view: OpinionView; setView: (v: OpinionView) => void; onPersona: (id: string) => void;
}) {
  const s = game.state;
  const w = game.world;
  const city = useMemo(() => (s?.opinion && w ? opinionSummary(s.opinion, w, s.date) : null), [s, w]);
  const reasons = useMemo(() => (s?.opinion && w ? explainCity(s, w) : []), [s, w]);
  const districts = useMemo(() => (s?.opinion && w ? districtOpinion(s.opinion, w, s.date) : null), [s, w]);
  if (!s?.opinion || !w || !city) return <div className="ins"><p className="muted">{t.op.feedEmpty}</p></div>;
  const prev = s.opinion.history.length >= 2 ? s.opinion.history.at(-2)!.approval : null;
  return (
    <div className="ins">
      <div className="ins-head"><div className="ins-icon" style={{ background: '#1F7A80' }} />
        <div><div className="ins-title">{t.op.title}</div><div className="ins-sub">{t.op.sub}</div></div></div>
      <div className="approval-big"><b>{pctText(city.approval, lang, 1)}</b><span>{t.op.approval}</span>
        <PointsDelta now={city.approval} prev={prev} lang={lang} /></div>
      <ApprovalChart s={s} t={t} lang={lang} />
      <div className="sec">{t.op.axisPicker}</div>
      <div className="seg wide" role="radiogroup" aria-label={t.op.axisPicker}>
        {(['approval', 'service', 'value', 'trust'] as OpinionView[]).map((v) => (
          <button key={v} role="radio" aria-checked={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{t.op.axis[v]}</button>
        ))}
      </div>
      <AxisBars values={city} t={t} lang={lang} />
      <div className="sec">{t.op.why}</div>
      <ReasonBars reasons={reasons} t={t} lang={lang} />
      <p className="muted small">{t.op.whyNote}</p>
      {districts && <>
        <div className="sec">{t.op.byDistrict}</div>
        <ul className="bars">{OTTAWA_DISTRICTS.filter((d) => districts[d]).map((d) => {
          const a = districts[d]!.approval;
          return <li key={d}><span>{t.districtName[d]}</span><i style={{ width: `${Math.max(2, Math.min(100, (a - 30) * 2.5))}%`, background: a >= 50 ? '#1F7A80' : '#B4462E' }} />
            <b>{pctText(a, lang)}</b></li>;
        })}</ul>
      </>}
      <div className="sec">{t.op.ridersToFollow}</div>
      <ul className="personas">{PERSONAS.map((p) => <PersonaCard key={p.id} p={p} s={s} t={t} lang={lang} onClick={() => onPersona(p.id)} />)}</ul>
      {(s.press?.length ?? 0) > 0 && <>
        <div className="sec">{t.op.newsroom}</div>
        <div className="pages">{s.press!.slice(-3).reverse().map((pg) => <FrontPageView key={pg.month} page={pg} t={t} lang={lang} compact />)}</div>
      </>}
      <div className="sec">{t.op.feed}</div>
      <Feed posts={s.posts ?? []} t={t} lang={lang} />
      <p className="muted small">{OPINION_2010.source}</p>
    </div>
  );
}

export function ZonePanel({ game, index, t, lang, onPersona }: { game: GameApi; index: number; t: Strings; lang: Lang; onPersona: (id: string) => void }) {
  const s = game.state;
  const w = game.world;
  if (!s?.opinion || !w || !w.zones[index]) return null;
  const z = w.zones[index]!;
  const o = s.opinion;
  const approval = toApproval(zoneScore(o, index));
  const los = s.los ?? w.baseLos;
  const reasons = explainZone(s, w, index);
  const near = PERSONAS.filter((p) => Math.hypot((p.home.lon - z.lon) * 78_000, (p.home.lat - z.lat) * 111_000) < 2500);
  const minutes = (x: number) => `${x.toLocaleString(loc(lang), { maximumFractionDigits: 1 })} min`;
  return (
    <div className="ins">
      <div className="ins-head"><div className="ins-icon" style={{ background: approval >= 50 ? '#1F7A80' : '#B4462E' }} />
        <div><div className="ins-title">{zonePlace(w, index, t)}</div><div className="ins-sub">{t.op.zoneSub(t.districtName[z.district])}</div></div></div>
      <div className="grid3">
        <div><b>{pctText(approval, lang)}</b><span>{t.op.approval}</span></div>
        <div><b>{fmtK(z.pop)}</b><span>{t.op.residents}</span></div>
        <div><b>{pctText(100 * (w.share[index] ?? 0), lang)}</b><span>{t.op.transitShare}</span></div>
      </div>
      <AxisBars values={{ service: o.service[index]!, value: o.value[index]!, trust: o.trust[index]! }} t={t} lang={lang} />
      <div className="sec">{t.op.why}</div>
      <ReasonBars reasons={reasons} t={t} lang={lang} />
      <ul className="periods">
        <li><span>{t.op.jobsIn45}</span><b>{fmtK(los.access[index]!)} <small className="muted">{t.op.was2010(fmtK(w.baseLos.access[index]!))}</small></b></li>
        <li><span>{t.op.typicalWait}</span><b>{minutes(los.wait[index]!)} <small className="muted">{t.op.was2010(minutes(w.baseLos.wait[index]!))}</small></b></li>
      </ul>
      {near.length > 0 && <>
        <div className="sec">{t.op.livesHere}</div>
        <ul className="personas">{near.map((p) => <PersonaCard key={p.id} p={p} s={s} t={t} lang={lang} onClick={() => onPersona(p.id)} />)}</ul>
      </>}
    </div>
  );
}

function legLines(j: Journey, world: GameWorld, t: Strings, dest: string): { time: number; text: string; kind: string }[] {
  const out: { time: number; text: string; kind: string }[] = [];
  const name = (id?: string) => (id ? world.stopName?.(id) ?? id : '');
  for (const l of j.legs) {
    const min = Math.max(1, Math.round((l.to - l.from) / 60));
    if (l.kind === 'walk') out.push({ time: l.from, text: t.op.leg.walk(min), kind: 'walk' });
    else if (l.kind === 'wait') out.push({ time: l.from, text: t.op.leg.wait(min, name(l.stop)), kind: 'wait' });
    else out.push({ time: l.from, text: t.op.leg.ride(world.routeName?.(l.routeId!) ?? l.routeId!, name(l.alightStop)), kind: 'ride' });
  }
  out.push({ time: j.arrive, text: t.op.leg.arrive(dest), kind: 'end' });
  return out;
}

/** "Follow a rider": who they are, where they are now, their trips and their diary. */
export function PersonaPanel({ game, id, t, lang, now }: { game: GameApi; id: string; t: Strings; lang: Lang; now: number }) {
  const p = PERSONAS.find((x) => x.id === id);
  const s = game.state;
  const w = game.world;
  if (!p || !s || !w) return null;
  const trips = w.trips?.[p.id];
  const rt = s.routines?.[p.id];
  const routeNames = trips?.out ? trips.out.routes.map((r) => w.routeName?.(r) ?? r).join(' → ') : '';
  const where = (() => {
    const travels = p.days.includes(new Date(`${s.date}T12:00:00Z`).getUTCDay());
    for (const j of [trips?.out, trips?.back]) {
      const at = travels && j ? journeyPosition(j, now) : null;
      if (!at) continue;
      if (at.leg.kind === 'walk') return t.op.now.walking;
      if (at.leg.kind === 'wait') return t.op.now.waiting(w.stopName?.(at.leg.stop ?? '') ?? '');
      return t.op.now.riding(w.routeName?.(at.leg.routeId ?? '') ?? '');
    }
    const atWork = (p.out < p.back ? now > p.out && now < p.back : now > p.out || now < p.back) && travels;
    return atWork ? t.op.now.away(p.dest.name) : t.op.now.home;
  })();
  const wx = weatherOn(s.date, s.seed);
  const diary = (s.diaries?.[p.id] ?? []).slice(-10).reverse();
  return (
    <div className="ins">
      <div className="ins-head"><i className="avatar big" style={{ background: p.color }}>{p.name[0]}</i>
        <div><div className="ins-title">{p.name}, {p.age}</div><div className="ins-sub">{p.role[lang]}</div></div></div>
      <div className="pill">{where} · {wx.low}/{wx.high} °C, {t.op.weather[wx.kind]}</div>
      <p className="muted small">{t.op.travels(p.days.map((d) => t.op.dayNames[d]).join(', '))} · {p.home.name} ↔ {p.dest.name}</p>
      <p className="riders-line">{rt && rt.minutes < 999 ? t.op.usualTrip(rt.minutes, routeNames) : trips ? t.op.noUsualTrip : ''}</p>
      {trips && <>
        <div className="sec">{t.op.todayTrips}</div>
        {([['out', trips.out, p.dest.name], ['back', trips.back, p.home.name]] as const).map(([k, j, dest]) => (
          <div key={k} className="trip">
            <div className="trip-head">{k === 'out' ? t.op.out : t.op.back} · {hhmm(k === 'out' ? p.out : p.back)}</div>
            {j ? <ol className="timeline">{legLines(j, w, t, dest).map((l, i) => (
              <li key={i} className={`leg-${l.kind}`}><time>{hhmm(l.time)}</time><span>{l.text}</span></li>
            ))}</ol> : <p className="muted small">{t.op.noUsualTrip}</p>}
          </div>
        ))}
      </>}
      <div className="sec">{t.op.diaryTitle}</div>
      {diary.length ? <ul className="diary">{diary.map((e) => (
        <li key={e.date} className={`mood m${Math.sign(e.mood)}`}>
          <small>{fmtDate(e.date, lang, 'day')} · {t.op.mood(e.mood)}</small>
          <p>{diaryLine(e, p, s, t)}</p>
        </li>
      ))}</ul> : <p className="muted small">{t.op.noDiary}</p>}
    </div>
  );
}
