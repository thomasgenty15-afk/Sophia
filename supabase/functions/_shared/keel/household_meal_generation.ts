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
 * Ce module AJOUTE quatre choses au prompt existant et VALIDE une chose de plus
 * dans la réponse. Rien d'autre.
 *
 * ── LES QUATRE AJOUTS AU PROMPT ──────────────────────────────────────────
 *   1. QUI mange — le brief de portions (`household_portions.ts`), qui porte
 *      les directions de service divergentes ET l'interdiction d'écrire une
 *      raison.
 *   2. QUI N'EST PAS LÀ, ET QUAND — le bloc de présence
 *      (`household_presence.ts`, D14). Il ne supprime JAMAIS un repas: il dit
 *      pour combien de personnes cuisiner ce jour-là. Le moment que personne ne
 *      partage, lui, sort par `awayDays` du moteur, comme sur la lane
 *      individuelle.
 *   3. CE QUE LE FOYER A DEMANDÉ — LA ligne d'envies de la semaine
 *      (`household_envies.ts`), écrite par le compte maître pour tout le
 *      monde. Elle est facultative: pas de ligne, pas de bloc.
 *   4. CE QUI N'ENTRE PAS DANS CETTE MAISON — les restrictions parentales,
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
import { buildEnvyBlock } from "./household_envies.ts";
import type { WindowPresence } from "./household_presence.ts";

/**
 * LA VERSION DE LA LANE FOYER — le second axe, et il manquait.
 *
 * `MEAL_PROMPT_VERSION` (`meal_generation.ts`) versionne ce que les DEUX lanes
 * partagent: le brief de portions, les propriétés de jour, les apports fixes.
 * Ce qui suit ne concerne QUE le foyer — la liste des ids, l'envie de la
 * semaine, les règles de maison, la présence.
 *
 * ⚠️ POURQUOI DEUX AXES ET PAS UN. Le 2026-08-12, L2 a greffé le bloc de
 * présence dans CE fichier. Bumper `MEAL_PROMPT_VERSION` aurait fait bouger la
 * version du plan INDIVIDUEL, dont pas une ligne n'avait changé: toute
 * comparaison avant/après sur cette lane-là serait devenue illisible, pour un
 * changement qui ne la touchait pas. La clé composée était déjà
 * `…+household`; elle porte maintenant son propre numéro.
 *
 * ⚠️ BUMPE ICI dès que tu changes un bloc de `buildHouseholdPromptBlocks`, y
 * compris leur ORDRE — l'ordre est une consigne, il est documenté comme telle
 * juste au-dessus de la fonction. Les lignes stampées `+household` tout court
 * sont d'avant cet axe: lis-les comme `v1`.
 *
 * L'historique:
 *   v1  — implicite, jusqu'au 2026-08-12: ids, portions, envie, restrictions
 *   v2  — 2026-08-12 (L2/D14): + le bloc de présence, entre portions et envie;
 *         et la liste d'ids ne porte plus les bouches absentes à CHAQUE moment
 *         de la fenêtre (elles n'ont pas d'assiette dans ce plan-là). Les deux
 *         changements n'ont jamais existé séparément.
 */
export const HOUSEHOLD_PROMPT_VERSION = "v2_presence";

export interface HouseholdRestriction {
  memberId: string;
  memberDisplayName: string;
  label: string;
}

export interface HouseholdPromptInput {
  members: readonly PortionMember[];
  /**
   * LA ligne d'envies de la semaine, ou `null`. UNE phrase pour tout le foyer,
   * pas une liste par personne (lot 5). L'appelant est responsable de son
   * ancrage: une ligne d'une semaine passée ne doit jamais arriver ici.
   */
  envyLine: string | null;
  restrictions: readonly HouseholdRestriction[];
  /**
   * QUI N'EST PAS LÀ, ET QUAND (D14, 2026-08-12).
   *
   * ⚠️ REQUIS, jamais optionnel — et ce n'est pas une préférence de style. Ce
   * dépôt a déjà payé « paramètre de garde optionnel = garde désarmée »: un
   * champ facultatif n'aurait fait remonter aucun appelant au compilateur, et
   * le foyer aurait continué de cuisiner pour des absents sans que rien
   * n'échoue. Le TYPE est `WindowPresence` et pas une chaîne, pour qu'un
   * appelant pressé ne puisse pas satisfaire la signature avec `""`.
   *
   * Un foyer où tout le monde est là rend un bloc vide, et le prompt est alors
   * identique à celui d'avant ce lot, au caractère près.
   */
  presence: WindowPresence;
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
    const entry = byMember.get(r.memberId) ??
      { name: r.memberDisplayName, labels: [] };
    entry.labels.push(r.label);
    byMember.set(r.memberId, entry);
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
  '    { "member_id": "<exact id given above>",',
  '      "portion_note": "how much of what goes on this plate",',
  '      "preparation_shares": [{ "preparation_id": "prep_x", "note": "..." }] }',
  "  ]",
  "One entry per person listed, using their EXACT member_id. Serving",
  "instructions only — never a reason, a goal, a calorie count, or anything",
  "about a person's body.",
] as const;

export interface HouseholdPromptBlocks {
  /** À concaténer au `userMessage` de `buildMealPrompt`. */
  userSuffix: string;
  /** À concaténer au `systemPrompt`: le schéma de sortie supplémentaire. */
  systemSuffix: string;
  /**
   * La ligne d'envies est-elle entrée dans le prompt ? Rendu pour la TRACE,
   * pas pour l'écran: « pourquoi ce plan ne ressemble-t-il pas à ce que j'ai
   * demandé ? » n'a pas de réponse trois jours plus tard si on ne sait pas si
   * la demande a seulement été lue.
   *
   * (Remplace `spoken`/`silent`, partis avec le conseil de famille: un
   * décompte de silencieux se lit « il en reste 3 à relancer ».)
   */
  envyLineUsed: boolean;
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
  const envyBlock = buildEnvyBlock(input.envyLine);

  const idLines = input.members.map((m) => `- ${m.displayName} = ${m.memberId}`);

  const parts = [
    "== THE HOUSEHOLD ==",
    "Exact ids to use in member_portions:",
    ...idLines,
    "",
    buildPortionBrief(input.members),
    // JUSTE APRÈS LE BRIEF DE PORTIONS, et avant tout le reste: les deux
    // parlent de la même chose — qui mange quoi. Les séparer par l'envie de la
    // semaine ferait lire « pour combien de personnes » très loin de « pour
    // qui », et le modèle recompte alors la tablée sur la liste d'ids.
    input.presence.block,
    envyBlock,
    restrictionBlock(input.restrictions),
  ].filter((p) => p && p.trim().length > 0);

  return {
    userSuffix: `\n\n${parts.join("\n\n")}`,
    systemSuffix: `\n\n${PORTION_SCHEMA_BLOCK.join("\n")}`,
    envyLineUsed: envyBlock.length > 0,
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
