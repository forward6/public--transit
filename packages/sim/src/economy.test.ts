import { describe, expect, it } from 'vitest';
import type { Edit, GameState } from '@otc/shared';
import {
  advanceDay, buildGarage, fleetStatus, newGame, nextServiceChange, openDecision, orderBuses, projectYear, resolve, schedulePlan,
  serviceChangeDates,
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
});
