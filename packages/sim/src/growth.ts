// M9: where the city grows after 2010. At each month's end the region adds residents and jobs
// (about 1.3% and 0.9% a year, a little more when transit lets more people reach more jobs), and
// a land-use model places them, zone by zone:
//
// - where people can reach jobs, by car (the 2011 car skim) and by transit (the network in operation:
//   a faster line changes this; a line no faster than the bus it replaces barely does);
// - where there is room to build: infill in the core, subdivisions on the suburban edge (greenfield
//   cells already partly built), a trickle in villages; rezoning near stations adds room;
// - near rapid-transit stations, developers pay a premium (more for a committed new line's), but
//   only where the land is zoned for it;
// - not beside a street torn up for construction: homes there wait, and some businesses close.
//
// New residents and jobs bring riders in proportion to how much their zones use transit.
// Developers offer to build near stations if council rezones the land (a council vote).
import {
  RESIDENTS_PER_HOME, WARDS_2010, type GameState, type GrowthMonth, type GrowthPlace, type GrowthState, type Project, type Rezoning, type Zone,
  type ZoneLos,
} from '@otc/shared';
import { addMonths, toDate } from './economy';
import { constructionNear } from './projects';
import { tableInto } from './agenda';
import { rand } from './weather';

export interface GrowthWorld {
  zones: Zone[];
  /** the 2010 network's level of service */
  baseLos: ZoneLos;
  /** each zone's transit share of trips */
  share: number[];
  /** the 2010 rapid-transit stations (Transitway, O-Train) */
  places?: { lon: number; lat: number; name: string }[];
  /** M7: ward per zone (0: not in Ottawa) */
  wardOf?: number[];
  /** jobs within 30 min by car, per zone (absent: the same everywhere) */
  carAccess?: ArrayLike<number>;
}

/** a year */
export const GROWTH = {
  residents: 0.013,
  jobs: 0.009,
  /** jobs that follow new residents (shops, schools, clinics) */
  localJobs: 0.35,
  /** a walk to a station */
  stationM: 800,
  /** developers' premium beside a station (the 2010 network's; a new line's) */
  stationPremium: 0.25,
  newLinePremium: 0.4,
  /** the core redevelops a little more each year (room per year, share of 2010 residents) */
  intensify: 0.006,
  /** development charges for transit, per new home ($) */
  chargePerHome: 1800,
};

const KX = 78_300; // m per degree of longitude at 45.4° N
const KY = 111_100;
const jobsOf = (z: Zone) => (z.jobs.office ?? 0) + (z.jobs.retail ?? 0) + (z.jobs.institutional ?? 0) + (z.jobs.industrial ?? 0);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Jobs within `minutes` by car, per zone, from the car skim (uint8 minutes, origin-major; 255 = no path). */
export function carAccessOf(zones: Zone[], skim: Uint8Array, minutes = 30): Float32Array {
  const n = zones.length;
  const jobs = zones.map(jobsOf);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let a = 0;
    for (let j = 0; j < n; j++) if (skim[i * n + j]! <= minutes) a += jobs[j]!;
    out[i] = a + (skim[i * n + i]! > minutes ? jobs[i]! : 0);
  }
  return out;
}

interface Static {
  pop0: Float64Array;
  jobs0: Float64Array;
  /** as-of-right room in 2010 (residents, jobs above 2010's) */
  cap: Float64Array;
  capJ: Float64Array;
  place: GrowthPlace[];
  refT: number;
  refC: number;
}
const statics = new WeakMap<Zone[], Static>();

/** What each zone can take without rezoning, and the region's reference access. */
function staticOf(world: GrowthWorld): Static {
  const hit = statics.get(world.zones);
  if (hit && (world.carAccess ? hit.refC > 0 : hit.refC === 0)) return hit;
  const zs = world.zones;
  const n = zs.length;
  const pop0 = new Float64Array(n), jobs0 = new Float64Array(n), cap = new Float64Array(n), capJ = new Float64Array(n);
  const place: GrowthPlace[] = [];
  let wt = 0, sT = 0, sC = 0;
  zs.forEach((z, i) => {
    const p = z.pop, j = jobsOf(z), a = Math.max(0.05, z.areaKm2);
    pop0[i] = p;
    jobs0[i] = j;
    const dens = p / a;
    if (z.district === 'downtown' || z.district === 'inner' || z.district === 'hull') {
      cap[i] = p * 0.04 + 120 * a; // infill
      capJ[i] = j * 0.05 + 300 * a;
      place.push('core');
    } else if (z.district === 'suburbs' || z.district === 'gatineau') {
      // a cell already partly built is the suburban edge: subdivisions fill it; built-out suburbs take a little infill
      cap[i] = dens >= 300 && dens < 2600 ? Math.max(p * 0.04, 1950 * a - p) : dens >= 2600 ? p * 0.04 + 60 * a : p * 0.03;
      capJ[i] = j / a < 1200 && dens >= 300 ? Math.max(j * 0.05, 480 * a - j) : j * 0.05 + 50 * a;
      place.push(z.district === 'gatineau' ? 'gatineau' : 'suburbs');
    } else {
      cap[i] = p * 0.03 + 10 * a; // villages
      capJ[i] = j * 0.03 + 5 * a;
      place.push('rural');
    }
    wt += p;
    sT += p * (world.baseLos.access[i] ?? 0);
    sC += p * (world.carAccess?.[i] ?? 0);
  });
  const st: Static = { pop0, jobs0, cap, capJ, place, refT: sT / Math.max(1, wt), refC: world.carAccess ? sC / Math.max(1, wt) : 0 };
  statics.set(world.zones, st);
  return st;
}

export function startGrowth(n: number, date: string): GrowthState {
  return { pop: new Array<number>(n).fill(0), jobs: new Array<number>(n).fill(0), room: {}, history: [], riders: 1, rezonings: [],
    nextOffer: addMonths(date, 7) };
}

export interface GrowthStation { lon: number; lat: number; name: string; /** a new line's (committed, building or open) */ newLine?: string; weight: number }

/** Stations that draw growth: 2010's rapid-transit stations, and those of lines council has approved (developers buy ahead). */
export function growthStations(s: GameState, world: GrowthWorld): GrowthStation[] {
  const out: GrowthStation[] = (world.places ?? []).map((p) => ({ ...p, weight: 1 }));
  for (const p of s.projects ?? []) {
    if (!committed(p)) continue;
    // a streetcar stop is a smaller draw than a rapid-transit station: the car comes every 10 minutes and runs at bus speeds
    const weight = (p.design.mode as string) === 'streetcar' ? 0.5 : 1;
    for (const st of p.design.stations) out.push({ lon: st.lon, lat: st.lat, name: st.name, newLine: p.id, weight });
  }
  return out;
}
const committed = (p: Project) => p.phase === 'design' || p.phase === 'procurement' || p.phase === 'construction' || p.phase === 'testing' || p.phase === 'open';

/** Each zone's nearest station (m) and the developers' premium there. */
function premiums(zones: Zone[], stations: GrowthStation[]): { dist: Float64Array; tod: Float64Array; near: Int32Array } {
  const n = zones.length;
  const dist = new Float64Array(n).fill(Infinity), tod = new Float64Array(n).fill(1), near = new Int32Array(n).fill(-1);
  zones.forEach((z, i) => {
    stations.forEach((st, k) => {
      const d = Math.hypot((st.lon - z.lon) * KX, (st.lat - z.lat) * KY);
      if (d < dist[i]!) (dist[i] = d), (near[i] = k);
      if (d < GROWTH.stationM) {
        const prem = (st.newLine ? GROWTH.newLinePremium : GROWTH.stationPremium) * st.weight * (1 - d / GROWTH.stationM);
        tod[i] = Math.max(tod[i]!, 1 + prem);
      }
    });
  });
  return { dist, tod, near };
}

/** Spread `total` over the zones by weight, no zone above its room (two passes). */
function allocate(total: number, w: Float64Array, room: Float64Array): Float64Array {
  const out = new Float64Array(w.length);
  let left = total;
  for (let pass = 0; pass < 3 && left > 0.5; pass++) {
    let sw = 0;
    for (let i = 0; i < w.length; i++) if (room[i]! - out[i]! > 0.5) sw += w[i]!;
    if (sw <= 0) break;
    let placed = 0;
    for (let i = 0; i < w.length; i++) {
      const free = room[i]! - out[i]!;
      if (free <= 0.5 || w[i]! <= 0) continue;
      const x = Math.min(free, (left * w[i]!) / sw);
      out[i] = out[i]! + x;
      placed += x;
    }
    left -= placed;
  }
  return out;
}

/** Residents and jobs now, per zone. */
export function zoneNow(world: GrowthWorld, g: GrowthState | undefined, i: number): { pop: number; jobs: number } {
  const z = world.zones[i]!;
  return { pop: z.pop + (g?.pop[i] ?? 0), jobs: jobsOf(z) + (g?.jobs[i] ?? 0) };
}

/** The room left in each zone, residents and jobs (rezoning and the years' redevelopment included). */
export function roomLeft(s: GameState, world: GrowthWorld, g: GrowthState): { room: Float64Array; roomJ: Float64Array } {
  const st = staticOf(world);
  const years = Math.max(0, (toDate(s.date).getTime() - toDate('2010-12-01').getTime()) / (365.25 * 86_400_000));
  const n = world.zones.length;
  const los = s.los && s.los.access.length === n ? s.los : world.baseLos;
  const room = new Float64Array(n), roomJ = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const extra = g.room[i];
    // the core redevelops a little each year as of right (more where transit has made it easier to reach jobs)
    const better = clamp((los.access[i]! + 1e4) / (world.baseLos.access[i]! + 1e4), 0.8, 2) ** 2;
    const k = st.place[i] === 'core' ? GROWTH.intensify * years * better : 0;
    room[i] = Math.max(0, st.cap[i]! + st.pop0[i]! * k + (extra?.[0] ?? 0) - (g.pop[i] ?? 0));
    roomJ[i] = Math.max(0, st.capJ[i]! + st.jobs0[i]! * k + (extra?.[1] ?? 0) - (g.jobs[i] ?? 0));
  }
  return { room, roomJ };
}

/** How much each zone draws growth: reach by transit and by car, against the region's average (log scale). */
export function attraction(s: GameState, world: GrowthWorld): { res: Float64Array; job: Float64Array } {
  const st = staticOf(world);
  const los = s.los && s.los.access.length === world.zones.length ? s.los : world.baseLos;
  const n = world.zones.length;
  const res = new Float64Array(n), job = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ut = Math.log((los.access[i]! + 1e4) / (st.refT + 1e4));
    const uc = world.carAccess ? Math.log((world.carAccess[i]! + 2e4) / (st.refC + 2e4)) : 0;
    res[i] = Math.exp(0.6 * ut + 0.5 * uc);
    job[i] = Math.exp(0.9 * ut + 0.4 * uc);
  }
  return { res, job };
}

/**
 * The month's growth, at the turn of a month (`month` is the month that ended, YYYY-MM). Adds
 * residents and jobs to the zones, records where they went, updates the riders growth brings, and
 * sometimes brings a developer's offer.
 */
export function advanceGrowth(s: GameState, world: GrowthWorld, month: string): void {
  const zs = world.zones;
  const n = zs.length;
  if (!n || world.baseLos.access.length !== n) return;
  const prev = s.growth && s.growth.pop.length === n ? s.growth : startGrowth(n, s.date);
  const g: GrowthState = { ...prev, pop: prev.pop.slice(), jobs: prev.jobs.slice(), history: prev.history.slice(-299), rezonings: prev.rezonings.slice() };
  s.growth = g;
  const st = staticOf(world);
  const los = s.los && s.los.access.length === n ? s.los : world.baseLos;
  const stations = growthStations(s, world);
  const { dist, tod } = premiums(zs, stations);
  const building = constructionNear(s, zs);
  const { res, job } = attraction(s, world);
  const { room, roomJ } = roomLeft(s, world, g);

  // how much: the region's pace, nudged by how many jobs its residents can reach by transit against 2010
  let popNow = 0, jobsNow = 0, gain = 0;
  for (let i = 0; i < n; i++) {
    const p = st.pop0[i]! + g.pop[i]!;
    popNow += p;
    jobsNow += st.jobs0[i]! + g.jobs[i]!;
    gain += p * (los.access[i]! + 1e4) / (world.baseLos.access[i]! + 1e4);
  }
  const boost = clamp(1 + 0.6 * (gain / Math.max(1, popNow) - 1), 0.85, 1.25);
  const addPop = (popNow * GROWTH.residents * boost) / 12;
  const addJobs = (jobsNow * GROWTH.jobs * boost) / 12;

  // where: residents
  const wRes = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (room[i]! <= 0.5) continue;
    wRes[i] = room[i]! ** 0.75 * res[i]! * tod[i]! * (1 - 0.6 * (building?.[i] ?? 0));
  }
  const newPop = allocate(addPop, wRes, room);
  // jobs: most go where employers can draw on workers and customers; the rest follow the new residents
  const wJob = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (roomJ[i]! <= 0.5) continue;
    wJob[i] = roomJ[i]! ** 0.75 * job[i]! * tod[i]! * (1 - 0.8 * (building?.[i] ?? 0));
  }
  const basic = allocate(addJobs * (1 - GROWTH.localJobs), wJob, roomJ);
  const localRoom = new Float64Array(n);
  for (let i = 0; i < n; i++) localRoom[i] = Math.max(0, roomJ[i]! - basic[i]!);
  const local = allocate(addJobs * GROWTH.localJobs, newPop, localRoom);

  // businesses beside a construction site: a few close each month while the street is torn up
  let lost = 0;
  const month0: GrowthMonth = { month, pop: 0, jobs: 0, where: { station: 0, core: 0, suburbs: 0, gatineau: 0, rural: 0 }, lost: 0, top: [] };
  const top: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const b = building?.[i] ?? 0;
    let l = 0;
    if (b > 0.25) {
      const z = zs[i]!;
      l = ((z.jobs.retail ?? 0) + 0.3 * (z.jobs.office ?? 0)) * 0.004 * b;
      lost += l;
    }
    const dp = Math.round(newPop[i]!);
    const dj = Math.round(basic[i]! + local[i]! - l);
    if (!dp && !dj) continue;
    g.pop[i] = g.pop[i]! + dp;
    g.jobs[i] = g.jobs[i]! + dj;
    month0.pop += dp;
    month0.jobs += dj;
    month0.where[dist[i]! < GROWTH.stationM ? 'station' : st.place[i]!] += dp;
    if (dp + dj > 0) top.push([i, dp, dj]);
  }
  month0.lost = Math.round(lost);
  month0.top = top.sort((a, b) => b[1] + b[2] - a[1] - a[2]).slice(0, 6);
  g.history.push(month0);
  g.riders = growthRiders(world, g, los);
  offer(s, world, g, stations, res, room);
}

/**
 * The riders growth brings, as a multiplier on 2010's: new residents and jobs ride as much as their
 * zone does (a little more where transit has improved since 2010).
 */
export function growthRiders(world: GrowthWorld, g: GrowthState, los: ZoneLos): number {
  let resBase = 0, resAdd = 0, jobBase = 0, jobAdd = 0;
  world.zones.forEach((z, i) => {
    const sh = world.share[i] ?? 0;
    const better = clamp(((los.access[i]! + 1e4) / (world.baseLos.access[i]! + 1e4)) ** 0.3, 0.7, 1.6);
    resBase += z.pop * sh;
    resAdd += (g.pop[i] ?? 0) * sh * better;
    jobBase += jobsOf(z) * sh;
    jobAdd += (g.jobs[i] ?? 0) * sh * better;
  });
  return 1 + 0.6 * (resAdd / Math.max(1, resBase)) + 0.4 * (jobAdd / Math.max(1, jobBase));
}

/** Sometimes a developer offers to build beside a station, in Ottawa, if council rezones the land. */
function offer(s: GameState, world: GrowthWorld, g: GrowthState, stations: GrowthStation[], res: Float64Array, room: Float64Array) {
  if (s.date < g.nextOffer || !s.council || !world.wardOf) return;
  if (s.events.some((e) => e.kind === 'developer' && e.decision) || g.rezonings.some((r) => r.status === 'offered' || r.status === 'council')) return;
  const zs = world.zones;
  const recent = new Set(g.rezonings.filter((r) => r.date > addMonths(s.date, -36)).map((r) => r.station));
  const cands: { st: GrowthStation; zones: number[]; score: number; ward: number }[] = [];
  for (const st of stations) {
    if (recent.has(st.name)) continue;
    const near: number[] = [];
    zs.forEach((z, i) => {
      if (Math.hypot((st.lon - z.lon) * KX, (st.lat - z.lat) * KY) < GROWTH.stationM) near.push(i);
    });
    if (!near.length) continue;
    const ward = world.wardOf[near[0]!] ?? 0;
    if (!ward) continue; // Gatineau's land is Gatineau's to zone
    // developers want a well-connected spot without the room to build on it as of right
    const pull = near.reduce((a, i) => a + res[i]!, 0) / near.length;
    const tight = 1 / (1 + near.reduce((a, i) => a + room[i]!, 0) / 1500);
    cands.push({ st, zones: near, ward, score: pull * (0.4 + tight) * (st.newLine ? 2 : 1) * st.weight });
  }
  if (!cands.length) return;
  cands.sort((a, b) => b.score - a.score);
  const r1 = rand(s.seed, `dev:${s.date}`);
  const pick = cands[Math.min(cands.length - 1, Math.floor(r1 * Math.min(5, cands.length)))]!;
  const r2 = rand(s.seed, `dev-size:${s.date}`);
  const homes = Math.round((600 + 1800 * r2 * (pick.st.newLine ? 1.4 : 1)) / 100) * 100;
  const jobs = Math.round((homes * (0.15 + 0.3 * rand(s.seed, `dev-jobs:${s.date}`))) / 50) * 50;
  const rz: Rezoning = { id: `rz-${s.date}`, date: s.date, station: pick.st.name, lon: pick.st.lon, lat: pick.st.lat, zones: pick.zones, homes, jobs,
    ward: pick.ward, ...(pick.st.newLine ? { newLine: true } : {}), status: 'offered' };
  g.rezonings.push(rz);
  g.nextOffer = addMonths(s.date, 5 + Math.floor(rand(s.seed, `dev-next:${s.date}`) * 5));
  s.events.push({ id: `developer-${s.date}`, kind: 'developer', date: s.date, decision: true,
    data: { rezoning: rz.id, station: rz.station, homes, jobs, ward: rz.ward, newLine: rz.newLine ? 1 : 0 } });
}

/** Back the developer's offer (council votes on the rezoning) or turn it down. */
export function answerDeveloper(prev: GameState, eventId: string, back: boolean): GameState {
  const ev = prev.events.find((e) => e.id === eventId);
  const g = prev.growth;
  const rz = g?.rezonings.find((r) => r.id === ev?.data.rezoning);
  if (!ev || !g || !rz) return prev;
  const s: GameState = { ...prev, events: prev.events.map((e) => (e.id === eventId ? { ...e, decision: false } : e)),
    growth: { ...g, rezonings: g.rezonings.map((r) => (r.id === rz.id ? { ...r, status: back ? 'council' : 'declined' } : r)) } };
  if (!back) return s;
  s.council = { ...s.council!, items: [...s.council!.items] };
  tableInto(s, 'rezoning', 'council', { rezoningId: rz.id, routeName: rz.station },
    { rezoning: { homes: rz.homes, jobs: rz.jobs, ward: rz.ward, ...(rz.newLine ? { newLine: true } : {}) } });
  return s;
}

/** Council's vote on a rezoning: the room for the homes and jobs, and the development charges. */
export function rezoningVoted(s: GameState, rezoningId: string, passed: boolean): void {
  const g = s.growth;
  const rz = g?.rezonings.find((r) => r.id === rezoningId);
  if (!g || !rz) return;
  const room = { ...g.room };
  if (passed) {
    const share = 1 / rz.zones.length;
    for (const i of rz.zones) {
      const cur = room[i] ?? [0, 0];
      room[i] = [cur[0] + rz.homes * RESIDENTS_PER_HOME * share, cur[1] + rz.jobs * share];
    }
    s.capitalReserve += rz.homes * GROWTH.chargePerHome;
  }
  s.growth = { ...g, room, rezonings: g.rezonings.map((r) => (r.id === rz.id ? { ...r, status: passed ? 'approved' : 'refused' } : r)) };
  s.events.push({ id: `rezoned-${rz.id}`, kind: 'rezoned', date: s.date, decision: false,
    data: { station: rz.station, homes: rz.homes, jobs: rz.jobs, passed: passed ? 1 : 0, charges: passed ? rz.homes * GROWTH.chargePerHome : 0 } });
}

/** A rural ward's councillor? (rezoning in the countryside reads differently) */
export const ruralWard = (ward: number) => !!WARDS_2010.find((w) => w.id === ward)?.rural;

/** Since 2010: residents and jobs added, by kind of place, and the share near rapid transit. */
export function growthSummary(g: GrowthState | undefined): { pop: number; jobs: number; lost: number; where: Record<GrowthPlace, number> } {
  const where: Record<GrowthPlace, number> = { station: 0, core: 0, suburbs: 0, gatineau: 0, rural: 0 };
  let pop = 0, jobs = 0, lost = 0;
  for (const m of g?.history ?? []) {
    pop += m.pop;
    jobs += m.jobs;
    lost += m.lost;
    for (const k of Object.keys(where) as GrowthPlace[]) where[k] += m.where[k];
  }
  return { pop, jobs, lost, where };
}
