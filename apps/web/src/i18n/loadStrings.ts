// The Load view: where the network is under load (EN/FR).
import type { LoadLevel } from '@otc/sim';

export interface LoadStrings {
  title: string;
  sub: string;
  open: string;
  mode: { crowding: string; daily: string };
  level: Record<LoadLevel, string>;
  over: string;
  crowded: string;
  busiestPeak: string;
  perHour: (n: string) => string;
  busiest: string;
  mostCrowded: string;
  routesUnderPressure: string;
  between: (a: string, b: string) => string;
  busiestStations: string;
  perDay: string;
  measuring: string;
  note: string;
  legendRiders: string;
}

export const LOAD_EN: LoadStrings = {
  title: 'Where the load is',
  sub: 'Weekday morning peak hour · the network in operation',
  open: 'Where the load is',
  mode: { crowding: 'Peak crowding', daily: 'Riders per day' },
  level: { calm: 'Room to spare', busy: 'Busy', crowded: 'Crowded', over: 'Over capacity' },
  over: 'stretches over capacity',
  crowded: 'crowded stretches',
  busiestPeak: 'riders an hour on the busiest stretch',
  perHour: (n) => `${n}/h`,
  busiest: 'Busiest stretches',
  mostCrowded: 'Most crowded',
  routesUnderPressure: 'Routes under pressure',
  between: (a, b) => `${a} → ${b}`,
  busiestStations: 'Busiest stations',
  perDay: 'boardings a weekday',
  measuring: 'Measuring the network in operation…',
  note: 'Riders in the busiest morning hour against the places on the buses and trains scheduled through each stretch (all routes together). Capacities by route class are estimates (60-ft bus 100, 40-ft bus 65, O-Train 260). The timetable is August 2011 summer service, so some suburban routes look more crowded than they would in December. Over capacity means riders are left behind.',
  legendRiders: 'Line width: riders per day',
};

export const LOAD_FR: LoadStrings = {
  title: 'Où se trouve la charge',
  sub: 'Heure de pointe du matin en semaine · le réseau en service',
  open: 'Où se trouve la charge',
  mode: { crowding: 'Affluence à la pointe', daily: 'Usagers par jour' },
  level: { calm: 'De la place', busy: 'Achalandé', crowded: 'Bondé', over: 'Au-delà de la capacité' },
  over: 'tronçons au-delà de la capacité',
  crowded: 'tronçons bondés',
  busiestPeak: 'usagers à l’heure sur le tronçon le plus achalandé',
  perHour: (n) => `${n}/h`,
  busiest: 'Tronçons les plus achalandés',
  mostCrowded: 'Les plus bondés',
  routesUnderPressure: 'Lignes sous pression',
  between: (a, b) => `${a} → ${b}`,
  busiestStations: 'Stations les plus achalandées',
  perDay: 'montées par jour de semaine',
  measuring: 'Mesure du réseau en service…',
  note: 'Usagers à l’heure la plus chargée du matin par rapport aux places offertes par les autobus et les trains prévus sur chaque tronçon (toutes lignes confondues). Les capacités par type de ligne sont des estimations (autobus de 60 pi : 100, de 40 pi : 65, O-Train : 260). L’horaire est celui de l’été 2011 : certaines lignes de banlieue semblent plus bondées qu’en décembre. Au-delà de la capacité, des usagers restent sur le quai.',
  legendRiders: 'Épaisseur : usagers par jour',
};
