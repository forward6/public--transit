import { ECONOMY_2010, type DiaryEntry, type EconomyStart, type FrontPage, type GameState, type Place, type Post, type PostKind, type Story,
  type StoryKind, type Tone } from '@otc/shared';
import { addDays, dayFactor, missedShare, serviceDay, toDate } from './economy';
import { explainZone, opinionSummary, zoneScore, toApproval, type OpinionWorld } from './opinion';
import { rand, weatherOn } from './weather';

/**
 * The press (M6, PLAN §7.6): a monthly front page made from what happened that month, ranked by
 * how newsworthy it is, and a social feed of residents' posts (the personas' diaries, the weather,
 * changes, and residents of the zones where opinion is strongest). Records are structured; the game
 * renders them in English and French.
 */

const TONE: Record<StoryKind, Tone> = {
  ridershipUp: 'good', ridershipDown: 'bad', approvalUp: 'good', approvalDown: 'bad', routeLaunched: 'good', routeCut: 'bad',
  serviceBoost: 'good', snowstorm: 'bad', coldSnap: 'bad', missedTrips: 'bad', fareHike: 'bad', levyHike: 'bad', deficit: 'bad',
  serviceCuts: 'bad', newBuses: 'good', garage: 'good', riderStory: 'neutral', quiet: 'neutral',
  budgetPassed: 'neutral', budgetRewritten: 'bad', planApproved: 'good', planRejected: 'bad', motionFiled: 'bad', motionPassed: 'bad', strike: 'bad',
  strikeOver: 'good', contract: 'neutral', election: 'neutral', stoRapibus: 'neutral', gatineauVotes: 'neutral', fundingLost: 'bad', reshuffle: 'bad',
  projectApproved: 'good', projectShelved: 'bad', lineFunded: 'good', contractAwarded: 'neutral', constructionStarts: 'neutral', overrun: 'bad',
  projectDelay: 'bad', sinkhole: 'bad', lineOpen: 'good', lineTrouble: 'bad',
};

const story = (kind: StoryKind, salience: number, params: Story['params'] = {}): Story => ({ kind, tone: TONE[kind], salience: Math.round(salience), params });

function monthDays(month: string): string[] {
  const out: string[] = [];
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) out.push(d);
  return out;
}

const prevMonth = (month: string) => addDays(`${month}-01`, -1).slice(0, 7);

/** The front page for a month that has just ended (`month` = YYYY-MM). */
export function frontPage(s: GameState, world: OpinionWorld, month: string, start: EconomyStart = ECONOMY_2010): FrontPage {
  const stories: Story[] = [];
  const o = s.opinion;
  // riders: average weekday, seasonally adjusted, against the month before
  const weekdayAvg = (m: string) => {
    // ordinary weekdays only (not the Christmas break)
    const ds = (s.daily ?? []).filter((r) => r.date.startsWith(m) && serviceDay(r.date) === 'weekday'
      && dayFactor(r.date, start) >= start.dayOfWeek.values[toDate(r.date).getUTCDay()]! * 0.99);
    return ds.length >= 8 ? ds.reduce((a, r) => a + r.boardings, 0) / ds.length / start.seasonal.values[Number(m.slice(5, 7)) - 1]! : null;
  };
  const now = weekdayAvg(month);
  const before = weekdayAvg(prevMonth(month));
  if (now && before) {
    const r = now / before - 1;
    if (Math.abs(r) >= 0.015) stories.push(story(r > 0 ? 'ridershipUp' : 'ridershipDown', 35 + 600 * Math.abs(r), { pct: +(100 * r).toFixed(1) }));
  }
  // approval over the month
  if (o?.history.length) {
    const inMonth = o.history.filter((h) => h.date.startsWith(month));
    const first = o.history.filter((h) => h.date < `${month}-01`).at(-1) ?? o.history[0]!;
    const last = inMonth.at(-1);
    if (last) {
      const d = last.approval - first.approval;
      if (Math.abs(d) >= 1.5) stories.push(story(d > 0 ? 'approvalUp' : 'approvalDown', 30 + 10 * Math.abs(d), { pts: +d.toFixed(1), approval: last.approval }));
    }
  }
  // service changes that month
  for (const shock of o?.shocks.filter((k) => k.date.startsWith(month)) ?? []) {
    if (shock.kind === 'newRoute') stories.push(story('routeLaunched', 70, { route: shock.label ?? '' }));
    else if (shock.kind === 'routeRemoved') stories.push(story('routeCut', 75, { route: shock.label ?? '' }));
    else if (shock.kind === 'serviceUp') stories.push(story('serviceBoost', 45, { n: shock.amount }));
    else if (shock.kind === 'fareHike') stories.push(story('fareHike', 65, {}));
    else if (shock.kind === 'levyHike') stories.push(story('levyHike', 60, {}));
    else if (shock.kind === 'serviceCut') stories.push(story('serviceCuts', 80, {}));
    else if (shock.kind === 'deficit') stories.push(story('deficit', 70, {}));
    else if (shock.kind === 'newGarage') stories.push(story('garage', 45, { name: shock.label ?? '' }));
  }
  const delivered = (o?.shocks ?? []).filter((k) => k.kind === 'newBuses' && k.date.startsWith(month)).reduce((a, k) => a + Number(k.label ?? 0), 0);
  if (delivered > 0) stories.push(story('newBuses', 20 + delivered / 2, { count: delivered }));
  // weather
  const weather = monthDays(month).map((d) => weatherOn(d, s.seed));
  const storm = weather.reduce((a, w) => (w.snowCm > a.snowCm ? w : a), weather[0]!);
  if (storm.snowCm >= 15) stories.push(story('snowstorm', 30 + 2 * storm.snowCm, { cm: storm.snowCm, date: storm.date }));
  const cold = weather.reduce((a, w) => (w.low < a.low ? w : a), weather[0]!);
  if (cold.low <= -25) stories.push(story('coldSnap', 35 + 3 * (-cold.low - 25), { low: cold.low, date: cold.date }));
  // reliability
  const missed = missedShare(s, start);
  if (missed >= 0.01) stories.push(story('missedTrips', 40 + 2000 * missed, { pct: +(100 * missed).toFixed(1) }));
  // council, labour and partners
  for (const e of s.events.filter((x) => x.date.startsWith(month))) {
    const g = (k: string) => e.data[k] ?? '';
    if (e.kind === 'voteResult' && g('kind') === 'budget' && g('passed')) stories.push(story('budgetPassed', 50, { yes: g('yes'), no: g('no') }));
    else if (e.kind === 'councilBudget') stories.push(story('budgetRewritten', 75, { levy: g('levyChange') }));
    else if (e.kind === 'voteResult' && g('kind') === 'plan') stories.push(story(g('passed') ? 'planApproved' : 'planRejected', g('passed') ? 55 : 65, { yes: g('yes'), no: g('no') }));
    else if (e.kind === 'motion') stories.push(story('motionFiled', 55, { route: g('route'), mover: g('mover') }));
    else if (e.kind === 'directive' && g('choice') === 'restore') stories.push(story('motionPassed', 70, { route: g('route') }));
    else if (e.kind === 'strike') stories.push(story('strike', 95, {}));
    else if (e.kind === 'strikeEnds') stories.push(story('strikeOver', 85, { wage: g('wage') }));
    else if (e.kind === 'labourDeal') stories.push(story('contract', 50, { wage: g('wage'), years: g('years'), protest: g('protest') }));
    else if (e.kind === 'election') stories.push(story('election', 100, { allies: g('allies'), before: g('before') }));
    else if (e.kind === 'stoNews' && g('kind') === 'rapibus') stories.push(story('stoRapibus', 45, {}));
    else if (e.kind === 'stoNews' && g('kind') === 'election') stories.push(story('gatineauVotes', 50, { agenda: g('agenda') }));
    else if (e.kind === 'fundingNews' && g('clawedBack')) stories.push(story('fundingLost', 70, { amount: g('clawedBack') }));
    else if (e.kind === 'reshuffle') stories.push(story('reshuffle', 60, { out: g('out') }));
    // M8: big projects
    else if (e.kind === 'lineOpen') stories.push(story('lineOpen', 120, { name: g('name'), km: g('km'), stations: g('stations') }));
    else if (e.kind === 'project') {
      const name = g('name');
      const what = g('what');
      if (what === 'approved') stories.push(story('projectApproved', 70, { name, cost: g('cost') }));
      else if (what === 'shelved' || what === 'cancelled') stories.push(story('projectShelved', 80, { name, stage: g('stage') || what }));
      else if (what === 'funding' && g('amount')) stories.push(story('lineFunded', 55, { name, gov: g('gov'), amount: g('amount') }));
      else if (what === 'construction') stories.push(story('constructionStarts', 75, { name, price: g('price'), opens: g('opens') }));
      else if (what === 'delay') stories.push(story('projectDelay', 65, { name, months: g('months') }));
      else if (what === 'sinkhole') stories.push(story('sinkhole', 90, { name }));
      else if (what === 'overrunAnswered' || what === 'overrunP3') stories.push(story('overrun', 70, { name, amount: g('amount'), choice: g('choice') || 'p3' }));
      else if (what === 'trouble') stories.push(story('lineTrouble', 85, { name }));
    }
  }
  // a rider's month: the most striking one, good or bad, not featured lately
  const featured = new Set((s.press ?? []).slice(-3).flatMap((f) => f.stories).filter((x) => x.kind === 'riderStory').map((x) => x.params.persona));
  const riders: { id: string; mood: number; kind: string }[] = [];
  for (const [id, entries] of Object.entries(s.diaries ?? {})) {
    const es = entries.filter((e) => e.date.startsWith(month));
    if (es.length < 3) continue;
    const mood = es.reduce((a, e) => a + e.mood, 0) / es.length;
    const counts = new Map<string, number>();
    for (const e of es) if (e.kind !== 'fine') counts.set(e.kind, (counts.get(e.kind) ?? 0) + (e.kind === 'great' ? 0.5 : 1));
    const kind = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (kind && (mood <= -0.4 || mood >= 0.8)) riders.push({ id, mood, kind });
  }
  const rider = riders.sort((a, b) => Number(featured.has(a.id)) - Number(featured.has(b.id)) || Math.abs(b.mood) - Math.abs(a.mood))[0];
  if (rider) stories.push(story('riderStory', 22 + 12 * Math.abs(rider.mood), { persona: rider.id, kind: rider.kind, mood: +rider.mood.toFixed(1) }));
  if (!stories.length) stories.push(story('quiet', 1, {}));
  // old news is less news: a kind (or a rider's story) on recent front pages counts for less
  const recent = (s.press ?? []).slice(-3).flatMap((f) => f.stories);
  for (const x of stories) {
    const again = recent.filter((r) => r.kind === x.kind && (x.kind !== 'riderStory' || r.params.persona === x.params.persona)).length;
    if (again && !['routeLaunched', 'routeCut', 'fareHike', 'levyHike', 'deficit', 'serviceCuts', 'strike', 'election', 'budgetRewritten', 'motionPassed',
      'lineOpen', 'sinkhole', 'overrun', 'projectShelved', 'constructionStarts', 'projectApproved']
      .includes(x.kind)) x.salience = Math.round(x.salience / (1 + again));
  }
  // the three most newsworthy, one per kind
  const seen = new Set<string>();
  const ranked = stories.sort((a, b) => b.salience - a.salience).filter((x) => (seen.has(x.kind) ? false : (seen.add(x.kind), true)));
  const top = ranked.filter((x, i) => i === 0 || x.salience >= 10).slice(0, 3);
  const approval = o ? opinionSummary(o, world, s.date).approval : 50;
  return { month, date: s.date, approval, stories: top };
}

// ------------------------------------------------------------------------------------------ the feed

const NAMES = ['Alex', 'Chantal', 'Daniel', 'Fatima', 'Geneviève', 'Hassan', 'Isabelle', 'Jordan', 'Karine', 'Liam', 'Mélanie', 'Nathan',
  'Olivia', 'Pierre', 'Rachel', 'Samir', 'Sophie', 'Tom', 'Valérie', 'Wei', 'Yasmine', 'Zoé', 'Mohamed', 'Emily', 'Luc', 'Ana'];

export interface FeedWorld extends OpinionWorld {
  /** named places (stations) for posts' bylines */
  places?: Place[];
}

function placeOf(world: FeedWorld, i: number): string {
  const z = world.zones[i]!;
  let best: Place | null = null;
  let bd = 2500;
  for (const p of world.places ?? []) {
    const d = Math.hypot((p.lon - z.lon) * 78_000, (p.lat - z.lat) * 111_000);
    if (d < bd) (bd = d), (best = p);
  }
  return best ? best.name : `district:${z.district}`;
}

/** A resident, picked by population (Ottawa), from a deterministic draw. */
function pickZone(world: FeedWorld, u: number, filter: (i: number) => boolean = () => true): number {
  const idx = world.zones.map((z, i) => i).filter((i) => world.zones[i]!.city === 'ottawa' && world.zones[i]!.pop > 0 && filter(i));
  const total = idx.reduce((a, i) => a + world.zones[i]!.pop, 0);
  let x = u * total;
  for (const i of idx) {
    x -= world.zones[i]!.pop;
    if (x <= 0) return i;
  }
  return idx.at(-1) ?? 0;
}

/** The day's posts (0–3): diaries, the weather, changes, and residents' opinions with their main reason. */
export function dayPosts(s: GameState, world: FeedWorld, date: string, diaries: DiaryEntry[]): Post[] {
  const out: Post[] = [];
  const r = (k: string) => rand(s.seed, `post:${date}:${k}`);
  const author = (k: string, i: number) => ({ name: NAMES[Math.floor(r(`${k}:n`) * NAMES.length)]!, place: placeOf(world, i) });
  const post = (kind: PostKind, tone: Tone, a: Post['author'], params: Post['params'] = {}) =>
    out.push({ id: `${date}:${out.length}`, date, kind, tone, author: a, params });
  // a persona with something to say
  const loud = diaries.filter((d) => Math.abs(d.mood) >= 2 || ['better', 'worse', 'noBus', 'highFloor', 'missed'].includes(d.kind));
  if (loud.length) {
    const d = loud[Math.floor(r('diary') * loud.length)]!;
    const n = d.out ?? d.back;
    post('diary', d.mood > 0 ? 'good' : 'bad', { persona: d.persona, name: d.persona, place: '' },
      { kind: d.kind, minutes: n?.minutes ?? 0, wait: n?.waitMin ?? 0, temp: n?.temp ?? 0, route: n?.routes[0] ?? '', late: n?.late ?? 0,
        stop: n?.stop ?? '', delta: s.routines?.[d.persona] ? (s.routines[d.persona]!.minutes - (s.routines[d.persona]!.prev ?? s.routines[d.persona]!.minutes)) : 0 });
  }
  // the weather
  const w = weatherOn(date, s.seed);
  if (w.snowCm >= 12 && r('storm') < 0.9) {
    const i = pickZone(world, r('stormz'), (j) => (s.los ?? world.baseLos).wait[j]! >= 6);
    post('storm', 'bad', author('storm', i), { cm: w.snowCm });
  } else if (w.low <= -24 && r('cold') < 0.7) {
    const i = pickZone(world, r('coldz'));
    post('cold', 'bad', author('cold', i), { temp: w.low });
  }
  // a resident and the reason they feel as they do
  const o = s.opinion;
  if (o && r('voice') < 0.45) {
    const i = pickZone(world, r('voicez'));
    const approval = toApproval(zoneScore(o, i));
    const reasons = explainZone(s, world, i).filter((x) => x.key !== 'mood' && x.key !== 'spillover');
    const tone: Tone = approval >= 55 ? 'good' : approval <= 45 ? 'bad' : r('mix') < 0.5 ? 'good' : 'bad';
    const pick = tone === 'good' ? reasons.sort((a, b) => b.value - a.value)[0] : reasons.sort((a, b) => a.value - b.value)[0];
    if (pick && Math.abs(pick.value) >= 1.5) {
      post(tone === 'good' ? 'praise' : 'gripe', tone, author('voice', i), { reason: pick.key, approval: Math.round(approval) });
    }
  }
  // on a service-change day, someone notices
  const shock = o?.shocks.find((k) => k.date === date && (k.kind === 'newRoute' || k.kind === 'routeRemoved'));
  if (shock) post('change', shock.kind === 'newRoute' ? 'good' : 'bad', author('change', pickZone(world, r('changez'))), { kind: shock.kind, route: shock.label ?? '' });
  const fare = o?.shocks.find((k) => k.date === date && (k.kind === 'fareHike' || k.kind === 'levyHike'));
  if (fare) post(fare.kind === 'fareHike' ? 'fares' : 'taxes', 'bad', author('fare', pickZone(world, r('farez'))), {});
  return out.slice(0, 3);
}

export function isFirstOfMonth(iso: string): boolean {
  return toDate(iso).getUTCDate() === 1;
}
