/**
 * POURQUOI CES JOURS-LÀ. Module PUR.
 *
 * ── LE TROU QUE CE MODULE FERME ────────────────────────────────────────────
 * Le moteur prend des décisions de CALENDRIER que personne ne voit: il ajoute
 * un jour de cuisine que l'élève n'a pas coché parce que sa fenêtre le lui
 * impose, il coupe la fenêtre à dimanche, il saute un midi marqué absent, il
 * retire le petit-déjeuner d'aujourd'hui parce qu'il est 20 h. Vu de l'écran,
 * ces décisions sont indiscernables d'un bug — et un plan qui a l'air faux ne
 * se cuisine pas.
 *
 * Mesuré: jours déclarés `sun, wed`, plan généré un JEUDI, sessions écrites
 * `thu, sun, wed`. Le jeudi est VOULU (`meal_generation.ts`, branche `tooLate`:
 * rien de cuisiné dimanche ne peut nourrir jeudi). Le générateur demandait déjà
 * au modèle de le DIRE. Le modèle ne l'a pas dit, ou personne ne l'a lu — et
 * c'est précisément pourquoi cette phrase ne peut pas rester au modèle.
 *
 * ── DÉTERMINISTE, JAMAIS DEMANDÉ AU MODÈLE ────────────────────────────────
 * On sait ce qu'on a décidé. Une jolie phrase inventée par le modèle peut être
 * fausse, et une explication fausse est PIRE que pas d'explication: elle apprend
 * à l'élève que le texte sous son plan ne décrit pas son plan.
 *
 * ── L'ASSEMBLAGE EST BACKEND, ET C'EST LA RÈGLE, PAS UNE COMMODITÉ ─────────
 * `request_report_gate.ts:29-34` porte le raisonnement mot pour mot: assembler
 * côté écran obligerait à y dupliquer les gardes, et une garde en double
 * diverge — la cicatrice la plus chère de ce dépôt. Le backend connaît la
 * langue de l'élève (`resolveArtifactLocale` → `profiles.locale`), assemble,
 * garde, et rend des PHRASES FINIES. L'écran les affiche, il ne les décide pas.
 *
 * ⛔ IL N'EXISTERA JAMAIS DE MIROIR DE CES GABARITS DANS `frontend/`.
 *
 * ── CHAQUE PHRASE EST ARMÉE PAR UNE PRÉMISSE ──────────────────────────────
 * Aucune ligne ne sort d'un fait absent. `addedCookDays: []` ne produit pas
 * « aucun jour ajouté »: il ne produit RIEN. Une phrase qui dit une absence
 * apprend au lecteur à ne pas lire les autres.
 *
 * ── SAUF UNE, ET C'EST LA DEMANDE, MOT POUR MOT ───────────────────────────
 * « normalement il devrait y avoir un texte d'affiché qui explique les choix de
 * sophia de manière constante (même si tout va bien, petit texte court) ». Il y
 * a donc TOUJOURS une ligne: quand rien d'inhabituel n'a été décidé, on dit ce
 * qui a été fait — la fenêtre, et qu'elle suit ce qui a été demandé. Ce n'est
 * pas une phrase de remplissage: c'est un FAIT, et il est vérifiable à l'œil sur
 * la grille juste à côté.
 *
 * ── CE QUE CE MODULE NE DIT JAMAIS ────────────────────────────────────────
 * Aucun objectif, aucun poids, aucune calorie, aucun jugement sur ce qui est
 * mangé. Il explique un CALENDRIER et un ARGENT — deux choses publiques. Le
 * budget se nomme parce que l'élève l'a saisi lui-même; ce qui a été sacrifié
 * pour y tenir se nomme parce que c'est la seule façon de comprendre pourquoi
 * il y a des lentilles.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

// G5 — LE SEUIL EST LU LÀ OÙ IL DÉCIDE, jamais recopié ici. Voir la porte ⑤.
import { timeAllowsASecondDish } from "./household_portions.ts";
import { dayTokenOfDate } from "./local_date.ts";
import { findGuiltTripping } from "./reengagement.ts";
import { type DayToken } from "./tokens.ts";

/** Les deux seules langues que ce module sait écrire. Miroir de `ReportLocale`. */
export type RationaleLocale = "fr" | "en";

/**
 * POURQUOI UNE PHRASE N'EST PAS SORTIE. Nommé, jamais un booléen.
 *
 * `guilt_tripping` est un BUG de nos propres gabarits et doit réveiller
 * quelqu'un; `nothing_to_explain` est le produit qui fonctionne — le cas où le
 * moteur a fait exactement ce qu'on lui a demandé ET où l'appelant n'a même pas
 * su lire la fenêtre.
 */
export type RationaleRefusal = "guilt_tripping" | "nothing_to_explain";

/**
 * LES FAITS DÉJÀ CONNUS AU MOMENT OÙ LE PLAN EST ÉCRIT.
 *
 * ⚠️ TOUTES LES PROPRIÉTÉS SONT REQUISES. Un appelant qui n'a pas su lire un
 * fait passe `null` ou `[]` EXPLICITEMENT — et les deux ne disent pas la même
 * chose: `[]` dit « aucun », `null` dit « je n'ai pas su lire ». La fonction
 * jette sur un `undefined`, parce qu'un champ oublié est le seul cas où on ne
 * peut affirmer ni l'un ni l'autre.
 */
export interface PlanRationaleFacts {
  /** Les jours que l'élève a COCHÉS. `[]` = il n'en a coché aucun. */
  declaredCookDays: readonly DayToken[];
  /**
   * Les jours que le moteur a AJOUTÉS parce que la fenêtre l'exigeait.
   * `[]` = aucun ajout, et c'est le cas nominal.
   */
  addedCookDays: readonly DayToken[];
  /** La fenêtre écrite en base, telle que `resolveRequestedWindow` l'a rendue. */
  window: { startsOn: string; durationDays: number };
  /** Ce que l'élève a DEMANDÉ, avant résolution. Sert à dire ce qui a été coupé. */
  requestedWindow: { startsOn: string; durationDays: number } | null;
  /**
   * LE JOUR LOCAL DE L'ÉLÈVE et son jeton — `localDateInZone` / `dayTokenInZone`.
   * REQUIS: sans lui, « ton plan commence aujourd'hui » est indécidable, et le
   * fuseau du SERVEUR classerait un dîner la veille (`local_date.ts:8-12`).
   */
  today: { localDate: string; dayToken: DayToken };
  /**
   * L'HEURE LOCALE, en minutes depuis minuit. `null` = pas résolue.
   * C'est ce qui permet de dire « il est 21 h, le dîner d'aujourd'hui n'est
   * plus une question » plutôt que de composer un repas déjà passé.
   */
  localMinuteOfDay: number | null;
  /**
   * Les créneaux TOMBÉS PARCE QUE LA JOURNÉE ÉTAIT ENTAMÉE, sur le premier jour
   * de la fenêtre. `[]` = aucun. Distinct de `awayInWindow`: une absence est une
   * DÉCLARATION de l'élève, une heure passée est une DÉCISION du moteur, et
   * les confondre ferait dire « tu avais dit que tu n'étais pas là » à quelqu'un
   * qui n'a rien dit.
   */
  slotsDroppedToday: readonly string[];
  /** Les créneaux marqués absents DANS la fenêtre. `[]` = personne n'est parti. */
  awayInWindow: readonly { day: DayToken; slot: string }[];
  /** Le budget appliqué. `null` = aucun budget n'a été lu. */
  budgetAmount: number | null;
  /**
   * Le nombre de bouches réellement servies. `null` sur la lane individuelle.
   * REQUIS: `1` et `null` ne disent pas la même chose.
   */
  mouthsServed: number | null;
  /**
   * QUI A PRIS LA MAIN, et donc ne mange pas ce plan. `[]` = personne.
   * Prénoms, jamais d'identifiants: la phrase se lit à voix haute à table.
   */
  handTakenBy: readonly string[];
  /** QUI A ÉTÉ FUSIONNÉ dans ce plan. `[]` = aucune fusion. */
  mergedIn: readonly string[];
  /**
   * G5 — LE TEMPS DE CUISINE D'UNE SEMAINE, EN MINUTES. `null` = pas lu.
   *
   * ⚠️ REQUIS ET NULLABLE, jamais optionnel — la posture de tout ce module.
   * `null` dit « le foyer n'a coché aucun jour, ou n'a déclaré aucune durée »,
   * et il fait TAIRE la phrase: on n'explique pas une décision qu'on n'a pas
   * prise. `0` serait une affirmation (« ils ne cuisinent pas »), et personne
   * ne l'a écrite.
   *
   * ⚠️ C'EST UN TOTAL HEBDOMADAIRE, PAS LA DURÉE D'UNE SESSION. La colonne
   * `cooking_time_min` est PAR SESSION (vérifié le 2026-08-14); le produit qui
   * arrive ici est `cookDays.length × cooking_time_min`, calculé une seule fois
   * par `weeklyCookingMinutes` (`household_portions.ts`). Passer la durée d'une
   * session ferait dire « avec 1 h 30 par semaine » à un foyer qui cuisine
   * trois heures, et la phrase serait fausse sans que rien n'échoue.
   *
   * ⚠️ LA LANE INDIVIDUELLE PASSE `null`, ET C'EST DÉFINITIF. Le seuil décide
   * si un foyer peut cuire DEUX plats; une personne seule n'a jamais eu cette
   * question, et lui dire « tout le monde mange le même plat » serait une
   * évidence servie comme une contrainte. La prémisse ci-dessous l'exige de
   * toute façon: la phrase ne sort qu'au-dessus d'une bouche.
   */
  weeklyCookingMinutes: number | null;
  /**
   * R4 — CE QUE LE PLAT COMMUN SUIT, ET DE QUI C'EST LA LIGNE. `null` = personne
   * n'a déclaré de régime à cette table, et la phrase ne sort pas.
   *
   * ⚠️ REQUIS ET NULLABLE, jamais optionnel — la posture de tout ce module. Un
   * `?` ferait passer la lane du foyer sans rien changer, et le lot serait
   * construit sans être branché.
   *
   * ⚠️ `heldBy` PORTE DES PRÉNOMS, JAMAIS D'IDENTIFIANTS: la phrase se lit à
   * voix haute à table, comme `handTakenBy` et `mergedIn` au-dessus.
   *
   * ⚠️ LA LANE INDIVIDUELLE PASSE `null`, ET C'EST DÉFINITIF. « Le plat commun
   * est végétarien, c'est ce que tu manges » n'apprend rien à quelqu'un qui
   * mange seul: il n'y a pas de commun. La prémisse ci-dessous l'exige de toute
   * façon — la phrase ne sort qu'au-dessus d'une bouche.
   */
  sharedDishRegime: { regime: string; heldBy: readonly string[] } | null;
  /**
   * LE MODE DE CUISSON DEMANDÉ À LA COMPOSITION, ET CE QU'IL A DONNÉ.
   * `null` = rien n'a été demandé, et la phrase ne sort pas.
   *
   * ⚠️ REQUIS ET NULLABLE, jamais optionnel — la posture de tout ce module. Un
   * `?` ferait passer les deux lanes sans rien changer, et le lot serait
   * construit sans être branché: exactement ce que ce dépôt appelle « une
   * ceinture armée sur un coffre vide ».
   *
   * ⚠️ `capped` ET `unused` VIENNENT DE `capCookingShape`, jamais d'une seconde
   * comparaison écrite ici. Le plafond est décidé à UN endroit; le relire ici
   * ferait deux lectures d'une même règle, et le jour où l'échelle gagne un
   * barreau, celle-ci ferait dire au plan l'inverse de ce qu'il a fait.
   *
   * ⚠️ `outsideSharedPot` PORTE DES PRÉNOMS, JAMAIS D'IDENTIFIANTS — comme
   * `handTakenBy`, `mergedIn` et `sharedDishRegime.heldBy`: la phrase se lit à
   * voix haute à table. `[]` = personne, et c'est ce qui fait taire la phrase du
   * plafond même quand `capped` est vrai — on ne dit pas « la part de » sans
   * pouvoir dire de qui.
   *
   * ⚠️ LA LANE INDIVIDUELLE PASSE `null`, ET C'EST DÉFINITIF. Une personne
   * seule n'a jamais eu la question « un plat ou deux ». La prémisse ci-dessous
   * l'exige de toute façon: la phrase ne sort qu'au-dessus d'une bouche.
   */
  cookingShapeChoice: {
    capped: boolean;
    unused: boolean;
    outsideSharedPot: readonly string[];
  } | null;
}

export interface PlanRationale {
  /** Les phrases finies, dans la langue du contenu. `[]` = rien à dire. */
  lines: string[];
  /** Pourquoi rien ne sort. `null` quand il y a des lignes. */
  refusal: RationaleRefusal | null;
}

// ---------------------------------------------------------------------------
// LES GABARITS
// ---------------------------------------------------------------------------

/**
 * ⚠️ AUCUN DE CES GABARITS NE PORTE UN JUGEMENT, NI UN REPROCHE.
 *
 * « tu n'avais pas coché ce jour-là » se lit comme une correction; « c'est un
 * jour que tu n'avais pas demandé » dit le même fait sans le retourner contre
 * la personne. La différence n'est pas cosmétique: la porte 3, plus bas, coupe
 * TOUT si un de ces gabarits se met à culpabiliser, et elle ne devrait jamais
 * mordre.
 *
 * Et aucun ne dit POURQUOI le budget est ce qu'il est, ni si c'est assez.
 */
const COPY = {
  fr: {
    days: {
      mon: "lundi",
      tue: "mardi",
      wed: "mercredi",
      thu: "jeudi",
      fri: "vendredi",
      sat: "samedi",
      sun: "dimanche",
    } as Record<string, string>,
    slots: {
      breakfast: "le petit-déjeuner",
      snack_am: "la collation du matin",
      lunch: "le déjeuner",
      snack_pm: "le goûter",
      dinner: "le dîner",
      before_bed: "la collation du soir",
    } as Record<string, string>,
    and: " et ",
    windowToday: (n: number) =>
      n === 1
        ? "Ce plan couvre aujourd'hui."
        : `Ce plan couvre ${n} jours, à partir d'aujourd'hui.`,
    windowLater: (day: string, date: string, n: number) =>
      n === 1
        ? `Ce plan couvre ${day} ${date}.`
        : `Ce plan couvre ${n} jours, à partir de ${day} ${date}.`,
    windowShortened: (asked: number, kept: number) =>
      `Tu en avais demandé ${asked} : la semaine se termine avant, il en reste ${kept}.`,
    cookDeclaredKept: (days: string) => `Tu cuisines ${days}, et c'est ce qui a été gardé.`,
    cookAdded: (added: string, declared: string) =>
      `Une session est posée ${added} : tu cuisines ${declared}, et rien de cuisiné ` +
      `là ne peut nourrir les jours d'avant. C'est un jour que tu n'avais pas demandé.`,
    cookAddedNoDeclared: (added: string) =>
      `Une session est posée ${added}, un jour que tu n'avais pas demandé : ` +
      `sans elle, les premiers jours n'auraient rien à réchauffer.`,
    slotsDropped: (slots: string) =>
      `Pour aujourd'hui, ${slots} ne sont plus au plan : la journée est déjà entamée.`,
    slotDropped: (slot: string) =>
      `Pour aujourd'hui, ${slot} n'est plus au plan : la journée est déjà entamée.`,
    away: (n: number) =>
      n === 1
        ? "Un repas est sauté, tu l'avais marqué hors de la maison."
        : `${n} repas sont sautés, tu les avais marqués hors de la maison.`,
    budget: (amount: number) => `Le budget des courses est ${amount}.`,
    budgetCuts:
      "Pour y tenir, ce sont d'abord les protéines chères, puis les produits " +
      "hors saison, puis la variété qui cèdent — jamais les portions.",
    mouths: (n: number) => `Les quantités sont faites pour ${n} bouches.`,
    // ── G5 · LE TEMPS A PLAFONNÉ LA FORME ────────────────────────────────
    // ⚠️ UN FAIT, JAMAIS UN REPROCHE. « Tu n'as pas assez de temps pour deux
    // plats » se lit comme une correction; celle-ci dit le même fait sans le
    // retourner contre personne, et le tiret ferme la phrase du côté du temps,
    // pas du côté de la personne. Aucun impératif, aucune suggestion d'en
    // dégager plus: la porte 3, plus bas, coupe TOUT si un gabarit se met à
    // culpabiliser, et celui-ci ne doit jamais la faire mordre.
    oneDishByTime: (time: string) =>
      `Avec ${time} par semaine en cuisine, tout le monde mange le même plat — ` +
      `c'est ce que le temps permet.`,
    hours: (n: string) => `${n} h`,
    hoursMinutes: (h: string, m: string) => `${h} h ${m}`,
    minutes: (n: string) => `${n} min`,
    handTaken: (names: string) => `${names} compose de son côté : ce plan ne le nourrit pas.`,
    handTakenMany: (names: string) =>
      `${names} composent de leur côté : ce plan ne les nourrit pas.`,
    mergedIn: (names: string) => `Ce plan cuisine aussi pour ${names}.`,
    // ── R4 · LE PLAT COMMUN SUIT LE PLUS RESTRICTIF ──────────────────────
    // ⚠️ UN FAIT, JAMAIS UN REPROCHE, et c'est la moitié qui compte ici. « Le
    // plat commun est végétarien PARCE QUE Christèle ne mange pas de viande »
    // désigne quelqu'un comme la cause d'une contrainte subie par les autres;
    // « c'est ce que Christèle mange » dit exactement le même fait sans le
    // retourner contre elle. Aucun regret, aucune compensation proposée: la
    // porte 3 coupe TOUT si un gabarit se met à culpabiliser.
    sharedRegime: (regime: string, names: string) =>
      `Le plat commun est ${regime} : c'est ce que ${names} mange.`,
    sharedRegimeMany: (regime: string, names: string) =>
      `Le plat commun est ${regime} : c'est ce que ${names} mangent.`,
    // ── LE MODE DE CUISSON DEMANDÉ, ET CE QU'IL A COÛTÉ ──────────────────
    //
    // ⚠️ UN FAIT, JAMAIS UN REPROCHE, ET JAMAIS UNE SUGGESTION. « Tu aurais dû
    // choisir autre chose » se lit comme une correction; ces deux-ci disent ce
    // qui a été demandé et ce que ça a donné, et s'arrêtent là. La porte 3, plus
    // bas, coupe TOUT si un gabarit se met à culpabiliser, et ceux-ci ne
    // doivent jamais la faire mordre.
    //
    // ⚠️ ET AUCUN NE DIT POURQUOI QUELQU'UN NE SORT PAS DE LA CASSEROLE. « La
    // part de X ne sort pas du plat commun » est un fait de cuisine; nommer sa
    // raison dirait son objectif à toute la table, et ce module n'a jamais le
    // droit de nommer un objectif.
    shapeCappedOne: (names: string) =>
      `Tu as demandé un seul plat pour tout le monde, et c'est ce qui a été ` +
      `composé. La part de ${names} ne sort pas du plat commun : elle est ` +
      `servie au plus près, sans plat à part.`,
    shapeCappedMany: (names: string) =>
      `Tu as demandé un seul plat pour tout le monde, et c'est ce qui a été ` +
      `composé. Les parts de ${names} ne sortent pas du plat commun : elles ` +
      `sont servies au plus près, sans plat à part.`,
    shapeUnused:
      "Tu as ouvert la possibilité de plats séparés. Personne à cette table " +
      "n'en a besoin cette semaine : il n'y a qu'une cuisson.",
    regimes: {
      vegetarian: "végétarien",
      vegan: "végane",
      pescatarian: "pescétarien",
    } as Record<string, string>,
  },
  en: {
    days: {
      mon: "Monday",
      tue: "Tuesday",
      wed: "Wednesday",
      thu: "Thursday",
      fri: "Friday",
      sat: "Saturday",
      sun: "Sunday",
    } as Record<string, string>,
    slots: {
      breakfast: "breakfast",
      snack_am: "the morning snack",
      lunch: "lunch",
      snack_pm: "the afternoon snack",
      dinner: "dinner",
      before_bed: "the evening snack",
    } as Record<string, string>,
    and: " and ",
    windowToday: (n: number) =>
      n === 1 ? "This plan covers today." : `This plan covers ${n} days, starting today.`,
    windowLater: (day: string, date: string, n: number) =>
      n === 1
        ? `This plan covers ${day} ${date}.`
        : `This plan covers ${n} days, starting ${day} ${date}.`,
    windowShortened: (asked: number, kept: number) =>
      `You asked for ${asked}: the week ends before that, so ${kept} are left.`,
    cookDeclaredKept: (days: string) => `You cook on ${days}, and that is what was kept.`,
    cookAdded: (added: string, declared: string) =>
      `A session is set for ${added}: you cook on ${declared}, and nothing cooked ` +
      `then can feed the days before it. It is a day you did not ask for.`,
    cookAddedNoDeclared: (added: string) =>
      `A session is set for ${added}, a day you did not ask for: without it the ` +
      `first days would have nothing to reheat.`,
    slotsDropped: (slots: string) =>
      `For today, ${slots} are off the plan: the day is already under way.`,
    slotDropped: (slot: string) =>
      `For today, ${slot} is off the plan: the day is already under way.`,
    away: (n: number) =>
      n === 1
        ? "One meal is skipped, you marked it away from home."
        : `${n} meals are skipped, you marked them away from home.`,
    budget: (amount: number) => `The shopping budget is ${amount}.`,
    budgetCuts:
      "To stay inside it, expensive proteins give first, then out-of-season " +
      "produce, then variety — never the portions.",
    mouths: (n: number) => `Quantities are made for ${n} people.`,
    // Même posture qu'en français: un fait, jamais un reproche. « only 1 hour »
    // serait déjà un jugement — l'adverbe est ce qui transforme une mesure en
    // manque.
    oneDishByTime: (time: string) =>
      `With ${time} of cooking a week, everyone eats the same dish — that is ` +
      `what the time allows.`,
    hours: (n: string) => (n === "1" ? "1 hour" : `${n} hours`),
    hoursMinutes: (h: string, m: string) =>
      h === "1" ? `1 hour ${m}` : `${h} hours ${m}`,
    minutes: (n: string) => `${n} min`,
    handTaken: (names: string) => `${names} is composing separately: this plan does not feed them.`,
    handTakenMany: (names: string) =>
      `${names} are composing separately: this plan does not feed them.`,
    mergedIn: (names: string) => `This plan also cooks for ${names}.`,
    // Même posture qu'en français: un fait, jamais un reproche. « has to be »
    // serait déjà une plainte — c'est le verbe qui transforme une ligne en
    // contrainte subie.
    sharedRegime: (regime: string, names: string) =>
      `The shared dish is ${regime}: that is what ${names} eats.`,
    sharedRegimeMany: (regime: string, names: string) =>
      `The shared dish is ${regime}: that is what ${names} eat.`,
    // Même posture qu'en français: un fait, jamais un reproche, jamais une
    // suggestion — et jamais la raison pour laquelle quelqu'un ne sort pas de
    // la casserole commune.
    shapeCappedOne: (names: string) =>
      `You asked for one dish for everyone, and that is what was cooked. ` +
      `${names}'s share does not come out of the shared dish: it is served as ` +
      `close as it can be, with no dish apart.`,
    shapeCappedMany: (names: string) =>
      `You asked for one dish for everyone, and that is what was cooked. The ` +
      `shares of ${names} do not come out of the shared dish: they are served ` +
      `as close as they can be, with no dish apart.`,
    shapeUnused:
      "You left room for separate dishes. Nobody at this table needs one this " +
      "week: there is a single cook.",
    regimes: {
      vegetarian: "vegetarian",
      vegan: "vegan",
      pescatarian: "pescatarian",
    } as Record<string, string>,
  },
} as const;

/**
 * Une énumération lisible à voix haute.
 *
 * Un jeton inconnu est RENDU TEL QUEL plutôt que jeté — même arbitrage que
 * `request_report_gate.ts::renderDays`: perdre un jour rend la phrase moins
 * précise, le jeter en silence la rend fausse tout en ayant l'air complète.
 *
 * ⚠️ EXPORTÉ POUR `plan_tradeoffs.ts` (L35-a), ET C'EST LE POINT: le module
 * frère écrit d'autres phrases, dans les mêmes deux langues, et il ne doit PAS
 * porter une seconde façon d'énumérer des prénoms ni une seconde table de
 * jours. « Deux copies d'une même règle divergent, et c'est celle qu'on regarde
 * le moins qui garde l'ancienne » — la table de langue reste ICI, une fois.
 */
export function joinList(
  items: readonly string[],
  locale: RationaleLocale,
): string {
  const named = items.filter((s) => String(s ?? "").trim().length > 0);
  if (named.length === 0) return "";
  if (named.length === 1) return named[0];
  return `${named.slice(0, -1).join(", ")}${COPY[locale].and}${named[named.length - 1]}`;
}

/** ⚠️ EXPORTÉ POUR `plan_tradeoffs.ts` — voir `joinList` juste au-dessus. */
export function renderDays(
  days: readonly string[],
  locale: RationaleLocale,
): string {
  return joinList(days.map((d) => COPY[locale].days[d] ?? d), locale);
}

/**
 * LE NOM D'UN RÉGIME DANS LA LANGUE DU CONTENU. `null` = la copie ne sait pas
 * le nommer, et l'appelant DOIT alors se taire plutôt qu'écrire le slug anglais
 * au milieu d'un texte français.
 *
 * ⚠️ EXPORTÉ POUR `plan_tradeoffs.ts`, ET C'EST LA MÊME TABLE QUE `sharedRegime`
 * LIT. Deux plans du même foyer ne peuvent donc pas nommer le régime de deux
 * façons différentes dans deux phrases voisines.
 */
export function regimeLabel(
  regime: string,
  locale: RationaleLocale,
): string | null {
  return COPY[locale].regimes[String(regime ?? "").trim()] ?? null;
}

function renderSlots(slots: readonly string[], locale: RationaleLocale): string {
  return joinList(slots.map((s) => COPY[locale].slots[s] ?? s), locale);
}

/**
 * UNE DURÉE, DITE COMME UN HUMAIN LA DIT.
 *
 * ⚠️ CE N'EST PAS `cookingTimeParts`, ET ON NE PEUT PAS L'IMPORTER: cette
 * fonction-là vit dans `frontend/src/keel/api/planBudget.ts`, c'est-à-dire de
 * l'autre côté de la frontière Deno/navigateur. Elle rend d'ailleurs le NOMBRE
 * et son UNITÉ séparément, exprès, parce que les mots y appartiennent au
 * catalogue de langue — ici les mots sont dans `COPY`, qui est le catalogue de
 * ce module.
 *
 * Les minutes restantes se disent, elles ne s'arrondissent pas: « 1 h 30 » est
 * ce que la personne a coché (2 × 45), et l'écrire « 1 h » ferait afficher un
 * chiffre et en appliquer un autre.
 */
function renderDuration(minutes: number, locale: RationaleLocale): string {
  const copy = COPY[locale];
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return copy.minutes(String(m));
  if (m === 0) return copy.hours(String(h));
  return copy.hoursMinutes(String(h), copy.minutes(String(m)));
}

// ---------------------------------------------------------------------------
// LA CHAÎNE
// ---------------------------------------------------------------------------

/** Les champs REQUIS, dans l'ordre où le lecteur les cherchera. */
const REQUIRED_FACTS: readonly (keyof PlanRationaleFacts)[] = [
  "declaredCookDays",
  "addedCookDays",
  "window",
  "requestedWindow",
  "today",
  "localMinuteOfDay",
  "slotsDroppedToday",
  "awayInWindow",
  "budgetAmount",
  "mouthsServed",
  "handTakenBy",
  "mergedIn",
  "weeklyCookingMinutes",
  "sharedDishRegime",
  "cookingShapeChoice",
];

/**
 * Ce qu'on affiche des choix de calendrier, ou pourquoi on n'affiche rien.
 *
 * ⚠️ JETTE sur un champ manquant ou une locale inconnue — même posture que
 * `gateRequestReport`. Un appelant qui n'a pas su lire le jour local de l'élève
 * ne doit pas recevoir une phrase par défaut: il doit ÉCHOUER BRUYAMMENT.
 * `null` est une valeur, `undefined` est un oubli, et un `?` rendrait l'oubli
 * invisible à la compilation (`request_report_gate.ts:163-171`).
 *
 * ── LA DERNIÈRE PORTE EST L'ANTI-CULPABILISATION ──────────────────────────
 * Ces gabarits sont fixes et testés: ils ne devraient jamais mordre. Quand ça
 * arrive, ce n'est pas une ligne à retirer, c'est un signal qu'on ne sait plus
 * ce qu'on écrit. On coupe TOUT et on trace — copie exacte de la porte 4 de
 * `gateRequestReport` (`request_report_gate.ts:236-249`).
 */
export function explainPlanChoices(input: {
  facts: PlanRationaleFacts;
  locale: RationaleLocale;
}): PlanRationale {
  if (input?.locale !== "fr" && input?.locale !== "en") {
    throw new Error(
      `[keel/plan_rationale] locale inconnue: ${JSON.stringify(input?.locale)}`,
    );
  }
  const facts = input.facts;
  if (!facts || typeof facts !== "object") {
    throw new Error("[keel/plan_rationale] facts est REQUIS");
  }
  for (const key of REQUIRED_FACTS) {
    if (
      !(key in facts) ||
      (facts as unknown as Record<string, unknown>)[key] === undefined
    ) {
      throw new Error(
        `[keel/plan_rationale] ${key} est REQUIS — ` +
          "`null`/`[]` disent quelque chose, `undefined` ne dit rien",
      );
    }
  }

  const copy = COPY[input.locale];
  const lines: string[] = [];

  // ── ① LA FENÊTRE — la ligne qui sort TOUJOURS ───────────────────────────
  // C'est elle qui tient la demande produit: « même si tout va bien, petit
  // texte court ». Elle ne dit rien qu'on n'ait décidé, et elle se vérifie à
  // l'œil sur la grille d'à côté.
  const duration = Number(facts.window?.durationDays);
  const startsOn = String(facts.window?.startsOn ?? "").trim();
  if (startsOn && Number.isFinite(duration) && duration > 0) {
    if (startsOn === facts.today.localDate) {
      lines.push(copy.windowToday(duration));
    } else {
      // LE JOUR DE SEMAINE **ET** LA DATE. « à partir de vendredi » est
      // ambigu dès que la fenêtre est à plus d'une semaine, et c'est
      // exactement ce que « prépare la suivante » produit. La date brute
      // n'est pas jolie; elle est vérifiable.
      lines.push(
        copy.windowLater(
          renderDays([dayTokenOfDate(startsOn)], input.locale),
          startsOn,
          duration,
        ),
      );
    }
    // ── LA FENÊTRE A ÉTÉ RACCOURCIE ─────────────────────────────────────
    // Armée par une prémisse: sans `requestedWindow`, on ne SAIT pas qu'elle
    // a été coupée, donc on ne le dit pas. `resolveRequestedWindow` coupe la
    // forme `until_sunday` à dimanche, et l'élève qui a cliqué « ma semaine »
    // un vendredi reçoit trois jours sans jamais savoir pourquoi.
    const asked = facts.requestedWindow;
    if (asked && Number.isFinite(asked.durationDays) && asked.durationDays > duration) {
      lines.push(copy.windowShortened(asked.durationDays, duration));
    }
  }

  // ── ② LE JOUR DE CUISINE AJOUTÉ, ET POURQUOI ────────────────────────────
  // La ligne la plus chère du module: c'est celle qui manquait le jour où un
  // plan a posé un jeudi que personne n'avait coché.
  const added = facts.addedCookDays.filter(Boolean);
  const declared = facts.declaredCookDays.filter(Boolean);
  if (added.length > 0) {
    lines.push(
      declared.length > 0
        ? copy.cookAdded(renderDays(added, input.locale), renderDays(declared, input.locale))
        : copy.cookAddedNoDeclared(renderDays(added, input.locale)),
    );
  } else if (declared.length > 0) {
    lines.push(copy.cookDeclaredKept(renderDays(declared, input.locale)));
  }

  // ── ③ LES CRÉNEAUX TOMBÉS PARCE QUE LA JOURNÉE ÉTAIT ENTAMÉE ────────────
  // Distincte d'une absence, et la phrase le dit: « la journée est déjà
  // entamée » n'attribue rien à l'élève.
  const dropped = facts.slotsDroppedToday.filter(Boolean);
  if (dropped.length > 0) {
    lines.push(
      dropped.length === 1
        ? copy.slotDropped(renderSlots(dropped, input.locale))
        : copy.slotsDropped(renderSlots(dropped, input.locale)),
    );
  }

  // ── ④ LES ABSENCES ──────────────────────────────────────────────────────
  // Comptées, pas énumérées: sept lignes « mardi midi » ne sont plus une
  // explication, c'est la grille écrite deux fois.
  if (facts.awayInWindow.length > 0) {
    lines.push(copy.away(facts.awayInWindow.length));
  }

  // ── ⑤ LES BOUCHES ───────────────────────────────────────────────────────
  // `null` sur la lane individuelle: on ne dit pas « pour 1 personne » à
  // quelqu'un qui n'a jamais parlé de bouches.
  if (facts.mouthsServed !== null && facts.mouthsServed > 1) {
    lines.push(copy.mouths(facts.mouthsServed));

    // ── G5 · LE TEMPS A DÉCIDÉ LA FORME, ET LE PLAN LE DIT ──────────────
    //
    // ⚠️ TROIS PRÉMISSES, ET ELLES SONT TOUTES ARMÉES. Le dépôt a mesuré ce que
    // coûte une règle énoncée sans prémisse (« ceinture armée sur coffre
    // vide »), donc chacune est vérifiée ici et pas ailleurs:
    //
    //   1. PLUS D'UNE BOUCHE — la condition qui englobe ce bloc. Dire « tout le
    //      monde mange le même plat » à quelqu'un qui mange seul est une
    //      évidence servie comme une contrainte.
    //   2. LE TEMPS EST CONNU — `null` fait taire la phrase. Un foyer qui n'a
    //      coché aucun jour de cuisine n'a pas de budget à qui imputer la
    //      forme, et lui en inventer un serait affirmer ce que personne n'a
    //      écrit.
    //   3. LE TEMPS EST SOUS LE SEUIL — au-dessus, la forme n'est PAS décidée
    //      par le temps: elle est décidée par les directions de service. La
    //      phrase serait alors une explication fausse d'une décision juste, ce
    //      qui est le pire des deux mondes.
    //
    // ⚠️ LE SEUIL EST IMPORTÉ, PAS RECOPIÉ. `timeAllowsASecondDish` est la MÊME
    // fonction que celle qui décide réellement du barreau dans le moteur. Une
    // seconde comparaison écrite ici (`< 90`) survivrait au déplacement du
    // seuil et ferait dire au plan l'inverse de ce qu'il a fait — c'est
    // exactement la forme de défaut que ce dépôt paie en boucle.
    if (
      facts.weeklyCookingMinutes !== null &&
      Number.isFinite(facts.weeklyCookingMinutes) &&
      !timeAllowsASecondDish(facts.weeklyCookingMinutes)
    ) {
      lines.push(
        copy.oneDishByTime(renderDuration(facts.weeklyCookingMinutes, input.locale)),
      );
    }

    // ── ⑤bis · R4 — CE QUE LE PLAT COMMUN SUIT, ET DE QUI C'EST LA LIGNE ───
    //
    // TROIS PRÉMISSES, ET LES TROIS SONT ARMÉES:
    //   1. PLUS D'UNE BOUCHE — c'est la condition du bloc englobant. « Le plat
    //      commun est végétarien » n'a aucun sens quand on mange seul: il n'y a
    //      pas de commun, et la lane individuelle passe `null` de toute façon.
    //   2. UN RÉGIME A ÉTÉ DÉCLARÉ — `null` fait taire la phrase. Un foyer où
    //      personne n'a répondu ne doit pas lire une explication d'une décision
    //      qui n'a pas été prise.
    //   3. LE JETON EST CONNU DE LA COPIE — un régime que la copie ne sait pas
    //      nommer fait TAIRE la phrase plutôt que d'écrire le slug anglais au
    //      milieu d'un texte français. C'est la même direction d'erreur que
    //      partout ici: moins précis, jamais faux.
    const regime = facts.sharedDishRegime;
    if (regime !== null) {
      const label = copy.regimes[String(regime.regime ?? "")];
      const names = regime.heldBy.map((n) => String(n ?? "").trim()).filter(Boolean);
      if (label && names.length > 0) {
        const rendered = joinList(names, input.locale);
        lines.push(
          names.length === 1
            ? copy.sharedRegime(label, rendered)
            : copy.sharedRegimeMany(label, rendered),
        );
      }
    }

    // ── ⑤ter · LE MODE DE CUISSON DEMANDÉ, ET CE QU'IL A DONNÉ ────────────
    //
    // ⛔ LA RAISON D'ÊTRE DE CE BLOC: un choix silencieusement ignoré est PIRE
    // que pas de choix. Il apprend que les réglages du produit ne servent à
    // rien, et c'est un apprentissage qu'on ne défait pas.
    //
    // TROIS PRÉMISSES, ET LES TROIS SONT ARMÉES:
    //   1. PLUS D'UNE BOUCHE — la condition du bloc englobant. « Un seul plat
    //      pour tout le monde » n'a pas de sujet quand on mange seul.
    //   2. UN MODE A ÉTÉ DEMANDÉ — `null` fait taire les deux phrases. Une
    //      requête qui ne porte pas le champ (toutes celles écrites avant ce
    //      lot) rend un `rationale` byte-identique à celui d'avant.
    //   3. LE CHOIX ET LE CALCUL SE SONT SÉPARÉS — quand ils tombent d'accord,
    //      il n'y a RIEN à expliquer, et une phrase qui dit « ton choix a été
    //      respecté » à chaque plan apprend à ne plus lire les autres.
    //
    // ⚠️ ET LES DEUX CAS NE SONT PAS SYMÉTRIQUES. Le plafond qui MORD retire
    // quelque chose à quelqu'un: il se nomme, et il nomme qui. Le choix qui n'a
    // rien eu à retenir ne retire rien: il dit seulement que la possibilité
    // ouverte n'a pas servi, sans nommer personne — il n'y a personne à nommer.
    const shape = facts.cookingShapeChoice;
    if (shape !== null) {
      const outside = shape.outsideSharedPot
        .map((n) => String(n ?? "").trim())
        .filter(Boolean);
      if (shape.capped && outside.length > 0) {
        const rendered = joinList(outside, input.locale);
        lines.push(
          outside.length === 1
            ? copy.shapeCappedOne(rendered)
            : copy.shapeCappedMany(rendered),
        );
      } else if (shape.unused) {
        lines.push(copy.shapeUnused);
      }
    }
  }

  // ── ⑥ LE BUDGET, ET CE QUI A CÉDÉ POUR Y TENIR, DANS L'ORDRE ────────────
  // L'ordre est celui de la consigne servie au modèle (`meal_generation.ts`):
  // protéines chères, puis hors saison, puis variété, jamais les portions.
  // Le dire ici, c'est rendre relisible ce que le plan a réellement demandé.
  if (facts.budgetAmount !== null && Number.isFinite(facts.budgetAmount)) {
    lines.push(copy.budget(facts.budgetAmount));
    lines.push(copy.budgetCuts);
  }

  // ── ⑦ QUI A PRIS LA MAIN ────────────────────────────────────────────────
  const hands = facts.handTakenBy.map((n) => String(n ?? "").trim()).filter(Boolean);
  if (hands.length > 0) {
    lines.push(
      hands.length === 1
        ? copy.handTaken(joinList(hands, input.locale))
        : copy.handTakenMany(joinList(hands, input.locale)),
    );
  }

  // ── ⑧ LA REPRISE D'UNE FUSION ───────────────────────────────────────────
  const merged = facts.mergedIn.map((n) => String(n ?? "").trim()).filter(Boolean);
  if (merged.length > 0) {
    lines.push(copy.mergedIn(joinList(merged, input.locale)));
  }

  if (lines.length === 0) {
    // Ce n'est PAS le cas nominal: la ligne ① sort toujours dès que la fenêtre
    // est lisible. Arriver ici veut dire que l'appelant a passé une fenêtre
    // vide ou absurde — un fait, nommé, plutôt qu'un silence.
    return { lines: [], refusal: "nothing_to_explain" };
  }

  // ── LA DERNIÈRE PORTE ───────────────────────────────────────────────────
  const assembled = lines.join(" ");
  const guilt = findGuiltTripping(assembled);
  if (guilt.length > 0) {
    console.error("keel.plan_rationale.guilt_tripping", {
      finding_count: guilt.length,
      matched: guilt.map((f) => f.matchedText).join(" | "),
      locale: input.locale,
    });
    return { lines: [], refusal: "guilt_tripping" };
  }

  return { lines, refusal: null };
}
