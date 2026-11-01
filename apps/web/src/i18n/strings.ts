import type { CatalogueClass, Confidence, Lang, NetworkStatus, RouteClass, Season, TimeOfDay } from '@otc/shared';

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
  // M2 — network, clock, inspector
  speed: string[];
  inService: string;
  networkStatus: Record<NetworkStatus, string>;
  verified: string;
  unverified: string;
  confidence: Record<Confidence, string>;
  vehicleGone: string;
  atStop: string;
  nextStop: string;
  schedule: string;
  station: string;
  stop: string;
  nextDepartures: string;
  noMoreToday: string;
  awaitingRoutes: string;
  routeClass: Record<RouteClass, string>;
  inServiceNow: string;
  tripsToday: string;
  length: string;
  weekdayService: string;
  every: string;
  directions: string;
  stopsWord: string;
  railCorridor: string;
  busway: string;
  close: string;
  legendTransitway: string;
  legendOTrain: string;
  legendStation: string;
  catalogueTitle: string;
  catalogueMapped: string;
  catalogueListed: string;
  catalogueListedLong: string;
  catalogueOnMap: string;
  catalogueSources: string;
  catalogueWayback: string;
  catalogueClass: Record<CatalogueClass, string>;
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
    speed: ['Pause', '1 min/s', '5 min/s', '15 min/s'],
    inService: 'in service',
    networkStatus: {
      'infrastructure-only': '2010 bus routes: awaiting archive access',
      'archive-reconstruction': '2010 network reconstructed from archives',
      gtfs: '2010 network from OC Transpo GTFS',
    },
    verified: 'Verified',
    unverified: 'Not yet verified',
    confidence: { high: 'high confidence', medium: 'medium confidence', low: 'low confidence' },
    vehicleGone: 'This vehicle has finished its trip.',
    atStop: 'At',
    nextStop: 'Next:',
    schedule: 'Schedule',
    station: 'Station',
    stop: 'Stop',
    nextDepartures: 'Next departures',
    noMoreToday: 'No more departures today.',
    awaitingRoutes: 'The 2010 bus routes on the Transitway will be loaded from archived OC Transpo sources (GTFS, system maps).',
    routeClass: { transitway: 'Transitway', otrain: 'O-Train', frequent: 'Frequent', local: 'Local', peak: 'Peak express', rural: 'Rural', sto: 'STO' },
    inServiceNow: 'in service now',
    tripsToday: 'trips today',
    length: 'length',
    weekdayService: 'Weekday service',
    every: 'every',
    directions: 'Directions',
    stopsWord: 'stops',
    railCorridor: 'Rail corridor',
    busway: 'Bus rapid transit corridor',
    close: 'Close',
    legendTransitway: 'Transitway (2010)',
    legendOTrain: 'O-Train · Bayview–Greenboro',
    legendStation: 'Station',
    catalogueTitle: 'The 2010 routes',
    catalogueMapped: 'routes on the map',
    catalogueListed: 'listed',
    catalogueListedLong: 'routes in the November 2010 tables (highlighted = on the map)',
    catalogueOnMap: 'On the map now',
    catalogueSources: 'Dated sources (Wikipedia revisions)',
    catalogueWayback: 'OC Transpo’s own 2010 timetable data (GTFS) is held by the Wayback Machine, which refuses connections from this build environment; the remaining routes need it or archived route maps.',
    catalogueClass: { regular: 'All-day', peak: 'Peak', express: 'Express', event: 'Events', rural: 'Rural partner', school: 'School', early: 'Early morning', interzone: 'Interzone', partner: 'Partner' },
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
    speed: ['Pause', '1 min/s', '5 min/s', '15 min/s'],
    inService: 'en service',
    networkStatus: {
      'infrastructure-only': 'Lignes d’autobus 2010 : en attente des archives',
      'archive-reconstruction': 'Réseau 2010 reconstitué à partir des archives',
      gtfs: 'Réseau 2010 tiré du GTFS d’OC Transpo',
    },
    verified: 'Vérifié',
    unverified: 'Pas encore vérifié',
    confidence: { high: 'confiance élevée', medium: 'confiance moyenne', low: 'confiance faible' },
    vehicleGone: 'Ce véhicule a terminé son trajet.',
    atStop: 'À',
    nextStop: 'Prochain arrêt :',
    schedule: 'Horaire',
    station: 'Station',
    stop: 'Arrêt',
    nextDepartures: 'Prochains départs',
    noMoreToday: 'Plus de départs aujourd’hui.',
    awaitingRoutes: 'Les lignes d’autobus de 2010 sur le Transitway seront chargées à partir des sources archivées d’OC Transpo (GTFS, plans du réseau).',
    routeClass: { transitway: 'Transitway', otrain: 'O-Train', frequent: 'Fréquent', local: 'Local', peak: 'Express de pointe', rural: 'Rural', sto: 'STO' },
    inServiceNow: 'en service',
    tripsToday: 'trajets aujourd’hui',
    length: 'longueur',
    weekdayService: 'Service en semaine',
    every: 'aux',
    directions: 'Directions',
    stopsWord: 'arrêts',
    railCorridor: 'Corridor ferroviaire',
    busway: 'Corridor de transport rapide par autobus',
    close: 'Fermer',
    legendTransitway: 'Transitway (2010)',
    legendOTrain: 'O-Train · Bayview–Greenboro',
    legendStation: 'Station',
    catalogueTitle: 'Les lignes de 2010',
    catalogueMapped: 'lignes sur la carte',
    catalogueListed: 'répertoriées',
    catalogueListedLong: 'lignes des tableaux de novembre 2010 (en surbrillance = sur la carte)',
    catalogueOnMap: 'Sur la carte',
    catalogueSources: 'Sources datées (révisions de Wikipédia)',
    catalogueWayback: 'Les données d’horaires 2010 d’OC Transpo (GTFS) sont conservées par la Wayback Machine, qui refuse les connexions de cet environnement ; les autres lignes en ont besoin, ou de plans archivés.',
    catalogueClass: { regular: 'Toute la journée', peak: 'Pointe', express: 'Express', event: 'Événements', rural: 'Partenaires ruraux', school: 'Scolaires', early: 'Tôt le matin', interzone: 'Interzones', partner: 'Partenaires' },
  },
};
