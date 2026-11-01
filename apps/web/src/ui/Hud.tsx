import type { Map as MLMap } from 'maplibre-gl';
import { LANGS, SEASONS, TIMES, region, type Lang, type Season, type TimeOfDay } from '@otc/shared';
import type { Strings } from '../i18n/strings';
import type { Layout } from './useLayout';

export interface Settings {
  season: Season;
  time: TimeOfDay;
  lang: Lang;
  buildings3d: boolean;
}

interface HudProps {
  layout: Layout;
  t: Strings;
  settings: Settings;
  onChange: (s: Partial<Settings>) => void;
  map: MLMap | null;
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

function Controls({ t, settings, onChange, compact }: { t: Strings; settings: Settings; onChange: HudProps['onChange']; compact: boolean }) {
  return (
    <div className="controls">
      <Segmented label={t.seasonLabel} value={settings.season} options={SEASONS} onChange={(season) => onChange({ season })}
        render={(s) => (compact ? SEASON_ICON[s] : t.season[s])} />
      <Segmented label={t.timeLabel} value={settings.time} options={TIMES} onChange={(time) => onChange({ time })} render={(v) => t.time[v]} />
      <Segmented label={t.languageLabel} value={settings.lang} options={LANGS} onChange={(lang) => onChange({ lang })} render={(v) => v.toUpperCase()} />
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

function Legend({ t }: { t: Strings }) {
  return (
    <section className="legend glass" aria-label={t.legendTitle}>
      <div className="lg-title">{t.legendTitle}</div>
      <div className="lg-row"><svg viewBox="0 0 40 12"><line x1="2" y1="6" x2="38" y2="6" stroke="var(--boundary)" strokeWidth="2" strokeDasharray="6 4" /></svg>{t.legendRegion}</div>
      <div className="lg-row"><i className="sw sw-outside" />{t.legendOutside}</div>
      <div className="lg-row"><i className="sw sw-field" />{t.legendFields}</div>
      <div className="lg-note">{t.legendNote}</div>
    </section>
  );
}

export function Hud({ layout, t, settings, onChange, map }: HudProps) {
  if (layout === 'phone') {
    return (
      <>
        <header className="m-top glass">
          <Logo size={38} />
          <div className="m-title"><span>{t.dateShort}</span><b>{t.appShort} · 2010</b></div>
        </header>
        <section className="m-sheet">
          <div className="m-grab" />
          <div className="m-sheet-title">{t.mapStyle}</div>
          <Controls t={t} settings={settings} onChange={onChange} compact />
          <div className="m-legend"><i className="sw sw-field" />{t.legendFields}</div>
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
          <div className="clock-sub">{layout === 'desktop' ? 'M1 · 2010 base map' : t.subtitle}</div>
        </div>
        <Controls t={t} settings={settings} onChange={onChange} compact={layout === 'tablet'} />
      </header>
      <MapButtons t={t} map={map} />
      <Legend t={t} />
    </>
  );
}
