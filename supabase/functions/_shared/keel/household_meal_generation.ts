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
} from "./household_portions.ts";
import { buildEnvyBlock } from "./household_envies.ts";
import type { WindowPresence } from "./household_presence.ts";
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
export const HOUSEHOLD_PROMPT_VERSION = "v15_one_box_each_and_a_number";

export interface HouseholdRestriction {
  memberId: string;
  memberDisplayName: string;
  label: string;
}

export interface HouseholdPromptInput {
  members: readonly PortionMember[];
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
 * ⚠️ `box_id` SUR `uses`, PAS UNE SECONDE LISTE. Le plat dit déjà de quel lot il
 * prend (`uses[].preparation_id`); la boîte est une précision sur cette même
 * reprise. En faire un champ à part du plat obligerait à tenir deux jointures
 * d'accord, et c'est celle qu'on regarde le moins qui garderait l'ancienne.
 */
function boxSchemaBlock(
  members: readonly { memberId: string; displayName: string }[],
): readonly string[] {
  if (members.length < 2) return [];
  return [
    "== BOXES, ON EVERY PREPARATION (household) ==",
    'Each preparation carries one more key: "boxes".',
    '  "boxes": [{ "id": "box_<preparation>_<name>",',
    '              "member_ids": ["<exact ids from the list above>"],',
    '              "grams": <whole grams of READY food in that box> }]',
    "Ids are lowercase ASCII, invented by you, and each one is used once in the",
    "whole plan. The grams are what goes IN the box once cooked, not the raw",
    "weight of the shopping.",
    // ⚠️ « carries », JAMAIS « may carry ». La formulation permissive a été
    // mesurée le 2026-08-17 comme une permission qu'on décline — zéro
    // déclaration sur douze runs — et un test de ce fichier interdit désormais
    // la tournure dans tout le suffixe système.
    'A dish that eats from a box says so: each entry of its "uses" then carries',
    '"box_id", set to that exact box id. A box can only be cited by a meal on or',
    "after the day its preparation is cooked.",
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
  const dishOwner = dishOwnerSchemaBlock(input.dishBearers);
  // LOT 4 — LA MOITIÉ SCHÉMA DES BOÎTES. Même prémisse que sa moitié consigne
  // (`boxingOrderLines`, dans le brief): deux bouches au moins. Un foyer d'une
  // seule rend les deux vides, et le prompt est celui de v13 au caractère près.
  const boxSchema = boxSchemaBlock(input.members);

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
      : "Exact ids to use in member_portions and in every preparation's boxes:",
    ...idLines,
    "",
    // LA FORME DE CUISINE VIENT DE L'APPELANT, ET DE LUI SEUL (G5). Elle
    // valait `input.merge?.shape ?? "one_dish"`, et cette ligne-là clouait
    // toute composition ordinaire au barreau ① sans que rien ne le dise.
    buildPortionBrief(input.members, input.cooking, input.divergingCount),
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
    envyBlock,
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
  ].filter((p) => p && p.trim().length > 0);

  return {
    userSuffix: `\n\n${parts.join("\n\n")}`,
    // LOT C — LE BLOC D'ATTRIBUTION REJOINT LE SCHÉMA, et il n'existe que
    // quand un plat dédié est réclamé (voir `dishOwnerSchemaBlock`).
    systemSuffix: `\n\n${
      [
        ...PORTION_SCHEMA_BLOCK,
        // LOT 4 — LE SCHÉMA DES BOÎTES REJOINT LE SCHÉMA DES PORTIONS, et il
        // vient JUSTE APRÈS lui: les deux disent « qui reçoit combien », l'un en
        // prose lue à table, l'autre en grammes sur un couvercle. Les séparer
        // par l'attribution des plats ferait lire la boîte comme une précision
        // du plat dédié, alors qu'elle porte sur TOUTE préparation.
        ...(boxSchema.length === 0 ? [] : ["", ...boxSchema]),
        ...(dishOwner.length === 0 ? [] : ["", ...dishOwner]),
      ].join("\n")
    }`,
    envyLineUsed: envyBlock.length > 0,
    voiceIssues: voices.issues,
    voicesHeard: voices.heard.length,
    voiceCounts: voices.counts,
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
