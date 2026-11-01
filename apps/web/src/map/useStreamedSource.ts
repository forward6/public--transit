import { useEffect } from 'react';
import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl';

type Data = Parameters<GeoJSONSource['setData']>[0];

/** Keep a GeoJSON source's data in step without rebuilding the style (re-applied after style changes). */
export function useStreamedSource(map: MLMap | null, id: string, data: Data | null) {
  useEffect(() => {
    if (!map || !data) return;
    const apply = () => {
      const src = map.getSource(id) as GeoJSONSource | undefined;
      if (src) src.setData(data);
    };
    apply();
    map.on('styledata', apply);
    return () => {
      map.off('styledata', apply);
    };
  }, [map, id, data]);
}
