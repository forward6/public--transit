import { useEffect, useMemo, useState } from 'react';
import { BUS_TYPES, ECONOMY_2010, type BusType, type GameEvent, type Lang } from '@otc/shared';
import { addMonths, fleetStatus, missedShare, nextServiceChange, projectYear } from '@otc/sim';
import type { Strings } from '../i18n/strings';
import type { GameApi } from './useGame';
import { Delta, weekOnWeek } from './Ridership';
import { COUNCIL_KINDS, CouncilDecision } from './CouncilUI';
import { PROJECT_KINDS, ProjectDecision } from './ProjectsUI';

export function fmtDate(iso: string, lang: Lang, style: 'long' | 'short' | 'month' | 'day' | 'mon' = 'long'): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = style === 'long' ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : style === 'short' ? { day: 'numeric', month: 'short', year: 'numeric' } : style === 'day' ? { weekday: 'short', day: 'numeric', month: 'short' }
    : style === 'mon' ? { month: 'short' } : { month: 'short', year: 'numeric' };
  // build from parts, without the commas some locales add ("Wednesday, 1 December 2010")
  const parts = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-GB', { ...opts, timeZone: 'UTC' }).formatToParts(d);
  const s = parts.filter((p) => p.type !== 'literal').map((p) => p.value).join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function money(x: number, lang: Lang): string {
  const v = Math.abs(x);
  // billions: $2.22B in English, 2,22 G$ in French
  const s = v >= 1e9 ? `${(v / 1e9).toFixed(2)} ${lang === 'fr' ? 'G' : 'B'}` : v >= 1e6 ? `${(v / 1e6).toFixed(1)} M` : v >= 1e3 ? `${Math.round(v / 1e3)} k` : `${Math.round(v)}`;
  const sign = x < 0 ? '−' : '';
  return lang === 'fr' ? `${sign}${s.replace('.', ',')} $` : `${sign}$${s.replace(' ', '')}`;
}

export function TreasuryChip({ game, t, lang, onClick }: { game: GameApi; t: Strings; lang: Lang; onClick: () => void }) {
  const s = game.state;
  if (!s) return null;
  const tone = s.reserve < 0 ? 'bad' : s.reserve < 10e6 ? 'warn' : 'ok';
  return <button className={`status-chip treasury ${tone}`} onClick={onClick} title={t.budgetTitle}><i />{t.reserveChip(money(s.reserve, lang))}</button>;
}

/** Yesterday's riders, and the change from the same day a week before. */
export function DailyRidersChip({ game, t, lang, fallback, onClick }: { game: GameApi; t: Strings; lang: Lang; fallback: number | null; onClick: () => void }) {
  const daily = game.state?.daily ?? [];
  const last = daily.at(-1);
  const spinner = game.measuring && <span className="measuring" title={t.measuringNote} aria-label={t.measuringNote} />;
  if (!last) return fallback === null ? null : <button className="status-chip riders" onClick={onClick}><i />{t.ridersChip(fallback)}{spinner}</button>;
  return (
    <button className="status-chip riders" onClick={onClick} title={t.vsLastWeek}>
      <i />{t.ridersYesterday(last.boardings)}<Delta pct={weekOnWeek(daily)} lang={lang} />{spinner}
    </button>
  );
}

function Stepper({ label, value, min, max, step, fmt, onChange }: {
  label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <li className="stepper">
      <span>{label}</span>
      <button aria-label="−" disabled={value <= min} onClick={() => onChange(Math.max(min, +(value - step).toFixed(4)))}>−</button>
      <b>{fmt(value)}</b>
      <button aria-label="+" disabled={value >= max} onClick={() => onChange(Math.min(max, +(value + step).toFixed(4)))}>+</button>
    </li>
  );
}

const pct = (x: number, digits = 1, lang: Lang = 'en') => {
  const n = `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(digits)}`;
  return lang === 'fr' ? `${n.replace('.', ',')} %` : `${n}%`;
};

/** A decision that pauses the game: the annual budget, a deficit, or a fleet shortfall. */
export function DecisionCard({ game, t, lang }: { game: GameApi; t: Strings; lang: Lang }) {
  const d = game.decision;
  const s = game.state;
  const balancingPct = d?.kind === 'budget' ? 100 * (Number(d.data.balancing) / Number(d.data.last) - 1) : 0;
  const [levy, setLevy] = useState(0);
  const [fare, setFare] = useState(0);
  const [maint, setMaint] = useState(1);
  useEffect(() => {
    if (d?.kind === 'budget') {
      setLevy(Math.round(balancingPct * 2) / 2);
      setFare(0);
      setMaint(s?.maintenance ?? 1);
    }
  }, [d?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const projection = useMemo(() => {
    if (!s || d?.kind !== 'budget') return null;
    const y = Number(d.data.year);
    const from = y === 2011 && s.date < '2011-01-01' ? '2011-01-01' : `${y}-01-01`;
    const trial = { ...s, fareIndex: s.fareIndex * (1 + fare / 100), maintenance: maint };
    return projectYear(trial, ECONOMY_2010, from, Number(d.data.last) * (1 + levy / 100));
  }, [s, d, levy, fare, maint]);
  if (!d || !s || d.kind === 'election' || d.kind === 'lineOpen') return null;
  const f = fleetStatus(s);
  if (PROJECT_KINDS.has(d.kind)) {
    return (
      <div className="decision-wrap" role="dialog" aria-modal="true" aria-label={t.pj.title}>
        <section className="decision glass">
          <div className="decision-kicker">{fmtDate(s.date, lang)} · {t.decisionKicker}</div>
          <ProjectDecision game={game} d={d} t={t} lang={lang} />
        </section>
      </div>
    );
  }
  if (COUNCIL_KINDS.has(d.kind)) {
    const item = d.kind === 'vote' ? s.council?.items.find((i) => i.id === d.data.item) : undefined;
    return (
      <div className="decision-wrap" role="dialog" aria-modal="true" aria-label={t.co.decisionTitle[d.kind] ?? d.kind}>
        <section className={`decision glass ${d.kind === 'vote' ? 'vote' : ''}`}>
          <div className="decision-kicker">{fmtDate(s.date, lang)} · {item ? t.co.bodyVote[item.body] : t.decisionKicker}</div>
          <CouncilDecision game={game} d={d} t={t} lang={lang} />
        </section>
      </div>
    );
  }
  return (
    <div className="decision-wrap" role="dialog" aria-modal="true" aria-label={t.decisionTitle[d.kind] ?? d.kind}>
      <section className="decision glass">
        <div className="decision-kicker">{fmtDate(s.date, lang)} · {t.decisionKicker}</div>
        <h2>{t.decisionTitle[d.kind]?.replace('{year}', String(d.data.year ?? ''))}</h2>
        {d.kind === 'budget' && projection && (
          <>
            <p>{t.budgetIntro(money(Number(d.data.last), lang), pct(balancingPct, 1, lang))}</p>
            {Number(d.data.committed) > 0 && <p className="muted small">{t.pj.committed(pct(Number(d.data.committed), 1, lang))}</p>}
            <ul className="steppers">
              <Stepper label={t.levyChange} value={levy} min={-3} max={12} step={0.5} fmt={(v) => pct(v, 1, lang)} onChange={setLevy} />
              <Stepper label={t.fareChange} value={fare} min={-10} max={15} step={2.5} fmt={(v) => pct(v, 1, lang)} onChange={setFare} />
              <Stepper label={t.maintenanceFunding} value={maint} min={0.7} max={1.3} step={0.05} fmt={(v) => `${Math.round(v * 100)}${lang === 'fr' ? ' %' : '%'}`} onChange={setMaint} />
            </ul>
            <p className={`projection ${projection.balance < -50_000 ? 'bad' : 'ok'}`}>
              {t.projectedYear(money(projection.revenue, lang), money(projection.cost, lang), money(Math.abs(projection.balance) < 50_000 ? 0 : projection.balance, lang))}</p>
            {levy > 3 && <p className="muted small">{t.levyWarning}</p>}
            {maint < 1 && <p className="muted small">{t.maintenanceWarning}</p>}
            <div className="plan-actions"><button className="btn primary" onClick={() => game.resolve({ kind: 'budget', choice: { levyChange: levy, fareChange: fare, maintenance: maint } })}>{t.approveBudget}</button></div>
          </>
        )}
        {d.kind === 'deficit' && (
          <>
            <p>{t.deficitIntro(money(Number(d.data.amount), lang))}</p>
            <div className="choices">
              {(['levy', 'cut', 'defer', 'borrow'] as const).map((c) => (
                <button key={c} className="choice" onClick={() => game.resolve({ kind: 'deficit', choice: c })}>
                  <b>{t.deficitChoice[c].title}</b><span>{t.deficitChoice[c].body}</span></button>
              ))}
            </div>
          </>
        )}
        {d.kind === 'shortfall' && (
          <>
            <p>{t.shortfallIntro(Number(d.data.required), Number(d.data.buses))}</p>
            <div className="choices">
              <button className="choice" onClick={() => game.resolve({ kind: 'shortfall', choice: 'order' })}>
                <b>{t.shortfallChoice.order.title}</b>
                <span>{t.shortfallChoice.order.body(f.shortfall, money(f.shortfall * BUS_TYPES.artic60.price, lang), fmtDate(addMonths(s.date, BUS_TYPES.artic60.leadMonths), lang, 'month'))}</span></button>
              <button className="choice" onClick={() => game.resolve({ kind: 'shortfall', choice: 'cut' })}>
                <b>{t.shortfallChoice.cut.title}</b><span>{t.shortfallChoice.cut.body}</span></button>
              <button className="choice" onClick={() => game.resolve({ kind: 'shortfall', choice: 'accept' })}>
                <b>{t.shortfallChoice.accept.title}</b><span>{t.shortfallChoice.accept.body(`${(100 * missedShare(s)).toFixed(1)}%`)}</span></button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/** Brief news: deliveries, service changes, garages, retirements. */
export function NewsToasts({ game, t, lang }: { game: GameApi; t: Strings; lang: Lang }) {
  const text = (e: GameEvent) => t.news[e.kind] ?? t.co.news[e.kind] ?? (e.kind === 'project' && t.pj.news(e.data, lang) ? (d: GameEvent['data'], l: Lang) => t.pj.news(d, l) : undefined);
  const items = game.news.filter((e) => text(e));
  useEffect(() => {
    if (!items.length) return;
    const id = setTimeout(() => items.forEach((e) => game.dismiss(e.id)), 7000);
    return () => clearTimeout(id);
  }, [items.map((e) => e.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!items.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {items.map((e: GameEvent) => (
        <div key={e.id} className={`toast glass toast-${e.kind}`}>
          <span><b>{fmtDate(e.date, lang, 'short')}</b> · {text(e)!(e.data, lang)}</span>
          <button aria-label="×" onClick={() => game.dismiss(e.id)}>×</button>
        </div>
      ))}
    </div>
  );
}

const ORDERABLE: BusType[] = ['bus40', 'hybrid40', 'artic60', 'double'];

/** The books and the fleet. */
export function BudgetPanel({ game, t, lang }: { game: GameApi; t: Strings; lang: Lang }) {
  const s = game.state;
  const [type, setType] = useState<BusType>('artic60');
  const [qty, setQty] = useState(25);
  if (!s) return null;
  const f = fleetStatus(s);
  const last12 = s.ledger.slice(-12);
  const sum = (k: keyof (typeof last12)[number]) => last12.reduce((a, r) => a + (r[k] as number), 0);
  const revenue = sum('fares') + sum('levy') + sum('gasTax') + sum('other');
  const costs = sum('operations') + sum('maintenance') + sum('para') + sum('fixed') + sum('debtService');
  const proj = projectYear(s);
  const reserves = s.ledger.map((r) => r.reserveEnd);
  const lo = Math.min(0, ...reserves);
  const hi = Math.max(1, ...reserves);
  const pts = reserves.map((v, i) => `${(i / Math.max(1, reserves.length - 1)) * 300},${70 - ((v - lo) / (hi - lo)) * 62}`).join(' ');
  const zeroY = 70 - ((0 - lo) / (hi - lo)) * 62;
  const spec = BUS_TYPES[type];
  const lines: [string, number][] = [[t.lineFares, sum('fares')], [t.lineLevy, sum('levy')], [t.lineGasTax, sum('gasTax')], [t.lineOther, sum('other')]];
  const costLines: [string, number][] = [[t.lineOperations, sum('operations')], [t.lineMaintenance, sum('maintenance')], [t.linePara, sum('para')],
    [t.lineFixed, sum('fixed')], [t.lineDebt, sum('debtService')]];
  return (
    <div className="ins">
      <div className="ins-head"><div className="ins-icon" style={{ background: '#25965A' }} />
        <div><div className="ins-title">{t.budgetTitle}</div><div className="ins-sub">OC Transpo · {fmtDate(s.date, lang)}</div></div></div>
      <div className="grid3">
        <div><b className={s.reserve < 0 ? 'neg' : ''}>{money(s.reserve, lang)}</b><span>{t.reserve}</span></div>
        <div><b>{money(s.debt, lang)}</b><span>{t.debt}</span></div>
        <div><b>{money(s.levy, lang)}</b><span>{t.levyThisYear}</span></div>
      </div>
      {(s.lineDebt ?? 0) > 0 && <p className="riders-line"><b>{money(s.lineDebt!, lang)}</b> {t.pj.lineDebt}</p>}
      {reserves.length > 1 && (
        <svg className="reserve-chart" viewBox="0 0 300 74" preserveAspectRatio="none" aria-label={t.reserve}>
          <line x1="0" x2="300" y1={zeroY} y2={zeroY} className="zero" />
          <polyline points={pts} />
        </svg>
      )}
      <div className="sec">{t.last12(last12.length)}</div>
      <table className="score books">
        <tbody>
          {lines.map(([k, v]) => <tr key={k}><th>{k}</th><td>{money(v, lang)}</td></tr>)}
          <tr className="total"><th>{t.revenue}</th><td>{money(revenue, lang)}</td></tr>
          {costLines.map(([k, v]) => <tr key={k}><th>{k}</th><td>{money(-v, lang)}</td></tr>)}
          <tr className="total"><th>{t.costs}</th><td>{money(-costs, lang)}</td></tr>
          <tr className="total"><th>{t.balance}</th><td className={revenue - costs < 0 ? 'neg' : ''}>{money(revenue - costs, lang)}</td></tr>
        </tbody>
      </table>
      <p className="muted small">{t.booksNote(costs > 0 ? `${Math.round((100 * sum('fares')) / costs)}%` : '—', `${(100 * missedShare(s)).toFixed(1)}%`,
        money(s.backlog, lang), money(proj.balance, lang))}</p>
      <div className="sec">{t.levers}</div>
      <ul className="steppers">
        <Stepper label={t.maintenanceFunding} value={s.maintenance} min={0.7} max={1.3} step={0.05} fmt={(v) => `${Math.round(v * 100)}${lang === 'fr' ? ' %' : '%'}`}
          onChange={(v) => game.setLevers({ maintenance: v })} />
      </ul>
      <div className="sec">{t.fleet}</div>
      <table className="score books">
        <tbody>
          {(Object.keys(BUS_TYPES) as BusType[]).filter((k) => f.byType[k].count > 0).map((k) => (
            <tr key={k}><th>{lang === 'fr' ? BUS_TYPES[k].label_fr : BUS_TYPES[k].label}</th><td>{f.byType[k].count}</td>
              <td className="muted">{t.ageYears(f.byType[k].avgAge)}</td></tr>
          ))}
          <tr className="total"><th>{t.buses}</th><td>{f.buses}</td><td className="muted">{t.ageYears(f.avgAge)}</td></tr>
          <tr className={f.shortfall ? 'down' : ''}><th>{t.neededAtPeak}</th><td>{f.required}</td><td>{f.shortfall ? t.short(f.shortfall) : t.spare(f.buses - f.required)}</td></tr>
          <tr><th>{t.garageSpace}</th><td>{f.garageCapacity}</td><td className="muted">{t.free(f.garageCapacity - f.buses)}</td></tr>
        </tbody>
      </table>
      {s.orders.length > 0 && (
        <ul className="periods">{s.orders.slice(0, 4).map((o, i) => (
          <li key={i}><span>{o.count} × {o.model}</span><b>{fmtDate(o.due, lang, 'month')}</b></li>
        ))}{s.orders.length > 4 && <li><span className="muted">{t.moreOrders(s.orders.length - 4)}</span></li>}</ul>
      )}
      <div className="order-row">
        <select value={type} onChange={(e) => setType(e.target.value as BusType)} aria-label={t.busType}>
          {ORDERABLE.map((k) => <option key={k} value={k}>{lang === 'fr' ? BUS_TYPES[k].label_fr : BUS_TYPES[k].label}</option>)}
        </select>
        <ul className="steppers"><Stepper label="" value={qty} min={5} max={200} step={5} fmt={(v) => String(v)} onChange={setQty} /></ul>
      </div>
      <div className="plan-actions">
        <button className="btn primary" onClick={() => game.orderBuses(type, qty)}>
          {t.orderBuses(qty, money(qty * spec.price, lang), fmtDate(addMonths(s.date, spec.leadMonths), lang, 'month'))}</button>
        <button className="btn" onClick={() => game.buildGarage()}>{t.buildGarage(money(ECONOMY_2010.garageCost.value * s.costIndex, lang))}</button>
      </div>
      {s.pending.length > 0 && (
        <p className="notice">{t.scheduledNote(s.pending.length, fmtDate(nextServiceChange(s.date), lang, 'short'))}
          <button className="link" onClick={game.unschedule}>{t.cancel}</button></p>
      )}
      <p className="muted small">{t.economyNote}</p>
      <div className="plan-actions"><button className="btn ghost" onClick={() => confirm(t.restartConfirm) && game.restart()}>{t.restart}</button></div>
    </div>
  );
}
