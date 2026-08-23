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
  // ⚠️ CE LECTEUR A ÉTÉ RÉÉCRIT LE 2026-08-19, ET L'ANCIEN ÉTAIT UNE INTENTION.
  // Il disait « l'accent de diversité de `maintenance` » — c'est-à-dire
  // `emphasisHint`, qui n'a AUCUN appelant. La question était posée, stockée, et
  // lue par personne: exactement le point du dimanche que l'en-tête de ce
  // fichier existe pour interdire.
  //
  // Le lecteur nommé ici est VIVANT et vérifiable de bout en bout:
  // `logistics.set{field:"variety"}` → `retained_items_routing.logisticsOverlayFor`
  // → `practical_constraints.variety` → `readCookingCapacity` des deux
  // générateurs → la ligne « repetition they accept: … » du prompt
  // (`meal_generation.ts`). C'est le SEUL des trois axes qui atterrit sur un
  // levier existant, au vocabulaire fermé (`VARIETY_LEVELS`).
  enough_variety:
    "`practical_constraints.variety`, via `logistics.set` — le vocabulaire " +
    "fermé `repeat | some | varied` que les deux générateurs lisent déjà et " +
    "servent au modèle (« repetition they accept »)",
};

/** Les réponses possibles, par question. Listes fermées: pas de champ libre. */
export const QUESTION_OPTIONS: Record<FeedbackQuestion, readonly string[]> = {
  cooked: ["yes", "partly", "no"],
  // ═══════════════════════════════════════════════════════════════════════
  // CINQ CHOIX DEPUIS LE 2026-08-19, ET LES TROIS ANCIENS N'ONT PAS BOUGÉ.
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ── LE DÉFAUT QUE LES DEUX JETONS NEUFS FERMENT ──────────────────────────
  // Le questionnaire est le SEUL producteur de `portion.adjust` (nomenclature
  // §5, ②) et il ne connaissait qu'UN cran par sens. Or un nouvel ajustement
  // REMPLACE le précédent (`winningPortionAdjust`: jamais de somme, motif
  // écrit dans `meal_envelope.ts`). Quelqu'un dont les parts sont énormément
  // trop grosses cochait « trop », recevait −5 %, recochait « trop », recevait
  // ENCORE −5 % — bloqué là pour toujours. Et le cran `clear` du moteur
  // (−10 %, `PORTION_ADJUST_STEP`) était INATTEIGNABLE par tout le produit.
  //
  // ── ⛔ ON AJOUTE DEUX JETONS, ON N'EN REMAPPE AUCUN ──────────────────────
  // `too_much` et `not_enough` gardent EXACTEMENT le sens qu'ils ont toujours
  // eu (`slight`). C'est la doctrine écrite de ce fichier, quelques lignes
  // plus haut, sur `energy_around_sessions`: « LES RÉPONSES DÉJÀ ÉCRITES EN
  // BASE LA PORTENT ENCORE […] ce sont des RÉPONSES d'une personne à une
  // question qu'on lui a vraiment posée, et les traduire falsifierait ce
  // qu'elle a dit. » Les traduire en `clear` retirerait, rétroactivement, de
  // la nourriture à des gens qui n'ont jamais dit « vraiment trop ».
  //
  // L'ORDRE EST CELUI DE L'ÉCHELLE, du plus « trop » au plus « pas assez »:
  // l'écran rend les options dans l'ordre de cette liste, et une échelle qui
  // ne se lit pas de bout en bout se coche au hasard.
  portions: [
    "way_too_much",
    "too_much",
    "right",
    "not_enough",
    "way_not_enough",
  ],
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
 * LE SEUL AXE QUI ATTERRIT SUR UN LEVIER EXISTANT — le jeton, déclaré UNE fois.
 *
 * ⚠️ TYPÉ `FeedbackQuestion`, ET PAS `string`. C'est ce qui relie la constante à
 * son jumeau: renommer `enough_variety` dans `FEEDBACK_QUESTIONS` fait ROUGIR
 * cette ligne au compilateur, avant tout test. §7.4 du contrat de phase 0 —
 * « une clé déclarée deux fois que rien ne relie » est la cicatrice la plus
 * chère du chantier (86 tests verts pendant que l'écriture partait ailleurs).
 *
 * Il est LU par `plan_feedback_retained.ts` pour décider si la réponse d'axe a
 * une famille. Le recopier là-bas en ferait deux littéraux, et le second ne
 * suivrait pas le renommage du premier.
 *
 * ⛔ ET IL EST LU SUR LE JETON, JAMAIS SUR LA RÉPONSE. `no` est une option des
 * TROIS axes et `sometimes` de deux: router sur la réponse seule ferait entrer
 * une réponse à `hunger_between_meals` — la question que le plancher TCA
 * retire — dans le magasin par la porte de la variété.
 */
export const VARIETY_AXIS_QUESTION: FeedbackQuestion = "enough_variety";

/**
 * L'axe QUI N'A PAS DE LECTEUR — le seul que `emphasisHint` couvre encore.
 *
 * Typé pour la même raison que son voisin: un renommage dans
 * `FEEDBACK_QUESTIONS` doit faire rougir le compilateur, pas produire un
 * `switch` qui ne matche plus jamais rien. Privé — rien à l'extérieur n'en a
 * besoin tant que `emphasisHint` n'a pas d'appelant.
 */
const SATIETY_AXIS_QUESTION: FeedbackQuestion = "hunger_between_meals";

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
 *
 * ⚠️ ET ELLE SE POSE SUR LES **QUATRE** RÉPONSES NON NEUTRES DEPUIS QUE
 * L'ÉCHELLE EN PORTE CINQ. Elle ne relit pas `portions` — elle demande à
 * `effectOf`, la seule table de décision, s'il y a un ajustement. Une seconde
 * lecture ici (« `too_much` ou `not_enough` ») aurait laissé les deux jetons
 * NEUFS produire un `portion.adjust` de foyer sans jamais demander pour qui —
 * c'est-à-dire baisser l'assiette de toute la table sur le cran FORT, en
 * silence, dans un foyer de quatre. C'est le piège exact de ce lot.
 */
export function portionSubjectIsAsked(input: {
  /** La réponse à `portions`, telle qu'elle vient d'être cochée. */
  portions: string | null;
  /** Le nombre de bouches à table, le compte lui-même compris. */
  mouths: number;
}): boolean {
  if (effectOf({ portions: input.portions }).portionAdjust === null) return false;
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
  // ⚠️ LE LIBELLÉ DE LA QUESTION N'A PAS BOUGÉ AVEC LE SECOND CRAN. Il annonce
  // une ÉCHELLE (« étaient : »), pas trois cases: passer de trois à cinq
  // réponses ne change pas ce qu'on demande, seulement la finesse avec
  // laquelle on laisse y répondre.
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
  // ═══════════════════════════════════════════════════════════════════════
  // L'ÉCHELLE DES PORTIONS — CINQ CRANS, ET DEUX LIBELLÉS RÉÉCRITS.
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ⚠️ RÉÉCRIRE « Trop » EN « Un peu trop » N'EST PAS UNE FALSIFICATION, et il
  // faut le dire ici parce que le prochain lecteur croira le contraire — le
  // fichier interdit deux fois, en toutes lettres, de retraduire une réponse
  // déjà donnée.
  //
  // Ce qui est stocké en base est le JETON (`too_much`), et sa traduction
  // n'a pas changé d'un pouce: `slight`, hier comme aujourd'hui (voir
  // `PORTION_ANSWER_ADJUST`). Aucune ligne déjà écrite ne change de sens.
  // Le libellé, lui, est ce que la personne LIT au moment où elle coche: le
  // jour où l'échelle porte cinq crans, « Trop » ne désigne plus la même
  // case sur l'écran — c'est la case du MILIEU-HAUT, et l'appeler « Trop »
  // ferait choisir le cran faible à quelqu'un qui pense dire le cran fort.
  // Le libellé décrit la POSITION sur l'échelle affichée; le jeton porte le
  // sens archivé. Les deux sont indépendants, et c'est voulu.
  way_too_much: { en: "Really too much", fr: "Vraiment trop" },
  too_much: { en: "A bit too much", fr: "Un peu trop" },
  right: { en: "About right", fr: "Ce qu'il fallait" },
  not_enough: { en: "A bit short", fr: "Un peu juste" },
  way_not_enough: { en: "Really not enough", fr: "Vraiment pas assez" },
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
  /**
   * ⚠️ LE JETON DE LA QUATRIÈME QUESTION, ET IL N'EST PAS DÉCORATIF.
   *
   * `no` est une option des TROIS axes, `sometimes` de deux: sans le jeton,
   * `axisAnswer` seul est AMBIGU PAR CONSTRUCTION, et c'était écrit noir sur
   * blanc dans `emphasisHintFor` sans qu'aucun appelant ne puisse lever
   * l'ambiguïté. Mesuré le 2026-08-19: `effectOf({axisAnswer:"sometimes"})`
   * rendait l'accent de SATIÉTÉ — la consigne de `fat_loss` — à quelqu'un qui
   * venait de répondre « parfois » à une question sur la VARIÉTÉ.
   *
   * Optionnel au type comme ses six voisins, et l'oubli est FAIL-CLOSED: sans
   * jeton, aucun axe n'a de famille et rien n'est produit. Le seul appelant qui
   * compte le passe, et un test de câblage le tient
   * (`plan_feedback_retained_test.ts`).
   */
  axisQuestion?: string | null;
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
  /**
   * LE RÉ-ANCRAGE D'ENVELOPPE — SON SENS **ET** SON AMPLEUR, DANS UN SEUL
   * CHAMP. `null` = ne rien changer.
   *
   * ⚠️ UN SEUL CHAMP, ET C'EST LA GARDE. Deux champs (`portionDirection` +
   * `portionMagnitude`) laisseraient exister l'état « on baisse, on ne sait
   * pas de combien » — que le seul lecteur devrait replier, et le repli
   * vraisemblable est `slight`. C'est-à-dire: le cran fort redevenu
   * inatteignable, en silence, exactement le défaut que le second cran ferme.
   * Ici l'objet est nul ou complet, et le type le tient.
   *
   * ⛔ AUCUN NOMBRE, ET LE MOTIF EST DANS LA NOMENCLATURE (§4): la personne dit
   * « vraiment trop », pas « −240 kcal ». La traduction en fraction de bande
   * vit dans `meal_envelope.ts` (`PORTION_ADJUST_STEP`), en aval, là où le
   * plancher A1 écrête.
   */
  portionAdjust: FeedbackPortionAdjust | null;
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
  /**
   * ⚠️ LA SEULE INTENTION D'AXE QUI AIT UN LECTEUR — `"more"` ou rien.
   *
   * C'est une PRESSION, pas un réglage: la table de décision ne connaît pas la
   * variété courante de la personne, donc elle ne peut pas rendre une valeur
   * absolue. `plan_feedback_retained.ts` la traduit en `logistics.set{variety}`
   * un cran plus haut, à partir de la valeur connue — exactement comme
   * `easeCookingBy` devient un `cooking_time_min` absolu là-bas et pas ici.
   *
   * ⛔ IL N'EXISTE PAS DE `"less"`, ET C'EST UNE ASYMÉTRIE VOULUE. « Assez de
   * variété ? — Oui » veut dire « ne change rien », jamais « répète plus ».
   * Descendre la variété de quelqu'un qui vient de dire que ça allait serait
   * lui retirer quelque chose au motif qu'il n'a rien demandé.
   */
  varietyPressure: "more" | null;
  /**
   * L'accent à renforcer à la prochaine génération, si l'axe a mordu.
   *
   * ⚠️ TROU NOMMÉ, ET IL RESTE OUVERT: ce champ n'a TOUJOURS AUCUN APPELANT.
   * Il ne couvre plus que `hunger_between_meals` — le seul des trois axes dont
   * aucun lecteur honnête n'a été trouvé (voir le bloc de la réponse d'axe dans
   * `plan_feedback_retained.ts`). `enough_variety` est passée à
   * `varietyPressure`, qui, lui, arrive jusqu'au prompt.
   */
  emphasisHint: string | null;
}

/**
 * LE RÉ-ANCRAGE QU'UNE RÉPONSE DEMANDE — `{direction, magnitude}`, deux
 * adverbes.
 *
 * ⚠️ LES DEUX CRANS SONT CEUX DU SOCLE (`PORTION_MAGNITUDES = ["slight",
 * "clear"]`), RECOPIÉS ET PAS IMPORTÉS: ce module est monté par le FRONT
 * (`frontend/src/keel/api/planFeedback.ts` le ré-exporte), et le front tient
 * exprès sa propre copie de `retained_item.ts` plutôt qu'un import entre deux
 * runtimes. Ce qui empêche la copie de dériver n'est pas une intention: c'est
 * `plan_feedback_retained.ts`, qui assigne cette `magnitude` dans une variable
 * typée `PortionMagnitude` — un troisième cran, ou un renommage, ne compile
 * plus. Et `plan_feedback_retained_test.ts` épingle les deux littéraux.
 */
export type FeedbackPortionAdjust = {
  readonly direction: "down" | "up";
  readonly magnitude: "slight" | "clear";
};

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA TABLE DES CINQ RÉPONSES — L'UNIQUE ENDROIT OÙ UN JETON DEVIENT UN CRAN.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LES TROIS JETONS D'ORIGINE GARDENT LEUR SENS, ET C'EST NON NÉGOCIABLE.
 * `too_much` → `slight` et `not_enough` → `slight`, comme au premier jour.
 * Des réponses sont déjà écrites en base sous ces jetons, et `meal_plan_feedback`
 * n'a jamais réécrit une ligne d'hier: les remapper vers `clear` retirerait de
 * la nourriture, rétroactivement, à des gens qui n'ont jamais dit « vraiment
 * trop ». Le second cran s'obtient par DEUX JETONS NEUFS, jamais en déplaçant
 * le sens des anciens.
 *
 * ⚠️ UNE SEULE TABLE POUR LES DEUX MOITIÉS. Le sens et l'ampleur sortent d'ici
 * ensemble; il n'existe aucun chemin par lequel un jeton rendrait l'un sans
 * l'autre. Un jeton absent de cette table — `right`, un vide, une charge forgée
 * — ne rend RIEN, et « rien » est une réponse: `right` est la case neutre.
 */
const PORTION_ANSWER_ADJUST: Readonly<
  Record<string, FeedbackPortionAdjust>
> = Object.freeze({
  way_too_much: { direction: "down", magnitude: "clear" },
  too_much: { direction: "down", magnitude: "slight" },
  not_enough: { direction: "up", magnitude: "slight" },
  way_not_enough: { direction: "up", magnitude: "clear" },
});

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
    // ⚠️ UNE LECTURE DE TABLE, PAS UNE CASCADE DE TERNAIRES. La cascade
    // d'avant se lisait « too_much ou not_enough », et ajouter un cran y
    // aurait demandé d'écrire le sens à un endroit et l'ampleur à un autre —
    // deux listes de jetons, dont celle qu'on regarde le moins aurait gardé
    // trois entrées. `null` porte ici l'ABSENCE d'entrée (`right`, un vide, un
    // jeton forgé), pas le repli d'un refus.
    portionAdjust: portionAdjustFor(portions),
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
    varietyPressure: varietyPressureFor(
      answers.axisQuestion ?? null,
      answers.axisAnswer ?? null,
    ),
    emphasisHint: emphasisHintFor(
      answers.axisQuestion ?? null,
      answers.axisAnswer ?? null,
    ),
  };
}

/**
 * LE CRAN QU'UNE RÉPONSE DEMANDE, ou `null`.
 *
 * ⛔ PROPRIÉTÉ **PROPRE**, JAMAIS L'HÉRITAGE. `PORTION_ANSWER_ADJUST["constructor"]`
 * rend une FONCTION sur un objet littéral, et cette réponse arrive d'un corps
 * de requête HTTP. Sans ce test, un jeton forgé rendrait un « ajustement »
 * tronqué: `portionSubjectIsAsked` demanderait « pour qui ? » sur une case que
 * personne n'a cochée, et l'item construit en aval serait refusé par le socle
 * — c'est-à-dire un questionnaire qui pose une question de plus et n'écrit
 * rien, sans qu'une ligne ne le dise.
 *
 * ⛔ AUCUN `trim()`, AUCUNE CASSE IGNORÉE: la comparaison est exacte, comme
 * elle l'a toujours été sur ces jetons. Les jetons viennent d'une liste fermée
 * rendue par ce module même, et la RPC les nettoie avant de les stocker;
 * normaliser ici ferait une SECONDE normalisation, qui divergerait.
 */
function portionAdjustFor(answer: string | null): FeedbackPortionAdjust | null {
  const token = String(answer ?? "");
  if (!Object.prototype.hasOwnProperty.call(PORTION_ANSWER_ADJUST, token)) {
    return null;
  }
  return PORTION_ANSWER_ADJUST[token];
}

/**
 * LA PRESSION SUR LA VARIÉTÉ — la seule décision d'axe qui atterrisse.
 *
 * ⛔ LE JETON EST LU EN PREMIER, ET C'EST LA GARDE. `no` est une option des
 * trois axes: sans ce test, une réponse à `hunger_between_meals` (celle que le
 * plancher TCA RETIRE) produirait un réglage de variété. La question décide, la
 * réponse ne fait que graduer.
 *
 * ── POURQUOI « PARFOIS » AGIT AUSSI ────────────────────────────────────────
 * « Assez de variété ? — Parfois » veut dire « parfois, pas toujours ». C'est
 * le patron de `cooked`, où `partly` bouge le temps de cuisine comme `no`, en
 * moins fort. Ici il n'y a qu'UN cran par sens: `sometimes` et `no` demandent
 * donc le même pas, et c'est le plus petit que le vocabulaire permette.
 *
 * OPTION ÉCARTÉE: ne faire agir que `no`. Refusée parce qu'elle rendrait
 * « parfois » strictement équivalent à « oui » — c'est-à-dire poser une
 * question à trois réponses dont deux ne changent rien.
 */
function varietyPressureFor(
  question: string | null,
  answer: string | null,
): "more" | null {
  if (String(question ?? "").trim() !== VARIETY_AXIS_QUESTION) return null;
  switch (String(answer ?? "").trim()) {
    case "no":
    case "sometimes":
      return "more";
    default:
      // « oui », une réponse absente, ou un jeton forgé: rien ne bouge.
      return null;
  }
}

/**
 * L'accent que la réponse d'axe suggère.
 *
 * Rendu en anglais, sans aucun chiffre: c'est une ligne d'accent destinée à la
 * consigne, et `NUMERIC_TARGET_PATTERNS` rejette en sortie toute masse accolée
 * à une macro. Un accent chiffré produirait des lignes systématiquement
 * filtrées.
 *
 * ⚠️ IL PREND LA QUESTION DEPUIS LE 2026-08-19, ET CE N'EST PAS UN CONFORT.
 * L'ancienne version ne recevait que la réponse et le disait elle-même:
 * « ambigu par construction ». Elle rendait donc l'accent de SATIÉTÉ sur
 * `sometimes` — la réponse de la question de VARIÉTÉ autant que celle de la
 * faim. Le défaut était inerte (aucun appelant), et il aurait mordu le jour où
 * quelqu'un aurait câblé ce champ: une consigne de `fat_loss` servie à un plan
 * de `maintenance`.
 */
function emphasisHintFor(
  question: string | null,
  answer: string | null,
): string | null {
  // ⛔ `enough_variety` NE PASSE PLUS PAR ICI. Elle a un lecteur réel
  // (`varietyPressure` → `logistics.set{variety}` → le prompt): lui rendre AUSSI
  // un accent ferait deux canaux pour une seule réponse, et c'est le canal
  // qu'on regarde le moins qui finirait par décider.
  if (String(question ?? "").trim() !== SATIETY_AXIS_QUESTION) return null;
  switch (String(answer ?? "").trim()) {
    case "often":
    case "sometimes":
      return "last plan left them hungry between meals: lean harder on satiety " +
        "— more volume from vegetables, a protein anchor at every meal";
    default:
      // `no` = « pas eu faim »: il n'y a rien à renforcer.
      return null;
  }
}
