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
  type CookingShape,
  type PortionMember,
  // LE MÊME PRÉDICAT QUE `boxMemberIds` CÔTÉ PARSEUR — appelé, jamais recopié.
  weighedPortionMembers,
} from "./household_portions.ts";
import { buildEnvyBlock } from "./household_envies.ts";
// ── C1 · LA CONTAMINATION CROISÉE VIT DANS SON MODULE ────────────────────
// Comme `household_traditions.ts` et `fridge_window.ts`: la règle, son texte
// et son compteur au même endroit. L'écrire ici en ferait une phrase de plus
// dans un fichier qui en compte trois cents, sans compteur — et « une règle
// qui ne vit que dans un prompt régresse en réel sans que personne le voie ».
import {
  crossContactBlock,
  type CrossContactMouth,
  type CrossContactOutcome,
} from "./cross_contact.ts";
import type { MealCell, WindowPresence } from "./household_presence.ts";
// L7 ① — LA PROSE DES JOURS ET DES MOMENTS VIENT DU TRONC, comme dans
// `household_presence.ts` (D14). Une seconde table dirait « Saturday » ici et
// « Sat » là, dans deux blocs que le modèle lit à la suite.
import { dayProse, OCCASION_PROSE } from "./meal_generation.ts";
// ③ — LE BLOC DES TRADITIONS VIT DANS SON MODULE, avec sa règle et son
// vérificateur. L'écrire ici en ferait un texte sans garde, et le verrou
// déterministe lirait une autre liste que celle que le prompt a dite.
import {
  type HouseholdTradition,
  traditionBlock,
} from "./household_traditions.ts";
import {
  type KitchenTool,
  missingKitchenTools,
} from "./kitchen_equipment.ts";
import {
  buildMergeBlock,
  buildUnmergeBlock,
  type MergeMaterialDish,
  type PlanSpan,
  type ShownPlanGap,
} from "./household_merge.ts";
import {
  buildHouseholdVoices,
  type RawMemberVoice,
  type VoiceLineCounts,
} from "./household_voices.ts";

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
 *     bloc `WHAT THE SHARED DISH MUST RESPECT`. Aucun foyer ne l'avait avant le
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
export const HOUSEHOLD_PROMPT_VERSION = "v23_the_lunchbox_travels";

export interface HouseholdRestriction {
  memberId: string;
  memberDisplayName: string;
  label: string;
}

export interface HouseholdPromptInput {
  members: readonly PortionMember[];
  /**
   * D6.2 (2026-09-03) — CE QUE CHAQUE BOUCHE FAIT DE SON MIDI DE SEMAINE.
   *
   * ⚠️ OPTIONNEL, ET C'EST UNE EXCEPTION ARGUMENTÉE À LA DOCTRINE DE CE
   * FICHIER (« la casse de compilation est le mécanisme qui recense les
   * appelants »). Ce type est construit par **65 littéraux** dont l'immense
   * majorité sont des fixtures de test, et un lot en vol y ajoute déjà un
   * champ requis: deux champs requis simultanés se paieraient en conflits, pas
   * en sécurité.
   *
   * ⛔ ET LA CICATRICE « paramètre de garde optionnel = garde désarmée » EST
   * COMPENSÉE DEUX FOIS, parce qu'un `?` seul ne suffit jamais ici:
   *   · un COMPTEUR sort avec le bloc (`workLunchMouths`, `workLunchCold`),
   *     donc un câblage débranché est visible en SQL sur la ligne du plan;
   *   · un test de CÂBLAGE PAR LECTURE DE SOURCE vérifie que la lane foyer
   *     passe bien ce champ (`household_meal_generation_test.ts`).
   * Omis ⇒ aucun bloc, et le prompt est celui de v22 au caractère près.
   */
  workLunch?: ReadonlyArray<{
    memberId: string;
    mode: string | null;
    microwave: boolean | null;
  }>;
  /**
   * ③ LES JOURS QUE LE FOYER NE DÉPLACE PAS (2026-08-20).
   *
   * ⚠️ REQUIS, jamais optionnel, et c'est la doctrine de tout ce fichier: la
   * casse de compilation est le mécanisme qui recense les appelants. `[]` rend
   * le prompt d'hier AU CARACTÈRE PRÈS — c'est la contre-épreuve du lot, et
   * elle est tenue par un test.
   */
  traditions: readonly HouseholdTradition[];
  /**
   * LES JOURS DE SEMAINE QUE LA FENÊTRE COUVRE (`windowDayOrder`). REQUIS.
   *
   * ⛔ IL N'A PAS DE DÉFAUT À « TOUTE LA SEMAINE ». Un défaut ferait demander un
   * rôti dominical à un plan qui va de jeudi à samedi — c'est-à-dire poser une
   * contrainte impossible, et une contrainte impossible apprend au modèle que
   * les contraintes sont facultatives.
   */
  daysInWindow: readonly string[];
  /**
   * G5 — LA FORME DE CUISINE, DÉCIDÉE PAR L'APPELANT ET PAR LUI SEUL.
   *
   * ── CE QUE CE CHAMP REMPLACE, ET POURQUOI L'ANCIENNE LIGNE MENTAIT ────────
   * Une seule expression vivait ici: `input.merge?.shape ?? "one_dish"`, et
   * elle disait « la forme de cuisine vient de la fusion, et d'elle seule ».
   * C'était vrai jusqu'au 2026-08-14 et ça ne l'est plus: le plat unique était
   * une CONSTANTE de toute composition ordinaire, pas un réglage — l'échelle à
   * trois barreaux existait, son paramètre était requis, et `ladder` valait
   * `null` hors fusion. Une composition était donc clouée au barreau ①, quoi
   * que les directions de service demandent et quel que soit le temps déclaré.
   *
   * ⚠️ REQUIS, jamais optionnel et jamais défaut-é à `one_dish` — même raison
   * que `merge` et `presence` plus bas, et cette fois la cicatrice est double:
   * un défaut silencieux ferait interdire au modèle, dans le même prompt,
   * exactement ce que le reste lui demande de faire.
   *
   * ⚠️ UNE FUSION PASSE TOUJOURS `merge.shape`, ET C'EST À L'APPELANT DE LE
   * TENIR. Ce module n'arbitre pas entre deux sources de barreau: il n'en
   * connaît qu'une, celle-ci.
   */
  cooking: CookingShape;
  /**
   * G5 — COMBIEN DE BOUCHES NE PEUVENT PAS SORTIR DE LA CASSEROLE COMMUNE.
   *
   * `0` hors barreau ②/③. `1` pour toute FUSION — elle reprend une personne,
   * jamais deux — ce qui rend la ligne de forme byte-identique à celle de v9.
   * Voir `cookingShapeLines` (`household_portions.ts`), qui porte la règle.
   */
  divergingCount: number;
  /**
   * COMBIEN DE POIDS DIFFÉRENTS CETTE TABLE SERT (`weightGroupCount`). REQUIS.
   *
   * ⚠️ REQUIS ET NON DÉFAUT-É, pour la raison mesurée de tout ce fichier: un `?`
   * n'aurait fait remonter AUCUN appelant au compilateur, le nombre ne serait
   * jamais entré dans le prompt, et le moteur de grammages resterait armé et
   * inerte — `shared_mixed` sur toutes les boîtes, `sized: 0`, l'enfant de
   * 7 ans et l'adulte de 79 kg dans la même boîte. Mesuré au run A1 du
   * 2026-08-19.
   *
   * `1` = un seul poids, ou aucun corps saisi ⇒ brief byte-identique à v13.
   */
  weightGroups: number;
  /**
   * LOT C — LES BOUCHES À QUI LA CONSIGNE PROMET UN PLAT À ELLES, avec leur id
   * EXACT. `[]` = personne, et le bloc d'attribution n'existe alors pas.
   *
   * ⚠️ REQUIS, jamais optionnel. Un `?` n'aurait fait remonter AUCUN appelant au
   * compilateur, et le bloc serait absent de tous les prompts: le modèle
   * n'aurait jamais rien à quoi attribuer, le parseur n'aurait jamais rien à
   * valider, et `member_id` serait `null` partout. Un lot construit, branché et
   * désarmé — « une ceinture armée sur un coffre vide ».
   *
   * ⚠️ LES MÊMES BOUCHES QUE `divergingCount`, ET LE MÊME NOMBRE. Deux listes
   * calculées séparément feraient promettre un plat à quelqu'un que le bloc ne
   * nomme pas — ou nommer quelqu'un à qui la consigne ne promet rien, dont le
   * plat serait alors retiré à toute la table par la vue par personne.
   */
  dishBearers: readonly { memberId: string; displayName: string }[];
  /**
   * LOT 3C — COMBIEN DE PLATS DÉDIÉS LA CONSIGNE RÉCLAME, EN CHIFFRES.
   *
   * ⛔ LE NOMBRE EST LA MOITIÉ QUI MARCHE, ET C'EST MESURÉ DEUX FOIS DANS CE
   * DÉPÔT. C6 (2026-08-12) a remplacé « ADD ONE dish » par le NOMBRE de plats
   * dédiés dans `buildMergeBlock`, après avoir mesuré un seul plat rendu pour
   * neuf créneaux. Le 2026-08-17, la même chose s'est reproduite un cran plus
   * loin: une phrase qui promet « a dish of their OWN at EVERY meal » sans
   * jamais dire COMBIEN a produit zéro second plat sur onze runs.
   *
   * ⚠️ REQUIS, jamais optionnel, et jamais recalculé ici. C'est le MÊME nombre
   * que celui qui ouvre le budget de plats (`MergedEater.dedicatedDishesAsked`)
   * et que celui qu'archive `dish_owners.asked`. Deux calculs feraient réclamer
   * dans la consigne un nombre que le plafond n'ouvre pas — la contradiction
   * exacte que L4 a payée (16 plats pour un plafond de 15, et le dîner du
   * dimanche du foyer jeté).
   *
   * `0` quand personne ne porte de plat: le bloc n'existe alors pas de toute
   * façon (`dishBearers` est vide), et le prompt est celui de v12.
   */
  dedicatedDishesAsked: number;
  /**
   * ── C1 · LES BOUCHES QUI PORTENT UNE CONTRAINTE `severity='medical'` ─────
   *
   * ⚠️ REQUIS, jamais optionnel, et c'est la doctrine de tout ce fichier: la
   * casse de compilation est le mécanisme qui recense les appelants. Un `?`
   * n'aurait fait remonter AUCUN appelant, le bloc serait absent de tous les
   * prompts, et le lot serait « construit, branché et désarmé » — une ceinture
   * armée sur un coffre vide. `[]` avec `crossContactUnnamedMedical: 0` rend le
   * prompt d'avant ce lot AU CARACTÈRE PRÈS, et c'est la contre-épreuve.
   *
   * ⚠️ CE MODULE NE LES CALCULE PAS. La sévérité vit dans l'union de sécurité
   * (`student_safety_constraints` + `household_member_allergies`), que
   * l'appelant tient déjà résolue avec ses prénoms — la lire ici mettrait la
   * connaissance des contraintes dans le module qui assemble le prompt.
   */
  medicalMouths: readonly CrossContactMouth[];
  /**
   * C1 — COMBIEN DE CONTRAINTES MÉDICALES N'ONT PAS TROUVÉ LEUR PRÉNOM.
   *
   * ⛔ REQUIS, ET CE N'EST PAS UN DÉTAIL DE COMPTAGE. Une contrainte médicale
   * `unattributed` reste une contrainte médicale. L'omettre désarmerait le bloc
   * pour la population qui ne peut pas se redéclarer elle-même — la bouche sans
   * compte, cas nominal de `household_member_allergies`.
   */
  crossContactUnnamedMedical: number;
  /**
   * R4/R5 — CE QUE LE PLAT PARTAGÉ DOIT RESPECTER. `""` = personne n'a déclaré
   * de régime, et le prompt est alors byte-identique à celui d'avant ce lot.
   *
   * ⚠️ REQUIS, jamais optionnel — même cicatrice que `cooking`, `presence` et
   * `merge` au-dessus, et cette fois elle a un nom mesuré: avant le 2026-08-14,
   * `generate-household-meal-v1` ne portait AUCUNE occurrence du mot « diet ».
   * Un maître végane recevait de la viande. Un `?` ici n'aurait fait remonter
   * AUCUN appelant au compilateur, et le lot se serait construit sans être
   * branché — colonne écrite, écran livré, prompt inchangé.
   *
   * ⚠️ CE MODULE NE LE COMPOSE PAS, ET C'EST DÉLIBÉRÉ. Le bloc est rendu par
   * `householdDietBlock` (`household_diet.ts`), qui lit `dietary_regime.ts`.
   * L'importer d'ici mettrait la connaissance des régimes dans le module qui
   * assemble le prompt, alors qu'elle appartient au moteur qui la porte déjà.
   */
  dietBlock: string;
  /**
   * L7 ① — AVEC QUOI CE FOYER CUISINE. `null` = LA QUESTION N'A JAMAIS ÉTÉ
   * POSÉE, et ce n'est PAS « il n'a rien ».
   *
   * ⚠️ REQUIS ET NULLABLE, jamais optionnel — même cicatrice que `presence`,
   * `merge`, `cooking` et `dietBlock` au-dessus, et cette fois elle a un nom et
   * une mesure: `budgetBand` était `?:`, un appelant l'a oublié, et la ligne de
   * consigne a disparu sans que rien n'échoue. Un `?` ici ferait exactement ça:
   * l'écran collecte les sept cases, la colonne se remplit, et le plan continue
   * de proposer un gratin à un foyer sans four.
   *
   * ⚠️ LE TYPE EST LA LISTE DE CE QU'IL A, PAS DE CE QUI MANQUE. La conversion
   * est faite ICI, par `missingKitchenTools()`, et c'est le seul chemin sans
   * piège (voir `kitchenBlock`). Passer directement « ce qui manque » ferait un
   * second calcul de la même chose chez l'appelant, où le `null` se perdrait.
   */
  kitchenEquipment: readonly KitchenTool[] | null;
  /**
   * LA ligne d'envies de la semaine, ou `null`. UNE phrase pour tout le foyer,
   * pas une liste par personne (lot 5). L'appelant est responsable de son
   * ancrage: une ligne d'une semaine passée ne doit jamais arriver ici.
   */
  envyLine: string | null;
  restrictions: readonly HouseholdRestriction[];
  /**
   * LOT C ② — LES BOUCHES QUI PORTENT UNE RÈGLE, ET ELLES SEULES.
   *
   * Une contrainte dure, un régime déclaré, une règle de maison: les trois
   * provenances comptent, et l'appelant les réunit parce que lui seul les tient
   * toutes les trois. `[]` = personne n'a rien déclaré, aucun des deux blocs
   * n'est servi, et le prompt est byte-identique à celui de v18.
   *
   * ⚠️ REQUIS, jamais optionnel. C'est la même phrase que `dietBlock`,
   * `presence`, `merge`, `cooking` et `dishBearers` au-dessus, et elle a été
   * payée à chaque fois: un `?` ici ne ferait remonter AUCUN appelant au
   * compilateur, les deux blocs seraient absents de tous les prompts, le modèle
   * n'aurait aucune clé à écrire, le compteur n'aurait rien à valider — et
   * `why_rule_counts` rendrait des zéros parfaits sur un lot désarmé. « Une
   * ceinture armée sur un coffre vide », énième fois.
   */
  ruleHolders: readonly HouseholdRuleHolder[];
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
  /**
   * CE QUE CHAQUE TITULAIRE A DIT DE SA BOUFFE (D4, 2026-08-12).
   *
   * Une entrée par bouche AVEC COMPTE qui a confirmé quelque chose, dans
   * l'ordre du roster, avec ses lignes BRUTES: le plafond par membre et la
   * garde de non-divulgation sont appliqués ICI, par `buildHouseholdVoices`, et
   * nulle part ailleurs. Une bouche SANS compte n'a rien à dire et n'apparaît
   * pas (D3); ce n'est pas un manque.
   *
   * ⚠️ REQUIS, `[]` pour « personne n'a rien confirmé », jamais `T?`. Un champ
   * facultatif n'aurait fait remonter aucun appelant au compilateur, et D4
   * serait construit sans être branché — le mode d'échec n°1 de ce chantier.
   * `[]` rend un prompt byte-identique à celui de v5.
   *
   * ⚠️ ON PASSE LES LIGNES BRUTES, PAS DES LIGNES DÉJÀ FILTRÉES. Un appelant
   * qui filtrerait de son côté pourrait un jour cesser de le faire, et rien
   * n'échouerait: un prompt n'a pas de compilateur. Il n'y a qu'une porte, et
   * elle garde.
   */
  voices: readonly RawMemberVoice[];
  /**
   * LOT A (2026-09-03) — « CE QUE SOPHIA SAIT », PAR BOUCHE, DÉJÀ RENDU.
   *
   * Les notes de la destination ③ des bouches À CETTE TABLE, rendues par
   * `memo.ts::renderMemoLine` (« Tuesday dinner — Léa: … »). Les notes de la
   * TABLE (`household`) n'arrivent pas ici: elles entrent par le tronc
   * (`buildMealPrompt({ memo })`), comme avant le lot.
   *
   * ⚠️ REQUIS, `[]` pour « aucune note », jamais `T?`. Un champ facultatif
   * n'aurait fait remonter aucun appelant au compilateur, et la destination ③
   * serait construite sans être branchée — le mode d'échec n°1 de ce dépôt.
   * `[]` rend un prompt byte-identique à celui d'avant le lot.
   *
   * ⚠️ PAS PAR LES VOIX. Les voix ne portent que les bouches AVEC compte (D3),
   * sous un plafond de tokens et une garde de non-divulgation dont le pied de
   * bloc dit « never say whose line shaped a dish ». Une note dit l'inverse:
   * « Léa a danse le mardi, il lui faut une grosse part » DOIT désigner Léa
   * dans l'assiette. Deux natures, deux blocs.
   */
  notes: readonly string[];
}

/** Ce que la fusion apporte au prompt. Décidé ailleurs — voir `household_merge.ts`. */
export interface HouseholdMergePrompt {
  displayName: string;
  window: PlanSpan;
  /** Le barreau de l'échelle, décidé par `mergeLadder`. Jamais deviné ici. */
  shape: CookingShape;
  /** Les plats du PLAN PERSONNEL repris — de la matière pour UNE bouche. */
  dishes: readonly MergeMaterialDish[];
  /**
   * O5 — LES PLATS DU PLAN DU FOYER, l'ancre de la consigne.
   *
   * ⚠️ REQUIS, jamais optionnel: sans lui, la fusion retomberait sur la
   * consigne sans ancre — celle qui a servi le plan personnel d'un secondaire
   * à toute la tablée, 15 créneaux sur 15, deux fusions réelles sur deux. Voir
   * `buildMergeBlock`.
   */
  baseDishes: readonly MergeMaterialDish[];
  /**
   * C2 ④ — LES CASES QUE LE PLAN DU FOYER NE REMPLIT PAS.
   *
   * ⚠️ REQUIS, `[]` pour « il n'y a pas de trou ». Sans lui, l'ancre demande de
   * rester au plus près d'un plan dont une case est vide, et le trou se
   * transmet — mesuré sur la défusion, qui obéit 14/14 à la même phrase.
   */
  gaps: readonly ShownPlanGap[];
  /**
   * C6 — COMBIEN DE PLATS DÉDIÉS LA CONSIGNE RÉCLAME. `0` au barreau ①.
   *
   * ⚠️ REQUIS: sans lui, la consigne retomberait sur « ADD ONE dish », qui a
   * été lu « un pour la fenêtre » — un seul plat dédié pour NEUF créneaux, et
   * la personne reprise servie de la casserole commune 8 fois sur 9, malgré un
   * conflit de direction sur DEUX axes.
   */
  dedicatedDishes: number;
  /**
   * C6 — LES AXES DU CONFLIT (`mergeLadder().conflicts`). `[]` au barreau ①.
   *
   * ⚠️ REQUIS: c'est ce qui dit CE QUI doit être différent dans le plat dédié.
   * Sans lui, « fais-lui un plat » se satisfait du plat du foyer servi en
   * portion simple — mesuré le 2026-08-12, zéro aliment de son plan dans les
   * plats comme dans les 37 lignes de courses.
   */
  conflicts: readonly string[];
}

/** Ce que la défusion apporte au prompt (D8). Voir `buildUnmergeBlock`. */
export interface HouseholdUnmergePrompt {
  displayName: string;
  window: PlanSpan;
  /** Les plats du PLAN DE BASE — celui qu'on recompose sans cette personne. */
  dishes: readonly MergeMaterialDish[];
  /**
   * C2 ④ — LES CASES QUE LE PLAN DE BASE NE REMPLIT PAS.
   *
   * ⚠️ REQUIS, et c'est le chemin sur lequel le défaut a été MESURÉ: deux plans
   * du foyer consécutifs sans petit-déjeuner mercredi, la défusion recopiant le
   * trou du plan qu'on lui demande de suivre.
   */
  gaps: readonly ShownPlanGap[];
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
/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ LES IDENTIFIANTS, DANS LE MESSAGE QUI LES RÉCLAME.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, MESURÉ SUR LA RÉPONSE ARCHIVÉE (2026-08-19) ───────────────
 * Trois clés du prompt SYSTÈME demandent un `member_id`: `member_portions`,
 * `boxes[].member_ids`, `for_member_id`. Les trois disaient « the exact id
 * given above » / « from the list above ». Or **il n'y avait aucun id
 * au-dessus**: la liste des bouches vit dans le message UTILISATEUR. Vérifié
 * sur `llm_raw_response_events`: le prompt système ne contenait pas un seul
 * uuid, le message utilisateur oui.
 *
 * Le modèle a donc écrit le seul identifiant qu'il avait sous les yeux — le
 * PRÉNOM. Sur le run `76be8ce3`: `member_ids: ["iku"]`, `["Christèle"]`, et
 * `member_portions[].member_id: "iku"`. Résultat: **16 boîtes sur 16
 * refusées** par le parseur (qui a raison: deux bouches peuvent porter le même
 * prénom, et « jamais de matcher maison »), zéro consigne de portion gardée,
 * zéro gramme à l'écran — pendant que chaque méthode finissait par
 * « portionner dans les boîtes nommées ». Signalé: « là tu vois je vois pas
 * les boîtes nommées ».
 *
 * ⚠️ CE N'EST PAS UNE DÉSOBÉISSANCE DU MODÈLE. Les 21 reprises portaient un
 * `box_id`, et chaque préparation portait ses deux boîtes: il avait compris le
 * protocole entier. Il lui manquait la seule chose qu'on ne lui avait pas
 * donnée dans ce message-là.
 *
 * ⛔ CICATRICE `promise-and-schema-key-must-be-adjacent`, À LA LETTRE: une
 * promesse et sa clé de schéma doivent se toucher, sinon 0 %. Ici c'était une
 * RÉFÉRENCE (« above ») qui pointait hors du message. Le taux mesuré est bien
 * zéro.
 */
function memberIdRosterLines(
  members: readonly { memberId: string; displayName: string }[],
  /**
   * ⛔ VRAI DÈS QU'UN AUTRE BLOC RENVOIE À CETTE LISTE (2026-08-19).
   *
   * Le bloc des boîtes dit « ids from THE MEMBER IDS ». À une seule bouche, la
   * liste ne sortait pas — et depuis que la pesée se déclenche sur l'OBJECTIF
   * et non sur la taille du foyer, un solo qui perd du poids reçoit ce bloc.
   * On lui demandait donc un id « de la liste ci-dessus » sans liste au-dessus:
   * très exactement la cicatrice `promise-and-schema-key-must-be-adjacent`,
   * réintroduite par un cas neuf le jour même où elle a été fermée.
   */
  referenced: boolean,
): readonly string[] {
  if (members.length < 2 && !referenced) return [];
  return [
    "== THE MEMBER IDS (household) ==",
    "Every member_id below is ONE of these exact strings, copied character for",
    "character. A first name is NEVER a member_id: two people can share one, and",
    "a plan that names people instead of ids is thrown away in full.",
    ...members.map((m) => `  ${m.memberId}  = ${m.displayName}`),
  ];
}

const PORTION_SCHEMA_BLOCK = [
  "== ADDITIONAL OUTPUT FIELD (household) ==",
  "Add ONE more top-level key to the JSON you return:",
  '  "member_portions": [',
  '    { "member_id": "<one of the ids listed just above>",',
  '      "portion_note": "how much of what goes on this plate",',
  '      "preparation_shares": [{ "preparation_id": "prep_x", "note": "..." }] }',
  "  ]",
  "One entry per person listed, using their EXACT member_id from that list.",
  "Serving",
  "instructions only — never a reason, a goal, a calorie count, or anything",
  "about a person's body.",
] as const;

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 4 — LA MOITIÉ SCHÉMA DU PROTOCOLE DES BOÎTES.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE PARTAGE EST CELUI DE `member_portions`, ET C'EST LE SEUL QUI MARCHE.
 * Ce bloc-ci dit qu'une clé EXISTE et quelle forme elle a; la CONSIGNE — peser
 * une fois, combien de bouches, et ce qui n'est pas une boîte — vit dans
 * `boxingOrderLines`, côté message utilisateur, à l'intérieur même du brief de
 * portions. `member_portions` a ces deux moitiés et il est rempli 100 % du
 * temps; `for_member_id` n'avait que celle-ci et il est resté à zéro sur douze
 * générations. On copie le patron qui marche.
 *
 * ⛔ ET IL N'EXISTE QU'À PARTIR DE DEUX BOUCHES, exactement comme
 * `boxingOrderLines`. Une seule bouche rend un `systemSuffix` byte-identique à
 * celui de v13, et un test le tient.
 *
 * ⚠️ SUR LE PLAT, ET SANS AUCUNE JOINTURE — DEPUIS LE 2026-08-19. Jusque-là une
 * boîte pendait à une préparation et une reprise la citait par `box_id`. Trois
 * défauts mesurés sur le run `76be8ce3` (8 boîtes sur 16 orphelines, une boîte
 * citée par 3 repas, un nom qui ne dit pas quand ouvrir) sont tous les trois des
 * conséquences de cette jointure-là, et aucun ne se répare en aval. Le repas
 * PORTE donc sa boîte: rien à rapprocher, rien à orpheliner, et l'étiquette
 * nomme le jour et le moment du plat qui la porte.
 *
 * ⚠️ ET SON CONTENU EST LE REPAS ENTIER. C'est un changement d'UNITÉ: hier un bac
 * par casserole, aujourd'hui un contenant par repas. Ne « répare » pas en
 * redemandant une boîte par préparation — c'est le contenant en moins qui est
 * voulu (`docs/keel/BOITES-PAR-REPAS.md`).
 */
function boxSchemaBlock(
  members: readonly { memberId: string; displayName: string }[],
  /**
   * ⛔ LES BOUCHES QUI ONT DROIT À UNE PORTION PESÉE — ET ELLES SEULES.
   *
   * Décision du 2026-08-19 (`docs/keel/BOITES-PAR-REPAS.md`): un objectif de
   * poids ouvre une portion millimétrée, `maintenance` n'ouvre rien.
   *
   * ⚠️ REQUISE, ET C'EST LA MOITIÉ « CONSIGNE » D'UNE GARDE QUI A DÉJÀ SA
   * MOITIÉ « PARSEUR » (`boxMemberIds`). Les deux doivent nommer la MÊME
   * liste: un prompt qui réclame une boîte pour tout le monde pendant que le
   * parseur n'en accepte que pour deux produit un plan amputé en silence —
   * c'est très exactement le défaut du jour, pris par l'autre bout.
   */
  weighed: readonly { memberId: string; displayName: string }[],
): readonly string[] {
  // ⚠️ LE PLANCHER EST REVENU, ET IL EST DOUBLE (v4, 2026-08-20). Le bloc sert
  // dès qu'il y a un GROUPE à former — donc dès deux bouches — ou dès qu'une
  // seule bouche a demandé une portion à elle. Un solo sans objectif n'a ni
  // groupe ni pesée: il rend un `systemSuffix` byte-identique, et un test le
  // tient.
  if (members.length < 2 && weighed.length === 0) return [];
  const names = weighed.map((m) => `${m.memberId} (${m.displayName})`).join(", ");
  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ CE QUE CE BLOC A CESSÉ DE DIRE LE 2026-08-20, MOT POUR MOT
  // ══════════════════════════════════════════════════════════════════════════
  //
  //     « Nobody else does. Everyone else eats from the shared dish, and their
  //       servings are never weighed, never named and never written down --
  //       leaving them out is the answer, not an omission. »
  //
  // C'était v3, et elle est RENVERSÉE, pas oubliée. Son défaut, mesuré devant
  // un frigo: « plat commun » ne disait ni combien de bacs remplir dimanche, ni
  // lequel ouvrir jeudi — elle ne décidait rien pour trois personnes sur
  // quatre. Ce qu'elle protégeait (« une personne qui se maintient ne reçoit
  // aucun grammage qu'elle n'a pas demandé ») est préservé AUTREMENT: son bac
  // porte une quantité de RÉCIPIENT, jamais un nombre qui la vise.
  const groupLines = names === ""
    ? [
      "Nobody here asked for a portion of their own, so a meal has exactly ONE",
      "box, with every person eating it named on the lid.",
    ]
    : [
      `These people each get a box of their OWN, alone on the lid: ${names}.`,
      "Everyone else eating that meal shares ONE box, named with all of them.",
    ];
  return [
    "== ONE BOX PER GROUP OF EATERS (household) ==",
    'Every dish that takes from a preparation carries one more key: "boxes" --',
    "one container per group of people eating that meal.",
    '  "boxes": [{ "id": "box_<day>_<slot>[_<name>]",',
    '              "member_ids": ["<id from THE MEMBER IDS, never a first name>"],',
    '              "items": [{ "preparation_id": "prep_x" or null,',
    '                          "term": "what is in it",',
    '                          "grams": <whole grams of READY food> }] }]',
    "Ids are lowercase ASCII, invented by you, and each one is used once in the",
    "whole plan. The grams are what goes IN the container once cooked, not the raw",
    "weight of the shopping. preparation_id is null when that item is added fresh",
    "on the day, so no batch holds it.",
    ...groupLines,
    // ⛔ LE SECOND CRITÈRE DE SÉPARATION, ET IL A LA MÊME FORME QUE LE PREMIER.
    // C'est un GROUPEMENT À L'ASSEMBLAGE, pas un retrait après coup: un bac dont
    // on retire un nom est un bac mal composé, et le parseur ne sait pas
    // fabriquer celui qui manque (il faudrait décider si ce qui reste est un
    // repas ou une assiette de riz).
    "If a dish carries something one person's food line refuses, that person gets",
    "their own box for it too. If nothing clashes, everyone shares the same one.",
    // ⚠️ « carries », JAMAIS « may carry ». La formulation permissive a été
    // mesurée le 2026-08-17 comme une permission qu'on décline — zéro
    // déclaration sur douze runs — et un test de ce fichier interdit désormais
    // la tournure dans tout le suffixe système.
    "One box holds that WHOLE meal for its group -- every preparation it takes",
    "from goes in the same container, not one tub per pan. A dish that cooks from",
    'scratch on the day has no "boxes": nothing was weighed ahead for it.',
    // ⛔ L'ÉCHAPPATOIRE MESURÉE, NOMMÉE — et ce n'est plus la même qu'hier.
    // Hier: peser la tablée entière. Aujourd'hui: écrire une part par personne
    // dans un bac partagé, ce qui remettrait la balance au service (c'est
    // exactement ce qui a tué v2). Le dire coûte deux lignes, et c'est le geste
    // le plus rentable de ce dépôt.
    "Do NOT write a per-person figure on a lid that carries several names: its",
    "grams describe the tub, not anybody's plate. And do NOT name the same person",
    "on two boxes of one meal.",
  ];
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT C — LE PLAT DÉDIÉ DIT À QUI IL EST.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE TROU QUE CE BLOC FERME, MESURÉ LE 2026-08-14. Un plat en base porte
 * `title, why, uses, method, slot, day, ingredients, honours_belief_keys` — et
 * AUCUNE attribution. Le seul marqueur qu'un plat était celui de Zoé était
 * « for Zoe » écrit dans le TITRE. La vue par personne montrait donc son plat
 * dédié dans la semaine de tout le monde.
 *
 * ── POURQUOI ON LE DEMANDE AU MODÈLE, ET POURQUOI C'EST SÛR ───────────────
 * Sur une case dédiée il y a DEUX plats: celui de la table et le sien. Lequel
 * est lequel n'est pas décidable de l'extérieur — c'est le modèle qui vient de
 * composer les deux. Et il copie DÉJÀ ces mêmes ids, dans le bloc juste
 * au-dessus (`member_portions[].member_id`), sur chaque plan de foyer écrit
 * depuis le pivot. Ce n'est donc pas un pari: c'est le même geste, une clé plus
 * loin.
 *
 * ⛔ ET LE BLOC N'EXISTE QUE QUAND UN PLAT DÉDIÉ EST RÉCLAMÉ. Servi à un foyer
 * au barreau ① — « Do NOT propose separate dishes » — il apprendrait au modèle
 * qu'un plat peut appartenir à quelqu'un, et l'inviterait à en marquer un. Une
 * consigne qui parle d'un marquage dans un prompt qui l'interdit est exactement
 * l'invitation qu'on veut éviter; c'est le raisonnement de `buildPortionBrief`
 * sur `anyHabit` et `anyRhythm`, mot pour mot.
 *
 * ── LOT 3C · DE LA PERMISSION À L'ORDRE, ET POURQUOI ──────────────────────
 * v12 écrivait « Every dish you return MAY carry one more key ». Mesuré sur les
 * douze générations servies en v12: zéro attribution retenue, et onze runs sur
 * douze n'ont même pas composé de second plat. Un champ facultatif décrit dans
 * le prompt système, sans un ordre au même endroit que la promesse, est un
 * champ que le modèle n'a aucune raison d'écrire — il a déjà dit la divergence
 * ailleurs, dans `member_portions`, qui lui est DEMANDÉ.
 *
 * Ce bloc reste la moitié SCHÉMA (il dit qu'une clé existe et ce qu'elle vaut).
 * La moitié CONSIGNE vit dans `dedicatedDishBlock`, côté message utilisateur,
 * collée au brief qui promet le plat — exactement le partage de
 * `PORTION_SCHEMA_BLOCK` / `buildPortionBrief`, qui est rempli 100 % du temps.
 */
function dishOwnerSchemaBlock(
  dishBearers: readonly { memberId: string; displayName: string }[],
): readonly string[] {
  if (dishBearers.length === 0) return [];
  return [
    "== WHOSE DISH IS IT (household) ==",
    'A dish can carry one more key: "for_member_id".',
    "The serving plan names the people who cannot be served from the shared pot",
    "and orders a dish of their own. EVERY one of those dishes MUST carry",
    '"for_member_id", set to that person\'s EXACT member_id. It is not optional:',
    "their dish without that key is served to the whole household by mistake,",
    "and the person it was cooked for never sees it.",
    "Leave it out of every dish the table shares — a dish with",
    "no for_member_id is the table's dish, and that is the normal case.",
    ...dishBearers.map((b) => `  ${b.displayName} = ${b.memberId}`),
  ];
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 3C — L'ORDRE, À CÔTÉ DE LA PROMESSE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE BLOC EXISTE PARCE QUE LA LIGNE DE FORME NE SUFFIT PAS, ET C'EST MESURÉ.
 * `cookingShapeLines` promet « at EVERY meal they eat here they get a dish of
 * their OWN » — cinq lignes au milieu d'un brief dont l'EN-TÊTE dit « one
 * cooking session, portions that differ » et dont la suite réclame une
 * instruction de service par personne. Sur douze runs, le modèle a tranché
 * onze fois pour l'en-tête: un plat, des parts qui diffèrent.
 *
 * ⚠️ ET LA LIGNE DE FORME RENVOIE À UN MARQUEUR QUI N'EXISTE PAS. « ONE person
 * below cannot be served from it (their line says so) » — la ligne visée dit
 * `- Théo: larger protein and starch share, same vegetables`, une part prise
 * dans la casserole commune. Ce bloc-ci est le marqueur manquant, et il porte
 * les mêmes ids que le bloc de schéma parce qu'ils viennent du même tableau.
 *
 * ⚠️ LA DERNIÈRE PHRASE EST LA PLUS IMPORTANTE. Elle nomme ce que le modèle a
 * réellement fait à la place — écrire la divergence dans `member_portions` —
 * et dit que ce n'est pas la même chose. Une consigne qui interdit sans nommer
 * la sortie qu'on prend à sa place est une consigne qu'on reprend.
 */
function dedicatedDishBlock(
  dishBearers: readonly { memberId: string; displayName: string }[],
  dedicatedDishesAsked: number,
): string {
  if (dishBearers.length === 0) return "";
  // LE NOMBRE VIENT DE L'APPELANT, ET IL EST LE MÊME QUE CELUI DU BUDGET. Un
  // plancher à 1 parce qu'un bloc qui réclame « 0 extra dishes » pendant que la
  // ligne de forme en promet un à chaque repas serait la contradiction que ce
  // fichier passe son temps à interdire.
  const asked = Number.isFinite(dedicatedDishesAsked)
    ? Math.max(1, Math.floor(dedicatedDishesAsked))
    : 1;
  return [
    "== A DISH OF THEIR OWN ==",
    "These people cannot be fed from the shared pot. At EVERY meal they eat",
    "here, write TWO dishes for that day and that slot: the table's dish, and a",
    "dish of their own — same cooking session, same shopping, different plate.",
    ...dishBearers.map((b) => `  ${b.displayName} = ${b.memberId}`),
    `That is ${asked} extra dish${asked > 1 ? "es" : ""} on top of the table's`,
    "meals, and the dish budget above already has room for them. Count them",
    "before you answer: a window where these people have no dish of their own is",
    "a window where they do not eat.",
    'Each of those dishes carries "for_member_id" set to the exact id above. The',
    "table's dish carries no such key.",
    "A line in member_portions is NOT one of these dishes: it says how much of a",
    "SHARED dish goes on a plate, and these people are not eating the shared",
    "dish. Writing them a serving instruction instead of a dish leaves them",
    "without a meal.",
  ].join("\n");
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT C ② — UNE BOUCHE QUI PORTE UNE RÈGLE, ET SON PRÉNOM.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La LISTE FERMÉE contre laquelle `why_rule_of` est validé. Elle est construite
 * par l'appelant, qui tient les trois provenances d'une règle (une contrainte
 * dure, un régime déclaré, une règle de maison) et le roster qui les nomme.
 *
 * ⚠️ ELLE NE DIT PAS LAQUELLE. Le prompt nomme déjà les contraintes dures avec
 * leur bouche, et le régime avec la sienne; répéter ici « Lubna: gluten » ferait
 * une SECONDE source pour un fait déjà écrit, et c'est celle qu'on regarde le
 * moins qui garderait l'ancienne valeur. Ce bloc-ci ne répond qu'à une question:
 * QUI, à cette table, a une règle dont un `why` pourrait se réclamer.
 */
export interface HouseholdRuleHolder {
  memberId: string;
  displayName: string;
}

/**
 * ⛔ LE DÉFAUT MESURÉ, ET IL EST DANS LA PROSE — PAS DANS LE PROMPT.
 *
 * Plan réel du 2026-08-19 (`05-qualite-foyer/plan-4`), foyer de quatre, une
 * seule allergie au gluten et elle est à Lubna. Le prompt l'attribue
 * correctement, en toutes lettres: `- Lubna: gluten — allergy, severity=medical`.
 * TROIS `dishes[].why` sur huit l'ont mise ailleurs:
 *
 *     "A high-protein, gluten-free meal designed specifically for Roxane's
 *      midday energy needs."
 *     "A quick, warm lunch for Roxane that avoids gluten and fits her
 *      portioning needs."
 *     "A warm, comforting dinner for Roxane that is entirely gluten-free."
 *
 * Roxane n'a aucune contrainte. Inoffensif sur ce plan-là — le gluten est
 * absent de TOUTE la table de toute façon, c'est la règle d'union — mais c'est
 * la même faiblesse qui, deux runs plus tôt sur un autre foyer, a mis 120 g de
 * traybake au pistachio dans la boîte de l'ALLERGIQUE en écrivant
 * l'avertissement sur l'assiette du voisin.
 *
 * ── POURQUOI DEUX MOITIÉS, ET PAS UNE ──────────────────────────────────────
 * ① LE `why` NE PORTE AUCUNE RÈGLE. C'est la correction, et elle est absolue:
 *    ce champ est rendu à l'écran sous le plat (`DishCard.tsx:211`), donc lu par
 *    toute la maison. Quatre runs sur quatre y ont écrit le régime ou la
 *    contrainte médicale de quelqu'un, dont DEUX en recopiant l'échappatoire du
 *    prompt elle-même (« one of the foods on your medical list »). Le prompt
 *    donnait cette formule pour NE PAS nommer l'allergène; il n'était écrit
 *    nulle part qu'elle ne devait pas finir sur la table non plus.
 * ② SI UNE RÈGLE PASSE QUAND MÊME, ELLE EST DÉCLARÉE ET ATTRIBUÉE. Sans ②, ①
 *    est une phrase de plus dans un prompt qui en compte trois cents, et sa
 *    désobéissance est MUETTE: un run où le modèle obéit et un run où il écrit
 *    la maladie cœliaque d'une adulte au dîner rendent exactement les mêmes
 *    octets d'instrumentation. Voir `countWhyRuleAttributions`.
 *
 * ⛔ ET PAS DE MATCHER. Chercher « gluten » ou « vegan » dans une prose que le
 * modèle rend en anglais, en français ou en néerlandais, avec ou sans négation,
 * est très exactement le geste que ce dépôt a payé douze faux positifs sur douze
 * (« laitue » ≠ « lait »). Le champ est DÉCLARÉ par le modèle et validé contre
 * la liste fermée ci-dessus — le patron de `for_member_id`, de `same_day` et de
 * `preparation_id`, qui fonctionnent en production.
 */
function whyRuleSchemaBlock(
  ruleHolders: readonly HouseholdRuleHolder[],
): readonly string[] {
  if (ruleHolders.length === 0) return [];
  return [
    "== WHOSE RULE IS IN A \"why\" (household) ==",
    'A dish can carry one more key: "why_rule_of".',
    "Set it ONLY when the dish's \"why\" still names somebody's diet, allergy,",
    "medical list or house rule. Its value is the EXACT member_id of the person",
    "that rule belongs to -- the one who would be harmed, never the person the",
    "dish happens to be for.",
    "Leave it out when the \"why\" names nobody's rule. That is the normal case,",
    "and it is the case this plan asks for.",
    ...ruleHolders.map((h) => `  ${h.displayName} = ${h.memberId}`),
  ];
}

/** LOT C ② — LA MOITIÉ CONSIGNE, dans le groupe des verrous. Voir ci-dessus. */
function whyRuleBlock(ruleHolders: readonly HouseholdRuleHolder[]): string {
  if (ruleHolders.length === 0) return "";
  return [
    "== WHAT A \"why\" IS ALLOWED TO SAY ==",
    "Every dish's \"why\" is shown under that dish to the WHOLE household. It",
    "says what the FOOD is: warm, quick, cheap, in season, it reheats, it uses",
    "up what is already there. That is all it ever says.",
    "It NEVER says whose diet, whose allergy, whose medical list or whose house",
    "rule made you pick it. Not the rule, not the family word for it, not the",
    'phrase "one of the foods on your medical list" -- that phrase exists so you',
    "can avoid naming a food to the STUDENT, and it is not a sentence to put on",
    "the table either.",
    "And you do not know whose rule it is beyond what is written above. On the",
    "plan this instruction was written for, three dishes explained that a meal",
    "avoided a food \"for\" a person who had no such constraint; the one person",
    "at that table who did have it was somebody else. A rule pinned on the wrong",
    "person is worse than a rule not mentioned: it is read out, it is wrong, and",
    "nobody in the room can correct it.",
    "If a \"why\" you wrote still names a rule, that dish MUST carry",
    "\"why_rule_of\" with the exact member_id of the person whose rule it is,",
    "from the list in the schema. A rule named at this table without that key",
    "is a rule nobody can check.",
  ].join("\n");
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT C ② — LE COMPTEUR, ET IL A TROIS NOMBRES PARCE QUE DEUX MENTENT.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `{déclaré, attribué}` rend le MÊME zéro pour « aucun `why` n'a nommé de
 * règle » — ce qu'on veut — et pour « le modèle ignore la clé » — ce qui rend la
 * consigne invérifiable. Les deux appellent des corrections opposées, et ce
 * dépôt a déjà payé ce zéro ambigu deux fois (`dish_owners`, `same_day`).
 *
 *   · `dishes`   — les plats de la RÉPONSE DU MODÈLE. Le dénominateur.
 *   · `declared` — ceux qui portent un `why_rule_of` non vide, avant validation.
 *   · `valid`    — ceux dont l'id est une bouche qui porte VRAIMENT une règle.
 *   · `refused`  — ceux dont l'id n'en est pas une. **C'est la mauvaise
 *                  attribution**, et c'est le nombre du défaut.
 *
 * ⚠️ LA POPULATION EST LA RÉPONSE DU MODÈLE, PAS LE PLAN GARDÉ, et le nom du
 * champ le dit. `dish_owner_counts` compte les plats survivants parce que sa clé
 * traverse le parseur; `why_rule_of` n'y entre pas — le parseur est le TRONC,
 * partagé avec la lane individuelle, et lui ajouter un paramètre requis
 * toucherait quinze fichiers de tests appartenant à quatre lots parallèles. Les
 * quatre nombres sont donc comptés sur la MÊME liste, ce qui est la seule
 * propriété qui compte pour qu'un compteur ne mente pas.
 *
 * ⚠️ `declared === valid + refused` EST UNE PROPRIÉTÉ QU'UN TEST VÉRIFIE, pas
 * une définition. Dériver `refused` de la soustraction est la cicatrice
 * `withheld`/`over_cap`: deux nombres du même objet, gonflé et dégonflé en sens
 * inverses, sans que rien n'échoue.
 *
 * ⚠️ NE REJETTE RIEN, NE RÉÉCRIT RIEN. Posture `for_member_id` / `same_day`: un
 * `why` mal attribué reste un plat qui se cuisine et se mange, et « on ne
 * répare jamais un plan à la main ». Ce module CONSTATE; ce qui se corrige est
 * le prompt.
 */
export interface WhyRuleCounts {
  dishes: number;
  declared: number;
  valid: number;
  refused: number;
}

export function countWhyRuleAttributions(
  rawJsonText: string,
  ruleHolders: readonly HouseholdRuleHolder[],
): { counts: WhyRuleCounts; issues: string[] } {
  const empty: WhyRuleCounts = { dishes: 0, declared: 0, valid: 0, refused: 0 };
  const text = String(rawJsonText ?? "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { counts: empty, issues: [] };
  let dishes: unknown;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    dishes = parsed?.dishes;
  } catch {
    // ILLISIBLE ⇒ ZÉRO PARTOUT, ET AUCUNE `issue`. Une réponse que ce module
    // n'arrive pas à relire est une réponse que `parseGeneratedMeal` a déjà
    // refusée en amont — la requête est morte avant d'arriver ici. Lever ferait
    // perdre un dîner pour un compteur.
    return { counts: empty, issues: [] };
  }
  if (!Array.isArray(dishes)) return { counts: empty, issues: [] };

  const holders = new Map(
    ruleHolders
      .map((h) => [String(h.memberId ?? "").trim(), String(h.displayName ?? "").trim()])
      .filter(([id]) => id.length > 0) as [string, string][],
  );
  const counts: WhyRuleCounts = { dishes: dishes.length, declared: 0, valid: 0, refused: 0 };
  const issues: string[] = [];
  for (let i = 0; i < dishes.length; i++) {
    const d = (dishes[i] ?? {}) as Record<string, unknown>;
    const declared = String(d.why_rule_of ?? "").trim();
    if (!declared) continue;
    counts.declared += 1;
    if (holders.has(declared)) {
      counts.valid += 1;
      // ⚠️ UNE `issue` MÊME QUAND L'ID EST BON, et c'est délibéré. Le bloc
      // demande qu'AUCUN `why` ne nomme de règle: un id valide veut dire « une
      // règle a bien été nommée, et au moins sur la bonne personne ». C'est
      // moins grave, ce n'est pas ce qu'on a demandé, et le taire ferait de la
      // consigne ① une phrase sans lecteur.
      issues.push(`why_rule_named:${declared}`);
    } else {
      counts.refused += 1;
      issues.push(
        `why_rule_of ${JSON.stringify(declared)} on dishes[${i}] is not a mouth ` +
          `that holds a rule at this table`,
      );
    }
  }
  return { counts, issues };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * L7 ① — CE QUE CETTE CUISINE N'A PAS.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE SEUL CHEMIN AUTORISÉ EST `missingKitchenTools()`, ET C'EST UNE DÉCISION
 * PRISE EN OUVRANT CE LOT. `hasKitchenTool()` rend `true | false | null`, mais
 * L2-B a MESURÉ le 2026-08-18 que `if (!hasKitchenTool(eq, "oven"))` compile
 * sans un mot (`deno check` exit 0, `deno lint` muet) et traite « jamais
 * demandé » comme « pas de four ». Or `select count(*) filter (where
 * practical_constraints ? 'kitchen_equipment')` rend **0 sur 175 comptes**:
 * écrire la forme naturelle retirerait le four et le congélateur à 100 % du
 * parc au premier plan. `missingKitchenTools()` rend `[]` tant que rien n'a été
 * déclaré — il n'a donc AUCUNE direction dangereuse, et aucun `!` ne peut en
 * tirer une interdiction que personne n'a énoncée.
 *
 * L'autre sortie — changer le type de retour de `hasKitchenTool` en
 * `"has" | "lacks" | "unknown"` — a été écartée: elle casse le contrat §3.2 que
 * L2-A a écrit pour ce lot, oblige à réécrire les tests du module d'un lot
 * voisin déjà commité, et ne rend rien de plus ici puisque ce fichier ne lit
 * jamais un outil isolément. Le sujet reste ouvert pour qui voudra armer le
 * compilateur; il n'est pas un prérequis de la consigne.
 *
 * ⚠️ `[]` ⇒ AUCUN BLOC, donc prompt byte-identique à v15. Un foyer qui n'a
 * jamais vu la question, un foyer qui a tout coché, une ligne illisible: les
 * trois rendent la même chose, et c'est le comportement d'avant ce lot.
 *
 * ⚠️ TROIS OUTILS ONT UNE CONSÉQUENCE ÉCRITE, LES QUATRE AUTRES SONT SEULEMENT
 * NOMMÉS. Le §2.1 de la conception le dit: `freezer`, `microwave` et `oven`
 * changent ce que le plan peut faire; l'air fryer, l'autocuiseur et le blender
 * affinent. Écrire une conséquence pour chacun coûterait sept lignes de prompt
 * sur une lane qui expire à quatre minutes, pour interdire des gestes que le
 * modèle propose de toute façon rarement.
 */
const TOOL_PROSE: Record<KitchenTool, string> = {
  oven: "an oven",
  stovetop: "a hob",
  microwave: "a microwave",
  freezer: "a freezer",
  air_fryer: "an air fryer",
  pressure_cooker: "a pressure cooker",
  blender: "a blender or food processor",
};

function kitchenBlock(
  equipment: readonly KitchenTool[] | null,
): { block: string; missing: readonly KitchenTool[] } {
  const missing = missingKitchenTools(equipment);
  // ⚠️ LA TRACE EST RENDUE PAR LA MÊME EXPRESSION QUE LE BLOC. Recalculer
  // `missingKitchenTools` chez l'appelant ferait deux idées de « ce qui a été
  // interdit », et c'est celle qu'on regarde le moins qui garderait l'ancienne.
  if (missing.length === 0) return { block: "", missing };
  const gone = new Set<KitchenTool>(missing);
  const lines = [
    "== THIS KITCHEN ==",
    `This household does not have: ${
      missing.map((tool) => TOOL_PROSE[tool]).join(", ")
    }.`,
    "Cook with what is left. Never write a preparation, a cooking session or a",
    "day-of gesture that needs one of these, and never suggest buying one.",
  ];
  if (gone.has("oven")) {
    lines.push(
      "No oven: nothing roasted, baked, or finished under a grill. The batch" +
        " comes out of a pan or a pot.",
    );
  }
  if (gone.has("freezer")) {
    lines.push(
      "No freezer: nothing is frozen, and nothing is cooked to be kept longer" +
        " than a fridge keeps it.",
    );
  }
  if (gone.has("microwave")) {
    // ⚠️ LA LIGNE DU MICRO-ONDES NOMME CE QUI RESTE, et ce qui reste dépend du
    // four. Écrire « a pan or an oven » à un foyer qui vient de déclarer ne pas
    // avoir de four serait une consigne qui se contredit trois lignes plus
    // haut — et un prompt qui se contredit est un prompt qu'on tranche au
    // hasard.
    lines.push(
      `No microwave: reheating means ${
        gone.has("oven") ? "a pan" : "a pan or the oven"
      }, so write that gesture and count the` + " minutes it really takes.",
    );
  }
  return { block: lines.join("\n"), missing };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * L7 ② — UN REPAS PRIS DEHORS N'EST PAS UNE ABSENCE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE BLOC EST COLLÉ AU BLOC DE PRÉSENCE, ET LA POSITION EST LA MOITIÉ DU
 * LOT. `presence.block` vient d'écrire « Nina not eating here -- cook for 3
 * instead of 4 » pour exactement ces cases: sans un mot juste après, un midi
 * dehors et une semaine de vacances sont, pour le modèle, le même fait. C'est
 * la leçon mesurée du LOT 3C — la promesse et la clé qui vivaient dans deux
 * souffles différents ont rendu zéro déclaration sur 291 plats — appliquée à
 * une consigne qui n'a pas de clé: on la met contre la phrase qu'elle corrige.
 *
 * ⛔ AUCUN NOMBRE ICI, ET C'EST UNE FRONTIÈRE, PAS UN OUBLI. « Vise autour de
 * 700 » appartient au lot qui sait le calculer (L8) et aux cinq portes de
 * `energy_gate.ts`. Un kcal écrit dans ce bloc traverserait le prompt sans
 * qu'aucune porte n'ait tourné — la clause C5 du contrat TCA, violée à
 * l'instant où la ligne est écrite. Ce bloc dit ce que le plan NE FAIT PAS,
 * jamais ce que la personne devrait manger.
 *
 * ⚠️ IL NE CHANGE NI `servings`, NI `householdAway`. Un « dehors » EST une
 * absence de la table: la casserole descend comme avant, et c'est
 * `resolveWindowPresence` qui en décide, pas ce bloc. Ce qui change est ce que
 * le produit DIT.
 *
 * ⚠️ VIDE QUAND PERSONNE NE MANGE DEHORS — le cas nominal, et le prompt est
 * alors celui de v15 au caractère près.
 */
function eatingOutBlock(
  members: readonly PortionMember[],
  eatingOut: ReadonlyArray<{ member_id: string; cells: MealCell[] }>,
): { block: string; mouths: number; cells: number } {
  const nothing = { block: "", mouths: 0, cells: 0 };
  if (eatingOut.length === 0) return nothing;
  const nameOf = new Map(members.map((m) => [m.memberId, m.displayName]));
  const lines: string[] = [];
  let cells = 0;
  for (const entry of eatingOut) {
    // UNE BOUCHE QUI N'EST PAS DANS LA LISTE DE CE PROMPT N'EST PAS NOMMÉE.
    // `members` porte les bouches composées; quelqu'un qui mange son propre
    // plan (prise de main) ou qui est absent toute la fenêtre n'y est pas, et
    // écrire un id nu à sa place ferait citer au modèle un identifiant qu'il
    // ne peut rapprocher de rien.
    const name = nameOf.get(entry.member_id);
    if (!name || entry.cells.length === 0) continue;
    cells += entry.cells.length;
    lines.push(
      `- ${name}: ${
        entry.cells.map((c) => `${dayProse(c.day)} ${OCCASION_PROSE[c.slot]}`)
          .join(", ")
      }`,
    );
  }
  if (lines.length === 0) return nothing;
  const block = [
    "== A MEAL EATEN OUT IS NOT AN ABSENCE ==",
    "These meals are eaten somewhere else, and they are already taken out of",
    "the numbers above:",
    ...lines,
    "Compose NOTHING there: no dish, no preparation, no line of shopping.",
    "But these people are not away. They eat, elsewhere, and they are back at",
    "the next meal here. So do NOT make another meal bigger to make up for it,",
    "do NOT move that meal to another day, and do NOT mention it -- not in a",
    "title, not in a method, not in a serving note.",
  ].join("\n");
  return { block, mouths: lines.length, cells };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * D6.2 (2026-09-03) — LA GAMELLE DOIT SE TRANSPORTER, ET TENIR FROIDE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LA PROMESSE QUI N'ÉTAIT PAS TENUE ─────────────────────────────────────
 * « Le déjeuner en semaine » demande trois choses: au bureau ? gamelle ou
 * dehors ? micro-ondes ? La branche `outside` a un effet (cinq midis
 * `eating_out`, écrits par la porte SQL). **`lunchbox` et `microwave` n'en
 * avaient AUCUN** — zéro lecteur, vérifié le 2026-09-03 — pendant que trois
 * commentaires du dépôt promettaient « le repas doit être transportable, et
 * bon froid s'il n'y a pas de micro-ondes ». Une question posée dont la
 * réponse ne change rien est pire qu'une question absente: elle apprend que
 * répondre ne sert à rien.
 *
 * ── CE QUE LE BLOC DIT, ET CE QU'IL NE DIT PAS ────────────────────────────
 * Il pose une contrainte de COMPOSITION sur un repas que le plan compose
 * quand même. Il ne retire aucun repas, ne change ni `servings` ni la
 * présence — la gamelle EST un déjeuner à la maison, préparé la veille.
 *
 * ⚠️ `microwave: null` N'EST PAS « non ». Sans réponse, on ne promet pas un
 * plat froid: on dit seulement qu'il doit se transporter. Fabriquer « bon
 * froid » sur un silence poserait une contrainte que personne n'a exprimée —
 * la même règle que `parseWorkLunch` applique déjà à la lecture.
 *
 * ⚠️ VIDE QUAND PERSONNE N'EMPORTE DE GAMELLE — le cas nominal, et le prompt
 * est alors celui de v22 au caractère près.
 */
export function workLunchBlock(
  members: readonly PortionMember[],
  workLunch: ReadonlyArray<{
    memberId: string;
    mode: string | null;
    microwave: boolean | null;
  }>,
): { block: string; mouths: number; cold: number } {
  const nothing = { block: "", mouths: 0, cold: 0 };
  if (workLunch.length === 0) return nothing;
  const nameOf = new Map(members.map((m) => [m.memberId, m.displayName]));
  const lines: string[] = [];
  let cold = 0;
  for (const entry of workLunch) {
    if (entry.mode !== "lunchbox") continue;
    // UNE BOUCHE QUI N'EST PAS DANS CE PROMPT N'EST PAS NOMMÉE — même règle
    // que `eatingOutBlock`: écrire un identifiant nu ferait citer au modèle un
    // id qu'il ne peut rapprocher de rien.
    const name = nameOf.get(entry.memberId);
    if (!name) continue;
    if (entry.microwave === false) {
      cold += 1;
      lines.push(`- ${name}: carried, and eaten COLD (no microwave there).`);
    } else {
      lines.push(`- ${name}: carried to work.`);
    }
  }
  if (lines.length === 0) return nothing;
  const block = [
    "== SOME WEEKDAY LUNCHES TRAVEL ==",
    "These people take their weekday lunch with them. Compose it as usual --",
    "it is still a meal from this plan -- but it has to survive the trip:",
    ...lines,
    "So for those lunches: nothing that must be assembled at the last minute,",
    "nothing that wilts or goes soggy in a box, and nothing that only works",
    "straight out of the pan. Where the line says COLD, the dish must be good",
    "cold: do not write a method that ends in reheating.",
  ].join("\n");
  return { block, mouths: lines.length, cold };
}

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
  /**
   * D4 — CE QUI A ÉTÉ COUPÉ DANS LES VOIX, nommément: une ligne retenue par la
   * garde de non-divulgation (`voice_line_withheld:<membre>:<motif>`), des
   * lignes tombées du plafond (`voice_over_cap:<membre>:<n>`).
   *
   * ⚠️ RENDU, PAS AVALÉ. Une troncature muette est un mensonge sur ce que le
   * modèle a vu: sans cette liste, « pourquoi ce plan ignore-t-il ce que j'ai
   * dit ? » n'a aucune réponse trois jours plus tard, et un plafond mal calibré
   * ressemblerait trait pour trait à un modèle distrait.
   */
  voiceIssues: string[];
  /**
   * Combien de titulaires ont réellement été entendus. Pour la trace et pour le
   * coût — un nombre qu'on ne journalise pas est un nombre que personne ne
   * verra doubler.
   */
  voicesHeard: number;
  /**
   * D4 — DES LIGNES, COMPTÉES LÀ OÙ ELLES PASSENT.
   *
   * ⚠️ RENDU PARCE QUE LE DÉRIVER DES `issues` A ÉTÉ MESURÉ FAUX. L'appelant
   * comptait des chaînes: une ligne retenue sur trois formes de surface valait
   * « 3 retenues », et deux lignes tombées au plafond valaient « 1 » (une seule
   * `issue`, qui portait `:2` dans son texte). Les deux nombres du même objet
   * étaient gonflé et dégonflé en sens inverses. `voiceIssues` reste la trace
   * NOMMÉE (qui, pourquoi); ces compteurs-ci sont la trace CHIFFRÉE, et
   * `linesUsed` est le seul nombre qui dise ce que le modèle a réellement vu.
   */
  voiceCounts: VoiceLineCounts;
  /**
   * LOT A — COMBIEN DE NOTES PAR BOUCHE LE BLOC A ÉCRITES. `0` = aucun bloc.
   * Rendu par le module qui écrit le bloc, jamais recompté par l'appelant.
   */
  notesServed: number;
  /**
   * L7 ① — CE QUE LE BLOC A RÉELLEMENT INTERDIT, dans l'ordre de la liste.
   *
   * ⚠️ RENDU PAR LE MODULE QUI ÉCRIT LE BLOC, et pas recalculé par l'appelant.
   * Deux lectures de `missingKitchenTools` divergeraient au premier `null` mal
   * propagé, et la trace dirait alors « on a interdit le four » sur un prompt
   * qui ne l'a jamais dit. Une seule expression, deux destinations — le
   * précédent est `dishOwnersTrace`.
   *
   * `[]` ⇒ aucun bloc servi. C'est le cas de 175 comptes sur 175 au
   * 2026-08-18: la question n'a jamais été posée.
   */
  kitchenMissing: readonly KitchenTool[];
  /**
   * L7 ② — COMBIEN DE BOUCHES ET COMBIEN DE CASES LE BLOC « DEHORS » A NOMMÉES.
   *
   * ⚠️ COMPTÉ SUR LES LIGNES ÉCRITES, pas sur `presence.eatingOut`. Une bouche
   * qui mange dehors mais qui n'est pas dans `members` (prise de main, absence
   * totale) est ignorée par le bloc: si la trace la comptait quand même, « le
   * modèle a ignoré la consigne » et « la consigne ne la nommait pas » se
   * liraient pareil, ce qui est exactement le zéro ambigu que le LOT 3C a payé.
   *
   * `{mouths: 0, cells: 0}` ⇒ aucun bloc servi.
   */
  eatingOut: { mouths: number; cells: number };
  /**
   * D6.2 — LE COMPTEUR DU BLOC DE LA GAMELLE, ET IL EST LA MOITIÉ DU LOT.
   *
   * `mouths` = les bouches NOMMÉES dans le bloc; `cold` = celles pour qui le
   * plat doit être bon froid (micro-ondes déclaré ABSENT). Comptés sur les
   * lignes ÉCRITES, pas sur l'entrée: c'est ce qui empêche la mesure de
   * mentir sur ce que le prompt a réellement dit — et c'est ce qui rend
   * visible un champ `workLunch` que l'appelant aurait oublié de passer.
   */
  workLunch: { mouths: number; cold: number };
  /**
   * LOT C ② — COMBIEN DE BOUCHES LE BLOC DES `why` A NOMMÉES.
   *
   * `0` ⇒ aucun bloc servi (personne ne porte de règle), et le prompt est alors
   * byte-identique à celui de v18. C'est le DÉNOMINATEUR de `why_rule_counts`
   * côté sortie: sans lui, « le modèle n'a rien déclaré » et « on ne lui a rien
   * demandé » rendent le même zéro, deux fois de suite.
   */
  whyRuleHolders: number;
  /**
   * ── C1 · CE QUE LE BLOC DE CONTAMINATION CROISÉE A FAIT, ET POURQUOI ─────
   *
   * ⛔ RENDU PAR LE MODULE QUI ÉCRIT LE BLOC, jamais recalculé par l'appelant:
   * deux évaluations des mêmes prémisses divergeraient, et la trace dirait
   * « on l'a demandé » sur un prompt qui ne l'a jamais dit.
   *
   * ⛔ ET IL PORTE SA RAISON, PAS UN BOOLÉEN. `emitted: false` seul rendrait le
   * même « non » pour « personne n'est à risque » et pour « la règle n'a pas
   * tourné ». C'est `outcome.skipped` qui les sépare, et c'est tout l'objet du
   * compteur à trois populations.
   *
   * ⚠️ `emitted` COMPTE UNE PHRASE ENVOYÉE, PAS UNE POÊLE LAVÉE. Voir
   * `cross_contact.ts`: on ne prouve pas depuis un JSON qu'un couteau a été
   * rincé, et ce champ ne prétend pas le contraire.
   */
  crossContact: CrossContactOutcome;
}

// ===========================================================================
// LOT A · « CE QUE SOPHIA SAIT », PAR BOUCHE — le bloc, et sa règle d'exception
// ===========================================================================

const NOTES_HEADER = [
  "== FACTS ABOUT THIS WEEK, PER PERSON ==",
  "What I know about these people that no other field carries — a rehearsal, a",
  "late dinner, a day that is not like the others. These are not preferences to",
  'weigh: honour them, or say in the "why" of the dish it affects that you could',
  "not, and what you did instead.",
] as const;

/**
 * ⛔ LA RÈGLE D'EXCEPTION EST DANS LE BLOC, COLLÉE AUX LIGNES. Cicatrice
 * `named-day-calendar-vs-model-prior`: nommer le jour ne suffit pas, le modèle
 * lisse les jours quand rien ne lui dit que ce jour-là est l'exception. Elle
 * est en PIED de bloc, après les lignes, parce que « la contrainte la plus
 * proche de la fin est lue comme la plus contraignante » — et ici c'est elle
 * qui doit gagner contre l'a priori d'une semaine régulière.
 */
const NOTES_FOOTER = [
  "When a line names a day or a meal, THAT day or THAT meal is the exception for",
  "THAT person: compose it differently from their other days — do not flatten it",
  "into the same box as the rest of the week.",
] as const;

/**
 * ⛔ CE QUE CE PIED DE BLOC A ESSAYÉ DE DIRE, ET QUI A ÉTÉ RETIRÉ APRÈS MESURE
 * (2026-09-03, banc du lot A, deux générations réelles de 7 jours).
 *
 * La note « Léa a danse le mardi soir, il lui faut un vrai repas » atteint le
 * prompt (`served=1`) et change ce que le modèle ÉCRIT — le « pourquoi » du
 * mardi disait « une soirée qui demande un vrai repas ». Elle ne change PAS les
 * grammes: Léa mangeait 350 g/bouche le lundi, le mardi et le mercredi.
 *
 * On a donc ajouté ici « donne-lui sa PROPRE boîte ce soir-là ». Résultat
 * mesuré au run suivant: le modèle a bien créé la boîte séparée… à **169 g**,
 * pendant que la boîte partagée du mercredi donnait **740 g/bouche**. La phrase
 * a rendu le mardi PLUS PETIT — l'inverse exact de ce que la note demande.
 *
 * ⚠️ LE MOTIF EST STRUCTUREL, PAS RÉDACTIONNEL, et c'est pour ça qu'on ne
 * retente pas une troisième formulation: **les grammes d'une boîte sont écrits
 * par le modèle**, et rien dans ce produit ne relie une note à un besoin
 * (cicatrice `grams-were-never-anchored-to-a-need`). Le levier des portions est
 * l'ENVELOPPE (`meal_envelope.ts`, destination ② de la nomenclature), qui est
 * par PERSONNE et n'a aucune dimension par JOUR. Une note ne peut donc pas
 * déplacer un grammage tant que ce levier n'existe pas.
 *
 * ⇒ Ce que le bloc tient aujourd'hui, et qui est vérifié: la note est SERVIE,
 * attribuée à sa personne, au jour nommé, et le modèle compose ce jour-là
 * différemment. Ce qu'il ne tient pas: le grammage. C'est un trou NOMMÉ
 * (rapport du lot A, §8.1 phrase 6), pas un lot débranché.
 */

/** Le bloc des notes par bouche. `""` quand il n'y en a aucune. */
function notesBlock(notes: readonly string[]): { block: string; served: number } {
  const lines = (notes ?? []).map((n) => String(n ?? "").trim()).filter((n) => n);
  if (lines.length === 0) return { block: "", served: 0 };
  return {
    block: [...NOTES_HEADER, "", ...lines.map((l) => `- ${l}`), "", ...NOTES_FOOTER]
      .join("\n"),
    served: lines.length,
  };
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
  const boxSchema = boxSchemaBlock(input.members, weighedPortionMembers(input.members));
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
    buildPortionBrief(
      input.members,
      input.cooking,
      input.divergingCount,
      input.weightGroups,
    ),
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
        ...PORTION_SCHEMA_BLOCK,
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
