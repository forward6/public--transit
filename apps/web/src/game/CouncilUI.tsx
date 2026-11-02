// M7: votes with a whip count, contract talks and strikes, partners' offers, election night, the Council panel.
import { useEffect, useState } from 'react';
import { LABOUR_2010, WARDS_2010, type AgendaItem, type Councillor, type GameEvent, type Lang } from '@otc/shared';
import { CONSULT_COST, LOBBY_COST, STUDY_COST, isAlly, tally, whipCount, yearlyDebtService, type Lean, type StoProposal } from '@otc/sim';
import type { Strings } from '../i18n/strings';
import { fmtDate, money } from './GameUI';
import type { GameApi } from './useGame';

const pctText = (x: number, lang: Lang, digits = 1) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA',
  { maximumFractionDigits: digits })}${lang === 'fr' ? ' %' : '%'}`;
const wardName = (id: number, lang: Lang) => WARDS_2010.find((w) => w.id === id)?.name[lang] ?? '';

export function CapitalChip({ game, t, onClick }: { game: GameApi; t: Strings; onClick: () => void }) {
  const c = game.state?.council;
  if (!c) return null;
  const tone = c.capital >= 40 ? 'good' : c.capital >= 15 ? 'warn' : 'bad';
  return <button className={`status-chip capital ${tone}`} onClick={onClick} title={t.co.capitalHelp}><i />{t.co.capitalChip(c.capital)}</button>;
}

/** What an item does, in a few lines. */
function Effects({ item, t, lang }: { item: AgendaItem; t: Strings; lang: Lang }) {
  const e = item.effects;
  const lines: string[] = [];
  if (e.taxes !== undefined) lines.push(t.co.effect.levy(pctText(e.taxes, lang)));
  if (e.fares) lines.push(t.co.effect.fares(pctText(e.fares, lang)));
  if (e.service && item.kind !== 'budget') lines.push(t.co.effect.service(pctText(e.service, lang)));
  if (e.capital) lines.push(t.co.effect.capital(money(e.capital * 1e6, lang)));
  if (e.debt) lines.push(t.co.effect.debt(money(e.debt * 1e6, lang)));
  if (e.wage !== undefined) lines.push(t.co.effect.wage(pctText(e.wage, lang)));
  // M8: a line's bill and riders; a budget's share for the lines already approved
  if (e.project) {
    lines.push(`${t.pj.cityShare}: ${money(e.project.city * 1e6, lang)} · ${t.pj.debtService(money(yearlyDebtService(e.project.city * 1e6), lang))}`);
    if (e.project.riders) lines.push(t.pj.trips(`${e.project.riders > 0 ? '+' : ''}${Math.round(e.project.riders).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}`));
  }
  if (e.committed) lines.push(t.pj.committed(`${e.committed.toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}${lang === 'fr' ? ' %' : '%'}`));
  const wards = Object.entries(e.wards ?? {}).map(([w, x]) => ({ w: Number(w), ...x }));
  const removed = new Map<string, number[]>();
  const added = new Map<string, number[]>();
  for (const x of wards) {
    for (const r of x.removed) removed.set(r, [...(removed.get(r) ?? []), x.w]);
    for (const r of x.added) added.set(r, [...(added.get(r) ?? []), x.w]);
  }
  for (const [r, ws] of added) lines.push(t.co.effect.adds(r, ws.map((w) => wardName(w, lang)).join(', ')));
  for (const [r, ws] of removed) lines.push(t.co.effect.losses(r, ws.map((w) => wardName(w, lang)).join(', ')));
  const gains = wards.filter((x) => x.access >= 2 && !x.added.length).map((x) => wardName(x.w, lang));
  if (gains.length) lines.push(t.co.effect.gains(gains.slice(0, 4).join(', ')));
  return <ul className="effects">{lines.map((l) => <li key={l}>{l}</li>)}</ul>;
}

function Seats({ leans, item }: { leans: Lean[]; item: AgendaItem }) {
  const order = { yes: 0, undecided: 1, no: 2 } as const;
  const sorted = [...leans].sort((a, b) => order[a.position] - order[b.position] || b.score - a.score);
  return (
    <div className="seats" aria-hidden>
      {item.body === 'commission' && <i className={item.byChair ? 'yes chair' : 'no chair'} />}
      {sorted.map((l) => <i key={l.id} className={l.position} />)}
    </div>
  );
}

/** A vote: what it does, the whip count, persuasion, and calling the vote. */
export function VoteCard({ game, item, t, lang }: { game: GameApi; item: AgendaItem; t: Strings; lang: Lang }) {
  const s = game.state!;
  const cw = game.councilWorld;
  const c = s.council!;
  if (!cw) return null;
  if (item.measuring) {
    return (<><h2>{t.co.item[item.kind](item.payload as never)}</h2><p className="notice">{t.co.measuring}</p></>);
  }
  const leans = whipCount(s, cw, item);
  const tl = tally(s, cw, item);
  const und = leans.filter((l) => l.position === 'undecided').length;
  const yes = leans.filter((l) => l.position === 'yes').length + (item.body === 'commission' && item.byChair ? 1 : 0);
  const no = leans.length + (item.body === 'commission' ? 1 : 0) - yes - und;
  const member = (id: string): Councillor => c.councillors.find((x) => x.id === id)!;
  const order = { yes: 0, undecided: 1, no: 2 } as const;
  const rows = [...leans].sort((a, b) => order[a.position] - order[b.position] || (item.byChair ? b.score - a.score : a.score - b.score));
  return (
    <>
      <h2>{t.co.item[item.kind](item.payload as never)}</h2>
      {!item.byChair && <p className="notice small">{t.co.motionNote}</p>}
      <Effects item={item} t={t} lang={lang} />
      <Seats leans={leans} item={item} />
      <p className={`tally ${tl.yes >= tl.needed ? 'passing' : 'failing'}`}>{t.co.tally(tl.needed, yes, und, no)}</p>
      <ul className="whip">{rows.map((l) => {
        const m = member(l.id);
        const want = item.byChair ? l.position !== 'yes' : l.position !== 'no';
        const cost = LOBBY_COST(item.byChair ? l.score : -l.score);
        return (
          <li key={l.id} className={l.position}>
            <span className="who"><b>{m.name}</b><small>{m.ward === 0 ? t.co.mayorWord : wardName(m.ward, lang)} · {
              (l.score > 0 ? t.co.reasonFor[l.reason] : undefined) ?? t.co.reason[l.reason]}</small></span>
            <em>{t.co.position[l.position]}</em>
            {want && (item.lobbied.includes(l.id) ? <small className="muted">{t.co.lobbied}</small>
              : <button className="btn small" disabled={c.capital < cost} onClick={() => game.lobby(item.id, l.id)}>
                {item.byChair ? t.co.lobby(cost) : t.co.lobbyAgainst(cost)}</button>)}
          </li>
        );
      })}</ul>
      <div className="vote-actions">
        {item.byChair && !item.consulted && <button className="btn" title={t.co.consultHint} onClick={() => game.delay(item.id, 'consult')}>{t.co.consult} · {money(CONSULT_COST, lang)}</button>}
        {item.byChair && !item.studied && <button className="btn" title={t.co.studyHint} onClick={() => game.delay(item.id, 'study')}>{t.co.study} · {money(STUDY_COST, lang)}</button>}
        {item.byChair && !item.amended && t.co.amend[item.kind] && (item.kind !== 'budget' || (item.payload.levyChange ?? 0) > 0 || (item.payload.fareChange ?? 0) > 0) && <button className="btn" onClick={() => game.amend(item.id)}>{t.co.amend[item.kind]}</button>}
        {item.byChair && item.kind !== 'budget' && <button className="btn ghost" onClick={() => game.withdraw(item.id)}>{t.co.withdraw}</button>}
        <button className="btn primary" onClick={() => game.callVote(item.id)}>{t.co.callVote}</button>
      </div>
      <p className="muted small">{t.co.capital}: {Math.round(c.capital)} · {t.co.capitalHelp}</p>
    </>
  );
}

function Stepper({ label, value, min, max, step, fmt, onChange }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string;
  onChange: (v: number) => void }) {
  return (
    <li className="stepper"><span>{label}</span>
      <button aria-label="−" disabled={value <= min} onClick={() => onChange(Math.max(min, Math.round((value - step) * 10) / 10))}>−</button>
      <b>{fmt(value)}</b>
      <button aria-label="+" disabled={value >= max} onClick={() => onChange(Math.min(max, Math.round((value + step) * 10) / 10))}>+</button></li>
  );
}

function LabourCard({ game, d, t, lang }: { game: GameApi; d: GameEvent; t: Strings; lang: Lang }) {
  const demand = Number(d.data.demand);
  const [wage, setWage] = useState(LABOUR_2010.baseline);
  const [scheduling, setScheduling] = useState<'keep' | 'reform'>('keep');
  const [years, setYears] = useState(3);
  useEffect(() => setWage(Math.min(demand, LABOUR_2010.baseline)), [d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = (v: number) => `${v.toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA', { minimumFractionDigits: 1 })}${lang === 'fr' ? ' %' : '%'}`;
  return (
    <>
      <h2>{t.co.labourTitle(Number(d.data.round))}</h2>
      <p>{t.co.labourIntro(LABOUR_2010.union[lang], pct(demand))}</p>
      <p className="muted small">{t.co.labourMemory}</p>
      <ul className="steppers"><Stepper label={t.co.wageOffer} value={wage} min={0} max={4.5} step={0.1} fmt={pct} onChange={setWage} /></ul>
      <div className="choices two">{(['keep', 'reform'] as const).map((k) => (
        <button key={k} className={`choice ${scheduling === k ? 'on' : ''}`} onClick={() => setScheduling(k)}><b>{t.co.scheduling[k].title}</b><span>{t.co.scheduling[k].body}</span></button>
      ))}</div>
      <div className="seg" role="radiogroup">{[3, 4].map((y) => (
        <button key={y} role="radio" aria-checked={years === y} className={years === y ? 'on' : ''} onClick={() => setYears(y)}>{t.co.years(y)}</button>
      ))}</div>
      <div className="plan-actions"><button className="btn primary" onClick={() => game.negotiate({ wage, scheduling, years })}>{t.co.makeOffer}</button></div>
    </>
  );
}

function ChoiceCard({ title, intro, choices }: { title: string; intro: string; choices: { key: string; title: string; body: string; on: () => void }[] }) {
  return (
    <>
      <h2>{title}</h2>
      <p>{intro}</p>
      <div className="choices">{choices.map((c) => <button key={c.key} className="choice" onClick={c.on}><b>{c.title}</b><span>{c.body}</span></button>)}</div>
    </>
  );
}

/** Council, labour and partner decisions (the DecisionCard defers to this for M7 kinds). */
export function CouncilDecision({ game, d, t, lang }: { game: GameApi; d: GameEvent; t: Strings; lang: Lang }) {
  const s = game.state!;
  if (d.kind === 'vote') {
    const item = s.council?.items.find((i) => i.id === d.data.item);
    return item ? <VoteCard game={game} item={item} t={t} lang={lang} /> : null;
  }
  if (d.kind === 'labour') return <LabourCard game={game} d={d} t={t} lang={lang} />;
  if (d.kind === 'strike') {
    return <ChoiceCard title={t.co.strikeTitle(Number(d.data.days))} intro={t.co.strikeIntro} choices={(['meet', 'arbitration', 'holdOut'] as const).map((k) => ({
      key: k, ...t.co.strikeChoice[k], on: () => game.strikeChoice(k) }))} />;
  }
  if (d.kind === 'sto') {
    const k = d.data.proposal as StoProposal;
    return <ChoiceCard title={`${t.co.stoTitle}: ${t.co.sto[k].title}`} intro={t.co.sto[k].body} choices={[
      { key: 'y', title: t.co.accept, body: '', on: () => game.answerSto(true) }, { key: 'n', title: t.co.decline, body: '', on: () => game.answerSto(false) }]} />;
  }
  if (d.kind === 'funding') {
    const k = d.data.offer as 'provincialBuses' | 'federalGarage';
    return <ChoiceCard title={t.co.funding[k].title} intro={t.co.funding[k].body} choices={[
      { key: 'y', title: t.co.accept, body: '', on: () => game.answerFunding(true) }, { key: 'n', title: t.co.decline, body: '', on: () => game.answerFunding(false) }]} />;
  }
  return null;
}

export const COUNCIL_KINDS = new Set(['vote', 'labour', 'strike', 'sto', 'funding']);

/** Election night: the wards come in one by one. */
export function ElectionNight({ game, t, lang }: { game: GameApi; t: Strings; lang: Lang }) {
  const d = game.decision;
  const rec = game.state?.council?.elections.filter((e) => e.city === 'ottawa').at(-1);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (d?.kind !== 'election') return;
    setShown(0);
    const id = setInterval(() => setShown((n) => n + 1), 180);
    return () => clearInterval(id);
  }, [d?.id]);
  if (d?.kind !== 'election' || !rec) return null;
  const pct = (x: number) => `${Math.round(x)}${lang === 'fr' ? ' %' : '%'}`;
  return (
    <div className="election-wrap" role="dialog" aria-label={t.co.electionTitle}>
      <section className="election">
        <div className="decision-kicker">{t.co.electionSub(fmtDate(rec.date, lang))}</div>
        <h2>{t.co.electionTitle}</h2>
        {rec.mayor && shown > 2 && <p className="mayor">{t.co.mayorResult(rec.mayor.held, rec.mayor.winner, pct(rec.mayor.share))}</p>}
        <ul className="wards">{rec.wards.map((w, i) => (
          <li key={w.ward} className={`${i < shown ? 'in' : ''} ${w.held ? 'held' : 'new'} p-${w.platform}`}>
            <small>{wardName(w.ward, lang)}</small>
            <b>{i < shown ? w.winner : '…'}</b>
            {i < shown && <em>{w.held ? t.co.held : `${t.co.newMember} · ${t.co.platform[w.platform]}`} · {pct(w.share)}</em>}
          </li>
        ))}</ul>
        <p className="platforms">{(['transit', 'centre', 'lowTax', 'rural'] as const).map((k) => <span key={k} className={`p-${k}`}><i />{t.co.platform[k]}</span>)}</p>
        {shown > rec.wards.length && <p className="allies">{t.co.allies(rec.allies[0], rec.allies[1])} · {t.co.takesOffice}</p>}
        <div className="plan-actions"><button className="btn primary" onClick={() => game.acknowledge(d.id)}>{t.co.continue}</button></div>
      </section>
    </div>
  );
}

/** The Council panel: capital, who sits where and how they lean, votes, directions, labour, partners. */
export function CouncilPanel({ game, t, lang }: { game: GameApi; t: Strings; lang: Lang }) {
  const s = game.state;
  const c = s?.council;
  const cw = game.councilWorld;
  if (!s || !c || !cw) return null;
  const allies = c.councillors.filter(isAlly);
  const hawks = c.councillors.filter((m) => !isAlly(m) && m.fiscal >= 0.5);
  const swing = c.councillors.length - allies.length - hawks.length;
  const lean = (m: Councillor) => (isAlly(m) ? 'yes' : m.fiscal >= 0.5 ? 'no' : 'undecided');
  const votes = c.items.filter((i) => i.status === 'passed' || i.status === 'failed').slice(-8).reverse();
  const L = c.labour;
  return (
    <div className="ins">
      <div className="ins-head"><div className="ins-icon" style={{ background: '#5B6CC0' }} />
        <div><div className="ins-title">{t.co.title}</div><div className="ins-sub">{t.co.sub(allies.length)}</div></div></div>
      <div className="grid3">
        <div><b>{Math.round(c.capital)}</b><span>{t.co.capital}</span></div>
        <div><b>{allies.length}</b><span>{t.co.position.yes}</span></div>
        <div><b>{hawks.length}</b><span>{t.co.position.no}</span></div>
      </div>
      <p className="muted small">{t.co.composition(allies.length, swing, hawks.length)} · {t.co.capitalHelp}</p>
      <div className="sec">{t.co.councillors}</div>
      <ul className="councillors">{c.councillors.map((m) => (
        <li key={m.id} className={lean(m)}>
          <i />
          <span><b>{m.name}</b><small>{m.ward === 0 ? t.co.mayorWord : wardName(m.ward, lang)}{c.commission.includes(m.id) ? ` · ${t.co.commissionTag}` : ''}</small></span>
          <em>{t.co.relationship(m.relationship)}</em>
        </li>
      ))}</ul>
      <div className="sec">{t.co.votes}</div>
      {votes.length ? <ul className="periods">{votes.map((v) => (
        <li key={v.id}><span>{fmtDate(v.tabled, lang, 'short')} · {t.co.item[v.kind](v.payload as never)}</span>
          <b className={v.status === 'passed' === v.byChair ? 'up' : 'down'}>{v.status === 'passed' ? t.co.passed : t.co.failed} {v.result?.yes}–{v.result?.no}</b></li>
      ))}</ul> : <p className="muted small">{t.co.noVotes}</p>}
      {c.directions.some((x) => !x.done) && <>
        <div className="sec">{t.co.directions}</div>
        <ul className="periods">{c.directions.filter((x) => !x.done).map((x) => <li key={x.routeId}><span>{t.co.restoreBy(x.routeName)}</span></li>)}</ul>
      </>}
      <div className="sec">{t.co.labourSection}</div>
      <p className="riders-line">{L.strike ? <b className="down">{t.co.onStrike}</b> : t.co.contract(pctText(L.wage, lang).replace('+', ''), fmtDate(L.until, lang, 'short'))}</p>
      <div className="sec">{t.co.stoSection}</div>
      <p className="riders-line">{t.co.stoAgenda[c.sto.agenda]} · {t.co.relationship(c.sto.relationship)}</p>
      {c.funding.length > 0 && <>
        <div className="sec">{t.co.fundingSection}</div>
        <ul className="periods">{c.funding.map((f) => (
          <li key={f.id}><span>{t.co.funding[f.id].title}</span><b>{t.co.fundingStatus[f.status]}{f.received ? ` · ${money(f.received, lang)}` : ''}</b></li>
        ))}</ul>
      </>}
      {c.elections.length > 0 && <>
        <div className="sec">{t.co.elections}</div>
        <ul className="periods">{c.elections.map((e) => (
          <li key={e.date}><span>{fmtDate(e.date, lang, 'short')} · {e.city === 'ottawa' ? 'Ottawa' : 'Gatineau'}</span>
            <b>{e.city === 'ottawa' ? t.co.allies(e.allies[0], e.allies[1]) : t.co.stoAgenda[e.sto ?? 'integration']}</b></li>
        ))}</ul>
      </>}
    </div>
  );
}
