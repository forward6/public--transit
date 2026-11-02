import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Map as MLMap } from 'maplibre-gl';
import { LANGS, formatClock, region, type Lang, type NetworkStatus } from '@otc/shared';
import type { Strings } from '../i18n/strings';
import type { SpeedIndex } from '../sim/clock';
import type { Layout } from './useLayout';

export interface Settings {
  lang: Lang;
  buildings3d: boolean;
  /** M3 Riders view */
  riders: boolean;
  /** M6 Opinion view */
  opinion: boolean;
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
  /** the riders chip (yesterday's riders once the campaign runs) */
  ridersChip?: ReactNode;
  /** M6: the approval chip, and whether the Opinion view is available */
  approval?: ReactNode;
  hasOpinion?: boolean;
  /** the temperature now (°C) */
  tempC?: number;
  /** the Riders view's legend (riders per day or peak crowding) */
  ridersLegend?: ReactNode;
  /** M7: the Political Capital chip */
  capital?: ReactNode;
  /** the logo opens the menu (continue, new game) */
  onMenu?: () => void;
  /** the "in service" count opens the Operations panel */
  onOpenOps?: () => void;
  /** M4 Plan mode */
  planActive: boolean;
  onTogglePlan: () => void;
  dock: ReactNode | null;
  /** M5: the game date (and a note such as a holiday timetable), and the treasury chip */
  dateLabel?: string;
  dateShort?: string;
  dayNote?: string;
  treasury?: ReactNode;
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

function Gear() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <mask id="otc-gear-hole"><rect width="24" height="24" fill="#fff" /><circle cx="12" cy="12" r="3.3" fill="#000" /></mask>
      <g fill="currentColor" mask="url(#otc-gear-hole)">
        {[0, 45, 90, 135].map((a) => <rect key={a} x="10.15" y="1.6" width="3.7" height="20.8" rx="1.1" transform={`rotate(${a} 12 12)`} />)}
        <circle cx="12" cy="12" r="7.6" />
      </g>
    </svg>
  );
}

/** The settings menu (gear): language, 3D buildings and terrain, back to the main menu. A popover under
 * the gear on desktop and iPad, a sheet from the bottom on a phone. */
function SettingsMenu({ t, settings, onChange, onMenu, phone }: { t: Strings; settings: Settings; onChange: HudProps['onChange'];
  onMenu?: () => void; phone: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!phone && !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    addEventListener('pointerdown', down);
    addEventListener('keydown', key);
    return () => {
      removeEventListener('pointerdown', down);
      removeEventListener('keydown', key);
    };
  }, [open, phone]);
  const body = (
    <div className={`settings-pop ${phone ? 'sheet' : ''}`} role="dialog" aria-label={t.settings} onClick={(e) => e.stopPropagation()}>
      <div className="sp-head"><b>{t.settings}</b>
        {phone && <button className="close" aria-label={t.close} onClick={() => setOpen(false)}>×</button>}</div>
      <div className="sp-row"><span>{t.languageLabel}</span>
        <Segmented label={t.languageLabel} value={settings.lang} options={LANGS} onChange={(lang) => onChange({ lang })}
          render={(v) => (v === 'fr' ? 'Français' : 'English')} /></div>
      <div className="sp-row"><span>{t.view3d}<small>{t.view3dHelp}</small></span>
        <button role="switch" aria-checked={settings.buildings3d} aria-label={t.view3d} className={`switch ${settings.buildings3d ? 'on' : ''}`}
          onClick={() => onChange({ buildings3d: !settings.buildings3d })}><i /></button></div>
      {onMenu && <button className="btn sp-menu" onClick={() => {
        setOpen(false);
        onMenu();
      }}>{t.mainMenu}</button>}
    </div>
  );
  return (
    <div className="settings" ref={ref}>
      <button className={`toggle gear ${open ? 'on' : ''}`} aria-haspopup="dialog" aria-expanded={open} aria-label={t.settings} title={t.settings}
        onClick={() => setOpen((o) => !o)}><Gear /></button>
      {open && (phone ? createPortal(<div className="settings-wrap" onClick={() => setOpen(false)}>{body}</div>, document.body) : body)}
    </div>
  );
}

function Controls({ t, settings, onChange, hasRiders, hasOpinion, plan, onMenu, phone }: { t: Strings; settings: Settings; onChange: HudProps['onChange'];
  hasRiders: boolean; hasOpinion?: boolean; plan?: { active: boolean; toggle: () => void }; onMenu?: () => void; phone: boolean }) {
  return (
    <div className="controls">
      {plan && <button className={`toggle plan-toggle ${plan.active ? 'on' : ''}`} aria-pressed={plan.active} onClick={plan.toggle}>{t.plan}</button>}
      {hasRiders && <button className={`toggle ${settings.riders ? 'on' : ''}`} aria-pressed={settings.riders}
        onClick={() => onChange({ riders: !settings.riders })}>{t.riders}</button>}
      {hasOpinion && <button className={`toggle ${settings.opinion ? 'on' : ''}`} aria-pressed={settings.opinion}
        onClick={() => onChange({ opinion: !settings.opinion })}>{t.op.toggle}</button>}
      <SettingsMenu t={t} settings={settings} onChange={onChange} onMenu={onMenu} phone={phone} />
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

/** pause · real time · 1 min/s · 15 min/s · 2 h/s (watch the day go by) · 1 day/s (watch the weeks go by) */
const SPEED_ICONS = [
  <path key="p" d="M5 4h3.2v12H5zM11.8 4H15v12h-3.2z" />,
  <path key="1" d="M6 4l10 6-10 6z" />,
  <path key="2" d="M3 4l7 6-7 6zM10 4l7 6-7 6z" />,
  <path key="3" d="M1 5l5.5 5L1 15zM7 5l5.5 5L7 15zM13 5l5.5 5-5.5 5z" />,
  <g key="4"><path fillRule="evenodd" d="M10 1.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17zm0 2.2a6.3 6.3 0 1 1 0 12.6a6.3 6.3 0 1 1 0-12.6z" />
    <path d="M9 5h2v4.6l3.4 2.1-1.05 1.7L9 10.8z" /></g>,
  <g key="5"><path fillRule="evenodd" d="M2.5 5.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v10.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2zm2.2 3v7.3h10.6V8.5z" />
    <path d="M6 1h2.2v4.5H6zM11.8 1H14v4.5h-2.2zM6.5 10h3v3h-3z" /></g>,
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

function Legend({ t, riders, opinion, status, ridersLegend }: { t: Strings; riders: boolean; opinion?: boolean; status?: ReactNode; ridersLegend?: ReactNode }) {
  return (
    <section className="legend glass" aria-label={t.legendTitle}>
      <div className="lg-title">{t.legendTitle}</div>
      <div className="lg-row"><svg viewBox="0 0 40 12"><line x1="3" y1="6" x2="37" y2="6" stroke="var(--transitway)" strokeWidth="6" strokeLinecap="round" /><line x1="5" y1="6" x2="35" y2="6" stroke="#fff" strokeWidth="1.3" opacity="0.7" /></svg>{t.legendTransitway}</div>
      <div className="lg-row"><svg viewBox="0 0 40 12"><line x1="3" y1="6" x2="37" y2="6" stroke="var(--otrain)" strokeWidth="6" strokeLinecap="round" /><line x1="5" y1="6" x2="35" y2="6" stroke="#fff" strokeWidth="1.4" strokeDasharray="2.5 3.5" /></svg>{t.legendOTrain}</div>
      <div className="lg-row"><svg viewBox="0 0 40 12"><circle cx="20" cy="6" r="4" fill="var(--station-fill)" stroke="var(--transitway)" strokeWidth="2" /></svg>{t.legendStation}</div>
      <div className="lg-row"><svg viewBox="0 0 40 12"><line x1="2" y1="6" x2="38" y2="6" stroke="var(--boundary)" strokeWidth="2" strokeDasharray="6 4" /></svg>{t.legendRegion}</div>
      <div className="lg-row"><i className="sw sw-outside" />{t.legendOutside}</div>
      {riders && (ridersLegend ?? <div className="lg-riders"><span className="lg-ramp" />{t.legendRiders}</div>)}
      {opinion && <div className="lg-opinion"><span>{t.op.opinionLegend[0]}</span><span className="lg-ramp op" /><span>{t.op.opinionLegend[1]}</span></div>}
      {status && <div className="lg-status">{status}</div>}
      <div className="lg-note">{t.legendNote}</div>
    </section>
  );
}

export function Hud(props: HudProps) {
  // the phone's play button resumes at the last speed used
  const lastSpeed = useRef<SpeedIndex>(3);
  if (props.speed !== 0) lastSpeed.current = props.speed;
  const { layout, t, settings, onChange, map, time, speed, onSpeed, inService, status, statusNote, inspector, onCloseInspector, onOpenCatalogue,
    boardings, ridersChip, planActive, onTogglePlan, dock, dateLabel, dateShort, dayNote, treasury, approval, hasOpinion, tempC, ridersLegend, capital, onMenu, onOpenOps } = props;
  const inServiceText = dayNote ?? (onOpenOps
    ? <button className="link ops-link" onClick={onOpenOps} title={t.ops.open}>{inService} {t.inService}</button> : `${inService} ${t.inService}`);
  // the Operations panel's way in, on every layout: vehicles in service now
  const opsChip = onOpenOps ? (
    <button className="status-chip ops-chip" onClick={onOpenOps} title={t.ops.open} aria-label={`${t.ops.open}: ${inService} ${t.inService}`}>
      <i />{inService.toLocaleString(settings.lang === 'fr' ? 'fr-CA' : 'en-CA')} {t.inService}<span className="chev" aria-hidden="true">›</span>
    </button>) : null;
  const temp = tempC !== undefined ? `${tempC} °C · ` : '';
  const hasRiders = boardings !== null;
  const planCtl = hasRiders ? { active: planActive, toggle: onTogglePlan } : undefined;
  if (layout === 'phone') {
    return (
      <>
        <header className="m-top glass">
          <button className="logo-btn" onClick={onMenu} aria-label={t.st.menu} title={t.st.menu}><Logo size={38} /></button>
          <div className="m-title"><span>{dateShort ?? t.dateShort} · {temp}{inServiceText}</span><b>{formatClock(time)}</b></div>
          <button className="m-play" aria-label={t.speed[speed === 0 ? 3 : 0]} onClick={() => onSpeed(speed === 0 ? (lastSpeed.current || 3) : 0)}>
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
              <div className="m-row"><SpeedControl t={t} speed={speed} onSpeed={onSpeed} /></div>
              <Controls t={t} settings={settings} onChange={onChange} hasRiders={hasRiders} hasOpinion={hasOpinion} plan={planCtl} onMenu={onMenu} phone />
              <div className="m-chips">{treasury}{opsChip}{approval}{capital}{ridersChip}<StatusChip t={t} status={status} note={statusNote} onClick={onOpenCatalogue} /></div>
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
          <button className="logo-btn" onClick={onMenu} aria-label={t.st.menu} title={t.st.menu}><Logo /></button>
          {layout === 'desktop' && (
            <div className="brand-text">
              <div className="brand-name">{t.appName}</div>
              <div className="brand-sub">{t.subtitle}</div>
            </div>
          )}
        </div>
        <div className="clock">
          <div className="clock-date"><span className="d-long">{dateLabel ?? t.date}</span><span className="d-short">{dateShort ?? t.dateShort}</span></div>
          <div className="clock-row"><span className="clock-time">{formatClock(time)}</span>
            <span className="clock-sub">{[tempC !== undefined ? `${tempC} °C` : '', dayNote ?? (opsChip ? '' : `${inService} ${t.inService}`)]
              .filter(Boolean).join(' · ')}</span></div>
        </div>
        <SpeedControl t={t} speed={speed} onSpeed={onSpeed} />
        {layout === 'desktop'
          ? <div className="chips"><div className="chip-row">{treasury}{approval}</div><div className="chip-row">{opsChip}{ridersChip}{capital}</div></div>
          : <div className="chips"><div className="chip-row">{treasury}</div><div className="chip-row">{opsChip}</div></div>}
        <Controls t={t} settings={settings} onChange={onChange} hasRiders={hasRiders} hasOpinion={hasOpinion} plan={planCtl} onMenu={onMenu} phone={false} />
      </header>
      <MapButtons t={t} map={map} />
      {inspector ? (
        <aside className="inspector glass">
          <button className="close" aria-label={t.close} onClick={onCloseInspector}>×</button>
          {inspector}
        </aside>
      ) : null}
      {dock}
      {!dock && <Legend t={t} riders={settings.riders && hasRiders} opinion={settings.opinion && hasOpinion} ridersLegend={ridersLegend}
        status={<>{layout !== 'desktop' && <>{approval}{capital}{ridersChip}</>}<StatusChip t={t} status={status} note={statusNote} onClick={onOpenCatalogue} /></>} />}
    </>
  );
}
