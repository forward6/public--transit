// M6 text: public opinion, the riders' diaries, the front page and the social feed (EN/FR).
// The engine produces structured records (packages/sim); this renders them.
import type { DiaryKind, OpinionAxis, Persona, Post, ReasonKey, Story, StoryKind, TripNote } from '@otc/shared';
import type { WeatherKind } from '@otc/sim';

type P = Story['params'];
const mEN = (x: unknown) => `$${Math.round(Number(x) / 1e6).toLocaleString('en-CA')}M`;
const mFR = (x: unknown) => `${Math.round(Number(x) / 1e6).toLocaleString('fr-CA')} M$`;

export interface OpinionStrings {
  toggle: string;
  approval: string;
  approvalChip: (pct: string) => string;
  title: string;
  sub: string;
  axisPicker: string;
  axis: Record<'approval' | 'ward' | OpinionAxis, string>;
  axisHelp: Record<OpinionAxis, string>;
  reason: Record<ReasonKey, string>;
  reasonHelp: Record<ReasonKey, string>;
  why: string;
  whyNote: string;
  history: string;
  byDistrict: string;
  ridersToFollow: string;
  newsroom: string;
  feed: string;
  feedEmpty: string;
  outlet: string;
  pageDate: (month: string) => string;
  approvalBox: (pct: string) => string;
  story: Record<StoryKind, (p: P, persona?: Persona) => { head: string; deck: string }>;
  diary: Record<DiaryKind, (n: TripNote | undefined, persona: Persona, delta: number) => string>;
  post: (post: Post, persona: Persona | undefined, reasonText: string) => string;
  reasonGood: Partial<Record<ReasonKey, string>>;
  reasonBad: Partial<Record<ReasonKey, string>>;
  // zone panel
  zoneSub: (district: string) => string;
  residents: string;
  transitShare: string;
  jobsIn45: string;
  typicalWait: string;
  was2010: (x: string) => string;
  livesHere: string;
  // persona panel
  usualTrip: (minutes: number, routes: string) => string;
  noUsualTrip: string;
  travels: (days: string) => string;
  dayNames: string[];
  out: string;
  back: string;
  todayTrips: string;
  diaryTitle: string;
  noDiary: string;
  leg: { walk: (min: number) => string; wait: (min: number, stop: string) => string; ride: (route: string, to: string) => string; arrive: (place: string) => string };
  now: { home: string; away: (place: string) => string; walking: string; waiting: (stop: string) => string; riding: (route: string) => string };
  mood: (m: number) => string;
  follow: string;
  opinionLegend: [string, string];
  weather: Record<WeatherKind, string>;
  dismiss: string;
}

const pct = (x: number | string, fr = false) => `${Math.abs(Number(x)).toLocaleString(fr ? 'fr-CA' : 'en-CA', { maximumFractionDigits: 1 })}${fr ? ' %' : '%'}`;
const hhmm = (t: number) => `${String(Math.floor(t / 3600) % 24).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`;
const r1 = (n: TripNote | undefined) => n?.routes[0] ?? '';
const routes = (n: TripNote | undefined) => (n?.routes ?? []).join(' → ');

export const OPINION_EN: OpinionStrings = {
  toggle: 'Opinion',
  approval: 'Approval',
  approvalChip: (p) => `Approval ${p}`,
  title: 'Public opinion',
  sub: 'Ottawa residents · how they feel about the Commission',
  axisPicker: 'Show on the map',
  axis: { approval: 'Approval', ward: 'By ward', service: 'Service', value: 'Value for money', trust: 'Trust' },
  axisHelp: {
    service: 'How riding feels where people live: frequency, reach, reliability, crowding, the weather.',
    value: 'Fares and the transit levy, against what people are used to paying.',
    trust: 'Whether the Commission keeps its promises: news, decisions, and the memory of the strike.',
  },
  reason: {
    mood: 'Starting mood', frequency: 'How often buses come', reach: 'Where transit takes you', waits: 'Waits vs. what people are used to',
    reliability: 'Missed trips', crowding: 'Crowding', weather: 'Cold waits and storms', fares: 'Fares', taxes: 'Transit levy', cuts: 'Service cuts',
    strike: 'Memory of the 2008–09 strike', events: 'News and decisions', spillover: 'How riding feels', construction: 'Construction nearby',
  },
  reasonHelp: {
    mood: 'How people felt about OC Transpo in late 2010.',
    frequency: 'Typical wait for the trips people make from where they live. Long waits sour opinion.',
    reach: 'Jobs reachable within 45 minutes by transit, against what people are used to. Expectations catch up over months.',
    waits: 'Waits longer or shorter than people are used to.',
    reliability: 'Trips cancelled for lack of buses or maintenance.',
    crowding: 'More riders per bus-hour than in 2010 (worst in autumn and winter).',
    weather: 'Waiting in deep cold and storm delays. Fades over a week or two.',
    fares: 'Fares against what riders are used to paying. Riders feel it most.',
    taxes: 'The transit levy on tax bills, against last year.',
    cuts: 'Service cut to balance the budget.',
    strike: 'The 51-day strike of 2008–09 still weighs on trust, fading over the years.',
    events: 'New and removed routes, promises kept, fare and tax hikes, deficits, new buses. Fades over months.',
    spillover: 'Good or bad service colours how much people trust the Commission.',
    construction: 'A line being built nearby: detours, closed lanes, noise. It lifts when construction ends.',
  },
  why: 'Why',
  whyNote: 'What opinion is heading towards, reason by reason (approval points). It catches up over weeks: faster when things get worse.',
  history: 'Approval, week by week',
  byDistrict: 'Approval by area',
  ridersToFollow: 'Riders you can follow',
  newsroom: 'Front pages',
  feed: 'What people are saying',
  feedEmpty: 'Posts appear as the days pass.',
  outlet: 'The Rideau Ledger',
  pageDate: (m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  approvalBox: (p) => `Commission approval: ${p}`,
  story: {
    ridershipUp: (p) => ({ head: 'Riders return to OC Transpo', deck: `Weekday ridership is up ${pct(p.pct!)} on last month, after seasonal swings.` }),
    ridershipDown: (p) => ({ head: 'Fewer riders on OC Transpo', deck: `Weekday ridership is down ${pct(p.pct!)} on last month, after seasonal swings.` }),
    approvalUp: (p) => ({ head: `Commission’s approval climbs to ${pct(p.approval!)}`, deck: `Up ${p.pts} points in a month, our tracking poll finds.` }),
    approvalDown: (p) => ({ head: `Patience wears thin: approval slips to ${pct(p.approval!)}`, deck: `Down ${Math.abs(Number(p.pts))} points in a month, our tracking poll finds.` }),
    routeLaunched: (p) => ({ head: `New route ${p.route} takes its first riders`, deck: 'The Commission’s new service started with the service change.' }),
    routeCut: (p) => ({ head: `Route ${p.route} makes its last run`, deck: 'Riders who relied on it face longer trips, and some are angry.' }),
    serviceBoost: () => ({ head: 'More buses as the service change takes effect', deck: 'Shorter waits on the routes the Commission improved.' }),
    snowstorm: (p) => ({ head: `${p.cm} cm of snow: riders shiver as buses bunch`, deck: 'Buses crawled through the storm; waits stretched across the city.' }),
    coldSnap: (p) => ({ head: `Deep freeze: ${p.low} °C at the bus stop`, deck: 'Long waits are hard to bear in the cold snap, riders say.' }),
    missedTrips: (p) => ({ head: `${pct(p.pct!)} of trips cancelled as buses run short`, deck: 'Not enough buses, or not enough maintenance, to run the schedule.' }),
    fareHike: () => ({ head: 'Fares go up', deck: 'Riders will pay more from this month; some say they will drive instead.' }),
    levyHike: () => ({ head: 'Transit levy rises on tax bills', deck: 'Taxpayers will pay more for transit this year.' }),
    deficit: () => ({ head: 'Transit budget in the red', deck: 'The Commission must choose: raise the levy, cut service, defer maintenance or borrow.' }),
    serviceCuts: () => ({ head: 'Service cuts to balance the books', deck: 'Fewer buses on many routes as the Commission trims costs.' }),
    newBuses: (p) => ({ head: `${p.count} new buses join the fleet`, deck: 'Low-floor articulated buses replace the oldest ones.' }),
    garage: (p) => ({ head: `New bus garage opens${p.name ? `: ${p.name}` : ''}`, deck: 'Room for more buses as the fleet grows.' }),
    riderStory: (p, who) => {
      const n = who?.name ?? '';
      const home = who?.home.name ?? '';
      const dest = who?.dest.name ?? '';
      const by: Record<string, { head: string; deck: string }> = {
        noBus: { head: `No bus for ${n}: life in ${home} without a car`, deck: `${n}, ${who?.age}, can’t get to ${dest} by transit at the hours that matter.` },
        long: { head: `From ${home} to ${dest}: ${n}’s long ride`, deck: `${n} spends hours a week on the bus. “It adds up,” ${n} says.` },
        cold: { head: `${n} counts the minutes in the cold`, deck: `Waiting at the stop is the hardest part of ${n}’s week.` },
        highFloor: { head: `For ${n}, an old bus means waiting for the next one`, deck: 'Not every bus can take a wheelchair yet.' },
        missed: { head: `${n}’s bus didn’t come — again`, deck: `Cancelled trips leave riders like ${n} stranded at the stop.` },
        storm: { head: `Snow days with ${n}`, deck: `Every storm adds time to ${n}’s trip from ${home}.` },
        late: { head: `${n} is tired of late buses`, deck: 'Delays add up over a month.' },
        great: { head: `${n} is a happy rider`, deck: `Short waits and a quick trip from ${home} to ${dest}.` },
        better: { head: `The service change pays off for ${n}`, deck: `${n}’s trip from ${home} got shorter.` },
        worse: { head: `${n} lost time in the service change`, deck: `${n}’s trip from ${home} takes longer now.` },
      };
      return by[String(p.kind)] ?? { head: `A month on the bus with ${n}`, deck: `${home} to ${dest}.` };
    },
    quiet: () => ({ head: 'A quiet month on the buses', deck: 'No major disruptions, our reporters find.' }),
    budgetPassed: (p) => ({ head: 'Council adopts the transit budget', deck: `The Chair’s budget passed ${p.yes}–${p.no}.` }),
    budgetRewritten: (p) => ({ head: 'Council overrules the Chair on transit budget', deck: `Councillors adopted their own budget, with the levy up ${p.levy}%.` }),
    planApproved: (p) => ({ head: 'Commission approves the Chair’s route changes', deck: `The service plan passed ${p.yes}–${p.no}; it takes effect at the next service change.` }),
    planRejected: (p) => ({ head: 'Commission rejects the Chair’s route changes', deck: `The service plan failed ${p.yes}–${p.no}.` }),
    motionFiled: (p) => ({ head: `${p.mover} wants route ${p.route} back`, deck: 'A motion asks council to reverse the Chair’s cut.' }),
    motionPassed: (p) => ({ head: `Council orders route ${p.route} restored`, deck: 'The Chair is overruled; the route returns at the next service change.' }),
    strike: () => ({ head: 'Buses stop as transit workers walk out', deck: 'For the second time in three winters, Ottawa is without its buses.' }),
    strikeOver: (p) => ({ head: 'Buses roll again as strike ends', deck: `The settlement: ${p.wage}% a year.` }),
    contract: (p) => ({ head: p.protest ? 'Transit workers sign under protest' : 'Transit workers ratify a new contract', deck: `${p.wage}% a year${p.years ? ` for ${p.years} years` : ''}; no strike.` }),
    election: (p) => ({ head: 'Ottawa votes: a new council for transit', deck: `${p.allies} councillors now lean towards the Chair’s agenda (${p.before} before).` }),
    stoRapibus: () => ({ head: 'Gatineau opens its Rapibus', deck: 'STO’s busway along the old rail line changes trips across the river.' }),
    gatineauVotes: (p) => ({ head: 'Gatineau votes', deck: p.agenda === 'taxFreeze' ? 'The new council promises to freeze taxes; STO will look for savings.' : 'STO’s board keeps its course.' }),
    fundingLost: () => ({ head: 'Province claws back bus money after fare hike', deck: 'Fares rose faster than the agreement allowed.' }),
    reshuffle: (p) => ({ head: 'Council shakes up the Transit Commission', deck: `Out: ${p.out}.` }),
    projectApproved: (p) => ({ head: `Council backs ${p.name}`, deck: `Design and the environmental assessment begin on a ${mEN(p.cost)} line.` }),
    projectShelved: (p) => ({ head: `${p.name} shelved`, deck: p.stage === 'contract' ? 'Council balked at the price of the contract.' : p.stage === 'cancelled' ? 'The Chair pulls the plug; the money spent is gone.' : 'Council won’t pay to design it.' }),
    lineFunded: (p) => ({ head: `${p.gov === 'province' ? 'Ontario' : 'The federal government'} commits ${mEN(p.amount)} to ${p.name}`, deck: 'A third of the cost, with strings attached.' }),
    contractAwarded: (p) => ({ head: `${p.name} contract awarded`, deck: `${mEN(p.price)}.` }),
    constructionStarts: (p) => ({ head: `Shovels in the ground for ${p.name}`, deck: `A ${mEN(p.price)} contract; trains are due in ${String(p.opens).slice(0, 4)}.` }),
    overrun: (p) => ({ head: `${p.name} over budget`, deck: p.choice === 'trim' ? 'Stations simplified to save money.' : p.choice === 'pause' ? 'Work stops while contracts are re-tendered.' : p.choice === 'p3' ? `The builders absorb most of ${mEN(p.amount)}.` : `The city finds another ${mEN(p.amount)}.` }),
    projectDelay: (p) => ({ head: `${p.name} delayed`, deck: `Opening pushed back ${p.months} months.` }),
    sinkhole: (p) => ({ head: `Sinkhole opens above ${p.name} tunnel`, deck: 'Work stops downtown while engineers assess the damage.' }),
    lineOpen: (p) => ({ head: `${p.name} opens`, deck: `${p.km} km and ${p.stations} stations: riders try out the city’s new line.` }),
    lineTrouble: (p) => ({ head: `Rough first weeks for ${p.name}`, deck: 'Door faults and stalled trains frustrate riders.' }),
  },
  diary: {
    great: (n) => `Left at ${hhmm(n?.depart ?? 0)}, waited ${n?.waitMin ?? 0} min, ${routes(n)}. ${n?.minutes} minutes door to door. Easy.`,
    fine: (n) => `${n?.minutes} minutes door to door on the ${routes(n)}; waited ${n?.waitMin} min.`,
    cold: (n) => `Waited ${n?.waitMin} min at ${n?.stop} at ${n?.temp} °C. Couldn’t feel my toes.`,
    storm: (n) => `Snow everywhere: the ${r1(n)} was ${n?.late} min late.`,
    late: (n) => `The ${r1(n)} was ${n?.late} min late.`,
    missed: (n) => `My bus never came. ${n?.waitMin} min at ${n?.stop} before the next one.`,
    highFloor: (n) => `An old high-floor bus came and I couldn’t board. Waited ${n?.waitMin} min for one I could.`,
    noBus: (_n, p) => `No bus I could take from ${p.home.name} at this hour. A neighbour drove me.`,
    long: (n) => `${n?.minutes} minutes each way. There goes my afternoon.`,
    better: (_n, _p, d) => `Since the service change my trip is ${Math.abs(d)} minutes shorter!`,
    worse: (_n, _p, d) => `Since the service change my trip takes ${Math.abs(d)} minutes longer.`,
  },
  post: (post, persona, reasonText) => {
    const p = post.params;
    switch (post.kind) {
      case 'diary': return persona ? OPINION_EN.diary[p.kind as DiaryKind]?.({ minutes: Number(p.minutes), waitMin: Number(p.wait), temp: Number(p.temp),
        routes: [String(p.route)], stop: String(p.stop || 'the stop'), late: Number(p.late ?? 0), depart: 0, arrive: 0, missed: false, highFloor: false,
        none: false }, persona, Number(p.delta ?? 0)) ?? '' : '';
      case 'storm': return `${p.cm} cm of snow and my bus is nowhere to be seen.`;
      case 'cold': return `${p.temp} °C at the stop this morning. Waiting for the bus is brutal.`;
      case 'change': return p.kind === 'newRoute' ? `Tried the new ${p.route} today. Nice to finally have it.` : `They cut the ${p.route}. How am I supposed to get to work now?`;
      case 'fares': return 'Fares up again? Thinking about driving instead.';
      case 'taxes': return 'The transit levy went up on my tax bill. What are we getting for it?';
      default: return reasonText;
    }
  },
  reasonGood: {
    frequency: 'Buses every few minutes where I live. Love it.', reach: 'I can get so much further by bus now.', waits: 'Waits are shorter than they used to be.',
    events: 'Good to see the Commission delivering what it promised.', fares: 'Fares feel fair for what we get.', taxes: 'Glad the transit levy didn’t go up.',
    spillover: 'The bus just works for me these days.', reliability: 'Buses show up when they should.',
  },
  reasonBad: {
    frequency: 'My bus comes every half hour. Not good enough.', reach: 'Getting anywhere by bus from here takes forever since the changes.',
    waits: 'I wait longer than I used to.', reliability: 'Another bus that never showed up.', crowding: 'Packed bus again this morning. Couldn’t even get on.',
    weather: 'Standing in the cold at a stop with no shelter, again.', fares: 'Fares are too high for what we get.', taxes: 'My taxes went up for this?',
    cuts: 'Cuts, cuts, cuts.', strike: 'Still haven’t forgotten the strike.', events: 'Hard to trust the Commission’s promises.', spillover: 'Taking the bus is a chore.',
    construction: 'The construction on my street never ends. Detours everywhere.',
  },
  zoneSub: (d) => `${d} · Ottawa`,
  residents: 'residents',
  transitShare: 'of trips by transit',
  jobsIn45: 'Jobs within 45 min by transit',
  typicalWait: 'Typical wait',
  was2010: (x) => `${x} in 2010`,
  livesHere: 'Lives near here',
  usualTrip: (m, r) => `Usual weekday round trip: ${m} min door to door${r ? ` (${r})` : ''}`,
  noUsualTrip: 'No transit trip possible at the times they travel.',
  travels: (d) => `Travels on ${d}`,
  dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  out: 'Going',
  back: 'Coming home',
  todayTrips: 'Their trips',
  diaryTitle: 'Diary',
  noDiary: 'The diary fills in as the days pass.',
  leg: {
    walk: (m) => `Walk ${m} min`,
    wait: (m, s) => `Wait ${m} min at ${s}`,
    ride: (r, to) => `Ride the ${r} to ${to}`,
    arrive: (p) => `Arrive at ${p}`,
  },
  now: {
    home: 'At home', away: (p) => `At ${p}`, walking: 'Walking', waiting: (s) => `Waiting at ${s}`, riding: (r) => `On the ${r}`,
  },
  mood: (m) => (m <= -2 ? 'awful' : m < 0 ? 'bad' : m === 0 ? 'OK' : m === 1 ? 'good' : 'great'),
  follow: 'Follow',
  opinionLegend: ['Disapprove', 'Approve'],
  weather: { clear: 'clear', cloudy: 'cloudy', rain: 'rain', snow: 'snow', snowstorm: 'snowstorm', downpour: 'downpour', freezing: 'freezing rain', cold: 'deep cold', hot: 'hot' },
  dismiss: 'Close',
};

export const OPINION_FR: OpinionStrings = {
  toggle: 'Opinion',
  approval: 'Appui',
  approvalChip: (p) => `Appui ${p}`,
  title: 'Opinion publique',
  sub: 'Résidents d’Ottawa · ce qu’ils pensent de la Commission',
  axisPicker: 'Afficher sur la carte',
  axis: { approval: 'Appui', ward: 'Par quartier', service: 'Service', value: 'Rapport qualité-prix', trust: 'Confiance' },
  axisHelp: {
    service: 'Comment se passe le trajet là où les gens vivent : fréquence, portée, fiabilité, affluence, météo.',
    value: 'Les tarifs et la taxe de transport en commun, par rapport à ce que les gens ont l’habitude de payer.',
    trust: 'La Commission tient-elle ses promesses : nouvelles, décisions et souvenir de la grève.',
  },
  reason: {
    mood: 'Humeur de départ', frequency: 'Fréquence des autobus', reach: 'Où le transport en commun vous mène', waits: 'Attentes par rapport à l’habitude',
    reliability: 'Trajets annulés', crowding: 'Affluence', weather: 'Froid et tempêtes', fares: 'Tarifs', taxes: 'Taxe de transport en commun', cuts: 'Compressions de service',
    strike: 'Souvenir de la grève de 2008-2009', events: 'Nouvelles et décisions', spillover: 'L’expérience du trajet', construction: 'Chantier à proximité',
  },
  reasonHelp: {
    mood: 'Ce que les gens pensaient d’OC Transpo à la fin de 2010.',
    frequency: 'Attente typique pour les trajets faits depuis chez soi. Les longues attentes nuisent à l’opinion.',
    reach: 'Emplois accessibles en 45 minutes en transport en commun, par rapport à l’habitude. Les attentes s’ajustent en quelques mois.',
    waits: 'Des attentes plus longues ou plus courtes qu’à l’habitude.',
    reliability: 'Trajets annulés faute d’autobus ou d’entretien.',
    crowding: 'Plus d’usagers par heure de service qu’en 2010 (surtout en automne et en hiver).',
    weather: 'Attendre par grand froid et les retards de tempête. S’estompe en une ou deux semaines.',
    fares: 'Les tarifs par rapport à ce que les usagers ont l’habitude de payer. Les usagers le ressentent le plus.',
    taxes: 'La taxe de transport en commun sur le compte de taxes, par rapport à l’an dernier.',
    cuts: 'Service réduit pour équilibrer le budget.',
    strike: 'La grève de 51 jours de 2008-2009 pèse encore sur la confiance, de moins en moins avec les années.',
    events: 'Lignes ajoutées ou supprimées, promesses tenues, hausses de tarifs et de taxes, déficits, nouveaux autobus. S’estompe en quelques mois.',
    spillover: 'Un bon ou un mauvais service influence la confiance envers la Commission.',
    construction: 'Une ligne en construction tout près : détours, voies fermées, bruit. Ça passe à la fin des travaux.',
  },
  why: 'Pourquoi',
  whyNote: 'Vers quoi l’opinion se dirige, raison par raison (en points d’appui). Elle rattrape en quelques semaines, plus vite quand ça se dégrade.',
  history: 'Appui, semaine par semaine',
  byDistrict: 'Appui par secteur',
  ridersToFollow: 'Usagers à suivre',
  newsroom: 'Unes',
  feed: 'Ce que les gens en disent',
  feedEmpty: 'Les publications apparaissent au fil des jours.',
  outlet: 'Le Fil de l’Outaouais',
  pageDate: (m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('fr-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  approvalBox: (p) => `Appui à la Commission : ${p}`,
  story: {
    ridershipUp: (p) => ({ head: 'Les usagers reviennent à OC Transpo', deck: `L’achalandage en semaine grimpe de ${pct(p.pct!, true)} par rapport au mois dernier, variations saisonnières exclues.` }),
    ridershipDown: (p) => ({ head: 'OC Transpo perd des usagers', deck: `L’achalandage en semaine recule de ${pct(p.pct!, true)} par rapport au mois dernier, variations saisonnières exclues.` }),
    approvalUp: (p) => ({ head: `L’appui à la Commission grimpe à ${pct(p.approval!, true)}`, deck: `Une hausse de ${String(p.pts).replace('.', ',')} points en un mois, selon notre sondage.` }),
    approvalDown: (p) => ({ head: `La patience s’use : l’appui glisse à ${pct(p.approval!, true)}`, deck: `Une baisse de ${String(Math.abs(Number(p.pts))).replace('.', ',')} points en un mois, selon notre sondage.` }),
    routeLaunched: (p) => ({ head: `La nouvelle ligne ${p.route} accueille ses premiers usagers`, deck: 'Le nouveau service de la Commission a débuté avec le changement de service.' }),
    routeCut: (p) => ({ head: `Dernier passage pour la ligne ${p.route}`, deck: 'Les usagers qui en dépendaient font face à des trajets plus longs, et certains sont en colère.' }),
    serviceBoost: () => ({ head: 'Plus d’autobus avec le changement de service', deck: 'Des attentes plus courtes sur les lignes améliorées par la Commission.' }),
    snowstorm: (p) => ({ head: `${p.cm} cm de neige : les usagers grelottent, les autobus s’entassent`, deck: 'Les autobus se sont traînés pendant la tempête; l’attente s’est allongée partout.' }),
    coldSnap: (p) => ({ head: `Grand froid : ${p.low} °C à l’arrêt d’autobus`, deck: 'Les longues attentes deviennent pénibles par ce froid, disent les usagers.' }),
    missedTrips: (p) => ({ head: `${pct(p.pct!, true)} des trajets annulés faute d’autobus`, deck: 'Pas assez d’autobus, ou pas assez d’entretien, pour respecter l’horaire.' }),
    fareHike: () => ({ head: 'Les tarifs augmentent', deck: 'Les usagers paieront plus cher dès ce mois-ci; certains disent qu’ils prendront la voiture.' }),
    levyHike: () => ({ head: 'La taxe de transport en commun augmente', deck: 'Les contribuables paieront plus pour le transport en commun cette année.' }),
    deficit: () => ({ head: 'Le budget du transport en commun dans le rouge', deck: 'La Commission doit choisir : hausser la taxe, réduire le service, reporter l’entretien ou emprunter.' }),
    serviceCuts: () => ({ head: 'Des compressions pour équilibrer le budget', deck: 'Moins d’autobus sur de nombreuses lignes alors que la Commission réduit ses coûts.' }),
    newBuses: (p) => ({ head: `${p.count} nouveaux autobus s’ajoutent au parc`, deck: 'Des autobus articulés à plancher bas remplacent les plus vieux.' }),
    garage: (p) => ({ head: `Ouverture d’un nouveau garage${p.name ? ` : ${p.name}` : ''}`, deck: 'De la place pour plus d’autobus.' }),
    riderStory: (p, who) => {
      const n = who?.name ?? '';
      const home = who?.home.name ?? '';
      const dest = who?.dest.name ?? '';
      const by: Record<string, { head: string; deck: string }> = {
        noBus: { head: `Pas d’autobus pour ${n} : la vie à ${home} sans voiture`, deck: `${n}, ${who?.age} ans, ne peut pas se rendre à ${dest} en transport en commun aux heures qui comptent.` },
        long: { head: `De ${home} à ${dest} : le long trajet de ${n}`, deck: `${n} passe des heures par semaine dans l’autobus. « Ça s’additionne », dit ${n}.` },
        cold: { head: `${n} compte les minutes dans le froid`, deck: `L’attente à l’arrêt est le pire moment de la semaine de ${n}.` },
        highFloor: { head: `Pour ${n}, un vieil autobus veut dire attendre le suivant`, deck: 'Tous les autobus ne peuvent pas encore accueillir un fauteuil roulant.' },
        missed: { head: `L’autobus de ${n} n’est pas venu, encore`, deck: `Les trajets annulés laissent des usagers comme ${n} en plan à l’arrêt.` },
        storm: { head: `Jours de neige avec ${n}`, deck: `Chaque tempête allonge le trajet de ${n} depuis ${home}.` },
        late: { head: `${n} en a assez des retards`, deck: 'Les retards s’accumulent au fil du mois.' },
        great: { head: `${n}, usager heureux`, deck: `Peu d’attente et un trajet rapide de ${home} à ${dest}.` },
        better: { head: `Le changement de service profite à ${n}`, deck: `Le trajet de ${n} depuis ${home} est plus court.` },
        worse: { head: `${n} perd du temps avec le changement de service`, deck: `Le trajet de ${n} depuis ${home} est plus long.` },
      };
      return by[String(p.kind)] ?? { head: `Un mois en autobus avec ${n}`, deck: `De ${home} à ${dest}.` };
    },
    quiet: () => ({ head: 'Un mois tranquille dans les autobus', deck: 'Aucune perturbation majeure, constatent nos journalistes.' }),
    budgetPassed: (p) => ({ head: 'Le conseil adopte le budget du transport en commun', deck: `Le budget de la présidence est adopté ${p.yes}–${p.no}.` }),
    budgetRewritten: (p) => ({ head: 'Le conseil désavoue la présidence sur le budget', deck: `Les conseillers ont adopté leur propre budget, avec une taxe en hausse de ${String(p.levy).replace('.', ',')} %.` }),
    planApproved: (p) => ({ head: 'La Commission approuve les changements de lignes', deck: `Le plan de service est adopté ${p.yes}–${p.no}; il entrera en vigueur au prochain changement de service.` }),
    planRejected: (p) => ({ head: 'La Commission rejette les changements de lignes', deck: `Le plan de service est rejeté ${p.yes}–${p.no}.` }),
    motionFiled: (p) => ({ head: `${p.mover} veut le retour de la ligne ${p.route}`, deck: 'Une motion demande au conseil d’annuler la coupure.' }),
    motionPassed: (p) => ({ head: `Le conseil ordonne le retour de la ligne ${p.route}`, deck: 'La présidence est désavouée; la ligne revient au prochain changement de service.' }),
    strike: () => ({ head: 'Les autobus s’arrêtent : les chauffeurs débraient', deck: 'Pour la deuxième fois en trois hivers, Ottawa est privée de ses autobus.' }),
    strikeOver: (p) => ({ head: 'Les autobus reprennent la route', deck: `Le règlement : ${String(p.wage).replace('.', ',')} % par an.` }),
    contract: (p) => ({ head: p.protest ? 'Les chauffeurs signent sous protestation' : 'Les chauffeurs ratifient une nouvelle convention', deck: `${String(p.wage).replace('.', ',')} % par an${p.years ? ` pendant ${p.years} ans` : ''}; pas de grève.` }),
    election: (p) => ({ head: 'Ottawa vote : un nouveau conseil pour le transport en commun', deck: `${p.allies} conseillers penchent maintenant du côté de la présidence (${p.before} avant).` }),
    stoRapibus: () => ({ head: 'Gatineau inaugure son Rapibus', deck: 'Le corridor de la STO le long de l’ancienne voie ferrée change les trajets d’une rive à l’autre.' }),
    gatineauVotes: (p) => ({ head: 'Gatineau vote', deck: p.agenda === 'taxFreeze' ? 'Le nouveau conseil promet de geler les taxes; la STO cherchera des économies.' : 'Le conseil de la STO garde le cap.' }),
    fundingLost: () => ({ head: 'La Province reprend l’argent des autobus après la hausse des tarifs', deck: 'Les tarifs ont augmenté plus vite que l’entente ne le permettait.' }),
    reshuffle: (p) => ({ head: 'Le conseil remanie la Commission du transport en commun', deck: `Sortent : ${p.out}.` }),
    projectApproved: (p) => ({ head: `Le conseil appuie la ${p.name}`, deck: `La conception et l’évaluation environnementale commencent pour une ligne de ${mFR(p.cost)}.` }),
    projectShelved: (p) => ({ head: `La ${p.name} mise sur la glace`, deck: p.stage === 'contract' ? 'Le conseil recule devant le prix du contrat.' : p.stage === 'cancelled' ? 'La présidence met fin au projet; l’argent dépensé est perdu.' : 'Le conseil refuse de payer la conception.' }),
    lineFunded: (p) => ({ head: `${p.gov === 'province' ? 'L’Ontario' : 'Le gouvernement fédéral'} accorde ${mFR(p.amount)} à la ${p.name}`, deck: 'Le tiers du coût, avec conditions.' }),
    contractAwarded: (p) => ({ head: `Contrat accordé pour la ${p.name}`, deck: `${mFR(p.price)}.` }),
    constructionStarts: (p) => ({ head: `Les travaux de la ${p.name} commencent`, deck: `Un contrat de ${mFR(p.price)}; les trains sont attendus en ${String(p.opens).slice(0, 4)}.` }),
    overrun: (p) => ({ head: `Dépassement de coûts pour la ${p.name}`, deck: p.choice === 'trim' ? 'Des stations simplifiées pour économiser.' : p.choice === 'pause' ? 'Les travaux s’arrêtent le temps de relancer les appels d’offres.' : p.choice === 'p3' ? `Le consortium assume l’essentiel des ${mFR(p.amount)}.` : `La Ville trouve ${mFR(p.amount)} de plus.` }),
    projectDelay: (p) => ({ head: `La ${p.name} retardée`, deck: `L’ouverture est repoussée de ${p.months} mois.` }),
    sinkhole: (p) => ({ head: `Un affaissement au-dessus du tunnel de la ${p.name}`, deck: 'Les travaux s’arrêtent au centre-ville le temps d’évaluer les dégâts.' }),
    lineOpen: (p) => ({ head: `La ${p.name} ouvre`, deck: `${String(p.km).replace('.', ',')} km et ${p.stations} stations : les usagers découvrent la nouvelle ligne.` }),
    lineTrouble: (p) => ({ head: `Débuts difficiles pour la ${p.name}`, deck: 'Pannes de portes et trains immobilisés exaspèrent les usagers.' }),
  },
  diary: {
    great: (n) => `Départ à ${hhmm(n?.depart ?? 0)}, ${n?.waitMin ?? 0} min d’attente, ${routes(n)}. ${n?.minutes} minutes porte à porte. Facile.`,
    fine: (n) => `${n?.minutes} minutes porte à porte avec la ${routes(n)}; attendu ${n?.waitMin} min.`,
    cold: (n) => `Attendu ${n?.waitMin} min à ${n?.stop} par ${n?.temp} °C. Je ne sentais plus mes orteils.`,
    storm: (n) => `De la neige partout : la ${r1(n)} avait ${n?.late} min de retard.`,
    late: (n) => `La ${r1(n)} avait ${n?.late} min de retard.`,
    missed: (n) => `Mon autobus n’est jamais venu. ${n?.waitMin} min à ${n?.stop} avant le suivant.`,
    highFloor: (n) => `Un vieil autobus à plancher élevé est arrivé et je n’ai pas pu monter. Attendu ${n?.waitMin} min pour un autre.`,
    noBus: (_n, p) => `Aucun autobus possible depuis ${p.home.name} à cette heure. Une voisine a dû me conduire.`,
    long: (n) => `${n?.minutes} minutes dans chaque sens. Adieu mon après-midi.`,
    better: (_n, _p, d) => `Depuis le changement de service, mon trajet est ${Math.abs(d)} minutes plus court!`,
    worse: (_n, _p, d) => `Depuis le changement de service, mon trajet prend ${Math.abs(d)} minutes de plus.`,
  },
  post: (post, persona, reasonText) => {
    const p = post.params;
    switch (post.kind) {
      case 'diary': return persona ? OPINION_FR.diary[p.kind as DiaryKind]?.({ minutes: Number(p.minutes), waitMin: Number(p.wait), temp: Number(p.temp),
        routes: [String(p.route)], stop: String(p.stop || 'l’arrêt'), late: Number(p.late ?? 0), depart: 0, arrive: 0, missed: false, highFloor: false,
        none: false }, persona, Number(p.delta ?? 0)) ?? '' : '';
      case 'storm': return `${p.cm} cm de neige et aucun autobus en vue.`;
      case 'cold': return `${p.temp} °C à l’arrêt ce matin. Attendre l’autobus, c’est brutal.`;
      case 'change': return p.kind === 'newRoute' ? `J’ai essayé la nouvelle ${p.route} aujourd’hui. Enfin!` : `Ils ont supprimé la ${p.route}. Comment je vais au travail maintenant?`;
      case 'fares': return 'Encore une hausse de tarifs? Je pense reprendre la voiture.';
      case 'taxes': return 'La taxe de transport en commun a augmenté sur mon compte de taxes. Pour quoi, au juste?';
      default: return reasonText;
    }
  },
  reasonGood: {
    frequency: 'Un autobus aux quelques minutes chez moi. J’adore.', reach: 'Je peux aller tellement plus loin en autobus maintenant.',
    waits: 'J’attends moins qu’avant.', events: 'Bon de voir la Commission tenir ses promesses.', fares: 'Les tarifs sont raisonnables pour ce qu’on a.',
    taxes: 'Bonne nouvelle : la taxe de transport n’a pas augmenté.', spillover: 'L’autobus, ça marche bien pour moi ces temps-ci.', reliability: 'Les autobus passent quand ils doivent.',
  },
  reasonBad: {
    frequency: 'Mon autobus passe aux demi-heures. Pas assez.', reach: 'Aller n’importe où en autobus d’ici prend une éternité depuis les changements.',
    waits: 'J’attends plus longtemps qu’avant.', reliability: 'Encore un autobus qui n’est jamais venu.', crowding: 'Autobus bondé encore ce matin. Impossible de monter.',
    weather: 'Debout dans le froid à un arrêt sans abri, encore.', fares: 'Les tarifs sont trop chers pour ce qu’on a.', taxes: 'Mes taxes ont augmenté pour ça?',
    cuts: 'Des compressions, encore des compressions.', strike: 'Je n’ai pas oublié la grève.', events: 'Difficile de croire les promesses de la Commission.',
    construction: 'Les travaux dans ma rue n’en finissent plus. Des détours partout.',
    spillover: 'Prendre l’autobus, c’est une corvée.',
  },
  zoneSub: (d) => `${d} · Ottawa`,
  residents: 'résidents',
  transitShare: 'des trajets en transport en commun',
  jobsIn45: 'Emplois à moins de 45 min en transport en commun',
  typicalWait: 'Attente typique',
  was2010: (x) => `${x} en 2010`,
  livesHere: 'Habite près d’ici',
  usualTrip: (m, r) => `Aller-retour habituel en semaine : ${m} min porte à porte${r ? ` (${r})` : ''}`,
  noUsualTrip: 'Aucun trajet en transport en commun possible aux heures de ses déplacements.',
  travels: (d) => `Se déplace le ${d}`,
  dayNames: ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'],
  out: 'Aller',
  back: 'Retour',
  todayTrips: 'Ses trajets',
  diaryTitle: 'Journal',
  noDiary: 'Le journal se remplit au fil des jours.',
  leg: {
    walk: (m) => `Marche ${m} min`,
    wait: (m, s) => `Attente ${m} min à ${s}`,
    ride: (r, to) => `Ligne ${r} jusqu’à ${to}`,
    arrive: (p) => `Arrivée à ${p}`,
  },
  now: {
    home: 'À la maison', away: (p) => `À ${p}`, walking: 'À pied', waiting: (s) => `Attend à ${s}`, riding: (r) => `Dans la ${r}`,
  },
  mood: (m) => (m <= -2 ? 'pénible' : m < 0 ? 'mauvais' : m === 0 ? 'correct' : m === 1 ? 'bon' : 'excellent'),
  follow: 'Suivre',
  opinionLegend: ['Désapprouvent', 'Approuvent'],
  weather: { clear: 'dégagé', cloudy: 'nuageux', rain: 'pluie', snow: 'neige', snowstorm: 'tempête de neige', downpour: 'averses', freezing: 'pluie verglaçante', cold: 'grand froid', hot: 'chaud' },
  dismiss: 'Fermer',
};
