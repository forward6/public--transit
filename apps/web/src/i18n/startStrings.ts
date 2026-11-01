// The start screen (EN/FR).

export interface StartStrings {
  kicker: string;
  pitch: string;
  continue: string;
  saved: (date: string, time: string) => string;
  stats: (approval: string, reserve: string) => string;
  newGame: string;
  confirmTitle: string;
  confirmBody: (date: string) => string;
  confirmYes: string;
  cancel: string;
  starting: string;
  tips: string[];
  footer: string;
  menu: string;
}

export const START_EN: StartStrings = {
  kicker: 'Ottawa–Gatineau · December 2010',
  pitch: 'You chair Ottawa’s Transit Commission. Redesign the network, balance the books, win council’s votes and keep riders on side, while Gatineau’s STO goes its own way.',
  continue: 'Continue',
  saved: (d, t) => `Your campaign: ${d}, ${t}`,
  stats: (a, r) => `Approval ${a} · reserve ${r}`,
  newGame: 'New game',
  confirmTitle: 'Start a new campaign?',
  confirmBody: (d) => `This replaces the campaign saved in this browser (${d}). It can’t be undone.`,
  confirmYes: 'Start over',
  cancel: 'Keep my campaign',
  starting: 'Starting a new campaign…',
  tips: [
    'Tap any bus, train or stop to see where it’s going and who’s on board.',
    'Plan: draw routes and change service. Plans take effect at the next service change.',
    'Riders and Opinion show where it’s busy and what people think. Council votes on the big items.',
  ],
  footer: 'Saved in this browser only. The agencies are real; every person, politician, union and newspaper is fictional.',
  menu: 'Menu',
};

export const START_FR: StartStrings = {
  kicker: 'Ottawa–Gatineau · décembre 2010',
  pitch: 'Vous présidez la Commission du transport en commun d’Ottawa. Redessinez le réseau, équilibrez les comptes, gagnez les votes du conseil et gardez la confiance des usagers, pendant que la STO de Gatineau suit sa propre voie.',
  continue: 'Continuer',
  saved: (d, t) => `Votre partie : ${d}, ${t}`,
  stats: (a, r) => `Approbation ${a} · réserve ${r}`,
  newGame: 'Nouvelle partie',
  confirmTitle: 'Commencer une nouvelle partie ?',
  confirmBody: (d) => `Elle remplacera la partie sauvegardée dans ce navigateur (${d}). C’est irréversible.`,
  confirmYes: 'Recommencer',
  cancel: 'Garder ma partie',
  starting: 'Préparation d’une nouvelle partie…',
  tips: [
    'Touchez un autobus, un train ou un arrêt pour voir où il va et qui est à bord.',
    'Planifier : tracez des lignes et modifiez le service. Les plans entrent en vigueur au prochain changement de service.',
    'Achalandage et Opinion montrent où c’est occupé et ce que les gens pensent. Le conseil vote sur les grands dossiers.',
  ],
  footer: 'Sauvegardé dans ce navigateur seulement. Les sociétés de transport sont réelles; les personnes, élus, syndicat et journaux sont fictifs.',
  menu: 'Menu',
};
