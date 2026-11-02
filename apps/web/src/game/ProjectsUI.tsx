// M8: rapid-transit lines in the game: drawing one in Plan mode, the project panel, the HUD chip,
// and the decisions (how to build it, overruns, opening day).
import { useState } from 'react';
import { LINE_COLORS, type GameEvent, type Lang, type LineMode, type Project, type ProjectPhase, type Structure } from '@otc/shared';
import { ASK_COST, addMonths, cityShare, constructionProgress, stretches, yearlyDebtService } from '@otc/sim';
import type { Strings } from '../i18n/strings';
import type { LineDraw } from '../plan/useLineDraw';
import { fmtDate, money } from './GameUI';
import type { GameApi } from './useGame';

const km = (x: number, lang: Lang) => x.toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA', { maximumFractionDigits: 1 });
const num = (x: number, lang: Lang) => Math.round(x).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA');
const signed = (x: number, lang: Lang) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${num(Math.abs(x), lang)}`;
const ACTIVE: ProjectPhase[] = ['proposed', 'design', 'procurement', 'construction', 'testing'];
const STRUCTURES: Structure[] = ['surface', 'elevated', 'tunnel'];

/** The Plan-mode dock while drawing a line. */
export function LineDock({ line, t, lang, date }: { line: LineDraw; t: Strings; lang: Lang; date: string }) {
  const d = line.design;
  const e = line.estimate;
  const pj = t.pj;
  if (!d) return null;
  const months = e ? e.months.design + e.months.procurement + e.months.construction + e.months.testing : 0;
  const share = e ? (e.cost.total / 3) * 0.75 : 0;
  const f = line.forecast;
  const metres = stretches(d);
  return (
    <section className="plan-dock line-dock glass" aria-label={pj.newLine}>
      <div className="plan-head">
        <b>{pj.newLine}</b>
        <button className="btn ghost" onClick={line.clear}>{pj.cancel}</button>
      </div>
      <div className="seg wide" role="radiogroup" aria-label={pj.title}>
        {(['lrt', 'busway'] as LineMode[]).map((m) => (
          <button key={m} role="radio" aria-checked={d.mode === m} className={d.mode === m ? 'on' : ''} onClick={() => line.setMode(m)}>{pj.mode[m]}</button>
        ))}
      </div>
      <p className="muted small">{pj.modeHelp[d.mode]}</p>
      <div className="line-name">
        <label><span>{pj.name}</span><input value={d.name} maxLength={28} onChange={(x) => line.setName(x.target.value)} /></label>
      </div>
      <div className="line-name">
        <div className="swatches">{LINE_COLORS.map((c) => (
          <button key={c} aria-label={c} className={c === d.color ? 'on' : ''} style={{ background: c }} onClick={() => line.setColor(c)} />
        ))}</div>
      </div>
      {d.stations.length < 2 && <p className="muted small">{pj.drawHint}</p>}
      {d.stations.length >= 2 && (
        <ol className="stretches">
          {d.structure.map((k, i) => (
            <li key={i}>
              <span>{pj.stretch(d.stations[i]!.name, d.stations[i + 1]!.name, km((metres[i] ?? 0) / 1000, lang))}</span>
              <div className="seg mini" role="radiogroup">
                {STRUCTURES.map((x) => (
                  <button key={x} role="radio" aria-checked={k === x} className={k === x ? 'on' : ''} onClick={() => line.setStructure(i, x)}>{pj.structure[x]}</button>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
      {e && (
        <div className="line-estimate">
          <div className="sec">{pj.estimate}</div>
          <p className="riders-line">{pj.stats(km(e.lengthKm, lang), e.stations, Math.round(e.runMin))}</p>
          <p className="big-cost"><b>{money(e.cost.total, lang)}</b> <span className="muted">{pj.costLine('', money(e.cost.total / Math.max(0.1, e.lengthKm), lang)).trim()}</span></p>
          <ul className="periods cost-parts">
            {(['guideway', 'stations', 'vehicles', 'depot', 'soft', 'contingency'] as const).filter((k) => e.cost[k] > 0).map((k) => (
              <li key={k}><span>{pj.costParts[k]}{k === 'vehicles' ? ` (${pj.trains(e.vehicles)})` : ''}</span><b>{money(e.cost[k], lang)}</b></li>
            ))}
          </ul>
          <p className="muted small">{pj.years(km(months / 12, lang), addMonths(date, Math.round(months)).slice(0, 4))}</p>
          <p className="muted small">{pj.ops(money(e.opsPerYear, lang))} · {pj.likelyShare(money(share, lang), money(yearlyDebtService(share), lang))}</p>
          <div className="sec">{pj.forecast}</div>
          {line.measuring ? <p className="muted small">{pj.measuring}</p> : f
            ? <p className="riders-line">{pj.forecastLine(num(f.boardings, lang), signed(f.newRiders, lang), `${f.reach >= 0 ? '+' : ''}${km(f.reach, lang)}${lang === 'fr' ? ' %' : '%'}`)}</p>
            : <button className="btn wide-btn" onClick={line.measure}>{pj.measure}</button>}
        </div>
      )}
      <div className="plan-actions">
        <button className="btn primary" disabled={d.stations.length < 2 || line.measuring} onClick={line.propose}>{pj.propose}</button>
        <button className="btn" disabled={!d.stations.length} onClick={line.undo}>{pj.undo}</button>
      </div>
      {d.stations.length >= 2 && <p className="muted small">{pj.proposeHint}</p>}
    </section>
  );
}

/** A small chip in the HUD while lines are being built (or just opened). */
export function ProjectsChip({ game, t, onClick }: { game: GameApi; t: Strings; onClick: () => void }) {
  const ps = (game.state?.projects ?? []).filter((p) => ACTIVE.includes(p.phase));
  if (!ps.length) return null;
  const p = ps.find((x) => x.phase === 'construction') ?? ps[0]!;
  return (
    <button className="status-chip project-chip" onClick={onClick} title={t.pj.title}>
      <i style={{ background: p.design.color }} />{t.pj.chip(p.design.shortName, t.pj.phase[p.phase])}{ps.length > 1 ? ` +${ps.length - 1}` : ''}
    </button>
  );
}

/** All the lines, or one line in detail. */
export function ProjectsPanel({ game, t, lang, id, onSelect }: { game: GameApi; t: Strings; lang: Lang; id: string; onSelect: (id: string) => void }) {
  const ps = game.state?.projects ?? [];
  const p = ps.find((x) => x.id === id);
  if (p) return <ProjectPanel game={game} p={p} t={t} lang={lang} />;
  return (
    <div className="ins">
      <div className="ins-head"><div className="ins-icon" style={{ background: '#D7263D' }} /><div><div className="ins-title">{t.pj.title}</div></div></div>
      {ps.length ? <ul className="project-list">{ps.map((x) => (
        <li key={x.id}><button className="link" onClick={() => onSelect(x.id)}><i style={{ background: x.design.color }} /><b>{x.design.name}</b>
          <span>{t.pj.phase[x.phase]}</span></button></li>
      ))}</ul> : <p className="muted small">{t.pj.none}</p>}
    </div>
  );
}

function ProjectPanel({ game, p, t, lang }: { game: GameApi; p: Project; t: Strings; lang: Lang }) {
  const pj = t.pj;
  const s = game.state!;
  const [confirm, setConfirm] = useState(false);
  const prog = Math.round(constructionProgress(p, s.date) * 100);
  const city = cityShare(p);
  const phases: ProjectPhase[] = ['proposed', 'design', 'procurement', 'construction', 'testing', 'open'];
  const at = phases.indexOf(p.phase);
  const opens = p.phase === 'open' ? p.opened : p.due && p.phase === 'testing' ? p.due
    : p.phase === 'construction' && p.due ? addMonths(p.due, p.estimate.months.testing) : undefined;
  const history = s.events.filter((e) => e.kind === 'project' && e.data.project === p.id).slice(-8).reverse();
  const govs = ['province', 'federal'] as const;
  return (
    <div className="ins project-panel">
      <div className="ins-head"><div className="ins-icon line-badge" style={{ background: p.design.color }}>{p.design.shortName}</div>
        <div><div className="ins-title">{p.design.name}</div>
          <div className="ins-sub">{pj.mode[p.design.mode]} · {pj.stats(km(p.estimate.lengthKm, lang), p.estimate.stations, Math.round(p.estimate.runMin))}</div></div></div>
      <div className="pill">{pj.phase[p.phase]}{p.procurement ? ` · ${pj.how[p.procurement]}` : ''}{opens ? ` · ${p.phase === 'open' ? pj.opened(fmtDate(opens, lang, 'short')) : pj.opens(lang === 'fr' ? fmtDate(opens, lang, 'month').toLowerCase() : fmtDate(opens, lang, 'month'))}` : ''}</div>
      {!['shelved', 'cancelled'].includes(p.phase) && (
        <ol className="stages">{phases.map((x, i) => <li key={x} className={i < at ? 'done' : i === at ? 'now' : ''}>{pj.phase[x]}</li>)}</ol>
      )}
      {p.phase === 'construction' && <div className="ob-bar build" role="img" aria-label={pj.progress(prog)}><i className="fill" style={{ width: `${prog}%`, background: p.design.color }} /></div>}
      {p.phase === 'construction' && <p className="muted small">{pj.progress(prog)}</p>}
      <div className="grid3">
        <div><b>{money(p.budget, lang)}</b><span>{pj.budget}</span></div>
        <div><b>{money(p.spent, lang)}</b><span>{pj.spent}</span></div>
        <div><b>{money(city, lang)}</b><span>{pj.cityShare}</span></div>
      </div>
      <p className="muted small">{pj.debtService(money(yearlyDebtService(city), lang))}{p.overrun > 0 ? ` · ${pj.overruns(money(p.overrun, lang))}` : ''}{p.delayMonths ? ` · ${pj.delays(p.delayMonths)}` : ''}</p>
      <div className="sec">{pj.partners}</div>
      <ul className="periods">{govs.map((g) => {
        const status = p.funding[`${g}Status`];
        const asked = p.funding.asked?.[g];
        const canAsk = status === 'declined' && ACTIVE.includes(p.phase) && (!asked || addMonths(asked, 12) <= s.date);
        return (
          <li key={g}><span>{pj.gov[g]}</span>
            <b className={status === 'committed' ? 'up' : status === 'declined' ? 'down' : ''}>{pj.funding[status]}{p.funding[g] ? ` · ${money(p.funding[g], lang)}` : ''}</b>
            {canAsk && <button className="btn mini" disabled={(s.council?.capital ?? 0) < ASK_COST} onClick={() => game.askAgain(p.id, g)}>{pj.askAgain(ASK_COST)}</button>}
            {status === 'declined' && asked && !canAsk && <em className="muted small">{pj.askedRecently}</em>}
          </li>
        );
      })}</ul>
      {p.forecast && <><div className="sec">{pj.forecast}</div>
        <p className="riders-line">{pj.forecastShort(num(p.forecast.boardings, lang), signed(p.forecast.newRiders, lang))}</p></>}
      {p.rework && p.phase !== 'open' && <p className="muted small">{pj.rework(p.rework.routes.length)}: {p.rework.routes.map((r) => r.name).join(', ')}</p>}
      {history.length > 0 && <><div className="sec">{pj.history}</div>
        <ul className="periods">{history.map((e) => <li key={e.id}><span>{fmtDate(e.date, lang, 'short')} · {pj.news(e.data, lang)}</span></li>)}</ul></>}
      <div className="plan-actions">
        {p.phase === 'shelved' && <button className="btn" onClick={() => game.reviveProject(p.id)}>{pj.revive}</button>}
        {ACTIVE.includes(p.phase) && p.phase !== 'proposed' && (confirm
          ? <><span className="muted small">{pj.cancelConfirm}</span><button className="btn danger" onClick={() => game.cancelProject(p.id)}>{pj.cancelProject}</button></>
          : <button className="btn ghost" onClick={() => setConfirm(true)}>{pj.cancelProject}</button>)}
      </div>
    </div>
  );
}

export const PROJECT_KINDS = new Set(['procurement', 'overrun', 'lineOpen']);

/** The decisions a line brings: how to build it, an overrun, opening day. */
export function ProjectDecision({ game, d, t, lang }: { game: GameApi; d: GameEvent; t: Strings; lang: Lang }) {
  const pj = t.pj;
  const p = game.state?.projects?.find((x) => x.id === d.data.project);
  if (!p) return null;
  if (d.kind === 'procurement') {
    return (
      <>
        <h2>{pj.procurement.title(p.design.name)}</h2>
        <p>{pj.procurement.intro(money(p.budget, lang))}</p>
        <ul className="effects">
          {(['province', 'federal'] as const).map((g) => (
            <li key={g}>{pj.procurement.funding(pj.gov[g], pj.funding[p.funding[`${g}Status`]], p.funding[g] ? money(p.funding[g], lang) : '')}</li>
          ))}
          <li>{pj.cityShare}: {money(cityShare(p), lang)} · {pj.debtService(money(yearlyDebtService(cityShare(p)), lang))}</li>
        </ul>
        <div className="choices">
          {(['public', 'p3'] as const).map((h) => (
            <button key={h} className="choice" onClick={() => game.chooseProcurement(p.id, h)}><b>{pj.procurement[h].title}</b><span>{pj.procurement[h].body}</span></button>
          ))}
        </div>
      </>
    );
  }
  if (d.kind === 'overrun') {
    const a = Number(d.data.amount);
    return (
      <>
        <h2>{pj.overrun.title(p.design.name)}</h2>
        <p>{pj.overrun.intro(money(a, lang), Number(d.data.share))}</p>
        <div className="choices">
          <button className="choice" onClick={() => game.answerOverrun(p.id, 'pay')}><b>{pj.overrun.pay.title}</b><span>{pj.overrun.pay.body(money(a, lang))}</span></button>
          <button className="choice" onClick={() => game.answerOverrun(p.id, 'trim')}><b>{pj.overrun.trim.title}</b><span>{pj.overrun.trim.body(money(a * 0.5, lang))}</span></button>
          <button className="choice" onClick={() => game.answerOverrun(p.id, 'pause')}><b>{pj.overrun.pause.title}</b><span>{pj.overrun.pause.body(money(a * 0.4, lang))}</span></button>
        </div>
      </>
    );
  }
  return null;
}

/** Opening day: the signature moment, full screen. */
export function OpeningDay({ game, t, lang }: { game: GameApi; t: Strings; lang: Lang }) {
  const d = game.decision;
  if (d?.kind !== 'lineOpen') return null;
  const p = game.state?.projects?.find((x) => x.id === d.data.project);
  if (!p) return null;
  const o = t.pj.opening;
  const rw = p.rework;
  return (
    <div className="opening-wrap" role="dialog" aria-modal="true" aria-label={o.title(p.design.name)} style={{ ['--line' as string]: p.design.color }}>
      <section className="opening">
        <div className="decision-kicker">{o.kicker} · {fmtDate(d.date, lang)}</div>
        <div className="opening-badge">{p.design.shortName}</div>
        <h2>{o.title(p.design.name)}</h2>
        <p className="opening-stats">{o.stats(km(Number(d.data.km), lang), Number(d.data.stations), money(Number(d.data.cost), lang), km(Number(d.data.years), lang))}</p>
        <ol className="opening-line">{p.design.stations.map((x) => <li key={x.id}><i /><span>{x.name}</span></li>)}</ol>
        {Number(d.data.rough) > 0 && <p className="opening-rough">{o.rough}</p>}
        {rw?.routes.length ? (
          <div className="choices">
            <button className="choice" onClick={() => game.openingDay(d.id, true)}><b>{o.reworkTitle(rw.routes.length)}</b>
              <span>{o.reworkBody(rw.routes.map((r) => r.name).join(', '))}</span></button>
            <button className="choice" onClick={() => game.openingDay(d.id, false)}><b>{o.keepTitle}</b><span>{o.keepBody}</span></button>
          </div>
        ) : <div className="plan-actions"><button className="btn primary" onClick={() => game.openingDay(d.id, false)}>{o.celebrate}</button></div>}
      </section>
    </div>
  );
}
