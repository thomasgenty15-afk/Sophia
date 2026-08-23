import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { SAME_DAY_KINDS } from "./mealGeneration";

// ===========================================================================
// LOT 2 — LE COMMENTAIRE DE PRÉPARATION DU JOUR J, CÔTÉ ÉCRAN
//
// Ce fichier tient les trois choses qu'aucun test de comportement ne peut
// tenir, parce qu'elles vivent DANS DEUX FICHIERS À LA FOIS:
//
//   ① LA LISTE FERMÉE EST RECOPIÉE. Le front ne partage aucun module avec
//      `supabase/functions/_shared/keel/`. Un jeton ajouté côté moteur et pas
//      ici arriverait sous forme de bandeau MUET — le lecteur le refuserait, et
//      rien ne le dirait.
//   ② LE BANDEAU SE LIT AVANT LE RESTE. « Qu'est-ce que je fais maintenant »
//      passe avant « pourquoi ce plat » et avant les ingrédients. Une position
//      ne se prouve que sur la source.
//   ③ LE LIBELLÉ EXISTE DANS LES DEUX LANGUES. Composé par clé
//      (`meals.same_day.<jeton>`), il LÈVE en DEV si la clé manque: un jeton
//      valide sans son libellé fait disparaître le plan entier.
// ===========================================================================

const ROOT = resolve(__dirname, "../../../..");

function code(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      if (at < 0) return line;
      if (at > 0 && line[at - 1] === ":") return line;
      return line.slice(0, at);
    })
    .join("\n");
}

describe("le geste du jour J", () => {
  it("① la liste fermée du front est celle du MOTEUR, jeton pour jeton", () => {
    // La source du moteur, lue telle quelle: c'est le seul endroit où les deux
    // copies se rencontrent. Sans ce test, elles divergeraient au premier jeton
    // ajouté, et la divergence serait MUETTE.
    const engine = code("supabase/functions/_shared/keel/meal_generation.ts");
    const block = engine.slice(
      engine.indexOf("export const SAME_DAY_KINDS = ["),
      engine.indexOf("] as const;", engine.indexOf("export const SAME_DAY_KINDS = [")),
    );
    const fromEngine = [...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(fromEngine.length, "la liste du moteur n'a pas été retrouvée")
      .toBeGreaterThan(0);
    expect([...SAME_DAY_KINDS]).toEqual(fromEngine);
  });

  /**
   * ⚠️ CE TEST COMPARAIT AUSSI LA POSITION DU « POURQUOI », ET CE REPÈRE A
   * DISPARU LE 2026-08-19: `dish.why` n'est plus affiché du tout — décision
   * explicite, « garde-le mais ne l'affiche pas », le champ reste demandé au
   * modèle parce qu'il l'aide à composer. Le reste de l'ordre tient: le geste
   * du jour J se lit avant les ingrédients.
   */
  it("② le bandeau se lit AVANT les ingrédients", () => {
    const card = code("frontend/src/keel/components/DishCard.tsx");
    const banner = card.indexOf("{dish.same_day && <SameDayLine");
    const ingredients = card.indexOf("{dish.ingredients.length > 0 &&");
    expect(banner, "le bandeau du jour J n'est plus rendu").toBeGreaterThan(0);
    expect(banner, "le bandeau est passé sous les ingrédients")
      .toBeLessThan(ingredients);
  });

  /**
   * ⛔ ET LE « POURQUOI » NE REVIENT PAS À L'ÉCRAN PAR DISTRACTION.
   *
   * Une phrase par plat, toujours de la même matière (« un dîner déjà
   * portionné rend le soir de cuisine immédiatement praticable »). Retirée le
   * 2026-08-19. Le champ reste dans le schéma du modèle: c'est le RENDU qui a
   * été supprimé, et ce test est la seule chose qui empêche de le reposer.
   */
  it("⛔ `why` n'est rendu par AUCUNE carte", () => {
    const card = code("frontend/src/keel/components/DishCard.tsx");
    expect(card).not.toContain("dish.why");
  });

  it("② et il atteint la vue JOUR, qui monte la même carte", () => {
    // Le bloc jour du LOT 1 rend `DishCard`: le bandeau y arrive sans une ligne
    // de plus. Ce test dit que c'est bien par là qu'il passe — si le bloc
    // cessait de monter la carte, la vue jour perdrait le bandeau en silence.
    const block = code("frontend/src/keel/components/plan/PlanDayBlock.tsx");
    expect(block, "le bloc jour ne monte plus la carte du plat").toContain(
      "<DishCard",
    );
  });

  it("③ les quatre jetons ont leur libellé dans les DEUX packs", () => {
    for (const kind of SAME_DAY_KINDS) {
      const key = `meals.same_day.${kind}` as keyof typeof en;
      expect(en[key], `${key} manque au pack anglais`).toBeTruthy();
      expect(fr[key as keyof typeof fr], `${key} manque au pack français`)
        .toBeTruthy();
    }
    expect(en["meals.same_day.minutes"]).toContain("{n}");
    expect(fr["meals.same_day.minutes"]).toContain("{n}");
  });

  it("③ aucun libellé ne porte de raison, d'objectif ni de chiffre corporel", () => {
    // F7/F8 — une consigne de service est une INSTRUCTION, jamais un
    // diagnostic. La frontière vaut ici comme sur les parts: « À réchauffer »
    // dit ce qu'on fait; « À réchauffer, tu vises une perte » serait un verdict.
    // Vérifié dans LES DEUX LANGUES, la garde testée dans une seule ne couvre
    // pas l'autre.
    const forbidden = [
      "kcal",
      "calorie",
      "protein",
      "protéine",
      "goal",
      "objectif",
      "weight",
      "poids",
      "perte",
      "because",
      "parce que",
    ];
    for (const kind of [...SAME_DAY_KINDS, "minutes"]) {
      const key = `meals.same_day.${kind}`;
      for (const pack of [en, fr] as Array<Record<string, string>>) {
        const value = pack[key] ?? "";
        for (const word of forbidden) {
          expect(value.toLowerCase(), `« ${word} » est entré dans ${key}`)
            .not.toContain(word);
        }
      }
    }
    // ⚠️ LE CAS QUI PASSE: la liste ci-dessus ne mord pas sur les vrais
    // libellés, sinon elle bloquerait tout en ayant l'air de marcher.
    expect(en["meals.same_day.reheat_only"]).toBe("Just reheat");
    expect(fr["meals.same_day.reheat_only"]).toBe("À réchauffer");
  });
});
