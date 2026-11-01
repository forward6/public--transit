import { describe, expect, it } from 'vitest';
import { layoutFor } from './useLayout';

describe('layoutFor', () => {
  it('maps widths to the three layouts', () => {
    expect(layoutFor(393)).toBe('phone');
    expect(layoutFor(834)).toBe('tablet');
    expect(layoutFor(1194)).toBe('tablet');
    expect(layoutFor(1920)).toBe('desktop');
  });
});
