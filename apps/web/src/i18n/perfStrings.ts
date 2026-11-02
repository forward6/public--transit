// How a bus run, a route or a stop is doing: today against a typical day, yesterday, last week,
// riders per hour and what each rider costs (EN/FR).

export interface PerfStrings {
  title: string;
  run: string;
  typical: (day: string) => string;
  today: string;
  yesterday: (day: string) => string;
  lastWeek: (day: string) => string;
  vsTypical: (pct: string, up: boolean) => string;
  asTypical: string;
  notYet: string;
  dayKind: { weekday: (name: string) => string; saturday: string; sunday: string; holiday: string };
  perTrip: string;
  perHour: string;
  network: (x: string) => string;
  costPerRider: string;
  faresCover: string;
  busier: (pct: string) => string;
  rank: (n: number, of: string) => string;
  about: (n: string) => string;
  moreRoutes: (n: number) => string;
  departures: string;
  perDeparture: (x: string) => string;
  runRiders: string;
  runVsRoute: (pct: string, up: boolean, avg: string) => string;
  runFullest: (n: string, cap: string, pct: string, from: string, to: string) => string;
  runYesterday: string;
  runNotYesterday: string;
  routeToday: string;
  help: string;
  measuring: string;
}

export const PERF_EN: PerfStrings = {
  title: 'How it’s doing',
  run: 'This run',
  typical: (d) => `Riders on ${d}`,
  today: 'Expected today',
  yesterday: (d) => `Yesterday · ${d}`,
  lastWeek: (d) => `Same day last week · ${d}`,
  vsTypical: (p, up) => `${p} ${up ? 'above' : 'below'} typical`,
  asTypical: 'as typical',
  notYet: 'Not yet: days are recorded as they end.',
  dayKind: { weekday: (n) => `a typical ${n}`, saturday: 'a typical Saturday', sunday: 'a typical Sunday', holiday: 'a holiday (Sunday service)' },
  perTrip: 'Riders per trip',
  perHour: 'Riders per bus-hour',
  network: (x) => `network ${x}`,
  costPerRider: 'Cost per rider',
  faresCover: 'Fares cover',
  busier: (p) => `Busier than ${p} of stops`,
  rank: (n, of) => (n === 1 ? `The busiest of ${of} stops` : `The ${n}${n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : n % 10 === 1 && n !== 11 ? 'st' : 'th'} busiest of ${of} stops`),
  about: (n) => `about ${n}`,
  moreRoutes: (n) => `+${n} more`,
  departures: 'Departures today',
  perDeparture: (x) => `${x} boarding each`,
  runRiders: 'Riders on this run today',
  runVsRoute: (p, up, avg) => `${p} ${up ? 'more' : 'fewer'} than the route’s average run (${avg})`,
  runFullest: (n, cap, p, a, b) => `At its fullest ${n} on board of ${cap} places (${p}), ${a} → ${b}`,
  runYesterday: 'Yesterday on this run',
  runNotYesterday: 'didn’t run yesterday',
  routeToday: 'The route today',
  help: 'Estimated from the demand model, scaled to the season, the weather and the day of the week. Riders per bus-hour, cost and fares are for a weekday.',
  measuring: 'Counting riders on the network in operation…',
};

export const PERF_FR: PerfStrings = {
  title: 'Son rendement',
  run: 'Ce trajet',
  typical: (d) => `Usagers ${d}`,
  today: 'Prévu aujourd’hui',
  yesterday: (d) => `Hier · ${d}`,
  lastWeek: (d) => `Même jour la semaine passée · ${d}`,
  vsTypical: (p, up) => `${p} ${up ? 'au-dessus' : 'sous'} la normale`,
  asTypical: 'comme d’habitude',
  notYet: 'Pas encore : les jours sont comptés à leur fin.',
  dayKind: { weekday: (n) => `un ${n} typique`, saturday: 'un samedi typique', sunday: 'un dimanche typique', holiday: 'un jour férié (service du dimanche)' },
  perTrip: 'Usagers par trajet',
  perHour: 'Usagers par heure de service',
  network: (x) => `réseau ${x}`,
  costPerRider: 'Coût par usager',
  faresCover: 'Part payée par les tarifs',
  busier: (p) => `Plus achalandé que ${p} des arrêts`,
  rank: (n, of) => (n === 1 ? `Le plus achalandé de ${of} arrêts` : `Le ${n}e plus achalandé de ${of} arrêts`),
  about: (n) => `environ ${n}`,
  moreRoutes: (n) => `${n} de plus`,
  departures: 'Départs aujourd’hui',
  perDeparture: (x) => `${x} montées chacun`,
  runRiders: 'Usagers sur ce trajet aujourd’hui',
  runVsRoute: (p, up, avg) => `${p} de ${up ? 'plus' : 'moins'} que le trajet moyen de la ligne (${avg})`,
  runFullest: (n, cap, p, a, b) => `Au plus plein, ${n} à bord sur ${cap} places (${p}), ${a} → ${b}`,
  runYesterday: 'Hier sur ce trajet',
  runNotYesterday: 'ne roulait pas hier',
  routeToday: 'La ligne aujourd’hui',
  help: 'Estimé à partir du modèle de demande, ajusté à la saison, à la météo et au jour de la semaine. Usagers par heure, coût et tarifs : un jour de semaine.',
  measuring: 'Décompte des usagers sur le réseau en service…',
};
