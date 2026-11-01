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
});
