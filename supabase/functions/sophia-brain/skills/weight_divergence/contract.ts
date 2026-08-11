/**
 * FF-056 — LE CONTRAT DU SOUS-FLOW DE DIVERGENCE.
 *
 * Fiche: `docs/fonctionnalites/conversation/FF-056-la-divergence-constatee.md`
 * Patron: `skills/safety_crisis/` et `skills/disordered_eating_guard/`.
 *
 * ── CE QUE CE FICHIER EST ───────────────────────────────────────────────────
 * Des listes FERMÉES et rien d'autre. Aucune décision, aucune I/O, aucun
 * modèle. Trois d'entre elles portent une garantie de la fiche, et chacune la
 * porte PAR CONSTRUCTION plutôt que par consigne:
 *
 *   `WEIGHT_DIVERGENCE_CATEGORIES` — R4. Le classifieur ne peut rendre qu'un
 *      élément de cet ensemble; tout le reste devient `other`. `other` n'est
 *      pas un défaut de classement, c'est la SOUPAPE: « un classifieur qui
 *      force les cases produit des actions à côté, et une personne mal lue ne
 *      répond plus » (§9).
 *
 *   `WEIGHT_DIVERGENCE_MAX_TURNS` — R6. La borne est structurelle: le reducer
 *      la lit, il ne la « respecte » pas.
 *
 *   `FORBIDDEN_*` — R11 et le rabbit hole du soupçon. Ce qui entre dans un
 *      prompt finit par sortir; ces listes sont ce qui l'attrape à la sortie.
 *
 * ── L'OUVERTURE N'EST PAS ICI, ET C'EST LE POINT LE PLUS IMPORTANT ─────────
 * La question d'ouverture est un LITTÉRAL GELÉ du moteur du soir
 * (`_shared/keel/weight_divergence_engine.ts`), pas une tâche de ce flow. R2 et
 * R3 portent sur le SUJET DE LA PHRASE et sur son ouverture — deux propriétés
 * qu'un tirage ne peut pas garantir. Ce flow ne commence qu'au tour SUIVANT,
 * quand il y a une réponse à lire.
 */

export const WEIGHT_DIVERGENCE_SKILL_ID = "weight_divergence";

// ---------------------------------------------------------------------------
// LES NEUF CATÉGORIES — §3, tableau. FERMÉES.
// ---------------------------------------------------------------------------

export const WEIGHT_DIVERGENCE_CATEGORIES = [
  /** nomme un moment ou un aliment: « le matin je grignote », « je me ressers ». */
  "named_spot",
  /** ne suit pas le plan: cuisine autre chose, mange dehors. */
  "plan_mismatch",
  /** l'activité a chuté: arrêt du sport, blessure. */
  "activity_drop",
  /** cause médicale: traitement, thyroïde. */
  "medical",
  /** sommeil, stress. */
  "life_factor",
  /** conteste ou relativise: muscle, eau, mauvaise pesée. */
  "not_a_divergence",
  /** ne sait pas. */
  "unknown",
  /** ne veut pas en parler. */
  "declined",
  /** tout le reste. OBLIGATOIRE. */
  "other",
] as const;
export type WeightDivergenceCategory =
  (typeof WEIGHT_DIVERGENCE_CATEGORIES)[number];

export function isWeightDivergenceCategory(
  value: unknown,
): value is WeightDivergenceCategory {
  return (WEIGHT_DIVERGENCE_CATEGORIES as readonly string[])
    .includes(String(value ?? ""));
}

// ---------------------------------------------------------------------------
// LES BORNES
// ---------------------------------------------------------------------------

/**
 * LE PLAFOND DE TOURS (R6). 3, le précédent est le flow de précision de repas
 * (`MEAL_PRECISION_MAX_TURNS = 2`) + un, parce que celui-ci a une marche de
 * plus: approfondir UNE fois avant d'agir.
 *
 * « Chaque tour au-delà de trois transforme l'échange en séance » (§9). Le
 * plafond n'est pas une consigne de prompt: `reduceWeightDivergence` le lit et
 * sort, quoi que le modèle ait répondu.
 */
export const WEIGHT_DIVERGENCE_MAX_TURNS = 3;

/**
 * COMBIEN DE JOURS UNE QUESTION SANS RÉPONSE RESTE VIVANTE.
 *
 * 2. « La personne ignore la question ⇒ expiration silencieuse, cooldown
 * normal, aucune relance » (§7). Deux jours plutôt qu'un: quelqu'un qui ouvre
 * l'app le surlendemain répond encore à une question qu'il vient de lire. Au
 * delà, la question est un reproche différé.
 */
export const WEIGHT_DIVERGENCE_OPEN_FOR_DAYS = 2;

/**
 * LE DÉLAI D'EXPIRATION D'UN ÉCHANGE EN COURS, EN MINUTES.
 *
 * 30 — exactement le flow de précision de repas. Passé ce délai, « oui » ne
 * répond plus à une question posée ce matin: il répond à autre chose, et
 * l'amender comme une réponse au flow ferait dire à quelqu'un ce qu'il n'a pas
 * dit.
 */
export const WEIGHT_DIVERGENCE_TURN_TIMEOUT_MINUTES = 30;

/**
 * LA FENÊTRE D'OBSERVATION, EN JOURS. 3, et le chiffre est dans la fiche.
 *
 * « Bornée, demandée, finie d'avance. La prolonger parce que ça marchait bien
 * recrée exactement la collecte que le produit a tuée » (§9).
 */
export const WEIGHT_DIVERGENCE_OBSERVATION_DAYS = 3;

// ---------------------------------------------------------------------------
// LES PHASES ET LES TÂCHES VISIBLES
// ---------------------------------------------------------------------------

export const WEIGHT_DIVERGENCE_PHASES = [
  /** la question est partie, on attend. */
  "opened",
  /** une réponse inclassable a été reformulée UNE fois. */
  "deepening",
  /** fini. */
  "closed",
] as const;
export type WeightDivergencePhase =
  (typeof WEIGHT_DIVERGENCE_PHASES)[number];

/**
 * CE QUE LE TOUR DOIT FAIRE. Un par chemin de §3, plus les deux sorties.
 *
 * ⚠️ AUCUNE TÂCHE NE « CREUSE ». Il n'existe pas de `ask_for_more_detail`, pas
 * de `confirm_what_they_said`, pas de `check_the_other_meals`. La seule
 * relance possible est `reformulate_once`, et elle n'arrive que sur `other`.
 * C'est la forme que prend « 2-3 tours max » quand on la met dans le type.
 */
export const WEIGHT_DIVERGENCE_VISIBLE_TASKS = [
  /** `named_spot` → la proposition d'action durable, portée par le canal FF-028. */
  "propose_named_spot_action",
  /** `named_spot` sans action disponible → on le dit, on ne bricole pas. */
  "acknowledge_named_spot_without_action",
  /** `plan_mismatch` → contraintes pratiques et fenêtre de plan. */
  "point_to_plan_fit",
  /** `activity_drop` → consigné. JAMAIS une prescription d'exercice. */
  "acknowledge_activity_drop",
  /** `medical` → enregistré, zéro interprétation, orientation médecin. */
  "acknowledge_medical",
  /** `life_factor` → accusé honnête, AUCUNE promesse de levier qu'on n'a pas. */
  "acknowledge_life_factor",
  /** `not_a_divergence` → « il n'y a rien à changer ». Une BONNE fin (R5). */
  "close_nothing_to_change",
  /** `unknown` → la fenêtre d'observation, bornée et annoncée. */
  "offer_observation_window",
  /** `declined` → une phrase, et c'est fini. */
  "respect_decline",
  /** `other` → reformuler UNE fois. */
  "reformulate_once",
  /** le plafond de tours, ou une seconde réponse inclassable. */
  "close_out",
] as const;
export type WeightDivergenceVisibleTaskKind =
  (typeof WEIGHT_DIVERGENCE_VISIBLE_TASKS)[number];

// ---------------------------------------------------------------------------
// L'ÉTAT DE TOUR EN TOUR
// ---------------------------------------------------------------------------

export interface WeightDivergenceWorkingState {
  episode_id?: string;
  phase?: string;
  turn_count?: number;
  /** La catégorie retenue au dernier tour classé. */
  last_category?: string;
  /** Une seule reformulation par épisode. */
  reformulated?: boolean;
  last_visible_task?: string;
}

// ---------------------------------------------------------------------------
// LA TÂCHE VISIBLE, TELLE QUE LE MODÈLE LA REÇOIT
// ---------------------------------------------------------------------------

export interface WeightDivergenceVisibleTask {
  kind: WeightDivergenceVisibleTaskKind;
  conversation_context: {
    phase: WeightDivergencePhase;
    /**
     * Les mots de la personne, tels quels.
     *
     * ⚠️ C'est LA SEULE chose que le prompt sait de sa réponse. Aucune
     * catégorie n'y entre en toutes lettres: dire au modèle « catégorie:
     * named_spot » l'inviterait à nommer un moment que la personne n'a
     * peut-être pas nommé, et « le flow ne spécule jamais » est le premier des
     * deux points qui gouvernent le dessin (§4).
     */
    user_words: string[];
    /**
     * L'action pré-calculée, quand il y en a une. Son texte EXACT vient du
     * canal FF-028: le modèle l'enrobe, il ne la réécrit pas.
     */
    proposed_action_text: string | null;
    next_focus: string;
    tone_constraints: readonly string[];
    do_not_say: readonly string[];
    max_questions: number;
  };
}

export interface WeightDivergenceReduction {
  phase: WeightDivergencePhase;
  visibleTask: WeightDivergenceVisibleTask;
  statePatch: WeightDivergenceWorkingState;
  status: "continue" | "exit";
  /** L'état à écrire sur l'épisode. `null` = ne rien changer ce tour-ci. */
  episodeState:
    | "in_flow"
    | "acted"
    | "nothing_to_change"
    | "declined"
    | "expired"
    | null;
  /** La catégorie à écrire sur l'épisode. `null` = ne rien changer. */
  episodeCategory: WeightDivergenceCategory | null;
  /** Ouvrir la fenêtre d'observation à la fin de ce tour ? */
  opensObservationWindow: boolean;
  /** L'action durable à proposer par le canal FF-028, s'il y en a une. */
  proposedActionId: string | null;
  reasonCode: string;
}

// ---------------------------------------------------------------------------
// LES INTERDITS DE SORTIE — R11 et le rabbit hole du soupçon
// ---------------------------------------------------------------------------

/**
 * L'ÉNERGIE, EN CHIFFRES ET EN TOUTES LETTRES, FR ET EN.
 *
 * La forme en toutes lettres est là parce qu'elle a DÉJÀ traversé le filtre de
 * FF-018 (« environ trois cents calories »). Un filtre qui ne connaît que les
 * chiffres laisse passer la phrase que les gens écrivent vraiment.
 */
export const FORBIDDEN_ENERGY_TERMS: readonly string[] = Object.freeze([
  "calorie",
  "calories",
  "kcal",
  "kilocalorie",
  "kilocalories",
  "cal",
  "deficit calorique",
  "caloric deficit",
  "calorie deficit",
  "surplus calorique",
  "caloric surplus",
  "apport energetique",
  "energy intake",
  "depense energetique",
  "energy expenditure",
  "macros",
  "macronutriments",
  "macronutrients",
]);

/**
 * LE FRAMING « IL MENT ». Le rabbit hole nommé §9, attrapé à la sortie.
 *
 * ⚠️ CE SONT DES LOCUTIONS, PAS DES MOTS. « sûr » tout seul est un mot normal
 * (« bien sûr »); « tu es sûr » est une mise en doute. Le dépôt a la cicatrice
 * inverse (`never-hand-roll-a-matcher-here`: « laitue » ≠ « lait »), et c'est
 * pour ça que le matcher est celui du dépôt, pas un `includes` maison.
 *
 * ⚠️ LA NÉGATION NE BLANCHIT RIEN ICI, et l'option est passée explicitement au
 * matcher. « Je ne dis pas que tu mens » dit quand même « tu mens ». C'est le
 * seul appelant du dépôt à demander le mode absolu, et c'est justifié: ailleurs
 * on cherche un aliment cité, ici on cherche une INSINUATION.
 */
export const FORBIDDEN_SUSPICION_PHRASES: readonly string[] = Object.freeze([
  // --- FR ---
  "tu es sur",
  "t es sur",
  "es tu sur",
  "vous etes sur",
  "tu es certain",
  "sincerement",
  "honnetement",
  // ⚠️ LA LOCUTION, PAS LE MOT. « honnête » tout seul est un mot normal — le
  // repli de ce flow écrit lui-même « c'est une réponse honnête ». Ce qui est
  // interdit, c'est l'INJONCTION à l'honnêteté, qui présuppose son absence.
  "sois honnete",
  "soyez honnete",
  "honnete avec moi",
  "avoue",
  "avouer",
  "tu mens",
  "mensonge",
  "tricher",
  "triche",
  "en cachette",
  "vraiment tout",
  "tes coches disent",
  "tes coches",
  "pourtant tu",
  "pourtant tes",
  "les chiffres disent",
  "ca ne colle pas",
  "ca colle pas",
  // --- EN ---
  "are you sure",
  "you sure",
  "be honest",
  "honestly",
  "admit it",
  "own up",
  "you are lying",
  "you re lying",
  "lying",
  "cheating",
  "cheat",
  "in secret",
  "secretly",
  "everything you ate",
  "your ticks say",
  "your check ins say",
  "but your",
  "the numbers say",
  "that does not add up",
  "that doesn t add up",
  "does not add up",
]);

/**
 * LE REPROCHE. Distinct du soupçon: le soupçon met en doute, le reproche juge.
 *
 * `discipline`, `volonte`, `serieux`, `effort` — le vocabulaire de la faute
 * morale. Il n'a rien à faire dans une conversation sur un résultat qui ne
 * suit pas, et c'est exactement ce vers quoi un modèle glisse quand on lui
 * demande de parler d'un plan qui ne marche pas.
 */
export const FORBIDDEN_BLAME_TERMS: readonly string[] = Object.freeze([
  // --- FR ---
  "discipline",
  "volonte",
  "manque de serieux",
  "pas serieux",
  "laisser aller",
  "laisse aller",
  "faute",
  "coupable",
  "culpabilite",
  "ecart de conduite",
  "tu aurais du",
  "il faut que tu",
  // --- EN ---
  "willpower",
  "discipline",
  "self control",
  "slacking",
  "slipping",
  "your fault",
  "guilty",
  "you should have",
  "you need to try",
  "lack of effort",
]);

/**
 * CE QUI LIERAIT LA QUESTION À LA PESÉE — LE RED MAJEUR DE §10.
 *
 * « Puisque tu t'es pesé… » est interdit, et pas pour le ton: c'est la phrase
 * qui APPREND à ne plus se peser. Si les gens cessent de monter sur la balance
 * pour éviter la question, ce flow détruit sa propre entrée ET la série que lit
 * la ceinture TCA.
 *
 * On ne peut pas mesurer la fréquence de pesée en local. On peut garantir que
 * rien dans les textes ne fait ce lien, et c'est ce que cette liste fait.
 */
export const FORBIDDEN_WEIGH_IN_LINK_PHRASES: readonly string[] = Object
  .freeze([
    // --- FR ---
    // Les apostrophes sont converties en espaces AVANT le scan (voir
    // `validateWeightDivergenceMessage`): « tu t'es pesé » arrive donc comme
    // « tu t es pese » et ces locutions mordent.
    "puisque tu t es pese",
    "puisque tu te peses",
    "comme tu t es pese",
    "vu que tu t es pese",
    "tu t es pese",
    "tu te peses",
    "ta pesee",
    "tes pesees",
    "sur la balance",
    "monte sur la balance",
    "ton poids de ce matin",
    "chaque fois que tu te peses",
    // --- EN ---
    "since you weighed",
    "because you weighed",
    "now that you weighed",
    "your weigh in",
    "your weigh ins",
    "on the scale",
    "step on the scale",
    "this morning s weight",
    "every time you weigh",
  ]);

/**
 * LE MAXIMUM DE QUESTIONS PAR TÂCHE.
 *
 * Zéro partout sauf trois endroits, et c'est ce qui empêche le flow de
 * s'allonger tout seul: une tâche qui ne peut pas poser de question ne peut
 * pas prolonger l'échange, quelle que soit l'envie du modèle.
 */
export const WEIGHT_DIVERGENCE_MAX_QUESTIONS: Readonly<
  Record<WeightDivergenceVisibleTaskKind, number>
> = Object.freeze({
  propose_named_spot_action: 1,
  acknowledge_named_spot_without_action: 0,
  point_to_plan_fit: 0,
  acknowledge_activity_drop: 0,
  acknowledge_medical: 0,
  acknowledge_life_factor: 0,
  close_nothing_to_change: 0,
  offer_observation_window: 1,
  respect_decline: 0,
  reformulate_once: 1,
  close_out: 0,
});
