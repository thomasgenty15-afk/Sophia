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

import {
  buildPortionBrief,
  type CookingShape,
  type PortionMember,
} from "./household_portions.ts";
import { buildEnvyBlock } from "./household_envies.ts";
import type { WindowPresence } from "./household_presence.ts";
import {
  buildMergeBlock,
  buildUnmergeBlock,
  type MergeMaterialDish,
  type PlanSpan,
} from "./household_merge.ts";

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
 *   v3  — 2026-08-12 (L4/D6): + le bloc de FUSION, entre la présence et
 *         l'envie. Il ne paraît QUE sur une opération de fusion; une
 *         composition ordinaire rend un prompt byte-identique à celui de v2, et
 *         un test le tient. Le bump vaut quand même: c'est la présence même du
 *         bloc qui distingue les deux populations dans la colonne, et une
 *         version qui ne bouge que « quand ça se voit » ne se relit pas.
 *   v4  — 2026-08-12 (L4, aval): le BUDGET DE PLATS d'une fusion compte
 *         désormais la bouche reprise, et le parseur accepte la préparation
 *         d'UNE portion que les barreaux ② et ③ demandent. AUCUN bloc n'a
 *         bougé — ni leur nombre, ni leur ordre, ni leur texte — mais la ligne
 *         « at most N dishes » servie à une fusion CHANGE DE NOMBRE, et le
 *         contrat de sortie change avec elle.
 *   v5  — 2026-08-12 (L5/D8): + le bloc de DÉFUSION, à la même place que celui
 *         de fusion. La règle appliquée est celle de v4 — « quelle population
 *         voit une consigne différente » — et la réponse est: une DÉFUSION, et
 *         elle seule. La lane individuelle, la composition de foyer ordinaire
 *         et la fusion rendent un prompt byte-identique à celui de v4, et trois
 *         tests le tiennent. Le bump vaut quand même, pour la raison de v3: la
 *         présence même d'un bloc distingue deux populations dans la colonne, et
 *         une version qui ne bouge que « quand ça se voit » ne se relit pas.
 *
 * ── POURQUOI v4 EST SUR CET AXE-CI ET PAS SUR LE TRONC ────────────────────
 * La question à laquelle une version répond est: « deux plans stampés pareil
 * peuvent-ils porter des consignes différentes ? » Après ce lot:
 *
 *   · lane INDIVIDUELLE — consigne byte-identique (`merge: null` rend
 *     exactement le plafond d'avant, et un test le tient). Bumper
 *     `MEAL_PROMPT_VERSION` re-stamperait toute cette population pour un
 *     changement qu'elle ne voit jamais, et invaliderait son cache pour rien.
 *   · foyer, composition ORDINAIRE — consigne byte-identique, même raison.
 *   · foyer, FUSION — consigne CHANGÉE. C'est la seule population concernée,
 *     et elle n'existe que sur cette lane.
 *
 * Le coût assumé est celui que L2 a déjà nommé: une composition ordinaire
 * change de numéro sans changer de consigne. C'est le moindre des deux — le
 * bump du tronc aurait fait la même chose à la lane individuelle ENTIÈRE.
 *
 * ⚠️ LA FORME DE CUISINE (`CookingShape`) N'EST PAS SUR CET AXE-CI. Elle change
 * la ligne « combien de plats » du BRIEF DE PORTIONS, qui vit dans
 * `household_portions.ts` — c'est-à-dire dans le TRONC — et c'est
 * `MEAL_PROMPT_VERSION` (v9) qui la suit. Les deux axes bougent donc ensemble
 * pour ce lot, chacun pour la moitié qui le concerne.
 *
 * ⚠️ L3 (D2/D7, 2026-08-12) N'A PAS BUMPÉ, ET C'EST UNE DÉCISION. La prise de
 * main ajoute une SECONDE raison pour qu'une bouche n'apparaisse pas dans la
 * liste d'ids — elle mange son propre plan — mais elle ne change AUCUN bloc:
 * ni leur nombre, ni leur ordre, ni leur texte. C'est le même cas que la
 * moitié « liste d'ids » de v2, que cette version couvre déjà. Ce que la
 * version doit suivre est la CONSIGNE; qui a été retiré de la table se relit,
 * lui, sur `generated_from.household.hand`, nommément et avec son motif.
 */
export const HOUSEHOLD_PROMPT_VERSION = "v5_unmerge";

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
  /**
   * QUI ON REPREND À CETTE TABLE (D6, 2026-08-12). `null` = composition
   * ordinaire, et le prompt est alors identique à celui de v2, au caractère
   * près.
   *
   * ⚠️ REQUIS ET NULLABLE, jamais optionnel — même raison que `presence` juste
   * au-dessus. Un champ facultatif n'aurait fait remonter aucun appelant au
   * compilateur, et la FORME DE CUISINE serait restée à `one_dish` en silence:
   * le brief de portions aurait interdit le second plat que le bloc de fusion
   * demande, dans le même prompt.
   */
  merge: HouseholdMergePrompt | null;
  /**
   * QUI ON SORT DE CETTE TABLE (D8, 2026-08-12). `null` = composition ordinaire
   * ou fusion, et le prompt est alors identique à celui de v4, au caractère
   * près.
   *
   * ⚠️ REQUIS ET NULLABLE, jamais optionnel — même raison que `merge` et
   * `presence`. Une défusion qui oublierait de le passer dépenserait un appel
   * modèle pour rendre EXACTEMENT le plan qu'elle voulait défaire: la personne
   * est bien retirée de la tablée (`resolveHandOff`), mais rien ne dirait au
   * modèle de rester au plus près du plan de base, et il rendrait une semaine
   * neuve — c'est-à-dire jetterait les courses que D8 existe pour préserver.
   *
   * ⚠️ `merge` ET `unmerge` NE SONT JAMAIS TOUS DEUX NON NULS: ce sont deux
   * opérations distinctes de `generate-household-meal-v1`, et une requête n'en
   * porte qu'une. Ce module ne l'impose pas — il n'a pas à connaître les
   * opérations de son appelant — mais il n'a pas non plus à arbitrer entre deux
   * consignes contradictoires, et c'est pour ça que ce n'est pas écrit comme un
   * champ à trois valeurs.
   */
  unmerge: HouseholdUnmergePrompt | null;
}

/** Ce que la fusion apporte au prompt. Décidé ailleurs — voir `household_merge.ts`. */
export interface HouseholdMergePrompt {
  displayName: string;
  window: PlanSpan;
  /** Le barreau de l'échelle, décidé par `mergeLadder`. Jamais deviné ici. */
  shape: CookingShape;
  dishes: readonly MergeMaterialDish[];
}

/** Ce que la défusion apporte au prompt (D8). Voir `buildUnmergeBlock`. */
export interface HouseholdUnmergePrompt {
  displayName: string;
  window: PlanSpan;
  /** Les plats du PLAN DE BASE — celui qu'on recompose sans cette personne. */
  dishes: readonly MergeMaterialDish[];
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
    // LA FORME DE CUISINE VIENT DE LA FUSION, ET D'ELLE SEULE. Sans fusion,
    // `one_dish` — le contrat historique du foyer, mot pour mot.
    buildPortionBrief(input.members, input.merge?.shape ?? "one_dish"),
    // JUSTE APRÈS LE BRIEF DE PORTIONS, et avant tout le reste: les deux
    // parlent de la même chose — qui mange quoi. Les séparer par l'envie de la
    // semaine ferait lire « pour combien de personnes » très loin de « pour
    // qui », et le modèle recompte alors la tablée sur la liste d'ids.
    input.presence.block,
    // APRÈS LA PRÉSENCE, AVANT L'ENVIE (D6). Le bloc dit qui revient à table:
    // c'est encore « qui mange quoi », donc il reste dans le groupe des trois
    // premiers. Le mettre après l'envie ferait lire « untel revient » comme une
    // conséquence de ce que le foyer a demandé cette semaine, ce qu'il n'est
    // pas. Les règles de maison, elles, restent en DERNIER.
    input.merge === null ? "" : buildMergeBlock(input.merge),
    // MÊME PLACE QUE LA FUSION, ET POUR LA MÊME RAISON (D8). « Untel ne mange
    // plus ici » est encore « qui mange quoi »: il reste dans le groupe des
    // blocs qui décrivent la tablée, avant l'envie de la semaine et loin devant
    // les règles de maison, qui restent EN DERNIER. Les deux ne paraissent
    // jamais ensemble — une requête porte une opération, pas deux.
    input.unmerge === null ? "" : buildUnmergeBlock(input.unmerge),
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
