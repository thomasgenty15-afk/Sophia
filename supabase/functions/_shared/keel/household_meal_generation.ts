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
 *   5. CE QUE CHAQUE TITULAIRE A DIT DE SA BOUFFE — le bloc des voix
 *      (`household_voices.ts`, D4). Un plafond de tokens PAR MEMBRE et la garde
 *      de non-divulgation y vivent, et nulle part ailleurs.
 *
 * (Plus les deux blocs de GESTE — fusion et défusion — qui ne paraissent que sur
 * l'opération qui les demande. Voir `household_merge.ts`.)
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
  densityFloorsOf,
  // LE MÊME PRÉDICAT QUE `boxMemberIds` CÔTÉ PARSEUR — appelé, jamais recopié.
  weighedPortionMembers,
} from "./household_portions.ts";
import { buildEnvyBlock } from "./household_envies.ts";
// ── C1 · LA CONTAMINATION CROISÉE VIT DANS SON MODULE ────────────────────
// Comme `household_traditions.ts` et `fridge_window.ts`: la règle, son texte
// et son compteur au même endroit. L'écrire ici en ferait une phrase de plus
// dans un fichier qui en compte trois cents, sans compteur — et « une règle
// qui ne vit que dans un prompt régresse en réel sans que personne le voie ».
import { crossContactBlock } from "./cross_contact.ts";
// ③ — LE BLOC DES TRADITIONS VIT DANS SON MODULE, avec sa règle et son
// vérificateur. L'écrire ici en ferait un texte sans garde, et le verrou
// déterministe lirait une autre liste que celle que le prompt a dite.
import { traditionBlock } from "./household_traditions.ts";
import {
  buildMergeBlock,
  buildUnmergeBlock,
} from "./household_merge.ts";
import { buildHouseholdVoices } from "./household_voices.ts";
// ⟳ 2026-09-23 — LES À-CÔTÉS: le texte vit dans son module (`side_courses_prompt.ts`),
// les formes dans le socle (`side_courses_types.ts`). Rien n'est rédigé ici.
import {
  sideCoursesBlock,
  sideCoursesGiven,
} from "./side_courses_prompt.ts";

// ---------------------------------------------------------------------------
// ⟳ 2026-09-24 · LOT 2c DU DÉCOUPAGE — QUATRE BLOCS SONT SORTIS DE CE FICHIER
// ---------------------------------------------------------------------------
//
// Déplacés tels quels, sans changer une ligne de logique ni un octet de prompt :
//   · restrictions, `DECIDED BEFORE YOU`, planchers, recette standard
//                                          → `household_standard_recipe.ts`
//   · les types d'entrée et de sortie      → `household_prompt_types.ts`
//   · règles, schémas, plat dédié, cuisine, dehors, gamelle, notes
//                                          → `household_prompt_blocks.ts`
//   · la règle du « why » et son compteur  → `household_why_rule.ts`
// Restent ici: l'historique des versions, `HOUSEHOLD_PROMPT_VERSION`, la
// définition de `STANDARD_RECIPE_BLOCK`, `buildHouseholdPromptBlocks` et
// `extractMemberPortions`. Tout est ré-exporté ici : aucun appelant ne change
// d'import. Les tests qui lisent le TEXTE de ce fichier lisent la famille
// entière (`scripts/source-families.json`). Aucun des quatre modules n'importe
// ce fichier.
import {
  decidedBeforeYouBlock,
  LIGHT_DISH_MIN_KCAL_PER_100G,
  NORMAL_DISH_MIN_KCAL_PER_100G,
  standardRecipeBlock,
} from "./household_standard_recipe.ts";
import type {
  HouseholdPromptBlocks,
  HouseholdPromptInput,
} from "./household_prompt_types.ts";
import {
  boxSchemaBlock,
  dedicatedDishBlock,
  dishOwnerSchemaBlock,
  eatingOutBlock,
  EXPLANATION_SCHEMA_BLOCK,
  kitchenBlock,
  memberIdRosterLines,
  notesBlock,
  PORTION_SCHEMA_BLOCK,
  preferenceSplitBlock,
  restrictionBlock,
  workLunchBlock,
} from "./household_prompt_blocks.ts";
import { whyRuleBlock, whyRuleSchemaBlock } from "./household_why_rule.ts";

export {
  decidedBeforeYouBlock,
  LIGHT_DISH_MIN_KCAL_PER_100G,
  NORMAL_DISH_MIN_KCAL_PER_100G,
  standardRecipeBlock,
} from "./household_standard_recipe.ts";
export type {
  DecidedBeforeYou,
  HouseholdRestriction,
} from "./household_standard_recipe.ts";
export type {
  HouseholdMergePrompt,
  HouseholdPromptBlocks,
  HouseholdPromptInput,
  HouseholdUnmergePrompt,
} from "./household_prompt_types.ts";
export {
  dedicatedDishBlock,
  dishOwnerSchemaBlock,
  EXPLANATION_SCHEMA_BLOCK,
  kitchenBlock,
  memberIdRosterLines,
  notesBlock,
  PORTION_SCHEMA_BLOCK,
  restrictionBlock,
  workLunchBlock,
} from "./household_prompt_blocks.ts";
export type { PreferenceSplit } from "./household_prompt_blocks.ts";
export {
  countWhyRuleAttributions,
  whyRuleBlock,
  whyRuleSchemaBlock,
} from "./household_why_rule.ts";
export type { HouseholdRuleHolder, WhyRuleCounts } from "./household_why_rule.ts";

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
 *   v6  — 2026-08-12 (L6/D4): + le bloc DES VOIX, entre la fusion/défusion et
 *         l'envie. Il porte ce que CHAQUE titulaire a dit de sa bouffe, plafonné
 *         par membre et passé par la garde de non-divulgation.
 *         ⚠️ C'EST LE PREMIER BUMP QUI TOUCHE LA COMPOSITION ORDINAIRE, et c'est
 *         la règle de v4 appliquée telle quelle, pas une entorse: la population
 *         « composition de foyer » voit désormais une consigne différente dès
 *         qu'une bouche a confirmé quelque chose. Les mots du MAÎTRE changent de
 *         place en même temps — ils quittent `-- WHAT THEY HAVE TOLD ME --` du
 *         tronc pour ce bloc-ci, sous son prénom, parce que la garde et le
 *         plafond vivent ici et qu'un second chemin serait un chemin sans garde.
 *         Un foyer où PERSONNE n'a rien confirmé rend un prompt byte-identique à
 *         celui de v5, et un test le tient. La lane INDIVIDUELLE ne bouge pas
 *         d'un octet: elle passe toujours `foodPreferences` au tronc, elle n'a
 *         qu'un titulaire à entendre, et deux tests le tiennent — d'où
 *         `MEAL_PROMPT_VERSION` INCHANGÉE.
 *   v7  — 2026-08-12 (C1/O5): la consigne de FUSION ANCRE sur le plan du foyer.
 *         Elle montre désormais DEUX listes — le plan personnel repris, puis le
 *         plan du foyer avec l'instruction d'en rester au plus près, en dernier
 *         — là où elle n'en montrait qu'une. Mesuré avant le correctif: 15
 *         créneaux sur 15 d'une fusion réelle venaient du plan personnel, aucun
 *         titre du foyer n'a survécu, deux fusions sur deux. La population
 *         concernée est celle des FUSIONS, et elle seule: la lane individuelle,
 *         la composition ordinaire et la défusion rendent un prompt
 *         byte-identique à celui de v6, et des tests le tiennent.
 *
 * ── LE CORRECTIF DE LA GARDE DES VOIX N'A **PAS** BUMPÉ, ET C'EST UNE DÉCISION
 * 2026-08-12, quatre défauts de L6 corrigés (plafond qui ne s'arrêtait pas,
 * compteurs faux, trace qui nommait la forme de surface, garde asymétrique
 * FR/EN et aveugle au registre TCA). Ça CHANGE ce qui entre dans le prompt: une
 * ligne comme « Végétarien depuis 5 ans » y arrive maintenant, une ligne du
 * registre TCA n'y arrive plus. La version reste pourtant `v6_voices`.
 *
 * La règle est « quelle population voit une consigne DIFFÉRENTE », et la
 * réponse est: aucune. Aucun bloc n'a bougé — ni leur nombre, ni leur ordre, ni
 * leur texte: l'en-tête et la consigne de non-divulgation du bloc des voix sont
 * byte-identiques, le contrat de sortie ne change pas, et un foyer sans voix
 * rend toujours le prompt de v5. Ce qui change est le FILTRE appliqué à des
 * lignes que les membres écrivent eux-mêmes — c'est-à-dire exactement le cas
 * de L3 ci-dessous: une seconde raison pour qu'une ligne n'apparaisse pas, qui
 * ne se relit pas sur la version mais sur `generated_from.household.voices`,
 * nommément et — depuis ce correctif — par membre.
 *
 * Bumper aurait de plus fabriqué une frontière vide: `v6_voices` n'a stampé
 * AUCUNE ligne (`student_generated_meals`, mesuré: 0), rien n'est déployé, et
 * une version qui sépare zéro plan de zéro plan ne se relit pas non plus. Ce
 * correctif répare v6 avant qu'elle n'existe en base; il n'en écrit pas une
 * seconde.
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
/**
 * ── POURQUOI v8 (C2 ④, 2026-08-12) ────────────────────────────────────────
 *
 * ⚠️ L'ANCRE DE C1 N'EST PAS TOUCHÉE — ni son texte, ni son ordre, ni son
 * exclusion du budget de plats. Un autre lot s'occupe d'équilibrer l'ancre et
 * la matière, et rien ici ne le préempte: les assertions de source de C1
 * tiennent à l'identique.
 *
 * CE QUI CHANGE EST UNE TROISIÈME LISTE, dans le bloc de fusion ET dans celui
 * de défusion: **les cases que le plan montré ne remplit pas**. Mesuré deux
 * fois le 2026-08-12 — un plat rejeté pour cible chiffrée fait tomber les cinq
 * petits-déjeuners du foyer d'un coup, et la défusion RECOPIE ensuite la case
 * vide, parce que « reste au plus près du plan de base » est la consigne la
 * mieux honorée de tout ce chantier (14 titres sur 14).
 *
 * La règle de v4 s'applique telle quelle (« quelle POPULATION voit une consigne
 * différente »): **les fusions et les défusions dont le plan montré porte un
 * trou**. Toutes les autres — lane individuelle, composition de foyer
 * ordinaire, et toute fusion/défusion sur un plan complet — rendent un prompt
 * **byte-identique à v7** (`gaps: []` est l'identité), et deux tests le
 * tiennent.
 *
 * Bumper quand même est la moitié qui compte: L2 a mesuré ce que coûte un
 * prompt de foyer qui change sans que sa version bouge — deux plans stampés
 * pareil, portant des consignes différentes, et rien qui échoue puisqu'un
 * prompt n'a pas de compilateur.
 *
 * `MEAL_PROMPT_VERSION` ne bouge pas: rien de C2 n'entre dans le tronc.
 *
 * ── v9 (2026-08-12) — LE PLAT DÉDIÉ SE COMPTE, ET LA MATIÈRE S'OUVRE (C6) ──
 *
 * La règle de v4 s'applique telle quelle (« quelle POPULATION voit une consigne
 * différente »): **les fusions**, et elles seules. Trois choses changent dans le
 * texte servi, et chacune se mesure:
 *
 *   · la ligne de forme du brief de portions (`COOKING_SHAPE_LINES`, barreaux
 *     ② et ③) ne dit plus « give them a SECOND dish […] Never more than two »
 *     mais un plat À CHAQUE REPAS. Le barreau ① est byte-identique, donc toute
 *     composition ordinaire et toute défusion aussi;
 *   · `buildMergeBlock` écrit le NOMBRE de plats dédiés au lieu de « ADD ONE
 *     dish » (mesuré: un seul plat pour neuf créneaux, la casserole commune 8
 *     fois sur 9);
 *   · un paragraphe de plus, EN DERNIER, qui dit que l'ancre n'annule pas ces
 *     plats-là et qu'ils se construisent avec les aliments de la personne
 *     (mesuré: le seul plat « neuf » d'une fusion réelle était le
 *     petit-déjeuner du foyer en portion simple, zéro aliment de son plan dans
 *     les 37 lignes de courses).
 *
 * ⚠️ POURQUOI PAS `MEAL_PROMPT_VERSION`, alors que `COOKING_SHAPE_LINES` vit
 * dans le TRONC. Exactement le précédent écrit dans `meal_generation.ts` à
 * l'aval de L4: « la règle n'est pas où vit le code, c'est quelle population
 * voit une consigne différente ». Les deux lignes touchées ne sont servies que
 * sur un barreau ②/③, et un barreau ②/③ n'existe que sur une fusion. Bumper le
 * tronc re-stamperait toute la population individuelle pour un texte qu'elle ne
 * voit jamais.
 *
 * ── v10 (2026-08-14) — L'HABITUDE D'UNE BOUCHE, ET LE TEMPS QUI PLAFONNE (G) ──
 *
 * Ouvert après un plan réel qui a servi des ŒUFS BROUILLÉS SEPT MATINS
 * D'AFFILÉE à une femme qui mange une pomme. Le plan n'avait pas ignoré son
 * habitude: personne ne la lui avait demandée, et il n'existait aucun champ où
 * la ranger.
 *
 * La règle de v4 s'applique telle quelle (« quelle POPULATION voit une consigne
 * différente »), et elle décrit ici DEUX populations, toutes deux neuves:
 *
 *   · LES FOYERS OÙ AU MOINS UNE BOUCHE PORTE UNE HABITUDE. Leur brief gagne un
 *     fragment sur la ligne de la personne (`— has their own at breakfast: une
 *     pomme`) et une phrase de conséquence, dite UNE fois. La table qui les
 *     porte n'existait pas avant le 2026-08-14: aucun foyer d'hier n'en a.
 *   · LES FOYERS QUI ATTEIGNENT LE BARREAU ② SANS FUSION. Avant ce lot, une
 *     composition ordinaire était clouée à `one_dish` — `ladder` valait `null`
 *     hors fusion, et le brief interdisait purement et simplement un second
 *     plat. Elle peut désormais s'y lever, et seulement au-dessus de
 *     `SEPARATE_DISH_MIN_WEEKLY_MINUTES`.
 *
 * ⚠️ TOUT LE RESTE EST BYTE-IDENTIQUE À v9, ET DEUX TESTS LE TIENNENT: un foyer
 * sans habitude qui reste à `one_dish` rend le prompt de v9 au caractère près,
 * et une FUSION aussi — elle reprend UNE personne, passe donc `1` à
 * `cookingShapeLines`, et retombe sur le tableau du singulier. Le pluriel
 * n'existe que pour une population qui n'atteignait jamais ce barreau.
 *
 * Bumper quand même est la moitié qui compte: L2 a mesuré ce que coûte un
 * prompt de foyer qui change sans que sa version bouge — deux plans stampés
 * pareil, portant des consignes différentes, et rien qui échoue.
 *
 * `MEAL_PROMPT_VERSION` ne bouge pas: rien de G n'entre dans le tronc.
 *
 * ── v11 · LE RÉGIME ENTRE, ET LA POPULATION EST NEUVE ─────────────────────
 * La règle de v4 s'applique encore (« quelle POPULATION voit une consigne
 * différente »), et elle décrit ici DEUX populations, toutes deux neuves:
 *
 *   · LES FOYERS OÙ AU MOINS UNE BOUCHE PORTE UN RÉGIME. Leur prompt gagne le
 *     bloc `WHAT THE SHARED BASE MUST RESPECT`. Aucun foyer ne l'avait avant le
 *     2026-08-14, pour une raison simple et mesurée: ce fichier ne portait
 *     AUCUNE occurrence du mot « diet », et le régime d'un maître végane
 *     n'atteignait jamais la lane du foyer.
 *   · LES FOYERS QUI ATTEIGNENT LE BARREAU ② PAR LE RÉGIME. `dietDiverges` est
 *     une seconde source de divergence, à côté de `servingConflicts`; elle ne
 *     se lève que là où descendre la table au plus strict retire à quelqu'un sa
 *     direction de service, et seulement au-dessus du seuil de temps.
 *
 * ⚠️ TOUT LE RESTE EST BYTE-IDENTIQUE À v10, ET UN TEST LE TIENT: un foyer où
 * personne n'a déclaré de régime rend `dietBlock: ""`, le bloc tombe du
 * `filter`, et le prompt est celui de v10 au caractère près.
 *
 * `MEAL_PROMPT_VERSION` ne bouge pas: rien de ce lot n'entre dans le tronc.
 *
 * ── v12 · LE PLAT DÉDIÉ DIT À QUI IL EST (LOT C, 2026-08-15) ──────────────
 * La règle de v4 vaut encore — « quelle POPULATION voit une consigne
 * différente » — et elle décrit ici UNE population, étroite et nommée: LES
 * FOYERS OÙ AU MOINS UNE BOUCHE REÇOIT UN PLAT À ELLE. Eux seuls gagnent le
 * bloc `WHOSE DISH IS IT`, avec le champ `for_member_id`.
 *
 * ⚠️ TOUT LE RESTE EST BYTE-IDENTIQUE À v11, ET UN TEST LE TIENT: un foyer au
 * barreau ① rend `dishBearers: []`, le bloc n'est pas assemblé, et le prompt est
 * celui de v11 au caractère près. C'est aussi ce qui empêche d'apprendre à un
 * modèle, dans un prompt qui dit « Do NOT propose separate dishes », qu'un plat
 * peut appartenir à quelqu'un.
 *
 * `MEAL_PROMPT_VERSION` ne bouge pas non plus: le champ `for_member_id` est lu
 * par le parseur partagé, mais il n'est DEMANDÉ que par ce suffixe-ci, et la
 * lane individuelle passe `merge: null` — donc rien n'y est attribuable.
 *
 * ── v13 · LE PLAT DÉDIÉ EST COMMANDÉ, PLUS SEULEMENT PERMIS (LOT 3C) ──────
 * Ouvert sur une mesure, pas sur une intuition. Sur les DOUZE générations de
 * foyer servies en v12 (archive `llm_raw_response_events`, 2026-08-15 →
 * 2026-08-17), le modèle a rendu 291 plats et **onze runs sur douze n'ont
 * composé qu'UN SEUL plat par repas**: la divergence de la bouche marquée
 * partait entièrement dans `member_portions`, jamais dans une seconde
 * assiette. Le douzième a bien écrit `for_member_id` — sur la bouche qui porte
 * une HABITUDE, pas sur celle à qui la consigne promet un plat — et le parseur
 * l'a refusé, à juste titre. Le compteur `dish_owners` lisait `attributed: 0`
 * dans les deux cas.
 *
 * ⛔ CE QUI MANQUAIT N'ÉTAIT PAS LE CHAMP, C'ÉTAIT L'ORDRE. v12 écrivait « may
 * carry one more key » — une PERMISSION — dans le prompt SYSTÈME, pendant que
 * la phrase qui PROMET le plat (`cookingShapeLines`, barreau ②/③) vivait dans
 * le message UTILISATEUR, sous un en-tête qui dit « one cooking session,
 * portions that differ » et au-dessus d'une consigne qui réclame une
 * instruction de service par personne. Les deux moitiés ne se rejoignaient
 * nulle part: rien ne disait au modèle que le plat promis par la ligne de
 * forme EST celui qui doit porter la clé.
 *
 * ⚠️ ET LA LIGNE DE FORME AFFIRME UNE CHOSE QUE LE BRIEF DÉMENT. Elle dit
 * « ONE person below cannot be served from it (**their line says so**) », et la
 * ligne visée dit `- Théo: larger protein and starch share, same vegetables` —
 * c'est-à-dire une instruction de service PRISE DANS LA CASSEROLE COMMUNE.
 * Aucune ligne ne dit que quiconque ne peut pas en être servi. Le modèle lit
 * les lignes, n'y trouve pas le marqueur annoncé, et sert tout le monde du
 * même plat.
 *
 * CE QUE v13 CHANGE, ET RIEN D'AUTRE:
 *   · un bloc `A DISH OF THEIR OWN` dans le message UTILISATEUR, JUSTE APRÈS le
 *     brief de portions — là où la promesse est faite. Il nomme les bouches
 *     avec leur id exact, commande DEUX plats à leur repas, et dit ce que le
 *     modèle a réellement fait à la place: une ligne de `member_portions` n'est
 *     pas un plat.
 *   · `WHOSE DISH IS IT` (système) passe de la permission à l'obligation et
 *     renvoie au bloc ci-dessus.
 *
 * ⚠️ LE PATRON EST CELUI DU CHAMP QUI MARCHE. `member_portions` est déclaré
 * dans le prompt SYSTÈME (`PORTION_SCHEMA_BLOCK`) **et** commandé dans le
 * message UTILISATEUR (`buildPortionBrief`), avec les ids exacts — et il est
 * rempli sur 100 % des runs mesurés. `for_member_id` n'avait que la moitié
 * système. On lui donne la seconde moitié, au même endroit, dans la même forme.
 *
 * ⚠️ TOUT LE RESTE EST BYTE-IDENTIQUE À v12, ET UN TEST LE TIENT: un foyer sans
 * porteur rend `dishBearers: []`, aucun des deux blocs n'est assemblé, et le
 * prompt est celui de v12 au caractère près. La population concernée est
 * exactement celle de v12 — les foyers où au moins une bouche reçoit un plat à
 * elle — et elle seule.
 *
 * `MEAL_PROMPT_VERSION` ne bouge pas: aucun octet du tronc ne change. Le
 * compteur `dish_owner_counts` posé par le même lot dans `meal_generation.ts`
 * est une MESURE, pas une consigne — il ne se lit sur aucun prompt.
 */
// ── v14 (2026-08-17) — LE PROTOCOLE DES BOÎTES (LOT 4 / P4) ────────────────
//
// La décision produit du 2026-08-17 rend les parts PRÉCISES, et décide comment
// éviter que quiconque pèse à chaque repas: TOUT SE PÈSE UNE FOIS, à la session
// de cuisine, dans des boîtes nommées. L'enveloppe foyer gagne donc deux
// moitiés — le SCHÉMA (`boxSchemaBlock`, prompt système) et la CONSIGNE
// (`boxingOrderLines`, à l'intérieur du brief de portions, message
// utilisateur) — plus la phrase des ids, qui nomme désormais ses deux
// destinations.
//
// ⚠️ POPULATION EXACTE: les foyers d'AU MOINS DEUX BOUCHES. Une boîte par
// personne n'a pas de sujet à une seule, et les deux blocs sont muets sous ce
// seuil — un foyer d'une bouche rend un prompt byte-identique à v13, et un test
// le tient dans les deux sens (le brief ET le suffixe système).
//
// ⚠️ `MEAL_PROMPT_VERSION` BOUGE AUSSI, ET CE N'EST PAS UN DOUBLON. Le tronc
// porte l'autre moitié de P4 — les quantités du jour, pesées ou dénombrées —
// que les QUATRE populations voient, plus les deux jetons d'identifiant de
// boîte dans le bloc de langue. Deux changements, deux portées, deux axes:
// c'est très exactement la règle « quelle population voit une consigne
// différente », appliquée deux fois dans le même lot.
// ── v15 (2026-08-17) — LE GRAMME DANS LA CONSIGNE, ET UNE SEULE BOÎTE PAR
//    BOUCHE (LOT 4C / P4, second passage) ─────────────────────────────────────
//
// v14 a fait déclarer les boîtes — 100 % des préparations, 45 boîtes, zéro
// refusée sur quatre runs réels. Deux choses qu'elle n'avait pas dites ont été
// mesurées dans la foulée, et elles vivent toutes les deux dans le brief de
// portions (message utilisateur):
//
//   ② LA PART DITE À LA PERSONNE EST RESTÉE FLOUE. 93 notes réelles, ZÉRO
//      gramme — « One standard table portion. », « Balanced share of the shared
//      dish. » Le protocole marchait à la SESSION, pas à la bouche. Quatre
//      lignes s'ajoutent COLLÉES à la phrase qui promet la consigne, avec le
//      nombre attendu et les tournures refusées nommées.
//   ③ `grams` ÉTAIT AMBIGU, ET « UNE SEULE BOÎTE PAR BOUCHE » N'ÉTAIT NULLE
//      PART. Treize bouches se sont retrouvées dans deux boîtes de la même
//      casserole, trois dans aucune. Deux lignes deviennent quatre, EN
//      REMPLACEMENT.
//
// ⚠️ LA POPULATION S'ÉLARGIT PAR RAPPORT À v14, et il faut le lire: le bloc ③
// reste muet à une bouche (il parle de boîtes), mais le bloc ② est dans le
// brief COMMUN — un foyer d'UNE bouche voit donc désormais une consigne
// différente. C'est voulu: « des quantités précises pour chaque personne » ne
// s'arrête pas à deux habitants. La population non concernée est la lane
// INDIVIDUELLE, qui ne monte jamais l'enveloppe foyer, et c'est elle que le
// test byte-identique tient.
//
// ⚠️ `MEAL_PROMPT_VERSION` NE BOUGE PAS: aucun octet du tronc ne change dans ce
// passage. Les trois compteurs ajoutés à `box_counts` (`capped`, `mouth_slots`,
// `mouths_unboxed`/`mouths_double`) sont des MESURES, pas des consignes — ils ne
// se lisent sur aucun prompt.
// ── v16 (2026-08-18) — LA CUISINE, ET LE MIDI QUI SORT DU PLAN (L7 ① ET ②) ──
//
// Deux blocs, un seul bump, et la règle de v4 s'applique telle quelle
// (« quelle POPULATION voit une consigne différente »). Elle décrit ici deux
// populations, toutes deux neuves et toutes deux VIDES à la minute où ce lot
// est écrit — ce qui est le point: l'écran qui les remplira (L5/L6) arrivera
// sur un moteur qui sait déjà les lire, au lieu d'une colonne sans lecteur.
//
//   ① LES FOYERS QUI ONT DÉCLARÉ CE QU'ILS N'ONT PAS. Bloc `THIS KITCHEN`,
//      dans le groupe des verrous, après l'envie de la semaine. Source:
//      `student_goals.practical_constraints.kitchen_equipment` (L2, 2026-08-18),
//      lue par `missingKitchenTools()` — le SEUL chemin sans direction
//      dangereuse (voir `kitchenBlock`). Mesuré le même jour: **0 ligne sur
//      175** porte la clé. Un foyer qui n'a jamais vu la question rend donc un
//      prompt byte-identique à v15, et c'est 100 % du parc.
//   ② LES FOYERS OÙ QUELQU'UN MANGE DEHORS. Bloc
//      `A MEAL EATEN OUT IS NOT AN ABSENCE`, collé au bloc de présence.
//      Source: `resolveWindowPresence(...).eatingOut` (L3, 2026-08-18), qui
//      porte déjà l'arbitrage entre la déclaration de la personne et la marque
//      du maître. Personne dehors ⇒ `eatingOut: []` ⇒ prompt de v15 au
//      caractère près.
//
// ⚠️ AUCUN CHAMP DE SORTIE N'EST DEMANDÉ PAR CES DEUX BLOCS, et c'est pour ça
// que le `systemSuffix` ne bouge pas d'un octet. Ce sont des CONTRAINTES, pas
// des clés: rien à déclarer, donc rien à valider, donc pas de compteur à trois
// nombres — ce qui s'archive à leur place est ce que le bloc a réellement
// INTERDIT et NOMMÉ (`kitchenMissing`, `eatingOut`), rendu par la même
// expression que le texte. Un « compteur de respect » exigerait de lire les
// titres et les méthodes pour décider si un plat passe au four: c'est un
// matcher, et ce dépôt en a mesuré 12 faux positifs sur 12.
//
// ⚠️ `MEAL_PROMPT_VERSION` BOUGE AUSSI, ET CE N'EST PAS UN DOUBLON. Le tronc
// porte la troisième moitié du même lot — le NOM d'un plat, à côté de son
// titre — que les QUATRE populations voient, plus sa ligne dans le bloc de
// langue. Deux changements, deux portées, deux axes: c'est la règle « quelle
// population voit une consigne différente », appliquée deux fois dans le même
// lot. Précédent exact: v14 (2026-08-17).
// ── v17 (2026-08-18) — CE QUE CHAQUE BOUCHE MANGE DÉJÀ (D1b) ───────────────
//
// AUCUN BLOC DE CE FICHIER NE BOUGE. Ce qui change est un PARAMÈTRE DU TRONC
// que cette lane passait vide en dur: `fixedIntakes`. Le bloc
// `WHAT THEY ALREADY HAVE` existe dans le tronc depuis FF-051 et la lane
// individuelle le sert déjà; ici il était structurellement impossible à
// remplir, parce que trois `fixedIntakes: []` étaient écrits à la main.
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE: les foyers où AU MOINS UNE
// bouche attablée A UN COMPTE **et** a déclaré un apport fixe. Partout
// ailleurs, `loadHouseholdFixedIntakes` rend `[]` — la valeur exacte d'avant —
// et le prompt est byte-identique à v16, au caractère près. Un test le tient
// (`household_fixed_intakes_test.ts`), et il le tient sur la sortie du
// CHARGEUR, pas sur une constante: c'est un chargeur qui rendrait une ligne
// fantôme qui casserait l'identité, pas `buildMealPrompt`.
//
// ⚠️ `MEAL_PROMPT_VERSION` NE BOUGE PAS: pas un octet du tronc ne change. Ce
// serait la faute exacte que la note de v2 décrit — faire bouger la version du
// plan INDIVIDUEL pour un lot qui ne le touche pas, et rendre illisible toute
// comparaison avant/après sur cette lane-là.
//
// ⚠️ ET LE BUMP VAUT MÊME SI LE PARC EST VIDE À CETTE MINUTE, pour la raison
// de v3: c'est la PRÉSENCE du bloc qui distingue les deux populations dans la
// colonne, et une version qui ne bouge que « quand ça se voit » ne se relit
// pas trois jours plus tard.
// ── v18 (2026-08-19) — L'ENVIE TAPÉE AU MOMENT DE COMPOSER (LOT D) ─────────
//
// AUCUN BLOC DE CE FICHIER NE BOUGE, et c'est le MÊME cas que v17 juste
// au-dessus: ce qui change est un PARAMÈTRE DU TRONC que cette lane recevait
// vide, non pas parce qu'un `[]` était écrit à la main mais parce que RIEN NE
// L'ENVOYAIT. La ligne « what they feel like eating THIS TIME » existe dans le
// tronc depuis toujours et la lane individuelle la sert déjà; côté foyer,
// `body.preferences` valait `null` sur tous les appels — le champ de l'écran
// (« ce dont ils ont envie pour ces repas », rendu SANS garde de lane) ne
// traversait ni le submit, ni la signature du client, ni le corps de la requête.
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE: les compositions de foyer où
// quelqu'un a TAPÉ quelque chose dans ce champ. Partout ailleurs `preferences`
// vaut `null`, `buildMealPrompt` n'écrit alors AUCUNE ligne, et le prompt est
// byte-identique à v17 au caractère près.
//
// ⚠️ LA LIGNE PORTE DÉJÀ SON RANG, et c'est ce qui rend ce branchement sûr.
// L'axe ② de `meal_generation.ts` (2026-08-18) lui a donné « never at the cost
// of a hard constraint, of their diet, or of this coach's method » après avoir
// mesuré, sur le run `2a000000-3100-…`, qu'une envie nue qui nomme l'allergène
// MÉDICAL de la personne ressort 21 fois dans la sortie. Brancher ce champ
// AVANT ce correctif aurait armé cette gueule-là sur une table entière.
//
// ⚠️ `MEAL_PROMPT_VERSION` NE BOUGE PAS: pas un octet du tronc ne change, et la
// lane individuelle envoyait déjà ce champ. Le bumper re-stamperait toute une
// population qui ne voit strictement rien de neuf — la faute que la note de v2
// décrit.
// ── v19 (2026-08-19) — LE « why » NE PORTE PLUS LA RÈGLE DE QUELQU'UN (LOT C ②)
//
// DEUX BLOCS NEUFS, et ils ne paraissent QUE si au moins une bouche de la table
// porte une règle (contrainte dure, régime déclaré, règle de maison). La moitié
// consigne rejoint le groupe des verrous dans le message utilisateur; la moitié
// schéma déclare `why_rule_of` et sa liste fermée. Sur un foyer où personne n'a
// rien déclaré — et sur toute la lane individuelle, qui ne monte jamais cette
// enveloppe — `ruleHolders` vaut `[]`, les deux blocs tombent du `filter`, et le
// prompt est byte-identique à v18 au caractère près. Un test le tient par
// égalité de chaîne.
//
// LA POPULATION CONCERNÉE: les foyers où quelqu'un a déclaré une allergie, un
// régime ou une règle de maison. Mesuré sur le foyer de l'étape ⑤ — TROIS
// `dishes[].why` sur huit attribuaient l'évitement du gluten à une personne qui
// n'a aucune contrainte, alors que le prompt attribue correctement.
//
// ⚠️ `MEAL_PROMPT_VERSION` NE BOUGE PAS: pas un octet du tronc ne change. Le
// champ `why` est défini dans le schéma du tronc et n'y gagne pas une ligne —
// tout ce qui est neuf vit dans l'enveloppe foyer, qui est aussi la seule
// population où la question se pose (un plan individuel n'a qu'une bouche, donc
// aucune règle à attribuer de travers).
//
// ⚠️ LE MOT « json » RESTE PRÉSENT DANS LES DEUX MOITIÉS — vérifié après ce lot.
// `gemini.ts:549-567` réécrit le prompt APRÈS la capture quand il manque, et
// l'instrument se met alors à mentir en silence. Aucun de ces deux blocs ne
// retire quoi que ce soit; ils s'ajoutent.
// ── v20 (2026-08-19) — LA BOÎTE APPARTIENT AU REPAS ───────────────────────
//
// LES DEUX MOITIÉS DU PROTOCOLE CHANGENT ENSEMBLE, et c'est la seule façon de le
// faire: le SCHÉMA (`boxSchemaBlock`, prompt système) déplace `boxes` de la
// préparation vers le plat et lui donne une part par nom; la CONSIGNE
// (`boxingOrderLines`, dans le brief de portions) cesse de compter des bouches
// par casserole et compte des REPAS. Une moitié sans l'autre est un champ
// réclamé nulle part ou un ordre sans clé où le ranger — mesuré à 0 % les deux
// fois (`promise-and-schema-key-must-be-adjacent`).
//
// ⚠️ POPULATION EXACTE, INCHANGÉE DEPUIS v14: les foyers d'AU MOINS DEUX BOUCHES.
// Les deux blocs restent muets sous ce seuil, et un foyer d'une bouche voit le
// prompt de v19 au caractère près — sauf la ligne de jetons du tronc, qui bouge
// pour tout le monde (`MEAL_PROMPT_VERSION` v17).
//
// ⛔ CE QUE CE LOT NE FAIT PAS: revenir sur « on pèse une fois ». La balance ne
// ressort QUE sur une boîte à PLUSIEURS noms, et sous forme d'étiquette qui
// porte déjà le partage. Un seul nom sur le couvercle ⇒ aucune pesée, jamais.
// ── v21 (2026-08-20) — UN CONTENANT PAR GROUPE DE MANGEURS ───────────────
//
// LES DEUX MOITIÉS CHANGENT ENSEMBLE, une fois de plus et pour la même raison:
// le SCHÉMA (`boxSchemaBlock`) passe `box` au pluriel — `boxes[]`, chacune avec
// son groupe (`member_ids[]`) et son contenu (`items[]`) — et la CONSIGNE
// (`boxingOrderLines`) cesse d'ordonner « le même chiffre ordinaire pour tout le
// monde » pour distinguer les DEUX GRAMMES: prescription sur un couvercle à un
// nom, quantité de bac sur un couvercle à plusieurs.
//
// ⚠️ LA POPULATION S'ÉLARGIT, ET C'EST LE LOT. Sous v20, `boxSchemaBlock` se
// taisait dès que personne n'avait d'objectif — un foyer de quatre qui se
// maintient recevait ZÉRO contenant, et « plat commun » ne disait ni combien de
// bacs remplir dimanche ni lequel ouvrir jeudi. Le bloc sert désormais à tout
// foyer d'au moins deux bouches, avec ou sans objectif. Un foyer d'UNE bouche
// sans objectif voit toujours le prompt de v19 au caractère près.
//
// ⛔ CE QUE CE LOT NE FAIT PAS: remettre une part par personne dans un bac
// partagé. C'est exactement ce qui a tué v2 — la balance de retour au service —
// et le bloc l'interdit maintenant en toutes lettres.
// ── v22 (2026-08-23, lot `D3′-c`) — L'ARBITRAGE EN QUEUE, ET SON MILLÉSIME ─
//
// ⛔ CE BUMP EST EN RETARD D'UN JOUR, ET C'EST TOUT LE SUJET. Le prompt foyer a
// changé le 2026-08-22 à 18:51 (`D3′`, commit `741c2021`): le bloc d'arbitrage
// est passé en QUEUE du message utilisateur, et son rang 1 a cessé de dire
// « at the VERY TOP » pour NOMMER ses trois blocs de verrou. Ce jeton, lui,
// n'a pas bougé — donc rien ne distinguait en base un prompt d'avant d'un
// prompt d'après.
//
// ⚠️ CE QUE ÇA A COÛTÉ: le 2026-08-23, « pourquoi la variante FOYER ne sort-elle
// jamais ? » a demandé une heure et une entrée de registre fausse. La réponse
// se lisait en une requête si la ligne avait porté son millésime — les 12
// lignes `…+household.v21_one_box_per_group` s'arrêtent à 14:51:38, QUATRE
// HEURES avant la livraison. Sans jeton, « le prompt neuf ne mord pas » et
// « le prompt neuf n'a jamais tourné » rendent le même zéro.
//
// ✅ ET LE BUMP EST ENCORE SANS PERTE — il ne l'aurait plus été après un seul
// run: aucune ligne `v21` n'a été écrite après 18:51:33, donc la population
// `v21` est ENTIÈREMENT pré-`D3′` et le reste.
//
// ⛔ CE QUI L'ARME DÉSORMAIS: `precedence_binding.ts` inscrit l'empreinte du
// texte servi par CHAQUE millésime, et `precedence_binding_test.ts` rougit si
// le texte bouge sous un jeton immobile. Changer le bloc d'arbitrage foyer
// sans toucher cette ligne fait échouer le gate.
//
// ⚠️ `MEAL_PROMPT_VERSION` NE BOUGE PAS, et c'est mesuré, pas supposé: le texte
// de la lane SOLO a survécu octet pour octet au déménagement de `D3′` vers
// `precedence_tail.ts` — 243 `user_message` archivés sur 243 le confirment.
// ⟳ v23 (2026-09-03, D6.2) — LA GAMELLE A UNE CONSIGNE. Population qui voit
// une consigne différente: les foyers où au moins une bouche adulte a
// répondu « gamelle » au déjeuner de semaine. Les autres reçoivent v22 au
// caractère près, et un test le tient.
// ⟳ v26 (2026-09-04) — LE PLAN DIT CE QU'IL A PESÉ. Le suffixe système gagne
// `EXPLANATION_SCHEMA_BLOCK`, et le message utilisateur gagne
// `DECIDED BEFORE YOU` dès qu'un appelant passe `decided`. Trois populations à
// distinguer, pas deux: v25, v26 SANS les faits (le bloc utilisateur est vide,
// le prompt est celui de v25 plus le schéma), et v26 AVEC. Le compteur
// `explanation.asked` sépare les deux dernières.
// ⟳ v32 (2026-09-07) — LE BRIEF DE SERVICE PARLE DE NOUVEAU DE TAILLE. Le
// moteur ne redimensionne plus les boîtes; le brief quitte donc sa branche
// « le moteur dimensionne » (mots de taille retirés, « never a weight ») pour
// celle où le modèle porte le nombre: directions complètes par objectif et
// « write the grams ». Mesuré avant: 45 boîtes sur 45 identiques pour trois
// corps et trois objectifs différents. Le bloc d'arbitrage ne bouge pas.
/**
 * ⟳ v33 (2026-09-07) — LE MODÈLE ÉCRIT UNE RECETTE, L'ALGORITHME MULTIPLIE.
 *
 * v32 disait « l'assiette diffère par ce qu'il y a dessus »: le modèle écrivait
 * les grammes de chaque boîte à partir de faits de corps qu'on lui donnait.
 * v33 lui retire les deux — les faits de corps ET les boîtes — et lui demande
 * UNE portion standard par plat. Le dimensionnement est passé au moteur
 * (`portion_sizing.ts`), qui sait le mesurer, le borner et le compter.
 *
 * ⚠️ LA BASCULE EST BORNÉE À UNE BOUCHE (`PORTION_SIZING_MAX_MOUTHS`). À deux
 * et plus, le prompt est celui de v32 à l'octet près — une empreinte SHA-256
 * le tient sur trois foyers canoniques.
 */
// ⟳ 2026-09-13 — LE NOM NE BOUGE PAS, ET C'EST DÉLIBÉRÉ. `householdDietBlock`
// gagne la FORME d'un item de contenant (`boxItemSchemaLines`), qui ne sort que
// sur la prémisse de ce bloc — un régime déclaré à table. Ce n'est pas une
// bascule de structure comme v32/v33: le prompt d'un foyer sans régime déclaré
// est celui de v33 à l'octet près, et renommer la version aurait fait mentir
// toutes les lignes déjà écrites sous ce nom.
// ⟳ 2026-09-19 — v35 : LA GRILLE EST UNE CHECKLIST, ET LA CASE EST REMPLIE
// PAR LE PLAT DE LA TABLE. Le texte servi par `buildMealPrompt` a changé
// (une ligne par moment avec son compte de jours; le plancher qualifié par
// « the TABLE's dish »), donc le millésime bouge: sans ça,
// `keel_plan_refusals.prompt_version` répond « v33 » pour deux textes
// différents et plus personne ne peut dire lequel a été servi.
// ⟳ 2026-09-19 — v36 : L'OBJECTIF PRIME SUR L'HABITUDE. Le bloc « A DISH OF
// THEIR OWN » nomme désormais les jours d'un porteur plafonné (perte de poids :
// deux jours par semaine), donc le texte servi change ; le millésime aussi.
// ⟳ 2026-09-23 — v37 : L'ASSIETTE N'EST PAS TOUT LE REPAS. Audit
// `docs/keel/AUDIT-DOSAGES-2026-09-23.md`: la consigne poussait vers le
// féculent (« Reach the density with the starch », « energy comes from the
// starch », « more starch »), le modèle écrivait 150 g de céréale sèche par
// part (médiane) et la recette commune était celle du plus gros mangeur. Le
// texte servi change sur quatre points: la recette de référence (l'assiette de
// la personne du MILIEU) dans `standardRecipeBlock`, les phrases qui poussaient
// au féculent retirées, le bloc `SIDE COURSES` (`side_courses_prompt.ts`) dès
// qu'un à-côté est demandé, et le « sens du plan » dit PAR PERSONNE dans
// `DECIDED BEFORE YOU`. Le bloc d'arbitrage ne bouge pas.
// ⟳ 2026-09-23 — v38 : CHAQUE ASSIETTE SÉPARE SON FÉCULENT. `standardRecipeBlock`
// ne dit plus « A lunch or dinner eaten by ONE person is a complete plate in
// ONE dish »: tout déjeuner et tout dîner, seul ou partagé, est une casserole
// principale ET son féculent à part (`separable_side`). Mesuré sur le brouillon
// `1461270e` (personne seule en perte): aucun féculent à part, céréale sèche
// médiane 69 g, part d'énergie du féculent 0,35 contre 0,30 visé. Le texte
// servi change (v33 sous `portion_v1` et v34), donc le millésime bouge. Le
// bloc d'arbitrage ne bouge pas.
// ⟳ 2026-09-23 — v39 : LES À-CÔTÉS VIENNENT EN FAMILLES. Le bloc `SIDE
// COURSES` (`side_courses_prompt.ts`) dit la règle de la TABLE (un aliment par
// type pour tous ceux qui en ont un, au même repas), son exception (qui ne peut
// pas le manger en reçoit un autre du même type), la règle des DEUX JOURS (un
// aliment deux jours de suite au plus, peu d'aliments sur le plan), et un
// dessert fait d'UN aliment — dense pour la prise. Mesuré sur la campagne du
// 2026-09-23: « emmental + 2 pommes » à 10 repas sur 10 pour Thomas. Le bloc
// d'arbitrage ne bouge pas.
// ⟳ 2026-09-23 — v40 : LA TABLE PARTAGE SES À-CÔTÉS. Le bloc `SIDE COURSES`
// retire le dessert DENSE de la prise (il contredisait la table: 9 % de repas
// partagés dans la famille E, et « dried figs » servies comme figue fraîche),
// nomme la personne en prise qui partage un repas à dessert pour qu'elle suive
// la table, fait nommer l'aliment exact et jamais une catégorie, et sort le
// pain de la règle des deux jours. Mesuré sur cinq générations v39. Le bloc
// d'arbitrage ne bouge pas.
// ⟳ 2026-09-23 — v41 : CE QUI EST BEAUCOUP REVENU EST NOMMÉ. Une ligne suit
// l'envie: les aliments principaux qui ont occupé le plus de déjeuners et de
// dîners dans les deux derniers plans (3 protéines + 2 féculents,
// `plan_avoid_list.ts`), « à éviter si possible ». Absente quand la liste est
// vide. Le bloc d'arbitrage ne bouge pas.
// ⟳ 2026-09-24 — v42 : CE QU'ILS ONT REFUSÉ EST NOMMÉ. Une ligne suit celle
// « à éviter »: les plats barrés sur un aperçu (« Remplacer »), avec les
// personnes à qui ne plus les servir (`rejected_dishes.ts`). Absente quand la
// liste est vide. Le bloc d'arbitrage ne bouge pas.
export const HOUSEHOLD_PROMPT_VERSION = "v42_what_they_turned_down";

/**
 * ⟳ 2026-09-23 — LA FORME CANONIQUE SERT LES À-CÔTÉS (`served: true`): c'est
 * le cas de tout plan qui en demande, donc celui que les gardes de texte lisent.
 */
export const STANDARD_RECIPE_BLOCK: readonly string[] = standardRecipeBlock({
  normal: NORMAL_DISH_MIN_KCAL_PER_100G,
  light: LIGHT_DISH_MIN_KCAL_PER_100G,
}, { served: true });

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
  // ⟳ 2026-09-23 — la ligne « à éviter », telle que `avoidLineOf` l'a écrite.
  const avoidBlock = (input.avoidLine ?? "").trim();
  // ⟳ 2026-09-24 — la ligne des plats refusés, telle que `rejectedDishesLine` l'a écrite.
  const rejectedBlock = (input.rejectedDishesLine ?? "").trim();
  const voices = buildHouseholdVoices(input.voices);
  // LOT A — les notes par bouche, déjà rendues par `memo.ts`. Sa trace
  // (`served`) sort par le même objet que son texte.
  const notes = notesBlock(input.notes);
  const dishOwner = dishOwnerSchemaBlock(input.dishBearers);
  // LOT C ② — LES DEUX MOITIÉS, CALCULÉES DEPUIS LA MÊME LISTE. Le patron est
  // celui de `dishOwnerSchemaBlock` / `dedicatedDishBlock`, qui MARCHE en
  // production (4 déclarés, 4 attribués sur le plan mesuré): la clé et sa liste
  // fermée dans le schéma, l'ordre dans le message utilisateur. Deux listes
  // calculées séparément nommeraient dans l'une quelqu'un que l'autre ignore.
  const whyRuleSchema = whyRuleSchemaBlock(input.ruleHolders);
  // LOT 4 — LA MOITIÉ SCHÉMA DES BOÎTES. Même prémisse que sa moitié consigne
  // (`boxingOrderLines`, dans le brief): deux bouches au moins. Un foyer d'une
  // seule rend les deux vides, et le prompt est celui de v13 au caractère près.
  // LA MÊME LISTE QUE `boxMemberIds` CÔTÉ PARSEUR — dérivée ici de `members`
  // par le MÊME prédicat, jamais recopiée à la main.
  // ⛔ AUCUN SCHÉMA DE BOÎTE SOUS `portion_v1`. Le moteur les autore (lot 4);
  // en demander au modèle ferait écrire une sortie qu'on jette, et un modèle à
  // qui on jette la moitié de sa sortie finit par mal écrire l'autre.
  // ⚠️ À une seule bouche, `boxSchemaBlock` rendait DÉJÀ vide (mesuré au tir
  // BASE du 2026-09-07: ni `ONE BOX PER GROUP` ni `THE MEMBER IDS` n'atteignent
  // le modèle). Cette garde n'est donc pas ce qui ferme la porte aujourd'hui —
  // elle la ferme le jour où la borne monte, et c'est pour ce jour-là qu'elle
  // est écrite.
  const boxSchema = input.sizingPath === "portion_v1"
    ? []
    : boxSchemaBlock(input.members, weighedPortionMembers(input.members));
  // LA MÊME LISTE QUE `boxSchema` ET `dishOwner` RÉCLAMENT, imprimée une fois
  // au-dessus d'eux. Même plancher de deux bouches: à une seule, le suffixe
  // système reste identique à l'octet près (un test le tient).
  // ⚠️ LA LISTE SORT DÈS QUE QUELQUE CHOSE Y RENVOIE. `boxSchema` la cite
  // nommément; l'émettre sans elle serait promettre une liste absente.
  const idRoster = memberIdRosterLines(input.members, boxSchema.length > 0);
  // L7 — LES DEUX BLOCS NEUFS, CALCULÉS UNE FOIS. Leur trace sort par le même
  // objet que leur texte: c'est ce qui empêche la mesure de mentir sur ce que
  // le prompt a réellement dit.
  const kitchen = kitchenBlock(input.kitchenEquipment);
  const eatingOut = eatingOutBlock(input.members, input.presence.eatingOut);
  // D6.2 — `?? []` = le champ n'a pas été passé, donc aucun bloc: le prompt
  // est celui de v22 au caractère près, et le compteur le dit (0 / 0).
  const workLunch = workLunchBlock(input.members, input.workLunch ?? []);
  // ③ — LE BLOC EST CALCULÉ PAR LE MODULE QUI PORTE LA RÈGLE, jamais écrit ici.
  // Sa trace (`cells`) sort par le même objet que son texte: c'est ce qui
  // empêche la mesure de mentir sur ce que le prompt a réellement dit.
  const traditions = traditionBlock(input.traditions, input.daysInWindow);
  // ── C1 · LA RÈGLE EST CALCULÉE PAR LE MODULE QUI LA PORTE ───────────────
  // Sa trace (`emitted`/`skipped`) sort par le MÊME objet que son texte: c'est
  // ce qui empêche la mesure de mentir sur ce que le prompt a réellement dit.
  const crossContact = crossContactBlock({
    medicalMouths: input.medicalMouths,
    unnamedMedical: input.crossContactUnnamedMedical,
    // ⛔ LA MÊME LISTE QUE `dedicatedDishBlock` ET `dishOwnerSchemaBlock`, pas
    // un second calcul. La seconde poêle existe exactement quand la consigne
    // promet un plat à quelqu'un: dériver la prémisse d'ailleurs ferait sortir
    // la règle sur des plans sans second plat, ou la taire sur des plans qui en
    // ont un.
    dishBearers: input.dishBearers,
  });

  const idLines = input.members.map((m) => `- ${m.displayName} = ${m.memberId}`);

  // ── ⟳ 2026-09-23 · LES À-CÔTÉS, UNE LIGNE PAR JOUR ─────────────────────
  // Ce constructeur n'a pas de calendrier: la répartition vit dans le bloc
  // lui-même (`perDay: true`). Seules les personnes de CE prompt sont nommées;
  // une demande pour quelqu'un d'autre compte dans `unplaced`.
  // `?? []` = champ non passé ⇒ aucun bloc, et `given: 0` le dit.
  const sideAsks = input.sideCourses ?? [];
  const sides = sideCoursesBlock({
    asks: sideAsks,
    nameOf: new Map(input.members.map((m) => [m.memberId, m.displayName])),
    perDay: true,
  });
  const sidesGiven = sideCoursesGiven(sideAsks);
  // ── LE BRIEF ET LA RECETTE, CALCULÉS UNE FOIS ──────────────────────────
  // Ils partent au modèle ET dans `repairContext`: deux appels feraient deux
  // textes le jour où l'un des deux reçoit un argument de plus.
  const portionBrief = buildPortionBrief(
    input.members,
    input.cooking,
    input.divergingCount,
    input.weightGroups,
    input.sizingPath,
  );
  const recipe = input.sizingPath === "portion_v1"
    ? standardRecipeBlock(densityFloorsOf(input.members, {
      normal: NORMAL_DISH_MIN_KCAL_PER_100G,
      light: LIGHT_DISH_MIN_KCAL_PER_100G,
    }), { served: sides.block !== "" })
    : [];

  const parts = [
    "== THE HOUSEHOLD ==",
    // ⚠️ LA PHRASE NOMME MAINTENANT LES DEUX DESTINATIONS DES IDS. Elle disait
    // « to use in member_portions », c'est-à-dire le seul champ qui les
    // consommait; depuis le LOT 4 les boîtes les consomment aussi, et une liste
    // présentée comme servant UN champ est une liste que le modèle ne pense pas
    // à relire pour un autre. Byte-identique à une seule bouche, où il n'y a pas
    // de boîtes.
    boxSchema.length === 0
      ? "Exact ids to use in member_portions:"
      : "Exact ids to use in member_portions and on every meal's box lids:",
    ...idLines,
    "",
    // LA FORME DE CUISINE VIENT DE L'APPELANT, ET DE LUI SEUL (G5). Elle
    // valait `input.merge?.shape ?? "one_dish"`, et cette ligne-là clouait
    // toute composition ordinaire au barreau ① sans que rien ne le dise.
    // ⟳ 2026-09-23 — calculé une fois plus haut (`portionBrief`), mêmes
    // arguments: il part aussi dans `repairContext.cards`.
    portionBrief,
    // ── v33 · COLLÉ AU BRIEF, ET LA POSITION EST LA MOITIÉ DU LOT ──────────
    // Le brief ci-dessus promet « how much of which component goes on their
    // plate »; ce bloc-ci dit sous quelle FORME l'écrire. Les séparer par la
    // présence, la fusion ou l'envie remettrait la promesse et la forme à deux
    // endroits du prompt — c'est très exactement l'état de v12, où le modèle
    // n'a composé aucun second plat onze fois sur douze.
    // ⟳ 2026-09-08 — LES PLANCHERS SONT CALCULÉS, PAS CONSTANTS. `densityFloorsOf`
    // relève la base avec les densités qu'aucune ligne ne peut nommer (plancher
    // TCA). Sans bouche concernée, il rend la base au bit près — et le test
    // d'empreinte du prompt le vérifie.
    // ⟳ 2026-09-23 — calculé une fois plus haut (`recipe`): il part aussi dans
    // `repairContext.standardRecipe`.
    // ⚠️ ET IL PART EN UN SEUL MORCEAU. Il était étalé ligne par ligne dans
    // `parts`, que la fin de fonction joint par « \n\n »: chaque ligne du bloc
    // partait séparée par une ligne vide, une phrase coupée en deux paragraphes
    // à chaque retour. v34 le joignait déjà par « \n ». Joint ici de même, le
    // texte servi est celui que `repairContext.standardRecipe` recopie, et la
    // part de féculent reste à deux lignes de `separable_side`.
    ...(recipe.length > 0 ? [recipe.join("\n")] : []),
    // ── ⟳ 2026-09-23 · LES À-CÔTÉS, JUSTE SOUS LA RECETTE ──────────────────
    // La recette dit « the app serves a side course beside it (SIDE COURSES) »;
    // ce bloc EST le renvoi, et il porte la clé `side_courses`. Collés, pour la
    // même raison que la recette est collée au brief. `""` sans demande: le
    // filtre de fin de tableau le retire et le prompt est celui d'avant.
    sides.block,
    // ── LOT 3C · COLLÉ AU BRIEF, ET LA POSITION EST LA MOITIÉ DU LOT ────────
    // La ligne de forme PROMET un plat dédié à l'intérieur du brief ci-dessus;
    // ce bloc-ci le COMMANDE, nomme les bouches et dit quelle clé le porte. Les
    // séparer par la présence, la fusion ou l'envie remettrait la promesse et
    // l'ordre à deux endroits du prompt — c'est très exactement l'état de v12,
    // où la promesse était dans le message utilisateur et la clé dans le prompt
    // système, et où le modèle n'a composé aucun second plat onze fois sur
    // douze.
    //
    // ⚠️ IL NE PASSE PAS EN DERNIER. « La contrainte la plus proche de la fin
    // est lue comme la plus contraignante » est l'invariant qui protège les
    // règles de maison; ce bloc n'a pas besoin de cette place — il nomme ses
    // bouches une par une et porte leurs ids — et la lui prendre démoterait la
    // seule consigne qui doit survivre à tout.
    dedicatedDishBlock(input.dishBearers, input.dedicatedDishesAsked),
    preferenceSplitBlock(input.preferenceSplits),
    // JUSTE APRÈS LE BRIEF DE PORTIONS, et avant tout le reste: les deux
    // parlent de la même chose — qui mange quoi. Les séparer par l'envie de la
    // semaine ferait lire « pour combien de personnes » très loin de « pour
    // qui », et le modèle recompte alors la tablée sur la liste d'ids.
    input.presence.block,
    // ── L7 ② · COLLÉ AU BLOC DE PRÉSENCE, ET LA POSITION EST LA MOITIÉ DU LOT
    // Le bloc juste au-dessus vient d'écrire « Nina not eating here -- cook for
    // 3 instead of 4 » pour EXACTEMENT ces cases. C'est cette phrase-là que ce
    // bloc-ci corrige: sans lui contre elle, un midi dehors et une semaine de
    // vacances sont le même fait pour le modèle. Les séparer par la fusion,
    // les voix ou l'envie rendrait la correction inaudible — c'est la mesure de
    // 3C, où une promesse et sa clé séparées par le prompt ont rendu zéro
    // déclaration sur 291 plats.
    eatingOut.block,
    // D6.2 — APRÈS le bloc « dehors », et c'est l'ordre du sens: on dit
    // d'abord quels repas ne se composent PAS, ensuite lesquels se composent
    // autrement. L'inverse ferait poser une contrainte de transport sur un
    // déjeuner qu'on annonce ensuite ne pas préparer.
    workLunch.block,
    // ── ③ · COLLÉ AU BLOC « DEHORS », ET LA POSITION EST LA MOITIÉ DU LOT ───
    // Les deux parlent de la MÊME chose et d'aucune autre: ce qu'une case
    // précise de la grille porte. Le voisin du dessus dit « ne compose RIEN
    // ici »; celui-ci dit « compose ÇA ici ». Les séparer par la fusion, les
    // voix ou l'envie ferait lire deux consignes de case à deux endroits du
    // prompt — c'est la mesure de 3C, où une promesse et sa clé séparées ont
    // rendu zéro déclaration sur 291 plats.
    //
    // ⚠️ IL NE PREND PAS LA DERNIÈRE PLACE. « La contrainte la plus proche de
    // la fin est lue comme la plus contraignante » est l'invariant qui protège
    // les règles de maison — une allergie doit survivre à une tradition, pas
    // l'inverse. Un dimanche sans rôti est une déception; un dimanche avec de
    // l'arachide est un accident.
    traditions.block,
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
    // ── D4 · APRÈS LA TABLÉE, AVANT L'ENVIE ─────────────────────────────────
    // Les quatre blocs qui précèdent disent QUI mange et en quelle quantité; ce
    // qui suit dit ce que le foyer veut CETTE FOIS. Les voix sont durables —
    // c'est un goût, pas une envie — donc elles se rangent du côté de ce qui
    // vaut toutes les semaines, et le tronc fait exactement le même partage
    // (`-- WHAT THEY HAVE TOLD ME --` précède `-- THIS TIME --`).
    //
    // Les règles de maison restent EN DERNIER: c'est la seule chose qui doit
    // survivre à tout, y compris à une préférence qui la contredirait
    // (« Léa adore le Nutella » face à « on ne sert pas de Nutella à Léa »).
    voices.block,
    // ── LOT A · JUSTE APRÈS LES VOIX, AVANT L'ENVIE ────────────────────────
    // Même famille que les voix — ce qu'on sait des gens, durable — donc du
    // côté de ce qui vaut toutes les semaines, avant « THIS TIME ». Et APRÈS
    // les voix: leur pied de bloc interdit de dire qui a façonné un plat; une
    // note, elle, désigne sa personne dans l'assiette. Lue en second, c'est
    // elle qui l'emporte sur ce point-là.
    notes.block,
    envyBlock,
    // ── ⟳ 2026-09-23 · CE QUI EST BEAUCOUP REVENU, JUSTE APRÈS L'ENVIE ─────
    // La ligne dit « if the household asked for one of them above »: elle
    // renvoie à l'envie, donc elle la suit immédiatement. Et elle reste loin
    // devant les règles de maison: « si possible » ne doit jamais se lire plus
    // contraignant qu'une allergie.
    avoidBlock,
    rejectedBlock,
    // ── ⟳ 2026-09-04 · CE QUI EST DÉJÀ TRANCHÉ, ET LA CLÉ QUI LE COMPLÈTE ──
    // Juste après l'envie, parce que la première tension que le modèle doit
    // savoir nommer est « ce qu'ils veulent CETTE FOIS contre la direction du
    // plan » — et l'envie est la ligne juste au-dessus. Loin devant les
    // verrous, qui restent en queue.
    decidedBeforeYouBlock(input.decided ?? null),
    // ── L7 ① · LA CUISINE EST DANS LE GROUPE DES VERROUS, APRÈS L'ENVIE ─────
    // Ce n'est pas une préférence, c'est une impossibilité physique: elle doit
    // survivre à « on a envie d'un gratin » écrit trois lignes plus haut. D'où
    // sa place après l'envie, avec le régime et les règles de maison.
    //
    // ⚠️ ELLE NE PASSE NI DERNIÈRE, NI AVANT LE RÉGIME. « Le modèle lit la
    // contrainte la plus proche de la fin comme la plus contraignante » est
    // l'invariant qui protège les règles de maison, et le régime a déjà pris sa
    // place juste devant elles pour une raison écrite. Un four absent est une
    // contrainte de MATÉRIEL: il change comment on cuit, jamais ce qu'on a le
    // droit de servir à quelqu'un. Lui donner la place des deux verrous
    // alimentaires les démoterait pour un appareil.
    kitchen.block,
    // ── R4/R5 · LE RÉGIME, JUSTE AVANT LES RÈGLES DE MAISON ─────────────────
    // Il est dans le GROUPE DES VERROUS, avec les règles de maison, et loin des
    // blocs qui décrivent la tablée: comme elles, il dit ce que la casserole
    // n'a pas le droit de contenir, et il doit survivre à une envie de la
    // semaine qui le contredirait (« on a envie de bœuf bourguignon »).
    //
    // ⚠️ IL NE PASSE PAS DERNIER, ET LES RÈGLES DE MAISON GARDENT LEUR PLACE.
    // « Le modèle lit la contrainte la plus proche de la fin comme la plus
    // contraignante » est un invariant écrit par le lot qui a posé
    // `restrictionBlock`; le déplacer depuis ici démoterait en silence la seule
    // consigne qui doit survivre à tout, pour gagner une position dont ce bloc
    // n'a pas besoin — il nomme ses familles une par une, il ne compte pas sur
    // sa position pour être lu.
    input.dietBlock,
    restrictionBlock(input.restrictions),
    // ── LOT C ② · APRÈS LES DEUX VERROUS, ET C'EST SA PLACE ────────────────
    // Ce bloc ne dit pas ce que la casserole a le droit de contenir — les deux
    // au-dessus le disent, et ils gardent leur rang. Il dit ce qu'on a le droit
    // d'ÉCRIRE à propos d'eux. Il vient donc juste après les règles qu'il
    // encadre, au plus près de ce qu'il commente: un interdit d'énonciation
    // posé trois cents lignes avant la règle qu'il vise est un interdit que le
    // modèle a oublié en arrivant à la règle.
    //
    // ⚠️ ET IL NE DÉMOTE RIEN. « La contrainte la plus proche de la fin est lue
    // comme la plus contraignante » protège les RÈGLES DE MAISON, c'est-à-dire
    // ce qu'on met dans une assiette. Ce bloc-ci ne met rien dans aucune
    // assiette et ne contredit aucune ligne de maison: il n'y a pas de plan
    // qu'il puisse rendre impossible, seulement une phrase qu'il empêche.
    whyRuleBlock(input.ruleHolders),
    // ══════════════════════════════════════════════════════════════════════
    // ── C1 · EN DERNIER, ET C'EST LA MOITIÉ DU LOT ────────────────────────
    // ══════════════════════════════════════════════════════════════════════
    //
    // « La contrainte la plus proche de la fin est lue comme la plus
    // contraignante » est l'invariant écrit par le lot qui a posé
    // `restrictionBlock`, et tous les blocs ajoutés depuis ont refusé cette
    // place — le régime, la cuisine, les traditions, les plats dédiés, les
    // `why`. Celui-ci la PREND, et voici les trois raisons.
    //
    // ① C'EST LA SEULE RÈGLE DE CE PROMPT DONT LA VIOLATION ENVOIE QUELQU'UN À
    //    L'HÔPITAL. Le fichier tranche déjà dans ce sens, mot pour mot, sur le
    //    bloc des traditions: « une allergie doit survivre à une tradition, pas
    //    l'inverse. Un dimanche sans rôti est une déception; un dimanche avec
    //    de l'arachide est un accident. » Une règle de maison est du pouvoir
    //    domestique; celle-ci est une contrainte médicale.
    //
    // ② ELLE NE DÉMOTE RIEN, PARCE QU'ELLE NE MET RIEN DANS AUCUNE ASSIETTE.
    //    Ce que la place finale protège, c'est ce qui décide le CONTENU d'un
    //    plat: « on ne sert pas de Nutella à Léa » doit survivre à « on a envie
    //    de Nutella ». Ce bloc-ci ne retire aucun aliment, n'en ajoute aucun et
    //    ne rend aucun plan impossible: il dit comment on cuit deux plats qui
    //    existent déjà tous les deux. Il n'y a aucun plan que les règles de
    //    maison autorisent et qu'il interdise.
    //
    // ③ ET IL EST RARE. Il ne sort que sur la DOUBLE prémisse — une bouche
    //    médicale ET un plat dédié dans la même session. Sur tous les autres
    //    plans, la chaîne se termine exactement comme avant, à l'octet près,
    //    et les règles de maison retrouvent la dernière place.
    //
    // ⚠️ CE QUI PASSE APRÈS, ET QUI RESTE APRÈS: `appendContentLanguageBlock`,
    // qui est idempotent et se replace toujours en queue (voir le point de
    // composition unique dans `generate-household-meal-v1/index.ts`). C'est une
    // consigne de LANGUE, pas de contenu; elle ne concurrence rien ici.
    crossContact.block,
  ].filter((p) => p && p.trim().length > 0);

  return {
    promptVersion: HOUSEHOLD_PROMPT_VERSION,
    userSuffix: `\n\n${parts.join("\n\n")}`,
    // LOT C — LE BLOC D'ATTRIBUTION REJOINT LE SCHÉMA, et il n'existe que
    // quand un plat dédié est réclamé (voir `dishOwnerSchemaBlock`).
    systemSuffix: `\n\n${
      [
        // ⛔ LES IDS D'ABORD, ET DANS CE MESSAGE-CI. Les trois blocs qui suivent
        // disent « l'id ci-dessus »; sans cette liste, « ci-dessus » pointait
        // vers le message UTILISATEUR et le modèle recopiait des prénoms. Voir
        // `memberIdRosterLines`.
        ...(idRoster.length === 0 ? [] : [...idRoster, ""]),
        // ⟳ 2026-09-07 (lot 8) — `member_portions` NE SORT PLUS SOUS
        // `portion_v1`, ET CE N'EST PAS DU RANGEMENT: c'était une SECONDE
        // AUTORITÉ sur les grammes, et elle contredisait la première.
        //
        // ⛔ MESURÉ SUR LE TIR `L6` DU 2026-09-07, sur le même plan:
        //
        //     phrase lue à table  →  boîte calculée
        //     200 g de yaourt     →  326 g          (+63 %)
        //      45 g de flocons    →   81 g          (+80 %)
        //     150 g de poulet     →  108 g          (−28 %)
        //
        // La `portion_note` porte les grammes que le MODÈLE a écrits — donc
        // sans le corps de personne, puisque v33 le lui a retiré. Le couvercle,
        // lui, porte ceux que l'algorithme a CALCULÉS. Les deux partent dans le
        // même plan, et c'est la phrase qui est lue à voix haute.
        //
        // ⚠️ CICATRICE DATÉE ET REPRODUITE: `portion-note-contradicts-the-lid`.
        // Ce n'est pas une redondance qu'on nettoie, c'est une contradiction
        // qui atteint la personne.
        //
        // ⚠️ RIEN N'EST SUPPRIMÉ: le bloc reste servi à toute la lane legacy,
        // et `reconcilePortions` continue de tourner (voir son bloc: il compte
        // désormais l'absence attendue plutôt que de la traiter en défaut).
        ...(input.sizingPath === "portion_v1" ? [] : PORTION_SCHEMA_BLOCK),
        // ⟳ 2026-09-04 · L'EXPLICATION VIENT APRÈS LE SCHÉMA DES PORTIONS ET
        // AVANT CELUI DES BOÎTES. Elle parle de ce que le modèle a ARBITRÉ,
        // pas de qui reçoit quoi: la coller entre les deux schémas de portion
        // ferait lire la boîte comme une précision de l'explication.
        "",
        ...EXPLANATION_SCHEMA_BLOCK,
        // LOT 4 — LE SCHÉMA DES BOÎTES REJOINT LE SCHÉMA DES PORTIONS, et il
        // vient JUSTE APRÈS lui: les deux disent « qui reçoit combien », l'un en
        // prose lue à table, l'autre en grammes sur un couvercle. Les séparer
        // par l'attribution des plats ferait lire la boîte comme une précision
        // du plat dédié, alors qu'elle porte sur TOUT repas pris sur un lot.
        ...(boxSchema.length === 0 ? [] : ["", ...boxSchema]),
        ...(dishOwner.length === 0 ? [] : ["", ...dishOwner]),
        // LOT C ② — LA MOITIÉ SCHÉMA DE `why_rule_of`, EN DERNIER DANS CE
        // GROUPE. Elle vient après l'attribution des plats parce que les deux
        // portent un `member_id` sur un plat et que celle-ci se lit contre
        // l'autre: `for_member_id` dit à QUI ce plat est destiné,
        // `why_rule_of` dit DE QUI la phrase parle, et le défaut mesuré est
        // très exactement de les confondre.
        ...(whyRuleSchema.length === 0 ? [] : ["", ...whyRuleSchema]),
      ].join("\n")
    }`,
    envyLineUsed: envyBlock.length > 0,
    avoidLineUsed: avoidBlock.length > 0,
    rejectedLineUsed: rejectedBlock.length > 0,
    voiceIssues: voices.issues,
    voicesHeard: voices.heard.length,
    voiceCounts: voices.counts,
    notesServed: notes.served,
    kitchenMissing: kitchen.missing,
    eatingOut: { mouths: eatingOut.mouths, cells: eatingOut.cells },
    workLunch: { mouths: workLunch.mouths, cold: workLunch.cold },
    whyRuleHolders: input.ruleHolders.length,
    // C1 — LA TRACE SORT PAR LE MÊME OBJET QUE LE TEXTE. Voir `crossContact`
    // dans `HouseholdPromptBlocks`: `emitted` compte une phrase envoyée.
    crossContact,
    // ⟳ 2026-09-23 — compté sur les lignes du jour que le bloc a écrites.
    sideCourses: {
      given: sidesGiven,
      prompt_asked: sides.named,
      cells: sides.cells,
      unplaced: Math.max(0, sidesGiven - sides.named),
    },
    // ⟳ 2026-09-23 — les TEXTES servis, pas une seconde rédaction. v33 n'a pas
    // de cartes: la fiche de chacun est sa ligne du brief de portions.
    repairContext: {
      cards: portionBrief,
      notes: notes.block,
      standardRecipe: recipe.join("\n"),
      sideCourses: sides.block,
    },
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
