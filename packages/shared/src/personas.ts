import type { Persona } from './opinion';

const h = (hh: number, mm = 0) => hh * 3600 + mm * 60;

/**
 * The six riders you can follow (PLAN §4.6). Fictional people; their homes, destinations and
 * routines are chosen to show different sides of the network: the Transitway, cross-river trips,
 * night service, accessibility, a long suburban commute and rural service.
 */
export const PERSONAS: Persona[] = [
  {
    id: 'amira', name: 'Amira', age: 21, color: '#E8961E',
    role: { en: 'uOttawa student with a part-time job at Bayshore', fr: 'Étudiante à l’Université d’Ottawa, emploi à temps partiel à Bayshore' },
    home: { lon: -75.6779, lat: 45.4236, name: 'Sandy Hill' },
    dest: { lon: -75.8066, lat: 45.3494, name: 'Bayshore' },
    out: h(15, 50), back: h(21, 40), days: [2, 4, 6],
  },
  {
    id: 'gerald', name: 'Gérald', age: 71, color: '#7A6FD0',
    role: { en: 'Retiree in Aylmer who goes downtown to see friends', fr: 'Retraité d’Aylmer qui va voir ses amis au centre-ville' },
    home: { lon: -75.8418, lat: 45.3953, name: 'Aylmer' },
    dest: { lon: -75.6919, lat: 45.4253, name: 'Rideau Centre' },
    out: h(10, 0), back: h(14, 30), days: [1, 3, 5], coldSensitivity: 1.3,
  },
  {
    id: 'priya', name: 'Priya', age: 34, color: '#D2447A',
    role: { en: 'Night-shift nurse at the General Hospital', fr: 'Infirmière de nuit à l’Hôpital Général' },
    home: { lon: -75.7237, lat: 45.4011, name: 'Hintonburg' },
    dest: { lon: -75.6497, lat: 45.4013, name: 'General Hospital' },
    out: h(18, 15), back: h(7, 20), days: [0, 1, 2, 3],
  },
  {
    id: 'sam', name: 'Sam', age: 29, color: '#2E9E6A', wheelchair: true,
    role: { en: 'Wheelchair user in Vanier, works downtown', fr: 'Utilisateur de fauteuil roulant à Vanier, travaille au centre-ville' },
    home: { lon: -75.6583, lat: 45.4389, name: 'Vanier' },
    dest: { lon: -75.7016, lat: 45.4199, name: 'Place de Ville' },
    out: h(8, 5), back: h(16, 45), days: [1, 2, 3, 4, 5],
  },
  {
    id: 'marc', name: 'Marc', age: 45, color: '#2F6FD6',
    role: { en: 'Public servant commuting from Orléans to Tunney’s Pasture', fr: 'Fonctionnaire qui fait la navette d’Orléans à Tunney’s Pasture' },
    home: { lon: -75.5142, lat: 45.472, name: 'Orléans' },
    dest: { lon: -75.7346, lat: 45.4032, name: 'Tunney’s Pasture' },
    out: h(6, 50), back: h(16, 20), days: [1, 2, 3, 4, 5],
  },
  {
    id: 'lise', name: 'Lise', age: 63, color: '#8C6A3F', coldSensitivity: 1.2,
    role: { en: 'Lives in Manotick without a car; shops at Billings Bridge', fr: 'Vit à Manotick sans voiture; magasine à Billings Bridge' },
    home: { lon: -75.6829, lat: 45.2262, name: 'Manotick' },
    dest: { lon: -75.6764, lat: 45.3843, name: 'Billings Bridge' },
    out: h(9, 30), back: h(13, 30), days: [3, 5],
  },
];
