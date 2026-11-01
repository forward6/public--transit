/**
 * The 2011 base-year demand run: skims, calibration, assignment.
 *
 *   pnpm --filter @otc/sim demand
 *
 * Reads apps/web/public/data/{network-2010.json, zones-2011.json, car-2011.bin} and
 * pipeline/curation/demand2011/targets.json; writes apps/web/public/data/demand-2011.json and
 * data/reports/demand-2011.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { DemandFile, Network, TravelMode, ZonesFile } from '@otc/shared';
import { MODES } from '@otc/shared';
import { DEFAULT_PARAMS, assign, calibrate, calibrationRow, transitSkims, withTripRate } from '../src/demand';

const root = new URL('../../../', import.meta.url);
const data = new URL('apps/web/public/data/', root);
const read = (f: string) => readFileSync(new URL(f, data));
const network = JSON.parse(read('network-2010.json').toString()) as Network;
const zf = JSON.parse(read('zones-2011.json').toString()) as ZonesFile;
const car = new Uint8Array(read('car-2011.bin'));
const targets = JSON.parse(readFileSync(new URL('pipeline/curation/demand2011/targets.json', root), 'utf8'));
const cal = targets.calibration;
const zones = zf.zones;
const log = (s: string) => console.log(s);
const time = <T,>(label: string, f: () => T): T => {
  const t = performance.now();
  const r = f();
  log(`  ${label}: ${((performance.now() - t) / 1000).toFixed(1)} s`);
  return r;
};

log(`== demand: ${zones.length} zones, ${network.routes.length} routes`);
const skims = time('transit skims (RAPTOR, 2 periods x 4 departures)', () => transitSkims(network, zones));
const reach = skims.peak.ivt.reduce((a, v) => a + (v === v ? 1 : 0), 0) / (zones.length * zones.length);
log(`  transit reaches ${(100 * reach).toFixed(0)}% of zone pairs at the peak`);
const shareTargets = { transit: cal.transit_share_all_trips.value, walk: cal.walk_share_all_trips.value,
  bike: cal.bike_share_all_trips.value, passenger: cal.passenger_share_all_trips.value };
const base = withTripRate(zones, targets.trips_per_resident.value, DEFAULT_PARAMS);
const { params, result } = time('calibration', () => calibrate({ zones, car, skims }, shareTargets, base, 20, log));
const asg = time('assignment', () => assign(network, zones, result.transit, params));

const agencyOf = new Map(network.routes.map((r) => [r.id, r.agency]));
const byAgency: Record<string, number> = {};
for (const [rid, b] of asg.boardingsByRoute) byAgency[agencyOf.get(rid) ?? '?'] = (byAgency[agencyOf.get(rid) ?? '?'] ?? 0) + b;
const trips = MODES.reduce((a, m) => a + result.byMode[m], 0);
const share = (m: TravelMode) => result.byMode[m] / trips;
const residents = zones.reduce((a, z) => a + z.pop, 0);
const rows = [
  calibrationRow('transit_share', 'Transit share of all weekday trips', cal.transit_share_all_trips.value,
    cal.transit_share_all_trips.tolerance, share('transit'), false, !!cal.transit_share_all_trips.estimate, cal.transit_share_all_trips.source),
  calibrationRow('walk_share', 'Walk share', cal.walk_share_all_trips.value, cal.walk_share_all_trips.tolerance, share('walk'), false, true,
    cal.walk_share_all_trips.source),
  calibrationRow('bike_share', 'Bike share', cal.bike_share_all_trips.value, cal.bike_share_all_trips.tolerance, share('bike'), false, true,
    cal.bike_share_all_trips.source),
  calibrationRow('passenger_share', 'Car passenger share', cal.passenger_share_all_trips.value, cal.passenger_share_all_trips.tolerance,
    share('passenger'), false, true, cal.passenger_share_all_trips.source),
  calibrationRow('octranspo_boardings', 'OC Transpo weekday boardings', cal.octranspo_weekday_boardings.value,
    cal.octranspo_weekday_boardings.tolerance, byAgency.octranspo ?? 0, true, !!cal.octranspo_weekday_boardings.estimate,
    cal.octranspo_weekday_boardings.source),
  calibrationRow('sto_boardings', 'STO weekday boardings', cal.sto_weekday_boardings.value, cal.sto_weekday_boardings.tolerance,
    byAgency.sto ?? 0, true, true, cal.sto_weekday_boardings.source),
  calibrationRow('trips_per_resident', 'Weekday trips per resident', targets.trips_per_resident.value, 0.1, trips / residents, true, true,
    targets.trips_per_resident.source),
];
const round = (x: number) => Math.round(x);
const out: DemandFile = {
  version: 1, year: 2011, generated: new Date().toISOString().slice(0, 19) + 'Z',
  note: 'Weekday demand v1 (M3): trip generation, destination and mode choice calibrated to regional mode shares; ' +
    'all-or-nothing transit assignment on RAPTOR journeys. Inputs are partly estimated; see the calibration table.',
  summary: {
    residents: round(residents), trips: round(trips),
    tripsByMode: Object.fromEntries(MODES.map((m) => [m, round(result.byMode[m])])) as Record<TravelMode, number>,
    transitTrips: round(result.byMode.transit), boardings: round(asg.totals.boardings),
    boardingsByAgency: Object.fromEntries(Object.entries(byAgency).map(([k, v]) => [k, round(v)])),
    transitTrip: {
      ivtMin: +(asg.totals.ivtMin / asg.totals.trips).toFixed(1), waitMin: +(asg.totals.waitMin / asg.totals.trips).toFixed(1),
      walkMin: +(asg.totals.walkMin / asg.totals.trips).toFixed(1), boardingsPerTrip: +(asg.totals.boardings / asg.totals.trips).toFixed(2),
    },
  },
  calibration: rows,
  routes: Object.fromEntries([...asg.boardingsByRoute].map(([k, v]) => [k, round(v)])),
  stops: Object.fromEntries([...asg.boardingsByStop].filter(([, v]) => v >= 1).map(([k, v]) => [k, round(v)])),
  loads: Object.fromEntries([...asg.loads].map(([k, v]) => [k, Array.from(v, round)])),
  zones: Object.fromEntries(zones.map((z, i) => [String(z.id), [round(result.zoneTrips[i]!),
    result.zoneTrips[i]! > 0 ? +(result.zoneTransit[i]! / result.zoneTrips[i]!).toFixed(3) : 0]])),
  districts: Object.fromEntries(Object.entries(result.district).map(([d, [t, tr]]) => [d, [round(t), +(tr / t).toFixed(3)]])),
};
writeFileSync(new URL('demand-2011.json', data), JSON.stringify(out));

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const num = (x: number) => (x >= 100 ? Math.round(x).toLocaleString('en') : x.toFixed(2));
const fmt = (r: (typeof rows)[number]) => (r.relative ? num(r.model) : pct(r.model));
const tgt = (r: (typeof rows)[number]) => (r.relative ? `${num(r.target)} ± ${pct(r.tolerance)}` : `${pct(r.target)} ± ${(100 * r.tolerance).toFixed(1)} pts`);
const md = [
  '# 2011 base-year calibration report', '',
  `Generated ${out.generated} by \`pnpm --filter @otc/sim demand\`. ${zones.length} zones, ${round(residents).toLocaleString('en')} residents, ` +
  `${round(trips).toLocaleString('en')} weekday trips.`, '',
  '| Measure | Target | Model | | Source |', '|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.label} | ${tgt(r)} | ${fmt(r)} | ${r.pass ? '✅' : '❌'}${r.estimate ? ' (target estimated)' : ''} | ${r.source} |`),
  '', '## Transit share by home district', '', '| District | Trips | Transit |', '|---|---|---|',
  ...Object.entries(result.district).sort((a, b) => b[1][1] / b[1][0] - a[1][1] / a[1][0])
    .map(([d, [t, tr]]) => `| ${d} | ${round(t).toLocaleString('en')} | ${pct(tr / t)} |`),
  '', '## Average car-driver trip (minutes)', '', ...Object.entries(result.avgCarMin).filter(([, v]) => v > 0).map(([p, v]) => `- ${p}: ${v.toFixed(1)}`),
  '', '## Average transit trip', '',
  `${out.summary.transitTrip.ivtMin} min in vehicle, ${out.summary.transitTrip.waitMin} waiting, ${out.summary.transitTrip.walkMin} walking; ` +
  `${out.summary.transitTrip.boardingsPerTrip} boardings per trip.`, '',
  '## Calibrated constants', '', '```json', JSON.stringify(params.asc, null, 1), '```', '',
];
mkdirSync(new URL('data/reports/', root), { recursive: true });
writeFileSync(new URL('data/reports/demand-2011.md', root), md.join('\n'));
log(md.slice(4, 6 + rows.length + 2 + 3 + Object.keys(result.district).length).join('\n'));
log(`  -> demand-2011.json, data/reports/demand-2011.md`);
