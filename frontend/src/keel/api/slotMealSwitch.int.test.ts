import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SLOT_MEAL_GOALS,
  slotMealAskSwitchFrom,
  slotMealSwitchOfferable,
} from "./slotMeal";

const ROOT = resolve(__dirname, "../../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const DENO = "supabase/functions/_shared/keel/slot_meal_ask.ts";

describe("l'interrupteur de la question par repas", () => {
  it("`null` laisse décider l'objectif — JAMAIS éteint", () => {
    // ⛔ C'EST LA MOITIÉ QUI SE CASSE EN SILENCE. Afficher la colonne plutôt
    // que la réduction montrerait « éteint » à tous ceux qui n'ont jamais
    // choisi — c'est-à-dire tout le monde — et la personne rallumerait une
    // chose qui n'avait jamais été coupée.
    expect(slotMealAskSwitchFrom({ stored: null, goal: "fat_loss" }))
      .toEqual({ on: true, source: "goal" });
    expect(slotMealAskSwitchFrom({ stored: null, goal: "muscle_gain" }))
      .toEqual({ on: true, source: "goal" });
    expect(slotMealAskSwitchFrom({ stored: null, goal: "maintenance" }))
      .toEqual({ on: false, source: "goal" });
    expect(slotMealAskSwitchFrom({ stored: null, goal: null }))
      .toEqual({ on: false, source: "no_goal" });
  });

  it("une extinction explicite gagne sur l'objectif", () => {
    for (const goal of [...SLOT_MEAL_GOALS, "maintenance", null]) {
      expect(slotMealAskSwitchFrom({ stored: false, goal }))
        .toEqual({ on: false, source: "explicit_off" });
    }
    expect(slotMealAskSwitchFrom({ stored: true, goal: "maintenance" }))
      .toEqual({ on: true, source: "explicit_on" });
  });

  it("il reste OFFERT à quelqu'un qui a éteint", () => {
    // Sinon il disparaîtrait au moment exact où il sert à rallumer.
    expect(slotMealSwitchOfferable("fat_loss")).toBe(true);
    expect(slotMealSwitchOfferable("muscle_gain")).toBe(true);
    expect(slotMealSwitchOfferable("maintenance")).toBe(false);
    expect(slotMealSwitchOfferable(null)).toBe(false);
  });

  it("porte les MÊMES objectifs que le module Deno", () => {
    // ⚠️ LA DUPLICATION EST GARDÉE PAR CE TEST, ET PAR LUI SEUL. Deux copies
    // qui divergent feraient un écran qui offre un réglage que le serveur
    // n'applique pas — ou l'inverse, plus silencieux encore.
    const deno = read(DENO);
    const block = /SLOT_MEAL_GOALS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(deno);
    expect(block, "SLOT_MEAL_GOALS introuvable côté Deno").not.toBeNull();
    const denoGoals = [...(block?.[1] ?? "").matchAll(/"([a-z_]+)"/g)]
      .map((m) => m[1])
      .sort();
    expect(denoGoals).toEqual([...SLOT_MEAL_GOALS].sort());
  });

  it("porte la MÊME règle de réduction que le module Deno", () => {
    // On ne compare pas du texte: on compare les QUATRE branches, nommées de
    // la même façon des deux côtés. Une branche renommée d'un seul côté rougit.
    const deno = read(DENO);
    for (const source of ["explicit_on", "explicit_off", "goal", "no_goal"]) {
      expect(deno, source).toContain(`source: "${source}"`);
    }
    // ⛔ ET L'ORDRE DES DEUX PREMIÈRES BRANCHES. `stored === true` puis
    // `stored === false` AVANT l'objectif: c'est ce qui fait que le choix
    // explicite gagne. Inversé, l'objectif rallumerait ce qu'on a coupé.
    const on = deno.indexOf('source: "explicit_on"');
    const off = deno.indexOf('source: "explicit_off"');
    const byGoal = deno.indexOf('source: "goal"');
    expect(on).toBeGreaterThan(-1);
    expect(off).toBeGreaterThan(on);
    expect(byGoal).toBeGreaterThan(off);
  });
});
