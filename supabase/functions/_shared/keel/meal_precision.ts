// LA PRÉCISION D'UN REPAS DÉCLARÉ — ce qui manque, et si ça vaut une question.
//
// LE DÉFAUT QU'IL FERME
// ---------------------
//   Élève : « j'ai mangé du poulet »
//   Système : écrit `food_group:poultry`, répond « Recorded: Poultry ».
//
// Le coach lit que son élève a mangé du poulet, point. Il ne sait pas s'il y
// avait un féculent, un légume, une matière grasse de cuisson — c'est-à-dire
// rien de ce qui l'intéresse. Le fait est techniquement juste et pratiquement
// inutilisable, et il pèse dans la couverture comme s'il était complet.
//
// LA LIGNE ROUGE, ET ELLE EST STRUCTURELLE
// ----------------------------------------
// Une question de précision ne demande JAMAIS une quantité. Le contrat
// (`docs/keel/CONTRACT.md`, non-input #4) refuse toute mesure d'énergie ou de
// masse, et `stripMeasurementFacts` l'applique déjà au chemin photo.
//
// C'est pour ça que le TEXTE des questions vit ici, en gabarits FERMÉS, et
// n'est pas confié à un modèle. Un prompt est une intention; une constante est
// une garantie. `meal_precision_test.ts` passe chaque gabarit au crible d'un
// lexique de quantité, dans les deux langues — la garde ne peut pas dériver
// sans casser un test.
//
// LA CONDITION DE MISE, ET POURQUOI ELLE EST DÉTERMINISTE
// -------------------------------------------------------
// « On ne pose la question que si la réponse changerait ce que le protocole du
// coach dit de ce repas. » Le chemin photo a rendu cette règle déterministe
// (`meal_analysis.ts` FILTRE 3: la question ne survit que si la lecture porte
// une vraie incertitude). Ici la même règle prend la seule forme qu'elle peut
// prendre côté texte: **un axe ne compte comme manquant que si une ligne
// ENCORE OUVERTE du protocole du jour en dépend**. Sans ligne qui en dépend,
// la réponse ne changerait rien, et « le fait imprécis vaut mieux qu'un élève
// qu'on a lassé ».
//
// MODULE PUR: aucune I/O, aucune horloge, aucun aléa.

import { FOOD_GROUP_CLASSES } from "./meal_analysis.ts";
import { labelFor, localePackFor } from "./labels.ts";
import { isFrenchLocale, type LocalePackKey, localePackKey } from "./locale.ts";
import type { FoodGroupRef } from "./tokens.ts";

// ---------------------------------------------------------------------------
// Le vocabulaire — UN seul, partagé par les deux sources
// ---------------------------------------------------------------------------

/**
 * Les axes de précision. Liste FERMÉE (R1), et volontairement courte.
 *
 * L'axe PORTION n'y est pas et n'y sera jamais: il existe côté photo sous forme
 * de bande ordinale (`small|moderate|large|unclear`) déduite de l'image, et il
 * n'est jamais demandé à l'élève. Le demander serait la question de quantité
 * que le contrat interdit, déguisée.
 *
 * Pas de score flottant en sortie non plus: un score invite à un seuil magique,
 * une liste invite à une question.
 */
export const MEAL_PRECISION_AXES = [
  /** Rien n'a été nommé: « j'ai déjeuné », « j'ai mangé un truc rapide ». */
  "composition",
  /** Un aliment nommé, et le protocole attend autre chose à côté. */
  "accompaniment",
  /** Le protocole porte sur la matière grasse / la friture / la sauce. */
  "preparation",
  /** Deux créneaux du jour peuvent recevoir ce fait, aucun n'est nommé. */
  "slot",
] as const;
export type MealPrecisionAxis = (typeof MEAL_PRECISION_AXES)[number];

/**
 * La correspondance avec `ASSUMPTION_SUBJECTS` (chemin photo). §P5.3: un seul
 * vocabulaire, deux surfaces.
 *
 * `other` n'a pas d'axe: c'est le fourre-tout qui existe pour ne PAS perdre une
 * hypothèse dont le token a dérivé, et le mapper de force donnerait une question
 * choisie au hasard.
 */
export const ASSUMPTION_SUBJECT_TO_AXIS: Readonly<
  Record<string, MealPrecisionAxis | null>
> = {
  cooking_fat: "preparation",
  sauce_dressing: "preparation",
  added_sugar: "preparation",
  preparation_method: "preparation",
  beverage_content: "composition",
  hidden_component: "composition",
  other: null,
};

// ---------------------------------------------------------------------------
// Les entrées
// ---------------------------------------------------------------------------

/**
 * Un composant tel que `log_protocol_event/intake.ts` le produit, réduit à son
 * IDENTITÉ. Ni quantité ni unité: elles ne participent à aucune règle ici, et
 * les faire entrer serait ouvrir la porte à une règle qui en dépendrait.
 */
export interface PrecisionComponent {
  food_group_ref: string | null;
  substance_ref: string | null;
  commitment_id: string | null;
}

/**
 * Une ligne du protocole du jour, réduite à ce qui décide de la MISE.
 *
 * C'est un sous-ensemble strict de `KeelCommitmentLine` — le module reste
 * `_shared` et ne doit pas dépendre d'un type de `sophia-brain`, sinon la
 * fonction edge photo ne peut plus l'importer.
 */
export interface PrecisionPlanLine {
  commitment_id: string;
  polarity: string;
  food_group_ref: string | null;
  /** Créneau de la ligne, ou "free" quand elle n'en porte pas. */
  bucket: string;
  /** État du jour: seul `unknown` laisse une réponse changer quelque chose. */
  status: string;
  grain: string;
  slot_kind: string | null;
}

export interface MealPrecisionInput {
  components: readonly PrecisionComponent[];
  /** Le créneau résolu pour ce fait, ou null quand personne ne l'a nommé. */
  slotKey: string | null;
  /** Les lignes du jour. `week` en est EXCLU: voir `assessMealPrecision`. */
  planLines: readonly PrecisionPlanLine[];
}

export interface MealPrecisionAssessment {
  /** Les axes manquants, dans l'ordre de priorité. Vide = rien à demander. */
  axes: MealPrecisionAxis[];
  /** L'axe qu'on poserait. Une question maximum, donc un axe maximum. */
  primary: MealPrecisionAxis | null;
  /** Toujours nommé, jamais un silence. */
  reason_code: string;
  /** Les lignes du plan qui donnent sa mise à `primary`. Traçabilité. */
  depends_on: string[];
  /**
   * Les créneaux candidats quand `primary === "slot"`. Ils NOMMENT la question
   * (« lunch or dinner? ») au lieu de la laisser vague.
   */
  slot_candidates: string[];
}

// ---------------------------------------------------------------------------
// Les classes qui portent une règle
// ---------------------------------------------------------------------------

/**
 * Les groupes dont la présence dépend de la PRÉPARATION, pas du contenu de
 * l'assiette. Une photo peut les rater et une déclaration textuelle ne les
 * nomme presque jamais: personne n'écrit « j'ai mangé du poulet et deux
 * cuillères d'huile d'olive ».
 */
const PREPARATION_SENSITIVE: ReadonlySet<string> = new Set([
  "olive_oil",
  "other_added_fat",
  "fried_food",
  "sauce_dressing",
]);

/**
 * Les classes d'aliments qui SE CUISINENT. Sans l'une d'elles dans la
 * déclaration, la question de préparation n'a pas d'objet: on ne demande pas
 * comment une pomme a été cuite.
 */
const COOKABLE_CLASSES: ReadonlySet<string> = new Set([
  "protein",
  "legume",
  "grain",
  "vegetable",
]);

/**
 * Les créneaux qui n'assertent RIEN (`evaluator.ts :: slotScopeExcludes` les
 * traite pareil). Une ligne posée là accepte n'importe quelle occasion, donc
 * elle ne peut jamais motiver une question de créneau.
 */
const UNSPECIFIC_BUCKETS: ReadonlySet<string> = new Set([
  "free",
  "any_meal",
  "any_time",
]);

function classOf(slug: string | null): string | null {
  if (!slug) return null;
  return FOOD_GROUP_CLASSES[slug as FoodGroupRef] ?? null;
}

/**
 * La ligne est-elle hors de portée de ce fait à cause du créneau ?
 *
 * MIROIR EXACT de `evaluator.ts :: slotScopeExcludes`, et ce n'est pas une
 * élégance: si ce module comptait une ligne que l'évaluateur n'atteindra
 * jamais, on questionnerait un élève pour une ligne que la réponse ne peut pas
 * bouger. Un fait SANS créneau n'est jamais exclu — c'est ce qui rend l'axe
 * `slot` possible plus bas au lieu de contradictoire.
 */
function slotScopeExcludes(line: PrecisionPlanLine, slotKey: string | null): boolean {
  if (line.grain !== "occasion") return false;
  if (line.slot_kind !== "nominal") return false;
  if (UNSPECIFIC_BUCKETS.has(line.bucket)) return false;
  if (slotKey === null) return false;
  return line.bucket !== slotKey;
}

/**
 * Les lignes qu'une réponse peut ENCORE bouger aujourd'hui.
 *
 * Trois filtres, et chacun retire une question qui ne servirait à rien:
 *  - `food_group_ref` non nul: une ligne « 8 000 pas » ne se précise pas en
 *    disant ce qu'il y avait dans l'assiette;
 *  - `status === 'unknown'`: une ligne déjà `met` ou `missed` a sa réponse. La
 *    précision arrive trop tard, et poser la question serait faire travailler
 *    l'élève pour rien;
 *  - polarité `do` ou `avoid`: `capture` est une ligne d'observation, elle
 *    n'attend aucune conformité.
 */
function openLinesFor(input: MealPrecisionInput): PrecisionPlanLine[] {
  return input.planLines.filter((line) =>
    line.food_group_ref !== null &&
    line.status === "unknown" &&
    (line.polarity === "do" || line.polarity === "avoid") &&
    !slotScopeExcludes(line, input.slotKey)
  );
}

// ---------------------------------------------------------------------------
// L'évaluation
// ---------------------------------------------------------------------------

/**
 * Ce qui manque à cette déclaration pour que le protocole du coach en tire
 * quelque chose.
 *
 * `planLines` DOIT être le protocole du JOUR (`KeelPlanContext.today`), pas
 * `today + week`. Les lignes à grain hebdomadaire sont satisfiables n'importe
 * quel jour de la semaine: les compter ici ferait poser une question sur un
 * repas de mardi au motif qu'une ligne de la semaine est encore ouverte, ce
 * qui est vrai tous les jours et donc n'est jamais une raison de questionner
 * CE repas-là. C'est la lecture littérale du prompt (« une ligne du protocole
 * du jour en dépend ») et c'est aussi la seule qui converge.
 */
export function assessMealPrecision(
  input: MealPrecisionInput,
): MealPrecisionAssessment {
  const empty = (reason: string): MealPrecisionAssessment => ({
    axes: [],
    primary: null,
    reason_code: reason,
    depends_on: [],
    slot_candidates: [],
  });

  const namedGroups = new Set(
    input.components.map((c) => c.food_group_ref).filter((g): g is string =>
      typeof g === "string" && g !== ""
    ),
  );
  const namedSubstances = new Set(
    input.components.map((c) => c.substance_ref).filter((s): s is string =>
      typeof s === "string" && s !== ""
    ),
  );
  const boundCommitments = new Set(
    input.components.map((c) => c.commitment_id).filter((id): id is string =>
      typeof id === "string" && id !== ""
    ),
  );
  const namedClasses = new Set(
    [...namedGroups].map(classOf).filter((c): c is string => c !== null),
  );

  const openLines = openLinesFor(input);
  if (openLines.length === 0) {
    // LE CAS MAJORITAIRE, et il est SILENCIEUX par construction: pas de plan,
    // journée déjà résolue, protocole sans ligne alimentaire. Il n'existe alors
    // aucune réponse capable de changer ce que le coach dit de ce repas.
    return empty("no_open_line_depends_on_it");
  }

  const axes: MealPrecisionAxis[] = [];
  const dependsOn = new Map<MealPrecisionAxis, string[]>();
  let slotCandidates: string[] = [];

  // --- composition ---------------------------------------------------------
  // Rien de nommé. Pas un groupe, pas une substance, pas une liaison de plan.
  // La déclaration dit qu'un repas a eu lieu et ne dit rien d'autre — donc
  // TOUTE ligne ouverte dépend de la réponse.
  //
  // La liaison explicite (`commitment_id`) suffit à désarmer: l'élève a déjà
  // désigné la ligne du plan que son repas honore, et lui demander ce qu'il y
  // avait dedans serait lui redemander ce qu'il vient de dire.
  if (
    namedGroups.size === 0 && namedSubstances.size === 0 &&
    boundCommitments.size === 0
  ) {
    axes.push("composition");
    dependsOn.set("composition", openLines.map((l) => l.commitment_id));
  }

  // --- accompaniment -------------------------------------------------------
  // Un aliment nommé, et une ligne `do` d'une AUTRE classe reste ouverte. C'est
  // le cas « du poulet » avec un protocole qui attend aussi des légumes.
  //
  // Sur la CLASSE et pas sur le slug: l'évaluateur résout les swaps par classe
  // (`matchFoodGroup`), donc « brocoli » couvre une ligne `non_starchy_veg`.
  // Comparer les slugs ferait demander un accompagnement déjà mangé.
  if (namedGroups.size > 0) {
    const uncovered = openLines.filter((line) => {
      if (line.polarity !== "do") return false;
      // LES LIGNES SENSIBLES À LA PRÉPARATION SONT EXCLUES DE CETTE POCHE, et
      // c'est un test qui l'a imposé: personne ne répond « de l'huile d'olive »
      // à « et avec quoi ? ». Une ligne `olive_oil` est un manque de
      // PRÉPARATION, pas d'accompagnement — la laisser ici volait sa mise à
      // l'axe qui sait la poser correctement.
      if (PREPARATION_SENSITIVE.has(line.food_group_ref ?? "")) return false;
      const lineClass = classOf(line.food_group_ref);
      // Une classe inconnue (slug de plan hors vocabulaire) n'est couverte par
      // rien: la ligne reste dans la poche, et le trou de données est visible
      // au lieu d'être avalé.
      return lineClass === null || !namedClasses.has(lineClass);
    });
    if (uncovered.length > 0) {
      axes.push("accompaniment");
      dependsOn.set("accompaniment", uncovered.map((l) => l.commitment_id));
    }
  }

  // --- preparation ---------------------------------------------------------
  // Une ligne porte sur la matière grasse, la friture ou la sauce; l'élève a
  // nommé quelque chose qui se cuisine; et il n'a rien dit de la préparation.
  //
  // Les lignes `avoid` comptent ICI et pas dans `accompaniment`: « évite les
  // fritures » ne se résout pas en demandant ce qu'il y avait à côté, elle se
  // résout en demandant comment c'était cuit.
  if (namedGroups.size > 0) {
    const namedPreparation = [...namedGroups].some((g) =>
      PREPARATION_SENSITIVE.has(g)
    );
    const cookable = [...namedClasses].some((c) => COOKABLE_CLASSES.has(c));
    const preparationLines = openLines.filter((line) =>
      PREPARATION_SENSITIVE.has(line.food_group_ref ?? "")
    );
    if (!namedPreparation && cookable && preparationLines.length > 0) {
      axes.push("preparation");
      dependsOn.set("preparation", preparationLines.map((l) => l.commitment_id));
    }
  }

  // --- slot ----------------------------------------------------------------
  // Aucun créneau nommé, et DEUX créneaux nominaux distincts peuvent recevoir
  // ce fait. Sans la réponse, l'évaluateur crédite les deux lignes avec un
  // repas mangé une fois (`slotScopeExcludes` n'exclut jamais un fait sans
  // créneau) — la même sur-comptabilisation que le doublon, par une autre
  // porte.
  //
  // UN seul créneau candidat ne justifie rien: le fait ira sur cette ligne-là,
  // nommée ou pas.
  if (input.slotKey === null && namedGroups.size > 0) {
    const reachable = openLines.filter((line) => {
      if (UNSPECIFIC_BUCKETS.has(line.bucket)) return false;
      if (line.slot_kind !== "nominal") return false;
      const slug = line.food_group_ref;
      if (slug === null) return false;
      const lineClass = classOf(slug);
      return lineClass !== null &&
        (namedClasses.has(lineClass) || namedGroups.has(slug));
    });
    const buckets = [...new Set(reachable.map((l) => l.bucket))];
    if (buckets.length >= 2) {
      axes.push("slot");
      dependsOn.set("slot", reachable.map((l) => l.commitment_id));
      slotCandidates = buckets;
    }
  }

  if (axes.length === 0) return empty("declaration_is_usable");

  // UNE SEULE SORTIE. Une seconde sortie vivait ici, dans la branche `slot`,
  // pour porter `slot_candidates` — et elle avait déjà divergé: elle oubliait le
  // dédoublonnage de `depends_on`. Une relecture à froid l'a trouvée. Deux
  // chemins de retour dans une fonction pure sont deux versions de la vérité.
  const ordered = orderAxes(axes);
  const primary = ordered[0];
  return {
    axes: ordered,
    primary,
    reason_code: "axis_missing",
    depends_on: [...new Set(dependsOn.get(primary) ?? [])],
    // Les créneaux ne NOMMENT la question que si c'est bien la question posée.
    // Les porter sur un autre axe donnerait au renderer une donnée qu'il
    // ignore, c'est-à-dire une occasion de s'en servir un jour par erreur.
    slot_candidates: primary === "slot" ? slotCandidates : [],
  };
}

/**
 * L'ORDRE DE PRIORITÉ, et il est un arbitrage produit, pas un détail.
 *
 * On pose la question dont la réponse débloque le PLUS de lignes:
 *   composition   — rien n'est su, toutes les lignes en dépendent;
 *   accompaniment — une ligne entière n'a aucune preuve;
 *   preparation   — une ligne a sa preuve, sa conformité reste ouverte;
 *   slot          — la preuve existe, seule son imputation flotte.
 */
function orderAxes(axes: readonly MealPrecisionAxis[]): MealPrecisionAxis[] {
  return MEAL_PRECISION_AXES.filter((axis) => axes.includes(axis));
}

// ---------------------------------------------------------------------------
// La question — gabarits FERMÉS
// ---------------------------------------------------------------------------

/**
 * Un gabarit par axe, PAR LANGUE. Constantes, jamais générées.
 *
 * Aucune ne demande une quantité, et aucune ne PEUT le faire: c'est du texte
 * figé, et `meal_precision_test.ts` le vérifie contre un lexique de quantité
 * FR+EN. C'est la seule forme de garantie qui survive à un modèle qui change —
 * et elle vaut donc pour le pack FR exactement comme pour le pack EN, sans
 * qu'on ait à réécrire la ceinture: le test mordait DÉJÀ sur les deux langues.
 */
const MEAL_PRECISION_QUESTION_PACKS: Readonly<
  Record<LocalePackKey, Readonly<Record<Exclude<MealPrecisionAxis, "slot">, string>>>
> = {
  en: {
    composition: "What was in it?",
    accompaniment: "And what did you have with it?",
    preparation: "Did you cook that with any oil or butter?",
  },
  fr: {
    composition: "Il y avait quoi dedans ?",
    accompaniment: "Et tu as mangé quoi avec ?",
    preparation: "Tu l'as cuisiné avec de l'huile ou du beurre ?",
  },
};

/** Les gabarits d'une langue. R7 par délégation: langue non livrée ⇒ throw. */
export function mealPrecisionQuestions(
  locale: string,
): Readonly<Record<Exclude<MealPrecisionAxis, "slot">, string>> {
  return MEAL_PRECISION_QUESTION_PACKS[localePackKey(locale)];
}

/**
 * La question de créneau NOMME ses candidats quand elle le peut. « Which meal
 * was that? » oblige l'élève à deviner ce qu'on attend; « lunch or dinner? »
 * se répond d'un mot.
 *
 * Au-delà de deux candidats on retombe sur la forme ouverte: une liste de
 * quatre créneaux dans une question est déjà un formulaire.
 */
export function renderMealPrecisionQuestion(
  axis: MealPrecisionAxis,
  slotCandidates: readonly string[],
  /**
   * REQUIS, et placé APRÈS `slotCandidates` qui a perdu son défaut pour ça.
   * Un `locale?: string` aurait compilé chez les trois appelants sans rien
   * changer — une question posée en anglais à un élève francophone, sans
   * qu'aucun test ne bouge.
   */
  locale: string,
): string {
  if (axis !== "slot") return mealPrecisionQuestions(locale)[axis];
  const pack = localePackFor(locale);
  const french = isFrenchLocale(locale);
  const labels = slotCandidates
    .map((slot) => {
      try {
        return labelFor("slots", slot, pack).toLowerCase();
      } catch {
        // R7 côté rendu: un slug hors vocabulaire ne fait pas taire la
        // question, il s'affiche tel quel et le trou reste visible.
        return slot;
      }
    })
    .filter((label) => label !== "");
  if (labels.length === 2) {
    return french
      ? `C'était quel repas, ${labels[0]} ou ${labels[1]} ?`
      : `Which meal was that, ${labels[0]} or ${labels[1]}?`;
  }
  return french ? "C'était quel repas ?" : "Which meal was that?";
}

// ---------------------------------------------------------------------------
// La mise à feu — le gate, séparé de l'évaluation
// ---------------------------------------------------------------------------

export type MealPrecisionGateReason =
  | "ask"
  | "no_axis"
  | "no_committed_fact"
  | "safety_band"
  | "future_intent"
  | "daily_cap_reached"
  | "flow_already_open";

export interface MealPrecisionGateResult {
  ask: boolean;
  axis: MealPrecisionAxis | null;
  question: string | null;
  reason_code: MealPrecisionGateReason;
}

/**
 * Deux questions par jour et par élève, TOUTES SOURCES CONFONDUES.
 *
 * Sans plafond, un élève bavard qui déclare cinq repas reçoit cinq questions et
 * cesse de déclarer — ce qui coûte plus cher que l'imprécision qu'on voulait
 * corriger. Le compteur est persistant et vérifiable en base
 * (`meal_precision_questions`), jamais en mémoire de tour: une mémoire de tour
 * remet le compteur à zéro à chaque message et ne plafonne rien.
 */
export const MEAL_PRECISION_DAILY_CAP = 2;

/**
 * Pose-t-on la question ?
 *
 * L'ORDRE DES REFUS EST LE CONTRAT, et il va du plus grave au plus bénin:
 *  1. safety — on ne demande pas à quelqu'un en détresse avec quoi il a mangé
 *     son poulet. Toute bande ≠ `none` ferme, comme pour les flows locaux;
 *  2. intention future — on ne demande pas de précisions sur un repas qui n'a
 *     pas eu lieu; la ceinture `isTrackProgressFutureIntent` a déjà empêché
 *     l'écriture, la question la réveillerait par la bande;
 *  3. aucun fait committé — une question de précision sans ligne à préciser
 *     ouvrirait un flow qui amendera le vide. C'est la règle
 *     `renderLogProtocolEventLoggedReply` appliquée à la question: pas de
 *     parole sans ligne;
 *  4. plafond du jour;
 *  5. flow déjà ouvert — on attend la réponse à la question précédente avant
 *     d'en poser une autre. Deux questions ouvertes en même temps sont
 *     l'interrogatoire, même étalé sur deux tours;
 *  6. pas d'axe.
 */
export function gateMealPrecisionQuestion(args: {
  assessment: MealPrecisionAssessment;
  /** R3 — REQUIS: le gate RÉDIGE la question, donc il en porte la langue. */
  locale: string;
  safetyBand: string | null | undefined;
  futureIntent: boolean;
  committedEventCount: number;
  questionsAskedToday: number;
  flowAlreadyOpen: boolean;
}): MealPrecisionGateResult {
  const deny = (reason: MealPrecisionGateReason): MealPrecisionGateResult => ({
    ask: false,
    axis: null,
    question: null,
    reason_code: reason,
  });

  const band = String(args.safetyBand ?? "none").trim().toLowerCase() || "none";
  if (band !== "none") return deny("safety_band");
  if (args.futureIntent) return deny("future_intent");
  if (args.committedEventCount <= 0) return deny("no_committed_fact");
  if (args.questionsAskedToday >= MEAL_PRECISION_DAILY_CAP) {
    return deny("daily_cap_reached");
  }
  if (args.flowAlreadyOpen) return deny("flow_already_open");
  const axis = args.assessment.primary;
  if (axis === null) return deny("no_axis");

  return {
    ask: true,
    axis,
    question: renderMealPrecisionQuestion(
      axis,
      args.assessment.slot_candidates,
      args.locale,
    ),
    reason_code: "ask",
  };
}
