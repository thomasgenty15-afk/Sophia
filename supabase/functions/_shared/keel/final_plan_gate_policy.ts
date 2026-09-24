// ═══════════════════════════════════════════════════════════════════════════
// LA GARDE FINALE DU PLAN — LES POLITIQUES (quelle cause refuse, répare, compte)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `final_plan_gate.ts` (découpage des gros
// fichiers, lot 2a). Aucune logique changée. `final_plan_gate.ts` ré-exporte
// les quatre politiques : les appelants continuent d'importer depuis lui.
//
// ⚠️ Les politiques sont CALCULÉES AU CHARGEMENT (`policyOf` parcourt
// `FINAL_GATE_CAUSES`). C'est pourquoi ce module lit `FINAL_GATE_CAUSES`
// directement dans `final_plan_gate_types.ts`, jamais dans
// `final_plan_gate.ts` : un import circulaire lirait une liste pas encore créée.

import {
  FINAL_GATE_CAUSES,
  type FinalGateCause,
  type GateSeverity,
} from "./final_plan_gate_types.ts";

// ---------------------------------------------------------------------------
// ④ LES TROIS POLITIQUES
// ---------------------------------------------------------------------------

function policyOf(
  overrides: Partial<Record<FinalGateCause, GateSeverity>>,
): Readonly<Record<FinalGateCause, GateSeverity>> {
  const out = {} as Record<FinalGateCause, GateSeverity>;
  for (const cause of FINAL_GATE_CAUSES) {
    out[cause] = overrides[cause] ?? "count";
  }
  return Object.freeze(out);
}

/**
 * LOT 1 — ON MESURE, RIEN NE MORD.
 *
 * ⛔ C'EST LE LOT QUI DOIT ÊTRE DÉPLOYÉ EN PREMIER, et pas par prudence : un
 * refus posé sans dénominateur mesuré refuserait des plans dont personne ne
 * sait s'ils sont fautifs. `ok` est TOUJOURS `true` sous cette politique,
 * refus listés compris.
 */
export const FINAL_GATE_POLICY_LOT_1: Readonly<
  Record<FinalGateCause, GateSeverity>
> = policyOf({});

/**
 * LOT 2 — LE NOYAU MORD. Les quatre défauts mesurés (① ③ ④) et l'invariant
 * « personne sans repas ». Les références pendantes se RÉPARENT plutôt que de
 * refuser : elles sont le résidu mécanique d'une mutation d'après-garde, et
 * les retirer rend un plan servable.
 */
export const FINAL_GATE_POLICY_LOT_2: Readonly<
  Record<FinalGateCause, GateSeverity>
> = policyOf({
  eaten_before_cooked: "refuse",
  eaten_too_late: "refuse",
  cell_without_dish: "refuse",
  mouth_unfed: "refuse",
  boxes_none_delivered: "refuse",
  table_exclusion_served: "refuse",
  regime_forbidden_component: "refuse",
  house_rule_served: "refuse",
  uses_dangling: "repair",
  box_item_dangling: "repair",
  session_cites_unknown: "repair",
  title_promises_missing_preparation: "repair",
  // ⛔ ÉCRIT, PAS HÉRITÉ DU DÉFAUT — parce que c'est un ARBITRAGE, pas un
  // oubli. Sous-nourrir une bouche est une question de QUALITÉ DE
  // COMPOSITION, pas une incohérence du plan : refuser là-dessus priverait
  // des gens de dîner sur un seuil (`ENERGY_SHORT_RATIO`) que personne n'a
  // encore calibré. On compte, on regarde la campagne, puis on tranche.
  mouth_energy_short: "count",
});

/**
 * LOT 3 — LES COURSES MORDENT AUSSI. C'est le défaut ② (le poisson acheté
 * trois jours trop tôt) et l'ingrédient qu'aucune ligne n'achète.
 *
 * `mouth_energy_short` reste en `count` ici aussi, pour la raison écrite au
 * lot 2 : le seuil n'est pas calibré.
 */
export const FINAL_GATE_POLICY_LOT_3: Readonly<
  Record<FinalGateCause, GateSeverity>
> = policyOf({
  ...FINAL_GATE_POLICY_LOT_2,
  perishable_bought_too_early: "refuse",
  ingredient_not_bought: "refuse",
  // ⟳ 2026-09-15 — `count` DÈS LE LOT 1, et jamais autre chose: voir son pavé
  // dans `FINAL_GATE_CAUSES`. Un achat en trop se retire, il ne jette pas un plan.
  ingredient_bought_unused: "count",
  mouth_energy_short: "count",
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 4 — ⟳ 2026-09-11 · LOT E. LES CAUSES DONT LE FAUX POSITIF EST FERMÉ.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⟳ 2026-09-12 · ÉTAPE C5 — ELLE EST BRANCHÉE. `generate-household-meal-v1`
 * la passe à son unique appel de `finalPlanGate`, et `FINAL_GATE_POLICY_LOT_1`
 * n'y est plus passé nulle part (épinglé dans les deux sens par
 * `plan_validation_wiring_test.ts` § ①). La note précédente disait « elle n'est
 * pas branchée, et c'est le point » ; elle est remplacée plutôt que gardée,
 * parce qu'une contrainte documentée survit à sa cause.
 *
 * ⛔ L'ORDRE A ÉTÉ TENU, ET IL EST MESURÉ. Le plan interdit d'« activer
 * globalement `FINAL_GATE_POLICY_LOT_3` pour obtenir un label plus strict » :
 * on corrige les faux positifs, PUIS on arme, cause par cause, celles dont le
 * dénominateur a été mesuré. Sur les onze sorties du transport contrôlé du
 * 2026-09-11 (`scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/`), les
 * douze causes armées ci-dessous valent ZÉRO sur dix ; la onzième (`gain`,
 * `ingredient_not_bought`) est un vrai manque d'achat — le faux positif de
 * pluriel est mort avec `covers()` au lot E.
 *
 * ⚠️ ET LA BRANCHE DE REFUS VIT APRÈS LA BOUCLE DE RÉPARATION, pas à l'endroit
 * de la garde : armer un `return` là où cette garde s'exécute aurait refusé le
 * PREMIER jet et rendu la réparation inatteignable.
 *
 * ⚠️ CE QUI EST ARMÉ ICI, ET CE QUI RESTE EN `count` :
 *
 * · `cell_without_portion` **refuse** — c'est le défaut ① du lot E, et il n'a
 *   aucun faux positif possible : « un plat est posé, personne n'a de portion »
 *   est lu sur les contenants écrits, pas sur de la prose. Une case sans repas
 *   n'est pas un plan livrable.
 * · `ingredient_short_bought` **refuse** — il ne peut sortir que d'une
 *   comparaison GRAMMES contre GRAMMES, des deux côtés chiffrés.
 * · `ingredient_not_bought` **refuse** — le faux positif de pluriel est mort
 *   avec `covers()`.
 * · une suffisance NON VÉRIFIABLE n'a **pas de cause du tout**, et c'est un
 *   arbitrage : un garde-manger déclaré sans quantité, un conditionnement non
 *   convertible ou un identifiant refusé produisent un **contrôle incomplet**,
 *   pas un écart du plan. Lui donner une cause aurait rempli `refusals[]` de
 *   lignes qui n'accusent personne — et refusé un plan pour le schéma de la
 *   base. Elle sort dans `counters.checked.shopping_unverified` et dans
 *   `finalGateDelivery().incomplete`.
 * · `cell_energy_off`, `day_energy_off`, `protein_floor_short`,
 *   `cell_energy_unmeasurable`, `mouth_energy_short` restent **`count`** :
 *   sous-nourrir est une question de QUALITÉ DE COMPOSITION, et refuser
 *   là-dessus priverait des gens de dîner. C'est l'arbitrage déjà écrit au
 *   lot 2 pour `mouth_energy_short`, appliqué aux quatre causes de la même
 *   famille. Elles font en revanche basculer la LIVRAISON en
 *   `deliverable_with_gaps` — voir `finalGateDelivery`.
 */
export const FINAL_GATE_POLICY_LOT_4: Readonly<
  Record<FinalGateCause, GateSeverity>
> = policyOf({
  ...FINAL_GATE_POLICY_LOT_3,
  // ════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-14 · BÊTA 1A — LES DEUX SEULES CAUSES ARMÉES DU LOT, ET ELLES
  //                SONT DES IMPOSSIBILITÉS, PAS DES PRÉFÉRENCES
  // ════════════════════════════════════════════════════════════════════════
  //
  // ⛔ `dedicated_dish_missing` REFUSE PARCE QU'IL N'Y A RIEN À MANGER. La
  // grille a établi que la casserole commune ne peut pas servir cette bouche;
  // sans plat à elle, le plan lui pose devant une assiette que sa ligne lui
  // interdit. C'est la définition même d'« essentiel » du contrat de bêta
  // (exclusions, attribution, présence), et le livrer serait livrer un
  // résultat incorrect comme utilisable.
  //
  // ⛔ `cell_two_table_dishes` REFUSE PARCE QUE DEUX REPAS CONCURRENTS SERVENT
  // LA MÊME BOUCHE DEUX FOIS. Sur le chemin en BOÎTES, ces plans tombaient
  // déjà — sous le nom `mouth_unfed / double`, c'est-à-dire sous la
  // CONSÉQUENCE (chaque bouche nommée sur deux couvercles) au lieu de la
  // CAUSE; la consigne de réparation partait donc corriger des couvercles.
  //
  // ⚠️ MAIS CE N'EST PAS QU'UN RENOMMAGE, ET IL FAUT LE DIRE: sur une case
  // dont AUCUN des deux plats ne porte de boîte, `mealsDelivered` ne comptait
  // aucun couvercle en double et le plan passait. Cette cause-là refuse donc
  // des plans qui passaient hier — c'est exactement le point ⑦ de la clôture
  // (« rien ne les retire »), et une épreuve du banc le montre.
  //
  // ⚠️ `own_meal_dish_missing` RESTE À `count` PAR DÉFAUT, et il n'est pas
  // écrit ici exprès: la seule façon de le passer bloquant serait de le nommer,
  // et le plan de bêta l'interdit — « une préférence de variété ne devient pas
  // automatiquement bloquante ».
  dedicated_dish_missing: "refuse",
  // ══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-19 — LA COMPLÉTUDE SE RÉPARE, PUIS SE LIVRE NOMMÉE.
  //               ELLE NE JETTE PLUS LE PLAN.
  // ══════════════════════════════════════════════════════════════════════
  //
  // DÉCISION PRODUIT, dite deux fois par l'utilisateur et mesurée avant de
  // l'écrire : « le plan doit être généré ; ce qui compte, c'est qu'il soit
  // généré ». Sur le foyer `fagenty` (3 bouches, 6 moments, 42 cases, 38 plats
  // à soi), avec la consigne en checklist déjà servie : **3 plans livrés sur
  // 5**. Les deux refus étaient de CETTE famille et d'elle seule — une case
  // vide, une case où seul le plat d'une personne est posé, une case où deux
  // plats de table servent tout le monde deux fois. Le modèle sous-produit ou
  // sur-produit, et deux appels de réparation ne suffisent pas toujours.
  //
  // ⛔ CE QUE CHANGE `count` ICI, ET CE QUE ÇA NE CHANGE PAS.
  //   · La garde MESURE toujours ces quatre causes : elles sortent dans
  //     `refusals[]`, donc dans `gaps`, donc dans `planValidationRecord` et à
  //     l'écran (« Ce plan est utilisable, et voici ce qu'il ne tient pas »),
  //     case et personne nommées. La revue C6 § 5 interdit de « choisir entre
  //     tout refuser et masquer le manque » : on ne masque rien.
  //   · La RÉPARATION continue de les chasser tant qu'il reste du budget —
  //     `CHASED_CAUSES` (`plan_repair_loop.ts`) et `mustRepair` dans la passe.
  //     Sans ça, la bascule aurait SUPPRIMÉ les appels de réparation sur les
  //     trous (« seul un défaut bloquant fait partir un appel ») et livré
  //     plus de trous qu'avant, pas moins.
  //   · Ce qui BLOQUE encore est la sécurité (allergène, exclusion, régime,
  //     règle de maison), une bouche que la casserole ne peut pas nourrir et
  //     qui n'a rien (`dedicated_dish_missing`), et les impossibilités de
  //     calendrier. Une case trouée se corrige par `edit_cells` ; une
  //     assiette interdite ne se corrige pas après coup.
  //
  // ⚠️ `cell_without_dish` et `mouth_unfed` sont ÉCRITES ici parce que le lot
  // 2 les arme et que ce lot-ci hérite du lot 2 : un `count` implicite les
  // aurait laissées à `refuse`.
  cell_without_dish: "count",
  mouth_unfed: "count",
  cell_without_portion: "count",
  cell_two_table_dishes: "count",
  cell_energy_unmeasurable: "count",
  cell_energy_off: "count",
  // ⟳ 2026-09-12 · LOT 2 — voir le pavé `cell_bounds_off` dans
  // `FINAL_GATE_CAUSES`: tant qu'elle n'est pas dans la liste protégée des
  // DEUX côtés, elle ne doit pas pouvoir atteindre le corps 422.
  cell_bounds_off: "count",
  day_energy_off: "count",
  protein_floor_short: "count",
  protein_ceiling_over: "count",
  // ════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · LOT 2 — LES DEUX CAUSES D'ACHAT PASSENT EN `count`,
  // ET ELLES RESTENT COMPTÉES
  // ════════════════════════════════════════════════════════════════════════
  //
  // ⛔ C'EST UN ARBITRAGE DE LIVRAISON DÉJÀ TRANCHÉ, PAS UN ASSOUPLISSEMENT
  // DE MESURE. La décision écrite: « après deux réparations infructueuses,
  // livrer la meilleure version sûre et complète avec ses écarts signalés;
  // une portion obligatoire absente ou dangereuse empêche l'activation ».
  // Ce qui bloque reste donc la SÉCURITÉ (allergène, exclusion médicale,
  // règle de maison, régime) et `cell_without_portion`.
  //
  // ⛔ ET LA REVUE C6 § 5 INTERDIT L'AUTRE LECTURE: « la solution n'est pas de
  // choisir entre tout refuser et masquer le manque ». Ces deux causes
  // continuent de sortir dans `refusals[]`, dans `gaps`, dans
  // `planValidationRecord.defects` et dans les défauts de réparation — on
  // mesure toujours l'omission INITIALE du modèle. Ce qui change est qu'elle
  // ne jette plus un plan que le lot 1 (reconstruction déterministe des
  // achats) rend structurellement complet.
  //
  // ⚠️ LES DEUX TIRS REFUSÉS DE LA CAMPAGNE DU 2026-09-11 (n° 1 et n° 3) l'ont
  // été SUR CES DEUX CAUSES, et le tir n° 1 était un FAUX refus d'identité.
  // Un plan entier jeté pour une ligne d'achat que le moteur sait recalculer
  // est le pire des deux mondes.
  ingredient_not_bought: "count",
  ingredient_short_bought: "count",
  // ════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · LOT 3 — ON NE REFUSE PAS LE PLAN DE QUELQU'UN POUR UNE
  //                DATE QUE C'EST NOUS QUI AVONS CHOISIE
  // ════════════════════════════════════════════════════════════════════════
  //
  // ⛔ `buy_on` N'EST PAS ÉCRIT PAR LE MODÈLE. Il est calculé par
  // `buyDatesByIndex` (`grocery_waves.ts`), c'est-à-dire par NOUS. Cette cause
  // accuse donc notre propre ordonnancement des courses — et y répondre par un
  // refus fait payer à la personne une décision qu'elle n'a pas prise. Ce qu'il
  // faut faire d'une vague mal placée, c'est la REPLACER, pas jeter six repas.
  //
  // ⛔ ET SON FAUX POSITIF EST MESURÉ, SUR UN TIR RÉEL. Le 2026-09-12, tir 3 :
  // « thon en conserve acheté le 2026-09-12, tenu 1 jour, attendu cuisiné le
  // 2026-09-14 — sans congélation ». Une boîte de thon se garde des années. Le
  // rayon venait du groupe `white_fish`, que `tuna_tinned` partage avec
  // `tuna_fresh`. La classification est corrigée à sa source
  // (`SHELF_STABLE_SLUGS`) ; cette sévérité-ci est la seconde ceinture.
  //
  // ⚠️ LA CAUSE RESTE COMPTÉE, ET ELLE RESTE UTILE : du poisson FRAIS acheté
  // trois jours avant sa cuisson sans congélation est un vrai sujet.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · FERMETURE LOT 2 — ELLE EST RÉARMÉE, ET LE FAUX POSITIF EST
  //                MORT À SA SOURCE
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ « LA DATE VIENT DE NOUS » JUSTIFIE DE LA CORRIGER, PAS DE SERVIR LE
  // RÉSULTAT. C'est la correction que la revue du 2026-09-12 demande en toutes
  // lettres : « pour un produit effectivement périssable, il faut déplacer
  // l'achat, adapter la cuisson/congélation si le plan le permet, puis
  // contrôler à nouveau. Une impossibilité de conservation non résolue ne
  // satisfait pas la règle de livraison d'un plan sûr. »
  //
  // ⛔ ET CE QUI A CHANGÉ DEPUIS LE PASSAGE EN `count` EST LA CAUSE DU FAUX
  // POSITIF, pas la sévérité. La datation et cette garde lisent désormais la
  // MÊME conservation (`keepingOf`, `food_keeping.ts`) : une conserve n'a plus
  // de fenêtre des deux côtés, et une fenêtre qui mord ici est une
  // incompatibilité RÉELLE — `buyOn = max(début, cuisson − fenêtre)` la rend
  // impossible par construction tant que la ligne est datée.
  //
  // ⚠️ UNE CONSERVATION INCONNUE NE REFUSE PAS. Elle sort `keeping_unknown_lines`
  // et ne passe jamais par ce refus : accuser ce qu'on n'a pas su lire est la
  // faute symétrique.
  perishable_bought_too_early: "refuse",
});
