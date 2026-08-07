/**
 * COMPOSER POUR UN FOYER — l'enveloppe autour du moteur existant. PUR.
 *
 * Autorité produit: docs/keel/PIVOT-FOYER.md §3, §8.
 *
 * ── CE QUE CE MODULE N'EST PAS ───────────────────────────────────────────
 * Ce n'est PAS un second générateur de repas. `meal_generation.ts` compose déjà
 * des préparations, des sessions de cuisine et une liste de courses par rayon,
 * avec son verrou de doctrine, ses contraintes de sécurité et son parseur — le
 * tout couvert. En écrire une variante « pour plusieurs personnes » produirait
 * deux moteurs qui divergeraient au premier ajustement, et l'un des deux
 * cesserait alors d'honorer la doctrine du coach sans que rien n'échoue.
 *
 * Ce module AJOUTE trois choses au prompt existant et VALIDE une chose de plus
 * dans la réponse. Rien d'autre.
 *
 * ── LES TROIS AJOUTS AU PROMPT ───────────────────────────────────────────
 *   1. QUI mange — le brief de portions (`household_portions.ts`), qui porte
 *      les directions de service divergentes ET l'interdiction d'écrire une
 *      raison.
 *   2. CE QUE LE FOYER A DEMANDÉ — les envies mises en commun
 *      (`household_envies.ts`), avec la règle du silence.
 *   3. CE QUI N'ENTRE PAS DANS CETTE MAISON — les restrictions parentales,
 *      énoncées comme un FAIT DOMESTIQUE et jamais comme un conseil.
 *
 * ── LE POINT LE PLUS FACILE À RATER (§8.5 règle 4) ───────────────────────
 * Une restriction parentale n'est PAS une raison nutritionnelle. Si le prompt
 * disait « évite le Nutella pour Léa », le modèle expliquerait spontanément
 * pourquoi le Nutella n'est pas idéal — c'est-à-dire ferait passer la décision
 * d'un parent pour une vérité de santé. Le jour où l'enfant s'en aperçoit,
 * plus rien de ce que dit l'agent n'a de poids.
 *
 * D'où `HOUSEHOLD_RULES_HEADER`, qui dit au modèle: ce sont des règles de
 * maison, tu ne les justifies pas, tu ne les commentes pas, tu composes avec.
 */

import { buildPortionBrief, type PortionMember } from "./household_portions.ts";
import { type EnvyMember, type EnvySubmission, mergeEnvies } from "./household_envies.ts";

export interface HouseholdRestriction {
  memberUserId: string;
  memberDisplayName: string;
  label: string;
}

export interface HouseholdPromptInput {
  members: readonly PortionMember[];
  envies: readonly EnvySubmission[];
  restrictions: readonly HouseholdRestriction[];
}

/**
 * L'en-tête des règles de maison. Trois phrases, et chacune ferme une porte
 * que le modèle prendrait sinon:
 *
 *   « house rules, not nutrition advice »  → il ne les justifie pas.
 *   « never explain or comment on them »   → il ne les commente pas non plus
 *                                            en creux (« on remplace X par Y,
 *                                            c'est plus sain » recrée la
 *                                            justification par la bande).
 *   « simply do not use them »             → il ne propose pas d'alternative
 *                                            « allégée », qui rendrait la
 *                                            règle visible comme un jugement.
 */
const HOUSEHOLD_RULES_HEADER = [
  "HOUSE RULES — foods this household does not serve to certain people.",
  "These are HOUSE RULES set by the person who runs this home. They are NOT",
  "nutrition advice and NOT your opinion. Never explain them, never comment on",
  "them, never justify them, and never offer a 'healthier' version. Simply do",
  "not put these foods on these people's plates.",
] as const;

function restrictionBlock(restrictions: readonly HouseholdRestriction[]): string {
  if (restrictions.length === 0) return "";
  const byMember = new Map<string, { name: string; labels: string[] }>();
  for (const r of restrictions) {
    const entry = byMember.get(r.memberUserId) ??
      { name: r.memberDisplayName, labels: [] };
    entry.labels.push(r.label);
    byMember.set(r.memberUserId, entry);
  }
  const lines = [...byMember.values()].map(
    (e) => `- ${e.name}: never serve ${e.labels.join(", ")}`,
  );
  return [...HOUSEHOLD_RULES_HEADER, "", ...lines].join("\n");
}

/**
 * LE SUPPLÉMENT DE SCHÉMA JSON.
 *
 * `member_portions` s'ajoute à la sortie attendue. Il est décrit ICI et pas
 * dans `MEAL_SYSTEM_PROMPT` parce qu'il n'a de sens que pour un foyer: le
 * demander à toutes les compositions ferait produire au modèle une consigne de
 * portion pour une personne seule, c'est-à-dire du bruit sur le chemin
 * majoritaire (l'entrée du produit est à 1, §5).
 */
const PORTION_SCHEMA_BLOCK = [
  "== ADDITIONAL OUTPUT FIELD (household) ==",
  "Add ONE more top-level key to the JSON you return:",
  '  "member_portions": [',
  '    { "user_id": "<exact id given above>",',
  '      "portion_note": "how much of what goes on this plate",',
  '      "preparation_shares": [{ "preparation_id": "prep_x", "note": "..." }] }',
  "  ]",
  "One entry per person listed, using their EXACT user_id. Serving",
  "instructions only — never a reason, a goal, a calorie count, or anything",
  "about a person's body.",
] as const;

export interface HouseholdPromptBlocks {
  /** À concaténer au `userMessage` de `buildMealPrompt`. */
  userSuffix: string;
  /** À concaténer au `systemPrompt`: le schéma de sortie supplémentaire. */
  systemSuffix: string;
  /** Qui a parlé, qui n'a rien dit. Remonté à l'écran, pas seulement au modèle. */
  spoken: string[];
  silent: string[];
}

/**
 * Rend les blocs à greffer sur le prompt existant.
 *
 * L'ORDRE DES BLOCS COMPTE. Les règles de maison passent EN DERNIER, après les
 * envies: ce sont elles qui doivent survivre à une envie contradictoire (« je
 * veux du Nutella » suivi de « on ne sert pas de Nutella à Léa »), et un modèle
 * lit la contrainte la plus proche de la fin comme la plus contraignante.
 */
export function buildHouseholdPromptBlocks(
  input: HouseholdPromptInput,
): HouseholdPromptBlocks {
  const envyMembers: EnvyMember[] = input.members.map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
  }));
  const merged = mergeEnvies(envyMembers, input.envies);

  const idLines = input.members.map((m) => `- ${m.displayName} = ${m.userId}`);

  const parts = [
    "== THE HOUSEHOLD ==",
    "Exact ids to use in member_portions:",
    ...idLines,
    "",
    buildPortionBrief(input.members),
    merged.promptBlock,
    restrictionBlock(input.restrictions),
  ].filter((p) => p && p.trim().length > 0);

  return {
    userSuffix: `\n\n${parts.join("\n\n")}`,
    systemSuffix: `\n\n${PORTION_SCHEMA_BLOCK.join("\n")}`,
    spoken: merged.spoken,
    silent: merged.silent,
  };
}

/**
 * Extraire `member_portions` d'une réponse de modèle déjà décodée.
 *
 * NE PARSE PAS LE JSON: `parseGeneratedMeal` le fait déjà, sur le même texte.
 * Le refaire ici produirait deux décodages du même corps, avec deux
 * tolérances aux blocs de code et aux virgules finales — et un jour, deux
 * verdicts différents sur la même réponse.
 *
 * REND `null` PLUTÔT QUE DE LEVER. Une composition dont les portions sont
 * illisibles reste une composition valable: `reconcilePortions` complètera
 * tout le monde en part standard et le tracera. Perdre la cuisson du samedi
 * soir pour un champ annexe serait la vraie perte (§8.4, « ne rend jamais
 * impossible »).
 */
export function extractMemberPortions(rawJsonText: string): unknown {
  const text = String(rawJsonText ?? "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    return parsed?.member_portions ?? null;
  } catch {
    return null;
  }
}
