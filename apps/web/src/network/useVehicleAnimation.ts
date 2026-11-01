import { useEffect } from 'react';
import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import type { Playback } from '@otc/sim';
import type { Clock } from '../sim/clock';
import { NET_TRAILS, NET_VEHICLES } from '../map/style';
import { vehicleFeatures } from './geojson';

/** Advance the clock and stream vehicle positions into the map (≤30 fps; nothing while paused). */
export function useVehicleAnimation(map: MLMap | null, playback: Playback | null, clock: Clock) {
  useEffect(() => {
    if (!map || !playback) return;
    if (window.__otc) window.__otc.vehicles = false;
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;
    let lastT = NaN;
    let dirty = true;
    const markDirty = () => (dirty = true); // style reloads reset the vehicle sources
    map.on('styledata', markDirty);
    const unsub = clock.subscribe(markDirty);
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      clock.tick(dt);
      const t = clock.now();
      if ((dirty || (t !== lastT && now - lastDraw > 33)) && map.isStyleLoaded()) {
        const vSrc = map.getSource(NET_VEHICLES) as GeoJSONSource | undefined;
        const tSrc = map.getSource(NET_TRAILS) as GeoJSONSource | undefined;
        if (vSrc && tSrc) {
          const { points, trails } = vehicleFeatures(playback, playback.vehiclesAt(t));
          vSrc.setData(points);
          tSrc.setData(trails);
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
  }, [map, playback, clock]);
}
