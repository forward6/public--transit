import { WARDS_2010, type WardInfo, type Zone } from '@otc/shared';

/**
 * Ottawa's 23 wards of 2006–2014, approximated over the demand zones: each zone joins the ward
 * whose centre is nearest, with per-ward weights balanced so wards have similar populations (as the
 * real boundaries were drawn to). Rural wards come out large by area, as they were. Gatineau's zones
 * belong to no Ottawa ward (0).
 */
export function assignWards(zones: Zone[], wards: WardInfo[] = WARDS_2010, iterations = 80): number[] {
  const KX = 78.3; // km per degree of longitude at 45.4° N
  const KY = 111.1;
  const ott = zones.map((z, i) => (z.city === 'ottawa' ? i : -1)).filter((i) => i >= 0);
  const total = ott.reduce((a, i) => a + zones[i]!.pop, 0);
  const target = total / wards.length;
  const weight = new Float64Array(wards.length);
  const dist = ott.map((i) => wards.map((w) => Math.hypot((zones[i]!.lon - w.seed[0]) * KX, (zones[i]!.lat - w.seed[1]) * KY)));
  const owner = new Int32Array(ott.length);
  for (let it = 0; it <= iterations; it++) {
    const pop = new Float64Array(wards.length);
    ott.forEach((zi, k) => {
      let best = 0;
      let bd = Infinity;
      for (let w = 0; w < wards.length; w++) {
        const d = dist[k]![w]! - weight[w]!;
        if (d < bd) (bd = d), (best = w);
      }
      owner[k] = best;
      pop[best] = pop[best]! + zones[zi]!.pop;
    });
    if (it === iterations) break;
    // grow wards short of people, shrink crowded ones (km of reach)
    for (let w = 0; w < wards.length; w++) weight[w] = weight[w]! + 0.6 * Math.max(-1, Math.min(1, (target - pop[w]!) / target));
  }
  const out = new Array<number>(zones.length).fill(0);
  ott.forEach((zi, k) => (out[zi] = wards[owner[k]!]!.id));
  return out;
}

/** Which wards a set of points falls in (nearest zone's ward), e.g. a route's stops. */
export function wardsAt(points: [number, number][], zones: Zone[], wardOf: number[]): number[] {
  const found = new Set<number>();
  for (const [lon, lat] of points) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i]!;
      const d = (z.lon - lon) ** 2 * 0.5 + (z.lat - lat) ** 2;
      if (d < bd) (bd = d), (best = i);
    }
    if (best >= 0 && wardOf[best]! > 0) found.add(wardOf[best]!);
  }
  return [...found].sort((a, b) => a - b);
}
