// Base-map style builder: palette + options -> MapLibre style for basemap-2010.pmtiles.
// Layer stack follows docs/VISUAL_DESIGN.md §4.

import type {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import type { Lang, RouteClass } from '@otc/shared';
import type { LinesFC, PointsFC, PolysFC } from '../network/geojson';
import type { Palette } from './palettes';

export interface StyleOptions {
  palette: Palette;
  lang: Lang;
  buildings3d: boolean;
  terrain: boolean;
  /** hatch the land that was developed after 2010 (review aid, off in normal play) */
  history?: boolean;
  /** the transit network (M2): static lines + stops (+ M3 demand zones); vehicles are streamed into their sources */
  network?: { lines: LinesFC; stops: PointsFC; zones?: PointsFC; loads?: LinesFC };
  /** M3 "Riders" view: route widths by weekday riders, zones coloured by transit share */
  riders?: boolean;
  /** M4 Plan mode: the network fades back; the draft route and the travel-time bloom draw on top */
  plan?: { draftLine: LinesFC; draftPoints: PointsFC; iso: PolysFC; isoOrigin: [number, number] | null };
  /** M6 Opinion view: zones washed by opinion (data streamed into OPINION_ZONES), the network fades back */
  opinion?: boolean;
  /** M6 a followed rider: their journey and position (data streamed into RIDER_PATH / RIDER_POS), in their colour */
  rider?: string | null;
  /** absolute URL prefix where data/ and glyphs/ are served (ends with '/') */
  baseUrl: string;
}

export const BASEMAP = 'basemap';
export const NET_LINES = 'net-lines';
export const NET_STOPS = 'net-stops';
export const NET_VEHICLES = 'net-vehicles';
export const NET_TRAILS = 'net-trails';
export const NET_ZONES = 'net-zones';
export const NET_LOADS = 'net-loads';
export const PLAN_DRAFT = 'plan-draft';
export const PLAN_DRAFT_PTS = 'plan-draft-pts';
export const PLAN_ISO = 'plan-iso';
export const OPINION_ZONES = 'op-zones';
export const RIDER_PATH = 'rider-path';
export const RIDER_POS = 'rider-pos';
export const CLASSES: RouteClass[] = ['local', 'peak', 'rural', 'sto', 'frequent', 'transitway', 'otrain'];
/** Interactive layers, top-most first (click priority). */
export const PICKABLE = ['rider-pos', 'net-vehicles', 'net-vehicle-dots', 'net-stations', 'net-stops', 'net-routes', 'net-otrain', 'net-transitway', 'op-zones'];
export const TERRAIN = 'terrain';

type Stops = number[];
const zoomExp = (...stops: Stops): ExpressionSpecification =>
  ['interpolate', ['exponential', 1.55], ['zoom'], ...stops] as unknown as ExpressionSpecification;
const zoomLin = (...stops: Stops): ExpressionSpecification =>
  ['interpolate', ['linear'], ['zoom'], ...stops] as unknown as ExpressionSpecification;

/** Label text in the chosen language, falling back to the feature's primary name. */
export function nameExpr(lang: Lang): ExpressionSpecification {
  return ['coalesce', ['get', `name_${lang}`], ['get', 'name'], ''];
}

const ROAD_TIERS: { id: string; classes: string[]; w: Stops }[] = [
  { id: 'service', classes: ['service'], w: [13, 0.3, 15, 1.2, 17, 4] },
  { id: 'minor', classes: ['minor'], w: [11, 0.2, 13, 0.7, 15, 2.6, 17, 9] },
  { id: 'tertiary', classes: ['tertiary'], w: [10, 0.35, 13, 1.4, 15, 4.2, 17, 13] },
  { id: 'arterial', classes: ['primary', 'secondary'], w: [8, 0.4, 11, 1.1, 13, 2.4, 15, 6.5, 17, 18] },
  { id: 'highway', classes: ['motorway', 'trunk'], w: [7, 0.6, 10, 1.4, 13, 3.4, 15, 9, 17, 24] },
];

export function buildStyle(o: StyleOptions): StyleSpecification {
  const p = o.palette;
  const layers: LayerSpecification[] = [];
  const L = (l: LayerSpecification) => layers.push(l);
  const src = { source: BASEMAP } as const;
  const name = nameExpr(o.lang);

  L({ id: 'land', type: 'background', paint: { 'background-color': p.land } });

  // --- land cover & land use ---------------------------------------------------------------
  L({ id: 'landcover', type: 'fill', ...src, 'source-layer': 'landcover',
    paint: {
      'fill-color': ['match', ['get', 'kind'], 'forest', p.forest, 'wetland', p.wetland, 'field', p.field, 'grass', p.grass, 'shrub', p.grass, p.grass],
      'fill-opacity': ['match', ['get', 'kind'], 'field', 1, 0.9],
    } });
  if (o.history) {
    L({ id: 'history-hatch', type: 'fill', ...src, 'source-layer': 'landcover', filter: ['==', ['get', 'kind'], 'field'],
      paint: { 'fill-pattern': 'hatch-history' } });
  }
  L({ id: 'landuse-base', type: 'fill', ...src, 'source-layer': 'landuse',
    filter: ['in', ['get', 'kind'], ['literal', ['residential', 'commercial', 'farmland']]],
    paint: {
      'fill-color': ['match', ['get', 'kind'], 'residential', p.urban, 'commercial', p.commercial, p.farmland],
      'fill-opacity': zoomLin(8, 0.85, 13, 0.85, 15.5, 0.35),
    } });
  if (o.terrain) {
    L({ id: 'hillshade', type: 'hillshade', source: TERRAIN,
      paint: {
        'hillshade-shadow-color': p.hillShadow,
        'hillshade-highlight-color': p.hillHighlight,
        'hillshade-accent-color': p.hillAccent,
        'hillshade-exaggeration': zoomLin(7, p.hillStrength, 12, p.hillStrength * 0.8, 15, p.hillStrength * 0.35),
        'hillshade-illumination-direction': 315,
      } });
  }
  L({ id: 'landuse', type: 'fill', ...src, 'source-layer': 'landuse',
    filter: ['!', ['in', ['get', 'kind'], ['literal', ['residential', 'commercial', 'farmland']]]],
    paint: {
      'fill-color': ['match', ['get', 'kind'], 'park', p.park, 'nature', p.nature, 'golf', p.golf, 'cemetery', p.cemetery,
        'sports', p.sports, 'campus', p.campus, 'hospital', p.hospital, p.park],
      'fill-opacity': zoomLin(10, 0.7, 13, 1),
    } });

  // --- water ------------------------------------------------------------------------------------
  L({ id: 'water', type: 'fill', ...src, 'source-layer': 'water', filter: ['!=', ['get', 'kind'], 'canal'],
    paint: { 'fill-color': p.water } });
  L({ id: 'water-edge', type: 'line', ...src, 'source-layer': 'water', filter: ['!=', ['get', 'kind'], 'canal'],
    paint: {
      'line-color': p.waterEdge,
      'line-width': zoomExp(8, p.waterEdgeWidth * 0.15, 12, p.waterEdgeWidth * 0.6, 16, p.waterEdgeWidth * 2.2),
      'line-blur': zoomExp(8, p.waterEdgeBlur * 0.15, 12, p.waterEdgeBlur * 0.6, 16, p.waterEdgeBlur * 2.4),
      'line-opacity': 0.75,
    } });
  L({ id: 'waterway', type: 'line', ...src, 'source-layer': 'waterway', filter: ['in', ['get', 'kind'], ['literal', ['stream', 'drain', 'canal']]],
    paint: { 'line-color': p.stream, 'line-width': zoomExp(11, 0.5, 14, 1.2, 17, 3) } });
  L({ id: 'canal', type: 'fill', ...src, 'source-layer': 'water', filter: ['==', ['get', 'kind'], 'canal'],
    paint: { 'fill-color': p.canal } });
  L({ id: 'canal-edge', type: 'line', ...src, 'source-layer': 'water', filter: ['==', ['get', 'kind'], 'canal'],
    paint: {
      'line-color': p.canalEdge,
      'line-width': zoomExp(11, 0.6, 16, p.canalGlow ? 9 : 2.5),
      'line-blur': p.canalGlow ? zoomExp(11, 1, 16, 10) : 0,
      'line-opacity': p.canalGlow ? 0.8 : 1,
    } });

  // --- roads & rail -----------------------------------------------------------------------------
  const roadFilter = (classes: string[]): ExpressionSpecification =>
    ['all', ['in', ['get', 'class'], ['literal', classes]], ['!=', ['get', 'tunnel'], true]];
  for (const t of ROAD_TIERS) {
    if (p.roadGlow && t.id !== 'minor' && t.id !== 'service') {
      L({ id: `road-${t.id}-glow`, type: 'line', ...src, 'source-layer': 'roads', filter: roadFilter(t.classes),
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': p.roadGlow, 'line-width': zoomExp(...scale(t.w, 3.2)), 'line-blur': zoomExp(...scale(t.w, 3)),
          'line-opacity': t.id === 'highway' ? 0.16 : t.id === 'arterial' ? 0.12 : 0.07 } });
    }
    const cas = t.id === 'minor' || t.id === 'service' ? p.roadMinorCase : p.roadCase;
    if (cas) {
      L({ id: `road-${t.id}-case`, type: 'line', ...src, 'source-layer': 'roads', filter: roadFilter(t.classes), minzoom: t.id === 'minor' ? 12 : 0,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': cas, 'line-width': zoomExp(...t.w.map((v, i) => (i % 2 ? v + (t.id === 'minor' || t.id === 'service' ? 0.9 : 1.6) : v))) } });
    }
  }
  for (const t of ROAD_TIERS) {
    L({ id: `road-${t.id}`, type: 'line', ...src, 'source-layer': 'roads', filter: roadFilter(t.classes),
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': t.id === 'minor' || t.id === 'service' ? p.roadMinor : p.roadFill, 'line-width': zoomExp(...t.w),
        'line-opacity': p.night ? 0.85 : 1 } });
  }
  L({ id: 'road-tunnel', type: 'line', ...src, 'source-layer': 'roads', filter: ['==', ['get', 'tunnel'], true],
    paint: { 'line-color': p.roadCase ?? p.roadFill, 'line-width': zoomExp(10, 0.6, 15, 3), 'line-dasharray': [2, 2], 'line-opacity': 0.6 } });
  L({ id: 'rail', type: 'line', ...src, 'source-layer': 'rail', filter: ['!=', ['get', 'class'], 'disused'],
    paint: { 'line-color': p.rail, 'line-width': zoomExp(9, 0.6, 16, 2.4), 'line-dasharray': [3, 1.5] } });
  L({ id: 'rail-disused', type: 'line', ...src, 'source-layer': 'rail', filter: ['==', ['get', 'class'], 'disused'],
    paint: { 'line-color': p.rail, 'line-width': zoomExp(12, 0.8, 16, 2.2), 'line-dasharray': [1, 2], 'line-opacity': 0.8 } });

  // --- outside the playable region, faded; boundaries -------------------------------------------
  L({ id: 'mask', type: 'fill', ...src, 'source-layer': 'mask', paint: { 'fill-color': p.land, 'fill-opacity': p.maskOpacity } });
  L({ id: 'boundary-province', type: 'line', ...src, 'source-layer': 'boundary', filter: ['==', ['get', 'kind'], 'province'],
    paint: { 'line-color': p.boundary, 'line-width': zoomLin(7, 0.6, 12, 1.2), 'line-dasharray': [4, 3], 'line-opacity': 0.55 } });
  L({ id: 'boundary-city', type: 'line', ...src, 'source-layer': 'boundary', filter: ['==', ['get', 'kind'], 'city'],
    paint: { 'line-color': p.boundary, 'line-width': zoomLin(7, 0.8, 12, 1.6), 'line-dasharray': [3, 2], 'line-opacity': 0.75 } });

  // --- buildings ----------------------------------------------------------------------------------
  const h: ExpressionSpecification = ['coalesce', ['get', 'h'], 7];
  if (o.buildings3d) {
    L({ id: 'buildings', type: 'fill-extrusion', ...src, 'source-layer': 'buildings', minzoom: 13,
      paint: {
        ...(p.windows
          ? { 'fill-extrusion-pattern': ['step', h, 'win-low', 18, 'win-mid', 45, 'win-high'] as DataDrivenPropertyValueSpecification<string> }
          : { 'fill-extrusion-color': ['interpolate', ['linear'], h, 0, p.bldLow, 25, p.bldMid, 90, p.bldHigh] as DataDrivenPropertyValueSpecification<string> }),
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, h] as DataDrivenPropertyValueSpecification<number>,
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': p.bldOpacity,
        'fill-extrusion-vertical-gradient': true,
      } });
  } else {
    L({ id: 'buildings', type: 'fill', ...src, 'source-layer': 'buildings', minzoom: 13,
      paint: { 'fill-color': ['interpolate', ['linear'], h, 0, p.bldLow, 25, p.bldMid, 90, p.bldHigh], 'fill-opacity': zoomLin(13, 0.5, 15, 1) } });
  }

  if (o.plan) addIsoLayers(L, p);
  if (o.opinion) addOpinionLayers(L, p);
  if (o.network) addNetworkLayers(L, p, !!o.riders && !!o.network.zones?.features.length, !!o.plan || !!o.opinion);
  if (o.plan) addDraftLayers(L, p);
  if (o.rider) addRiderLayers(L, p, o.rider);

  // --- labels ---------------------------------------------------------------------------------------
  const halo = { 'text-halo-color': p.halo, 'text-halo-width': 1.6, 'text-halo-blur': 0.4 };
  L({ id: 'label-road', type: 'symbol', ...src, 'source-layer': 'roads', minzoom: 12,
    filter: ['all', ['has', 'name'], ['any', ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]], ['>=', ['zoom'], 14.5]]],
    layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': ['Inter Regular'], 'text-size': zoomLin(12, 10, 16, 12.5),
      'text-letter-spacing': 0.02, 'text-max-angle': 30, 'symbol-spacing': 320 },
    paint: { 'text-color': p.labelRoad, ...halo } });
  L({ id: 'label-waterway', type: 'symbol', ...src, 'source-layer': 'waterway', minzoom: 9,
    filter: ['all', ['has', 'name'], ['any', ['==', ['get', 'kind'], 'river'], ['>=', ['zoom'], 13]]],
    layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': ['Source Serif 4 Italic'],
      'text-size': zoomLin(9, 12, 13, 15, 16, 17), 'text-letter-spacing': 0.08, 'symbol-spacing': 420, 'text-max-angle': 25 },
    paint: { 'text-color': p.labelWater, ...halo } });
  L({ id: 'label-water', type: 'symbol', ...src, 'source-layer': 'water_labels',
    layout: { 'text-field': name, 'text-font': ['Source Serif 4 Italic'],
      'text-size': ['interpolate', ['linear'], ['get', 'area_km2'], 0, 11, 1, 13, 20, 16], 'text-max-width': 8, 'text-letter-spacing': 0.04 },
    paint: { 'text-color': p.labelWater, ...halo } });
  L({ id: 'label-park', type: 'symbol', ...src, 'source-layer': 'landuse', minzoom: 15.5,
    filter: ['all', ['has', 'name'], ['in', ['get', 'kind'], ['literal', ['park', 'nature', 'golf']]]],
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Source Serif 4 Italic'], 'text-size': 11.5, 'text-max-width': 9, 'symbol-placement': 'point',
      'symbol-sort-key': 10, 'text-padding': 12 },
    paint: { 'text-color': p.labelPark, ...halo } });
  const placeKinds = (kinds: string[]): ExpressionSpecification => ['in', ['get', 'kind'], ['literal', kinds]];
  L({ id: 'label-micro', type: 'symbol', ...src, 'source-layer': 'places', minzoom: 14, filter: placeKinds(['micro', 'hamlet']),
    layout: { 'text-field': name, 'text-font': ['Inter SemiBold'], 'text-size': 10, 'text-transform': 'uppercase', 'text-letter-spacing': 0.12, 'text-max-width': 8 },
    paint: { 'text-color': p.labelMinor, ...halo } });
  L({ id: 'label-neighbourhood', type: 'symbol', ...src, 'source-layer': 'places', minzoom: 12.2, filter: placeKinds(['neighbourhood']),
    layout: { 'text-field': name, 'text-font': ['Inter SemiBold'], 'text-size': zoomLin(12, 9.5, 15, 11.5),
      'text-transform': 'uppercase', 'text-letter-spacing': 0.14, 'text-max-width': 8 },
    paint: { 'text-color': p.labelMinor, ...halo } });
  L({ id: 'label-district', type: 'symbol', ...src, 'source-layer': 'places', minzoom: 10.3, maxzoom: 15, filter: placeKinds(['district']),
    layout: { 'text-field': name, 'text-font': ['Inter SemiBold'], 'text-size': zoomLin(10, 10.5, 14, 13.5),
      'text-transform': 'uppercase', 'text-letter-spacing': 0.16, 'text-max-width': 9 },
    paint: { 'text-color': p.labelPlace, ...halo } });
  L({ id: 'label-village', type: 'symbol', ...src, 'source-layer': 'places', minzoom: 9.5, filter: placeKinds(['village', 'town']),
    layout: { 'text-field': name, 'text-font': ['Inter SemiBold'], 'text-size': zoomLin(9, 11, 13, 14), 'text-max-width': 8 },
    paint: { 'text-color': p.labelPlace, ...halo } });
  L({ id: 'label-city', type: 'symbol', ...src, 'source-layer': 'places', maxzoom: 12.5, filter: placeKinds(['city']),
    layout: { 'text-field': name, 'text-font': ['Inter Bold'], 'text-size': zoomLin(7, 14, 10, 20, 12, 24),
      'text-transform': 'uppercase', 'text-letter-spacing': 0.42 },
    paint: { 'text-color': p.labelCity, 'text-opacity': zoomLin(7, 0.9, 11, 0.55, 12.4, 0.2), ...halo } });

  const netSources = o.network ? {
    [NET_LINES]: { type: 'geojson' as const, data: o.network.lines },
    [NET_STOPS]: { type: 'geojson' as const, data: o.network.stops },
    [NET_VEHICLES]: { type: 'geojson' as const, data: { type: 'FeatureCollection', features: [] } },
    [NET_TRAILS]: { type: 'geojson' as const, data: { type: 'FeatureCollection', features: [] }, lineMetrics: true },
    [NET_ZONES]: { type: 'geojson' as const, data: o.network.zones ?? { type: 'FeatureCollection', features: [] } },
    [NET_LOADS]: { type: 'geojson' as const, data: o.network.loads ?? { type: 'FeatureCollection', features: [] } },
  } : {};
  const planSources = o.plan ? {
    [PLAN_DRAFT]: { type: 'geojson' as const, data: o.plan.draftLine },
    [PLAN_DRAFT_PTS]: { type: 'geojson' as const, data: o.plan.draftPoints },
    [PLAN_ISO]: { type: 'geojson' as const, data: { type: 'FeatureCollection', features: [...o.plan.iso.features,
      ...(o.plan.isoOrigin ? [{ type: 'Feature', properties: { origin: true }, geometry: { type: 'Point', coordinates: o.plan.isoOrigin } }] : [])] } },
  } : {};

  const empty = { type: 'geojson' as const, data: { type: 'FeatureCollection' as const, features: [] } };
  const m6Sources = {
    ...(o.opinion ? { [OPINION_ZONES]: empty } : {}),
    ...(o.rider ? { [RIDER_PATH]: { ...empty, lineMetrics: true }, [RIDER_POS]: empty } : {}),
  };

  return {
    version: 8,
    name: `OTC base map 2010 · ${p.id}`,
    glyphs: `${o.baseUrl}glyphs/{fontstack}/{range}.pbf`,
    light: p.light,
    sky: p.sky,
    sources: {
      [BASEMAP]: { type: 'vector', url: `pmtiles://${o.baseUrl}data/basemap-2010.pmtiles`,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="https://overturemaps.org">Overture Maps</a>' },
      ...(o.terrain ? { [TERRAIN]: { type: 'raster-dem' as const, url: `pmtiles://${o.baseUrl}data/terrain.pmtiles`, encoding: 'terrarium' as const, tileSize: 256,
        attribution: 'CDEM © Natural Resources Canada' } } : {}),
      ...netSources,
      ...planSources,
      ...m6Sources,
    },
    layers,
  } as StyleSpecification;
}

function scale(stops: Stops, k: number): Stops {
  return stops.map((v, i) => (i % 2 ? v * k : v));
}

/** Transit network layers: corridors, routes, trails, vehicles, stations (VISUAL_DESIGN §3, §5). */
function addNetworkLayers(L: (l: LayerSpecification) => void, p: Palette, riders: boolean, muted = false) {
  const T = p.transit;
  const lines = { source: NET_LINES } as const;
  const corridor = (kind: string): ExpressionSpecification => ['all', ['==', ['get', 'kind'], 'corridor'], ['==', ['get', 'corridor'], kind]];
  const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
  const w = (...stops: Stops) => zoomExp(...stops);
  const glow = p.night;

  // M3 "Riders" view: where people live, coloured by how much of their travel is by transit
  if (riders) {
    const size = ['sqrt', ['get', 'trips']];
    L({ id: 'net-zones', type: 'circle', source: NET_ZONES, minzoom: 8,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, ['*', 0.02, size], 13, ['*', 0.09, size], 16, ['*', 0.25, size]],
        'circle-color': ['interpolate', ['linear'], ['get', 'share'], 0, p.night ? '#3A4A63' : '#CBD5E3', 0.06, '#9CC3E4',
          0.14, '#4E9AD6', 0.25, '#2D6CC0', 0.4, '#1B3E8F'],
        'circle-opacity': p.night ? 0.55 : 0.6,
        'circle-blur': 0.25,
      } as never });
  }

  // bus routes (from GTFS / archive reconstruction); in the Riders view, wider where more people ride
  L({ id: 'net-routes', type: 'line', ...lines, filter: ['==', ['get', 'kind'], 'route'], layout: round,
    paint: {
      'line-color': ['match', ['get', 'cls'], ...CLASSES.flatMap((c) => [c, T[c]]), T.local] as unknown as ExpressionSpecification,
      'line-width': ['interpolate', ['exponential', 1.55], ['zoom'], 10, ['match', ['get', 'cls'], 'frequent', 1.4, 'sto', 1.3, 0.8],
        16, ['match', ['get', 'cls'], 'frequent', 6, 'sto', 5.5, 3]] as unknown as ExpressionSpecification,
      'line-opacity': (riders ? 0.22 : muted ? 0.45 : ['match', ['get', 'cls'], 'local', 0.75, 'peak', 0.7, 1]) as unknown as ExpressionSpecification,
    } });

  // Transitway: solid red with a fine white centre line (BRT signature)
  if (glow) {
    L({ id: 'net-transitway-glow', type: 'line', ...lines, filter: corridor('busway'), layout: round,
      paint: { 'line-color': T.transitway, 'line-width': w(10, 8, 16, 34), 'line-blur': w(10, 6, 16, 24), 'line-opacity': 0.35 } });
  } else {
    L({ id: 'net-transitway-case', type: 'line', ...lines, filter: corridor('busway'), layout: round,
      paint: { 'line-color': '#FFFFFF', 'line-width': w(9, 2.6, 12, 5, 16, 14) } });
  }
  L({ id: 'net-transitway', type: 'line', ...lines, filter: corridor('busway'), layout: round,
    paint: { 'line-color': T.transitway, 'line-width': w(9, 1.4, 12, 3, 16, 9.5) } });
  L({ id: 'net-transitway-centre', type: 'line', ...lines, filter: corridor('busway'), minzoom: 11.5, layout: round,
    paint: { 'line-color': '#FFFFFF', 'line-opacity': 0.6, 'line-width': w(11.5, 0.5, 16, 2) } });

  // O-Train: green with a dashed white centre line (rail ties)
  if (glow) {
    L({ id: 'net-otrain-glow', type: 'line', ...lines, filter: corridor('rail'), layout: round,
      paint: { 'line-color': T.otrain, 'line-width': w(10, 8, 16, 30), 'line-blur': w(10, 6, 16, 22), 'line-opacity': 0.35 } });
  } else {
    L({ id: 'net-otrain-case', type: 'line', ...lines, filter: corridor('rail'), layout: round,
      paint: { 'line-color': '#FFFFFF', 'line-width': w(9, 2.4, 12, 4.6, 16, 13) } });
  }
  L({ id: 'net-otrain', type: 'line', ...lines, filter: corridor('rail'), layout: round,
    paint: { 'line-color': T.otrain, 'line-width': w(9, 1.3, 12, 2.8, 16, 8.5) } });
  L({ id: 'net-otrain-centre', type: 'line', ...lines, filter: corridor('rail'), minzoom: 11.5,
    paint: { 'line-color': '#FFFFFF', 'line-width': w(11.5, 0.6, 16, 2.2), 'line-dasharray': [1, 1.6] } });

  // M3 Riders view: weekday riders per segment, summed over routes ("bandwidth")
  if (riders) {
    const bw = (k: number) => ['*', k, ['interpolate', ['linear'], ['get', 'load'], 0, 0.5, 1000, 1.8, 5000, 4.5, 15000, 9, 40000, 17]];
    L({ id: 'net-loads-case', type: 'line', source: NET_LOADS, layout: round,
      paint: { 'line-color': p.night ? '#0B1424' : '#FFFFFF', 'line-opacity': 0.85,
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 9, ['+', 1, bw(0.45)], 16, ['+', 2.5, bw(2.4)]] } as never });
    L({ id: 'net-loads', type: 'line', source: NET_LOADS, layout: round,
      paint: {
        'line-color': ['interpolate', ['linear'], ['get', 'load'], 0, '#9CC3E4', 2000, '#4E9AD6', 8000, '#2D6CC0', 25000, '#1B3E8F'],
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 9, bw(0.45), 16, bw(2.4)],
      } as never });
  }

  // vehicle trails (gradient per class) and vehicles (oriented silhouettes, see textures.ts)
  for (const c of CLASSES) {
    L({ id: `net-trail-${c}`, type: 'line', source: NET_TRAILS, filter: ['==', ['get', 'cls'], c], layout: round,
      paint: {
        'line-width': w(10, c === 'otrain' ? 2.5 : 1.6, 16, c === 'otrain' ? 8 : 5.5),
        'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, rgba(T[c], 0), 0.75, rgba(T[c], glow ? 0.5 : 0.32), 1, rgba(T[c], glow ? 0.9 : 0.6)],
        'line-blur': glow ? 1.5 : 0.5,
      } });
  }
  if (glow) {
    L({ id: 'net-vehicle-halo', type: 'circle', source: NET_VEHICLES,
      paint: { 'circle-color': ['match', ['get', 'cls'], ...CLASSES.flatMap((c) => [c, T[c]]), T.local] as unknown as ExpressionSpecification,
        'circle-radius': w(10, 5, 16, 20), 'circle-blur': 1, 'circle-opacity': 0.5 } });
  }
  // regional zooms: vehicles as bright dots (silhouettes would be specks)
  L({ id: 'net-vehicle-dots', type: 'circle', source: NET_VEHICLES, maxzoom: 13.6,
    paint: {
      'circle-color': ['match', ['get', 'cls'], ...CLASSES.flatMap((c) => [c, T[c]]), T.local] as unknown as ExpressionSpecification,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, ['match', ['get', 'cls'], 'otrain', 3.4, 2.4], 13.6, ['match', ['get', 'cls'], 'otrain', 7, 5]] as unknown as ExpressionSpecification,
      'circle-stroke-color': p.night ? '#FFFFFF' : '#14213A',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, muted ? 0.6 : 1.4, 13.6, 2.2],
      ...(muted ? { 'circle-opacity': 0.35, 'circle-stroke-opacity': 0.35 } : {}),
    } });
  L({ id: 'net-vehicles', type: 'symbol', source: NET_VEHICLES, minzoom: 13.5,
    layout: {
      'icon-image': ['concat', 'veh-', ['get', 'cls'], p.night ? '-n' : '-d'],
      'icon-rotate': ['get', 'bearing'],
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-size': ['interpolate', ['exponential', 1.6], ['zoom'], 13.5, 0.85, 15, 1.1, 17, 1.9],
    } });

  // ordinary stops: small dots, only when zoomed in
  L({ id: 'net-stops', type: 'circle', source: NET_STOPS, minzoom: 13, filter: ['!=', ['get', 'kind'], 'station'],
    paint: {
      'circle-color': p.stationFill,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 1.6, 16, 4.2],
      'circle-stroke-color': ['match', ['get', 'cls'], ...CLASSES.flatMap((c) => [c, T[c]]), T.local] as unknown as ExpressionSpecification,
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13, 1, 16, 2],
    } });
  // stations
  L({ id: 'net-stations', type: 'circle', source: NET_STOPS, minzoom: 10, filter: ['==', ['get', 'kind'], 'station'],
    paint: {
      'circle-color': p.stationFill,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['case', ['get', 'transfer'], 3.6, 2.4], 16, ['case', ['get', 'transfer'], 11, 8]],
      'circle-stroke-color': ['case', ['get', 'transfer'], p.labelCity, ['match', ['get', 'cls'], 'otrain', T.otrain, T.transitway]],
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 10, 1.3, 16, 3.2],
    } });
  L({ id: 'net-stop-labels', type: 'symbol', source: NET_STOPS, minzoom: 16, filter: ['!=', ['get', 'kind'], 'station'],
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Inter Regular'], 'text-size': 10.5, 'text-anchor': 'left', 'text-offset': [0.8, 0],
      'text-optional': true, 'text-max-width': 10 },
    paint: { 'text-color': p.labelMinor, 'text-halo-color': p.halo, 'text-halo-width': 1.6 } });
  L({ id: 'net-station-labels', type: 'symbol', source: NET_STOPS, minzoom: 12.3, filter: ['==', ['get', 'kind'], 'station'],
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Inter SemiBold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10.5, 16, 13],
      'text-anchor': 'left', 'text-offset': [0.9, 0], 'text-optional': true, 'text-max-width': 9 },
    paint: { 'text-color': p.stationText, 'text-halo-color': p.halo, 'text-halo-width': 1.8 } });
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** The opinion wash's diverging scale: approval points around 50% (warm = disapprove, cool = approve, grey = split). */
export const OPINION_RAMP: [number, string][] = [[-14, '#B4462E'], [-7, '#E39A6F'], [0, '#C9CDD3'], [7, '#6FB3B8'], [14, '#1F7A80']];
export const OPINION_RAMP_NIGHT: [number, string][] = [[-14, '#D9654A'], [-7, '#B5795A'], [0, '#5A6474'], [7, '#4D9AA0'], [14, '#3FB7BE']];

/** M6 Opinion view: Ottawa's zones washed by opinion, under the (muted) network; the selected zone outlined. */
function addOpinionLayers(L: (l: LayerSpecification) => void, p: Palette) {
  const ramp = (p.night ? OPINION_RAMP_NIGHT : OPINION_RAMP).flat();
  L({ id: 'op-zones', type: 'fill', source: OPINION_ZONES, filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': ['interpolate', ['linear'], ['get', 'v'], ...ramp],
      'fill-opacity': ['case', ['boolean', ['get', 'coarse'], false], 0.42, 0.58],
      'fill-outline-color': p.night ? 'rgba(10,18,30,0.35)' : 'rgba(255,255,255,0.45)',
    } as never });
  L({ id: 'op-zones-selected', type: 'line', source: OPINION_ZONES, filter: ['==', ['get', 'selected'], true],
    paint: { 'line-color': p.night ? '#FFFFFF' : '#14213A', 'line-width': 2.5 } });
}

/** M6 a followed rider: walking dashed, riding in their colour, waiting and moving as a dot. */
function addRiderLayers(L: (l: LayerSpecification) => void, p: Palette, color: string) {
  const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
  L({ id: 'rider-ride-case', type: 'line', source: RIDER_PATH, layout: round, filter: ['==', ['get', 'kind'], 'ride'],
    paint: { 'line-color': p.night ? '#0B1220' : '#FFFFFF', 'line-width': zoomLin(10, 6, 15, 11) } });
  L({ id: 'rider-ride', type: 'line', source: RIDER_PATH, layout: round, filter: ['==', ['get', 'kind'], 'ride'],
    paint: { 'line-color': color, 'line-width': zoomLin(10, 3, 15, 6.5) } });
  L({ id: 'rider-walk', type: 'line', source: RIDER_PATH, layout: round, filter: ['==', ['get', 'kind'], 'walk'],
    paint: { 'line-color': color, 'line-width': zoomLin(10, 2, 15, 3.5), 'line-dasharray': [0.6, 1.8] } });
  L({ id: 'rider-ends', type: 'circle', source: RIDER_POS, filter: ['==', ['get', 'kind'], 'end'],
    paint: { 'circle-radius': zoomLin(10, 4, 15, 7), 'circle-color': p.night ? '#0B1220' : '#FFFFFF', 'circle-stroke-color': color, 'circle-stroke-width': 3 } });
  L({ id: 'rider-halo', type: 'circle', source: RIDER_POS, filter: ['==', ['get', 'kind'], 'now'],
    paint: { 'circle-radius': zoomLin(10, 14, 15, 22), 'circle-color': color, 'circle-opacity': 0.22, 'circle-blur': 0.4 } });
  L({ id: 'rider-pos', type: 'circle', source: RIDER_POS, filter: ['==', ['get', 'kind'], 'now'],
    paint: { 'circle-radius': zoomLin(10, 7, 15, 10), 'circle-color': color, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2.5 } });
  L({ id: 'rider-label', type: 'symbol', source: RIDER_POS, filter: ['==', ['get', 'kind'], 'now'],
    layout: { 'text-field': ['get', 'initial'], 'text-font': ['Inter Bold'], 'text-size': zoomLin(10, 9, 15, 12), 'text-allow-overlap': true },
    paint: { 'text-color': '#FFFFFF' } });
}

/** M4 travel-time bloom: zone hexagons in four bands (10/20/30/45 min), under the network. */
function addIsoLayers(L: (l: LayerSpecification) => void, p: Palette) {
  L({ id: 'plan-iso', type: 'fill', source: PLAN_ISO, filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': ['step', ['get', 't'], '#0E7C86', 10.5, '#36A3A2', 20.5, '#7EC8B2', 30.5, '#C6E7BE', 45.5, p.night ? '#2B3A4E' : '#EEF2E4'],
      'fill-opacity': ['step', ['get', 't'], 0.62, 45.5, 0.25],
      'fill-outline-color': 'rgba(255,255,255,0.35)',
    } as never });
  L({ id: 'plan-iso-origin', type: 'circle', source: PLAN_ISO, filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 8, 'circle-color': '#F2A93B', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 } });
}

/** M4 the route being drawn: white casing, amber dashes, stops (reused stops ringed), waypoints as handles. */
function addDraftLayers(L: (l: LayerSpecification) => void, p: Palette) {
  const round = { 'line-join': 'round', 'line-cap': 'round' } as const;
  L({ id: 'plan-draft-case', type: 'line', source: PLAN_DRAFT, layout: round,
    paint: { 'line-color': p.night ? '#0B1424' : '#FFFFFF', 'line-width': zoomExp(10, 6, 16, 16) } });
  L({ id: 'plan-draft', type: 'line', source: PLAN_DRAFT, layout: round,
    paint: { 'line-color': '#E8961E', 'line-width': zoomExp(10, 3, 16, 9), 'line-dasharray': [1.6, 1.1] } });
  L({ id: 'plan-draft-stops', type: 'circle', source: PLAN_DRAFT_PTS, filter: ['==', ['get', 'kind'], 'stop'],
    paint: { 'circle-radius': zoomExp(10, 3.5, 16, 7), 'circle-color': ['case', ['get', 'existing'], '#FFFFFF', '#E8961E'],
      'circle-stroke-color': ['case', ['get', 'existing'], '#E8961E', '#FFFFFF'], 'circle-stroke-width': 2 } as never });
  L({ id: 'plan-draft-handles', type: 'circle', source: PLAN_DRAFT_PTS, filter: ['==', ['get', 'kind'], 'waypoint'],
    paint: { 'circle-radius': zoomExp(10, 6, 16, 10), 'circle-color': '#FFFFFF', 'circle-stroke-color': '#E8961E', 'circle-stroke-width': 3 } });
  L({ id: 'plan-draft-labels', type: 'symbol', source: PLAN_DRAFT_PTS, minzoom: 13.5, filter: ['==', ['get', 'kind'], 'stop'],
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Inter SemiBold'], 'text-size': 11, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true },
    paint: { 'text-color': p.night ? '#F6D9A8' : '#7A4A06', 'text-halo-color': p.halo, 'text-halo-width': 1.6 } });
}
