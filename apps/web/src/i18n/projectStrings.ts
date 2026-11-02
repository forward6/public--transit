// M8 text: rapid-transit lines, from drawing one to opening day (EN/FR).
import type { FundingStatus, LineMode, Procurement, ProjectPhase, Structure } from '@otc/shared';

type D = Record<string, string | number>;

export interface ProjectStrings {
  title: string;
  newLine: string;
  mode: Record<LineMode, string>;
  modeHelp: Record<LineMode, string>;
  drawHint: string;
  structure: Record<Structure, string>;
  stretch: (a: string, b: string, km: string) => string;
  name: string;
  estimate: string;
  stats: (km: string, stations: number, minutes: number) => string;
  costLine: (total: string, perKm: string) => string;
  costParts: { guideway: string; stations: string; vehicles: string; depot: string; soft: string; contingency: string };
  trains: (n: number) => string;
  years: (years: string, opens: string) => string;
  ops: (m: string) => string;
  likelyShare: (m: string, debt: string) => string;
  forecast: string;
  measure: string;
  measuring: string;
  forecastLine: (boardings: string, gained: string, reach: string) => string;
  propose: string;
  proposeHint: string;
  undo: string;
  cancel: string;
  // the panel
  phase: Record<ProjectPhase, string>;
  phases: string;
  opens: (date: string) => string;
  opened: (date: string) => string;
  budget: string;
  spent: string;
  cityShare: string;
  debtService: (m: string) => string;
  partners: string;
  gov: { province: string; federal: string };
  funding: Record<FundingStatus, string>;
  askAgain: (pc: number) => string;
  askedRecently: string;
  progress: (pct: number) => string;
  overruns: (m: string) => string;
  delays: (months: number) => string;
  how: Record<Procurement, string>;
  forecastShort: (boardings: string, gained: string) => string;
  trips: (gained: string) => string;
  cancelProject: string;
  cancelConfirm: string;
  revive: string;
  none: string;
  history: string;
  chip: (name: string, phase: string) => string;
  rework: (n: number) => string;
  // decisions
  procurement: {
    title: (name: string) => string;
    intro: (cost: string) => string;
    funding: (gov: string, status: string, amount: string) => string;
    ncc: string;
    public: { title: string; body: string };
    p3: { title: string; body: string };
  };
  overrun: {
    title: (name: string) => string;
    intro: (amount: string, share: number) => string;
    pay: { title: string; body: (m: string) => string };
    trim: { title: string; body: (m: string) => string };
    pause: { title: string; body: (m: string) => string };
  };
  opening: {
    kicker: string;
    title: (name: string) => string;
    stats: (km: string, stations: number, cost: string, years: string) => string;
    rough: string;
    reworkTitle: (n: number) => string;
    reworkBody: (routes: string) => string;
    keepTitle: string;
    keepBody: string;
    celebrate: string;
  };
  committed: (pct: string) => string;
  lineDebt: string;
  news: (d: D, lang: 'en' | 'fr') => string;
}

const mEN = (x: unknown) => `$${Math.round(Number(x) / 1e6).toLocaleString('en-CA')}M`;
const mFR = (x: unknown) => `${Math.round(Number(x) / 1e6).toLocaleString('fr-CA')} M$`;

export const PROJECTS_EN: ProjectStrings = {
  title: 'Rapid transit',
  newLine: 'New rapid-transit line',
  mode: { lrt: 'Light rail', busway: 'Transitway busway' },
  modeHelp: {
    lrt: 'Trains on their own track: fast, high capacity, expensive. About $35M a km on the surface, $260M in a tunnel.',
    busway: 'Buses on their own roadway, like the Transitway: cheaper, and buses can leave it to reach neighbourhoods.',
  },
  drawHint: 'Tap the map to place stations in order. A station near an existing one shares it, so riders can transfer.',
  structure: { surface: 'Surface', elevated: 'Elevated', tunnel: 'Tunnel' },
  stretch: (a, b, km) => `${a} → ${b} · ${km} km`,
  name: 'Name',
  estimate: 'Estimate',
  stats: (km, n, min) => `${km} km · ${n} stations · ${min} min end to end`,
  costLine: (total, perKm) => `${total} (${perKm} a km)`,
  costParts: { guideway: 'Track and structures', stations: 'Stations', vehicles: 'Trains', depot: 'Maintenance yard', soft: 'Engineering, land', contingency: 'Contingency' },
  trains: (n) => `${n} trains`,
  years: (y, opens) => `About ${y} years to opening (${opens} if council approves it now)`,
  ops: (m) => `Running it: ${m} a year`,
  likelyShare: (m, debt) => `The city’s likely share: ${m}, if Ontario and the federal government each pay a third (about ${debt} a year in debt service)`,
  forecast: 'Forecast',
  measure: 'Forecast riders',
  measuring: 'The demand model is measuring the line…',
  forecastLine: (b, g, r) => `${b} boardings a weekday on the line · ${g} transit trips a weekday · jobs within 45 min ${r}`,
  propose: 'Propose to council',
  proposeHint: 'Council votes on paying for design and the environmental assessment first.',
  undo: 'Undo',
  cancel: 'Cancel',
  phase: { proposed: 'Before council', design: 'Design and assessment', procurement: 'Procurement', construction: 'Under construction', testing: 'Testing',
    open: 'Open', shelved: 'Shelved', cancelled: 'Cancelled' },
  phases: 'Stages',
  opens: (d) => `Opens ${d}`,
  opened: (d) => `Opened ${d}`,
  budget: 'Budget',
  spent: 'Spent',
  cityShare: 'The city’s share',
  debtService: (m) => `About ${m} a year in debt service`,
  partners: 'Partners',
  gov: { province: 'Ontario', federal: 'Federal government' },
  funding: { none: 'Decides when design ends', committed: 'Committed', declined: 'Declined' },
  askAgain: (pc) => `Ask again · ${pc} capital`,
  askedRecently: 'Asked this year',
  progress: (p) => `${p}% built`,
  overruns: (m) => `Overruns so far: ${m}`,
  delays: (n) => `Delays so far: ${n} months`,
  how: { public: 'Public build', p3: 'Public-private partnership' },
  forecastShort: (b, g) => `${b} boardings a weekday · ${g} transit trips`,
  trips: (g) => `Riders it serves or gains: ${g} a weekday (forecast)`,
  cancelProject: 'Cancel the project',
  cancelConfirm: 'Cancel it? The money spent is gone, and the papers will notice.',
  revive: 'Try again',
  none: 'No lines yet. In Plan mode, draw a new rapid-transit line.',
  history: 'What happened',
  chip: (n, p) => `${n} · ${p}`,
  rework: (n) => `On opening day, ${n} bus routes that run alongside it can be reworked`,
  procurement: {
    title: (n) => `${n}: how to build it`,
    intro: (c) => `Design and the environmental assessment are done. Budget: ${c}.`,
    funding: (g, s, a) => `${g}: ${s}${a ? ` (${a})` : ''}`,
    ncc: 'The NCC approved the alignment along its land, with conditions (time and money).',
    public: { title: 'Public build', body: 'The city hires a contractor to build it to its design. Cheapest on paper, but cost overruns are the city’s to pay.' },
    p3: { title: 'Public-private partnership', body: 'A consortium designs, builds, finances and maintains it. About 7% more and four more months to procure, but it carries most overruns and pays for delays.' },
  },
  overrun: {
    title: (n) => `${n} is over budget`,
    intro: (a, s) => `The contractor reports ${a} more than planned (${s}%).`,
    pay: { title: 'Pay it', body: (m) => `Borrow the ${m}. Work goes on.` },
    trim: { title: 'Trim the scope', body: (m) => `Simplify stations and systems: about ${m}. A rough opening becomes likelier.` },
    pause: { title: 'Pause and re-tender', body: (m) => `Stop for nine months and re-tender the rest: about ${m}. The papers will have a field day.` },
  },
  opening: {
    kicker: 'Opening day',
    title: (n) => `${n} opens`,
    stats: (km, n, c, y) => `${km} km · ${n} stations · ${c} · ${y} years from proposal to opening`,
    rough: 'Expect a rough first few weeks: door faults and stalled trains are already in the news.',
    reworkTitle: (n) => `Rework ${n} bus routes around it`,
    reworkBody: (r) => `Halve the buses that now run alongside the line (${r}), and retire the ones that hardly leave it. Riders transfer to the trains; the bus-hours saved help pay for the line.`,
    keepTitle: 'Keep every bus',
    keepBody: 'No forced transfers, but the city pays for both. You can change routes in Plan mode later.',
    celebrate: 'Cut the ribbon',
  },
  committed: (p) => `Of this, ${p} pays for the lines council approved (debt service and running them). Council treats it as owed.`,
  lineDebt: 'Line debt (30 years)',
  news: (d) => {
    const n = d.name;
    switch (d.what) {
      case 'approved': return `${n}: council funds design and the environmental assessment`;
      case 'shelved': return `${n} shelved by council`;
      case 'cancelled': return `${n} cancelled`;
      case 'funding': return Number(d.amount) ? `${d.gov === 'province' ? 'Ontario' : 'The federal government'} commits ${mEN(d.amount)} to ${n}` : `${d.gov === 'province' ? 'Ontario' : 'The federal government'} won’t fund ${n}`;
      case 'ncc': return `${n}: the NCC approves the alignment, with conditions`;
      case 'bids': return `${n}: bids are in at ${mEN(d.price)}`;
      case 'construction': return `${n}: construction begins`;
      case 'overrunAnswered': return `${n}: ${mEN(d.amount)} overrun (${d.choice === 'pay' ? 'paid' : d.choice === 'trim' ? 'scope trimmed' : 'paused to re-tender'})`;
      case 'overrunP3': return `${n}: the builders absorb most of a ${mEN(d.amount)} overrun`;
      case 'delay': return `${n} delayed ${d.months} months${Number(d.damages) ? ` (the consortium pays ${mEN(d.damages)})` : ''}`;
      case 'sinkhole': return `Sinkhole on the ${n} tunnel works`;
      case 'testing': return `${n}: trains begin testing`;
      case 'trouble': return `${n}: a rough first week for riders`;
      case 'rework': return `${n}: ${d.routes} bus routes reworked around the line`;
      case 'retender': return `${n}: back out to tender`;
      default: return '';
    }
  },
};

export const PROJECTS_FR: ProjectStrings = {
  title: 'Transport rapide',
  newLine: 'Nouvelle ligne de transport rapide',
  mode: { lrt: 'Train léger', busway: 'Transitway (voie réservée)' },
  modeHelp: {
    lrt: 'Des trains sur leurs propres voies : rapide, grande capacité, coûteux. Environ 35 M$ le km en surface, 260 M$ en tunnel.',
    busway: 'Des autobus sur leur propre chaussée, comme le Transitway : moins cher, et les autobus peuvent en sortir pour desservir les quartiers.',
  },
  drawHint: 'Touchez la carte pour placer les stations dans l’ordre. Une station près d’une station existante la partage, pour les correspondances.',
  structure: { surface: 'Surface', elevated: 'Aérien', tunnel: 'Tunnel' },
  stretch: (a, b, km) => `${a} → ${b} · ${km} km`,
  name: 'Nom',
  estimate: 'Estimation',
  stats: (km, n, min) => `${km} km · ${n} stations · ${min} min d’un bout à l’autre`,
  costLine: (total, perKm) => `${total} (${perKm} le km)`,
  costParts: { guideway: 'Voies et ouvrages', stations: 'Stations', vehicles: 'Trains', depot: 'Centre d’entretien', soft: 'Ingénierie, terrains', contingency: 'Imprévus' },
  trains: (n) => `${n} trains`,
  years: (y, opens) => `Environ ${y} ans avant l’ouverture (${opens} si le conseil l’approuve maintenant)`,
  ops: (m) => `Exploitation : ${m} par an`,
  likelyShare: (m, debt) => `Part probable de la Ville : ${m}, si l’Ontario et le fédéral paient chacun le tiers (environ ${debt} par an en service de la dette)`,
  forecast: 'Prévision',
  measure: 'Prévoir l’achalandage',
  measuring: 'Le modèle de demande évalue la ligne…',
  forecastLine: (b, g, r) => `${b} montées par jour de semaine sur la ligne · ${g} déplacements en transport en commun · emplois à 45 min ${r}`,
  propose: 'Proposer au conseil',
  proposeHint: 'Le conseil vote d’abord sur le financement de la conception et de l’évaluation environnementale.',
  undo: 'Annuler',
  cancel: 'Fermer',
  phase: { proposed: 'Devant le conseil', design: 'Conception et évaluation', procurement: 'Appel d’offres', construction: 'En construction', testing: 'Essais',
    open: 'En service', shelved: 'Mise sur la glace', cancelled: 'Annulée' },
  phases: 'Étapes',
  opens: (d) => `Ouverture ${d}`,
  opened: (d) => `Ouverte le ${d}`,
  budget: 'Budget',
  spent: 'Dépensé',
  cityShare: 'Part de la Ville',
  debtService: (m) => `Environ ${m} par an en service de la dette`,
  partners: 'Partenaires',
  gov: { province: 'Ontario', federal: 'Gouvernement fédéral' },
  funding: { none: 'Décide à la fin de la conception', committed: 'Engagé', declined: 'Refusé' },
  askAgain: (pc) => `Redemander · ${pc} de capital`,
  askedRecently: 'Déjà demandé cette année',
  progress: (p) => `${p} % construite`,
  overruns: (m) => `Dépassements à ce jour : ${m}`,
  delays: (n) => `Retards à ce jour : ${n} mois`,
  how: { public: 'Construction publique', p3: 'Partenariat public-privé' },
  forecastShort: (b, g) => `${b} montées par jour de semaine · ${g} déplacements`,
  trips: (g) => `Usagers desservis ou gagnés : ${g} par jour de semaine (prévision)`,
  cancelProject: 'Annuler le projet',
  cancelConfirm: 'L’annuler ? L’argent dépensé est perdu, et les journaux le remarqueront.',
  revive: 'Réessayer',
  none: 'Aucune ligne pour l’instant. En mode Planifier, tracez une nouvelle ligne de transport rapide.',
  history: 'Ce qui s’est passé',
  chip: (n, p) => `${n} · ${p}`,
  rework: (n) => `À l’ouverture, ${n} lignes d’autobus parallèles pourront être revues`,
  procurement: {
    title: (n) => `${n} : comment la construire`,
    intro: (c) => `La conception et l’évaluation environnementale sont terminées. Budget : ${c}.`,
    funding: (g, s, a) => `${g} : ${s}${a ? ` (${a})` : ''}`,
    ncc: 'La CCN a approuvé le tracé sur ses terrains, avec conditions (délais et coûts).',
    public: { title: 'Construction publique', body: 'La Ville engage un entrepreneur pour construire selon ses plans. Le moins cher sur papier, mais les dépassements sont à la charge de la Ville.' },
    p3: { title: 'Partenariat public-privé', body: 'Un consortium conçoit, construit, finance et entretient la ligne. Environ 7 % de plus et quatre mois d’appel d’offres de plus, mais il assume la plupart des dépassements et paie les retards.' },
  },
  overrun: {
    title: (n) => `${n} : dépassement de coûts`,
    intro: (a, s) => `L’entrepreneur annonce ${a} de plus que prévu (${s} %).`,
    pay: { title: 'Payer', body: (m) => `Emprunter les ${m}. Les travaux continuent.` },
    trim: { title: 'Réduire la portée', body: (m) => `Simplifier stations et systèmes : environ ${m}. Une ouverture difficile devient plus probable.` },
    pause: { title: 'Suspendre et relancer', body: (m) => `Arrêter neuf mois et relancer l’appel d’offres pour le reste : environ ${m}. Les journaux vont s’en donner à cœur joie.` },
  },
  opening: {
    kicker: 'Jour d’ouverture',
    title: (n) => `La ${n} ouvre`,
    stats: (km, n, c, y) => `${km} km · ${n} stations · ${c} · ${y} ans de la proposition à l’ouverture`,
    rough: 'Attendez-vous à des premières semaines difficiles : pannes de portes et trains immobilisés font déjà les manchettes.',
    reworkTitle: (n) => `Revoir ${n} lignes d’autobus autour d’elle`,
    reworkBody: (r) => `Réduire de moitié les autobus qui longent maintenant la ligne (${r}) et retirer ceux qui la quittent à peine. Les usagers prennent le train; les heures d’autobus économisées aident à payer la ligne.`,
    keepTitle: 'Garder tous les autobus',
    keepBody: 'Pas de correspondances forcées, mais la Ville paie les deux. Vous pourrez modifier les lignes en mode Planifier.',
    celebrate: 'Couper le ruban',
  },
  committed: (p) => `De cela, ${p} paie les lignes approuvées par le conseil (service de la dette et exploitation). Le conseil le considère comme dû.`,
  lineDebt: 'Dette des lignes (30 ans)',
  news: (d) => {
    const n = d.name;
    const gov = d.gov === 'province' ? 'L’Ontario' : 'Le fédéral';
    switch (d.what) {
      case 'approved': return `${n} : le conseil finance la conception et l’évaluation environnementale`;
      case 'shelved': return `${n} mise sur la glace par le conseil`;
      case 'cancelled': return `${n} annulée`;
      case 'funding': return Number(d.amount) ? `${gov} accorde ${mFR(d.amount)} à ${n}` : `${gov} refuse de financer ${n}`;
      case 'ncc': return `${n} : la CCN approuve le tracé, avec conditions`;
      case 'bids': return `${n} : les soumissions arrivent à ${mFR(d.price)}`;
      case 'construction': return `${n} : début des travaux`;
      case 'overrunAnswered': return `${n} : dépassement de ${mFR(d.amount)} (${d.choice === 'pay' ? 'payé' : d.choice === 'trim' ? 'portée réduite' : 'travaux suspendus'})`;
      case 'overrunP3': return `${n} : le consortium assume l’essentiel d’un dépassement de ${mFR(d.amount)}`;
      case 'delay': return `${n} retardée de ${d.months} mois${Number(d.damages) ? ` (le consortium paie ${mFR(d.damages)})` : ''}`;
      case 'sinkhole': return `Affaissement sur le chantier du tunnel de ${n}`;
      case 'testing': return `${n} : début des essais des trains`;
      case 'trouble': return `${n} : une première semaine difficile pour les usagers`;
      case 'rework': return `${n} : ${d.routes} lignes d’autobus revues autour de la ligne`;
      case 'retender': return `${n} : nouvel appel d’offres`;
      default: return '';
    }
  },
};
