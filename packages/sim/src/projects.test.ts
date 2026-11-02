import { describe, expect, it } from 'vitest';
import type { GameState, LineDesign, Network, Zone } from '@otc/shared';
import { addDays, newGame, openDecision } from './economy';
import { callVote, openItem, proposeBudget, tally, type CouncilWorld } from './council';
import { applyEdits } from './plan';
import {
  annotateDesign, answerOverrun, askAgain, busRework, chooseProcurement, cityShare, estimateLine, lineEdit, newDesign, openingDay, projectOf, proposeProject, stationAt,
  stationStructure,
} from './projects';
import { stepDay, withOpinion, type GameWorld } from './game';

const zone = (id: number, pop: number, jobs: number, lon: number, lat: number): Zone => ({
  id, cell: `c${id}`, lon, lat, areaKm2: 1, city: 'ottawa', district: 'suburbs', downtown: false, pop, seg: {} as Zone['seg'], jobs: { office: jobs }, enrol: { post: 0, school: 0 },
});
const zones = [zone(0, 2000, 60000, -75.70, 45.42), zone(1, 40000, 5000, -75.62, 45.43), zone(2, 30000, 3000, -75.74, 45.40), zone(3, 20000, 2000, -75.75, 45.27)];
const world: GameWorld & CouncilWorld = { zones, baseLos: { access: [300000, 90000, 90000, 50000], wait: [3, 6, 6, 10] }, share: [0.3, 0.15, 0.15, 0.1], wardOf: [14, 11, 15, 3] };
const fresh = () => withOpinion(newGame({ boardings: 500_000, vehicleHours: 6900, peakVehicles: 814 }), world);
/** Answer the first budget and let the days pass, answering what comes up the simple way. */
const run = (s0: GameState, days: number, how: 'public' | 'p3' = 'public') => {
  let s = s0;
  for (let i = 0; i < days; i++) {
    for (let d = openDecision(s), g = 0; d && g < 10; d = openDecision(s), g++) {
      if (d.kind === 'budget') s = proposeBudget(s, d.id, { levyChange: 2.5 + Number(d.data.committed ?? 0), fareChange: 0, maintenance: 1 });
      else if (d.kind === 'vote') s = callVote(s, world, openItem(s)!.id);
      else if (d.kind === 'procurement') s = chooseProcurement(s, String(d.data.project), how);
      else if (d.kind === 'overrun') s = answerOverrun(s, String(d.data.project), 'pay');
      else if (d.kind === 'lineOpen') s = openingDay(s, d.id, true);
      else s = { ...s, events: s.events.map((e) => (e.id === d.id ? { ...e, decision: false } : e)) };
    }
    s = stepDay(s, world);
  }
  return s;
};

const stops: Network['stops'] = [
  { id: 'tunneys', name: "Tunney's Pasture", lon: -75.735181, lat: 45.403725, kind: 'station', agencies: ['octranspo'] },
  { id: 'blair', name: 'Blair', lon: -75.60828, lat: 45.431056, kind: 'station', agencies: ['octranspo'] },
  { id: 'bank-somerset', name: 'Bank / Somerset', lon: -75.6975, lat: 45.4165, kind: 'stop', agencies: ['octranspo'] },
];
/** A Confederation-like line: 12 km, a 3 km tunnel downtown. */
function confederation(): LineDesign {
  const pts: [number, number, 'surface' | 'tunnel'][] = [
    [-75.735181, 45.403725, 'surface'], [-75.721943, 45.409442, 'surface'], [-75.713435, 45.413737, 'tunnel'], [-75.7045, 45.4195, 'tunnel'],
    [-75.6964, 45.4216, 'tunnel'], [-75.6897, 45.424, 'tunnel'], [-75.682238, 45.420249, 'surface'], [-75.670482, 45.416345, 'surface'],
    [-75.664827, 45.411876, 'surface'], [-75.652216, 45.41743, 'surface'], [-75.637918, 45.420638, 'surface'], [-75.626579, 45.422545, 'surface'],
    [-75.60828, 45.431056, 'surface'],
  ];
  const d = newDesign('lrt', 1);
  d.stations = pts.map(([lon, lat], i) => stationAt(lon, lat, stops, `line-1-s${i}`));
  d.structure = pts.slice(0, -1).map((p) => p[2]);
  return d;
}

describe('big projects', () => {
  it('costs a Confederation-like line near its $2.1B budget, and a busway at Transitway prices', () => {
    const d = confederation();
    expect(d.stations[0]!.id).toBe('tunneys'); // reuses the Transitway station
    expect(d.stations[0]!.existing).toBe(true);
    const e = estimateLine(d);
    expect(e.lengthKm).toBeGreaterThan(11);
    expect(e.lengthKm).toBeLessThan(14);
    expect(e.cost.total).toBeGreaterThan(1.9e9);
    expect(e.cost.total).toBeLessThan(2.5e9);
    expect(e.undergroundStations).toBe(3); // portal stations are at grade
    expect(stationStructure(d, 2)).toBe('surface');
    // compressed timelines (your choice): proposed in early 2011, it opens before the October 2014 election
    const months = e.months.design + e.months.procurement + e.months.construction + e.months.testing;
    expect(months).toBeLessThanOrEqual(44);
    expect(e.months.construction).toBeGreaterThan(20);
    expect(e.runMin).toBeGreaterThan(15);
    expect(e.runMin).toBeLessThan(30);
    const b = newDesign('busway', 2);
    b.stations = [stationAt(-75.745, 45.271, [], 'b0'), stationAt(-75.736, 45.299, [], 'b1'), stationAt(-75.76, 45.3475, [], 'b2')];
    b.structure = ['surface', 'surface'];
    const be = estimateLine(b);
    expect(be.cost.total / be.lengthKm).toBeGreaterThan(25e6);
    expect(be.cost.total / be.lengthKm).toBeLessThan(55e6);
    expect(be.vehicles).toBe(0);
  });

  it('puts the line on the map and into the network: a rail route, its stations and right of way', () => {
    const d = confederation();
    const edit = lineEdit(d, 'line-1');
    expect(edit.kind).toBe('add');
    if (edit.kind !== 'add') return;
    expect(edit.route.mode).toBe('rail');
    expect(edit.patterns).toHaveLength(2);
    expect(edit.corridor?.kind).toBe('rail');
    const net: Network = { status: 'gtfs', corridors: [], routes: [], patterns: [], stops } as unknown as Network;
    const after = applyEdits(net, [edit]);
    expect(after.corridors).toHaveLength(1);
    expect(after.stops.length).toBe(stops.length + d.stations.filter((x) => !x.existing).length);
  });

  it('goes from proposal to opening day: votes, funding, procurement, construction on borrowed money', () => {
    let s = run(fresh(), 1);
    const b = newDesign('busway', 1);
    b.stations = [stationAt(-75.745, 45.271, [], 'line-1-s0'), stationAt(-75.736, 45.299, [], 'line-1-s1'), stationAt(-75.76, 45.3475, [], 'line-1-s2')];
    b.structure = ['surface', 'surface'];
    s = proposeProject(s, b, { boardings: 20000, newRiders: 3000, reach: 1, wards: [3] });
    expect(projectOf(s, 'line-1')!.phase).toBe('proposed');
    expect(openItem(s)?.kind).toBe('project');
    s = run(s, 365 * 2);
    const p = projectOf(s, 'line-1')!;
    // with the levy keeping up, it opens (or council shelved it: then nothing was built)
    if (p.phase === 'shelved') return;
    expect(p.phase).toBe('open');
    expect(p.opened! > '2011-06-01').toBe(true);
    expect(s.applied.some((e) => e.kind === 'add' && e.route.id === 'line-1')).toBe(true);
    expect(p.spent).toBeGreaterThan(p.estimate.cost.total * 0.9);
    expect(p.citySpent).toBeGreaterThan(0); // a small line can come out of the capital reserve without borrowing
    expect(p.funding.provinceStatus).not.toBe('none');
    expect(p.dates.construction && p.dates.construction > p.dates.design!).toBe(true);
    // the front page the month after it opened (the last two years of papers are kept)
    if (p.opened! < addDays(s.date, -40) && p.opened! > addDays(s.date, -700)) expect(s.press?.some((f) => f.stories.some((x) => x.kind === 'lineOpen'))).toBe(true);
  }, 60_000);

  it('weighs the bill: council likes a line its partners pay for better than one the city pays alone', () => {
    let s = run(fresh(), 1);
    s = proposeProject(s, confederation(), { boardings: 120000, newRiders: 15000, reach: 4, wards: [14] });
    const item = openItem(s)!;
    const funded = tally(s, world, item).yes;
    const alone = tally(s, world, { ...item, effects: { ...item.effects, project: { city: 2000, riders: 15000 } } }).yes;
    expect(funded).toBeGreaterThan(alone);
    // a government that said no can be asked again (Political Capital, once a year)
    const p = projectOf(s, 'line-1')!;
    p.funding.federalStatus = 'declined';
    p.phase = 'design';
    const before = s.council!.capital;
    const asked = askAgain(s, 'line-1', 'federal');
    expect(asked.council!.capital).toBe(before - 10);
    expect(askAgain(asked, 'line-1', 'federal')).toBe(asked);
    expect(cityShare(p, 2e9)).toBeCloseTo(2e9 * 0.75, -6);
  });

  it('offers to rework buses that run alongside the line', () => {
    const d = confederation();
    const along = d.stations.map((x, i) => ({ id: `p${i}`, name: `P${i}`, lon: x.lon + 0.0005, lat: x.lat, kind: 'stop' as const, agencies: ['octranspo' as const] }));
    const net = {
      status: 'gtfs', corridors: [], stops: [...stops, ...along],
      routes: [{ id: 'oct-95', agency: 'octranspo', shortName: '95', longName: '95', mode: 'brt', class: 'transitway', color: '#d00', patterns: ['p95'],
        weekday: [{ from: '06:30', to: '24:00', headwayMin: 5 }], provenance: { source: 'x', confidence: 'high', verified: false } }],
      patterns: [{ id: 'p95', routeId: 'oct-95', direction: 0, headsign: 'Blair', stops: along.map((x) => x.id), stopDist: along.map((_, i) => i * 1000),
        shape: along.map((x) => [x.lon, x.lat]), runTimes: along.slice(1).map(() => 120), dwell: along.map(() => 20) }],
    } as unknown as Network;
    const rw = busRework(net, d, 'line-1');
    expect(rw?.routes[0]).toMatchObject({ id: 'oct-95', action: 'retire' });
  });

  it('runs commuter rail on existing railways for the price of upgrading them', () => {
    const rail: [number, number][][] = [[[-75.90, 45.30], [-75.70, 45.35], [-75.60, 45.40]]];
    const d = newDesign('commuter', 3);
    d.stations = [stationAt(-75.90, 45.30, [], 'c0'), stationAt(-75.80, 45.325, [], 'c1'), stationAt(-75.70, 45.35, [], 'c2')];
    d.structure = ['surface', 'surface'];
    const onTrack = estimateLine(annotateDesign(d, { rail }));
    const offTrack = estimateLine(annotateDesign({ ...d, stations: d.stations.map((x) => ({ ...x, lat: x.lat + 0.03 })) }, { rail }));
    expect(onTrack.railKm).toBeGreaterThan(onTrack.lengthKm * 0.9);
    expect(offTrack.railKm).toBe(0);
    expect(onTrack.cost.guideway).toBeLessThan(offTrack.cost.guideway / 3);
    expect(onTrack.vehicles).toBeGreaterThan(0);
    expect(lineEdit(d, 'line-3')).toMatchObject({ route: { class: 'commuter', mode: 'rail' } });
  });

  it('runs a streetcar along the street: in traffic at about bus speed, faster in its own lane', () => {
    // 4 km, a stop every 400 m, along a street with a jog in it
    const stops = Array.from({ length: 11 }, (_, i) => stationAt(-75.70 + i * 0.0051, 45.40, [], `s${i}`));
    const d = newDesign('streetcar', 2);
    d.stations = stops;
    d.structure = stops.slice(1).map(() => 'street' as const);
    d.paths = stops.slice(1).map((b, i) => [[stops[i]!.lon, stops[i]!.lat], [stops[i]!.lon + 0.0025, stops[i]!.lat + 0.0004], [b.lon, b.lat]] as [number, number][]);
    const mixed = estimateLine(d);
    const lane = estimateLine({ ...d, structure: d.structure.map(() => 'surface' as const) });
    const kmh = (e: typeof mixed) => (e.lengthKm / e.runMin) * 60;
    expect(mixed.lengthKm).toBeGreaterThan(4); // along its path, not straight
    expect(kmh(mixed)).toBeGreaterThan(11);
    expect(kmh(mixed)).toBeLessThan(17);
    expect(kmh(lane)).toBeGreaterThan(kmh(mixed) + 3);
    // about $30–45M a km all in, far less than light rail; cars, a small yard
    expect(mixed.cost.total / mixed.lengthKm / 1e6).toBeGreaterThan(25);
    expect(mixed.cost.total / mixed.lengthKm / 1e6).toBeLessThan(50);
    expect(lane.cost.total).toBeGreaterThan(mixed.cost.total);
    expect(mixed.vehicles).toBeGreaterThan(3);
    const e = lineEdit(d, 'line-2');
    expect(e).toMatchObject({ route: { class: 'streetcar', mode: 'rail', shortName: 'S2' } });
    if (e.kind === 'add') expect(e.patterns[0]!.shape.length).toBeGreaterThan(stops.length); // it follows the street
  });

  it('knows a line crossing the Ottawa River: a bridge or a tunnel, and Quebec at the table', () => {
    const z = (id: number, city: 'ottawa' | 'gatineau', lon: number, lat: number) => ({ ...zone(id, 1000, 1000, lon, lat), city });
    const both = [z(0, 'ottawa', -75.70, 45.42), z(1, 'gatineau', -75.72, 45.44)];
    const d = newDesign('lrt', 1);
    d.stations = [stationAt(-75.70, 45.42, [], 'x0'), stationAt(-75.72, 45.44, [], 'x1')];
    d.structure = ['surface'];
    const a = annotateDesign(d, { zones: both });
    expect(a.crosses).toEqual([true]);
    expect(a.structure).toEqual(['bridge']);
    const e = estimateLine(a);
    expect(e.crossing).toBe(true);
    expect(e.bridgeKm).toBeGreaterThan(2);
    // a stretch on one side can't be a bridge
    expect(annotateDesign({ ...d, structure: ['bridge'], stations: [d.stations[0]!, { ...d.stations[0]!, id: 'x2', lon: -75.69 }] }, { zones: both }).structure).toEqual(['surface']);
  });
});
