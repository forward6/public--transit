import { GROWTH_EN, GROWTH_FR, type GrowthStrings } from './growthStrings';
import { PERF_EN, PERF_FR, type PerfStrings } from './perfStrings';
import { OPINION_EN, OPINION_FR, type OpinionStrings } from './opinionStrings';
import { LOAD_EN, LOAD_FR, type LoadStrings } from './loadStrings';
import { COUNCIL_EN, COUNCIL_FR, type CouncilStrings } from './councilStrings';
import { START_EN, START_FR, type StartStrings } from './startStrings';
import { PROJECTS_EN, PROJECTS_FR, type ProjectStrings } from './projectStrings';
import { OPS_EN, OPS_FR, type OpsStrings } from './opsStrings';
import type { CatalogueClass, Confidence, District, GameEventKind, Lang, NetworkStatus, PlanPeriodId, RouteClass, Season, TimeOfDay, TravelMode } from '@otc/shared';

export interface Strings {
  appName: string;
  appShort: string;
  subtitle: string;
  date: string;
  dateShort: string;
  season: Record<Season, string>;
  time: Record<TimeOfDay, string>;
  languageLabel: string;
  buildings3d: string;
  /** the settings menu (gear): language, 3D, main menu */
  settings: string;
  view3d: string;
  view3dHelp: string;
  mainMenu: string;
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
  variants: string;
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
  // M3 — people ride
  riders: string;
  ridersChip: (boardings: number) => string;
  ridershipTitle: string;
  ridershipSub: string;
  modelWeekday: string;
  tripsWeekday: string;
  byTransit: string;
  boardingsWeekday: string;
  modeName: Record<TravelMode, string>;
  howPeopleTravel: string;
  byAgency: string;
  avgTripTitle: string;
  avgTripText: (ivt: number, wait: number, walk: number, boardings: number) => string;
  byDistrict: string;
  districtName: Record<District, string>;
  calibrationTitle: string;
  targetWord: string;
  modelWord: string;
  estimatedTarget: string;
  ridershipNote: string;
  routeBoardings: string;
  stopBoardings: string;
  legendRiders: string;
  // M4 — design tools
  plan: string;
  planTitle: string;
  planHint: string;
  newRoute: string;
  travelTimes: string;
  evaluate: string;
  evaluating: string;
  undo: string;
  resetPlan: string;
  resetConfirm: string;
  done: string;
  cancel: string;
  finishRoute: string;
  drawHint: string;
  drawLoading: string;
  isoHint: string;
  isoLegend: string;
  changes: (n: number) => string;
  periodName: Record<PlanPeriodId, string>;
  noService: string;
  newRouteService: string;
  draftStats: (km: number, min: number, stops: number, reused: number) => string;
  serviceEditor: string;
  serviceNote: string;
  apply: string;
  removeRoute: string;
  removed: string;
  scorecard: string;
  scorecardSub: string;
  base2010: string;
  yourPlan: string;
  metric: Record<'boardings' | 'transitShare' | 'coverage' | 'coverageFrequent' | 'jobsIn45' | 'annualCost' | 'costPerBoarding' | 'peakVehicles', string>;
  stages: Record<string, string>;
  yourChanges: string;
  editLabel: (kind: 'add' | 'service' | 'remove', route: string) => string;
  newRouteRiders: string;
  byDistrictChange: string;
  scorecardNote: string;
  outdated: string;
  // M5 — money and fleet
  budgetTitle: string;
  reserveChip: (m: string) => string;
  decisionKicker: string;
  decisionTitle: Partial<Record<GameEventKind, string>>;
  budgetIntro: (last: string, balancing: string) => string;
  levyChange: string;
  fareChange: string;
  maintenanceFunding: string;
  projectedYear: (revenue: string, cost: string, balance: string) => string;
  levyWarning: string;
  maintenanceWarning: string;
  approveBudget: string;
  deficitIntro: (amount: string) => string;
  deficitChoice: Record<'levy' | 'cut' | 'defer' | 'borrow', { title: string; body: string }>;
  shortfallIntro: (required: number, buses: number) => string;
  shortfallChoice: { order: { title: string; body: (n: number, cost: string, date: string) => string }; cut: { title: string; body: string };
    accept: { title: string; body: (missed: string) => string } };
  news: Partial<Record<GameEventKind, (d: Record<string, number | string>, lang: Lang) => string>>;
  reserve: string;
  debt: string;
  levyThisYear: string;
  last12: (n: number) => string;
  lineFares: string;
  lineLevy: string;
  lineGasTax: string;
  lineOther: string;
  revenue: string;
  lineOperations: string;
  lineMaintenance: string;
  linePara: string;
  lineFixed: string;
  lineDebt: string;
  costs: string;
  balance: string;
  booksNote: (recovery: string, missed: string, backlog: string, projected: string) => string;
  levers: string;
  fleet: string;
  ageYears: (n: number) => string;
  buses: string;
  neededAtPeak: string;
  short: (n: number) => string;
  spare: (n: number) => string;
  garageSpace: string;
  free: (n: number) => string;
  moreOrders: (n: number) => string;
  busType: string;
  orderBuses: (n: number, cost: string, date: string) => string;
  buildGarage: (cost: string) => string;
  scheduledNote: (n: number, date: string) => string;
  schedulePlan: (date: string) => string;
  economyNote: string;
  restart: string;
  restartConfirm: string;
  // daily ridership
  ridersYesterday: (b: number) => string;
  ridersYesterdayShort: string;
  ridersWord: string;
  vsLastWeek: string;
  measuringNote: string;
  dailyTitle: string;
  dailyEmpty: string;
  dailyNote: string;
  holiday: string;
  holidayService: string;
  watchedRoutes: string;
  routeWord: string;
  yesterday: string;
  trend: string;
  settled: string;
  watchNote: string;
  sinceChange: (date: string) => string;
  expectedWeekday: (n: string) => string;
  lastWeek: (total: string) => string;
  // M6 — opinion and media
  op: OpinionStrings;
  // where the load is
  ld: LoadStrings;
  // M7 — council, elections and partners
  co: CouncilStrings;
  // the start screen
  st: StartStrings;
  // M8 — rapid-transit lines
  pj: ProjectStrings;
  gr: GrowthStrings;
  pf: PerfStrings;
  // the Operations panel
  ops: OpsStrings;
}

/** 512340 -> "512k", 8450 -> "8.5k" */
export function fmtK(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`;
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
    languageLabel: 'Language',
    buildings3d: '3D',
    settings: 'Settings',
    view3d: '3D buildings and terrain',
    view3dHelp: 'Turn off for a flat map that runs faster on older devices.',
    mainMenu: 'Main menu',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    resetView: 'Reset view',
    legendTitle: 'The 2010 map',
    legendRegion: 'Ottawa + Gatineau (playable region)',
    legendOutside: 'Neighbouring municipalities',
    legendFields: 'Farmland & fields (incl. land built on after 2010)',
    legendNote: 'Reconstructed from today’s map data. Add ?history=1 to hatch post-2010 development.',
    mapStyle: 'Map style',
    speed: ['Pause', 'Real time', '1 min per second', '15 min per second', '2 hours per second', '1 day per second'],
    inService: 'in service',
    networkStatus: {
      'infrastructure-only': '2010 bus routes: awaiting archive access',
      'archive-reconstruction': '2010 network reconstructed from archives',
      gtfs: 'Network from archived OC Transpo timetables',
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
    routeClass: { transitway: 'Transitway', otrain: 'O-Train', frequent: 'Frequent', local: 'Local', peak: 'Peak express', rural: 'Rural', sto: 'STO', commuter: 'Commuter rail', streetcar: 'Streetcar' },
    inServiceNow: 'in service now',
    tripsToday: 'trips today',
    length: 'length',
    weekdayService: 'Weekday service',
    every: 'every',
    directions: 'Directions',
    variants: 'variants',
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
    budgetTitle: 'Budget & fleet',
    reserveChip: (m) => `Reserve ${m}`,
    decisionKicker: 'Decision needed',
    decisionTitle: { budget: 'The {year} budget', deficit: 'The reserve has run dry', shortfall: 'Not enough buses' },
    budgetIntro: (last, bal) => `Council sets the transit levy for the year (now ${last}). A balanced budget needs ${bal}. Fares and maintenance are yours to propose.`,
    levyChange: 'Transit levy',
    fareChange: 'Fares',
    maintenanceFunding: 'Maintenance funding',
    projectedYear: (r, c, b) => `Next 12 months: revenue ${r}, costs ${c}, balance ${b}`,
    levyWarning: 'Council and ratepayers will notice a levy increase above 3% (politics arrive in M7).',
    maintenanceWarning: 'Underfunded maintenance builds a backlog: more breakdowns and missed trips.',
    approveBudget: 'Send to council',
    deficitIntro: (a) => `The operating reserve is ${a} short. Council wants it fixed before the auditor's report.`,
    deficitChoice: {
      levy: { title: 'Raise the levy mid-year', body: 'Recovers the gap (plus 10%) over the next 12 months. Ratepayers won’t like it.' },
      cut: { title: 'Cut service 8%', body: 'Fewer bus-hours from next month; riders and fares drop too.' },
      defer: { title: 'Defer maintenance', body: 'Maintenance at 75%: cheaper now, a growing backlog and breakdowns later.' },
      borrow: { title: 'Borrow', body: 'Covers the gap at once; debt service grows for 20 years.' },
    },
    shortfallIntro: (req, b) => `The peak now needs ${req} buses with spares, and you have ${b}. Trips are being missed.`,
    shortfallChoice: {
      order: { title: 'Order buses', body: (n, c, d) => `${n} articulated buses, ${c}, delivered ${d} (if a garage has room).` },
      cut: { title: 'Cut peak service to fit', body: 'Thin the timetable to the buses you have; riders drop.' },
      accept: { title: 'Run short', body: (m) => `Keep the timetable and miss trips (${m} of trips now).` },
    },
    news: {
      welcome: () => 'You chair the Transit Commission. First task: the 2011 budget.',
      delivery: (d) => (d.held ? `${d.count} × ${d.model} held at the factory: no garage space` : `${d.count} new ${d.model} delivered`),
      serviceChange: (d) => `Service change: your plan (${d.changes} changes) is now running`,
      garageOpen: (d) => `${d.name} opens: ${d.capacity} more bus places`,
      retirement: (d) => `${d.count} old buses retired`,
      rezoned: (d) => GROWTH_EN.rezonedNews(String(d.station), Number(d.homes).toLocaleString('en-CA'), Number(d.passed) === 1),
    },
    reserve: 'Operating reserve',
    debt: 'Debt',
    levyThisYear: 'Levy this year',
    last12: (n) => (n >= 12 ? 'The last 12 months' : `Since December 2010 (${n} months)`),
    lineFares: 'Fares',
    lineLevy: 'Transit levy',
    lineGasTax: 'Provincial gas tax',
    lineOther: 'Advertising and other',
    revenue: 'Revenue',
    lineOperations: 'Operations (drivers, fuel)',
    lineMaintenance: 'Maintenance',
    linePara: 'Para Transpo',
    lineFixed: 'Administration and facilities',
    lineDebt: 'Debt service',
    costs: 'Costs',
    balance: 'Balance',
    booksNote: (rec, missed, backlog, proj) => `Fares cover ${rec} of costs · ${missed} of trips missed · maintenance backlog ${backlog} · next 12 months at today’s settings: ${proj}.`,
    levers: 'Levers',
    fleet: 'Fleet',
    ageYears: (n) => `${n.toFixed(1)} yrs`,
    buses: 'Buses',
    neededAtPeak: 'Needed at the peak (with spares)',
    short: (n) => `${n} short`,
    spare: (n) => `${n} to spare`,
    garageSpace: 'Garage places',
    free: (n) => `${n} free`,
    moreOrders: (n) => `and ${n} more deliveries`,
    busType: 'Bus type',
    orderBuses: (n, c, d) => `Order ${n} · ${c} · ${d}`,
    buildGarage: (c) => `Build a 250-bus garage · ${c}`,
    scheduledNote: (n, d) => `${n} planned changes take effect at the service change on ${d}. `,
    schedulePlan: (d) => `Schedule for ${d}`,
    economyNote: 'The fleet and fares are from 2010 sources; most budget lines are estimates, each with its source in the game data. Ridership comes from the demand model.',
    restart: 'New game',
    restartConfirm: 'Start a new campaign from 1 December 2010? This game will be lost.',
    ridersYesterday: (b) => `${fmtK(b)} riders yesterday`,
    ridersYesterdayShort: 'riders yesterday',
    ridersWord: 'riders',
    vsLastWeek: 'Change from the same day last week',
    measuringNote: 'The demand model is measuring your plan…',
    dailyTitle: 'Riders day by day',
    dailyEmpty: 'The chart fills in as the days pass. Speed the clock up to 1 day per second to watch weeks go by.',
    dailyNote: 'OC Transpo boardings each day over the last twelve weeks. Weekends and holidays are lighter. Dashed lines mark service changes: riders take a few weeks to discover new service, and leave within days when it is cut.',
    holiday: 'holiday',
    holidayService: 'Holiday · Sunday service',
    watchedRoutes: 'Routes to watch after your changes',
    routeWord: 'Route',
    yesterday: 'Yesterday',
    trend: 'Weekdays',
    settled: 'Settled',
    watchNote: 'The routes each change touched, and the ones it took riders from or brought riders to. “Settled” is how far riders have moved towards the new level the demand model expects.',
    sinceChange: (d) => `Riders since the change of ${d}`,
    expectedWeekday: (n) => `heading for ${n} a weekday`,
    lastWeek: (total) => `${total} riders in the last 7 days`,
    op: OPINION_EN,
    ld: LOAD_EN,
    co: COUNCIL_EN,
    st: START_EN,
    pj: PROJECTS_EN,
    gr: GROWTH_EN,
    pf: PERF_EN,
    ops: OPS_EN,
    plan: 'Plan',
    planTitle: 'Plan mode',
    planHint: 'The clock is paused. Tap a route to change its service, draw a new one, or see travel times.',
    newRoute: 'New route',
    travelTimes: 'Travel times',
    evaluate: 'Evaluate',
    evaluating: 'Evaluating',
    undo: 'Undo',
    resetPlan: 'Reset',
    resetConfirm: 'Discard every change in this plan?',
    done: 'Done',
    cancel: 'Cancel',
    finishRoute: 'Add route',
    drawHint: 'Tap the map to add points; the route follows the streets and gets stops every ~400 m.',
    drawLoading: 'Loading the street map…',
    isoHint: 'Tap anywhere: how far can you get by transit, leaving at 8:00?',
    isoLegend: 'By transit from the dot, leaving 8:00',
    changes: (n) => (n === 1 ? '1 change' : `${n} changes`),
    periodName: { am: 'Morning peak', midday: 'Midday', pm: 'Afternoon peak', evening: 'Evening' },
    noService: 'no service',
    newRouteService: 'Service',
    draftStats: (km, min, stops, reused) => `${km.toFixed(1)} km · ${Math.round(min)} min · ${stops} stops (${reused} shared)`,
    serviceEditor: 'Plan this route’s service',
    serviceNote: 'Changing service runs the route’s main pattern each way at these headways.',
    apply: 'Apply',
    removeRoute: 'Remove route',
    removed: 'Removed',
    scorecard: 'Scorecard',
    scorecardSub: 'Your plan against the 2010 network, on a 2011 weekday',
    base2010: '2010',
    yourPlan: 'Plan',
    metric: {
      boardings: 'Boardings a weekday', transitShare: 'Transit share of trips', coverage: 'Residents near a stop (400 m)',
      coverageFrequent: 'Near frequent service', jobsIn45: 'Jobs within 45 min (avg.)', annualCost: 'Operating cost a year',
      costPerBoarding: 'Cost per boarding', peakVehicles: 'Buses at the peak',
    },
    stages: { load: 'Loading data', 'baseline-skims': 'Measuring 2010 travel times', 'baseline-model': 'Modelling 2010 trips',
      'baseline-assign': 'Loading 2010 riders', skims: 'Measuring travel times', model: 'Modelling trips', assign: 'Loading riders', score: 'Scoring' },
    yourChanges: 'Your changes',
    editLabel: (kind, route) => (kind === 'add' ? `New route ${route}` : kind === 'remove' ? `Removed ${route}` : `New service on ${route}`),
    newRouteRiders: 'riders a weekday',
    byDistrictChange: 'Transit share by where people live',
    scorecardNote: 'Approximate: the same demand model as the Ridership panel, run with fewer departure times so it fits in seconds. Costs use about $115 per bus-hour (estimate).',
    outdated: 'The plan changed since this result. Evaluate again.',
    riders: 'Riders',
    ridersChip: (b) => `${fmtK(b)} boardings a weekday`,
    ridershipTitle: 'Ridership',
    ridershipSub: 'Demand model v1 · residents of Ottawa and Gatineau',
    modelWeekday: 'Who rides: the 2011 weekday in the demand model',
    tripsWeekday: 'trips a weekday',
    byTransit: 'by transit',
    boardingsWeekday: 'boardings a weekday',
    modeName: { car: 'Car (driver)', passenger: 'Car (passenger)', transit: 'Transit', walk: 'Walk', bike: 'Bike' },
    howPeopleTravel: 'How people travel',
    byAgency: 'Boardings by agency',
    avgTripTitle: 'The average transit trip',
    avgTripText: (ivt, wait, walk, b) => `${ivt} min on board, ${wait} min waiting, ${walk} min walking · ${b} boardings`,
    byDistrict: 'Transit share, by where people live',
    districtName: { downtown: 'Downtown', inner: 'Inside the Greenbelt', suburbs: 'Suburbs', rural: 'Rural Ottawa', hull: 'Hull', gatineau: 'Rest of Gatineau' },
    calibrationTitle: 'Calibration against 2011',
    targetWord: 'target',
    modelWord: 'model',
    estimatedTarget: 'target estimated',
    ridershipNote: 'Approximate by design: zones, residents and jobs are placed from the 2010 buildings and scaled to the 2011 census; some targets are estimates. Each row says where its number comes from.',
    routeBoardings: 'boardings a weekday (model)',
    stopBoardings: 'boardings a weekday here (model)',
    legendRiders: 'Riders view: lines widen with weekday riders; dots show how much residents use transit',
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
    languageLabel: 'Langue',
    buildings3d: '3D',
    settings: 'Réglages',
    view3d: 'Bâtiments et relief en 3D',
    view3dHelp: 'Désactivez pour une carte à plat, plus fluide sur les appareils plus anciens.',
    mainMenu: 'Menu principal',
    zoomIn: 'Zoom avant',
    zoomOut: 'Zoom arrière',
    resetView: 'Réinitialiser la vue',
    legendTitle: 'La carte de 2010',
    legendRegion: 'Ottawa + Gatineau (région jouable)',
    legendOutside: 'Municipalités voisines',
    legendFields: 'Terres agricoles et champs (y compris les terrains bâtis après 2010)',
    legendNote: 'Reconstruite à partir des données actuelles. Ajoutez ?history=1 pour voir le développement après 2010.',
    mapStyle: 'Style de carte',
    speed: ['Pause', 'Temps réel', '1 min par seconde', '15 min par seconde', '2 heures par seconde', '1 jour par seconde'],
    inService: 'en service',
    networkStatus: {
      'infrastructure-only': 'Lignes d’autobus 2010 : en attente des archives',
      'archive-reconstruction': 'Réseau 2010 reconstitué à partir des archives',
      gtfs: 'Réseau tiré des horaires archivés d’OC Transpo',
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
    routeClass: { transitway: 'Transitway', otrain: 'O-Train', frequent: 'Fréquent', local: 'Local', peak: 'Express de pointe', rural: 'Rural', sto: 'STO', commuter: 'Train de banlieue', streetcar: 'Tramway' },
    inServiceNow: 'en service',
    tripsToday: 'trajets aujourd’hui',
    length: 'longueur',
    weekdayService: 'Service en semaine',
    every: 'aux',
    directions: 'Directions',
    variants: 'variantes',
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
    budgetTitle: 'Budget et parc',
    reserveChip: (m) => `Réserve ${m}`,
    decisionKicker: 'Décision requise',
    decisionTitle: { budget: 'Le budget {year}', deficit: 'La réserve est à sec', shortfall: 'Pas assez d’autobus' },
    budgetIntro: (last, bal) => `Le conseil fixe la taxe de transport en commun pour l’année (actuellement ${last}). Un budget équilibré exige ${bal}. Vous proposez les tarifs et l’entretien.`,
    levyChange: 'Taxe de transport',
    fareChange: 'Tarifs',
    maintenanceFunding: 'Financement de l’entretien',
    projectedYear: (r, c, b) => `12 prochains mois : revenus ${r}, coûts ${c}, solde ${b}`,
    levyWarning: 'Le conseil et les contribuables remarqueront une hausse de la taxe de plus de 3 % (la politique arrive au jalon M7).',
    maintenanceWarning: 'Un entretien sous-financé crée un arriéré : plus de pannes et de trajets annulés.',
    approveBudget: 'Soumettre au conseil',
    deficitIntro: (a) => `Il manque ${a} à la réserve de fonctionnement. Le conseil veut que ce soit réglé avant le rapport du vérificateur.`,
    deficitChoice: {
      levy: { title: 'Hausser la taxe en cours d’année', body: 'Récupère l’écart (plus 10 %) sur les 12 prochains mois. Les contribuables n’aimeront pas.' },
      cut: { title: 'Réduire le service de 8 %', body: 'Moins d’heures-autobus dès le mois prochain; l’achalandage et les recettes baissent aussi.' },
      defer: { title: 'Reporter l’entretien', body: 'Entretien à 75 % : moins cher maintenant, un arriéré et des pannes plus tard.' },
      borrow: { title: 'Emprunter', body: 'Couvre l’écart tout de suite; le service de la dette augmente pendant 20 ans.' },
    },
    shortfallIntro: (req, b) => `La pointe exige maintenant ${req} autobus avec la réserve, et vous en avez ${b}. Des trajets sont annulés.`,
    shortfallChoice: {
      order: { title: 'Commander des autobus', body: (n, c, d) => `${n} autobus articulés, ${c}, livrés en ${d} (s’il y a de la place au garage).` },
      cut: { title: 'Réduire le service de pointe', body: 'Alléger l’horaire selon les autobus disponibles; l’achalandage baisse.' },
      accept: { title: 'Rouler à court d’autobus', body: (m) => `Garder l’horaire et annuler des trajets (${m} des trajets actuellement).` },
    },
    news: {
      welcome: () => 'Vous présidez la Commission du transport en commun. Première tâche : le budget 2011.',
      delivery: (d) => (d.held ? `${d.count} × ${d.model} retenus à l’usine : pas de place au garage` : `${d.count} nouveaux ${d.model} livrés`),
      serviceChange: (d) => `Changement de service : votre plan (${d.changes} changements) est en vigueur`,
      garageOpen: (d) => `${d.name} ouvre : ${d.capacity} places de plus`,
      retirement: (d) => `${d.count} vieux autobus retirés`,
      rezoned: (d) => GROWTH_FR.rezonedNews(String(d.station), Number(d.homes).toLocaleString('fr-CA'), Number(d.passed) === 1),
    },
    reserve: 'Réserve de fonctionnement',
    debt: 'Dette',
    levyThisYear: 'Taxe cette année',
    last12: (n) => (n >= 12 ? 'Les 12 derniers mois' : `Depuis décembre 2010 (${n} mois)`),
    lineFares: 'Tarifs',
    lineLevy: 'Taxe de transport',
    lineGasTax: 'Taxe provinciale sur l’essence',
    lineOther: 'Publicité et autres',
    revenue: 'Revenus',
    lineOperations: 'Exploitation (chauffeurs, carburant)',
    lineMaintenance: 'Entretien',
    linePara: 'Para Transpo',
    lineFixed: 'Administration et installations',
    lineDebt: 'Service de la dette',
    costs: 'Coûts',
    balance: 'Solde',
    booksNote: (rec, missed, backlog, proj) => `Les tarifs couvrent ${rec} des coûts · ${missed} des trajets annulés · arriéré d’entretien ${backlog} · 12 prochains mois aux réglages actuels : ${proj}.`,
    levers: 'Leviers',
    fleet: 'Parc d’autobus',
    ageYears: (n) => `${n.toFixed(1).replace('.', ',')} ans`,
    buses: 'Autobus',
    neededAtPeak: 'Requis en pointe (avec réserve)',
    short: (n) => `${n} manquants`,
    spare: (n) => `${n} en surplus`,
    garageSpace: 'Places au garage',
    free: (n) => `${n} libres`,
    moreOrders: (n) => `et ${n} autres livraisons`,
    busType: 'Type d’autobus',
    orderBuses: (n, c, d) => `Commander ${n} · ${c} · ${d}`,
    buildGarage: (c) => `Construire un garage de 250 autobus · ${c}`,
    scheduledNote: (n, d) => `${n} changements prévus entrent en vigueur au changement de service du ${d}. `,
    schedulePlan: (d) => `Planifier pour le ${d}`,
    economyNote: 'Le parc et les tarifs proviennent de sources de 2010; la plupart des postes budgétaires sont des estimations, chacune avec sa source dans les données du jeu. L’achalandage vient du modèle de demande.',
    restart: 'Nouvelle partie',
    restartConfirm: 'Commencer une nouvelle campagne au 1er décembre 2010? Cette partie sera perdue.',
    ridersYesterday: (b) => `${fmtK(b)} passagers hier`,
    ridersYesterdayShort: 'passagers hier',
    ridersWord: 'passagers',
    vsLastWeek: 'Variation par rapport au même jour la semaine dernière',
    measuringNote: 'Le modèle de demande mesure votre plan…',
    dailyTitle: 'Achalandage jour par jour',
    dailyEmpty: 'Le graphique se remplit à mesure que les jours passent. Réglez l’horloge à 1 jour par seconde pour voir défiler les semaines.',
    dailyNote: 'Montées à OC Transpo chaque jour, sur les douze dernières semaines. Les fins de semaine et les jours fériés sont plus calmes. Les lignes pointillées marquent les changements de service : les usagers mettent quelques semaines à découvrir un nouveau service et partent en quelques jours lorsqu’il est réduit.',
    holiday: 'férié',
    holidayService: 'Férié · service du dimanche',
    watchedRoutes: 'Lignes à suivre après vos changements',
    routeWord: 'Ligne',
    yesterday: 'Hier',
    trend: 'Semaine',
    settled: 'Atteint',
    watchNote: 'Les lignes touchées par chaque changement, et celles qui ont perdu ou gagné des usagers. « Atteint » indique où en sont les usagers par rapport au nouveau niveau prévu par le modèle de demande.',
    sinceChange: (d) => `Achalandage depuis le changement du ${d}`,
    expectedWeekday: (n) => `en route vers ${n} par jour de semaine`,
    lastWeek: (total) => `${total} passagers ces 7 derniers jours`,
    op: OPINION_FR,
    ld: LOAD_FR,
    co: COUNCIL_FR,
    st: START_FR,
    pj: PROJECTS_FR,
    gr: GROWTH_FR,
    pf: PERF_FR,
    ops: OPS_FR,
    plan: 'Planifier',
    planTitle: 'Mode planification',
    planHint: 'L’horloge est en pause. Touchez une ligne pour changer son service, tracez-en une nouvelle ou voyez les temps de trajet.',
    newRoute: 'Nouvelle ligne',
    travelTimes: 'Temps de trajet',
    evaluate: 'Évaluer',
    evaluating: 'Évaluation',
    undo: 'Annuler',
    resetPlan: 'Réinitialiser',
    resetConfirm: 'Abandonner tous les changements de ce plan?',
    done: 'Terminé',
    cancel: 'Annuler',
    finishRoute: 'Ajouter la ligne',
    drawHint: 'Touchez la carte pour ajouter des points; la ligne suit les rues et reçoit un arrêt aux ~400 m.',
    drawLoading: 'Chargement du réseau de rues…',
    isoHint: 'Touchez n’importe où : jusqu’où peut-on aller en transport collectif en partant à 8 h?',
    isoLegend: 'En transport collectif depuis le point, départ 8 h',
    changes: (n) => (n === 1 ? '1 changement' : `${n} changements`),
    periodName: { am: 'Pointe du matin', midday: 'Midi', pm: 'Pointe de l’après-midi', evening: 'Soirée' },
    noService: 'aucun service',
    newRouteService: 'Service',
    draftStats: (km, min, stops, reused) => `${km.toFixed(1)} km · ${Math.round(min)} min · ${stops} arrêts (${reused} partagés)`,
    serviceEditor: 'Planifier le service de cette ligne',
    serviceNote: 'Changer le service fait rouler le tracé principal dans chaque sens à ces intervalles.',
    apply: 'Appliquer',
    removeRoute: 'Retirer la ligne',
    removed: 'Retirée',
    scorecard: 'Bulletin',
    scorecardSub: 'Votre plan comparé au réseau de 2010, un jour de semaine de 2011',
    base2010: '2010',
    yourPlan: 'Plan',
    metric: {
      boardings: 'Montées par jour de semaine', transitShare: 'Part du transport collectif', coverage: 'Résidents près d’un arrêt (400 m)',
      coverageFrequent: 'Près d’un service fréquent', jobsIn45: 'Emplois à moins de 45 min (moy.)', annualCost: 'Coût d’exploitation annuel',
      costPerBoarding: 'Coût par montée', peakVehicles: 'Autobus en pointe',
    },
    stages: { load: 'Chargement des données', 'baseline-skims': 'Temps de trajet de 2010', 'baseline-model': 'Déplacements de 2010',
      'baseline-assign': 'Achalandage de 2010', skims: 'Temps de trajet', model: 'Déplacements', assign: 'Achalandage', score: 'Bulletin' },
    yourChanges: 'Vos changements',
    editLabel: (kind, route) => (kind === 'add' ? `Nouvelle ligne ${route}` : kind === 'remove' ? `Ligne ${route} retirée` : `Nouveau service, ligne ${route}`),
    newRouteRiders: 'usagers par jour de semaine',
    byDistrictChange: 'Part du transport collectif selon le lieu de résidence',
    scorecardNote: 'Approximatif : le même modèle de demande que le panneau Achalandage, avec moins d’heures de départ pour tenir en quelques secondes. Les coûts supposent environ 115 $ par heure-autobus (estimation).',
    outdated: 'Le plan a changé depuis ce résultat. Évaluez de nouveau.',
    riders: 'Achalandage',
    ridersChip: (b) => `${fmtK(b)} montées par jour de semaine`,
    ridershipTitle: 'Achalandage',
    ridershipSub: 'Modèle de demande v1 · résidents d’Ottawa et de Gatineau',
    modelWeekday: 'Qui se déplace : le jour de semaine 2011 du modèle de demande',
    tripsWeekday: 'déplacements par jour',
    byTransit: 'en transport collectif',
    boardingsWeekday: 'montées par jour de semaine',
    modeName: { car: 'Auto (conducteur)', passenger: 'Auto (passager)', transit: 'Transport collectif', walk: 'Marche', bike: 'Vélo' },
    howPeopleTravel: 'Comment les gens se déplacent',
    byAgency: 'Montées par société',
    avgTripTitle: 'Le déplacement moyen en transport collectif',
    avgTripText: (ivt, wait, walk, b) => `${ivt} min à bord, ${wait} min d’attente, ${walk} min de marche · ${b} montées`,
    byDistrict: 'Part du transport collectif, selon le lieu de résidence',
    districtName: { downtown: 'Centre-ville', inner: 'Dans la Ceinture de verdure', suburbs: 'Banlieues', rural: 'Ottawa rural', hull: 'Hull', gatineau: 'Reste de Gatineau' },
    calibrationTitle: 'Calage sur 2011',
    targetWord: 'cible',
    modelWord: 'modèle',
    estimatedTarget: 'cible estimée',
    ridershipNote: 'Approximatif par conception : zones, résidents et emplois sont placés d’après les bâtiments de 2010 et calés sur le recensement de 2011; certaines cibles sont des estimations. Chaque ligne indique la source de son chiffre.',
    routeBoardings: 'montées par jour de semaine (modèle)',
    stopBoardings: 'montées par jour de semaine ici (modèle)',
    legendRiders: 'Vue achalandage : les lignes s’élargissent selon l’achalandage; les points montrent l’usage du transport collectif par les résidents',
    catalogueClass: { regular: 'Toute la journée', peak: 'Pointe', express: 'Express', event: 'Événements', rural: 'Partenaires ruraux', school: 'Scolaires', early: 'Tôt le matin', interzone: 'Interzones', partner: 'Partenaires' },
  },
};
