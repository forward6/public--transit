import type { ReactNode } from 'react';
import type { Map as MLMap } from 'maplibre-gl';
import { LANGS, SEASONS, TIMES, formatClock, region, type Lang, type NetworkStatus, type Season, type TimeOfDay } from '@otc/shared';
import type { Strings } from '../i18n/strings';
import type { SpeedIndex } from '../sim/clock';
import type { Layout } from './useLayout';

export interface Settings {
  season: Season;
  time: TimeOfDay;
  lang: Lang;
  buildings3d: boolean;
  /** M3 Riders view */
  riders: boolean;
}

interface HudProps {
  layout: Layout;
  t: Strings;
  settings: Settings;
  onChange: (s: Partial<Settings>) => void;
  map: MLMap | null;
  /** game clock (seconds after midnight) and speed */
  time: number;
  speed: SpeedIndex;
  onSpeed: (s: SpeedIndex) => void;
  inService: number;
  status: NetworkStatus | null;
  statusNote?: string;
  inspector: ReactNode | null;
  onCloseInspector: () => void;
  onOpenCatalogue: () => void;
  /** weekday boardings from the demand model (null until it is built) */
  boardings: number | null;
  onOpenRidership: () => void;
  /** M4 Plan mode */
  planActive: boolean;
  onTogglePlan: () => void;
  dock: ReactNode | null;
}

export function Logo({ size = 42 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 44 44" role="img" aria-label="OTC">
      <rect x="1" y="1" width="42" height="42" rx="11" fill="#13233D" />
      <path d="M6 12 C 15 13, 18 19, 22 22" stroke="#E5394B" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <path d="M6 33 C 14 31, 17 25, 22 22" stroke="#33B36B" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <path d="M21 6 C 22 12, 21 17, 22 22" stroke="#22C2CF" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <path d="M22 22 L 37 22" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
      <circle cx="22" cy="22" r="3.4" fill="#FFFFFF" />
    </svg>
  );
}

function Segmented<T extends string>({ label, value, options, onChange, render }: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  render: (v: T) => string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} role="radio" aria-checked={o === value} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>
          {render(o)}
        </button>
      ))}
    </div>
  );
}

const SEASON_ICON: Record<Season, string> = { winter: '❄', spring: '✿', summer: '☀', autumn: '❦' };

function Controls({ t, settings, onChange, compact, hasRiders, plan }: { t: Strings; settings: Settings; onChange: HudProps['onChange']; compact: boolean;
  hasRiders: boolean; plan?: { active: boolean; toggle: () => void } }) {
  return (
    <div className="controls">
      {plan && <button className={`toggle plan-toggle ${plan.active ? 'on' : ''}`} aria-pressed={plan.active} onClick={plan.toggle}>{t.plan}</button>}
      <Segmented label={t.seasonLabel} value={settings.season} options={SEASONS} onChange={(season) => onChange({ season })}
        render={(s) => (compact ? SEASON_ICON[s] : t.season[s])} />
      <Segmented label={t.timeLabel} value={settings.time} options={TIMES} onChange={(time) => onChange({ time })} render={(v) => t.time[v]} />
      <Segmented label={t.languageLabel} value={settings.lang} options={LANGS} onChange={(lang) => onChange({ lang })} render={(v) => v.toUpperCase()} />
      {hasRiders && <button className={`toggle ${settings.riders ? 'on' : ''}`} aria-pressed={settings.riders}
        onClick={() => onChange({ riders: !settings.riders })}>{t.riders}</button>}
      <button className={`toggle ${settings.buildings3d ? 'on' : ''}`} aria-pressed={settings.buildings3d}
        onClick={() => onChange({ buildings3d: !settings.buildings3d })}>{t.buildings3d}</button>
    </div>
  );
}

function MapButtons({ t, map }: { t: Strings; map: MLMap | null }) {
  return (
    <div className="mapbuttons glass">
      <button aria-label={t.zoomIn} onClick={() => map?.zoomIn()}>+</button>
      <button aria-label={t.zoomOut} onClick={() => map?.zoomOut()}>−</button>
      <button aria-label={t.resetView} onClick={() => map?.flyTo({ ...region.home, duration: 1200 })}>
        <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 3 L15 12 L12 11 L9 12 Z" fill="var(--hot)" /><path d="M12 21 L9 12 L12 13 L15 12 Z" fill="var(--muted)" /></svg>
      </button>
    </div>
  );
}

const SPEED_ICONS = [
  <path key="p" d="M5 4h3.2v12H5zM11.8 4H15v12h-3.2z" />,
  <path key="1" d="M6 4l10 6-10 6z" />,
  <path key="2" d="M3 4l7 6-7 6zM10 4l7 6-7 6z" />,
  <path key="3" d="M1 5l5.5 5L1 15zM7 5l5.5 5L7 15zM13 5l5.5 5-5.5 5z" />,
];

function SpeedControl({ t, speed, onSpeed }: { t: Strings; speed: SpeedIndex; onSpeed: (s: SpeedIndex) => void }) {
  return (
    <div className="speed" role="radiogroup" aria-label="Speed">
      {SPEED_ICONS.map((icon, i) => (
        <button key={i} role="radio" aria-checked={speed === i} aria-label={t.speed[i]} title={t.speed[i]}
          className={speed === i ? 'on' : ''} onClick={() => onSpeed(i as SpeedIndex)}>
          <svg viewBox="0 0 20 20" fill="currentColor">{icon}</svg>
        </button>
      ))}
    </div>
  );
}

function StatusChip({ t, status, note, onClick }: { t: Strings; status: NetworkStatus | null; note?: string; onClick?: () => void }) {
  if (!status) return null;
  return <button className={`status-chip status-${status}`} title={note} onClick={onClick}><i />{t.networkStatus[status]}</button>;
}

function RidersChip({ t, boardings, onClick }: { t: Strings; boardings: number | null; onClick: () => void }) {
  if (boardings === null) return null;
  return <button className="status-chip riders" onClick={onClick}><i />{t.ridersChip(boardings)}</button>;
}

function Legend({ t, riders }: { t: Strings; riders: boolean }) {
  return (
    <section className="legend glass" aria-label={t.legendTitle}>
      <div className="lg-title">{t.legendTitle}</div>
      <div className="lg-row"><svg viewBox="0 0 40 12"><line x1="3" y1="6" x2="37" y2="6" stroke="var(--transitway)" strokeWidth="6" strokeLinecap="round" /><line x1="5" y1="6" x2="35" y2="6" stroke="#fff" strokeWidth="1.3" opacity="0.7" /></svg>{t.legendTransitway}</div>
      <div className="lg-row"><svg viewBox="0 0 40 12"><line x1="3" y1="6" x2="37" y2="6" stroke="var(--otrain)" strokeWidth="6" strokeLinecap="round" /><line x1="5" y1="6" x2="35" y2="6" stroke="#fff" strokeWidth="1.4" strokeDasharray="2.5 3.5" /></svg>{t.legendOTrain}</div>
      <div className="lg-row"><svg viewBox="0 0 40 12"><circle cx="20" cy="6" r="4" fill="var(--station-fill)" stroke="var(--transitway)" strokeWidth="2" /></svg>{t.legendStation}</div>
      <div className="lg-row"><svg viewBox="0 0 40 12"><line x1="2" y1="6" x2="38" y2="6" stroke="var(--boundary)" strokeWidth="2" strokeDasharray="6 4" /></svg>{t.legendRegion}</div>
      <div className="lg-row"><i className="sw sw-outside" />{t.legendOutside}</div>
      {riders && <div className="lg-riders"><span className="lg-ramp" />{t.legendRiders}</div>}
      <div className="lg-note">{t.legendNote}</div>
    </section>
  );
}

export function Hud(props: HudProps) {
  const { layout, t, settings, onChange, map, time, speed, onSpeed, inService, status, statusNote, inspector, onCloseInspector, onOpenCatalogue,
    boardings, onOpenRidership, planActive, onTogglePlan, dock } = props;
  const hasRiders = boardings !== null;
  const planCtl = hasRiders ? { active: planActive, toggle: onTogglePlan } : undefined;
  if (layout === 'phone') {
    return (
      <>
        <header className="m-top glass">
          <Logo size={38} />
          <div className="m-title"><span>{t.dateShort} · {inService} {t.inService}</span><b>{formatClock(time)}</b></div>
          <button className="m-play" aria-label={t.speed[speed === 0 ? 1 : 0]} onClick={() => onSpeed(speed === 0 ? 1 : 0)}>
            <svg viewBox="0 0 20 20" fill="currentColor">{SPEED_ICONS[speed === 0 ? 1 : 0]}</svg>
          </button>
        </header>
        <section className="m-sheet">
          <div className="m-grab" />
          {inspector ? (
            <>
              <button className="close" aria-label={t.close} onClick={onCloseInspector}>×</button>
              {inspector}
            </>
          ) : dock ? dock : (
            <>
              <div className="m-sheet-title">{t.mapStyle}</div>
              <SpeedControl t={t} speed={speed} onSpeed={onSpeed} />
              <Controls t={t} settings={settings} onChange={onChange} compact hasRiders={hasRiders} plan={planCtl} />
              <StatusChip t={t} status={status} note={statusNote} onClick={onOpenCatalogue} />
              <RidersChip t={t} boardings={boardings} onClick={onOpenRidership} />
            </>
          )}
        </section>
      </>
    );
  }
  return (
    <>
      <header className="topbar glass">
        <div className="brand">
          <Logo />
          {layout === 'desktop' && (
            <div className="brand-text">
              <div className="brand-name">{t.appName}</div>
              <div className="brand-sub">{t.subtitle}</div>
            </div>
          )}
        </div>
        <div className="clock">
          <div className="clock-date">{t.date}</div>
          <div className="clock-row"><span className="clock-time">{formatClock(time)}</span><span className="clock-sub">{inService} {t.inService}</span></div>
        </div>
        <SpeedControl t={t} speed={speed} onSpeed={onSpeed} />
        {layout === 'desktop' && <div className="chips"><StatusChip t={t} status={status} note={statusNote} onClick={onOpenCatalogue} />
          <RidersChip t={t} boardings={boardings} onClick={onOpenRidership} /></div>}
        <Controls t={t} settings={settings} onChange={onChange} compact={layout === 'tablet'} hasRiders={hasRiders} plan={planCtl} />
      </header>
      <MapButtons t={t} map={map} />
      {inspector ? (
        <aside className="inspector glass">
          <button className="close" aria-label={t.close} onClick={onCloseInspector}>×</button>
          {inspector}
        </aside>
      ) : null}
      {dock}
      {!dock && <Legend t={t} riders={settings.riders && hasRiders} />}
    </>
  );
}
