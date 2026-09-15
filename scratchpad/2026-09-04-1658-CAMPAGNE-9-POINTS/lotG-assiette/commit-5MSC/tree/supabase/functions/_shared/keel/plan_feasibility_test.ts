import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  daysOutOfBatchReach,
  SESSION_OVERRUN_FACTOR,
  sessionCeilingMinutes,
} from "./plan_feasibility.ts";
import { FREEZER_WINDOW_DAYS } from "./fridge_window.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① CE QU'AUCUN LOT N'ATTEINT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ `3` ET `7` SONT DES LITTÉRAUX ICI. `MAX_FRIDGE_DAYS` n'est pas importée:
// un test qui passe la constante qu'il vérifie se re-paramètre tout seul et
// reste vert quand on la change. Cicatrice du dépôt, déjà payée une fois.

const WEEK = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const reach = (
  cookDays: string[],
  hasFreezer = false,
  window: string[] = WEEK,
) =>
  daysOutOfBatchReach({
    window,
    cookDays,
    hasFreezer,
    maxFridgeDays: 3,
    freezerWindowDays: 7,
  });

Deno.test("LE DÉCOR MESURÉ — une session le dimanche, sept jours, pas de congélateur", () => {
  // Le lot du dimanche nourrit dimanche, lundi, mardi. Mercredi à samedi, non.
  // Ce sont EXACTEMENT les huit repas que le parseur jetait le 2026-09-01.
  assertEquals(reach(["sun"]), ["wed", "thu", "fri", "sat"]);
});

Deno.test("le congélateur remet toute la semaine à portée", () => {
  // ⚠️ IL NE PROMET PAS QUE LE MODÈLE CONGÈLERA — il lui en laisse le DROIT.
  // Le nommer hors de portée fermerait d'avance la sortie que le lot du
  // congélateur vient d'ouvrir.
  assertEquals(reach(["sun"], true), []);
  // Et la borne est bien celle du congélateur, pas un nombre écrit ici.
  assertEquals(FREEZER_WINDOW_DAYS, 7);
});

Deno.test("deux sessions bien réparties ne laissent rien hors de portée", () => {
  // dimanche couvre 0,1,2 — mercredi couvre 3,4,5 — samedi couvre 6.
  assertEquals(reach(["sun", "wed", "sat"]), []);
  // Deux seulement: samedi retombe hors de portée (écart de 3 depuis mercredi).
  assertEquals(reach(["sun", "wed"]), ["sat"]);
});

Deno.test("⛔ AUCUN JOUR CONNU ⇒ AUCUNE AFFIRMATION", () => {
  // ⚠️ CE CAS A ÉTÉ ÉCRIT FAUX D'ABORD, et c'est un test d'un AUTRE lot qui
  // l'a attrapé (`meal_precedence_test.ts :: « le silence de la CAPACITÉ est
  // nommé »`). Rendre la fenêtre entière disait « rien n'est à portée » à
  // quelqu'un dont la consigne laisse justement le modèle choisir ses jours de
  // cuisson. Ce n'est pas une absence de cuisine, c'est une date inconnue.
  assertEquals(reach([]), []);
  // Idem quand les jours cochés tombent tous HORS de la fenêtre: la consigne
  // dit alors « pose les sessions sur les jours que tu as ».
  assertEquals(reach(["sun"], false, ["mon", "tue", "wed", "thu", "fri"]), []);
});

Deno.test("un jour AVANT toute cuisson est hors de portée, comme un lot trop vieux", () => {
  // Les deux façons comptent pareil: ce jour-là ne peut pas manger de lot.
  assertEquals(reach(["wed"]), ["sun", "mon", "tue", "sat"]);
});

Deno.test("⛔ `hasFreezer` non booléen JETTE — l'ignorance ne s'hérite pas", () => {
  for (const bad of [undefined, null, "false", 0]) {
    assertThrows(() =>
      daysOutOfBatchReach({
        window: WEEK,
        cookDays: ["sun"],
        hasFreezer: bad as never,
        maxFridgeDays: 3,
        freezerWindowDays: 7,
      })
    );
  }
});

Deno.test("la comparaison est `>=`, la MÊME que la porte qui jette", () => {
  // Un `>` ici laisserait passer un quatrième jour que `cookedWindowVerdict`
  // refuse ensuite — c'est-à-dire le défaut d'origine, déplacé d'un cran.
  // Fenêtre de 4 jours, cuisson au rang 0: le rang 3 est dehors.
  assertEquals(
    daysOutOfBatchReach({
      window: ["sun", "mon", "tue", "wed"],
      cookDays: ["sun"],
      hasFreezer: false,
      maxFridgeDays: 3,
      freezerWindowDays: 7,
    }),
    ["wed"],
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LE PLAFOND DE DÉBORDEMENT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("la session ne déborde QUE là où l'autre sortie n'existe pas", () => {
  const at = (outOfReachDays: number, cookDayCount: number) =>
    sessionCeilingMinutes({
      cookingTimeMin: 30,
      outOfReachDays,
      cookDayCount,
      singleSessionAsked: false,
    });

  // Un seul jour de cuisine ET des journées hors de portée: la permission sort.
  assertEquals(at(4, 1), 60);
  // ⛔ ET NULLE PART AILLEURS. Une deuxième journée de cuisine existe ⇒ la
  // sortie ordinaire (« mets le reste sur un autre jour ») est toujours la
  // bonne, et une permission générale serait une invitation à dépasser.
  assertEquals(at(4, 2), null);
  // Rien hors de portée ⇒ aucune tension à arbitrer.
  assertEquals(at(0, 1), null);
});

Deno.test("le plafond est un PLAFOND, pas une cible — et il est nommé", () => {
  assertEquals(SESSION_OVERRUN_FACTOR, 2);
  assertEquals(
    sessionCeilingMinutes({
      cookingTimeMin: 45,
      outOfReachDays: 2,
      cookDayCount: 1,
      singleSessionAsked: false,
    }),
    90,
  );
});

Deno.test("aucune durée déclarée ⇒ aucun plafond fabriqué", () => {
  // On ne pose pas un plafond que personne n'a demandé.
  for (const bad of [null, 0, -10, Number.NaN]) {
    assertEquals(
      sessionCeilingMinutes({
        cookingTimeMin: bad as never,
        outOfReachDays: 4,
        cookDayCount: 1,
        singleSessionAsked: false,
      }),
      null,
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE MODULE EST PUR
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("même entrée, même sortie, entrée intacte", () => {
  const window = [...WEEK];
  const cookDays = ["sun"];
  const a = reach(cookDays);
  const b = reach(cookDays);
  assertEquals(a, b);
  assertEquals(window, WEEK);
  assertEquals(cookDays, ["sun"]);
  assert(a !== b, "deux appels doivent rendre deux tableaux distincts");
});
