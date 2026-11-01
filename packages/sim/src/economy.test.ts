import { describe, expect, it } from 'vitest';
import type { Edit, GameState } from '@otc/shared';
import {
  advanceDay, buildGarage, dayBoardings, dayFactor, fleetStatus, holidays, newGame, nextServiceChange, openDecision, orderBuses, projectYear,
  rampValue, resolve, routeDayBoardings, schedulePlan, serviceChangeDates, serviceDay, setPendingFigures, setService,
} from './economy';

const service = { boardings: 500_000, vehicleHours: 6900, peakVehicles: 700 };
/** Advance n days, answering decisions as a cautious player would (balanced budgets, borrow if short). */
const days = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) {
    for (let d = openDecision(s); d; d = openDecision(s)) {
      if (d.kind === 'budget') {
        const levyChange = 100 * (Number(d.data.balancing) / Number(d.data.last) - 1);
        s = resolve(s, d.id, { kind: 'budget', choice: { levyChange, fareChange: 0, maintenance: 1 } });
      } else if (d.kind === 'deficit') s = resolve(s, d.id, { kind: 'deficit', choice: 'borrow' });
      else s = resolve(s, d.id, { kind: 'shortfall', choice: 'accept' });
    }
    s = advanceDay(s);
  }
  return s;
};
const start = () => {
  const s = newGame(service);
  const b = openDecision(s)!;
  return resolve(s, b.id, { kind: 'budget', choice: { levyChange: 0, fareChange: 0, maintenance: 1 } });
};

describe('economy', () => {
  it('starts on 1 Dec 2010 with the 2011 budget to set, balanced', () => {
    const s = newGame(service);
    expect(s.date).toBe('2010-12-01');
    expect(openDecision(s)?.kind).toBe('budget');
    expect(Math.abs(projectYear(s, undefined, '2011-01-01').balance)).toBeLessThan(1);
    expect(fleetStatus(s).buses).toBe(1048);
  });

  it('waits for decisions, then runs the books month by month', () => {
    const s0 = newGame(service);
    expect(advanceDay(s0)).toBe(s0); // the budget decision blocks time
    const s = days(start(), 62);
    expect(s.date).toBe('2011-02-01');
    expect(s.ledger.map((r: GameState['ledger'][number]) => r.month)).toEqual(['2010-12', '2011-01']);
    expect(s.ledger[1]!.fares).toBeGreaterThan(10_000_000);
  });

  it('delivers the D60LFR order as replacements, so the fleet holds at 1,048', () => {
    const s = days(start(), 400);
    const f = fleetStatus(s);
    expect(f.buses).toBe(1048);
    expect(f.byType.artic60.count).toBeGreaterThan(300);
    expect(s.fleet.some((g: GameState['fleet'][number]) => g.model === 'Orion 05.501 (high floor)')).toBe(false);
  });

  it('puts a scheduled plan into operation on the next service-change date', () => {
    expect(serviceChangeDates(2011)).toEqual(['2011-04-24', '2011-06-26', '2011-09-04', '2011-12-18']);
    expect(nextServiceChange('2010-12-01')).toBe('2010-12-19');
    const edit: Edit = { kind: 'remove', routeId: 'oct-1' };
    let s = schedulePlan(start(), [edit]);
    s = days(s, 17);
    expect(s.applied).toHaveLength(0);
    s = days(s, 2);
    expect(s.applied).toEqual([edit]);
    expect(s.events.some((e) => e.kind === 'serviceChange')).toBe(true);
    expect(s.changes).toEqual([{ date: '2010-12-19', label: '−1' }]);
  });

  it('raises a deficit decision when the reserve runs out, and borrowing covers it', () => {
    let s = start();
    s = { ...s, levy: s.levy * 0.6 };
    for (let i = 0; i < 300 && !openDecision(s); i++) s = advanceDay(s);
    const d = openDecision(s)!;
    expect(d.kind).toBe('deficit');
    const after = resolve(s, d.id, { kind: 'deficit', choice: 'borrow' });
    expect(after.reserve).toBeGreaterThan(0);
    expect(after.debt).toBeGreaterThan(s.debt);
  });

  it('orders buses (paid on delivery) and holds deliveries when the garages are full', () => {
    let s = orderBuses(start(), 'artic60', 100);
    s = days(s, 366);
    const f = fleetStatus(s);
    expect(f.buses).toBe(1048); // 1,048 + 100 > 1,130 garage places: held at the factory
    expect(s.events.some((e) => e.kind === 'delivery' && e.data.held)).toBe(true);
    s = buildGarage(s);
    expect(s.debt).toBeGreaterThan(0);
    s = days(s, 31 * 31);
    expect(fleetStatus(s).buses).toBeGreaterThan(1048);
  });

  it('records riders day by day, quieter at weekends', () => {
    const s = days(start(), 14);
    expect(s.daily).toHaveLength(14);
    const byDow = new Map(s.daily!.map((r) => [new Date(`${r.date}T12:00:00Z`).getUTCDay(), r.boardings]));
    expect(byDow.get(0)!).toBeLessThan(0.5 * byDow.get(3)!); // Sunday vs Wednesday
    expect(dayBoardings(s, undefined, '2011-01-05')).toBeGreaterThan(dayBoardings(s, undefined, '2011-01-08'));
  });

  it('moves riders to a new level gradually after a service change, faster when service is cut', () => {
    let s = start();
    s = { ...s, changes: [{ date: s.date, label: '+N1' }] };
    s = setService(s, { ...s.service, boardings: s.service.boardings * 1.1 }, { 'plan-1': 2000 }, {});
    const r = s.ramp!;
    expect(rampValue(r, s.date, 0)).toBeCloseTo(r.from, 0);
    const after3w = rampValue(r, '2010-12-22', 0);
    expect((after3w - r.from) / (r.to - r.from)).toBeCloseTo(1 - Math.exp(-1), 2); // one time constant (21 days)
    s = days(s, 30);
    const n1 = s.daily!.filter((d) => new Date(`${d.date}T12:00:00Z`).getUTCDay() === 3).map((d) => d.routes!['plan-1']!);
    expect(n1[n1.length - 1]!).toBeGreaterThan(n1[0]!); // the new route builds riders week by week
    expect(s.changes).toEqual([{ date: '2010-12-01', label: '+N1' }]);
    const cut = setService(s, { ...s.service, boardings: s.service.boardings * 0.9 });
    expect((rampValue(cut.ramp!, addWeek(cut.date), 0) - cut.ramp!.from) / (cut.ramp!.to - cut.ramp!.from)).toBeGreaterThan(0.6);
  });

  it('knows Ontario holidays and the Christmas break', () => {
    expect(holidays(2011)).toEqual(['2011-01-01', '2011-02-21', '2011-04-22', '2011-05-23', '2011-07-01', '2011-08-01', '2011-09-05',
      '2011-10-10', '2011-12-25', '2011-12-26']);
    expect(serviceDay('2011-04-22')).toBe('sunday'); // Good Friday
    expect(serviceDay('2011-04-23')).toBe('saturday');
    expect(serviceDay('2011-04-26')).toBe('weekday');
    expect(dayFactor('2010-12-29')).toBeLessThan(dayFactor('2010-12-15'));
  });

  it('applies a plan measured when scheduled on the service-change date', () => {
    let s = start();
    const plan: Edit[] = [{ kind: 'remove', routeId: 'oct-118' }];
    s = schedulePlan(s, plan);
    s = setPendingFigures(s, { key: JSON.stringify(plan), service: { ...s.service, boardings: s.service.boardings * 0.99 },
      routes: { 'oct-118': 0, 'oct-95': 41_000 }, routesBefore: { 'oct-118': 6000, 'oct-95': 40_000 } });
    expect(setPendingFigures(s, { ...s.pendingFigures!, key: '[]' }).pendingFigures?.key).toBe(JSON.stringify(plan));
    const change = nextServiceChange(s.date); // 19 Dec 2010
    while (s.date < change) s = days(s, 1);
    expect(s.applied).toEqual(plan);
    expect(s.pendingFigures).toBeUndefined();
    expect(s.serviceFor).toBe(1);
    expect(s.ramp).toMatchObject({ start: change, to: s.service.boardings });
    expect(routeDayBoardings(s, 'oct-118')).toBe(0);
    expect(routeDayBoardings(s, 'oct-95')).toBeGreaterThan(0);
    s = days(s, 1);
    expect(s.daily!.at(-1)!.routes).toMatchObject({ 'oct-118': 0 });
  });
});

function addWeek(iso: string): string {
  return new Date(new Date(`${iso}T12:00:00Z`).getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
}
