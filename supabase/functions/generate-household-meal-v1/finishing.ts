// ═══════════════════════════════════════════════════════════════════════════
// GENERATE-HOUSEHOLD-MEAL-V1 — LA FINITION : ARRONDI, BORNES, CONTRÔLE FINAL
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti de `handle` (`index.ts`, découpage des gros fichiers,
// lot 3b). Le CORPS de chaque fonction est le texte d'origine, octet pour
// octet, indentation comprise (il garde les six espaces qu'il avait dans
// `handle` : des tests comparent les espaces). Seules la signature et, pour
// `portionBoundaryOf`, la dernière ligne `return` sont neuves. Les variables
// que le bloc lisait dans `handle` arrivent en paramètres, sous le MÊME nom.
//
// ⛔ CES FONCTIONS MUTENT CE QU'ON LEUR PASSE, EXACTEMENT COMME AVANT :
// `meal` (quantités arrondies, grammes des contenants rabotés, groupe posé
// sur chaque item) et `issues` (les défauts qui partent à la réparation).
// Ce sont les mêmes objets que ceux de `handle`, dans le même ordre.
//
// Le long commentaire qui dit POURQUOI chaque étape est à sa place est resté
// dans `handle`, au-dessus de l'appel : c'est là que se lit l'ordre.
// Ce module n'importe jamais `index.ts` et n'a aucun effet au chargement.

import {
  type CompositionIndex,
  resolveCompositionLine,
} from "../_shared/keel/food_composition.ts";
import {
  type GeneratedDish,
  type GeneratedMeal,
  type MealPreparation,
  regramMeal,
} from "../_shared/keel/meal_generation.ts";
import { measurePreparation } from "../_shared/keel/preparation_mass.ts";
import {
  planQuantityLines,
  roundQuantityLines,
  type UnitGramsOf,
} from "../_shared/keel/quantity_render.ts";
import { densityFromComposition } from "../_shared/keel/box_densify.ts";
import {
  type BoundedBoxItem,
  fitPortionsToBounds,
  // ⟳ 2026-09-23 — LE RABOTAGE SUIT L'OBJECTIF (lot 5): chaque item porte sa
  // densité et son drapeau féculent, lus au même endroit que son groupe.
  isStarchItemGroup,
} from "../_shared/keel/portion_boundary.ts";
import type { FoodGroupRef } from "../_shared/keel/tokens.ts";
import {
  // ⟳ 2026-09-11 · LOT E — LE CONTRÔLE FINAL DU LOT B. Il relit les grammes
  // ÉCRITS dans chaque contenant, sans aucune exception de population: c'est
  // lui qui aurait attrapé les 727 g servis contre un plafond de 700.
  finalPortionCheck,
  type PlateBounds,
} from "../_shared/keel/portion_sizing.ts";
import type { StarchGoal } from "../_shared/keel/starch_side.ts";

/**
 * ⟳ C2 — L'ARRONDI AU PLUS PROCHE (`const quantityRounding` de `handle`).
 * Mute `meal` (quantités, puis `regramMeal`) et pousse ses défauts dans `issues`.
 */
export function quantityRoundingOf({
  composition,
  meal,
  issues,
  userId,
  requestId,
  POT_IDENTITY_MARGIN,
}: {
  composition: CompositionIndex | null;
  meal: GeneratedMeal;
  issues: string[];
  userId: string;
  requestId: string;
  POT_IDENTITY_MARGIN: number;
}) {
      // ⛔ LE POIDS D'UNE PIÈCE VIENT DU RÉFÉRENTIEL, PAR LE RÉSOLVEUR DE
      // PRODUCTION. `resolveCompositionLine` — celui qui fait autorité sur
      // l'identité d'une ligne depuis le lot A — et pas un second résolveur.
      // Il ne sert QU'AU CAS ZÉRO: quand « l'entier le plus proche » d'une
      // pièce vaut 0 (mesuré: 8 lignes du banc, dont 7 citrons à « la moitié
      // d'un citron » = 0,46), le référentiel donne 60 g pour `lemon` et 10 g
      // pour `stock_cube`, et la ligne devient « 28 g de citron ». ⛔ Aucune
      // conversion inventée: sans `unit_grams`, la ligne n'est PAS touchée,
      // elle est NOMMÉE, et le cas part à la réparation.
      const unitGramsOf: UnitGramsOf = (line) =>
        resolveCompositionLine(composition, {
          term: String(line.term ?? ""),
          ref: line.ref ?? null,
          refRefused: line.refRefused === true,
        }).ref?.unitGrams ?? null;
      // ── LE CONTREFACTUEL, PRIS AVANT DE TOUCHER QUOI QUE CE SOIT ─────────
      // ⛔ UN SEUL RUN, PAS DEUX. « Journaliser le contrefactuel, pas deux
      // runs »: la masse de chaque casserole est relevée AVANT l'arrondi avec
      // la MÊME fonction qu'après. C'est la seule façon de répondre à « ce
      // dépassement, est-ce l'arrondi qui l'a fait ? » sans une seconde
      // génération dont le modèle aurait varié.
      const potReadyBefore = new Map<string, number | null>();
      for (const prep of meal.preparations) {
        potReadyBefore.set(
          prep.id,
          composition
            ? measurePreparation(composition, {
              id: prep.id,
              method: prep.method ?? null,
              ingredients: prep.ingredients,
              waterTreatment: null,
            }).readyG
            : null,
        );
      }
      // ⚠️ AUCUN `as` ICI, ET C'EST VOULU. `DishIngredient` porte déjà `term`,
      // `ref`, `refRefused`, `amount`, `unit` et `gramsRaw`: il EST un
      // `RoundableLine`, le typecheck le prouve à cette ligne. Un `as` sur un
      // type étranger désarmerait exactement ce contrôle.
      const rounded = roundQuantityLines(
        planQuantityLines(meal.dishes, meal.preparations),
        unitGramsOf,
      );
      const regrammed = rounded.counts.rounded > 0
        ? regramMeal(meal, composition)
        : 0;

      // ── LE CONTRÔLE DE SOMME QUE LE PLAN EXIGE ────────────────────────────
      // « Calculer les portions entières en grammes et CONTRÔLER LEUR SOMME
      // FACE AU LOT DISPONIBLE. » Les contenants tirent des casseroles; après
      // l'arrondi, la casserole a changé de masse. On compare, on ne corrige
      // pas — corriger ici rouvrirait la ronde arrondi ↔ multiplication que le
      // plan interdit (« aucun aller-retour caché qui recrée des fractions »).
      let potsOverdrawn = 0;
      let potsUnmeasurable = 0;
      // ⛔ LE DÉPASSEMENT LE PLUS FORT, EN POUR MILLE DE LA CASSEROLE. Un
      // compteur à 2 ne dit pas si les contenants tirent 1 g de trop ou 200.
      // Le plan exige d'« identifier dans les traces la variation due à
      // l'arrondi »: un nombre de cas sans son amplitude ne l'identifie pas.
      let overdrawnWorstPerMille = 0;
      /** Le MÊME contrôle, sur les masses d'AVANT l'arrondi. Le contrefactuel. */
      let potsOverdrawnBefore = 0;
      {
        const drawn = new Map<string, number>();
        for (const dish of meal.dishes) {
          for (const box of dish.boxes) {
            for (const item of box.items) {
              if (!item.preparationId) continue;
              const g = Number(item.grams);
              if (!Number.isFinite(g) || g <= 0) continue;
              drawn.set(item.preparationId, (drawn.get(item.preparationId) ?? 0) + g);
            }
          }
        }
        for (const prep of meal.preparations) {
          const need = drawn.get(prep.id) ?? 0;
          if (!(need > 0)) continue;
          // ⛔ `measurePreparation` ET PAS `preparationReadyGrams`, ET C'EST LA
          // RÈGLE « ON NE MÉLANGE PAS DEUX BASES DE MESURE ». Les grammes des
          // contenants viennent de `potReadyPerDraw` dans `applySizing`, qui
          // les tire de `measurePreparation`. Comparer une somme calculée par
          // une fonction à une masse calculée par une autre mesurerait l'écart
          // entre les deux fonctions, pas celui de l'arrondi. Et mesuré le
          // 2026-09-12 sur un run réel: `preparationReadyGrams` rend `null` dès
          // qu'UN ingrédient n'a pas de `gramsRaw` — donc sur les **3
          // casseroles sur 3** de ce plan, qui portent toutes une pincée de
          // sel. Le contrôle s'abstenait partout, en le disant, ce qui est
          // honnête mais inutile.
          const have = composition
            ? measurePreparation(composition, {
              id: prep.id,
              method: prep.method ?? null,
              ingredients: prep.ingredients,
              // ⚠️ `null`, ET C'EST CE QUE `applySizing` PASSE AUSSI:
              // `MealPreparation` ne porte pas ce champ, donc son `p.waterTreatment
              // ?? null` vaut `null` sur le même objet. La règle d'eau est donc la
              // même des deux côtés — c'est tout ce que ce contrôle demande.
              waterTreatment: null,
            }).readyG
            : null;
          // ⛔ « JE NE SAIS PAS » N'EST PAS « ÇA VA ». Une casserole devenue
          // immesurable se compte à part; la fondre dans `overdrawn: 0` ferait
          // passer une perte de mesure pour une absence de problème.
          if (have === null) {
            potsUnmeasurable++;
            continue;
          }
          const before = potReadyBefore.get(prep.id) ?? null;
          if (before !== null && need > before * (1 + POT_IDENTITY_MARGIN / 100)) {
            potsOverdrawnBefore++;
          }
          if (need > have * (1 + POT_IDENTITY_MARGIN / 100)) {
            potsOverdrawn++;
            if (have > 0) {
              overdrawnWorstPerMille = Math.max(
                overdrawnWorstPerMille,
                Math.round(((need - have) / have) * 1000),
              );
            }
          }
        }
      }

      // ⛔ JOURNALISÉ MÊME À ZÉRO, comme ses voisins. Un arrondi débranché rend
      // exactement le même plan qu'un arrondi qui marche, à ceci près que tous
      // ses compteurs sont nuls — et la seule façon de distinguer les deux est
      // que le zéro soit ÉCRIT.
      console.log(JSON.stringify({
        tag: "keel.household_meal.quantity_rounding",
        user_id: userId,
        request_id: requestId,
        ...rounded.counts,
        regrammed,
        pots_overdrawn: potsOverdrawn,
        pots_overdrawn_worst_per_mille: overdrawnWorstPerMille,
        // ⛔ LE MÊME NOMBRE, SUR LE PLAN D'AVANT L'ARRONDI. Égal au précédent,
        // il dit que le dépassement EXISTAIT DÉJÀ et que l'arrondi n'y est pour
        // rien; plus bas, il dit que l'arrondi l'a creusé. Sans lui, la seule
        // lecture disponible serait « l'arrondi casse les casseroles », et elle
        // serait fausse.
        pots_overdrawn_before: potsOverdrawnBefore,
        pots_unmeasurable: potsUnmeasurable,
        // ⚠️ LES TERMES, PAS LES IDENTIFIANTS DE PERSONNE. Un nom d'aliment est
        // déjà journalisé par `capped` juste au-dessus; un `member_id` ne l'est
        // jamais.
        zeroed: rounded.zeroed.map((z) => z.term),
      }));
      // ── LE DÉFAUT QUI PART À LA RÉPARATION (C4) ──────────────────────────
      // « Si l'arrondi donne zéro à un ingrédient nécessaire: ne pas le
      // supprimer silencieusement… sinon rendre le cas à la réparation. »
      // La ligne reste EN PLACE, avec sa quantité d'origine: on ne fabrique pas
      // un zéro, et on ne fabrique pas un gramme qu'aucun référentiel ne donne.
      if (rounded.zeroed.length > 0) {
        issues.push(`quantity_rounds_to_zero:${rounded.zeroed.length}`);
      }
      // ⚠️ NON NUL, IL DIT QU'UNE CASSEROLE NE SUFFIT PLUS À SES CONTENANTS
      // APRÈS L'ARRONDI. C'est la variation due à l'arrondi, identifiée dans
      // les traces comme le plan le demande — et pas déguisée en mise à
      // l'échelle uniforme.
      if (potsOverdrawn > 0) {
        issues.push(`rounding_pot_overdrawn:${potsOverdrawn}`);
      }
      return {
        ...rounded.counts,
        regrammed,
        pots_overdrawn: potsOverdrawn,
        pots_overdrawn_worst_per_mille: overdrawnWorstPerMille,
        pots_overdrawn_before: potsOverdrawnBefore,
        pots_unmeasurable: potsUnmeasurable,
        // ⟳ 2026-09-12 · ÉTAPE C4 — LES LIGNES ELLES-MÊMES, PAS SEULEMENT LEUR
        // COMPTE. L'étape C2 les a écrites dans `issues[]`, et `issues[]` ne
        // répare rien: la passe commune a besoin du TERME pour dire au modèle
        // quelle ligne réécrire.
        zeroed: rounded.zeroed,
      };
}

/**
 * ⟳ LOT 1 — L'ENTIER LE PLUS PROCHE À L'INTÉRIEUR DES BORNES
 * (`groupeDeLItem` puis `const portionBoundary` de `handle`). Écrit le groupe,
 * la densité et le drapeau féculent sur chaque item, et les grammes rabotés,
 * en place dans `meal`.
 */
export function portionBoundaryOf({
  composition,
  meal,
  plateBoundsKey,
  plateBoundsSeen,
  starchGoalOfMember,
  POT_IDENTITY_MARGIN,
}: {
  composition: CompositionIndex | null;
  meal: GeneratedMeal;
  plateBoundsKey: (memberId: string, day: string | null, slot: string | null) => string;
  plateBoundsSeen: ReadonlyMap<string, PlateBounds>;
  starchGoalOfMember: (memberId: string) => StarchGoal | null;
  POT_IDENTITY_MARGIN: number;
}) {
    // ⟳ 2026-09-14 · BÊTA 1C ⑦ — LE GROUPE DE CHAQUE ITEM, POUR SON PLANCHER.
    //
    // ⛔ `densityFromComposition` EST LE MÊME RÉSOLVEUR QUE `densifyBoxes`
    // consomme, avec les mêmes entrées. Une seconde lecture du groupe d'un
    // aliment ferait deux planchers pour le même couscous, et c'est celui
    // qu'on relit le moins qui déciderait.
    const groupeDeLItem = composition === null
      ? null
      : densityFromComposition(composition, meal.preparations);
    const portionBoundary = fitPortionsToBounds({
      boxes: meal.dishes.flatMap((dish: GeneratedDish) =>
        dish.boxes.map((box) => ({
          boxId: box.id,
          day: dish.day,
          slot: dish.slot,
          memberIds: box.memberIds,
          // ⛔ LA MÊME RÉFÉRENCE DE TABLEAU, PAS UNE COPIE. Ce module écrit les
          // grammes en place ; projeter les items ici rendrait des compteurs
          // parfaits sur un plan inchangé.
          //
          // ⚠️ SAUF LE GROUPE, QUI EST AJOUTÉ SUR PLACE. Il ne vient pas du
          // modèle: il est résolu par le référentiel, et il ne sert qu'à borner
          // le rabotage. `null` sans référentiel — plancher générique, comme
          // avant ce lot.
          //
          // ⟳ 2026-09-23 — ET SA DENSITÉ ET SON DRAPEAU FÉCULENT (lot 5), lus
          // au MÊME endroit, par la même résolution: le rabotage suit
          // l'objectif (féculent d'abord en perte et en maintien, le moins
          // dense d'abord en prise). ⚠️ Le `as unknown as` désarme le contrôle
          // de types sur ces champs requis: `items_missing_shave_facts` le
          // compte, et une issue le dit.
          items: (() => {
            for (const item of box.items) {
              const facts = groupeDeLItem === null ? null : groupeDeLItem({
                term: item.term,
                grams: item.grams,
                preparationId: item.preparationId,
                ref: item.ref,
                refRefused: item.refRefused,
              });
              const group = facts?.group ?? null;
              Object.assign(item as { group?: FoodGroupRef | null }, {
                group,
                kcalPerG: facts?.kcalPerGram ?? null,
                starch: isStarchItemGroup(group),
              });
            }
            return box.items as unknown as BoundedBoxItem[];
          })(),
        }))
      ),
      // ⛔ LES BORNES QUI ONT DÉCIDÉ DU FACTEUR, pas un troisième calcul — la
      // MÊME projection que `finalPortionCheck` juste en dessous. `null` = on
      // ne sait pas ce que cette assiette devrait peser, donc on n'y touche pas.
      //
      // ⟳ 2026-09-13 · LOT 2 § 2.4 — L'ARGUMENT EST LE **REPAS**, et la clé de
      // ses bornes est déjà la sienne: `(memberId, day, slot)`. Un contenant ne
      // porte pas de bornes à lui; c'est l'assiette entière qui en a, complément
      // compris.
      boundsFor: (meal) =>
        plateBoundsSeen.get(
          plateBoundsKey(meal.memberId, meal.day, meal.slot),
        ) ?? null,
      // ⛔ `measurePreparation` ET PAS `preparationReadyGrams`: c'est la mesure
      // qui traite l'eau de cuisson, et c'est celle que `quantityRounding`
      // vient d'employer juste au-dessus. Deux mesures de la même casserole
      // donneraient deux plafonds.
      potReadyGrams: new Map(
        meal.preparations.map((prep: MealPreparation) => [
          prep.id,
          composition
            ? measurePreparation(composition, {
              id: prep.id,
              method: prep.method ?? null,
              ingredients: prep.ingredients,
              waterTreatment: null,
            }).readyG
            : null,
        ]),
      ),
      potMarginPercent: POT_IDENTITY_MARGIN,
      // ⟳ 2026-09-23 — L'OBJECTIF DE CHAQUE BOUCHE, la même lecture que la
      // forme de l'assiette (`starchGoalOfMember`). `null` = la règle d'avant.
      goalOf: starchGoalOfMember,
    });
    return portionBoundary;
}

/**
 * ⟳ LOT E / P0-b — LE CONTRÔLE FINAL (`const finalSizing` de `handle`).
 * Ne touche aucun gramme : il relit ceux qui sont écrits.
 */
export function finalSizingOf({
  composition,
  meal,
  plateBoundsKey,
  plateBoundsSeen,
  potDensityDrifted,
  potDensityGone,
  potDensityUnmeasurable,
}: {
  composition: CompositionIndex | null;
  meal: GeneratedMeal;
  plateBoundsKey: (memberId: string, day: string | null, slot: string | null) => string;
  plateBoundsSeen: ReadonlyMap<string, PlateBounds>;
  potDensityDrifted: number;
  potDensityGone: number;
  potDensityUnmeasurable: number;
}) {
      const check = finalPortionCheck({
        index: composition,
        dishes: meal.dishes.map((dish: GeneratedDish) => ({
          day: dish.day,
          method: dish.method,
          slot: dish.slot,
          ingredients: dish.ingredients,
          uses: dish.uses,
          boxes: dish.boxes,
        })),
        preparations: (meal.preparations ?? []).map((prep: MealPreparation) => ({
          id: prep.id,
          servingsMade: prep.servingsMade,
          ingredients: prep.ingredients,
          method: prep.method,
        })),
        // ⛔ LES BORNES QUI ONT DÉCIDÉ DU FACTEUR, pas un troisième calcul.
        // `null` = on ne sait pas ce que cette assiette devrait peser, donc on
        // ne juge pas et `unmeasurable` le compte.
        //
        // ⟳ 2026-09-13 · LOT 2 § 2.4 — L'ARGUMENT EST LE **REPAS** (les
        // contenants d'une bouche à un moment), et la clé de ses bornes est déjà
        // la sienne. Un bac n'arrive jamais ici: il n'est pas un repas.
        plateFor: (meal) =>
          meal.memberIds.length === 1
            ? plateBoundsSeen.get(
              plateBoundsKey(meal.memberIds[0], meal.day, meal.slot),
            ) ?? null
            : null,
      });
      return {
        // ⛔ `false` NE VEUT PAS DIRE « CONFORME »: il veut dire « pas mesuré
        // ici », et `reason` dit pourquoi.
        measured: check.measured,
        reason: check.reason,
        // ⛔ LE DÉNOMINATEUR VOYAGE AVEC LE NUMÉRATEUR. Une part sans son
        // total se relit comme un taux, et un taux sur trois assiettes n'a
        // pas le sens d'un taux sur quinze.
        boxes: check.boxes,
        // ⟳ 2026-09-13 · LOT 2 § 2.4 — L'UNITÉ JUGÉE, ET LA POPULATION DU LOT.
        // `multi_box_meals > 0` dit qu'une assiette au moins a été partagée
        // entre deux plats; à zéro, le regroupement rend le même plan qu'avant,
        // et sans ce nombre on ne saurait pas laquelle des deux situations.
        meals: check.meals,
        multi_box_meals: check.multiBoxMeals,
        judged: check.judged,
        verdicts: check.verdicts,
        // CE QU'ON A DÉCIDÉ DE L'EAU DE CHAQUE CASSEROLE — c'est la règle qui a
        // produit les 90 g d'écart du §4 de l'enquête.
        water: check.water,
        tubs_not_judged: check.tubsNotJudged,
        // ⛔ LE SEAU D'UN JOUR ET D'UN MOMENT, SANS `member_id`. Assez pour
        // lire (« le samedi midi dépasse de 27 g »), pas assez pour nommer.
        out_of_bounds: check.outOfBounds,
        // ⛔ CE QUE LE REGRAMMAGE A DÉPLACÉ. Non nul, il dit que la densité
        // réelle d'une casserole a bougé entre la mesure et l'écriture.
        pot_density_drifted: potDensityDrifted,
        pot_density_gone: potDensityGone,
        pot_density_unmeasurable: potDensityUnmeasurable,
      };
}
