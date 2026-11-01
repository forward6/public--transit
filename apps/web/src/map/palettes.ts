// Palette tokens for the base map — one per season × time of day.
// Tokens follow docs/VISUAL_DESIGN.md §3 (winter day, winter night and summer day are the
// designed looks; spring, autumn and the other nights are derived from them).

import type { Season, TimeOfDay } from '@otc/shared';

export interface Palette {
  id: string;
  night: boolean;
  snow: boolean;
  land: string;
  maskOpacity: number;
  field: string;
  urban: string;
  commercial: string;
  farmland: string;
  forest: string;
  wetland: string;
  grass: string;
  park: string;
  nature: string;
  golf: string;
  cemetery: string;
  sports: string;
  campus: string;
  hospital: string;
  water: string;
  waterEdge: string;
  waterEdgeWidth: number;
  waterEdgeBlur: number;
  canal: string;
  canalEdge: string;
  canalGlow: boolean;
  stream: string;
  roadFill: string;
  roadCase: string | null;
  roadMinor: string;
  roadMinorCase: string | null;
  roadGlow: string | null;
  rail: string;
  bldLow: string;
  bldMid: string;
  bldHigh: string;
  bldOpacity: number;
  windows: boolean;
  hillShadow: string;
  hillHighlight: string;
  hillAccent: string;
  hillStrength: number;
  boundary: string;
  labelCity: string;
  labelPlace: string;
  labelMinor: string;
  labelWater: string;
  labelRoad: string;
  labelPark: string;
  halo: string;
  light: { anchor: 'viewport' | 'map'; color: string; intensity: number; position: [number, number, number] };
  sky: Record<string, string | number>;
}

const winterDay: Palette = {
  id: 'winter-day',
  night: false,
  snow: true,
  land: '#EEF2F4',
  maskOpacity: 0.55,
  field: '#F2F5F6',
  urban: '#DFE4E9',
  commercial: '#D9DEE6',
  farmland: '#F2F5F6',
  forest: '#CFDAD3',
  wetland: '#D8E2E2',
  grass: '#E0E8E3',
  park: '#D6E3D9',
  nature: '#CDDBD1',
  golf: '#D8E4DC',
  cemetery: '#D6DFD9',
  sports: '#DCE5E0',
  campus: '#E9E7E3',
  hospital: '#EDE5E5',
  water: '#9DBDD1',
  waterEdge: '#F6FAFC',
  waterEdgeWidth: 7,
  waterEdgeBlur: 6,
  canal: '#E3EDF4',
  canalEdge: '#B7CCDB',
  canalGlow: false,
  stream: '#A9C4D6',
  roadFill: '#FFFFFF',
  roadCase: '#CBD3DA',
  roadMinor: '#FFFFFF',
  roadMinorCase: '#DCE2E7',
  roadGlow: null,
  rail: '#AEB7C0',
  bldLow: '#E3DED7',
  bldMid: '#D8D1C7',
  bldHigh: '#C9C0B4',
  bldOpacity: 0.96,
  windows: false,
  hillShadow: '#4E6478',
  hillHighlight: '#FFFFFF',
  hillAccent: '#7F95A8',
  hillStrength: 0.7,
  boundary: '#7A879C',
  labelCity: '#14213A',
  labelPlace: '#4D5B73',
  labelMinor: '#6E7C93',
  labelWater: '#4B7DA1',
  labelRoad: '#5C6B82',
  labelPark: '#4F7A5C',
  halo: '#F1F4F6',
  light: { anchor: 'viewport', color: '#ffffff', intensity: 0.38, position: [1.35, 205, 38] },
  sky: { 'sky-color': '#C9DCEA', 'horizon-color': '#F1F5F8', 'fog-color': '#EEF2F4', 'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.55, 'atmosphere-blend': 0 },
};

const summerDay: Palette = {
  ...winterDay,
  id: 'summer-day',
  snow: false,
  land: '#F3EFE7',
  field: '#EFEAD6',
  urban: '#E6DED2',
  commercial: '#E1D9CE',
  farmland: '#EFEAD6',
  forest: '#B9D5AB',
  wetland: '#CFE0D2',
  grass: '#D6E6C8',
  park: '#CDE2C0',
  nature: '#BFD9B2',
  golf: '#D2E6C4',
  cemetery: '#D3DFC8',
  sports: '#D6E7CB',
  campus: '#EDE5D8',
  hospital: '#F1E2DE',
  water: '#8DC1DB',
  waterEdge: '#C3E0EE',
  waterEdgeWidth: 4,
  waterEdgeBlur: 4,
  canal: '#8DC1DB',
  canalEdge: '#B5D7E8',
  stream: '#9CCAE0',
  roadCase: '#DDD5C8',
  roadMinorCase: '#E6DFD4',
  rail: '#B5AFA6',
  bldLow: '#E9E0D3',
  bldMid: '#DED1C0',
  bldHigh: '#CFBEA8',
  hillShadow: '#5F5848',
  hillHighlight: '#FFFDF6',
  hillAccent: '#8C846E',
  hillStrength: 0.62,
  boundary: '#8A8170',
  labelPlace: '#4A4A45',
  labelMinor: '#6B6A60',
  labelWater: '#3F78A0',
  labelRoad: '#646055',
  labelPark: '#46703F',
  halo: '#F6F3EC',
  light: { anchor: 'viewport', color: '#FFF6E6', intensity: 0.4, position: [1.35, 215, 40] },
  sky: { 'sky-color': '#BCDDF3', 'horizon-color': '#F4F1EA', 'fog-color': '#F3EFE7', 'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.55, 'atmosphere-blend': 0 },
};

const springDay: Palette = {
  ...summerDay,
  id: 'spring-day',
  land: '#F1F0E9',
  field: '#E8EDD8',
  farmland: '#E8EDD8',
  forest: '#C3DDB3',
  grass: '#D9EBCB',
  park: '#D2E8C4',
  nature: '#C7E0B9',
  water: '#86B8D2', // high spring water
  canal: '#9EC6DA',
  labelPark: '#4C7A44',
};

const autumnDay: Palette = {
  ...summerDay,
  id: 'autumn-day',
  land: '#F2ECE2',
  field: '#EFE6D0',
  farmland: '#EFE6D0',
  forest: '#D9B98A', // Gatineau Hills in October
  wetland: '#D7D3BC',
  grass: '#E1DCC0',
  park: '#E3D3A8',
  nature: '#D8C190',
  golf: '#DCD8B5',
  water: '#89B4CC',
  hillShadow: '#5E4E3A',
  labelPark: '#8A5A2B',
};

const winterNight: Palette = {
  ...winterDay,
  id: 'winter-night',
  night: true,
  land: '#0E1828',
  maskOpacity: 0.6,
  field: '#0F1A29',
  urban: '#152234',
  commercial: '#18243A',
  farmland: '#0F1A29',
  forest: '#0D1E20',
  wetland: '#0F1F27',
  grass: '#102022',
  park: '#0F2224',
  nature: '#0E2022',
  golf: '#102326',
  cemetery: '#0F1F24',
  sports: '#11222A',
  campus: '#121E30',
  hospital: '#171C2C',
  water: '#08192A',
  waterEdge: '#2A5677',
  waterEdgeWidth: 5,
  waterEdgeBlur: 5,
  canal: '#BFD6E8',
  canalEdge: '#EAF4FF',
  canalGlow: true,
  stream: '#163450',
  roadFill: '#4A4232',
  roadCase: null,
  roadMinor: '#242A33',
  roadMinorCase: null,
  roadGlow: '#F5B260',
  rail: '#2E3A4D',
  bldLow: '#1A2438',
  bldMid: '#222E46',
  bldHigh: '#2E3C5C',
  bldOpacity: 1,
  windows: true,
  hillShadow: '#02060C',
  hillHighlight: '#3A4F6E',
  hillAccent: '#0A1220',
  hillStrength: 0.6,
  boundary: '#5D6E8C',
  labelCity: '#EAF0FA',
  labelPlace: '#B8C5DA',
  labelMinor: '#8B9CBB',
  labelWater: '#79AEDB',
  labelRoad: '#9AA6BC',
  labelPark: '#7FB59A',
  halo: '#0E1828',
  light: { anchor: 'viewport', color: '#9FB7FF', intensity: 0.22, position: [1.2, 160, 50] },
  sky: { 'sky-color': '#050A13', 'horizon-color': '#22304D', 'fog-color': '#0E1828', 'sky-horizon-blend': 0.55, 'horizon-fog-blend': 0.55, 'fog-ground-blend': 0.35, 'atmosphere-blend': 0 },
};

const greenNight: Palette = {
  ...winterNight,
  id: 'summer-night',
  snow: false,
  land: '#101A24',
  field: '#141F27',
  urban: '#18232F',
  farmland: '#121C25',
  forest: '#0E1F1A',
  park: '#10241D',
  nature: '#0F221B',
  grass: '#12231E',
  water: '#0A1B2B',
  canal: '#0A1B2B',
  canalEdge: '#1E3F5A',
  canalGlow: false,
};

const PALETTES: Record<`${Season}-${TimeOfDay}`, Palette> = {
  'winter-day': winterDay,
  'winter-night': winterNight,
  'spring-day': springDay,
  'spring-night': { ...greenNight, id: 'spring-night' },
  'summer-day': summerDay,
  'summer-night': greenNight,
  'autumn-day': autumnDay,
  'autumn-night': { ...greenNight, id: 'autumn-night', forest: '#1E1A14', park: '#1C1D16' },
};

export function palette(season: Season, time: TimeOfDay): Palette {
  return PALETTES[`${season}-${time}`];
}

export const ALL_PALETTES = Object.values(PALETTES);
