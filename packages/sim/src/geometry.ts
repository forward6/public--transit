import type { LonLat } from '@otc/shared';

const R = 6371008.8;

/** A polyline prepared for fast "point at distance" queries (metres). */
export interface PreparedLine {
  coords: LonLat[];
  /** cumulative distance at each vertex, metres */
  cum: Float64Array;
  length: number;
}

export function prepareLine(coords: LonLat[]): PreparedLine {
  const cum = new Float64Array(coords.length);
  for (let i = 1; i < coords.length; i++) cum[i] = cum[i - 1]! + distance(coords[i - 1]!, coords[i]!);
  return { coords, cum, length: cum[coords.length - 1] ?? 0 };
}

/** Equirectangular distance in metres — accurate to <0.1% at city scale. */
export function distance(a: LonLat, b: LonLat): number {
  const lat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * (Math.PI / 180) * Math.cos(lat);
  const dy = (b[1] - a[1]) * (Math.PI / 180);
  return Math.hypot(dx, dy) * R;
}

/** Compass bearing (degrees clockwise from north) from a to b. */
export function bearing(a: LonLat, b: LonLat): number {
  const lat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * Math.cos(lat);
  const dy = b[1] - a[1];
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/** Point and heading at `d` metres along the line (clamped to its ends). */
export function pointAt(line: PreparedLine, d: number): { lonlat: LonLat; bearing: number } {
  const { coords, cum } = line;
  const n = coords.length;
  if (n === 1) return { lonlat: coords[0]!, bearing: 0 };
  const dd = Math.min(Math.max(d, 0), line.length);
  // binary search for the segment containing dd
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! <= dd) lo = mid;
    else hi = mid;
  }
  const a = coords[lo]!;
  const b = coords[hi]!;
  const seg = cum[hi]! - cum[lo]!;
  const t = seg > 0 ? (dd - cum[lo]!) / seg : 0;
  return { lonlat: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], bearing: bearing(a, b) };
}

/** The sub-line between two distances (for trails), as coordinates. */
export function sliceLine(line: PreparedLine, from: number, to: number): LonLat[] {
  const a = Math.max(0, Math.min(from, to));
  const b = Math.min(line.length, Math.max(from, to));
  const out: LonLat[] = [pointAt(line, a).lonlat];
  for (let i = 0; i < line.coords.length; i++) {
    const c = line.cum[i]!;
    if (c > a && c < b) out.push(line.coords[i]!);
  }
  out.push(pointAt(line, b).lonlat);
  return out;
}
