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
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * LE PLAN EST-IL PLUS LÉGER QUE CE QUE CE CORPS DEMANDE ? — 2026-08-23.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `true` = le verdict de composition a rendu `energy: "below"` SUR LE PLAN
   * QUI PART. `false` = il l'a mesuré et il est dans la bande. `null` = il n'y
   * a pas de verdict d'énergie: plancher TCA, corps inconnu, plan illisible.
   *
   * ── POURQUOI CE FAIT EXISTE ───────────────────────────────────────────────
   * Mesuré le 2026-08-23 sur dix générations réelles: le verdict disait `below`
   * sur SEPT plans sur sept, la boucle de correction levait `raise_energy` sept
   * fois, payait une relance de modèle — et le plan partait quand même. Rien de
   * cet écart n'atteignait la personne: ni `issues`, ni `rationale`, ni la
   * charge rendue. Décision produit de l'utilisateur, 2026-08-23: **on livre, et
   * on le dit.**
   *
   * ⛔ ET SEULEMENT DANS CE SENS-LÀ. `"above"` ne produit AUCUNE ligne, et ce
   * n'est pas un oubli: « ton plan est trop gros » est très exactement le
   * verdict de tracker que `energy_target.ts` refuse depuis toujours d'adresser
   * à un élève. L'asymétrie EST la décision — la seule direction qu'on ouvre
   * est celle qui invite à manger plus.
   *
   * ⚠️ REQUIS, `boolean | null`, jamais `T?`. Un appelant qui ne sait pas passe
   * `null` EXPLICITEMENT, et c'est le compilateur qui les recense — la lane
   * foyer ne calcule pas ce verdict-là (elle a `anchorFactorFor`), elle doit
   * donc dire `null` et non se taire.
   */
  energyBelowBand: boolean | null;
  /** Les jours que l'élève a COCHÉS. `[]` = il n'en a coché aucun. */
  declaredCookDays: readonly DayToken[];
  /**
   * LES JOURS COCHÉS QUE CETTE FENÊTRE ATTEINT ENCORE — 2026-09-01.
   *
   * ⛔ IL VIENT DE `usableCookDays` (`meal_generation.ts`), LA FONCTION QUE LA
   * CONSIGNE APPELLE. Jamais d'un filtre réécrit ici: c'est très exactement le
   * défaut que ce fait répare. L'intersection vivait EN LIGNE dans
   * `cookDayLines`, ce module ne pouvait pas la lire, et il affirmait donc
   * « tu cuisines dimanche, et c'est ce qui a été gardé » sur un plan
   * lundi→vendredi d'où le dimanche venait d'être retiré. Deux calculs du même
   * écart divergeraient, et ce serait l'explication qui aurait tort — la règle
   * déjà écrite pour `addedCookDays`.
   *
   * ⚠️ CE QUI A ÉTÉ ÉCARTÉ SE DÉDUIT ICI, par différence: `declaredCookDays`
   * moins ceux-ci. C'est une opération d'ensemble sur deux listes qu'on nous
   * donne, pas une seconde lecture de la RÈGLE — et deux faits redondants
   * pourraient, eux, se contredire.
   *
   * ⚠️ REQUIS. Un appelant qui n'a pas su lire la fenêtre passe la même liste
   * que `declaredCookDays`, ce qui dit « rien n'a été écarté » — le
   * comportement d'avant ce lot, au caractère près.
   */
  usableCookDays: readonly DayToken[];
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
  /**
   * LES CASES QUE LE PLAN NE REMPLIT PAS — 2026-09-01.
   *
   * ⛔ IL VIENT DE `meal.empty_slots`, QUE LE PARSEUR REND DÉJÀ. Le calcul
   * existe depuis le 2026-08-12 (`emptySlotsIn`), il est écrit dans
   * `generated_from.empty_slots` par les deux lanes — et il n'avait AUCUN
   * lecteur. Mesuré le 2026-09-01: un plan de sept jours à une seule session
   * de cuisine rend quatre journées au petit-déjeuner seul, et l'écran affiche
   * quatre cases vides sans un mot. `PlanGrid` ne comble pas ce silence: ses
   * propres `issues` portent les COLLISIONS, pas les trous.
   *
   * ⚠️ NE PAS LE RECALCULER ICI. `emptySlotsIn` sait déjà ce qui n'est PAS un
   * trou — une absence déclarée, un apport fixe, un moment hors rythme — et une
   * seconde lecture déclarerait des trous là où le vide est voulu.
   *
   * ⚠️ ON CONSTATE, ON N'ACCUSE PAS, et on ne dit pas POURQUOI: la cause
   * (fenêtre du cuit, verrou numérique, plafond de plats) n'est pas dans les
   * faits, et l'inventer serait pire que le silence. Les lignes du dessus —
   * jours de cuisine, absences — donnent déjà la matière.
   *
   * ⚠️ REQUIS. `[]` dit « le plan est complet », et c'est une affirmation que
   * l'appelant doit faire exprès.
   */
  emptySlots: readonly { day: DayToken; slot: string }[];
  /**
   * LES JOURS QU'AUCUN LOT NE PEUT NOURRIR — 2026-09-01.
   *
   * ⛔ IL VIENT DE `daysOutOfBatchReach` (`plan_feasibility.ts`), LA FONCTION
   * QUE LA CONSIGNE APPELLE. Jamais d'un calcul refait ici: c'est la troisième
   * fois que ce module écrit cette phrase (`usableCookDays`, `addedCookDays`),
   * et les deux premières l'ont été parce qu'un second calcul avait fini par
   * faire dire à l'explication l'inverse de la consigne.
   *
   * ⚠️ CE N'EST PAS UN REPROCHE, ET LE GABARIT LE TIENT. « Tu n'as pas assez
   * cuisiné » retournerait la phrase contre la personne. Le fait est une
   * propriété du FRIGO — un lot ne tient pas si longtemps — et la sortie est
   * dans la phrase: ces jours-là se cuisinent sur le moment.
   */
  daysOutOfBatchReach: readonly DayToken[];
  /**
   * ═════════════════════════════════════════════════════════════════════════
   * « TOUT DANS UNE SESSION DE CUISINE » — CE QUE LA DEMANDE EST DEVENUE.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * `null` = la case n'a pas été cochée, et AUCUNE ligne ne sort. C'est le cas
   * de tous les plans d'avant le 2026-09-01, et de la grande majorité après.
   *
   * ⛔ IL PORTE LES DEUX ISSUES, ET C'EST TOUT SON INTÉRÊT:
   *   · `day` — le jour où la session a été posée, tel que la CONSIGNE l'a
   *     nommé (`singleSessionCookDay`). `null` quand aucun jour n'est connu:
   *     le modèle l'a choisi, et affirmer un jour qu'on n'a pas décidé serait
   *     un fait faux déterministe — la famille de défaut que ce module existe
   *     pour ne plus produire.
   *   · `refusedNoFreezer` — la case était cochée et le foyer n'a PAS déclaré
   *     de congélateur. La demande est alors ignorée, et c'est du rang 2:
   *     « rien de rang 2 ne part sans une ligne ». Sans elle, quelqu'un coche
   *     l'option, reçoit un plan à trois jours de cuisine, et rien ne dit
   *     pourquoi.
   *
   * ⚠️ LES DEUX NE SORTENT JAMAIS ENSEMBLE. Une demande refusée n'a pas de
   * jour de session unique — il n'y en a pas eu.
   */
  oneCookingSession:
    | { readonly day: DayToken | null; readonly refusedNoFreezer: boolean }
    | null;
  /**
   * ═════════════════════════════════════════════════════════════════════════
   * « JE CUISINE LA VEILLE » — ACCORDÉE, OU REFUSÉE ET POURQUOI.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * `null` = la case n'a pas été cochée, et AUCUNE ligne ne sort.
   *
   * ⛔ LE REFUS EST DU RANG 2, ET IL DOIT PARLER. La demande est
   * satisfaisable ou elle ne l'est pas, et les deux raisons sont des faits de
   * calendrier que la personne ne peut pas deviner: soit le plan commence
   * aujourd'hui (la veille est hier), soit il fait déjà sept jours (le jour
   * ajouté déborderait le plafond). Sans phrase, elle coche une case, reçoit un
   * plan qui commence quand même le premier jour, et n'a aucun moyen de savoir
   * si l'option est cassée ou si sa semaine ne s'y prêtait pas.
   *
   * ⚠️ `day` EST LE JOUR ACCORDÉ, jamais celui qui aurait pu l'être: on ne
   * nomme pas une date qui n'existe dans aucun plan.
   */
  cookDayBefore:
    | { readonly day: DayToken | null; readonly refused: string | null }
    | null;
  /**
   * ═════════════════════════════════════════════════════════════════════════
   * LES JOURS DE COURSES — 2026-09-01.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * ⛔ LE DÉFAUT QU'ILS FERMENT, RAPPORTÉ SUR UN PLAN RÉEL: « ça me disait de
   * cuisiner le poulet acheté le lundi, le samedi ». Le moteur SAVAIT que ce
   * poulet s'achète le jeudi — `grocery_waves.ts` le calcule depuis le
   * 2026-08-22 — et aucun texte du plan ne l'a jamais dit. Une liste sans jour
   * se lit « achète tout maintenant », et c'est ce qui a été fait.
   *
   * ⚠️ EN JETONS DE JOUR, comme tout le reste de ce module. Les dates
   * `YYYY-MM-DD` vivent sur la ligne de courses (`shopping_list[].buy_on`), où
   * elles servent à cocher; ici on parle à quelqu'un, et « jeudi » est ce
   * qu'il retient.
   *
   * `[]` = on n'a pas su dater les courses (fenêtre illisible, liste vide).
   * Aucune ligne ne sort alors — on ne devine pas un jour de magasin.
   */
  shoppingDays: readonly DayToken[];
  /**
   * LES JOURS DE CUISSON DONT LE FRAIS NE PEUT PAS VENIR DE LA PREMIÈRE COURSE.
   *
   * ⛔ IL VIENT DE `rawKeepingBreaches` (`raw_keeping.ts`), LA FONCTION QUE LA
   * CONSIGNE LIT AUSSI. Cinquième fois que ce module écrit cette phrase — et
   * les quatre premières l'ont été parce qu'un second calcul avait fini par
   * faire dire à l'explication l'inverse de la consigne.
   *
   * ⚠️ CE N'EST PAS UN REPROCHE, ET LE GABARIT LE TIENT. Cuisiner du poulet le
   * samedi est légitime; ce qui ne l'est pas, c'est de le faire acheter lundi
   * sans le dire. La phrase porte donc la SORTIE — on achète au plus près.
   */
  shopLaterDays: readonly DayToken[];
  /**
   * LES SESSIONS PLUS LONGUES QUE CE QUI A ÉTÉ DEMANDÉ. `[]` = aucune.
   *
   * ⛔ IL EST LA CONTREPARTIE D'UNE PERMISSION. Depuis le 2026-09-01 la
   * consigne AUTORISE une session à déborder quand c'est la seule sortie —
   * cuisiner moins laisserait des journées vides. Une permission sans annonce
   * serait une légalisation du silence: quelqu'un qui a déclaré trente minutes
   * doit lire qu'il en faudra cinquante AVANT de se mettre aux fourneaux, pas
   * devant ses casseroles.
   *
   * Vient de `meal.session_overruns`, structuré — jamais d'une ligne d'`issues`
   * reparsée.
   */
  sessionOverruns: readonly { day: DayToken; minutes: number; declared: number }[];
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
    // ── LES JOURS DE CUISINE QUE LA FENÊTRE N'ATTEINT PAS (2026-09-01) ────
    // DEUX GABARITS ET PAS UN AVEC UNE LISTE FACULTATIVE: « les sessions sont
    // posées » et « les sessions sont posées mercredi » ne disent pas la même
    // chose, et une phrase qui doit se lire dans les deux cas finit par ne
    // rien dire dans aucun. Même arbitrage que les trois formes du compteur de
    // reprises.
    //
    // ⛔ AUCUN REPROCHE, porte 3: « ce plan ne va pas jusque-là » dit le fait
    // par la FENÊTRE, pas par la personne. « Tu as coché un jour qui n'y est
    // pas » retournerait la phrase contre elle.
    cookDeclaredDroppedAll: (dropped: string) =>
      `Tu cuisines ${dropped}, mais ce plan ne va pas jusque-là : les sessions ` +
      `sont posées sur les jours qu'il couvre.`,
    cookDeclaredDroppedSome: (kept: string, dropped: string) =>
      `Tu cuisines ${kept}, et c'est ce qui a été gardé : ${dropped} n'est pas ` +
      `dans cette fenêtre.`,
    cookAdded: (added: string, declared: string) =>
      `Une session est posée ${added} : tu cuisines ${declared}, et rien de cuisiné ` +
      `là ne peut nourrir les jours d'avant. C'est un jour que tu n'avais pas demandé.`,
    cookAddedNoDeclared: (added: string) =>
      `Une session est posée ${added}, un jour que tu n'avais pas demandé : ` +
      `sans elle, les premiers jours n'auraient rien à réchauffer.`,
    // ── LES CASES QUE LE PLAN NE REMPLIT PAS (2026-09-01) ────────────────
    // DEUX FORMES, parce qu'un seul gabarit serait FAUX dans un cas sur deux:
    // « mercredi et jeudi n'ont ni déjeuner ni dîner » ne se dit que si les
    // deux jours manquent EXACTEMENT les mêmes moments. Sinon on compte —
    // c'est la règle déjà écrite pour les absences (« comptées, pas
    // énumérées »): huit lignes « mercredi midi » sont la grille écrite deux
    // fois, pas une explication.
    //
    // ⛔ AUCUNE CAUSE N'EST NOMMÉE. On ne la connaît pas ici, et l'inventer
    // serait un fait faux de plus.
    // ⚠️ DEUX ACCORDS, ET C'EST LE NOMBRE DE MOMENTS QUI COMMANDE — pas celui
    // des trous. Le sujet de la phrase est la liste des moments: « le dîner
    // n'ont pas été composés » est ce qu'un gabarit unique produisait, et un
    // test l'a attrapé avant l'écran.
    // ── CE QU'AUCUN LOT N'ATTEINT (2026-09-01) ───────────────────────────
    // ⛔ LE FAIT EST UNE PROPRIÉTÉ DU FRIGO, PAS UN MANQUE DE LA PERSONNE. Et
    // la phrase porte SA SORTIE: « ils se cuisinent sur le moment » dit quoi
    // faire, là où « ne peuvent pas vivre d'un lot » laisserait quelqu'un
    // devant un problème sans réponse.
    // ⚠️ LA PHRASE NE COMMENCE PAS PAR LA LISTE, ET C'EST UNE CORRECTION D'ÉCRAN.
    // `renderDays` rend les jours en MINUSCULES en français — « mercredi,
    // jeudi et samedi sont trop loin » ouvrait donc la phrase sur une
    // minuscule. Mettre une capitale à la volée casserait au premier jour
    // rendu autrement; on écrit la phrase dans l'autre sens, et le problème
    // n'existe plus. Une garde relit toutes les lignes rendues.
    outOfReachOne: (day: string) =>
      `Aucun lot ne tient jusqu'à ${day} : ce jour-là se cuisine sur le moment.`,
    outOfReachMany: (days: string) =>
      `Aucun lot ne tient jusqu'à ${days} : ces jours-là se cuisinent sur le ` +
      `moment.`,
    // ── LA SESSION UNIQUE, ET CE QU'ELLE IMPLIQUE ────────────────────────
    // ⚠️ AUCUN NOMBRE DE JOURS DANS CETTE PHRASE, ET C'EST DÉLIBÉRÉ.
    // `MAX_FRIDGE_DAYS` vit dans `meal_generation.ts`, que ce module ne peut
    // pas importer (il serait alors impossible à monter côté Vite). Écrire
    // « trois jours » ici en ferait une SECONDE définition du nombre, et ce
    // dépôt sait laquelle des deux garde l'ancienne valeur: celle qu'on
    // regarde le moins.
    singleSessionOn: (day: string) =>
      `Tout est cuisiné ${day}, en une seule fois : ce qui ne tiendrait pas ` +
      `au frais jusqu'au repas part au congélateur.`,
    singleSessionNoDay: () =>
      `Tout est cuisiné en une seule session : ce qui ne tiendrait pas au ` +
      `frais jusqu'au repas part au congélateur.`,
    // ⛔ ELLE NE REPROCHE RIEN ET ELLE DIT OÙ RÉPARER. « Il n'y en a pas de
    // déclaré » est un fait sur le formulaire, pas sur la cuisine: quelqu'un
    // qui a un congélateur et n'a jamais vu la question doit comprendre qu'il
    // lui reste une case à cocher, pas qu'on lui refuse quelque chose.
    singleSessionNeedsFreezer: () =>
      `Une seule session de cuisine demande un congélateur, et il n'y en a ` +
      `pas de déclaré : le plan pose lui-même ses sessions.`,
    // ── LA VEILLE ────────────────────────────────────────────────────────
    // ⚠️ ELLE DIT LES DEUX MOITIÉS: le plan commence plus tôt (un fait de
    // calendrier qui surprendrait sinon) ET rien ne se mange ce jour-là (sans
    // quoi la journée se lit comme un trou).
    cookDayBeforeGranted: (day: string) =>
      `Le plan commence ${day}, un jour plus tôt : c'est le jour de cuisine, ` +
      `et rien ne s'y mange.`,
    cookDayBeforeNoRoom: () =>
      `Cuisiner la veille demandait un jour de plus, et ce plan en couvre ` +
      `déjà sept — le maximum. La cuisine reste dans la fenêtre.`,
    cookDayBeforeInThePast: () =>
      `Cuisiner la veille aurait fait commencer le plan hier. Il part de son ` +
      `premier jour, et la cuisine s'y fait.`,
    // ── LES COURSES ──────────────────────────────────────────────────────
    // ⚠️ LE SINGULIER ET LE PLURIEL NE DISENT PAS LA MÊME CHOSE. Une seule
    // course est une BONNE nouvelle qu'il faut annoncer comme telle (« tout
    // tient »); deux sont un déplacement de plus, et la phrase doit dire à quoi
    // il sert, sinon il se lit comme une corvée arbitraire.
    shoppingOnce: (day: string) =>
      `Une seule course, ${day} : tout ce que le plan demande tient jusqu'à ` +
      `sa cuisson.`,
    shoppingSeveral: (n: number, days: string) =>
      `Les courses se font en ${n} fois : ${days}. Les suivantes existent pour ` +
      `que le frais n'attende pas la casserole.`,
    shopLater: (days: string) =>
      `Ce qui se cuisine ${days} s'achète au plus près de ce jour-là : de la ` +
      `viande ou du poisson frais pris à la première course ne tiendrait pas ` +
      `jusque-là.`,
    // ── LA SESSION QUI DÉBORDE, DITE AVANT LES FOURNEAUX ─────────────────
    // Le chiffre DÉCLARÉ est rappelé: sans lui, « compte 1 h 10 » se lit comme
    // une estimation venue de nulle part, au lieu d'un écart avec ce qu'on a
    // soi-même demandé.
    sessionRunsLong: (day: string, minutes: string, declared: string) =>
      `La session de ${day} prendra plutôt ${minutes} que ${declared} : c'est ` +
      `ton seul jour de cuisine, et cuisiner moins laisserait des jours vides.`,
    gapsSameSlot: (days: string, slot: string) =>
      `Sur ${days}, ${slot} n'a pas été composé.`,
    gapsSameSlots: (days: string, slots: string) =>
      `Sur ${days}, ${slots} n'ont pas été composés.`,
    gapsCounted: (n: number, days: string) =>
      n === 1
        ? `Un repas n'a pas été composé, sur ${days}.`
        : `${n} repas n'ont pas été composés, sur ${days}.`,
    slotsDropped: (slots: string) =>
      `Pour aujourd'hui, ${slots} ne sont plus au plan : la journée est déjà entamée.`,
    slotDropped: (slot: string) =>
      `Pour aujourd'hui, ${slot} n'est plus au plan : la journée est déjà entamée.`,
    away: (n: number) =>
      n === 1
        ? "Un repas est sauté, tu l'avais marqué hors de la maison."
        : `${n} repas sont sautés, tu les avais marqués hors de la maison.`,
    // ── LE PLAN PLUS LÉGER QUE LE CORPS ──────────────────────────────────
    // ⚠️ AUCUN CHIFFRE, et c'est non négociable: « pas de kcal, pas de grammes,
    // pas de fourchette » vaut ici comme partout (`meal_generation.ts`, bloc
    // « NEVER PUT A NUMBER ON NUTRITION »). La phrase dit un FAIT SUR LE PLAN,
    // jamais un verdict sur la personne — le sujet est « ce plan », pas « tu ».
    //
    // ⚠️ ET ELLE OUVRE UNE PORTE, elle ne pose pas une consigne. « Ressers-toi
    // si tu as encore faim » rend la main; « il faut manger plus » serait une
    // prescription, et la porte anti-culpabilisation la couperait de toute
    // façon — avec tout le reste du texte.
    energyBelow:
      "Ce plan est plus léger que ce que ton corps demande sur ces journées : " +
      "ressers-toi si tu as encore faim.",
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
    cookDeclaredDroppedAll: (dropped: string) =>
      `You cook on ${dropped}, but this plan does not reach that far: the ` +
      `sessions are set on the days it covers.`,
    cookDeclaredDroppedSome: (kept: string, dropped: string) =>
      `You cook on ${kept}, and that is what was kept: ${dropped} is not in ` +
      `this window.`,
    cookAdded: (added: string, declared: string) =>
      `A session is set for ${added}: you cook on ${declared}, and nothing cooked ` +
      `then can feed the days before it. It is a day you did not ask for.`,
    cookAddedNoDeclared: (added: string) =>
      `A session is set for ${added}, a day you did not ask for: without it the ` +
      `first days would have nothing to reheat.`,
    outOfReachOne: (day: string) =>
      `No batch keeps until ${day}: that day is cooked on the day.`,
    outOfReachMany: (days: string) =>
      `No batch keeps until ${days}: those days are cooked on the day.`,
    singleSessionOn: (day: string) =>
      `Everything is cooked on ${day}, in one go: whatever would not keep in ` +
      `the fridge until the meal goes in the freezer.`,
    singleSessionNoDay: () =>
      `Everything is cooked in a single session: whatever would not keep in ` +
      `the fridge until the meal goes in the freezer.`,
    singleSessionNeedsFreezer: () =>
      `One cooking session needs a freezer, and none is declared: the plan ` +
      `places its own sessions.`,
    cookDayBeforeGranted: (day: string) =>
      `The plan starts on ${day}, a day earlier: that is the cooking day, and ` +
      `nothing is eaten on it.`,
    cookDayBeforeNoRoom: () =>
      `Cooking the day before needed one more day, and this plan already ` +
      `covers seven — the most it can. The cooking stays inside the window.`,
    cookDayBeforeInThePast: () =>
      `Cooking the day before would have started the plan yesterday. It ` +
      `starts on its first day, and the cooking happens there.`,
    shoppingOnce: (day: string) =>
      `One shop, on ${day}: everything this plan asks for keeps until it is ` +
      `cooked.`,
    shoppingSeveral: (n: number, days: string) =>
      `Shopping happens ${n} times: ${days}. The later trips are there so ` +
      `fresh food does not wait for the pan.`,
    shopLater: (days: string) =>
      `What is cooked on ${days} is bought close to that day: fresh meat or ` +
      `fish from the first shop would not keep that long.`,
    sessionRunsLong: (day: string, minutes: string, declared: string) =>
      `The ${day} session will take ${minutes} rather than ${declared}: it is ` +
      `your only cooking day, and cooking less would leave days empty.`,
    gapsSameSlot: (days: string, slot: string) =>
      `On ${days}, ${slot} was not composed.`,
    gapsSameSlots: (days: string, slots: string) =>
      `On ${days}, ${slots} were not composed.`,
    gapsCounted: (n: number, days: string) =>
      n === 1
        ? `One meal was not composed, on ${days}.`
        : `${n} meals were not composed, on ${days}.`,
    slotsDropped: (slots: string) =>
      `For today, ${slots} are off the plan: the day is already under way.`,
    slotDropped: (slot: string) =>
      `For today, ${slot} is off the plan: the day is already under way.`,
    away: (n: number) =>
      n === 1
        ? "One meal is skipped, you marked it away from home."
        : `${n} meals are skipped, you marked them away from home.`,
    // Même posture qu'en français: un fait sur LE PLAN, aucun chiffre, et une
    // porte ouverte plutôt qu'une consigne.
    energyBelow:
      "This plan comes out lighter than your body asks for on these days — " +
      "go back for more if you are still hungry.",
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
  "energyBelowBand",
  "declaredCookDays",
  "usableCookDays",
  "addedCookDays",
  "window",
  "requestedWindow",
  "today",
  "localMinuteOfDay",
  "slotsDroppedToday",
  "awayInWindow",
  "emptySlots",
  "daysOutOfBatchReach",
  "oneCookingSession",
  "cookDayBefore",
  "shoppingDays",
  "shopLaterDays",
  "sessionOverruns",
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
  // ══════════════════════════════════════════════════════════════════════
  // LA SESSION UNIQUE REMPLACE CE BLOC — elle ne s'y ajoute pas.
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ « Tu cuisines dimanche ET mercredi, et c'est ce qui a été gardé » à côté
  // de « tout est cuisiné dimanche » sont deux faits dont un est FAUX. C'est
  // mot pour mot la famille de défaut corrigée le 2026-09-01 sur
  // `cookDeclaredDropped`: une phrase qui affirme le contraire de ce que le
  // moteur a fait est pire qu'un silence.
  //
  // ⚠️ LE REFUS, LUI, LAISSE LE BLOC EN PLACE. Rien n'a été ramené à une seule
  // session: les jours cochés sont bien ceux qui ont servi, et les gabarits du
  // dessous les décrivent correctement. Ne pas les rendre ferait disparaître
  // une explication juste au moment où la personne en a le plus besoin.
  // ── LA VEILLE, AVANT LA SESSION UNIQUE ──────────────────────────────────
  // ⚠️ L'ORDRE EST LE SENS. « Le plan commence dimanche, un jour plus tôt »
  // explique la FENÊTRE; « tout est cuisiné dimanche » explique ce qu'on y
  // fait. Lire la seconde d'abord ferait apparaître un jour dont on n'a pas
  // encore dit d'où il sort.
  const dayBefore = facts.cookDayBefore;
  if (dayBefore !== null) {
    if (dayBefore.refused === "no_room") {
      lines.push(copy.cookDayBeforeNoRoom());
    } else if (dayBefore.refused === "in_the_past") {
      lines.push(copy.cookDayBeforeInThePast());
    } else if (dayBefore.day) {
      lines.push(copy.cookDayBeforeGranted(renderDays([dayBefore.day], input.locale)));
    }
  }

  const singleSession = facts.oneCookingSession;
  const singleSessionApplied = singleSession !== null &&
    singleSession.refusedNoFreezer !== true;
  if (singleSession !== null && singleSession.refusedNoFreezer === true) {
    lines.push(copy.singleSessionNeedsFreezer());
  }
  if (singleSessionApplied) {
    lines.push(
      singleSession.day
        ? copy.singleSessionOn(renderDays([singleSession.day], input.locale))
        : copy.singleSessionNoDay(),
    );
  } else if (added.length > 0) {
    lines.push(
      declared.length > 0
        ? copy.cookAdded(renderDays(added, input.locale), renderDays(declared, input.locale))
        : copy.cookAddedNoDeclared(renderDays(added, input.locale)),
    );
  } else if (declared.length > 0) {
    // ── LES JOURS QUE LA FENÊTRE N'ATTEINT PAS ────────────────────────────
    // ⛔ SANS CETTE BRANCHE, LA PHRASE DISAIT L'INVERSE DE LA CONSIGNE. Jours
    // cochés `dimanche`, fenêtre lundi→vendredi: le prompt reçoit « none of
    // those days are left in this stretch », et ce module écrivait « c'est ce
    // qui a été gardé ». Mesuré et corrigé le 2026-09-01.
    //
    // `usable` vient du moteur (`usableCookDays`), donc l'écart est celui que
    // la consigne a réellement appliqué.
    const usable = facts.usableCookDays.filter(Boolean);
    const dropped = declared.filter((d) => !usable.includes(d));
    if (dropped.length === 0) {
      lines.push(copy.cookDeclaredKept(renderDays(declared, input.locale)));
    } else if (usable.length === 0) {
      lines.push(copy.cookDeclaredDroppedAll(renderDays(dropped, input.locale)));
    } else {
      lines.push(copy.cookDeclaredDroppedSome(
        renderDays(usable, input.locale),
        renderDays(dropped, input.locale),
      ));
    }
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

  // ── ④bis LES CASES QUE LE PLAN NE REMPLIT PAS ───────────────────────────
  // APRÈS les absences, et la place est la moitié du sens: « quelqu'un n'était
  // pas là » explique un vide VOULU, et il faut l'avoir lu avant d'apprendre
  // qu'il en reste d'autres qui, eux, ne sont voulus par personne.
  //
  // `emptySlotsIn` a déjà retiré les absences et les apports fixes: ce qui
  // arrive ici est du trou net.
  const gaps = facts.emptySlots.filter((g) => g && g.day && g.slot);
  if (gaps.length > 0) {
    const days: string[] = [];
    for (const gap of gaps) if (!days.includes(gap.day)) days.push(gap.day);
    const slots: string[] = [];
    for (const gap of gaps) if (!slots.includes(gap.slot)) slots.push(gap.slot);
    // UNIFORME = chaque jour manque exactement les mêmes moments. C'est le cas
    // d'un lot qui ne tient pas la semaine (mesuré: quatre jours sans déjeuner
    // ni dîner), et c'est le seul où la phrase groupée est VRAIE.
    const uniform = gaps.length === days.length * slots.length;
    const named = renderDays(days, input.locale);
    lines.push(
      !uniform
        ? copy.gapsCounted(gaps.length, named)
        : slots.length === 1
        ? copy.gapsSameSlot(named, renderSlots(slots, input.locale))
        : copy.gapsSameSlots(named, renderSlots(slots, input.locale)),
    );
  }

  // ── ④ter LES JOURS QU'AUCUN LOT N'ATTEINT ───────────────────────────────
  // ⚠️ AVANT le constat de trous, ce serait mieux — mais ce n'est pas possible:
  // les deux se lisent ensemble et celui-ci est la CAUSE. Il est donc placé
  // juste après, et sa phrase porte la sortie plutôt que le problème.
  //
  // ⛔ ET IL SE TAIT QUAND LE PLAN N'A PAS DE TROU. Un plan de trois jours
  // cuisiné le premier jour n'a rien hors de portée: la ligne ne sort pas, et
  // c'est ce qui la rend lisible le jour où elle sort.
  // ── ④bis LES COURSES, ET CE QU'ELLES NE PEUVENT PAS PORTER ─────────────
  //
  // ⚠️ AVANT les journées hors de portée, et c'est l'ordre du frigo: on achète,
  // puis on cuisine, puis on garde. Lire « aucun lot ne tient jusqu'à samedi »
  // avant de savoir quand on fait ses courses inverse la chaîne.
  //
  // ⛔ ET LA SECONDE PHRASE NE SORT QUE SI LA PREMIÈRE EST VRAIE POUR ELLE:
  // dire « le frais de samedi s'achète au plus près » sans avoir dit qu'il y a
  // plusieurs courses laisserait la personne chercher un magasin qu'aucune
  // ligne ne lui a annoncé.
  const shoppingDays = facts.shoppingDays.filter(Boolean);
  if (shoppingDays.length === 1) {
    lines.push(copy.shoppingOnce(renderDays(shoppingDays, input.locale)));
  } else if (shoppingDays.length > 1) {
    lines.push(copy.shoppingSeveral(
      shoppingDays.length,
      renderDays(shoppingDays, input.locale),
    ));
  }
  const shopLater = facts.shopLaterDays.filter(Boolean);
  if (shopLater.length > 0) {
    lines.push(copy.shopLater(renderDays(shopLater, input.locale)));
  }

  const outOfReach = facts.daysOutOfBatchReach.filter(Boolean);
  if (outOfReach.length > 0) {
    lines.push(
      outOfReach.length === 1
        ? copy.outOfReachOne(renderDays(outOfReach, input.locale))
        : copy.outOfReachMany(renderDays(outOfReach, input.locale)),
    );
  }

  // ── ④quater LA SESSION QUI DÉBORDE ──────────────────────────────────────
  // ⚠️ UNE PHRASE PAR SESSION, et il n'y en a jamais plus d'une: le
  // débordement n'est autorisé QUE sur un unique jour de cuisine
  // (`sessionCeilingMinutes`). La boucle est là parce que le fait est une
  // liste, pas parce qu'on en attend plusieurs.
  for (const over of facts.sessionOverruns) {
    if (!over || !over.day) continue;
    lines.push(copy.sessionRunsLong(
      renderDays([over.day], input.locale),
      renderDuration(over.minutes, input.locale),
      renderDuration(over.declared, input.locale),
    ));
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
  // ── ⑤bis · LE PLAN PLUS LÉGER QUE LE CORPS ──────────────────────────────
  //
  // ⛔ AVANT LE BUDGET, ET C'EST DÉLIBÉRÉ. Quand les deux sortent, le budget
  // EXPLIQUE la légèreté (« les protéines chères cèdent d'abord »): le lire
  // après le constat en fait une raison; le lire avant en ferait une excuse
  // posée d'avance.
  //
  // ⛔ `=== true` ET PAS UNE COERCITION. `null` veut dire « pas mesurable »
  // (plancher TCA, corps inconnu, plan illisible) et doit se taire — un `if
  // (facts.energyBelowBand)` rendrait la même chose ici, mais le jour où le
  // champ porte trois états, la coercition choisirait toute seule.
  if (facts.energyBelowBand === true) {
    lines.push(copy.energyBelow);
  }

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
