/**
 * LE RETOUR DE FIN DE PLAN — ce qu'on demande quand une fenêtre s'achève.
 *
 * ── CE QUE CE CHANTIER FERME ───────────────────────────────────────────────
 * Le moteur de composition produit des verdicts SANS VÉRITÉ TERRAIN. Il sait
 * qu'un plan respectait son enveloppe *sur le papier*; il ignore totalement si
 * la personne a pu le cuisiner, si les portions étaient justes, ou si elle a
 * lâché le mercredi. C'est le seul angle mort du moteur, et aucune autre entrée
 * du produit ne le comble.
 *
 * ── LE PRÉCÉDENT QUI GOUVERNE CE FICHIER ───────────────────────────────────
 * Le point du dimanche (`keel-weekly-flow-v1`, six axes) a été SUPPRIMÉ. Pas
 * parce qu'il était mal fait: parce qu'il collectait pour un lecteur qui
 * n'existait pas — `coach_synthesis_io.ts` n'a jamais lu `biofeedback` (`git
 * log -S`: zéro commit), et la porte `my_biofeedback_has_reader()` collectait
 * pour personne.
 *
 * D'où la règle, et elle est vérifiable dans `QUESTION_READERS` ci-dessous:
 * **chaque question nomme SON LECTEUR.** Une question dont on ne peut pas
 * écrire le lecteur ne se pose pas — sinon on reconstruit, avec le même
 * mécanisme, ce qui vient d'être retiré.
 *
 * ── LE RECADRAGE QUI REND LE CHANTIER SÛR ──────────────────────────────────
 * « Comment ça s'est passé » est à un pas de « as-tu tenu » — une question de
 * conformité, dans un produit qui a supprimé les scores et les séries exprès.
 *
 *     ON ÉVALUE LE PLAN, JAMAIS LA PERSONNE.
 *
 * C'est déjà la doctrine du bilan alimentaire: on interroge ce qui MANQUE au
 * plan, jamais ce que la personne a ingéré. Aucune question de ce fichier ne
 * porte sur ce qui a été mangé, ni sur ce qui a été fait.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import type { StudentGoal } from "./week_plan_generation.ts";

/**
 * Les questions, par jeton.
 *
 * `cooked`, `portions` et `never_again` sont communes; la quatrième suit l'axe
 * qui gouverne la dynamique (voir `AXIS_QUESTION`).
 */
export const FEEDBACK_QUESTIONS = [
  "cooked",
  "portions",
  "never_again",
  "make_again",
  "hunger_between_meals",
  "could_finish",
  "enough_variety",
  // ── ⚠️ `energy_around_sessions` A ÉTÉ RETIRÉE LE 2026-08-18 ─────────────
  // Elle était la quatrième question de `performance`, et `performance`
  // n'existe plus: les quatre nuances du « ni l'un ni l'autre » se replient
  // sur `maintenance`, qui reçoit `enough_variety`. Aucune dynamique ne la
  // posait donc plus.
  //
  // Elle est SUPPRIMÉE et pas laissée en place, parce que le test
  // « toutes les questions du vocabulaire sont atteignables » est une garde
  // R6 (« aucune valeur d'énumération sans branche nommée »): une question
  // déclarée que personne ne pose est décorative, et une valeur décorative
  // finit par être pilotée. Ce que ça coûte est nommé dans `AXIS_QUESTION`:
  // le calage autour des séances n'est plus demandé à personne.
  //
  // ⚠️ LES RÉPONSES DÉJÀ ÉCRITES EN BASE LA PORTENT ENCORE. La colonne
  // `question` de `student_plan_feedback` n'a pas de CHECK adossé à cette
  // liste — la migration `20260811090000` la cite en commentaire, pas en
  // contrainte —, donc les lignes d'hier restent lisibles et ne sont pas
  // réécrites: ce sont des RÉPONSES d'une personne à une question qu'on lui a
  // vraiment posée, et les traduire falsifierait ce qu'elle a dit.
] as const;
export type FeedbackQuestion = (typeof FEEDBACK_QUESTIONS)[number];

/**
 * LE LECTEUR DE CHAQUE QUESTION — la table qui empêche de refaire le point du
 * dimanche.
 *
 * Ce n'est pas de la documentation: un test parcourt `FEEDBACK_QUESTIONS` et
 * exige une entrée ici pour chacune. Ajouter une question sans lui écrire son
 * lecteur ne compile pas.
 */
export const QUESTION_READERS: Record<FeedbackQuestion, string> = {
  cooked:
    "practical_constraints.cooking_time_min + recipe_difficulty — « non » ou " +
    "« en partie » veut dire qu'ils étaient trop optimistes",
  portions:
    "le ré-ancrage de l'enveloppe (`recalibration`) — c'est LA vérité terrain " +
    "que le moteur n'a pas: il sait ce qu'il a composé, pas ce qui a suffi",
  never_again:
    "practical_constraints.food_preferences, via `reconcileFoodPreferencesFor` " +
    "(pipeline existant, ne pas le réécrire)",
  make_again:
    "practical_constraints.food_preferences — LE MÊME canal que `never_again`, " +
    "polarité inverse. C'est le bloc que le prompt sert à chaque composition " +
    "(`foodPreferencesForPrompt`), donc il réoriente la génération suivante " +
    "sans qu'aucun lecteur neuf n'ait à exister",
  hunger_between_meals:
    "l'accent de satiété de `fat_loss` — la satiété est son axe gouvernant",
  could_finish:
    "l'accent d'apport de `muscle_gain` — son obstacle est de manger assez, " +
    "pas de se retenir",
  enough_variety:
    "l'accent de diversité de `maintenance` — la variété est l'axe gouvernant " +
    "de la troisième position de la balance, celle qui ne monte ni ne descend",
};

/** Les réponses possibles, par question. Listes fermées: pas de champ libre. */
export const QUESTION_OPTIONS: Record<FeedbackQuestion, readonly string[]> = {
  cooked: ["yes", "partly", "no"],
  portions: ["too_much", "right", "not_enough"],
  // `never_again` est particulière: ses options sont les plats du plan, donc
  // dynamiques. La liste fermée est construite à l'appel, et `none` en fait
  // toujours partie — « aucun » est une réponse, pas une absence de réponse.
  never_again: ["none"],
  // Même forme que sa jumelle: les plats du plan, plus `none`.
  make_again: ["none"],
  hunger_between_meals: ["often", "sometimes", "no"],
  could_finish: ["yes", "mostly", "no"],
  enough_variety: ["yes", "sometimes", "no"],
};

/**
 * La quatrième question, par dynamique.
 *
 * Elle suit L'AXE QUI GOUVERNE la dynamique — c'est la hiérarchie du design des
 * unités de composition, pas une invention de ce fichier.
 *
 * ⚠️ `maintenance` N'EN AVAIT PAS, ET ELLE EN A UNE DEPUIS LE 2026-08-18.
 * L'ancien choix se justifiait par « son objectif est l'écart minimal, donc
 * lui ajouter une question serait ajouter de la charge à la seule dynamique
 * qui demande qu'on ne lui en ajoute pas ». Le repli des quatre nuances change
 * ce qu'elle DÉSIGNE: elle ne dit plus « je tiens ce que j'ai », elle dit
 * « la balance ne bouge pas », ce qui recouvre `health` — de très loin la plus
 * peuplée des trois retirées.
 *
 * `enough_variety` et pas les deux autres, et le critère n'est pas la
 * popularité: c'est la SEULE des trois qui n'interroge ni l'appétit ni la
 * quantité. `could_finish` (recomposition) et `energy_around_sessions`
 * (performance) portent sur le corps; la première est d'ailleurs retirée par
 * le plancher TCA quelques lignes plus bas. Une question qui survit au
 * plancher est la seule qu'on puisse poser à toute une position.
 */
const AXIS_QUESTION: Record<StudentGoal, FeedbackQuestion | null> = {
  fat_loss: "hunger_between_meals",
  maintenance: "enough_variety",
  muscle_gain: "could_finish",
};

/**
 * LES QUESTIONS QUE LE PLANCHER TCA RETIRE.
 *
 * `portions` (« trop ? ») invite à la restriction, et `hunger_between_meals`
 * fait de la faim un sujet — les deux sont exactement ce qu'un plancher TCA
 * existe pour ne pas mettre sous les yeux de quelqu'un.
 *
 * Ce qui SURVIT porte sur le plan et non sur le corps: « as-tu pu le
 * cuisiner » et « un plat à ne jamais refaire » restent, parce qu'ils
 * n'interrogent ni l'appétit ni la quantité.
 */
const RESTRICTED_OUT: readonly FeedbackQuestion[] = [
  "portions",
  "hunger_between_meals",
];

/**
 * Les questions à poser pour ce plan.
 *
 * `restrictionFlag` est REQUIS, jamais optionnel: ce dépôt a déjà payé
 * « paramètre de garde optionnel = garde désarmée ». Une lecture EN ÉCHEC vaut
 * `true` chez l'appelant (fail-closed) — se fermer rend un questionnaire plus
 * court, s'ouvrir met une question de portion sous les yeux de quelqu'un qu'on
 * n'a pas su évaluer.
 *
 * ── L'INDISCERNABILITÉ ─────────────────────────────────────────────────────
 * Sous plancher, la sortie doit être IDENTIQUE à celle d'un élève dont on ne
 * connaît pas la dynamique. Sinon le questionnaire lui-même devient un oracle:
 * « on ne m'a pas demandé les portions, donc je suis marqué ». D'où l'ordre des
 * opérations — on retire les questions AVANT d'ajouter celle de l'axe, et
 * l'axe ne s'ajoute pas sous plancher.
 */
export function questionsFor(
  goal: StudentGoal | null,
  restrictionFlag: boolean,
): FeedbackQuestion[] {
  // ⚠️ `make_again` EST COMMUNE, ET ELLE SURVIT AU PLANCHER TCA. Elle porte sur
  // un PLAT qu'on referait, jamais sur l'appétit ni sur la quantité — c'est
  // exactement le critère qui fait survivre `cooked` et `never_again`. La
  // retirer serait retirer à quelqu'un sous plancher la seule question qui
  // ORIENTE au lieu de borner.
  const common: FeedbackQuestion[] = [
    "cooked",
    "portions",
    "never_again",
    "make_again",
  ];
  if (restrictionFlag) {
    // Sous plancher: les communes filtrées, et AUCUNE question d'axe — c'est
    // ce qui rend la sortie identique à celle d'une dynamique inconnue.
    return common.filter((q) => !RESTRICTED_OUT.includes(q));
  }
  const axis = goal ? AXIS_QUESTION[goal] : null;
  return axis ? [...common, axis] : common;
}

// ---------------------------------------------------------------------------
// LA RELANCE DE `portions` — « POUR QUI ? »
// ---------------------------------------------------------------------------

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA QUESTION QUI MANQUAIT, ET POURQUOI CE N'EST PAS UNE CINQUIÈME QUESTION.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Elle n'est PAS dans `FEEDBACK_QUESTIONS`, et c'est délibéré: ce n'est pas une
 * question de plus, c'est la SECONDE MOITIÉ de `portions`. `questionsFor`
 * décide quoi poser AVANT de connaître les réponses; celle-ci ne peut se poser
 * qu'APRÈS, et seulement si la réponse n'est pas neutre. L'ajouter au
 * vocabulaire ferait rougir « toutes les questions sont atteignables » —
 * exprès, et à raison: aucune dynamique ne la pose.
 *
 * ── POURQUOI ELLE EXISTE ──────────────────────────────────────────────────
 * `portions` est la seule vérité terrain que le moteur n'a pas, et dans un
 * foyer de quatre « trop grosses » ne désigne personne. C'est la raison écrite
 * pour laquelle le questionnaire est le SEUL producteur de `portion.adjust`
 * (nomenclature §5, ②): « une mesure a besoin d'un sujet, et la conversation ne
 * sait pas l'attribuer ». Le questionnaire, lui, pose la question avec la liste
 * du foyer sous les yeux — fermée, attribuable, pas une inférence.
 *
 * ── LES DEUX CONDITIONS, ET AUCUNE N'EST OPTIONNELLE ──────────────────────
 *  1. **La réponse n'est pas neutre.** « Ce qu'il fallait » (ou une question
 *     retirée par le plancher TCA) ne produit aucun ajustement: demander « pour
 *     qui ? » attribuerait quelque chose qui n'a pas été dit. Le verdict vient
 *     d'`effectOf`, la seule table de décision — pas d'une seconde lecture de
 *     `portions` ici.
 *  2. ⚠️ **Il y a plus d'une bouche.** UN SOLO N'A PAS DE FOYER
 *     (`SetupPage.tsx`: « le solo ne crée pas de foyer »): il n'a AUCUNE ligne
 *     `household_members`, donc aucun `member:<uuid>` n'existe pour lui, et la
 *     seule valeur possible est `household` — « tout le monde à table », c'est-
 *     à-dire lui. Lui poser la question, ce serait lui présenter un choix à une
 *     seule issue. La réponse est donc `household` SANS la demander, et
 *     l'ajustement lui est attribué exactement comme à un foyer.
 *
 * OPTION ÉCARTÉE: poser quand même la question au solo, « pour la symétrie ».
 * Refusée — « au-delà de quatre gestes c'est un formulaire », et un formulaire
 * gagné à la fin d'un plan est la meilleure façon de ne plus jamais recevoir de
 * retour.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function portionSubjectIsAsked(input: {
  /** La réponse à `portions`, telle qu'elle vient d'être cochée. */
  portions: string | null;
  /** Le nombre de bouches à table, le compte lui-même compris. */
  mouths: number;
}): boolean {
  if (effectOf({ portions: input.portions }).portionDirection === null) return false;
  return Number(input.mouths) > 1;
}

/**
 * Le libellé de la relance, dans les deux langues — au même endroit que les
 * autres, pour la même raison: une seconde table de questions à l'écran
 * divergerait au premier mot changé.
 *
 * ⛔ IL NE NOMME PERSONNE. Les prénoms viennent de la liste du foyer, à
 * l'affichage; une question qui porterait un prénom serait fausse au premier
 * renommage.
 */
export const PORTION_SUBJECT_LABEL = {
  en: "For whom?",
  fr: "Pour qui ?",
} as const;

/**
 * Le libellé d'une question, dans les deux langues.
 *
 * EN + FR parce que `profiles.locale` vaut `fr-FR` par défaut sur ce produit:
 * un questionnaire qui ne connaît que l'anglais est un questionnaire que la
 * majorité des élèves ne comprend pas.
 *
 * ── LE REGISTRE, ET IL EST TESTÉ ───────────────────────────────────────────
 * Chaque libellé porte sur LE PLAN. Aucun ne demande ce qui a été mangé, aucun
 * ne demande si quelque chose a été « tenu », « respecté » ou « suivi ». Un
 * test lexical le vérifie sur la table entière.
 */
export const QUESTION_LABELS: Record<
  FeedbackQuestion,
  { en: string; fr: string }
> = {
  cooked: {
    en: "Did you get to cook this plan?",
    fr: "Tu as pu cuisiner ce plan ?",
  },
  portions: {
    en: "The portions in it were:",
    fr: "Les portions du plan étaient :",
  },
  never_again: {
    en: "Anything in it you would not make again?",
    fr: "Un plat que tu ne referais pas ?",
  },
  // ── L'INVERSE DE `never_again`, ET C'EST LE SIGNAL LE PLUS PRÉCIEUX ──────
  // Un questionnaire qui ne demande QUE ce qui a raté apprend au produit à
  // éviter, jamais à viser. « J'en veux un qui ressemble la prochaine fois »
  // oriente la composition suivante là où le refus ne fait que la borner.
  //
  // ⚠️ ET IL PORTE SUR LE PLAT, PAS SUR LA PERSONNE. « Lequel referais-tu »
  // parle du plan qu'on a servi; « qu'as-tu aimé manger » parlerait de ce
  // qu'elle a ingéré, ce qu'aucune question de ce fichier n'a le droit de
  // demander.
  make_again: {
    en: "Anything in it you would want again?",
    fr: "Un plat que tu aimerais revoir ?",
  },
  hunger_between_meals: {
    en: "Did this plan leave you hungry between meals?",
    fr: "Ce plan te laissait-il sur ta faim entre les repas ?",
  },
  could_finish: {
    en: "Were the plates in it easy to finish?",
    fr: "Les assiettes étaient-elles faciles à finir ?",
  },
  enough_variety: {
    en: "Enough variety in it for you?",
    fr: "Assez de variété à ton goût ?",
  },
};

export const OPTION_LABELS: Record<string, { en: string; fr: string }> = {
  yes: { en: "Yes", fr: "Oui" },
  partly: { en: "Partly", fr: "En partie" },
  no: { en: "No", fr: "Non" },
  too_much: { en: "Too much", fr: "Trop" },
  right: { en: "About right", fr: "Ce qu'il fallait" },
  not_enough: { en: "Not enough", fr: "Pas assez" },
  none: { en: "None of them", fr: "Aucun" },
  // LE DÉFAUT DE L'AXE 3 — « tout le monde à table ». C'est une RÉPONSE, pas
  // une absence de réponse: sans elle, la seule façon de dire « ça vaut pour
  // nous tous » serait de ne rien cocher, et un silence ne s'archive pas.
  everyone: { en: "Everyone", fr: "Tout le monde" },
  often: { en: "Often", fr: "Souvent" },
  sometimes: { en: "Sometimes", fr: "Parfois" },
  mostly: { en: "Mostly", fr: "Plutôt" },
  good: { en: "Good", fr: "Bien" },
  mixed: { en: "Mixed", fr: "Variable" },
  flat: { en: "Flat", fr: "À plat" },
};

// ---------------------------------------------------------------------------
// Le retour est-il DÛ ?
// ---------------------------------------------------------------------------

export interface FeedbackDueInput {
  /** L'état de la fenêtre, rendu par `planWindowState`. */
  windowState: "in_window" | "not_started" | "elapsed";
  /** `retired_at` non nul = le plan a été remplacé; on n'interroge pas un mort. */
  retired: boolean;
  /** Une ligne de retour existe déjà pour ce plan (réponse OU refus). */
  answered: boolean;
}

/**
 * Un retour n'est dû qu'une fois, sur une fenêtre écoulée, pour un plan vivant.
 *
 * ── POURQUOI `answered` COUVRE AUSSI LE REFUS ──────────────────────────────
 * `dismissed_at` compte comme une réponse. Sans ça, l'élève qui ferme le
 * questionnaire se le voit reproposer à chaque ouverture de l'app — c'est-à-dire
 * qu'on transforme un « non merci » en harcèlement. **Un refus est une
 * réponse, et il se stocke.**
 */
export function feedbackIsDue(input: FeedbackDueInput): boolean {
  if (input.windowState !== "elapsed") return false;
  if (input.retired) return false;
  if (input.answered) return false;
  return true;
}

// ---------------------------------------------------------------------------
// LES ENVIES APPARUES EN COURS DE PLAN
// ---------------------------------------------------------------------------

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ ELLES N'OUVRENT AUCUN SECOND CANAL. Elles vont dans CELUI QUI EXISTE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * « Une envie du foyer » a déjà sa maison: `household_envy_submissions`, écrite
 * par `keel_household_submit_envy`, lue par `buildEnvyBlock` et servie au
 * modèle à chaque composition. Une colonne `new_envy` sur `meal_plan_feedback`
 * aurait été un SECOND canal pour la même intention — et ce dépôt sait ce que
 * ça coûte: deux écrivains pour une même chose, dont un seul reçoit la
 * modification, et c'est celui qu'on regarde le moins qui décide.
 *
 * ── ET C'EST CE QUI DÉCIDE QUI VOIT LA QUESTION ───────────────────────────
 * La règle de ce fichier est absolue: **une question sans lecteur ne se pose
 * pas**. Le lecteur ici est la ligne d'envies du foyer, et elle n'a qu'UN
 * écrivain — le compte maître (`keel_household_submit_envy` refuse tout autre
 * membre par `not_owner`). Donc:
 *
 *   · maître d'un foyer  ⇒ la question se pose, et sa réponse est LUE à la
 *     composition suivante;
 *   · tout le monde d'autre ⇒ elle ne se pose PAS. La poser quand même
 *     collecterait une phrase que rien ne lit — c'est-à-dire refaire, avec le
 *     même mécanisme, le point du dimanche qu'on vient de supprimer.
 *
 * ⚠️ ET ELLE VISE LA SEMAINE SUIVANTE, jamais celle qui s'achève. La ligne
 * d'envies est ancrée sur un lundi (`week_start`) et le générateur ne lit que
 * celle de la fenêtre qu'il compose: l'écrire sur la semaine écoulée serait
 * l'écrire dans le passé — recueillie, rangée, et jamais servie.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function newEnvyIsAsked(input: {
  /** Le compte tient-il un foyer ? Seul son maître écrit la ligne d'envies. */
  isHouseholdOwner: boolean;
}): boolean {
  return input.isHouseholdOwner === true;
}

// ---------------------------------------------------------------------------
// Ce que les réponses changent — la moitié qui manquait au point du dimanche
// ---------------------------------------------------------------------------

export interface FeedbackAnswers {
  cooked?: string | null;
  portions?: string | null;
  neverAgain?: readonly string[];
  /** L'inverse: les plats qu'on veut revoir. `[]` = aucun, et c'est une réponse. */
  makeAgain?: readonly string[];
  axisAnswer?: string | null;
}

/**
 * L'effet d'un retour sur la génération suivante.
 *
 * Rendu en INTENTIONS, pas en écritures: ce module est pur, c'est l'appelant
 * qui écrit. Mais les intentions sont NOMMÉES et fermées — un retour qui ne
 * produirait aucune intention serait la preuve qu'on a posé une question sans
 * lecteur.
 */
export interface FeedbackEffect {
  /** Baisser le temps de cuisine supposé, en minutes. 0 = ne rien changer. */
  easeCookingBy: number;
  /** Simplifier la difficulté des recettes d'un cran. */
  simplifyRecipes: boolean;
  /** Le sens du ré-ancrage d'enveloppe. `null` = ne rien changer. */
  portionDirection: "down" | "up" | null;
  /** Les plats à verser aux préférences comme refusés. */
  refusedDishes: readonly string[];
  /**
   * Les plats à verser aux préférences comme VOULUS. Même canal, polarité
   * inverse: c'est ce qui fait qu'aucun lecteur neuf n'a eu à exister.
   *
   * ⚠️ UNE LISTE DISTINCTE, ET PAS UN SIGNE SUR LA PREMIÈRE. Un même plat ne
   * peut pas être dans les deux (l'écran l'interdit), mais les fondre en une
   * liste signée obligerait chaque lecteur à connaître la convention de signe —
   * et le premier qui l'oublie ferait éviter à vie un plat qu'on avait aimé.
   */
  keptDishes: readonly string[];
  /** L'accent à renforcer à la prochaine génération, si l'axe a mordu. */
  emphasisHint: string | null;
}

/**
 * ── POURQUOI LE RÉ-ANCRAGE EST BORNÉ ET SANS SYMÉTRIE PARFAITE ─────────────
 * « pas assez » monte l'enveloppe, « trop » la descend — mais le produit a une
 * asymétrie assumée ailleurs (`directionIsWorking` de `student_body.ts`
 * n'ajoute jamais de charge). Ici la symétrie est acceptable parce que la
 * consigne porte sur LE PLAN qu'on a servi, pas sur le corps de la personne:
 * « tu m'en as donné trop » est un retour sur notre travail.
 *
 * Sous `restriction_flag`, la question n'est jamais posée (voir `questionsFor`),
 * donc `portions` arrive à `null` et cette branche est morte — la garde vit en
 * amont, pas ici, et c'est voulu: une seule garde, un seul endroit.
 */
export function effectOf(answers: FeedbackAnswers): FeedbackEffect {
  const cooked = answers.cooked ?? null;
  const portions = answers.portions ?? null;

  return {
    // « non » coûte plus cher que « en partie »: on n'a pas seulement été
    // optimiste, on a été hors sujet.
    easeCookingBy: cooked === "no" ? 15 : cooked === "partly" ? 10 : 0,
    simplifyRecipes: cooked === "no",
    portionDirection: portions === "too_much"
      ? "down"
      : portions === "not_enough"
      ? "up"
      : null,
    // `none` n'est pas un plat: il ne doit jamais atterrir dans les préférences.
    refusedDishes: (answers.neverAgain ?? []).filter((d) =>
      d.trim() !== "" && d !== "none"
    ),
    // MÊME FILTRE, ET LA MÊME RAISON. Un « aucun » versé aux préférences
    // créerait un aliment VOULU fantôme que le générateur chercherait à vie —
    // le symétrique exact du refus fantôme que la ligne au-dessus empêche.
    keptDishes: (answers.makeAgain ?? []).filter((d) =>
      d.trim() !== "" && d !== "none"
    ),
    emphasisHint: emphasisHintFor(answers.axisAnswer ?? null),
  };
}

/**
 * L'accent que la réponse d'axe suggère.
 *
 * Rendu en anglais, sans aucun chiffre: c'est une ligne d'accent destinée à la
 * consigne, et `NUMERIC_TARGET_PATTERNS` rejette en sortie toute masse accolée
 * à une macro. Un accent chiffré produirait des lignes systématiquement
 * filtrées.
 */
function emphasisHintFor(answer: string | null): string | null {
  switch (answer) {
    case "often":
    case "sometimes":
      return "last plan left them hungry between meals: lean harder on satiety " +
        "— more volume from vegetables, a protein anchor at every meal";
    case "no":
      // Ambigu par construction: `no` veut dire « pas eu faim » pour
      // `hunger_between_meals` et « pas fini » pour `could_finish`. On ne
      // devine pas — l'appelant passe la question avec la réponse s'il veut
      // désambiguïser. Ici, silence plutôt qu'un accent inventé.
      return null;
    case "flat":
      return "last plan left them flat around sessions: bring starch closer to " +
        "training days and sessions";
    default:
      return null;
  }
}
