// M9: growth (the Growth view, panel and zone panel, developers' offers) and the month in review (EN/FR).
import type { GrowthPlace, RezoningStatus } from '@otc/shared';

export interface GrowthStrings {
  toggle: string;
  title: string;
  sub: string;
  residents: string;
  jobs: string;
  ridersFromGrowth: string;
  since2010: (x: string) => string;
  whereTitle: string;
  place: Record<GrowthPlace, string>;
  monthsTitle: string;
  monthsHelp: string;
  topTitle: string;
  topNone: string;
  offersTitle: string;
  offersNone: string;
  offer: (homes: string, station: string) => string;
  status: Record<RezoningStatus, string>;
  lost: (n: string) => string;
  howTitle: string;
  how: string[];
  legend: string;
  legendLost: string;
  legendLow: string;
  legendHigh: string;
  /** the zone panel */
  zoneSub: (district: string) => string;
  district: Record<string, string>;
  then: string;
  now: string;
  roomLeft: string;
  roomHomes: (n: string) => string;
  transitReach: string;
  carReach: string;
  reachHelp: string;
  station: (name: string, m: string) => string;
  noStation: string;
  building: string;
  rezoned: (homes: string) => string;
  why: { full: string; room: string; transit: string; building: string; quiet: string; station: string };
  near: (place: string) => string;
  /** a developer's offer */
  devTitle: (station: string) => string;
  devIntro: (homes: string, jobs: string, station: string) => string;
  devNewLine: string;
  devCharges: (m: string) => string;
  devWard: (ward: string) => string;
  devBack: { title: string; body: string };
  devDecline: { title: string; body: string };
  rezonedNews: (station: string, homes: string, passed: boolean) => string;
  /** the month in review */
  skip: string;
  skipShort: string;
  skipHelp: string;
  reviewTitle: (when: string) => string;
  reviewPartial: (days: number) => string;
  reviewStopped: string;
  rRiders: string;
  rApproval: string;
  rReserve: string;
  rCapital: string;
  rCapitalPC: string;
  rResidents: string;
  rJobs: string;
  rGrowthRiders: string;
  rWhere: (station: string, edge: string) => string;
  rNews: string;
  rNoNews: string;
  again: string;
  close: string;
  openGrowth: string;
}

export const GROWTH_EN: GrowthStrings = {
  toggle: 'Growth',
  title: 'Growth',
  sub: 'Where new residents and jobs have gone since December 2010',
  residents: 'residents',
  jobs: 'jobs',
  ridersFromGrowth: 'riders from growth',
  since2010: (x) => `${x} since 2010`,
  whereTitle: 'Where new residents went',
  place: { station: 'Near a rapid-transit station', core: 'The core (infill)', suburbs: 'The suburban edge', gatineau: 'Gatineau', rural: 'Villages and rural' },
  monthsTitle: 'Month by month',
  monthsHelp: 'New residents each month; the darker part settled within a walk of a rapid-transit station.',
  topTitle: 'Growing fastest this year',
  topNone: 'No growth recorded yet: it is counted at the end of each month.',
  offersTitle: 'Developers’ offers',
  offersNone: 'None yet. Developers offer to build near stations, more often near a new line’s.',
  offer: (h, st) => `${h} homes at ${st}`,
  status: { offered: 'waiting for you', council: 'before council', approved: 'rezoned', refused: 'refused by council', declined: 'turned down' },
  lost: (n) => `${n} jobs lost by businesses beside construction sites`,
  howTitle: 'What draws growth',
  how: [
    'People and employers go where they can reach jobs, customers and workers: by car, and by transit on the network running now.',
    'They can only build where there is room. The suburban edge has plenty; the core redevelops slowly as of right, a little faster where transit has improved.',
    'Near rapid-transit stations developers pay a premium, more for a new line’s, but only where the land is zoned for it: rezoning (a council vote) is what unlocks it.',
    'A street torn up for construction holds homes back and drives some businesses away while it lasts. A new line that is no faster than the bus it replaces adds little reach, so it draws little growth.',
  ],
  legend: 'New residents and jobs since 2010, per km²',
  legendLost: 'Fewer jobs (construction)',
  legendLow: 'a few',
  legendHigh: 'many',
  zoneSub: (d) => `${d} · growth since December 2010`,
  district: { downtown: 'Downtown', inner: 'Inner city', suburbs: 'Suburbs', rural: 'Rural', hull: 'Hull', gatineau: 'Gatineau' },
  then: 'Dec 2010',
  now: 'Now',
  roomLeft: 'Room left to build',
  roomHomes: (n) => `about ${n} homes`,
  transitReach: 'Jobs within 45 min by transit',
  carReach: 'Jobs within 30 min by car',
  reachHelp: 'At the morning peak, on the network running now.',
  station: (name, m) => `${name} station, ${m} away`,
  noStation: 'No rapid-transit station within a walk',
  building: 'Beside a construction site: homes wait and some businesses close until it’s done.',
  rezoned: (h) => `Rezoned for ${h} more homes`,
  why: {
    full: 'Built out: no room to build without rezoning, however good the transit.',
    room: 'Room to build, and good reach by car: subdivisions fill it.',
    transit: 'Transit makes it easy to reach jobs from here: it draws growth where there is room.',
    building: 'Construction next door is holding growth back.',
    quiet: 'Little reach by transit or car, and little room: it grows slowly.',
    station: 'Near a station: developers pay more here, where the zoning allows.',
  },
  near: (p) => `near ${p}`,
  devTitle: (st) => `A developer’s offer at ${st}`,
  devIntro: (h, j, st) => `A developer offers to build ${h} homes and space for ${j} jobs within a walk of ${st} station, if council rezones the land.`,
  devNewLine: 'They are buying ahead of the new line.',
  devCharges: (m) => `Development charges for transit: ${m}`,
  devWard: (w) => `The ward councillor (${w}) will hear from the neighbours.`,
  devBack: { title: 'Back it', body: 'Put the rezoning to council. Homes near transit bring riders; the neighbours may object.' },
  devDecline: { title: 'Turn it down', body: 'The land stays as it is; the growth goes elsewhere, likely the suburban edge.' },
  rezonedNews: (st, h, p) => (p ? `Council rezones land at ${st} for ${h} homes` : `Council refuses the rezoning at ${st}`),
  skip: 'Skip a month',
  skipShort: '+1 month',
  skipHelp: 'Play the rest of the month at once, then see what changed',
  reviewTitle: (w) => `The month in review · ${w}`,
  reviewPartial: (d) => (d === 1 ? '1 day played' : `${d} days played`),
  reviewStopped: 'A decision is waiting: close this to answer it.',
  rRiders: 'Weekday riders (this month’s level)',
  rApproval: 'Approval',
  rReserve: 'Operating reserve',
  rCapital: 'Capital reserve',
  rCapitalPC: 'Political Capital',
  rResidents: 'New residents',
  rJobs: 'New jobs',
  rGrowthRiders: 'Riders from growth',
  rWhere: (st, edge) => `${st} near rapid transit, ${edge} on the suburban edge`,
  rNews: 'What happened',
  rNoNews: 'A quiet month.',
  again: 'Another month',
  close: 'Close',
  openGrowth: 'See where it grew',
};

export const GROWTH_FR: GrowthStrings = {
  toggle: 'Croissance',
  title: 'Croissance',
  sub: 'Où se sont installés les nouveaux résidents et emplois depuis décembre 2010',
  residents: 'résidents',
  jobs: 'emplois',
  ridersFromGrowth: 'usagers dus à la croissance',
  since2010: (x) => `${x} depuis 2010`,
  whereTitle: 'Où se sont installés les nouveaux résidents',
  place: { station: 'Près d’une station de transport rapide', core: 'Le centre (densification)', suburbs: 'La frange de banlieue', gatineau: 'Gatineau', rural: 'Villages et campagne' },
  monthsTitle: 'Mois par mois',
  monthsHelp: 'Nouveaux résidents chaque mois; la partie foncée s’est installée à distance de marche d’une station de transport rapide.',
  topTitle: 'La plus forte croissance cette année',
  topNone: 'Aucune croissance encore : elle est comptée à la fin de chaque mois.',
  offersTitle: 'Offres de promoteurs',
  offersNone: 'Aucune encore. Les promoteurs proposent de construire près des stations, plus souvent près de celles d’une nouvelle ligne.',
  offer: (h, st) => `${h} logements à ${st}`,
  status: { offered: 'attend votre réponse', council: 'devant le conseil', approved: 'rezoné', refused: 'refusé par le conseil', declined: 'refusée' },
  lost: (n) => `${n} emplois perdus par des commerces voisins de chantiers`,
  howTitle: 'Ce qui attire la croissance',
  how: [
    'Les gens et les employeurs vont là où ils peuvent rejoindre emplois, clients et travailleurs : en voiture, et en transport en commun sur le réseau en service.',
    'On ne peut bâtir que là où il y a de la place. La frange de banlieue en a beaucoup; le centre se densifie lentement de plein droit, un peu plus vite là où le transport en commun s’est amélioré.',
    'Près des stations de transport rapide, les promoteurs paient une prime, plus forte pour une nouvelle ligne, mais seulement là où le zonage le permet : c’est le rezonage (un vote du conseil) qui l’ouvre.',
    'Une rue éventrée par un chantier retient les logements et fait fuir des commerces le temps des travaux. Une nouvelle ligne qui ne va pas plus vite que l’autobus qu’elle remplace ajoute peu d’accès, et attire donc peu de croissance.',
  ],
  legend: 'Nouveaux résidents et emplois depuis 2010, par km²',
  legendLost: 'Moins d’emplois (chantiers)',
  legendLow: 'peu',
  legendHigh: 'beaucoup',
  zoneSub: (d) => `${d} · croissance depuis décembre 2010`,
  district: { downtown: 'Centre-ville', inner: 'Quartiers centraux', suburbs: 'Banlieue', rural: 'Rural', hull: 'Hull', gatineau: 'Gatineau' },
  then: 'Déc. 2010',
  now: 'Maintenant',
  roomLeft: 'Place pour bâtir',
  roomHomes: (n) => `environ ${n} logements`,
  transitReach: 'Emplois à 45 min en transport en commun',
  carReach: 'Emplois à 30 min en voiture',
  reachHelp: 'À la pointe du matin, sur le réseau en service.',
  station: (name, m) => `Station ${name}, à ${m}`,
  noStation: 'Aucune station de transport rapide à distance de marche',
  building: 'Voisin d’un chantier : les logements attendent et des commerces ferment jusqu’à la fin des travaux.',
  rezoned: (h) => `Rezoné pour ${h} logements de plus`,
  why: {
    full: 'Complètement bâti : pas de place sans rezonage, si bon que soit le transport en commun.',
    room: 'De la place pour bâtir et un bon accès en voiture : les lotissements la remplissent.',
    transit: 'Le transport en commun rend les emplois faciles d’accès d’ici : il attire la croissance là où il y a de la place.',
    building: 'Le chantier voisin freine la croissance.',
    quiet: 'Peu d’accès en transport en commun ou en voiture, et peu de place : la croissance est lente.',
    station: 'Près d’une station : les promoteurs paient plus ici, là où le zonage le permet.',
  },
  near: (p) => `près de ${p}`,
  devTitle: (st) => `L’offre d’un promoteur à ${st}`,
  devIntro: (h, j, st) => `Un promoteur propose de construire ${h} logements et des locaux pour ${j} emplois à distance de marche de la station ${st}, si le conseil rezone le terrain.`,
  devNewLine: 'Il achète en prévision de la nouvelle ligne.',
  devCharges: (m) => `Redevances d’aménagement pour le transport en commun : ${m}`,
  devWard: (w) => `Le conseiller du quartier (${w}) entendra le voisinage.`,
  devBack: { title: 'L’appuyer', body: 'Soumettre le rezonage au conseil. Des logements près du transport en commun amènent des usagers; le voisinage peut s’y opposer.' },
  devDecline: { title: 'La refuser', body: 'Le terrain reste tel quel; la croissance ira ailleurs, sans doute en frange de banlieue.' },
  rezonedNews: (st, h, p) => (p ? `Le conseil rezone des terrains à ${st} pour ${h} logements` : `Le conseil refuse le rezonage à ${st}`),
  skip: 'Avancer d’un mois',
  skipShort: '+1 mois',
  skipHelp: 'Jouer le reste du mois d’un coup, puis voir ce qui a changé',
  reviewTitle: (w) => `Le mois en revue · ${w}`,
  reviewPartial: (d) => (d === 1 ? '1 jour joué' : `${d} jours joués`),
  reviewStopped: 'Une décision vous attend : fermez ceci pour y répondre.',
  rRiders: 'Usagers en semaine (niveau du mois)',
  rApproval: 'Appui',
  rReserve: 'Réserve de fonctionnement',
  rCapital: 'Réserve d’immobilisations',
  rCapitalPC: 'Capital politique',
  rResidents: 'Nouveaux résidents',
  rJobs: 'Nouveaux emplois',
  rGrowthRiders: 'Usagers dus à la croissance',
  rWhere: (st, edge) => `${st} près du transport rapide, ${edge} en frange de banlieue`,
  rNews: 'Ce qui s’est passé',
  rNoNews: 'Un mois tranquille.',
  again: 'Encore un mois',
  close: 'Fermer',
  openGrowth: 'Voir où ça a grandi',
};
