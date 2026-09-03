import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { hasFreezerDeclared as front } from "./kitchenEquipment";
import {
  hasFreezerDeclared as back,
} from "../../../../supabase/functions/_shared/keel/kitchen_equipment.ts";
import {
  daysOutOfBatchReach,
} from "../../../../supabase/functions/_shared/keel/plan_feasibility.ts";
import { FREEZER_WINDOW_DAYS } from "../../../../supabase/functions/_shared/keel/fridge_window.ts";
import { MAX_FRIDGE_DAYS } from "./groceryWaves";

// ===========================================================================
// « AVOIR UN CONGÉLATEUR » SE DIT DEUX FOIS — ET LES DEUX DOIVENT S'ACCORDER
//
// ⛔ CE MIROIR A ÉTÉ CRÉÉ LE 2026-09-01, EN CONNAISSANCE DE CAUSE. L'entonnoir
// doit annoncer, AVANT la composition, ce que le moteur fera — donc il doit
// répondre à la même question. Le module serveur ne peut pas être la seule
// source ici: `kitchenEquipment.ts` côté écran est déjà un miroir complet
// (`KITCHEN_TOOLS`, `readKitchenEquipment`), et n'en importer QU'UNE fonction
// mélangerait deux origines dans le même fichier.
//
// Le prix d'un miroir est ce test. Deux définitions d'une même règle divergent,
// et c'est toujours celle qu'on regarde le moins qui garde l'ancienne.
// ===========================================================================

describe("le miroir du congélateur", () => {
  it("répond comme le serveur sur les TROIS états", () => {
    // ⚠️ LES TROIS, et le troisième est celui qui compte. `null` veut dire
    // « on n'a pas encore lu », pas « il n'en a pas » — et c'est la confusion
    // que le pavé de `kitchen_equipment.ts` interdit depuis L2-B.
    for (
      const equipment of [
        null,
        [],
        ["freezer"],
        ["oven", "stovetop"],
        ["oven", "freezer", "microwave"],
      ] as const
    ) {
      expect(front(equipment as never), JSON.stringify(equipment))
        .toBe(back(equipment as never));
    }
  });

  it("et il ne s'ouvre JAMAIS sur une ignorance", () => {
    expect(front(null)).toBe(false);
    expect(back(null)).toBe(false);
  });
});

describe("l'entonnoir annonce ce que le moteur fera", () => {
  const SOURCE = readFileSync(
    resolve(__dirname, "../pages/SetupPage.tsx"),
    "utf8",
  );

  it("le congélateur passe par le MIROIR, jamais par un `includes` écrit là", () => {
    // ⛔ CE TEST A CHANGÉ D'OBJET LE 2026-09-01, et il faut savoir pourquoi.
    // Il vérifiait que l'entonnoir APPELLE `daysOutOfBatchReach` plutôt que de
    // recalculer la portée à la main. Cet appel n'existe plus: le champ « les
    // jours où tu cuisines » a été retiré, l'avertissement qui en découlait
    // aussi, et une ligne qui ne peut plus rien annoncer était un lot désarmé.
    //
    // Ce qui RESTE vrai, et que ce fichier existe pour tenir: l'écran répond à
    // « ce foyer a-t-il un congélateur ? » par la MÊME fonction que le moteur.
    // C'est elle qui décide si l'option « tout cuisiner en une fois » est
    // proposée, et une divergence promettrait un geste que le moteur refuse.
    expect(SOURCE).toMatch(/hasFreezerDeclared\(/);
    expect(SOURCE).toMatch(/readKitchenEquipment\(/);
    // ⛔ ET AUCUN CALCUL DE PORTÉE RECOPIÉ N'EST REVENU EN DOUCE.
    expect(SOURCE).not.toMatch(/MAX_FRIDGE_DAYS/);
  });

  it("⛔ IL PRÉVIENT, IL NE RETIENT PAS l'étape", () => {
    // Un plan d'une session sur cinq jours reste composable — ces jours-là se
    // cuisinent le jour même. Faire de la portée un motif de blocage
    // refuserait un plan que le moteur sait produire.
    expect(SOURCE).not.toMatch(/missing\.push\(["'`]out_of_reach/);
    expect(SOURCE).not.toMatch(/out_of_reach.*canGenerate/);
  });

  it("le décor mesuré rend bien quatre jours", () => {
    // La valeur, pas seulement le câblage: dimanche seul sur sept jours.
    expect(
      daysOutOfBatchReach({
        window: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
        cookDays: ["sun"],
        hasFreezer: false,
        maxFridgeDays: MAX_FRIDGE_DAYS,
        freezerWindowDays: FREEZER_WINDOW_DAYS,
      }),
    ).toEqual(["wed", "thu", "fri", "sat"]);
  });

  it("et rien du tout dès que le congélateur est déclaré", () => {
    expect(
      daysOutOfBatchReach({
        window: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
        cookDays: ["sun"],
        hasFreezer: front(["freezer"] as never),
        maxFridgeDays: MAX_FRIDGE_DAYS,
        freezerWindowDays: FREEZER_WINDOW_DAYS,
      }),
    ).toEqual([]);
  });
});
