import { describe, expect, it } from 'vitest';
import { createClock, DAY_END, DAY_START } from './clock';

describe('clock', () => {
  it('advances by speed and loops the service day', () => {
    const c = createClock(7 * 3600, 1);
    c.tick(2);
    expect(c.now()).toBe(7 * 3600 + 120);
    c.setSpeed(0);
    c.tick(10);
    expect(c.now()).toBe(7 * 3600 + 120);
    c.setTime(DAY_END - 10);
    c.setSpeed(3);
    c.tick(1);
    expect(c.now()).toBe(DAY_START);
  });
});
