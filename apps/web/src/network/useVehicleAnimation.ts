import { useEffect } from 'react';
import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import type { Playback } from '@otc/sim';
import { DAYS_SPEED, type Clock } from '../sim/clock';
import { vehiclesNow, type ServiceDay } from '../sim/service';
import { NET_TRAILS, NET_VEHICLES } from '../map/style';
import { vehicleFeatures } from './geojson';

const EMPTY = { type: 'FeatureCollection' as const, features: [] };

/**
 * Advance the clock and stream vehicle positions into the map (≤30 fps; nothing while paused).
 * When days fly by, vehicles would only flicker: the map shows the network without them.
 */
export function useVehicleAnimation(map: MLMap | null, playback: Playback | null, clock: Clock, serviceDay: () => ServiceDay) {
  useEffect(() => {
    if (!map || !playback) return;
    if (window.__otc) window.__otc.vehicles = false;
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;
    let lastT = NaN;
    let dirty = true;
    let hidden = false;
    const markDirty = () => (dirty = true); // style reloads reset the vehicle sources
    map.on('styledata', markDirty);
    const unsub = clock.subscribe(markDirty);
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      clock.tick(dt);
      const t = clock.serviceTime();
      const fast = clock.speed() >= DAYS_SPEED;
      if ((dirty || (!fast && t !== lastT && now - lastDraw > 33) || fast !== hidden) && map.isStyleLoaded()) {
        const vSrc = map.getSource(NET_VEHICLES) as GeoJSONSource | undefined;
        const tSrc = map.getSource(NET_TRAILS) as GeoJSONSource | undefined;
        if (vSrc && tSrc) {
          if (fast) {
            vSrc.setData(EMPTY);
            tSrc.setData(EMPTY);
          } else {
            const { points, trails } = vehicleFeatures(playback, vehiclesNow(playback, t, serviceDay()));
            vSrc.setData(points);
            tSrc.setData(trails);
          }
          hidden = fast;
          lastDraw = now;
          lastT = t;
          dirty = false;
          if (window.__otc && !window.__otc.vehicles) map.once('idle', () => window.__otc && (window.__otc.vehicles = true));
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      map.off('styledata', markDirty);
      unsub();
    };
  }, [map, playback, clock, serviceDay]);
}
