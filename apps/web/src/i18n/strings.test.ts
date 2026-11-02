import { describe, expect, it } from 'vitest';
import { STRINGS } from './strings';

describe('strings', () => {
  it('has a label for every speed, in both languages', () => {
    expect(STRINGS.en.speed).toHaveLength(6);
    expect(STRINGS.fr.speed).toHaveLength(6);
  });

  it('is translated: French text differs from English', () => {
    const en = STRINGS.en as unknown as Record<string, unknown>;
    const fr = STRINGS.fr as unknown as Record<string, unknown>;
    // identical in both languages on purpose (names, symbols, numbers)
    const same = new Set(['appShort', 'apply', 'station', 'directions', 'legendTransitway', 'legendOTrain', 'legendStation', 'linePara',
      'newRouteService', 'yourPlan']);
    const untranslated = Object.keys(en).filter((k) => !same.has(k) && typeof en[k] === 'string' && en[k] === fr[k] && /[a-z]{4}/i.test(en[k] as string));
    expect(untranslated).toEqual([]);
    expect(fr.speed).not.toEqual(en.speed);
    expect(STRINGS.fr.ridersYesterday(412_000)).toContain('hier');
  });

  it('translates the opinion and press text', () => {
    const en = STRINGS.en.op as unknown as Record<string, unknown>;
    const fr = STRINGS.fr.op as unknown as Record<string, unknown>;
    const same = new Set(['toggle']);
    const untranslated = Object.keys(en).filter((k) => !same.has(k) && typeof en[k] === 'string' && en[k] === fr[k]);
    expect(untranslated).toEqual([]);
    for (const k of Object.keys(STRINGS.en.op.story) as (keyof typeof STRINGS.en.op.story)[]) {
      const p = { pct: 3.2, pts: 2.1, approval: 51.5, route: 'N1', cm: 22, low: -28, count: 15, name: 'Merivale', kind: 'cold', persona: 'marc' };
      expect(STRINGS.fr.op.story[k](p).head).not.toEqual(STRINGS.en.op.story[k](p).head);
    }
    for (const k of Object.keys(STRINGS.en.op.reason) as (keyof typeof STRINGS.en.op.reason)[]) {
      expect(STRINGS.fr.op.reasonHelp[k]).toBeTruthy();
      expect(STRINGS.en.op.reasonHelp[k]).toBeTruthy();
    }
  });

  it('translates the council text', () => {
    const en = STRINGS.en.co as unknown as Record<string, unknown>;
    const fr = STRINGS.fr.co as unknown as Record<string, unknown>;
    const same = new Set(['stoSection', 'votes', 'commissionTag']);
    expect(Object.keys(en).filter((k) => !same.has(k) && typeof en[k] === 'string' && en[k] === fr[k])).toEqual([]);
    for (const k of Object.keys(STRINGS.en.co.news) as (keyof typeof STRINGS.en.co.news)[]) {
      const d = { kind: 'budget', passed: 1, yes: 13, no: 11, byChair: 1, levyChange: 1.5, mover: 'X', route: '86', choice: 'restore', wage: 2.8, years: 3,
        strikeVote: 0, from: '2011-03-31', agenda: 'taxFreeze', clawedBack: 0, approved: 1, name: 'Y', out: 'A', in: 'B', protest: 0 };
      expect(STRINGS.fr.co.news[k]!(d, 'fr')).not.toEqual(STRINGS.en.co.news[k]!(d, 'en'));
    }
    expect(Object.keys(STRINGS.fr.co.reason)).toEqual(Object.keys(STRINGS.en.co.reason));
  });

  it('translates the start screen', () => {
    const en = STRINGS.en.st as unknown as Record<string, unknown>;
    const fr = STRINGS.fr.st as unknown as Record<string, unknown>;
    expect(Object.keys(en).filter((k) => k !== 'menu' && typeof en[k] === 'string' && en[k] === fr[k])).toEqual([]);
    expect(STRINGS.fr.st.tips).toHaveLength(STRINGS.en.st.tips.length);
    expect(STRINGS.fr.st.confirmBody('1 mars 2011')).toContain('1 mars 2011');
  });

  it('translates riders on board', () => {
    const en = STRINGS.en.ld.ob;
    const fr = STRINGS.fr.ld.ob;
    for (const k of Object.keys(en.crowd) as (keyof typeof en.crowd)[]) expect(fr.crowd[k]).not.toEqual(en.crowd[k]);
    expect(fr.note(38, 65)).not.toEqual(en.note(38, 65));
  });

  it('translates the Operations panel', () => {
    const en = STRINGS.en.ops as unknown as Record<string, unknown>;
    const fr = STRINGS.fr.ops as unknown as Record<string, unknown>;
    const same = new Set(['trainsTitle', 'oTrain']);
    expect(Object.keys(en).filter((k) => !same.has(k) && typeof en[k] === 'string' && en[k] === fr[k])).toEqual([]);
    expect(STRINGS.fr.ops.missed('0,4 %', '37')).not.toEqual(STRINGS.en.ops.missed('0.4%', '37'));
  });
});
