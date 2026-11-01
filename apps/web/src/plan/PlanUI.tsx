import { useEffect, useState } from 'react';
import { HEADWAY_STEPS, PLAN_PERIODS, type District, type Headways, type NetRoute } from '@otc/shared';
import { currentHeadways, type Scorecard } from '@otc/sim';
import { fmtK, type Strings } from '../i18n/strings';
import type { NetworkState } from '../network/useNetwork';
import type { PlanState } from './usePlan';

/** One period's headway with − / + steppers (− = more frequent). */
function Stepper({ label, value, onChange, t }: { label: string; value: number; onChange: (v: number) => void; t: Strings }) {
  const i = HEADWAY_STEPS.indexOf(value as (typeof HEADWAY_STEPS)[number]);
  const at = i < 0 ? HEADWAY_STEPS.length - 1 : i;
  return (
    <li className="stepper">
      <span>{label}</span>
      <button aria-label="−" disabled={at === 0} onClick={() => onChange(HEADWAY_STEPS[Math.max(0, at - 1)]!)}>−</button>
      <b>{value > 0 ? `${t.every} ${value} min` : t.noService}</b>
      <button aria-label="+" disabled={at === HEADWAY_STEPS.length - 1} onClick={() => onChange(HEADWAY_STEPS[Math.min(HEADWAY_STEPS.length - 1, at + 1)]!)}>+</button>
    </li>
  );
}

export function HeadwayEditor({ value, onChange, t }: { value: Headways; onChange: (h: Headways) => void; t: Strings }) {
  return (
    <ul className="steppers">
      {PLAN_PERIODS.map((p) => (
        <Stepper key={p.id} label={`${t.periodName[p.id]} · ${p.from}–${p.to}`} value={value[p.id]} t={t}
          onChange={(v) => onChange({ ...value, [p.id]: v })} />
      ))}
    </ul>
  );
}

/** In a route's panel during Plan mode: change its headways, or take it out of service. */
export function RouteServiceEditor({ route, net, plan, t }: { route: NetRoute; net: NetworkState; plan: PlanState; t: Strings }) {
  const [h, setH] = useState<Headways>(() => currentHeadways(route, net.network));
  useEffect(() => setH(currentHeadways(route, net.network)), [route, net.network]);
  const now = currentHeadways(route, net.network);
  const changed = PLAN_PERIODS.some((p) => h[p.id] !== now[p.id]);
  return (
    <div className="plan-box">
      <div className="sec">{t.serviceEditor}</div>
      <HeadwayEditor value={h} onChange={setH} t={t} />
      <p className="muted small">{t.serviceNote}</p>
      <div className="plan-actions">
        <button className="btn primary" disabled={!changed} onClick={() => plan.addEdit({ kind: 'service', routeId: route.id, headways: h })}>{t.apply}</button>
        <button className="btn danger" onClick={() => plan.addEdit({ kind: 'remove', routeId: route.id })}>{t.removeRoute}</button>
      </div>
    </div>
  );
}

const ISO_BANDS = [['#0E7C86', '10'], ['#36A3A2', '20'], ['#7EC8B2', '30'], ['#C6E7BE', '45']] as const;

/** The planning dock: tools, the draft in progress, and the evaluation status. */
export function PlanDock({ plan, t, onOpenScorecard, routeNames }: {
  plan: PlanState; t: Strings; onOpenScorecard: () => void; routeNames: Map<string, string>;
}) {
  const { tool, setTool, draft, evalState: ev } = plan;
  const running = ev.status === 'running';
  return (
    <section className="plan-dock glass" aria-label={t.planTitle}>
      <div className="plan-head">
        <b>{t.planTitle}</b>
        <span className="muted">{t.changes(plan.edits.length)}</span>
        <button className="btn ghost" onClick={() => plan.setActive(false)}>{t.done}</button>
      </div>
      {tool === 'draw' ? (
        <div className="plan-draw">
          <p className="muted small">{plan.graphReady ? t.drawHint : t.drawLoading}</p>
          {draft && <p className="draft-stats">{t.draftStats(draft.lengthM / 1000, draft.runSec / 60 + draft.stops.length * 0.33, draft.stops.length,
            draft.stops.filter((s) => s.existing).length)}</p>}
          <details>
            <summary>{t.newRouteService}</summary>
            <HeadwayEditor value={plan.newHeadways} onChange={plan.setNewHeadways} t={t} />
          </details>
          <div className="plan-actions">
            <button className="btn primary" disabled={!draft} onClick={plan.finishDraft}>{t.finishRoute}</button>
            <button className="btn" disabled={!plan.waypoints.length} onClick={plan.undoWaypoint}>{t.undo}</button>
            <button className="btn ghost" onClick={() => setTool('none')}>{t.cancel}</button>
          </div>
        </div>
      ) : tool === 'iso' ? (
        <div className="plan-draw">
          <p className="muted small">{t.isoHint}</p>
          {plan.isoMinutes && (
            <div className="iso-legend"><span>{t.isoLegend}</span>
              {ISO_BANDS.map(([c, m]) => <i key={m} style={{ background: c }}>{m}′</i>)}</div>
          )}
          <div className="plan-actions"><button className="btn ghost" onClick={() => setTool('none')}>{t.done}</button></div>
        </div>
      ) : (
        <>
          <p className="muted small">{t.planHint}</p>
          <div className="plan-tools">
            <button className="btn" onClick={() => setTool('draw')}><span aria-hidden>✎</span> {t.newRoute}</button>
            <button className="btn" onClick={() => setTool('iso')}><span aria-hidden>◎</span> {t.travelTimes}</button>
            <button className="btn primary" disabled={running} onClick={() => { plan.runEvaluation(); onOpenScorecard(); }}>
              {running ? `${t.evaluating}… ${Math.round(100 * (ev.progress ?? 0))}%` : t.evaluate}</button>
            <button className="btn" disabled={!plan.edits.length} onClick={plan.undo}>{t.undo}</button>
            <button className="btn ghost" disabled={!plan.edits.length} onClick={() => confirm(t.resetConfirm) && plan.reset()}>{t.resetPlan}</button>
          </div>
          {plan.edits.length > 0 && (
            <ul className="edit-list">{plan.edits.map((e, i) => {
              const id = e.kind === 'add' ? e.route.shortName : routeNames.get(e.routeId) ?? e.routeId;
              return <li key={i}><span>{t.editLabel(e.kind, id)}</span><button aria-label="×" onClick={() => plan.removeEdit(i)}>×</button></li>;
            })}</ul>
          )}
        </>
      )}
    </section>
  );
}

const DISTRICTS: District[] = ['downtown', 'inner', 'hull', 'suburbs', 'gatineau', 'rural'];

/** Scorecard v1: the plan against 2010 on the indicators the game can compute so far. */
export function ScorecardPanel({ plan, t }: { plan: PlanState; t: Strings }) {
  const ev = plan.evalState;
  const b = ev.baseline;
  const p = ev.plan;
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
  const money = (x: number) => (x >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : `$${x.toFixed(2)}`);
  const rows: { key: keyof Scorecard & keyof Strings['metric']; fmt: (x: number) => string; better: 1 | -1 }[] = [
    { key: 'boardings', fmt: (x) => fmtK(x), better: 1 },
    { key: 'transitShare', fmt: pct, better: 1 },
    { key: 'coverage', fmt: pct, better: 1 },
    { key: 'coverageFrequent', fmt: pct, better: 1 },
    { key: 'jobsIn45', fmt: (x) => fmtK(x), better: 1 },
    { key: 'annualCost', fmt: money, better: -1 },
    { key: 'costPerBoarding', fmt: money, better: -1 },
    { key: 'peakVehicles', fmt: (x) => String(Math.round(x)), better: -1 },
  ];
  const newRoutes = plan.edits.flatMap((e) => (e.kind === 'add' ? [e.route] : []));
  return (
    <div className="ins">
      <div className="ins-head"><div className="ins-icon" style={{ background: '#E8961E' }} />
        <div><div className="ins-title">{t.scorecard}</div><div className="ins-sub">{t.scorecardSub}</div></div></div>
      {ev.status === 'running' && (
        <div className="progress"><div style={{ width: `${Math.round(100 * (ev.progress ?? 0))}%` }} />
          <span>{t.stages[ev.stage ?? 'load'] ?? ev.stage} · {Math.round(100 * (ev.progress ?? 0))}%</span></div>
      )}
      {ev.status === 'error' && <p className="notice">{ev.error}</p>}
      {ev.status === 'idle' && <p className="muted">{t.planHint}</p>}
      {b && p && (
        <>
          {ev.evaluatedEdits !== plan.edits.length && <p className="notice">{t.outdated}</p>}
          <table className="score">
            <thead><tr><th /><th>{t.base2010}</th><th>{t.yourPlan}</th><th /></tr></thead>
            <tbody>{rows.map(({ key, fmt, better }) => {
              const d = (p[key] as number) - (b[key] as number);
              const rel = Math.abs(d) / Math.max(1e-9, Math.abs(b[key] as number));
              const tone = rel < 0.0005 ? '' : d * better > 0 ? 'up' : 'down';
              return (
                <tr key={key} className={tone}>
                  <th>{t.metric[key]}</th><td>{fmt(b[key] as number)}</td><td>{fmt(p[key] as number)}</td>
                  <td>{tone ? `${d > 0 ? '+' : '−'}${key === 'transitShare' || key.startsWith('coverage') ? `${(100 * Math.abs(d)).toFixed(1)} pts` : (100 * rel).toFixed(1) + '%'}` : '·'}</td>
                </tr>
              );
            })}</tbody>
          </table>
          {newRoutes.length > 0 && <>
            <div className="sec">{t.yourChanges}</div>
            <ul className="periods">{newRoutes.map((r) => (
              <li key={r.id}><span>{r.shortName} · {r.longName}</span><b>{Math.round(p.byRoute[r.id] ?? 0).toLocaleString()} {t.newRouteRiders}</b></li>
            ))}</ul>
          </>}
          <div className="sec">{t.byDistrictChange}</div>
          <ul className="bars">{DISTRICTS.filter((k) => p.byDistrict[k] && b.byDistrict[k]).map((k) => {
            const sb = b.byDistrict[k]![1];
            const sp = p.byDistrict[k]![1];
            const d = sp - sb;
            return <li key={k}><span>{t.districtName[k]}</span><i style={{ width: `${Math.min(100, sp * 250)}%` }} />
              <b className={Math.abs(d) < 0.0005 ? '' : d > 0 ? 'up' : 'down'}>{pct(sp)}{Math.abs(d) >= 0.0005 ? ` (${d > 0 ? '+' : '−'}${(100 * Math.abs(d)).toFixed(1)})` : ''}</b></li>;
          })}</ul>
          <p className="muted small">{t.scorecardNote}{ev.seconds ? ` · ${ev.seconds.toFixed(0)} s` : ''}</p>
        </>
      )}
    </div>
  );
}
