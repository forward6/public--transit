import type { Lang, Season, TimeOfDay } from '@otc/shared';

export interface Strings {
  appName: string;
  appShort: string;
  subtitle: string;
  date: string;
  dateShort: string;
  season: Record<Season, string>;
  time: Record<TimeOfDay, string>;
  seasonLabel: string;
  timeLabel: string;
  languageLabel: string;
  buildings3d: string;
  zoomIn: string;
  zoomOut: string;
  resetView: string;
  legendTitle: string;
  legendRegion: string;
  legendOutside: string;
  legendFields: string;
  legendNote: string;
  mapStyle: string;
}

export const STRINGS: Record<Lang, Strings> = {
  en: {
    appName: 'Ottawa Transit Commissioner',
    appShort: 'OTC',
    subtitle: 'Base map · Ottawa–Gatineau as of 1 December 2010',
    date: 'Wednesday 1 December 2010',
    dateShort: '1 Dec 2010',
    season: { winter: 'Winter', spring: 'Spring', summer: 'Summer', autumn: 'Autumn' },
    time: { day: 'Day', night: 'Night' },
    seasonLabel: 'Season',
    timeLabel: 'Light',
    languageLabel: 'Language',
    buildings3d: '3D',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    resetView: 'Reset view',
    legendTitle: 'The 2010 map',
    legendRegion: 'Ottawa + Gatineau (playable region)',
    legendOutside: 'Neighbouring municipalities',
    legendFields: 'Farmland & fields (incl. land built on after 2010)',
    legendNote: 'Reconstructed from today’s map data. Add ?history=1 to hatch post-2010 development.',
    mapStyle: 'Map style',
  },
  fr: {
    appName: 'Commissaire au transport d’Ottawa',
    appShort: 'OTC',
    subtitle: 'Fond de carte · Ottawa–Gatineau au 1er décembre 2010',
    date: 'Mercredi 1er décembre 2010',
    dateShort: '1er déc. 2010',
    season: { winter: 'Hiver', spring: 'Printemps', summer: 'Été', autumn: 'Automne' },
    time: { day: 'Jour', night: 'Nuit' },
    seasonLabel: 'Saison',
    timeLabel: 'Lumière',
    languageLabel: 'Langue',
    buildings3d: '3D',
    zoomIn: 'Zoom avant',
    zoomOut: 'Zoom arrière',
    resetView: 'Réinitialiser la vue',
    legendTitle: 'La carte de 2010',
    legendRegion: 'Ottawa + Gatineau (région jouable)',
    legendOutside: 'Municipalités voisines',
    legendFields: 'Terres agricoles et champs (y compris les terrains bâtis après 2010)',
    legendNote: 'Reconstruite à partir des données actuelles. Ajoutez ?history=1 pour voir le développement après 2010.',
    mapStyle: 'Style de carte',
  },
};
