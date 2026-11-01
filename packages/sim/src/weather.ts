/**
 * Ottawa weather, day by day (M6): deterministic from the date and the campaign seed, so a saved
 * game replays the same winter. Built from approximate 1981–2010 climate normals (Ottawa CDA) with
 * day-to-day anomalies that persist for a few days, so cold snaps and thaws come in spells.
 */

/** Approximate 1981–2010 normals for Ottawa: mean daily high and low (°C), snowfall (cm), rainfall (mm), days with precipitation. */
export const OTTAWA_NORMALS = {
  source: 'Approximate Environment Canada 1981–2010 climate normals, Ottawa CDA (estimate)',
  high: [-5.8, -3.1, 2.5, 11.4, 19.1, 24.4, 26.6, 25.3, 20.6, 12.9, 5.5, -2.3],
  low: [-14.8, -12.9, -6.6, 0.9, 7.7, 13.0, 15.6, 14.3, 9.7, 3.3, -2.0, -10.4],
  snowCm: [47.6, 42.2, 31.5, 6.0, 0, 0, 0, 0, 0, 1.9, 19.2, 52.9],
  rainMm: [23.4, 19.6, 34.0, 64.1, 82.3, 91.0, 89.3, 83.3, 90.4, 82.8, 63.7, 26.4],
  precipDays: [16, 12, 12, 12, 13, 12, 12, 11, 12, 12, 13, 15],
};

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'snow' | 'snowstorm' | 'downpour' | 'freezing' | 'cold' | 'hot';

export interface Weather {
  date: string;
  /** daily high and low, °C */
  high: number;
  low: number;
  snowCm: number;
  rainMm: number;
  kind: WeatherKind;
}

const DAY = 86_400_000;
const MID = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349]; // mid-month day of year

/** A uniform number in [0, 1) from a seed and a key (mulberry32 over an FNV hash). */
export function rand(seed: number, key: string): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  let t = (h >>> 0) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function gauss(seed: number, key: string): number {
  const u = Math.max(1e-9, rand(seed, `${key}:u`));
  const v = rand(seed, `${key}:v`);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** A normal for a day of the year, interpolated between mid-month values. */
function normal(values: number[], doy: number): number {
  let i = MID.findIndex((m) => m > doy);
  if (i === -1) i = 12;
  const a = (i + 11) % 12;
  const b = i % 12;
  const da = i === 0 ? MID[11]! - 365 : MID[a]!;
  const db = i === 12 ? MID[0]! + 365 : MID[b]!;
  const f = (doy - da) / (db - da);
  return values[a]! + f * (values[b]! - values[a]!);
}

const WEIGHTS = [0.5, 0.42, 0.32, 0.22, 0.12];
const W_NORM = Math.sqrt(WEIGHTS.reduce((s, w) => s + w * w, 0));

/** The weather in Ottawa on a date (YYYY-MM-DD). */
export function weatherOn(iso: string, seed = 2010): Weather {
  const t = new Date(`${iso}T12:00:00Z`).getTime();
  const d = Math.floor(t / DAY);
  const date = new Date(t);
  const doy = Math.floor((t - Date.UTC(date.getUTCFullYear(), 0, 1, 12)) / DAY);
  const m = date.getUTCMonth();
  // anomalies persist for a few days: a weighted sum of the last five days' random draws
  let a = 0;
  for (let k = 0; k < WEIGHTS.length; k++) a += WEIGHTS[k]! * gauss(seed, `t${d - k}`);
  const winter = Math.cos(((doy - 15) / 365) * 2 * Math.PI); // 1 in mid-January, −1 in mid-July
  const sd = 4.8 + 1.6 * winter; // winters swing more than summers
  const anomaly = (a / W_NORM) * sd;
  let high = normal(OTTAWA_NORMALS.high, doy) + anomaly + gauss(seed, `h${d}`);
  let low = normal(OTTAWA_NORMALS.low, doy) + anomaly + gauss(seed, `l${d}`);
  if (high < low + 2) high = low + 2;
  high = Math.round(high);
  low = Math.round(low);
  // precipitation: as often as the month's normal, amounts exponential around its normal
  const pDays = OTTAWA_NORMALS.precipDays[m]! / new Date(Date.UTC(date.getUTCFullYear(), m + 1, 0)).getUTCDate();
  let snowCm = 0;
  let rainMm = 0;
  if (rand(seed, `p${d}`) < pDays) {
    // snow or rain by the day's temperature; amounts scaled so each month's totals match its normals
    const share = (mean: number) => (mean <= -1 ? 1 : mean >= 2 ? 0 : (2 - mean) / 3);
    const typical = share((normal(OTTAWA_NORMALS.high, doy) + normal(OTTAWA_NORMALS.low, doy)) / 2);
    // some days bring a whole storm system: a heavier tail, same monthly totals
    const system = rand(seed, `s${d}`) < 0.18 ? 4 : 1;
    const u = (-Math.log(Math.max(1e-6, rand(seed, `a${d}`))) * system) / 1.54;
    const snowShare = share((high + low) / 2);
    const days = OTTAWA_NORMALS.precipDays[m]!;
    snowCm = Math.min(42, Math.round(u * snowShare * (OTTAWA_NORMALS.snowCm[m]! / days) / Math.max(0.3, typical)));
    rainMm = Math.round(u * (1 - snowShare) * (OTTAWA_NORMALS.rainMm[m]! / days) / Math.max(0.3, 1 - typical));
  }
  const kind: WeatherKind = snowCm >= 15 ? 'snowstorm' : rainMm >= 25 ? 'downpour'
    : snowCm >= 1 && rainMm >= 1 && low < 0 ? 'freezing' : low <= -25 ? 'cold' : high >= 31 ? 'hot'
      : snowCm >= 1 ? 'snow' : rainMm >= 2 ? 'rain' : rand(seed, `c${d}`) < 0.45 ? 'cloudy' : 'clear';
  return { date: iso, high, low, snowCm, rainMm, kind };
}

/** The temperature at a time of day (seconds after midnight): coldest near dawn, warmest mid-afternoon. */
export function temperatureAt(w: Weather, t: number): number {
  const h = (((t / 3600) % 24) + 24) % 24;
  // lowest at 06:00, highest at 15:00
  const f = h >= 6 && h <= 15 ? (1 - Math.cos(((h - 6) / 9) * Math.PI)) / 2 : (1 + Math.cos((((h + 24 - 15) % 24) / 15) * Math.PI)) / 2;
  return Math.round(w.low + f * (w.high - w.low));
}

/** How the day's weather changes ridership (storms keep people home; schools close). */
export function weatherRiders(w: Weather): number {
  if (w.kind === 'snowstorm') return w.snowCm >= 25 ? 0.82 : 0.9;
  if (w.kind === 'freezing') return 0.95;
  if (w.snowCm >= 5) return 0.97;
  if (w.kind === 'downpour' || w.kind === 'cold') return 0.97;
  return 1;
}

/** Typical lateness of buses that day (minutes): snow slows traffic, deep cold breaks buses down. */
export function weatherDelay(w: Weather): number {
  return Math.min(20, w.snowCm * 0.6 + (w.kind === 'freezing' ? 6 : 0) + (w.low <= -25 ? 3 : 0) + (w.rainMm >= 25 ? 2 : 0));
}
