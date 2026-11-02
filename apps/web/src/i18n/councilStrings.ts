// M7 text: council, votes, labour, partners and elections (EN/FR).
import type { GameEventKind, ItemKind, Lang, Platform, StoAgenda, WhipReason } from '@otc/shared';
import type { StoProposal } from '@otc/sim';

type D = Record<string, number | string>;

export interface CouncilStrings {
  capitalChip: (n: number) => string;
  capital: string;
  capitalHelp: string;
  title: string;
  sub: (allies: number) => string;
  bodyVote: Record<'commission' | 'council', string>;
  item: Record<ItemKind, (p: D) => string>;
  effect: {
    levy: (x: string) => string; fares: (x: string) => string; service: (x: string) => string; capital: (x: string) => string; debt: (x: string) => string;
    wage: (x: string) => string; gains: (wards: string) => string; losses: (route: string, wards: string) => string; adds: (route: string, wards: string) => string;
  };
  motionNote: string;
  position: Record<'yes' | 'no' | 'undecided', string>;
  tally: (needed: number, yes: number, und: number, no: number) => string;
  reason: Record<WhipReason, string>;
  /** the same reasons when they push towards a yes (e.g. taxes held down) */
  reasonFor: Partial<Record<WhipReason, string>>;
  lobby: (cost: number) => string;
  lobbyAgainst: (cost: number) => string;
  lobbied: string;
  consult: string;
  consultHint: string;
  study: string;
  studyHint: string;
  amend: Partial<Record<ItemKind, string>>;
  withdraw: string;
  callVote: string;
  measuring: string;
  mayorWord: string;
  wardWord: (name: string) => string;
  // labour
  labourTitle: (round: number) => string;
  labourIntro: (union: string, demand: string) => string;
  labourMemory: string;
  wageOffer: string;
  scheduling: Record<'keep' | 'reform', { title: string; body: string }>;
  years: (n: number) => string;
  makeOffer: string;
  strikeTitle: (days: number) => string;
  strikeIntro: string;
  strikeChoice: Record<'meet' | 'arbitration' | 'holdOut', { title: string; body: string }>;
  // partners
  stoTitle: string;
  sto: Record<StoProposal, { title: string; body: string }>;
  accept: string;
  decline: string;
  fundingTitle: string;
  funding: Record<'provincialBuses' | 'federalGarage', { title: string; body: string }>;
  // elections
  electionTitle: string;
  electionSub: (date: string) => string;
  allies: (before: number, after: number) => string;
  mayorResult: (held: boolean, name: string, share: string) => string;
  held: string;
  newMember: string;
  platform: Record<Platform, string>;
  takesOffice: string;
  continue: string;
  // panel
  composition: (allies: number, swing: number, hawks: number) => string;
  councillors: string;
  commission: string;
  /** short tag in the councillor list */
  commissionTag: string;
  votes: string;
  noVotes: string;
  directions: string;
  restoreBy: (route: string) => string;
  labourSection: string;
  contract: (wage: string, until: string) => string;
  onStrike: string;
  stoSection: string;
  stoAgenda: Record<StoAgenda, string>;
  relationship: (n: number) => string;
  fundingSection: string;
  fundingStatus: Record<'offered' | 'accepted' | 'declined' | 'clawedBack' | 'done', string>;
  elections: string;
  passed: string;
  failed: string;
  news: Partial<Record<GameEventKind, (d: D, lang: Lang) => string>>;
  decisionTitle: Partial<Record<GameEventKind, string>>;
}

const sgn = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '');

export const COUNCIL_EN: CouncilStrings = {
  capitalChip: (n) => `Capital ${Math.round(n)}`,
  capital: 'Political Capital',
  capitalHelp: 'Earned when people approve of transit and when you deliver what you promised; spent lobbying councillors. Lost votes cost some.',
  title: 'Council',
  sub: (a) => `${a} of 24 lean your way · votes on the big items only`,
  bodyVote: { commission: 'Transit Commission vote', council: 'Council vote' },
  item: {
    budget: () => 'Your budget',
    plan: () => 'Your service plan',
    garage: () => 'A new bus garage',
    order: (p) => `An order for ${p.count} buses`,
    deficitLevy: () => 'An in-year levy increase to cover the deficit',
    deficitCut: () => 'Service cuts to cover the deficit',
    deficitBorrow: () => 'Borrowing to cover the deficit',
    restoreRoute: (p) => `Motion: restore route ${p.routeName}`,
    labourDeal: (p) => `Ratify the contract: ${p.wage}% a year for ${p.years} years`,
    project: (p) => `${p.routeName}: fund the design and environmental assessment`,
    contract: (p) => `${p.routeName}: award the construction contract ($${Math.round(Number(p.price ?? 0) / 1e6).toLocaleString('en-CA')}M)`,
  },
  effect: {
    levy: (x) => `Transit levy ${x}`, fares: (x) => `Fares ${x}`, service: (x) => `Bus service ${x}`, capital: (x) => `${x} in capital`,
    debt: (x) => `${x} borrowed`, wage: (x) => `Wages ${x} a year`, gains: (w) => `Better service in ${w}`, losses: (r, w) => `Route ${r} ends in ${w}`,
    adds: (r, w) => `New route ${r} serves ${w}`,
  },
  motionNote: 'A motion against your decision: you want it to fail.',
  position: { yes: 'For', no: 'Against', undecided: 'Undecided' },
  tally: (n, y, u, no) => `${n} votes needed · ${y} for · ${u} undecided · ${no} against`,
  reason: {
    taxes: 'worried about taxes', fares: 'the fare increase', service: 'wants better service', cost: 'the cost', debt: 'against borrowing',
    wardGain: 'their ward gains', wardLoss: 'their ward loses', wardHappy: 'their ward likes transit', wardUnhappy: 'their ward is unhappy',
    ally: 'works well with you', rival: 'at odds with you', mayor: 'follows the mayor', lobbied: 'you made the case', consulted: 'after the consultations',
    study: 'read the study', status: 'prefers to wait', rural: 'rural taxpayers', labour: 'wants labour peace',
  },
  reasonFor: { taxes: 'likes taxes held down', fares: 'fares stay affordable', cost: 'the cost is reasonable', debt: 'avoids new taxes', status: 'a budget must pass',
    rural: 'rural taxpayers spared' },
  lobby: (c) => `Make the case · ${c}`,
  lobbyAgainst: (c) => `Ask for a no · ${c}`,
  lobbied: 'Lobbied',
  consult: 'Hold consultations',
  consultHint: '$250k and a month: undecided members hear from their wards',
  study: 'Commission a study',
  studyHint: '$150k and a month: fiscal hawks like evidence',
  amend: { budget: 'Amend: halve the increases', garage: 'Amend: phase it over two years', order: 'Amend: order half' },
  withdraw: 'Withdraw',
  callVote: 'Call the vote',
  measuring: 'Staff are preparing their report on the plan…',
  mayorWord: 'Mayor',
  wardWord: (n) => n,
  labourTitle: (r) => `Contract talks · round ${r}`,
  labourIntro: (u, d) => `The ${u} wants ${d} a year. Council will have to ratify any deal; if talks fail, a strike is possible.`,
  labourMemory: 'Ottawa remembers the 51-day strike of 2008–09: a strike now would be costly for everyone, you included.',
  wageOffer: 'Wage increase a year',
  scheduling: {
    keep: { title: 'Keep the scheduling rules', body: 'Operators keep their say over shifts (the issue in 2008–09).' },
    reform: { title: 'Reform scheduling', body: 'Saves about 3% of operating costs, but the union will fight it hard.' },
  },
  years: (n) => `${n} years`,
  makeOffer: 'Make the offer',
  strikeTitle: (d) => (d ? `Strike: day ${d}` : 'The buses are on strike'),
  strikeIntro: 'No buses are running. Riders are stranded, opinion is falling, and fares have stopped; the operating costs mostly stop too.',
  strikeChoice: {
    meet: { title: 'Meet the union’s demand', body: 'Buses back in two days; a richer contract.' },
    arbitration: { title: 'Binding arbitration', body: 'Buses back in two weeks; the arbitrator splits the difference.' },
    holdOut: { title: 'Hold out', body: 'Wait for the union to settle. It may take weeks.' },
  },
  stoTitle: 'A proposal from STO',
  sto: {
    fareIntegration: { title: 'Fare integration', body: 'STO proposes honouring each other’s passes across the river. About $1.5M a year to OC Transpo; more riders, and goodwill in Gatineau.' },
    sharedStops: { title: 'Shared stops downtown', body: 'Share stops and signs on Wellington and Rideau. $0.3M once.' },
    downtownLayover: { title: 'Layovers downtown', body: 'STO wants its buses to wait on Rideau Street between trips. Refuse, and it may do it anyway.' },
    costRecovery: { title: 'Cost recovery', body: 'Gatineau’s new council wants Ottawa to pay toward STO trips that serve Ottawa’s downtown.' },
    rapibusLink: { title: 'Link to the Rapibus', body: 'Connect OC Transpo routes with STO’s new busway at the river. $1.5M once.' },
  },
  accept: 'Accept',
  decline: 'Decline',
  fundingTitle: 'A funding offer',
  funding: {
    provincialBuses: { title: 'Ontario: a third of your new buses', body: 'The Province pays a third of every bus delivered until the end of 2013, if fares rise no more than 2.5% a year. Break it, and the money goes back.' },
    federalGarage: { title: 'Ottawa (federal): $30M toward a garage', body: 'The federal infrastructure program pays $30M toward a new bus garage, if you build it by June 2013.' },
  },
  electionTitle: 'Election night',
  electionSub: (d) => `Ottawa votes · ${d}`,
  allies: (b, a) => `Councillors leaning your way: ${b} → ${a}`,
  mayorResult: (h, n, s) => (h ? `Mayor ${n} re-elected with ${s}` : `${n} wins the mayoralty with ${s}`),
  held: 'Held',
  newMember: 'New',
  platform: { transit: 'better transit', lowTax: 'hold the line on taxes', rural: 'rural champion', centre: 'centrist' },
  takesOffice: 'The new council takes office on 1 December.',
  continue: 'Continue',
  composition: (a, s, h) => `${a} lean your way · ${s} in the middle · ${h} fiscal hawks`,
  councillors: 'Councillors',
  commission: 'Transit Commission',
  commissionTag: 'Commission',
  votes: 'Votes',
  noVotes: 'No votes yet.',
  directions: 'Council directions',
  restoreBy: (r) => `Restore route ${r} at the next service change`,
  labourSection: 'Labour',
  contract: (w, u) => `Contract: ${w} a year, until ${u}`,
  onStrike: 'On strike',
  stoSection: 'STO',
  stoAgenda: { integration: 'wants closer integration', rapibus: 'building its Rapibus', taxFreeze: 'freezing taxes, looking for savings' },
  relationship: (n) => `relationship ${n > 0 ? '+' : ''}${n}`,
  fundingSection: 'Funding',
  fundingStatus: { offered: 'offered', accepted: 'accepted', declined: 'declined', clawedBack: 'clawed back', done: 'done' },
  elections: 'Elections',
  passed: 'passed',
  failed: 'failed',
  news: {
    voteResult: (d) => {
      const what: Record<string, string> = { budget: 'Your budget', plan: 'Your service plan', garage: 'The new garage', order: 'The bus order',
        deficitLevy: 'The levy increase', deficitCut: 'The service cuts', deficitBorrow: 'The borrowing', restoreRoute: `The motion to restore route ${d.route}`,
        labourDeal: 'The new contract', project: `Designing ${d.route}`, contract: `The ${d.route} contract` };
      return `${what[String(d.kind)] ?? 'The proposal'} ${d.passed ? 'passed' : 'failed'} ${d.yes}–${d.no}`;
    },
    councilBudget: (d) => `Council rejected your budget and adopted its own: levy ${sgn(Number(d.levyChange))}${Math.abs(Number(d.levyChange))}%`,
    motion: (d) => `${d.mover} moves to restore route ${d.route}`,
    directive: (d) => (d.choice === 'restore' ? `Council directs you to restore route ${d.route}` : `Council imposed its own answer to the deficit: ${d.choice}`),
    routeRestored: (d) => `Route ${d.route} is back in service`,
    labour: (d) => (d.strikeVote ? `The union votes to strike from ${d.from}` : 'The union rejected your offer'),
    strike: () => 'The buses are on strike',
    strikeEnds: (d) => `The strike is over: ${d.wage}% a year`,
    labourDeal: (d) => (d.protest ? `The union signs under protest: ${d.wage}% a year` : `New contract: ${d.wage}% a year for ${d.years} years`),
    stoNews: (d) => (d.kind === 'rapibus' ? 'STO opens its Rapibus in Gatineau' : d.kind === 'election' ? `Gatineau votes; STO’s board ${d.agenda === 'taxFreeze' ? 'turns to savings' : 'keeps its course'}` : 'STO goes ahead on its own'),
    fundingNews: (d) => (d.clawedBack ? 'Fares rose too fast: the Province takes its bus money back' : 'Federal money arrives for the new garage'),
    nccReview: (d) => (d.approved ? `The NCC approves route ${d.route} on the parkway` : `The NCC refuses route ${d.route} on the parkway`),
    mayorCools: (d) => `Mayor ${d.name} is losing patience with you`,
    reshuffle: (d) => `Council reshuffles the Transit Commission: out ${d.out}; in ${d.in}`,
  },
  decisionTitle: { vote: 'A vote', labour: 'Contract talks', strike: 'Strike', sto: 'STO', funding: 'Funding', election: 'Election night' },
};

export const COUNCIL_FR: CouncilStrings = {
  capitalChip: (n) => `Capital ${Math.round(n)}`,
  capital: 'Capital politique',
  capitalHelp: 'Gagné quand la population approuve le transport en commun et quand vous tenez vos promesses; dépensé pour convaincre les conseillers. Les votes perdus en coûtent.',
  title: 'Conseil',
  sub: (a) => `${a} sur 24 penchent de votre côté · votes sur les grands dossiers seulement`,
  bodyVote: { commission: 'Vote de la Commission du transport en commun', council: 'Vote du conseil' },
  item: {
    budget: () => 'Votre budget',
    plan: () => 'Votre plan de service',
    garage: () => 'Un nouveau garage d’autobus',
    order: (p) => `Une commande de ${p.count} autobus`,
    deficitLevy: () => 'Une hausse de taxe en cours d’année pour combler le déficit',
    deficitCut: () => 'Des compressions de service pour combler le déficit',
    deficitBorrow: () => 'Un emprunt pour combler le déficit',
    restoreRoute: (p) => `Motion : rétablir la ligne ${p.routeName}`,
    labourDeal: (p) => `Ratifier la convention : ${String(p.wage).replace('.', ',')} % par an pendant ${p.years} ans`,
    project: (p) => `${p.routeName} : financer la conception et l’évaluation environnementale`,
    contract: (p) => `${p.routeName} : accorder le contrat de construction (${Math.round(Number(p.price ?? 0) / 1e6).toLocaleString('fr-CA')} M$)`,
  },
  effect: {
    levy: (x) => `Taxe de transport ${x}`, fares: (x) => `Tarifs ${x}`, service: (x) => `Service d’autobus ${x}`, capital: (x) => `${x} en immobilisations`,
    debt: (x) => `${x} empruntés`, wage: (x) => `Salaires ${x} par an`, gains: (w) => `Meilleur service à ${w}`, losses: (r, w) => `Fin de la ligne ${r} à ${w}`,
    adds: (r, w) => `Nouvelle ligne ${r} à ${w}`,
  },
  motionNote: 'Une motion contre votre décision : vous voulez qu’elle échoue.',
  position: { yes: 'Pour', no: 'Contre', undecided: 'Hésite' },
  tally: (n, y, u, no) => `${n} votes requis · ${y} pour · ${u} indécis · ${no} contre`,
  reason: {
    taxes: 'craint pour les taxes', fares: 'la hausse des tarifs', service: 'veut un meilleur service', cost: 'le coût', debt: 'contre l’emprunt',
    wardGain: 'son quartier y gagne', wardLoss: 'son quartier y perd', wardHappy: 'son quartier apprécie le service', wardUnhappy: 'son quartier est mécontent',
    ally: 'travaille bien avec vous', rival: 'en froid avec vous', mayor: 'suit la mairie', lobbied: 'après votre plaidoyer', consulted: 'après les consultations',
    study: 'a lu l’étude', status: 'préfère attendre', rural: 'les contribuables ruraux', labour: 'veut la paix syndicale',
  },
  reasonFor: { taxes: 'apprécie le gel des taxes', fares: 'les tarifs restent abordables', cost: 'le coût est raisonnable', debt: 'évite de nouvelles taxes',
    status: 'il faut un budget', rural: 'les contribuables ruraux épargnés' },
  lobby: (c) => `Plaider · ${c}`,
  lobbyAgainst: (c) => `Demander un non · ${c}`,
  lobbied: 'Démarche faite',
  consult: 'Tenir des consultations',
  consultHint: '250 k$ et un mois : les indécis entendent leur quartier',
  study: 'Commander une étude',
  studyHint: '150 k$ et un mois : les plus prudents aiment les données',
  amend: { budget: 'Amender : réduire les hausses de moitié', garage: 'Amender : étaler sur deux ans', order: 'Amender : commander la moitié' },
  withdraw: 'Retirer',
  callVote: 'Passer au vote',
  measuring: 'Le personnel prépare son rapport sur le plan…',
  mayorWord: 'Mairie',
  wardWord: (n) => n,
  labourTitle: (r) => `Négociations · ronde ${r}`,
  labourIntro: (u, d) => `Le ${u} demande ${d} par an. Le conseil devra ratifier toute entente; si les négociations échouent, une grève est possible.`,
  labourMemory: 'Ottawa se souvient de la grève de 51 jours de 2008-2009 : une grève maintenant coûterait cher à tous, y compris à vous.',
  wageOffer: 'Hausse salariale par an',
  scheduling: {
    keep: { title: 'Garder les règles d’affectation', body: 'Les chauffeurs gardent leur mot à dire sur les quarts (l’enjeu de 2008-2009).' },
    reform: { title: 'Réformer les affectations', body: 'Économise environ 3 % des coûts d’exploitation, mais le syndicat s’y opposera farouchement.' },
  },
  years: (n) => `${n} ans`,
  makeOffer: 'Faire l’offre',
  strikeTitle: (d) => (d ? `Grève : jour ${d}` : 'Les autobus sont en grève'),
  strikeIntro: 'Aucun autobus ne circule. Les usagers sont en plan, l’opinion chute et les recettes tarifaires ont cessé; les coûts d’exploitation aussi, en grande partie.',
  strikeChoice: {
    meet: { title: 'Accepter la demande du syndicat', body: 'Retour des autobus dans deux jours; une convention plus coûteuse.' },
    arbitration: { title: 'Arbitrage exécutoire', body: 'Retour des autobus dans deux semaines; l’arbitre coupe la poire en deux.' },
    holdOut: { title: 'Tenir bon', body: 'Attendre que le syndicat règle. Cela peut prendre des semaines.' },
  },
  stoTitle: 'Une proposition de la STO',
  sto: {
    fareIntegration: { title: 'Intégration tarifaire', body: 'La STO propose d’honorer mutuellement les laissez-passer d’une rive à l’autre. Environ 1,5 M$ par an pour OC Transpo; plus d’usagers et de la bonne volonté à Gatineau.' },
    sharedStops: { title: 'Arrêts partagés au centre-ville', body: 'Partager arrêts et affichage sur Wellington et Rideau. 0,3 M$ une fois.' },
    downtownLayover: { title: 'Attentes au centre-ville', body: 'La STO veut que ses autobus attendent sur la rue Rideau entre deux trajets. Refusez, et elle pourrait le faire quand même.' },
    costRecovery: { title: 'Recouvrement des coûts', body: 'Le nouveau conseil de Gatineau veut qu’Ottawa contribue aux trajets de la STO qui desservent le centre-ville d’Ottawa.' },
    rapibusLink: { title: 'Lien avec le Rapibus', body: 'Relier les lignes d’OC Transpo au nouveau corridor de la STO à la rivière. 1,5 M$ une fois.' },
  },
  accept: 'Accepter',
  decline: 'Refuser',
  fundingTitle: 'Une offre de financement',
  funding: {
    provincialBuses: { title: 'Ontario : le tiers de vos nouveaux autobus', body: 'La Province paie le tiers de chaque autobus livré d’ici la fin de 2013, si les tarifs n’augmentent pas de plus de 2,5 % par an. Sinon, l’argent est repris.' },
    federalGarage: { title: 'Fédéral : 30 M$ pour un garage', body: 'Le programme fédéral d’infrastructure verse 30 M$ pour un nouveau garage d’autobus, s’il est construit d’ici juin 2013.' },
  },
  electionTitle: 'Soirée électorale',
  electionSub: (d) => `Ottawa vote · ${d}`,
  allies: (b, a) => `Conseillers de votre côté : ${b} → ${a}`,
  mayorResult: (h, n, s) => (h ? `${n} conserve la mairie avec ${s}` : `${n} remporte la mairie avec ${s}`),
  held: 'Siège conservé',
  newMember: 'Changement',
  platform: { transit: 'meilleur transport en commun', lowTax: 'gel des taxes', rural: 'défense du rural', centre: 'centre' },
  takesOffice: 'Le nouveau conseil entre en fonction le 1er décembre.',
  continue: 'Continuer',
  composition: (a, s, h) => `${a} de votre côté · ${s} au centre · ${h} prudents sur les dépenses`,
  councillors: 'Conseillers',
  commission: 'Commission du transport en commun',
  commissionTag: 'Commission',
  votes: 'Votes',
  noVotes: 'Aucun vote pour l’instant.',
  directions: 'Directives du conseil',
  restoreBy: (r) => `Rétablir la ligne ${r} au prochain changement de service`,
  labourSection: 'Relations de travail',
  contract: (w, u) => `Convention : ${w} par an, jusqu’au ${u}`,
  onStrike: 'En grève',
  stoSection: 'STO',
  stoAgenda: { integration: 'veut plus d’intégration', rapibus: 'construit son Rapibus', taxFreeze: 'gèle les taxes, cherche des économies' },
  relationship: (n) => `relation ${n > 0 ? '+' : ''}${n}`,
  fundingSection: 'Financement',
  fundingStatus: { offered: 'offert', accepted: 'accepté', declined: 'refusé', clawedBack: 'repris', done: 'terminé' },
  elections: 'Élections',
  passed: 'adopté',
  failed: 'rejeté',
  news: {
    voteResult: (d) => {
      const what: Record<string, string> = { budget: 'votre budget', plan: 'votre plan de service', garage: 'le nouveau garage', order: 'la commande d’autobus',
        deficitLevy: 'la hausse de taxe', deficitCut: 'les compressions de service', deficitBorrow: 'l’emprunt', restoreRoute: `la motion pour rétablir la ligne ${d.route}`,
        labourDeal: 'la nouvelle convention collective', project: `la conception de la ${d.route}`, contract: `le contrat de la ${d.route}` };
      return `${d.kind === 'plan' ? 'La Commission' : 'Le conseil'} ${d.passed ? 'adopte' : 'rejette'} ${what[String(d.kind)] ?? 'la proposition'}, ${d.yes}–${d.no}`;
    },
    councilBudget: (d) => `Le conseil a rejeté votre budget et adopté le sien : taxe ${sgn(Number(d.levyChange))}${String(Math.abs(Number(d.levyChange))).replace('.', ',')} %`,
    motion: (d) => `${d.mover} propose de rétablir la ligne ${d.route}`,
    directive: (d) => (d.choice === 'restore' ? `Le conseil vous ordonne de rétablir la ligne ${d.route}` : `Le conseil a imposé sa propre réponse au déficit : ${d.choice}`),
    routeRestored: (d) => `La ligne ${d.route} est de retour`,
    labour: (d) => (d.strikeVote ? `Le syndicat vote la grève à partir du ${d.from}` : 'Le syndicat a rejeté votre offre'),
    strike: () => 'Les autobus sont en grève',
    strikeEnds: (d) => `La grève est terminée : ${String(d.wage).replace('.', ',')} % par an`,
    labourDeal: (d) => (d.protest ? `Le syndicat signe sous protestation : ${String(d.wage).replace('.', ',')} % par an` : `Nouvelle convention : ${String(d.wage).replace('.', ',')} % par an pendant ${d.years} ans`),
    stoNews: (d) => (d.kind === 'rapibus' ? 'La STO inaugure son Rapibus à Gatineau' : d.kind === 'election' ? `Gatineau vote; le conseil de la STO ${d.agenda === 'taxFreeze' ? 'mise sur les économies' : 'garde le cap'}` : 'La STO va de l’avant seule'),
    fundingNews: (d) => (d.clawedBack ? 'Hausse de tarifs trop forte : la Province reprend son argent pour les autobus' : 'L’argent fédéral arrive pour le nouveau garage'),
    nccReview: (d) => (d.approved ? `La CCN approuve la ligne ${d.route} sur la promenade` : `La CCN refuse la ligne ${d.route} sur la promenade`),
    mayorCools: (d) => `À la mairie, ${d.name} perd patience avec vous`,
    reshuffle: (d) => `Le conseil remanie la Commission : sortent ${d.out}; entrent ${d.in}`,
  },
  decisionTitle: { vote: 'Un vote', labour: 'Négociations', strike: 'Grève', sto: 'STO', funding: 'Financement', election: 'Soirée électorale' },
};
