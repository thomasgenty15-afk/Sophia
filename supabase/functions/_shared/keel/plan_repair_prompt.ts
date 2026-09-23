/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE MESSAGE SYSTÈME D'UNE RÉPARATION — UN SEUL SCHÉMA DE SORTIE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT QUE CE MODULE FERME (revue du 2026-09-12, P1 §3, reproduit dans
 * la source). L'appel de réparation transmettait
 * `built.systemPrompt + household.systemSuffix`, c'est-à-dire :
 *
 *   · `MEAL_SYSTEM_PROMPT`, qui se termine par `== OUTPUT JSON SCHEMA ==` avec
 *     `dishes`, `preparations`, `cooking_sessions` au premier niveau ;
 *   · la section « COVER THE WHOLE STRETCH », qui ordonne de couvrir CHAQUE
 *     jour dans cette réponse ;
 *   · les schémas de foyer (`member_portions`, `explanation`, `boxes`), qui
 *     décrivent encore d'autres clés de premier niveau.
 *
 * …pendant que le message utilisateur exigeait `{"repair":{…}}`. Deux schémas
 * contradictoires dans le même appel. Le transport ne les mélange pas (le
 * système part en `instructions`), donc ce n'est pas une vieille chaîne
 * inutilisée : le modèle peut rendre le plan que le système lui demande, et le
 * lecteur de patch n'en tire aucune unité.
 *
 * ⛔ ET CE N'EST PAS UNE DÉCOUPE PAR EXPRESSION RÉGULIÈRE. Le plan l'interdit
 * en toutes lettres. `MEAL_PROMPT_SECTIONS` rend les sections comme des OBJETS
 * NOMMÉS ; on en CHOISIT, par une liste fermée, et chaque section écartée porte
 * ici la raison de son absence. Un lot qui ajoute une section au prompt de
 * composition fait rougir `plan_repair_prompt_test.ts` tant que personne n'a
 * dit à quel camp elle appartient — c'est voulu : le silence est la façon dont
 * une consigne contradictoire revient.
 *
 * ⚠️ CE QUI N'EST PAS ICI. Le PÉRIMÈTRE (les `unit_id` et `session_id`
 * autorisés, la version à citer, les écarts mesurés, le plan projeté) vit dans
 * le message UTILISATEUR — il change à chaque appel. Ce fichier ne porte que
 * des règles de forme, donc un préfixe cacheable.
 *
 * PURE: no I/O, no clock, no randomness.
 */

import {
  MEAL_PROMPT_SECTIONS,
  type MealPromptSectionKey,
} from "./meal_generation.ts";
import { REPAIR_PATCH_SCHEMA_LINES } from "./plan_repair_patch.ts";

/**
 * LES SECTIONS DU PROMPT DE COMPOSITION QUI VALENT ENCORE POUR UNE RÉPARATION.
 *
 * ⛔ L'ORDRE EST CELUI DE LA COMPOSITION. Deux prompts qui disent les mêmes
 * règles dans deux ordres différents sont deux prompts, et c'est le second
 * qu'on relit le moins.
 */
export const REPAIR_PROMPT_KEPT_SECTIONS: readonly MealPromptSectionKey[] = [
  // La méthode du coach : ses interdits sont des limites dures, en réparation
  // comme en composition.
  "method_first",
  // Une part est l'assiette d'une personne — la structure culinaire.
  "portion_is_one_plate",
  // La séparation casserole / plat : un patch peut déclarer une casserole.
  "cook_vs_eat",
  // La fenêtre de conservation : elle décide `kept`, et un lot isolé la subit.
  "keeping_window",
  // Rien ne se mange avant d'être cuit : une casserole neuve a un jour.
  "cook_before_eat",
  // Les deux durées d'une casserole neuve.
  "minutes",
  // `same_day` sur chaque plat rendu.
  "same_day",
  // ⛔ AUCUN CHIFFRE NUTRITIONNEL. La ligne rouge du produit.
  "no_nutrition_numbers",
  // ⛔ LES CONVENTIONS CIQUAL : `amount`, `unit`, `state` cru/cuit. C'est ce qui
  // rend une recette réparée mesurable ; sans elle le plat repart `unmeasurable`.
  "quantity_twice",
  // La méthode nomme l'aliment sans répéter son poids.
  "method_names_food",
  // Ce qu'un plat ajoute le jour même est pesé ou compté.
  "dish_adds_weighed",
  // Les `components` et les `part` : les proportions qu'un redimensionnement
  // ne doit pas casser.
  "components",
  // `name` et `title`, les deux lignes de chaque plat rendu.
  "name_and_title",
];

/**
 * LES SECTIONS ÉCARTÉES, AVEC LA RAISON — ET LA RAISON EST LE CONTRÔLE.
 *
 * ⛔ « Elle n'est pas dans la liste » n'est pas une décision, c'est un oubli.
 * Chaque absence est écrite ici, et le test exige que les deux listes
 * recouvrent EXACTEMENT les sections du prompt de composition.
 */
export const REPAIR_PROMPT_DROPPED_SECTIONS: readonly {
  readonly key: MealPromptSectionKey;
  readonly why: string;
}[] = [
  {
    key: "opening",
    why:
      "elle ouvre sur « compose un repas » et annonce un objet JSON dont le " +
      "schéma est celui d'un plan ; l'ouverture de réparation la remplace",
  },
  {
    key: "stretch_starts_today",
    why:
      "une réparation ne choisit pas ses jours : ils viennent de la table des " +
      "unités, et le patch ne peut pas déplacer un repas",
  },
  {
    key: "cover_whole_stretch",
    why:
      "⛔ L'ORDRE CONTRADICTOIRE NOMMÉ PAR LE PLAN. « couvre CHAQUE jour dans " +
      "cette réponse » fait rendre un plan entier là où on demande un patch",
  },
  {
    key: "cooking_sessions",
    why:
      "la composition des sessions n'est pas patchable ; seul leur DÉROULÉ " +
      "l'est, et cette règle-là est écrite avec l'opération, dans le schéma",
  },
  {
    key: "session_time_ceiling",
    why: "un patch ne fixe ni le temps ni le contenu d'une session",
  },
  {
    key: "student_situation",
    why: "elle dit comment composer une semaine autour d'un agenda",
  },
  {
    key: "two_modes",
    why:
      "un patch n'écrit pas de liste de courses : l'app la reconstruit depuis " +
      "les ingrédients, et le schéma le dit",
  },
  {
    key: "output_schema",
    why:
      "⛔ LE SECOND SCHÉMA DE SORTIE. C'est le défaut entier : il décrit un " +
      "plan complet, et le patch a le sien",
  },
];

/** L'ouverture d'une réparation — elle dit ce qu'on répare, et ce qu'on garde. */
export const REPAIR_OPENING_LINES: readonly string[] = [
  "You are correcting a meal plan you already wrote, for one household.",
  "",
  "Output a single JSON object, nothing else. No prose outside the JSON, no",
  "markdown fences.",
  "",
  "⛔ YOU ARE NOT WRITING A PLAN. The plan exists, it is given to you below, and",
  "most of it is right. You return only the pieces the app names — it merges",
  "them back itself. Everything you do not return stays exactly as it is.",
  "",
  "⛔ AND YOU DO NOT COVER THE WEEK. Filling days nobody asked you for throws",
  "the whole answer away, and the household keeps the plan it has.",
];

/**
 * ⟳ 2026-09-23 — LE PLAT N'EST PAS TOUT LE REPAS (audit des dosages).
 *
 * ⛔ CE QU'IL FERME, MESURÉ. Sur cc012345, la réparation finale a réécrit 12
 * boîtes : sardines et 3 tranches de pain, 200 g de yaourt pour tout le monde.
 * Depuis le 2026-09-23 l'app sert elle-même un à-côté (entrée, fromage,
 * dessert, pain) au déjeuner et au dîner, compté dans l'énergie du repas. Une
 * réparation qui en ajoute un DANS le plat le compterait deux fois.
 *
 * ⚠️ SANS CONDITION, ET C'EST VOULU. La phrase reste vraie quand une personne a
 * refusé tous les à-côtés (« or none ») : son plat est dimensionné par l'app,
 * pas complété par le modèle. Le petit-déjeuner n'est pas visé : son yaourt et
 * son fruit font partie de la recette de référence.
 */
export const REPAIR_SIDE_COURSE_LINES: readonly string[] = [
  "== THE DISH IS NOT THE WHOLE MEAL ==",
  "At lunch and dinner the app serves each person's side course itself, beside",
  "the dish: a starter, a piece of cheese, a dessert or bread — or none, for",
  "someone who declined them. ⛔ Never add a dessert, a bread, a cheese course or",
  "a starter to a lunch or dinner dish or to its preparations: that energy is",
  "already counted beside the plate.",
];

export interface RepairSystemPrompt {
  readonly text: string;
  readonly counts: {
    readonly sections_kept: number;
    readonly sections_dropped: number;
    readonly safety_block: boolean;
    readonly house_rule_block: boolean;
    readonly chars: number;
  };
}

/**
 * LE MESSAGE SYSTÈME D'UNE RÉPARATION.
 *
 * ⛔ LES LIMITES DURES VOYAGENT AVEC LUI, ET C'EST LA MOITIÉ QUI PROTÈGE. Le
 * bloc des contraintes de sécurité et celui des règles de maison sont passés
 * PAR L'APPELANT, déjà rendus par les mêmes fonctions que la composition
 * (`safetyConstraintsPromptBlock`, `restrictionBlock`). Les réécrire ici serait
 * une seconde formulation de la même règle, à deux fichiers d'écart — et ce
 * dépôt a payé ce mode d'échec.
 *
 * ⚠️ `null` EST UNE RÉPONSE. Aucune contrainte déclarée rend `null`, pas une
 * chaîne vide : on n'écrit pas un titre au-dessus de rien.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function repairSystemPrompt(args: {
  /** Le bloc des allergies et contraintes médicales. `null` = aucune. */
  readonly safetyBlock: string | null;
  /** Le bloc des règles de maison et exclusions de la table. `null` = aucune. */
  readonly houseRuleBlock: string | null;
}): RepairSystemPrompt {
  const gardees = new Set(REPAIR_PROMPT_KEPT_SECTIONS);
  const sections = MEAL_PROMPT_SECTIONS
    .filter((s) => gardees.has(s.key))
    .map((s) => s.text);
  const durs = [args.safetyBlock, args.houseRuleBlock]
    .map((b) => (b === null ? "" : b.trim()))
    .filter((b) => b !== "");
  const text = [
    REPAIR_OPENING_LINES.join("\n"),
    ...sections,
    // ⟳ 2026-09-23 — APRÈS LES RÈGLES DE CUISINE, AVANT LES LIMITES DURES : elle
    // borne ce qu'une assiette de déjeuner ou de dîner peut contenir.
    REPAIR_SIDE_COURSE_LINES.join("\n"),
    // ⛔ LES LIMITES DURES APRÈS LA MÉTHODE, AVANT LE SCHÉMA. Elles bornent ce
    // qu'on a le droit d'écrire ; le schéma dit sous quelle forme l'écrire.
    ...durs,
    REPAIR_PATCH_SCHEMA_LINES.join("\n"),
  ].join("\n\n");
  return {
    text,
    counts: {
      sections_kept: sections.length,
      sections_dropped: REPAIR_PROMPT_DROPPED_SECTIONS.length,
      safety_block: args.safetyBlock !== null && args.safetyBlock.trim() !== "",
      house_rule_block: args.houseRuleBlock !== null &&
        args.houseRuleBlock.trim() !== "",
      chars: text.length,
    },
  };
}
