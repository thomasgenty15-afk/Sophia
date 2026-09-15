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

/**
 * Les questions, par jeton. **TOUTES COMMUNES depuis le lot B (2026-09-03).**
 *
 * ── CE QUI A CHANGÉ, ET POURQUOI L'AXE A DISPARU ──────────────────────────
 * Il y avait une quatrième question qui suivait la dynamique (`AXIS_QUESTION`:
 * `fat_loss` → `hunger_between_meals`, `muscle_gain` → `could_finish`,
 * `maintenance` → `enough_variety`). Deux des trois **n'avaient aucun
 * lecteur** — `emphasisHint` n'a jamais eu d'appelant, et ce fichier l'écrivait
 * en toutes lettres. La règle fondatrice du fichier (« chaque question nomme
 * son lecteur avant d'être posée ») les condamnait donc depuis le premier jour.
 *
 * Elles sont RETIRÉES, et `enough_variety` devient **commune**: la variété est
 * l'un des quatre indices (nomenclature §2.4), son champ (`variety`) est lu par
 * les deux lanes pour **tout le monde**, et ne la demander qu'à `maintenance`
 * rendait le cran inatteignable aux deux autres dynamiques — le défaut exact que
 * les deux crans neufs de `portions` ont fermé le 2026-08-19.
 *
 * ⚠️ CONSÉQUENCE HEUREUSE, ET ELLE EST STRUCTURELLE: plus aucune question ne
 * dépend de la dynamique, donc l'INDISCERNABILITÉ sous plancher TCA n'est plus
 * une propriété à tenir dans `questionsFor` — elle est vraie par construction
 * (la sortie de tout le monde, moins ce que le plancher retire).
 *
 * ⚠️ LES RÉPONSES DÉJÀ ÉCRITES EN BASE RESTENT LUES. Les colonnes
 * `axis_question` / `axis_answer` de `meal_plan_feedback` portent des réponses
 * réelles (mesuré: 15 lignes en base locale le 2026-09-03). `effectOf` les lit
 * encore, par `legacyVarietyAnswer` — même doctrine que `canHold` face à
 * `canProduce`: on ferme l'avenir, on n'efface pas le passé.
 *
 * ── LES DEUX QUESTIONS NEUVES — lot B ────────────────────────────────────
 * `difficulty` et `speed` remplacent une DÉDUCTION. Avant, « je n'ai pas pu
 * cuisiner » (`cooked`) baissait à la fois le temps de cuisine ET la difficulté
 * des recettes, sans jamais demander lequel des deux était le problème. On
 * demande maintenant, et `cooked` redevient un CONTEXTE (voir
 * `cookingQuestionsAreAsked`).
 */
export const FEEDBACK_QUESTIONS = [
  "cooked",
  "portions",
  "difficulty",
  "speed",
  "enough_variety",
  "never_again",
  "make_again",
  "anything_else",
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
  // finit par être pilotée. Ce que ça coûte: le calage autour des séances n'est
  // plus demandé à personne.
  //
  // ── ⚠️ `hunger_between_meals` ET `could_finish` SONT PARTIES LE 2026-09-03,
  //    POUR LA MÊME RAISON, ET ELLE EST PLUS FORTE ─────────────────────────
  // Elles étaient POSÉES et leur seul lecteur nommé (`emphasisHint`) n'avait
  // aucun appelant. Trois rabattements ont été examinés et refusés un par un
  // (voir le bloc de la réponse d'axe dans `plan_feedback_retained.ts`): vers
  // `portion.adjust` (ça compterait deux fois la même réponse), vers
  // `rhythm.set` (« sur ta faim entre les repas » ne nomme aucun des six
  // moments), vers `food.prefer` (`text` est la vérité affichée: la carte
  // dirait « tu l'as coché au bilan » sous une phrase jamais écrite). Un trou
  // nommé valait mieux qu'un rabattement; une question retirée vaut mieux
  // qu'un trou nommé qui coûte deux gestes à la personne.
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
  // ⚠️ `cooked` N'A PLUS DE LECTEUR D'EFFET, ET C'EST LE LOT B. Il en avait
  // deux par DÉDUCTION (`cooking_time_min` + `recipe_difficulty` baissés sur
  // « non » ou « en partie »), c'est-à-dire qu'il décidait LEQUEL des deux
  // était le problème sans le demander. Son lecteur est désormais une GARDE:
  // il décide si les deux questions de cuisine sont posées du tout.
  cooked:
    "`cookingQuestionsAreAsked` — une garde, pas un effet: on ne demande " +
    "« trop dur ? » et « trop long ? » qu'à quelqu'un qui a cuisiné au moins " +
    "en partie",
  portions:
    "l'indice de portion (`feedback_index.ts` → `meal_envelope.ts`) — c'est LA " +
    "vérité terrain que le moteur n'a pas: il sait ce qu'il a composé, pas ce " +
    "qui a suffi",
  // ── LES DEUX QUESTIONS NEUVES DU LOT B, ET LEUR LECTEUR EST UN CHAMP ────
  // Un cran d'échelle, pas un delta: `speed` déplace `cooking_time_min` d'UN
  // BARREAU de `COOKING_SESSION_MINUTES` (les six durées que l'écran propose),
  // `difficulty` d'un cran de `RECIPE_DIFFICULTIES`. Les deux champs sont lus
  // par `readCookingCapacity` dans les DEUX lanes, et servis au modèle.
  difficulty:
    "`practical_constraints.recipe_difficulty` — un cran de " +
    "`RECIPE_DIFFICULTIES` (simple | normal | keen), écrit dans le CHAMP avec " +
    "sa ligne de journal, et lu par `readCookingCapacity` des deux lanes",
  speed:
    "`practical_constraints.cooking_time_min` — un BARREAU de " +
    "`COOKING_SESSION_MINUTES`, écrit dans le CHAMP avec sa ligne de journal, " +
    "et lu par `readCookingCapacity` des deux lanes",
  enough_variety:
    "`practical_constraints.variety` — le vocabulaire fermé " +
    "`repeat | some | varied` que les deux générateurs lisent déjà et servent " +
    "au modèle (« repetition they accept »)",
  // ── LES DEUX QUESTIONS DE PLAT — DES ALIMENTS DEPUIS LE LOT B ───────────
  // Elles rangeaient des TITRES DE PLATS dans `food_preferences`, une liste de
  // phrases plates sans polarité, sans sujet et sans date. Elles rangent
  // maintenant un ALIMENT du plan, avec sa personne, dans le magasin structuré
  // (destination ① de la nomenclature). Le titre d'un plat n'est pas une
  // préférence: « Poulet rôti au citron » refusé ne dit pas si c'est le poulet,
  // le citron ou le rôtissage — et le générateur ne peut rien filtrer avec ça.
  never_again:
    "une préférence ① — `food.exclude` durable, avec son sujet, lue par la " +
    "consigne de composition ET par la ceinture par bouche " +
    "(`food_exclusion_belt.ts`)",
  make_again:
    "une préférence ① — `food.prefer` durable, MÊME canal, polarité inverse. " +
    "C'est ce qui fait qu'aucun lecteur neuf n'a eu à exister",
  // ── LE CHAMP LIBRE, ET SON LECTEUR EST LE CLASSIFIEUR DU LOT A ──────────
  // ⛔ PAS UN SECOND CLASSIFIEUR. Le texte passe par `readDraftNote` (la garde
  // d'entrée: cible chiffrée, interdit de doctrine, plancher TCA) puis par
  // `classifyAndPersistDraftNote`, exactement comme une note de brouillon. Un
  // second prompt divergerait du premier au premier mot changé.
  anything_else:
    "`classifyAndPersistDraftNote` (lot A) — les trois mêmes portes: une " +
    "préférence, une note de « ce que Sophia sait », ou une ligne d'encart. " +
    "Ce qui raconte un repas n'a AUCUNE destination (`skipped.meal_story`)",
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
  // ── LES DEUX ÉCHELLES DE CUISINE — TROIS CRANS, DEUX SENS ──────────────
  //
  // ⚠️ LE CRAN DU MILIEU N'EST PAS UN VIDE, C'EST UNE RÉPONSE. « C'était bien »
  // veut dire « le réglage actuel est juste », pas « je n'ai pas répondu »:
  // sans lui, la seule façon de dire que ça allait serait de ne rien cocher, et
  // un silence ne s'archive pas (même motif que `right` sur les portions et que
  // `none` sur les plats).
  //
  // ⛔ ET LE SENS MONTANT EXISTE, C'EST LA CONDITION DU LOT. La déduction qu'on
  // remplace ne savait que DESCENDRE (`cooked: no` ⇒ moins de temps, recettes
  // plus simples): un champ qui ne fait que cliqueter vers le bas finit au
  // plancher et n'en remonte jamais — c'est le défaut que le §4-bis de la
  // nomenclature nomme, et ce qui rendait le débat « champ ou indice » indécidable.
  difficulty: ["too_hard", "fine", "could_do_more"],
  speed: ["too_long", "fine", "had_more_time"],
  // ⚠️ INCHANGÉES, et c'est délibéré: des réponses sont écrites en base sous
  // ces trois jetons (colonne `axis_answer`), et les remapper falsifierait ce
  // que des gens ont répondu. Seule la POPULATION à qui on la pose a changé.
  enough_variety: ["yes", "sometimes", "no"],
  // `never_again` est particulière: ses options sont les ALIMENTS du plan
  // (depuis le lot B; c'étaient ses plats), donc dynamiques. La liste fermée
  // est construite à l'appel, et `none` en fait toujours partie — « aucun » est
  // une réponse, pas une absence de réponse.
  never_again: ["none"],
  // Même forme que sa jumelle: les aliments du plan, plus `none`.
  make_again: ["none"],
  // ⛔ LA SEULE QUESTION SANS VOCABULAIRE, ET LE VIDE LE DIT. `[]` n'est pas un
  // oubli: c'est un CHAMP LIBRE, et le test « toute question a des options »
  // doit le lire comme tel plutôt que de nous laisser inventer trois boutons
  // pour une question qui n'en a pas. Le renversement de FF-054 §3.2 (« aucun
  // champ libre ») est écrit dans la fiche, borné: dernière, facultative,
  // formulée « quelque chose à retenir pour la suite ? » — jamais « comment ça
  // s'est passé », qui inviterait à raconter ce qui a été mangé.
  anything_else: [],
};

/**
 * LES QUESTIONS QUE LE PLANCHER TCA RETIRE.
 *
 * `portions` (« trop ? ») invite à la restriction — c'est exactement ce qu'un
 * plancher TCA existe pour ne pas mettre sous les yeux de quelqu'un.
 *
 * ⚠️ ELLE EST SEULE DEPUIS LE LOT B, ET CE N'EST PAS UN RELÂCHEMENT.
 * `hunger_between_meals` y était aussi — elle faisait de la faim un sujet — et
 * elle n'est plus posée à personne. Ce qui SURVIT porte sur le PLAN et non sur
 * le corps: « as-tu pu le cuisiner », « était-ce trop dur », « trop long »,
 * « assez varié », « un aliment à ne plus servir ». Aucune n'interroge
 * l'appétit ni la quantité.
 */
const RESTRICTED_OUT: readonly FeedbackQuestion[] = [
  "portions",
];

/**
 * Les questions à poser pour ce plan.
 *
 * ⚠️ PLUS DE `goal`, ET C'EST LE LOT B. La quatrième question suivait la
 * dynamique; deux des trois n'avaient aucun lecteur, et la troisième
 * (`enough_variety`) est devenue commune parce que son champ est lu pour tout
 * le monde. Un appelant qui passait un objectif ne compile plus — voulu: c'est
 * la seule façon de garantir qu'aucun écran ne pose encore une question d'axe.
 *
 * `restrictionFlag` est REQUIS, jamais optionnel: ce dépôt a déjà payé
 * « paramètre de garde optionnel = garde désarmée ». Une lecture EN ÉCHEC vaut
 * `true` chez l'appelant (fail-closed) — se fermer rend un questionnaire plus
 * court, s'ouvrir met une question de portion sous les yeux de quelqu'un qu'on
 * n'a pas su évaluer.
 *
 * ── L'INDISCERNABILITÉ, DEVENUE STRUCTURELLE ──────────────────────────────
 * Sous plancher, la sortie doit être IDENTIQUE à celle d'un élève dont on ne
 * connaît pas la dynamique — sinon le questionnaire lui-même devient un oracle
 * (« on ne m'a pas demandé les portions, donc je suis marqué »). Avant le lot B
 * ça demandait un ordre d'opérations précis (retirer AVANT d'ajouter l'axe, et
 * ne pas ajouter d'axe sous plancher). Maintenant aucune question ne dépend de
 * la dynamique: la propriété est vraie par CONSTRUCTION, et le test qui la
 * garde n'a plus qu'un cas à comparer.
 *
 * ⚠️ CE QUE CETTE FONCTION NE DÉCIDE PAS: si les deux questions de cuisine
 * sont réellement posées. Elle répond AVANT de connaître les réponses;
 * `difficulty` et `speed` dépendent de `cooked`, donc de la première réponse.
 * Voir `cookingQuestionsAreAsked` — même patron que `portionSubjectIsAsked`.
 */
export function questionsFor(restrictionFlag: boolean): FeedbackQuestion[] {
  const all = [...FEEDBACK_QUESTIONS];
  if (!restrictionFlag) return all;
  return all.filter((q) => !RESTRICTED_OUT.includes(q));
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES DEUX QUESTIONS DE CUISINE SONT-ELLES POSÉES ? — la garde que `cooked`
 * est devenu.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ ON NE DEMANDE PAS « c'était trop long ? » À QUELQU'UN QUI N'A PAS
 * CUISINÉ. La réponse serait une supposition sur un geste qui n'a pas eu lieu,
 * et elle déplacerait un réglage réel — dans le sens que ce même `cooked`
 * déplaçait déjà tout seul, en devinant, et que ce lot existe pour arrêter.
 *
 * `partly` compte comme cuisiné: la personne a assez cuisiné pour savoir si
 * c'était long ou dur. C'est même le cas le plus informatif des trois.
 *
 * ⚠️ UNE RÉPONSE ABSENTE (`null`) NE POSE RIEN. « Pas encore répondu » et
 * « n'a pas cuisiné » mènent au même silence ici, et c'est le bon sens de
 * l'échange: la garde s'ouvre sur une réponse, jamais sur son absence.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function cookingQuestionsAreAsked(cooked: string | null): boolean {
  const token = String(cooked ?? "").trim();
  return token === "yes" || token === "partly";
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
  enough_variety: {
    en: "Enough variety in it for you?",
    fr: "Assez de variété à ton goût ?",
  },
  // ── LOT B · LES DEUX QUESTIONS QUI REMPLACENT UNE DÉDUCTION ─────────────
  //
  // ⚠️ ELLES PORTENT SUR LE PLAN, PAS SUR LA PERSONNE — c'est le recadrage du
  // fichier, et le test lexical le vérifie. « Les recettes étaient-elles trop
  // difficiles » parle de ce qu'on a proposé; « as-tu su cuisiner » parlerait
  // de sa compétence, ce qu'aucune question de ce fichier n'a le droit de
  // demander.
  //
  // ⚠️ ET ELLES ANNONCENT UNE ÉCHELLE À DEUX SENS. « Trop dur ? » à trois
  // réponses ferait lire les deux autres comme des « non » de politesse; « où
  // se situaient-elles » invite à placer un curseur, y compris vers le haut.
  difficulty: {
    en: "The recipes in it were:",
    fr: "Les recettes du plan étaient :",
  },
  speed: {
    en: "The time they took was:",
    fr: "Le temps qu'elles ont pris était :",
  },
  // ── LOT B · LE CHAMP LIBRE, ET SON LIBELLÉ EST LA MOITIÉ DU RENVERSEMENT ─
  //
  // ⛔ « QUELQUE CHOSE À RETENIR POUR LA SUITE » — JAMAIS « COMMENT ÇA S'EST
  // PASSÉ ». FF-054 §3.2 interdisait tout champ libre ici, et son motif est
  // écrit: il « inviterait à raconter ce qui a été mangé ». Le renversement du
  // 2026-09-03 est borné par ce libellé-là: il demande une CONSIGNE pour les
  // plans suivants, pas un récit de la semaine. Ce qui raconte un repas n'a de
  // toute façon aucune destination (`skipped.meal_story` du classifieur).
  anything_else: {
    en: "Anything I should keep in mind for the next ones?",
    fr: "Quelque chose à retenir pour les prochains ?",
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
  sometimes: { en: "Sometimes", fr: "Parfois" },
  // ── LOT B · LES DEUX ÉCHELLES DE CUISINE ────────────────────────────────
  // ⚠️ LES LIBELLÉS DÉCRIVENT LA POSITION SUR L'ÉCHELLE, comme ceux des
  // portions: le jeton porte le sens archivé, le libellé dit où la case se
  // trouve sur l'écran. « Bien » au milieu, et pas « Non »: une échelle à deux
  // sens n'a pas de réponse négative, elle a un milieu.
  too_hard: { en: "Too hard", fr: "Trop difficiles" },
  could_do_more: { en: "I could do more", fr: "Je peux faire plus" },
  too_long: { en: "Too long", fr: "Trop long" },
  had_more_time: { en: "I had more time", fr: "J'avais plus de temps" },
  fine: { en: "Fine", fr: "Bien" },
  // ⚠️ `often` et `mostly` RESTENT, et c'est le même motif que les jetons de
  // portion: des réponses écrites en base les portent (les deux axes retirés le
  // 2026-09-03), et la carte comme le journal les relisent pour citer ce que la
  // personne a coché. Un libellé retiré rendrait ces citations muettes.
  often: { en: "Often", fr: "Souvent" },
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

/**
 * UNE RÉPONSE DE PLAT OU D'ALIMENT — lot B.
 *
 * ⛔ DEUX FORMES, ET LA PREMIÈRE EST LE PASSÉ. Une chaîne est un TITRE DE PLAT
 * (la forme d'avant le lot B: 15 lignes en base locale en portent), un objet
 * est un ALIMENT avec sa personne. Les deux se lisent; seule la seconde
 * s'écrit. Remapper les titres en aliments falsifierait des réponses réelles —
 * « Poulet rôti au citron » ne dit pas si c'est le poulet, le citron ou le
 * rôtissage qu'on ne veut plus, et le deviner écrirait une exclusion que
 * personne n'a demandée.
 */
export type FeedbackFoodAnswer = {
  /** L'aliment, tel que l'écran l'a proposé depuis les plats du plan. */
  readonly food: string;
  /**
   * `household` ou `member:<uuid>`. `null` = la question du sujet n'a pas été
   * posée (un solo), et l'appelant range alors sur `household`.
   * ⛔ Jamais un prénom.
   */
  readonly subject: string | null;
};

/** Ce qu'une réponse de plat peut être: un titre (passé) ou un aliment (lot B). */
export type FeedbackDishOrFood = string | FeedbackFoodAnswer;

export interface FeedbackAnswers {
  cooked?: string | null;
  portions?: string | null;
  /** `too_hard` | `fine` | `could_do_more` — lot B. */
  difficulty?: string | null;
  /** `too_long` | `fine` | `had_more_time` — lot B. */
  speed?: string | null;
  /**
   * `yes` | `sometimes` | `no`, POSÉE À TOUT LE MONDE depuis le lot B.
   *
   * ⚠️ ELLE A UN JUMEAU HÉRITÉ, et il est lu: jusqu'au lot B cette réponse
   * voyageait dans `axisQuestion`/`axisAnswer` (la quatrième question, réservée
   * à `maintenance`). `effectOf` lit les deux — voir `legacyVarietyAnswer`.
   */
  variety?: string | null;
  neverAgain?: readonly FeedbackDishOrFood[];
  /** L'inverse: ce qu'on veut revoir. `[]` = aucun, et c'est une réponse. */
  makeAgain?: readonly FeedbackDishOrFood[];
  /**
   * ⚠️ HÉRITÉ, LU ET JAMAIS ÉCRIT — lot B. Le jeton et la réponse de la
   * quatrième question d'avant. `enough_variety` y arrivait pour les comptes
   * `maintenance`; les deux autres axes n'avaient aucun lecteur et sont
   * retirés. Les garder ici est ce qui empêche une ligne déjà en base de
   * cesser d'agir entre deux lectures — même doctrine que `canHold`.
   */
  axisQuestion?: string | null;
  axisAnswer?: string | null;
  /**
   * LE CHAMP LIBRE — lot B. Il n'entre PAS dans `effectOf`: son lecteur est le
   * classifieur du lot A (`classifyAndPersistDraftNote`), qui vit dans l'I/O.
   * Il est déclaré ici pour que le type de la ligne soit complet, et pour qu'un
   * appelant ne puisse pas croire que ce module en fait quelque chose.
   */
  anythingElse?: string | null;
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
  /**
   * LE RÉ-ANCRAGE D'ENVELOPPE — SON SENS **ET** SON AMPLEUR, DANS UN SEUL
   * CHAMP. `null` = ne rien changer.
   *
   * ⚠️ UN SEUL CHAMP, ET C'EST LA GARDE. Deux champs laisseraient exister
   * l'état « on baisse, on ne sait pas de combien » — que le seul lecteur
   * devrait replier, et le repli vraisemblable est `slight`: le cran fort
   * redevenu inatteignable, en silence. Ici l'objet est nul ou complet.
   *
   * ⛔ AUCUN NOMBRE (nomenclature §4): la personne dit « vraiment trop », pas
   * « −240 kcal ». La traduction en fraction de bande vit dans
   * `meal_envelope.ts`, en aval, là où le plancher A1 écrête.
   */
  portionAdjust: FeedbackPortionAdjust | null;
  /**
   * ── LOT B · LES DEUX CRANS DE CUISINE, DANS LES DEUX SENS ──────────────
   *
   * `"down"` = un cran plus simple / plus court, `"up"` = un cran plus
   * ambitieux / plus long, `null` = ne rien changer.
   *
   * ⛔ UN SENS, PAS UNE VALEUR, et c'est la même règle que `portionAdjust`:
   * ce module ne connaît ni l'échelle des minutes ni celle des difficultés.
   * La valeur absolue est calculée par `plan_feedback_retained.ts`, qui a la
   * valeur COURANTE sous les yeux — un cran depuis une base inconnue n'est
   * pas calculable, et le supposer écrirait un réglage que personne n'a choisi.
   *
   * ⛔ ET LE SENS MONTANT EXISTE. Ce qu'on remplace ne savait que descendre
   * (`cooked: no` ⇒ moins de temps ET recettes plus simples, sans demander
   * lequel des deux): un champ qui ne fait que cliqueter vers le bas finit au
   * plancher et n'en remonte jamais.
   */
  difficultyStep: "down" | "up" | null;
  speedStep: "down" | "up" | null;
  /**
   * LES ALIMENTS À VERSER EN PRÉFÉRENCE COMME REFUSÉS — lot B.
   *
   * ⚠️ DES ALIMENTS AVEC LEUR PERSONNE, PLUS DES TITRES DE PLATS. Un titre
   * (« Poulet rôti au citron ») ne dit pas ce qu'on ne veut plus, et le
   * générateur ne peut rien filtrer avec ça. La forme héritée (une chaîne) est
   * LUE et normalisée en `{food: <le titre>, subject: null}`: c'est ce que la
   * personne a répondu, et le reclasser serait le falsifier.
   */
  refusedFoods: readonly FeedbackFoodAnswer[];
  /**
   * Les aliments VOULUS. Même canal, polarité inverse.
   *
   * ⚠️ UNE LISTE DISTINCTE, ET PAS UN SIGNE SUR LA PREMIÈRE. Un même aliment
   * ne peut pas être dans les deux (l'écran l'interdit), mais les fondre en une
   * liste signée obligerait chaque lecteur à connaître la convention de signe —
   * et le premier qui l'oublie ferait éviter à vie un aliment qu'on avait aimé.
   */
  keptFoods: readonly FeedbackFoodAnswer[];
  /**
   * ⚠️ LA PRESSION SUR LA VARIÉTÉ — `"more"` ou rien.
   *
   * C'est une PRESSION, pas un réglage: cette table ne connaît pas la variété
   * courante de la personne, donc elle ne peut pas rendre une valeur absolue.
   * `plan_feedback_retained.ts` la traduit en un cran plus haut, à partir de la
   * valeur connue — exactement comme les deux crans de cuisine ci-dessus.
   *
   * ⛔ IL N'EXISTE PAS DE `"less"`, ET C'EST UNE ASYMÉTRIE VOULUE. « Assez de
   * variété ? — Oui » veut dire « ne change rien », jamais « répète plus ».
   * Descendre la variété de quelqu'un qui vient de dire que ça allait serait
   * lui retirer quelque chose au motif qu'il n'a rien demandé.
   */
  varietyPressure: "more" | null;
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
    // ⚠️ UNE LECTURE DE TABLE, PAS UNE CASCADE DE TERNAIRES. `null` porte ici
    // l'ABSENCE d'entrée (`right`, un vide, un jeton forgé), pas le repli d'un
    // refus.
    portionAdjust: portionAdjustFor(portions),
    // ── LOT B · LES DEUX CRANS DE CUISINE ──────────────────────────────────
    //
    // ⛔ `cooked` EST UNE GARDE, PAS UN EFFET. Il ne déplace plus rien tout
    // seul (c'était `easeCookingBy` + `simplifyRecipes`, qui devinaient lequel
    // des deux problèmes la personne avait eu); il décide seulement si ces deux
    // questions ont été posées. Une réponse arrivée sans que `cooked` l'autorise
    // est IGNORÉE ici — un client cassé, ou une charge forgée, ne déplace pas
    // un réglage réel.
    difficultyStep: cookingQuestionsAreAsked(cooked)
      ? stepOf(answers.difficulty ?? null, "too_hard", "could_do_more")
      : null,
    speedStep: cookingQuestionsAreAsked(cooked)
      ? stepOf(answers.speed ?? null, "too_long", "had_more_time")
      : null,
    // `none` n'est pas un aliment: il ne doit jamais atterrir dans les
    // préférences. Et une entrée illisible TOMBE SEULE, sans emporter sa voisine.
    refusedFoods: foodAnswersOf(answers.neverAgain),
    // MÊME FILTRE, MÊME RAISON. Un « aucun » versé aux préférences créerait un
    // aliment VOULU fantôme que le générateur chercherait à vie — le symétrique
    // exact du refus fantôme que la ligne au-dessus empêche.
    keptFoods: foodAnswersOf(answers.makeAgain),
    varietyPressure: varietyPressureFor(varietyAnswerOf(answers)),
  };
}

/**
 * UN CRAN, DEPUIS UN VOCABULAIRE À TROIS JETONS — lot B.
 *
 * ⛔ LES DEUX JETONS AGISSANTS SONT PASSÉS EN PARAMÈTRE, jamais devinés. Les
 * deux échelles ont le même MILIEU (`fine`) et des extrêmes différents
 * (`too_hard`/`could_do_more`, `too_long`/`had_more_time`): une fonction qui
 * lirait « le premier jeton de la liste » marcherait par coïncidence d'ordre, et
 * casserait le jour où quelqu'un réordonne une option à l'écran.
 *
 * ⛔ PROPRIÉTÉ EXACTE, AUCUNE CASSE IGNORÉE, AUCUN `trim` — comme sur les
 * portions. Les jetons viennent d'une liste fermée rendue par ce module même, et
 * la RPC les nettoie avant de les stocker; normaliser ici ferait une SECONDE
 * normalisation, qui divergerait.
 */
function stepOf(
  answer: string | null,
  downToken: string,
  upToken: string,
): "down" | "up" | null {
  const token = String(answer ?? "");
  if (token === downToken) return "down";
  if (token === upToken) return "up";
  // `fine`, un vide, un jeton forgé: rien ne bouge. « C'était bien » est une
  // réponse, et sa réponse est « ne change rien ».
  return null;
}

/**
 * LA RÉPONSE DE VARIÉTÉ, D'OÙ QU'ELLE VIENNE — lot B.
 *
 * ⛔ LE CHAMP NEUF D'ABORD, L'HÉRITÉ ENSUITE, ET JAMAIS LES DEUX. Une ligne
 * écrite avant le lot B porte cette réponse dans `axis_answer`, sous le jeton
 * `axis_question = "enough_variety"`; une ligne neuve la porte dans `variety`.
 * Les additionner ferait compter deux fois la même réponse sur une ligne en
 * cours de migration.
 *
 * ⛔ ET LE JETON HÉRITÉ EST VÉRIFIÉ, PAS SUPPOSÉ. `no` était une option des
 * TROIS anciens axes et `sometimes` de DEUX: lire `axis_answer` sans son jeton
 * ferait entrer une réponse à `hunger_between_meals` — la question que le
 * plancher TCA retirait — dans le réglage de variété. C'est la garde d'origine,
 * conservée mot pour mot dans son intention.
 */
function varietyAnswerOf(answers: FeedbackAnswers): string | null {
  const fresh = String(answers.variety ?? "").trim();
  if (fresh) return fresh;
  return legacyVarietyAnswer(
    answers.axisQuestion ?? null,
    answers.axisAnswer ?? null,
  );
}

/**
 * LE JETON HÉRITÉ DE LA VARIÉTÉ — exporté pour que le lecteur de lignes
 * anciennes (`plan_feedback_retained.ts`) n'en écrive pas une seconde copie.
 */
export function legacyVarietyAnswer(
  axisQuestion: string | null,
  axisAnswer: string | null,
): string | null {
  if (String(axisQuestion ?? "").trim() !== "enough_variety") return null;
  const answer = String(axisAnswer ?? "").trim();
  return answer || null;
}

/**
 * LES ALIMENTS D'UNE RÉPONSE DE PLAT, NORMALISÉS — lot B.
 *
 * Les deux formes entrent, une seule sort: une chaîne devient
 * `{food: <la chaîne>, subject: null}`. `none` et les vides sortent.
 *
 * ⛔ AUCUN RAPPROCHEMENT, AUCUNE NORMALISATION DU TEXTE. L'appartenance au plan
 * est vérifiée en aval, par une égalité exacte à la liste que l'écran a
 * proposée. « laitue » ≠ « lait », et ce dépôt a 12 faux positifs sur 12 au
 * compteur pour le jour où quelqu'un a cru pouvoir rapprocher deux mots.
 */
function foodAnswersOf(
  raw: readonly FeedbackDishOrFood[] | undefined,
): FeedbackFoodAnswer[] {
  const out: FeedbackFoodAnswer[] = [];
  for (const entry of raw ?? []) {
    if (typeof entry === "string") {
      const food = entry.trim();
      if (food === "" || food === "none") continue;
      out.push({ food, subject: null });
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const food = String(entry.food ?? "").trim();
    if (food === "" || food === "none") continue;
    const subject = String(entry.subject ?? "").trim();
    out.push({ food, subject: subject || null });
  }
  return out;
}

/**
 * LE CRAN QU'UNE RÉPONSE DE PORTION DEMANDE, ou `null`.
 *
 * ⛔ PROPRIÉTÉ **PROPRE**, JAMAIS L'HÉRITAGE. `PORTION_ANSWER_ADJUST["constructor"]`
 * rend une FONCTION sur un objet littéral, et cette réponse arrive d'un corps
 * de requête HTTP. Sans ce test, un jeton forgé rendrait un « ajustement »
 * tronqué: `portionSubjectIsAsked` demanderait « pour qui ? » sur une case que
 * personne n'a cochée, et l'item construit en aval serait refusé par le socle.
 *
 * ⛔ AUCUN `trim()`, AUCUNE CASSE IGNORÉE: la comparaison est exacte, comme
 * elle l'a toujours été sur ces jetons.
 */
function portionAdjustFor(answer: string | null): FeedbackPortionAdjust | null {
  const token = String(answer ?? "");
  if (!Object.prototype.hasOwnProperty.call(PORTION_ANSWER_ADJUST, token)) {
    return null;
  }
  return PORTION_ANSWER_ADJUST[token];
}

/**
 * LA PRESSION SUR LA VARIÉTÉ.
 *
 * ── POURQUOI « PARFOIS » AGIT AUSSI ────────────────────────────────────────
 * « Assez de variété ? — Parfois » veut dire « parfois, pas toujours ». C'est
 * le patron des deux échelles de cuisine, où le cran du milieu ne bouge rien et
 * les deux extrêmes bougent d'un cran. Ici il n'y a qu'UN sens: `sometimes` et
 * `no` demandent donc le même pas, et c'est le plus petit que le vocabulaire
 * permette.
 *
 * OPTION ÉCARTÉE: ne faire agir que `no`. Refusée parce qu'elle rendrait
 * « parfois » strictement équivalent à « oui » — c'est-à-dire poser une
 * question à trois réponses dont deux ne changent rien.
 *
 * ⚠️ PLUS DE GARDE DE JETON D'AXE ICI, et ce n'est pas un relâchement: la
 * question est UNIQUE depuis le lot B, donc il n'y a plus deux questions dont
 * `no` serait une réponse commune. La garde a déménagé dans
 * `legacyVarietyAnswer`, qui est le seul endroit où une réponse d'axe ancienne
 * entre encore.
 */
function varietyPressureFor(answer: string | null): "more" | null {
  switch (String(answer ?? "").trim()) {
    case "no":
    case "sometimes":
      return "more";
    default:
      // « oui », une réponse absente, ou un jeton forgé: rien ne bouge.
      return null;
  }
}
