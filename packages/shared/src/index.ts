import regionJson from './region.json';
import tileSchemaJson from './tile-schema.json';

export type LngLat = [number, number];
export type Bbox = [number, number, number, number];

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export type TimeOfDay = 'day' | 'night';
export type Lang = 'en' | 'fr';

export const SEASONS: readonly Season[] = ['winter', 'spring', 'summer', 'autumn'];
export const TIMES: readonly TimeOfDay[] = ['day', 'night'];
export const LANGS: readonly Lang[] = ['en', 'fr'];

export interface RegionConfig {
  name: string;
  snapshotDate: string;
  /** area fetched and tiled (west, south, east, north) */
  fetchBbox: Bbox;
  /** bounding box of the playable region (City of Ottawa + Ville de Gatineau) */
  regionBbox: Bbox;
  home: { center: LngLat; zoom: number; pitch: number; bearing: number };
  cities: { id: string; name: string; province: string }[];
}

export const region = regionJson as unknown as RegionConfig;
export const tileSchema = tileSchemaJson;

/** Names of the vector-tile layers in the base map (see tile-schema.json). */
export type BasemapLayer = keyof typeof tileSchemaJson.layers;

export * from './network';
export * from './demand';
export * from './plan';
export * from './economy';
export * from './opinion';
export * from './personas';
export * from './council';
