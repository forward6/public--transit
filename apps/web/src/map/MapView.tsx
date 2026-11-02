import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { region } from '@otc/shared';
import { buildStyle, type StyleOptions } from './style';
import { TRANSIT_DAY, TRANSIT_NIGHT } from './palettes';
import { hatchTexture, isWindowImage, vehicleIcon, windowTexture } from './textures';

let protocolRegistered = false;

export interface CameraPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface Props {
  style: StyleOptions;
  padding: CameraPadding;
  onMap?: (map: MLMap) => void;
}

declare global {
  interface Window {
    __otc?: { map: MLMap; ready: boolean; vehicles?: boolean };
  }
}

const [W, S, E, N] = region.fetchBbox;

export function MapView({ style, padding, onMap }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const { network, ...rest } = style;
  const styleKey = JSON.stringify({ ...rest, palette: style.palette.id,
    net: network ? `${network.lines.features.length}:${network.stops.features.length}` : 0 });
  const appliedKey = useRef(styleKey);

  useEffect(() => {
    if (!el.current) return;
    if (!protocolRegistered) {
      maplibregl.addProtocol('pmtiles', new Protocol().tile);
      protocolRegistered = true;
    }
    const map = new maplibregl.Map({
      container: el.current,
      style: buildStyle(style),
      center: region.home.center,
      zoom: region.home.zoom,
      pitch: region.home.pitch,
      bearing: region.home.bearing,
      minZoom: 7.5,
      maxZoom: 18,
      maxPitch: 72,
      maxBounds: [[W - 0.05, S - 0.03], [E + 0.05, N + 0.03]],
      hash: 'view',
      attributionControl: false,
      fadeDuration: 150,
      canvasContextAttributes: { antialias: true, preserveDrawingBuffer: new URLSearchParams(location.search).has('capture') },
    });
    map.setPadding(padding);
    map.on('styleimagemissing', (e) => {
      if (map.hasImage(e.id)) return;
      if (isWindowImage(e.id)) map.addImage(e.id, windowTexture(e.id), { pixelRatio: 2 });
      else if (e.id === 'hatch-history') map.addImage(e.id, hatchTexture(), { pixelRatio: 2 });
      else if (e.id.startsWith('veh-')) {
        const [, cls = 'local', dn, hex] = e.id.split('-');
        const colors = (dn === 'n' ? TRANSIT_NIGHT : TRANSIT_DAY) as Record<string, string>;
        const color = hex && /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex}` : colors[cls] ?? '#8794AB';
        map.addImage(e.id, vehicleIcon(cls, color, dn === 'n'), { pixelRatio: 2 });
      }
    });
    window.__otc = { map, ready: false };
    const markReady = () => {
      if (!map.loaded() || !map.isStyleLoaded() || !map.areTilesLoaded()) return;
      document.fonts.ready.then(() => {
        if (window.__otc) window.__otc.ready = true;
      });
    };
    map.on('idle', markReady);
    mapRef.current = map;
    onMap?.(map);
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // the map is created once; style and padding changes are applied below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedKey.current === styleKey) return;
    appliedKey.current = styleKey;
    if (window.__otc) window.__otc.ready = false;
    map.setStyle(buildStyle(style), { diff: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleKey]);

  useEffect(() => {
    mapRef.current?.easeTo({ padding, duration: 300 });
  }, [padding.top, padding.bottom, padding.left, padding.right]);

  return <div ref={el} className="map" />;
}
