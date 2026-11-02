// The Operations panel: the fleet and the network right now (EN/FR).

export interface OpsStrings {
  title: string;
  sub: (time: string) => string;
  inService: string;
  buses: (n: string) => string;
  trains: (n: string) => string;
  onBoard: string;
  capacityNow: string;
  load: (pct: string) => string;
  capacity: string;
  capacityBar: (now: string, max: string) => string;
  capacityHelp: string;
  fleet: string;
  owned: string;
  running: string;
  spare: string;
  shop: string;
  shopHelp: (pct: string) => string;
  onOrder: string;
  peakNeed: (need: string, spares: string) => string;
  short: (n: string) => string;
  enough: string;
  byType: string;
  age: (years: string) => string;
  trainsTitle: string;
  oTrain: string;
  of: (running: string, owned: string) => string;
  reliability: string;
  missed: (pct: string, trips: string) => string;
  backlog: (m: string) => string;
  noBacklog: string;
  avgAge: (y: string) => string;
  busiest: string;
  busiestHelp: string;
  none: string;
  day: string;
  dayHelp: (peak: string) => string;
  sto: (n: string) => string;
  measuring: string;
  open: string;
}

export const OPS_EN: OpsStrings = {
  title: 'Operations',
  sub: (t) => `Right now · ${t}`,
  inService: 'in service',
  buses: (n) => (n === '1' ? '1 bus' : `${n} buses`),
  trains: (n) => (n === '1' ? '1 train' : `${n} trains`),
  onBoard: 'riders on board',
  capacityNow: 'places in service',
  load: (p) => `${p} full`,
  capacity: 'Capacity',
  capacityBar: (now, max) => `${now} places running now, of ${max} in the whole fleet`,
  capacityHelp: 'Places: seated plus comfortable standing (40-ft bus 65, 60-ft 100, O-Train 260). Riders on board are estimated from the demand model for this time of day.',
  fleet: 'Buses',
  owned: 'Owned',
  running: 'Running',
  spare: 'Spare, at the garage',
  shop: 'In the shop',
  shopHelp: (p) => `${p} of the fleet is in for maintenance or broken down: about 7% normally, more with a maintenance backlog and older buses.`,
  onOrder: 'On order',
  peakNeed: (need, spares) => `The busiest moment needs ${need} buses, ${spares} with spares.`,
  short: (n) => `${n} short at the peak: trips are being missed.`,
  enough: 'Enough buses for the peak.',
  byType: 'By type',
  age: (y) => `${y} years old on average`,
  trainsTitle: 'Trains',
  oTrain: 'O-Train',
  of: (r, o) => `${r} running of ${o}`,
  reliability: 'Reliability',
  missed: (p, n) => `${p} of trips missed today (about ${n})`,
  backlog: (m) => `Maintenance backlog: ${m}`,
  noBacklog: 'No maintenance backlog',
  avgAge: (y) => `Buses ${y} years old on average`,
  busiest: 'Fullest right now',
  busiestHelp: 'Tap one to follow it.',
  none: 'Nothing running at this hour.',
  day: 'Through the day',
  dayHelp: (peak) => `Vehicles on the road over a weekday; the peak is ${peak}.`,
  sto: (n) => `STO (Gatineau): ${n} buses running`,
  measuring: 'Counting riders on the network in operation…',
  open: 'Operations',
};

export const OPS_FR: OpsStrings = {
  title: 'Exploitation',
  sub: (t) => `En ce moment · ${t}`,
  inService: 'en service',
  buses: (n) => `${n} autobus`,
  trains: (n) => (n === '1' ? '1 train' : `${n} trains`),
  onBoard: 'usagers à bord',
  capacityNow: 'places en service',
  load: (p) => `rempli à ${p}`,
  capacity: 'Capacité',
  capacityBar: (now, max) => `${now} places en circulation, sur ${max} pour toute la flotte`,
  capacityHelp: 'Places : assises et debout confortables (autobus de 40 pi : 65, de 60 pi : 100, O-Train : 260). Les usagers à bord sont estimés par le modèle de demande pour cette heure.',
  fleet: 'Autobus',
  owned: 'Flotte',
  running: 'En service',
  spare: 'En réserve au garage',
  shop: 'À l’atelier',
  shopHelp: (p) => `${p} de la flotte est à l’entretien ou en panne : environ 7 % normalement, davantage avec un retard d’entretien et des autobus plus vieux.`,
  onOrder: 'Commandés',
  peakNeed: (need, spares) => `Le moment le plus achalandé demande ${need} autobus, ${spares} avec la réserve.`,
  short: (n) => `Il en manque ${n} à la pointe : des voyages sont annulés.`,
  enough: 'Assez d’autobus pour la pointe.',
  byType: 'Par type',
  age: (y) => `${y} ans en moyenne`,
  trainsTitle: 'Trains',
  oTrain: 'O-Train',
  of: (r, o) => `${r} en service sur ${o}`,
  reliability: 'Fiabilité',
  missed: (p, n) => `${p} des voyages annulés aujourd’hui (environ ${n})`,
  backlog: (m) => `Retard d’entretien : ${m}`,
  noBacklog: 'Aucun retard d’entretien',
  avgAge: (y) => `Autobus de ${y} ans en moyenne`,
  busiest: 'Les plus remplis en ce moment',
  busiestHelp: 'Touchez-en un pour le suivre.',
  none: 'Rien ne circule à cette heure.',
  day: 'Au fil de la journée',
  dayHelp: (peak) => `Véhicules sur la route un jour de semaine; la pointe est de ${peak}.`,
  sto: (n) => `STO (Gatineau) : ${n} autobus en service`,
  measuring: 'Décompte des usagers sur le réseau en service…',
  open: 'Exploitation',
};
