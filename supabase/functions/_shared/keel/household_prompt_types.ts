// ═══════════════════════════════════════════════════════════════════════════
// LE PROMPT DU FOYER — CE QUI ENTRE ET CE QUI SORT (types seuls)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `household_meal_generation.ts` (découpage
// des gros fichiers, lot 2c). Aucun champ changé. `household_meal_generation.ts`
// ré-exporte ces quatre types : les appelants continuent d'importer depuis lui.
//
//   · `HouseholdPromptInput`, `HouseholdMergePrompt`, `HouseholdUnmergePrompt` :
//     ce que `buildHouseholdPromptBlocks` reçoit ;
//   · `HouseholdPromptBlocks` : ce qu'il rend.
//
// Ce module ne contient que des types et n'importe que des types.

import type { CookingShape, PortionMember } from "./household_portions.ts";
import type { CrossContactMouth, CrossContactOutcome } from "./cross_contact.ts";
import type { WindowPresence } from "./household_presence.ts";
import type { HouseholdTradition } from "./household_traditions.ts";
import type { KitchenTool } from "./kitchen_equipment.ts";
import type {
  MergeMaterialDish,
  PlanSpan,
  ShownPlanGap,
} from "./household_merge.ts";
import type { RawMemberVoice, VoiceLineCounts } from "./household_voices.ts";
import type { RepairHouseholdContext, SideCourseAsk } from "./side_courses_types.ts";
import type { SideCoursesPromptCounts } from "./side_courses_prompt.ts";
import type {
  DecidedBeforeYou,
  HouseholdRestriction,
} from "./household_standard_recipe.ts";
import type { PreferenceSplit } from "./household_prompt_blocks.ts";
import type { HouseholdRuleHolder } from "./household_why_rule.ts";

export interface HouseholdPromptInput {
  members: readonly PortionMember[];
  /**
   * ⟳ 2026-09-04 — LES FAITS DÉJÀ TRANCHÉS, pour que la prose du modèle ne les
   * réexplique pas de travers.
   *
   * ⚠️ OPTIONNEL, ET POUR LA MÊME RAISON QUE `workLunch` juste en dessous: ce
   * type est construit par des dizaines de littéraux de fixture. La cicatrice
   * « paramètre optionnel = garde désarmée » est compensée par les deux mêmes
   * mécanismes qu'elle: un COMPTEUR (`explanation.asked`, écrit sur chaque
   * ligne, y compris à `false`) et un test de câblage qui lit la source de la
   * lane. Un appelant qui l'oublie produit le `userSuffix` de v25, octet pour
   * octet — et le compteur le dit.
   */
  readonly decided?: DecidedBeforeYou | null;
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
  /**
   * ⟳ 2026-09-23 — LES À-CÔTÉS QUE LE MOTEUR DEMANDE AU MODÈLE (flux A,
   * `planSideCourses`): une ligne par personne, jour et moment qui porte au
   * moins un à-côté.
   *
   * ⚠️ OPTIONNEL, ET C'EST LE PRÉCÉDENT DE CE FICHIER, PAS UN CONFORT. Ce type
   * est construit par des dizaines de littéraux de fixture — dont
   * `meal_boxes_test.ts`, typé sans `as any`, qu'un champ requis casserait hors
   * du périmètre de ce lot. `decided`, `workLunch` et `preferenceSplits` ont
   * fait le même choix pour la même raison.
   *
   * ⛔ ET LA CICATRICE « paramètre de garde optionnel = garde désarmée » EST
   * COMPENSÉE PAR SON COMPTEUR: `HouseholdPromptBlocks.sideCourses` rend
   * `given` (reçus), `prompt_asked` (écrits), `cells` et `unplaced`, TOUS même à
   * zéro. Un appelant qui oublie le champ produit `given: 0` sur un plan qui
   * aurait dû porter des à-côtés, et le test de câblage de la lane
   * (`side_courses_wiring_test.ts`, vague 2) lit la source.
   *
   * Omis ou `[]` ⇒ aucun bloc, et le prompt ne porte aucun à-côté.
   */
  readonly sideCourses?: readonly SideCourseAsk[];
  /**
   * ⟳ 2026-09-06 — LES PAIRES « X VEUT CE QUE Y REFUSE ». Mesuré (rapport 0f
   * §10) : « Léa n'aime pas les asperges, Marc adore » → au plan suivant le
   * modèle évite l'asperge pour toute la table. Une paire = un terme, ceux qui
   * le veulent, ceux qui le refusent ; le bloc demande le composant SÉPARÉ par
   * boîte. Optionnel : sans paire, le prompt est celui d'hier au caractère près.
   */
  readonly preferenceSplits?: readonly PreferenceSplit[];
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
  /**
   * ⟳ 2026-09-23 — LA LIGNE « À ÉVITER »: les aliments beaucoup revenus dans
   * les deux derniers plans (`avoidLineOf`, `plan_avoid_list.ts`). Écrite
   * JUSTE APRÈS l'envie, qu'elle cite (« above »). Absente, `null` ou vide ⇒
   * la consigne est identique à l'octet près à celle d'avant ce lot.
   */
  avoidLine?: string | null;
  /**
   * ⟳ 2026-09-24 — LES PLATS REFUSÉS (« Remplacer » sur un aperçu), avec les
   * personnes à qui ne plus les servir (`rejectedDishesLine`,
   * `rejected_dishes.ts`). Écrite JUSTE APRÈS la ligne « à éviter ». Absente,
   * `null` ou vide ⇒ la consigne est identique à l'octet près à celle d'avant.
   */
  rejectedDishesLine?: string | null;
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
  /**
   * ⟳ 2026-09-07 — QUEL CHEMIN DE DIMENSIONNEMENT (lot 3 du plan solo).
   *
   * ⛔ REQUIS. Le prompt CHANGE DE FORME selon ce verdict; un `?` ferait servir
   * la forme v32 à un moteur qui attend une recette standard, c'est-à-dire les
   * deux moitiés d'un même lot désaccordées en production.
   */
  sizingPath: "portion_v1" | "legacy_measure";
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

export interface HouseholdPromptBlocks {
  /**
   * ⟳ LOT 11 (2026-09-07) — LA STRUCTURE SERVIE DIT SON NOM.
   *
   * ⛔ REQUIS, ET RENDU PAR LE CONSTRUCTEUR, JAMAIS LU DEPUIS LA LANE. Deux
   * constructeurs coexistent désormais — celui-ci (blocs empilés, v33) et
   * `household_prompt_v34.ts` (cartes, calendrier, méthode) — et le MÊME foyer
   * peut recevoir l'un ou l'autre selon le chemin de dimensionnement. Une
   * version lue depuis `index.ts` dirait le code déployé; celle-ci dit ce que
   * le modèle a RÉELLEMENT reçu, et c'est la seule qui permette de relire une
   * ligne en base trois jours plus tard.
   */
  promptVersion: string;
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
  /** ⟳ 2026-09-23 — la ligne « à éviter » est-elle entrée dans le prompt ? */
  avoidLineUsed: boolean;
  /** ⟳ 2026-09-24 — la ligne des plats refusés est-elle entrée dans le prompt ? */
  rejectedLineUsed: boolean;
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
  /**
   * ⟳ 2026-09-23 — CE QUE LA CONSIGNE A ÉCRIT DES À-CÔTÉS, compté là où c'est
   * écrit (la ligne du calendrier en v34, la ligne du jour en v33).
   *
   * ⛔ C'EST LE COMPTEUR QUI COMPENSE `HouseholdPromptInput.sideCourses?`. À
   * recopier tel quel dans `generated_from.household.side_courses` (clés en
   * snake_case, prêtes à écrire). `prompt_asked` est le dénominateur de
   * `declared` côté modèle: sans lui, « le modèle n'a rien rendu » et « on ne
   * lui a rien demandé » se relisent pareil.
   */
  sideCourses: SideCoursesPromptCounts;
  /**
   * ⟳ 2026-09-23 — CE QUE LA RÉPARATION D'UN PLAN REÇOIT DU FOYER (flux G,
   * `planRepairMessage`): les fiches, les notes, la recette de référence et la
   * répartition des à-côtés, TELLES QUE CE CONSTRUCTEUR LES A ÉCRITES.
   *
   * ⛔ RENDU PAR LE CONSTRUCTEUR, JAMAIS REFAIT PAR LA LANE. La réparation
   * parlait au modèle sans les fiches ni la recette (lot 4 de l'audit): elle
   * corrigeait une densité sans savoir pour qui. Une seconde rédaction de ces
   * blocs côté réparation divergerait au premier ajustement de la consigne.
   *
   * `""` pour un bloc que ce constructeur n'a pas servi (pas de note, chemin
   * `legacy_measure` sans recette, aucun à-côté).
   */
  repairContext: RepairHouseholdContext;
}
