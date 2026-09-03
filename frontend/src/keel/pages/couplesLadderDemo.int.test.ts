// KEEL — LA DÉMONSTRATION DE `/couples` DIT-ELLE CE QUE LE MOTEUR DÉCIDE ?
//
// ── CE QUE CE FICHIER EMPÊCHE ──────────────────────────────────────────────
// La démonstration annonce à un couple s'il aura UN plat ou DEUX. C'est la
// promesse centrale de la page, et elle est calculée. Une page de vente qui
// calcule se met à diverger du produit le jour où le produit bouge, sans que
// personne ne le voie: elle continue de rendre une réponse plausible.
//
// Même contrat que `mealPrepEnergyDemo.int.test.ts`: la page APPELLE
// `mergeLadder`, `strictestRegimeAt` et `dietServingConflicts` — trois modules
// purs de `_shared` — et ne réimplémente ni l'échelle, ni la règle du régime.
// Les tests ci-dessous tiennent la jointure, et la propriété que la copie
// AFFIRME au lecteur.

import { describe, expect, it } from "vitest";

import { mergeLadder } from "../../../../supabase/functions/_shared/keel/household_merge.ts";
import {
  DIETARY_REGIMES,
  type DietaryRegime,
} from "../../../../supabase/functions/_shared/keel/dietary_regime.ts";
import { demoDietSplits, demoLadder, EN_DIRECTION, GOAL_IDS, readServingDemands } from "./CouplesPage";

/** Les quatre choix offerts au lecteur: l'omnivore est l'ABSENCE de régime. */
const REGIME_CHOICES: ReadonlyArray<DietaryRegime | null> = [null, ...DIETARY_REGIMES];

describe("ce que `/couples` annonce comme forme de cuisson", () => {
  it("est exactement ce que rend `mergeLadder`, pour chaque couple d'objectifs", () => {
    // La ceinture de la ceinture: si `GOAL_IDS` était vide, la boucle ne
    // s'exécuterait pas et le test verdirait sur zéro comparaison.
    expect(GOAL_IDS.length).toBeGreaterThan(0);

    for (const left of GOAL_IDS) {
      for (const right of GOAL_IDS) {
        const engine = mergeLadder({
          table: [readServingDemands(EN_DIRECTION[left])],
          incoming: readServingDemands(EN_DIRECTION[right]),
          householdCookingDays: ["sun"],
          personalCookingDays: ["sun"],
        });
        expect(
          demoLadder(left, right).shape,
          `${left} / ${right}: la page et le moteur divergent`,
        ).toBe(engine.shape);
      }
    }
  });

  it("ne produit JAMAIS `separate_sessions`", () => {
    // ⚠️ C'EST UNE PROPRIÉTÉ DE LA DÉMONSTRATION, PAS DU MOTEUR. Le troisième
    // barreau demande qu'AUCUN jour de cuisine ne soit partagé — une question
    // que la page ne pose pas. Elle passe donc le même jour des deux côtés, et
    // `couples.demo.outcome_rule` DIT que ce barreau existe plutôt que de le
    // faire apparaître par hasard. Si quelqu'un retire ce jour un jour, la
    // démonstration se mettrait à annoncer deux cuissons à des gens qui n'ont
    // rien demandé de tel — et ce test l'attrape.
    for (const left of GOAL_IDS) {
      for (const right of GOAL_IDS) {
        expect(demoLadder(left, right).shape).not.toBe("separate_sessions");
      }
    }
  });

  it("annonce deux plats dès qu'un régime retire à quelqu'un ce que son objectif demande", () => {
    // La propriété R4 + R5, vérifiée plutôt que promise. On ne fige pas QUELS
    // couples séparent — ça appartient au moteur, et le figer ici rendrait ce
    // test faux le jour où `REGIME_PROTEIN_CEILING` bouge. On vérifie la
    // FORME de la règle: séparer exige un régime, et deux omnivores ne
    // séparent jamais pour cause de régime.
    for (const left of GOAL_IDS) {
      for (const right of GOAL_IDS) {
        expect(
          demoDietSplits(left, right, null, null),
          `${left} / ${right}: deux omnivores ne se séparent pas pour un régime`,
        ).toBe(false);
      }
    }
  });

  it("traite le régime le plus strict, quel que soit celui des deux qui le porte", () => {
    // ⚠️ LA SYMÉTRIE EST LE POINT. `strictestRegimeAt` ne regarde pas QUI
    // déclare: un végane à gauche et un végane à droite donnent la même
    // casserole. Un test qui n'éprouverait qu'un côté laisserait passer une
    // page qui ne lit qu'une des deux colonnes — le genre de défaut qu'on ne
    // voit pas parce qu'on démontre toujours dans le même sens.
    for (const regime of REGIME_CHOICES) {
      for (const left of GOAL_IDS) {
        for (const right of GOAL_IDS) {
          expect(
            demoDietSplits(left, right, regime, null),
            `${regime} à gauche vs à droite: ${left} / ${right}`,
          ).toBe(demoDietSplits(right, left, null, regime));
        }
      }
    }
  });

  it("couvre les quatre choix offerts, et pas seulement les trois jetons", () => {
    // Si `DIETARY_REGIMES` gagnait un quatrième régime, la page l'afficherait
    // (elle dérive sa liste du moteur) et ce test le balaierait avec. La
    // ceinture est ici pour que le balayage ci-dessus ne devienne pas partiel
    // en silence.
    expect(REGIME_CHOICES).toHaveLength(DIETARY_REGIMES.length + 1);
    expect(REGIME_CHOICES[0]).toBeNull();
  });
});
